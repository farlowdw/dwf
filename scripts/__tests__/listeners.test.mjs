/**
 * scripts/__tests__/listeners.test.mjs: the listening-process preflight. Real servers on ports the
 * system picks, started in fixture folders by the fixture's startServer, which stops them. The check
 * itself only reads, and a test here proves the server is still alive after a refusal. To change the
 * rule, change isInside in lib/listeners.mjs and add a row.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { EXIT, ScriptError } from '../lib/exitCodes.mjs';
import { describeListeners, listenersInCheckout, parseFields, refuseWhenListening } from '../lib/listeners.mjs';
import { fixtureFor, startServer } from './fixture.mjs';

test('parseFields reads lsof field output', () => {
  const text = 'p101\ncnode\nfcwd\nn/tmp/one\np202\ncnginx\nfcwd\nn/tmp/two\n';
  assert.deepEqual(parseFields(text), [
    { pid: 101, command: 'node', name: '/tmp/one' },
    { pid: 202, command: 'nginx', name: '/tmp/two' },
  ]);
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
  assert.deepEqual(listenersInCheckout(site), { checked: true, processes: [] });
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
  assert.deepEqual(listenersInCheckout(site, { spawner: foundNothing }), { checked: true, processes: [] });
  const noLsof = () => ({ error: new Error('spawn lsof ENOENT'), stdout: null });
  assert.deepEqual(listenersInCheckout(site, { spawner: noLsof }), { checked: false, processes: [] });
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
