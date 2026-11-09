/**
 * scripts/__tests__/compareServers.test.mjs: how builds are served: the site's own handler, free
 * ports, the reserved ports and the ones Chrome refuses left alone, and nothing listening afterwards.
 * It needs no browser: a small handler in a throwaway folder stands in for the site's serve-handler.
 * That the browser does refuse each listed port is a browser test in compare.test.mjs.
 *
 * HOW TO CHANGE IT
 *   A new way to serve gets a test here. `siteWithHandler` writes the stand-in.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { isRefusedPort, loadServeHandler, portsInRange, serveBuild } from '../lib/compareServers.mjs';
import { CHROME_REFUSED_PORTS, RESERVED_PORTS, SERVE_HOST } from '../lib/compareSettings.mjs';
import { EXIT } from '../lib/exitCodes.mjs';

const HANDLER_SOURCE = `module.exports = (request, response, options) => {
  response.setHeader('x-options', JSON.stringify(options));
  response.end('served ' + request.url);
};
`;

/** A folder with a package.json and a stand-in serve-handler. */
function siteWithHandler(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'compare-serve-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, 'package.json'), '{ "name": "fixture" }\n');
  const moduleFolder = path.join(root, 'node_modules', 'serve-handler');
  fs.mkdirSync(moduleFolder, { recursive: true });
  fs.writeFileSync(path.join(moduleFolder, 'index.js'), HANDLER_SOURCE);
  return root;
}

/** The response's body and options. */
function fetchFrom(origin, url) {
  return new Promise((resolve, reject) => {
    http.get(`${origin}${url}`, (response) => {
      let body = '';
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => resolve({ body, options: JSON.parse(response.headers['x-options']) }));
    }).on('error', reject);
  });
}

/** True when something accepts a connection on the origin's port. */
function isListening(origin) {
  const { hostname, port } = new URL(origin);
  return new Promise((resolve) => {
    const socket = net.connect(Number(port), hostname);
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('error', () => resolve(false));
  });
}

/** Holds a port for the length of a test. */
async function holdPort(t) {
  const blocker = net.createServer();
  await new Promise((resolve) => { blocker.listen(0, SERVE_HOST, resolve); });
  t.after(() => blocker.close());
  return blocker.address().port;
}

test('the handler comes from the site, and a build is served with its folder', async (t) => {
  const root = siteWithHandler(t);
  const handler = loadServeHandler(root);
  const served = await serveBuild({ handler, folder: '/some/build' });
  t.after(() => served.stop());
  const { body, options } = await fetchFrom(served.origin, '/docs/');
  assert.equal(body, 'served /docs/');
  assert.equal(options.public, '/some/build');
  assert.equal(options.directoryListing, false);
  assert.equal(options.trailingSlash, undefined, 'its redirect would drop the theme in the query string');
});

test('a site without the handler is refused', () => {
  const missing = fs.mkdtempSync(path.join(os.tmpdir(), 'compare-serve-'));
  assert.throws(() => loadServeHandler(missing), (error) => error.code === EXIT.REFUSED && /npm ci/.test(error.message));
  fs.rmSync(missing, { recursive: true, force: true });
});

test('with no range the system picks a free port on this machine alone', async (t) => {
  const served = await serveBuild({ handler: (request, response) => response.end('x'), folder: 'x' });
  t.after(() => served.stop());
  assert.ok(served.origin.startsWith(`http://${SERVE_HOST}:`));
  const port = Number(new URL(served.origin).port);
  assert.ok(!RESERVED_PORTS.includes(port));
  assert.ok(port > Math.max(...CHROME_REFUSED_PORTS), `the system picked ${port}, among the ports Chrome refuses`);
});

test('a range walks past a port in use', async (t) => {
  const taken = await holdPort(t);
  const served = await serveBuild({ handler: (request, response) => response.end('x'), folder: 'x', ports: [taken, taken + 1] });
  t.after(() => served.stop());
  assert.equal(Number(new URL(served.origin).port), taken + 1);
});

