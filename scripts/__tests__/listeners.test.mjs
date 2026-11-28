/**
 * scripts/__tests__/listeners.test.mjs: the listening-process preflight. Real servers on ports the
 * system picks, started in fixture folders by the fixture's startServer, which stops them. An app's own
 * process is a real server too, run by a copy of node inside a made-up app bundle; the rows that need
 * what no test can start come from a stand-in for lsof. The check itself only reads, and a test here
 * proves the server is still alive after a refusal. To change the rule, change isInside or APP_PROGRAM
 * in lib/listeners.mjs and add a row.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { EXIT, ScriptError } from '../lib/exitCodes.mjs';
import { describeListeners, listenersInCheckout, parseFields, programsOf, refuseWhenListening } from '../lib/listeners.mjs';
import { fixtureFor, startServer } from './fixture.mjs';

/** An app's own program and a server's, as lsof names them. */
const APP = '/Applications/Helper.app/Contents/MacOS/helper';
const NODE = '/usr/local/bin/node';

/** lsof as a stand-in: rows of [pid, command name, working folder, program]. */
function lsofFor(rows) {
  return (command, args) => {
    const asked = ['cwd', 'txt'].find((kind) => args.includes(kind));
    const lines = rows.map(([pid, name, folder, program]) => {
      if (asked === 'cwd') return `p${pid}\nc${name}\nfcwd\nn${folder}\n`;
      if (asked === 'txt') return `p${pid}\nftxt\nn${program}\nftxt\nn/usr/lib/dyld\n`;
      return `p${pid}\nc${name}\n`;
    });
    return { status: 0, stdout: lines.join('') };
  };
}

/** A copy of this node as the program of a made-up app bundle below the fixture's base. */
function appProgram(fixture) {
  const folder = path.join(fixture.base, 'Helper.app', 'Contents', 'MacOS');
  fs.mkdirSync(folder, { recursive: true });
  const program = path.join(folder, 'helper');
  fs.copyFileSync(process.execPath, program, fs.constants.COPYFILE_FICLONE);
  fs.chmodSync(program, 0o755);
  return program;
}

test('parseFields reads lsof field output', () => {
  const text = 'p101\ncnode\nfcwd\nn/tmp/one\np202\ncnginx\nfcwd\nn/tmp/two\n';
  assert.deepEqual(parseFields(text), [
    { pid: 101, command: 'node', name: '/tmp/one' },
    { pid: 202, command: 'nginx', name: '/tmp/two' },
  ]);
});

test("programsOf keeps each process's first txt file, its program", () => {
  const text = `p101\nftxt\nn${NODE}\nftxt\nn/usr/lib/dyld\np202\nftxt\nn${APP}\n`;
  assert.deepEqual([...programsOf(text)], [[101, NODE], [202, APP]]);
});

test('a server started in the checkout is found, and one in a subfolder too', async (t) => {
  const fixture = fixtureFor(t);
  const site = fixture.addSite('one');
  const atRoot = await startServer(t, site);
  const inside = await startServer(t, path.join(site, 'docs'));
  const { checked, processes } = listenersInCheckout(site);
  assert.equal(checked, true);
  assert.deepEqual(processes.map((row) => row.pid).sort(), [atRoot.pid, inside.pid].sort());
  assert.match(describeListeners(processes), new RegExp(`pid ${atRoot.pid} `));
});

test('a server in a sibling folder with a longer name does not count', async (t) => {
  const fixture = fixtureFor(t);
  const site = fixture.addSite('one');
  const sibling = fixture.addSite('one-more');
  await startServer(t, sibling);
  assert.deepEqual(listenersInCheckout(site), { checked: true, processes: [], apps: [] });
});

test('the refusal names the process, leaves it running and changes nothing', async (t) => {
  const fixture = fixtureFor(t);
  const site = fixture.addSite('one');
  const server = await startServer(t, site);
  const before = fixture.git(['rev-parse', 'HEAD'], site);
  assert.throws(() => refuseWhenListening(site, { script: 'shared:pull' }), (error) => {
    assert.ok(error instanceof ScriptError);
    assert.equal(error.code, EXIT.REFUSED);
    assert.match(error.message, new RegExp(`pid ${server.pid} `));
    return true;
  });
  assert.equal(process.kill(server.pid, 0), true);
  assert.equal(fixture.git(['rev-parse', 'HEAD'], site), before);
});

