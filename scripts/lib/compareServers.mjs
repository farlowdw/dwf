/**
 * scripts/lib/compareServers.mjs: serves a build folder on a free local port, with the site's own
 * serve-handler, the handler `docusaurus serve` uses. The server lives inside this process, so it
 * cannot outlive a run, even a killed one.
 *
 * Nothing but this file loads serve-handler, and it loads it from the site: shared/ installs nothing.
 *
 * A --ports range walks past the dev servers' ports and every port Chrome refuses: the compare serves on the first
 * free port left, and a page there that the browser will not load would read red. A range with no port left is a
 * usage error that says why, and so is one with fewer ports left than the run serves at once: a compare of two
 * builds serves both sides together, one port each.
 *
 * HOW TO CHANGE IT
 *   HANDLER_OPTIONS are how a build is served. Ports: compareSettings.mjs > RESERVED_PORTS and CHROME_REFUSED_PORTS.
 *   A site served below a path other than / would need the rewrite `docusaurus serve` does.
 */

import http from 'node:http';
import { createRequire } from 'node:module';
import path from 'node:path';
import { EXIT, ScriptError } from './exitCodes.mjs';
import { CHROME_REFUSED_PORTS, REFUSED_PORT_ERROR, RESERVED_PORTS, SERVE_HOST } from './compareSettings.mjs';
import { counted, listed } from './phrases.mjs';

const SERVE_PACKAGE = 'serve-handler';

/**
 * As `docusaurus serve` does for a site with no trailingSlash setting. A missing page must answer 404,
 * never a listing that reads as a loaded page. No trailingSlash here: its redirect drops the query
 * string, and with it the theme, so /docs/intro would load in the wrong one.
 */
const HANDLER_OPTIONS = Object.freeze({ cleanUrls: true, directoryListing: false });

const PORT_RANGE = /^(\d+)-(\d+)$/;

/** The highest port there is. */
const MAX_PORT = 65_535;

/** CHROME_REFUSED_PORTS, to look a port up in. */
const REFUSED = new Set(CHROME_REFUSED_PORTS);

/** The system's own pick: a free port, far above every dev server's and every port Chrome refuses. */
const ANY_FREE_PORT = 0;

/** The site's serve-handler. Docusaurus brings it, so a missing one means a site not installed. */
export function loadServeHandler(root) {
  try {
    return createRequire(path.join(root, 'package.json'))(SERVE_PACKAGE);
  } catch {
    throw new ScriptError(`${root} has no ${SERVE_PACKAGE}. Nothing was compared. Run npm ci there first.`, EXIT.REFUSED);
  }
}

/** True for a port Chrome never loads a page from. */
export function isRefusedPort(port) {
  return REFUSED.has(port);
}

/** Why a range holds no port to serve on: the ports Chrome refuses, then the dev servers'. */
function noPortLeft(text, refused, reserved) {
  const names = (ports) => listed(ports.map(String));
  const reasons = [
    ...(refused.length > 0 ? [`Chrome refuses ${names(refused)} (${REFUSED_PORT_ERROR})`] : []),
    ...(reserved.length > 0 ? [`${names(reserved)} ${reserved.length === 1 ? 'is' : 'are'} kept for the dev servers`] : []),
  ];
  const sentence = `--ports ${text} leaves no port to serve on: ${reasons.join(', and ')}. Name a range with another port in it.`;
  return new ScriptError(sentence, EXIT.USAGE);
}

/** A range that leaves fewer ports than the run serves at once. `serves` is two or more here. */
function tooFewPorts(text, ports, serves) {
  const left = `${counted(ports.length, 'port')}, ${listed(ports.map(String))}`;
  const sentence = `--ports ${text} leaves ${left}, and a compare serves its two builds at once, one port each.`;
  return new ScriptError(`${sentence} Name a range with ${serves} ports or more in it.`, EXIT.USAGE);
}

/**
 * "4100-4109" as a list of ports, leaving out the reserved ones and the ones Chrome refuses. A usage error for
 * anything else, for a range that leaves no port, and for one that leaves fewer than `serves`, the servers a run
 * starts at once.
 */
export function portsInRange(text, serves = 1) {
  const match = text.match(PORT_RANGE);
  const [from, to] = match ? [Number(match[1]), Number(match[2])] : [0, -1];
  if (from <= 0 || to < from || to > MAX_PORT) throw new ScriptError(`--ports wants <from>-<to>, and reads ${text}.`, EXIT.USAGE);
  const ports = [];
  const refused = [];
  const reserved = [];
  for (let port = from; port <= to; port += 1) {
    if (REFUSED.has(port)) refused.push(port);
    else if (RESERVED_PORTS.includes(port)) reserved.push(port);
    else ports.push(port);
  }
  if (ports.length === 0) throw noPortLeft(text, refused, reserved);
  if (ports.length < serves) throw tooFewPorts(text, ports, serves);
  return ports;
}

/** Listens on one port. Resolves true, or false when it is taken. */
function listenOn(server, port) {
  return new Promise((resolve, reject) => {
    const onError = (error) => {
      server.off('listening', onListening);
      if (error.code === 'EADDRINUSE') resolve(false);
      else reject(error);
    };
    const onListening = () => {
      server.off('error', onError);
      resolve(true);
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, SERVE_HOST);
  });
}

/** Listens on the first free port of `ports`, or on any free port when there is no list. */
async function listenOnFirstFree(server, ports) {
  for (const port of ports ?? [ANY_FREE_PORT]) {
    if (await listenOn(server, port)) return server.address().port;
  }
  throw new ScriptError(`No free port in ${ports[0]}-${ports.at(-1)}. Nothing was compared.`, EXIT.REFUSED);
}

/** Closes a server and every connection still open on it. */
function stopServer(server) {
  return new Promise((resolve) => {
    server.close(() => resolve());
    server.closeAllConnections();
  });
}

/** Serves `folder` with `handler`. Returns { origin, stop }. */
export async function serveBuild({ handler, folder, ports }) {
  const options = { ...HANDLER_OPTIONS, public: folder };
  const server = http.createServer((request, response) => handler(request, response, options));
  const port = await listenOnFirstFree(server, ports);
  return { origin: `http://${SERVE_HOST}:${port}`, stop: () => stopServer(server) };
}