test('a range with no free port is refused', async (t) => {
  const taken = await holdPort(t);
  const attempt = serveBuild({ handler: () => {}, folder: 'x', ports: [taken] });
  await assert.rejects(attempt, (error) => error.code === EXIT.REFUSED);
});

test('a range leaves out the reserved ports, and a bad one is a usage error', () => {
  assert.deepEqual(portsInRange('4100-4102'), [4100, 4101, 4102]);
  assert.deepEqual(portsInRange('3220-3223'), [3220, 3223]);
  for (const text of ['4100', 'a-b', '4109-4100', '0-5', '65530-65536']) {
    assert.throws(() => portsInRange(text), (error) => error.code === EXIT.USAGE, text);
  }
});

test('a range walks past every port Chrome refuses, wherever it starts or ends', () => {
  assert.deepEqual(portsInRange('6000-6003'), [6001, 6002, 6003], 'a range that starts on one serves on the next');
  assert.deepEqual(portsInRange('5998-6000'), [5998, 5999], 'and one that ends on one stops before it');
  assert.deepEqual(portsInRange('6664-6670'), [6664, 6670]);
  assert.deepEqual(portsInRange('10079-10081'), [10079, 10081]);
  for (const port of CHROME_REFUSED_PORTS) assert.equal(isRefusedPort(port), true, String(port));
  for (const port of [4100, 4190, 6001, 6679]) assert.equal(isRefusedPort(port), false, String(port));
});

test('a range made only of ports left out is a usage error that says why', () => {
  const why = (text) => {
    try {
      portsInRange(text);
    } catch (error) {
      assert.equal(error.code, EXIT.USAGE, text);
      return error.message;
    }
    return assert.fail(`${text} gave ports`);
  };
  assert.equal(why('6000-6000'), '--ports 6000-6000 leaves no port to serve on: Chrome refuses 6000 (net::ERR_UNSAFE_PORT). Name a range with another port in it.');
  assert.match(why('6665-6669'), /Chrome refuses 6665, 6666, 6667, 6668 and 6669 \(net::ERR_UNSAFE_PORT\)/);
  assert.match(why('3221-3222'), /: 3221 and 3222 are kept for the dev servers\./);
  assert.match(why('2049-2049'), /Chrome refuses 2049 /);
});

test('a range that leaves fewer ports than the run serves at once is a usage error that says a compare needs two', () => {
  assert.deepEqual(portsInRange('6140-6140'), [6140], 'one server needs one port');
  assert.deepEqual(portsInRange('6140-6141', 2), [6140, 6141]);
  for (const text of ['6140-6140', '5999-6000', '3221-3223']) {
    assert.throws(() => portsInRange(text, 2), (error) => error.code === EXIT.USAGE
      && /leaves 1 port, \d+, and a compare serves its two builds at once, one port each\. Name a range with 2 ports or more in it\.$/.test(error.message), text);
  }
});

test('the list of ports Chrome refuses is sorted, holds each port once, and leaves the dev servers\' alone', () => {
  const sorted = [...CHROME_REFUSED_PORTS].sort((a, b) => a - b);
  assert.deepEqual(CHROME_REFUSED_PORTS, sorted);
  assert.equal(new Set(CHROME_REFUSED_PORTS).size, CHROME_REFUSED_PORTS.length);
  assert.ok(CHROME_REFUSED_PORTS.every((port) => Number.isInteger(port) && port > 0 && port <= 65_535));
  assert.deepEqual(RESERVED_PORTS.filter(isRefusedPort), []);
});

test('nothing listens after stop, with a connection still open', async () => {
  const served = await serveBuild({ handler: (request, response) => response.end('x'), folder: 'x' });
  const { hostname, port } = new URL(served.origin);
  const idle = net.connect(Number(port), hostname);
  await new Promise((resolve) => { idle.once('connect', resolve); });
  await served.stop();
  idle.destroy();
  assert.equal(await isListening(served.origin), false);
});