test('with nothing listening the preflight passes', (t) => {
  const fixture = fixtureFor(t);
  const site = fixture.addSite('one');
  assert.doesNotThrow(() => refuseWhenListening(site, { script: 'shared:pull', warn: assert.fail }));
});

test('lsof finding nothing is an answer, and no lsof at all is said out loud', (t) => {
  const fixture = fixtureFor(t);
  const site = fixture.addSite('one');
  const foundNothing = () => ({ status: 1, stdout: '' });
  assert.deepEqual(listenersInCheckout(site, { spawner: foundNothing }), { checked: true, processes: [], apps: [] });
  const noLsof = () => ({ error: new Error('spawn lsof ENOENT'), stdout: null });
  assert.deepEqual(listenersInCheckout(site, { spawner: noLsof }), { checked: false, processes: [], apps: [] });
  const warnings = [];
  refuseWhenListening(site, { script: 'shared:pull', spawner: noLsof, warn: (line) => warnings.push(line) });
  assert.equal(warnings.length, 1);
});

test('a checkout reached through a symlink still matches', async (t) => {
  const fixture = fixtureFor(t);
  const site = fixture.addSite('one');
  const link = path.join(fixture.base, 'link-to-site');
  fs.symlinkSync(site, link);
  const server = await startServer(t, site);
  assert.deepEqual(listenersInCheckout(link).processes.map((row) => row.pid), [server.pid]);
});

test("an app's own process in the checkout is no server: it is named, it keeps running, and the preflight passes", async (t) => {
  const fixture = fixtureFor(t);
  const site = fixture.addSite('one');
  const app = await startServer(t, site, { program: appProgram(fixture) });
  assert.deepEqual(listenersInCheckout(site), { checked: true, processes: [], apps: [{ pid: app.pid, command: 'helper' }] });
  const warnings = [];
  refuseWhenListening(site, { script: 'shared:pull', warn: (line) => warnings.push(line) });
  assert.deepEqual(warnings, [
    `shared:pull goes on: an app listens from this checkout, and an app serves no page.\n  pid ${app.pid} helper`,
  ]);
  assert.equal(process.kill(app.pid, 0), true);
});

test('a server beside an app still refuses, and the refusal names the server alone', async (t) => {
  const fixture = fixtureFor(t);
  const site = fixture.addSite('one');
  const app = await startServer(t, site, { program: appProgram(fixture) });
  const server = await startServer(t, path.join(site, 'docs'));
  assert.throws(() => refuseWhenListening(site, { script: 'shared:pull', warn: assert.fail }), (error) => {
    assert.equal(error.code, EXIT.REFUSED);
    assert.match(error.message, new RegExp(`\\n {2}pid ${server.pid} node\\n`));
    assert.doesNotMatch(error.message, new RegExp(`pid ${app.pid} `));
    return true;
  });
});

test('two apps are both named', (t) => {
  const fixture = fixtureFor(t);
  const site = fs.realpathSync(fixture.addSite('one'));
  const spawner = lsofFor([[4101, 'helper', site, APP], [4104, 'helper', path.join(site, 'docs'), APP]]);
  const warnings = [];
  refuseWhenListening(site, { script: 'shared:bump', spawner, warn: (line) => warnings.push(line) });
  assert.deepEqual(warnings, [
    'shared:bump goes on: 2 apps listen from this checkout, and an app serves no page.\n  pid 4101 helper\n  pid 4104 helper',
  ]);
});

test('a process whose program lsof cannot name counts as a server', (t) => {
  const fixture = fixtureFor(t);
  const site = fs.realpathSync(fixture.addSite('one'));
  const answers = lsofFor([[4101, 'helper', site, APP]]);
  const spawner = (command, args, options) =>
    (args.includes('txt') ? { error: new Error('lsof timed out'), stdout: null } : answers(command, args, options));
  assert.deepEqual(listenersInCheckout(site, { spawner }), {
    checked: true, processes: [{ pid: 4101, command: 'helper' }], apps: [],
  });
});
