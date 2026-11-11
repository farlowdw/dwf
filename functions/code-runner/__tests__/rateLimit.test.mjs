/**
 * rateLimit.test.mjs — shared/functions/code-runner/lib/rateLimit.mjs: the variable's "N/S" / "off"
 * is read (anything else: the default, logged — once per instance through the remembered reader the
 * functions use), a bucket per client holds `limit` tokens and refills
 * evenly over the window (a fake clock, no waiting), a refused request says how long to wait in
 * whole seconds, the client is the function context's `ip` (the modern API), else the first IP
 * header Netlify or `netlify dev` sets, else one shared "unknown" bucket, an IPv6 client is its
 * /64, at most
 * MAX_TRACKED_CLIENTS buckets are kept, and the 429 answer has the marker the editor reads, a
 * retry-after header, and is never cached. Pure: no network.
 * Run with `npm run test:shared`.
 * To change it: a new rule of lib/rateLimit.mjs gets a test here, on the fake clock.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
	RATE_LIMIT_VARIABLE,
	OFF,
	DEFAULT_EXECUTE_LIMIT,
	RUNTIMES_LIMIT,
	CLIENT_IP_HEADERS,
	UNKNOWN_CLIENT,
	MAX_TRACKED_CLIENTS,
	TOO_MANY_REQUESTS,
	RATE_LIMITED_MARKER,
	parseRateLimit,
	rateLimitSettings,
	instanceRateLimitSettings,
	forgetRateLimitSettings,
	rateLimitMessage,
	createRateLimiter,
	sharedLimiter,
	clientKey,
	rateLimitRefusal,
} from '../lib/rateLimit.mjs';
import { bodyOf, siteRequest } from './fakePiston.mjs';

/** Milliseconds in a second, for the fake clock. */
const SECOND = 1000;

/** A log that remembers its lines. */
function memoryLog() {
	const lines = [];
	const log = (line) => lines.push(String(line));
	log.lines = lines;
	return log;
}

/** A request to the execute function with these headers. */
function requestWith(headers) {
	return siteRequest('/.netlify/functions/execute', { method: 'POST', headers });
}

test('the contract constants', () => {
	assert.equal(RATE_LIMIT_VARIABLE, 'CODE_RUNNER_RATE_LIMIT');
	assert.equal(OFF, 'off');
	assert.deepEqual(DEFAULT_EXECUTE_LIMIT, { limit: 20, windowSeconds: 60 });
	assert.deepEqual(RUNTIMES_LIMIT, { limit: 60, windowSeconds: 60 });
	assert.deepEqual([...CLIENT_IP_HEADERS], ['x-nf-client-connection-ip', 'client-ip', 'x-forwarded-for']);
	assert.equal(TOO_MANY_REQUESTS, 429);
	assert.equal(RATE_LIMITED_MARKER, 'Too many requests');
	assert.ok(MAX_TRACKED_CLIENTS >= 100);
});

test('parseRateLimit: "N/S", spaces allowed, "off" in any case; anything else is null', () => {
	assert.deepEqual(parseRateLimit('20/60'), { limit: 20, windowSeconds: 60 });
	assert.deepEqual(parseRateLimit(' 5 / 10 '), { limit: 5, windowSeconds: 10 });
	assert.equal(parseRateLimit('off'), OFF);
	assert.equal(parseRateLimit('OFF'), OFF);
	for (const bad of ['', '20', '20/', '/60', '0/60', '20/0', '-1/60', '2.5/60', 'twenty/60', '20 per 60', undefined, null]) {
		assert.equal(parseRateLimit(bad), null, String(bad));
	}
});

test('rateLimitSettings: the variable, the default when unset, the default (logged) when unreadable', () => {
	const log = memoryLog();
	assert.deepEqual(rateLimitSettings({ CODE_RUNNER_RATE_LIMIT: '3/10' }, log), { limit: 3, windowSeconds: 10 });
	assert.equal(rateLimitSettings({ CODE_RUNNER_RATE_LIMIT: 'off' }, log), OFF);
	assert.equal(rateLimitSettings({}, log), DEFAULT_EXECUTE_LIMIT);
	assert.equal(rateLimitSettings({ CODE_RUNNER_RATE_LIMIT: '  ' }, log), DEFAULT_EXECUTE_LIMIT);
	assert.equal(rateLimitSettings(undefined, log), DEFAULT_EXECUTE_LIMIT);
	assert.equal(log.lines.length, 0, 'nothing logged so far');
	assert.equal(rateLimitSettings({ CODE_RUNNER_RATE_LIMIT: 'unlimited' }, log), DEFAULT_EXECUTE_LIMIT, 'never "no limit" by accident');
	assert.equal(log.lines.length, 1);
	assert.match(log.lines[0], /CODE_RUNNER_RATE_LIMIT.*"N\/S".*20\/60/);
});

test('instanceRateLimitSettings: parsed once per instance — an unreadable value is logged once, again only when the text changes', () => {
	const log = memoryLog();
	forgetRateLimitSettings();
	const unreadable = { CODE_RUNNER_RATE_LIMIT: 'unlimited' };
	for (let i = 0; i < 5; i += 1) {
		assert.equal(instanceRateLimitSettings(unreadable, log), DEFAULT_EXECUTE_LIMIT);
	}
	assert.equal(log.lines.length, 1, 'five reads of the same text: one warning');
	assert.match(log.lines[0], /CODE_RUNNER_RATE_LIMIT.*"N\/S"/);

	const readable = { CODE_RUNNER_RATE_LIMIT: ' 3/10 ' };
	assert.deepEqual(instanceRateLimitSettings(readable, log), { limit: 3, windowSeconds: 10 }, 'a changed text is parsed again');
	assert.equal(instanceRateLimitSettings({ CODE_RUNNER_RATE_LIMIT: '3/10' }, log), instanceRateLimitSettings(readable, log), 'remembered by the trimmed text');
	assert.equal(log.lines.length, 1, 'a readable value logs nothing');

	assert.equal(instanceRateLimitSettings(unreadable, log), DEFAULT_EXECUTE_LIMIT);
	assert.equal(log.lines.length, 2, 'back to the unreadable text: logged once more');
	assert.equal(instanceRateLimitSettings(unreadable, log), DEFAULT_EXECUTE_LIMIT);
	assert.equal(log.lines.length, 2);

	forgetRateLimitSettings();
	assert.equal(instanceRateLimitSettings(unreadable, log), DEFAULT_EXECUTE_LIMIT);
	assert.equal(log.lines.length, 3, 'forgotten: parsed and logged again');
	assert.equal(instanceRateLimitSettings({}, log), DEFAULT_EXECUTE_LIMIT, 'unset: the default');
	assert.equal(instanceRateLimitSettings({ CODE_RUNNER_RATE_LIMIT: 'off' }, log), OFF);
	assert.equal(log.lines.length, 3);
	forgetRateLimitSettings();
});

test('a bucket starts full, gives one token per request, then refuses with whole seconds to wait', () => {
	const limiter = createRateLimiter({ limit: 3, windowSeconds: 30 });
	const start = 1_000_000;
	assert.deepEqual(limiter.take('a', start), { allowed: true, remaining: 2 });
	assert.deepEqual(limiter.take('a', start), { allowed: true, remaining: 1 });
	assert.deepEqual(limiter.take('a', start), { allowed: true, remaining: 0 });
	assert.deepEqual(limiter.take('a', start), { allowed: false, retryAfterSeconds: 10 }, 'one token every 10 s');
	assert.deepEqual(limiter.take('a', start + 4 * SECOND), { allowed: false, retryAfterSeconds: 6 });
	assert.deepEqual(limiter.take('a', start + 10 * SECOND), { allowed: true, remaining: 0 }, 'refilled one token');
	assert.deepEqual(limiter.take('a', start + 10 * SECOND), { allowed: false, retryAfterSeconds: 10 });
	assert.deepEqual(limiter.settings, { limit: 3, windowSeconds: 30 });
});

test('the bucket never holds more than `limit` tokens, however long the client was away', () => {
	const limiter = createRateLimiter({ limit: 2, windowSeconds: 1 });
	const start = 0;
	limiter.take('a', start);
	limiter.take('a', start);
	const later = start + 3_600 * SECOND;
	assert.equal(limiter.take('a', later).allowed, true);
	assert.equal(limiter.take('a', later).allowed, true);
	assert.equal(limiter.take('a', later).allowed, false, 'two, not thousands');
});

test('retryAfterSeconds is at least 1, even when the wait is a fraction of a second', () => {
	const limiter = createRateLimiter({ limit: 10, windowSeconds: 1 });
	for (let i = 0; i < 10; i += 1) limiter.take('a', 0);
	const refused = limiter.take('a', 0);
	assert.equal(refused.allowed, false);
	assert.equal(refused.retryAfterSeconds, 1);
});

test('a clock that goes backwards never refunds tokens', () => {
	const limiter = createRateLimiter({ limit: 1, windowSeconds: 60 });
	limiter.take('a', 10 * SECOND);
	assert.equal(limiter.take('a', 0).allowed, false);
});

test('each client has its own bucket', () => {
	const limiter = createRateLimiter({ limit: 1, windowSeconds: 60 });
	assert.equal(limiter.take('a', 0).allowed, true);
	assert.equal(limiter.take('b', 0).allowed, true);
	assert.equal(limiter.take('a', 0).allowed, false);
	assert.equal(limiter.size(), 2);
});

test('at most MAX_TRACKED_CLIENTS buckets are kept: full ones go first, then the oldest', () => {
	// Two tokens per hour: a client that used one is full again after 30 minutes (a second more,
	// so floating-point refilling cannot land a hair under one token).
	const limiter = createRateLimiter({ limit: 2, windowSeconds: 3600 });
	const start = 0;
	const halfAnHour = start + 1801 * SECOND;
	limiter.take('busy', start);
	limiter.take('busy', start);
	for (let i = 0; i < MAX_TRACKED_CLIENTS - 1; i += 1) limiter.take(`idle-${i}`, start);
	assert.equal(limiter.size(), MAX_TRACKED_CLIENTS);

	// Half an hour later a new client arrives: the idle ones are full again, busy has one token.
	limiter.take('new', halfAnHour);
	assert.equal(limiter.size(), MAX_TRACKED_CLIENTS, 'one full bucket made room');
	assert.equal(limiter.take('busy', halfAnHour).allowed, true, 'busy was kept, with its one refilled token…');
	assert.equal(limiter.take('busy', halfAnHour).allowed, false, '…and its history: a fresh bucket would allow two');

	// Many more new clients: once every full bucket is gone, the oldest go — busy first.
	for (let i = 0; i < MAX_TRACKED_CLIENTS; i += 1) limiter.take(`more-${i}`, halfAnHour);
	assert.equal(limiter.size(), MAX_TRACKED_CLIENTS);
	assert.equal(limiter.take('busy', halfAnHour).allowed, true, 'busy was forgotten: a full bucket again…');
	assert.equal(limiter.take('busy', halfAnHour).allowed, true, '…with both tokens');
});

test('sharedLimiter: one limiter per settings for the instance; null when off', () => {
	const settings = { limit: 7, windowSeconds: 7 };
	assert.equal(sharedLimiter(settings), sharedLimiter({ ...settings }));
	assert.notEqual(sharedLimiter(settings), sharedLimiter({ limit: 7, windowSeconds: 8 }));
	assert.equal(sharedLimiter(OFF), null);
});

test("clientKey: the context's ip first, else the first IP header present (its first address), else \"unknown\"", () => {
	assert.equal(clientKey(requestWith({ 'x-nf-client-connection-ip': '198.51.100.1' }), { ip: '203.0.113.9' }), '203.0.113.9', "the modern API's own field wins");
	assert.equal(clientKey(requestWith({}), { ip: ' 203.0.113.9 ' }), '203.0.113.9');
	assert.equal(clientKey(requestWith({ 'x-nf-client-connection-ip': '203.0.113.9' }), { ip: '' }), '203.0.113.9', 'a blank ip: the headers');
	assert.equal(clientKey(requestWith({ 'x-nf-client-connection-ip': '203.0.113.9' }), undefined), '203.0.113.9', 'no context at all: the headers');
	assert.equal(clientKey(requestWith({ 'X-NF-Client-Connection-IP': ' 203.0.113.9 ' })), '203.0.113.9');
	assert.equal(clientKey(requestWith({ 'client-ip': '203.0.113.9', 'x-forwarded-for': '198.51.100.1' })), '203.0.113.9');
	assert.equal(clientKey(requestWith({ 'x-forwarded-for': '198.51.100.1, 10.0.0.1' })), '198.51.100.1');
	assert.equal(clientKey(requestWith({ 'x-nf-client-connection-ip': '', 'client-ip': '203.0.113.9' })), '203.0.113.9');
	assert.equal(clientKey(requestWith({}), {}), UNKNOWN_CLIENT);
	assert.equal(clientKey(requestWith({})), UNKNOWN_CLIENT);
	assert.equal(clientKey(undefined, undefined), UNKNOWN_CLIENT);
});

test('clientKey: an IPv6 client is its /64, however the address is written; IPv4, a mapped IPv4 and an unreadable value stay whole', () => {
	const keyOf = (ip) => clientKey(requestWith({}), { ip });
	assert.equal(keyOf('2001:db8:aa:bb::1'), '2001:db8:aa:bb::/64');
	assert.equal(keyOf('2001:db8:aa:bb:ffff:1:2:190'), '2001:db8:aa:bb::/64', 'another address of the same /64');
	assert.equal(keyOf('2001:0DB8:00AA:00BB:0000:0000:0000:0001'), '2001:db8:aa:bb::/64', 'the same address written in full');
	assert.equal(keyOf('2001:db8:aa:bc::1'), '2001:db8:aa:bc::/64', 'the next /64 is another client');
	assert.equal(keyOf('2001:db8::1'), '2001:db8:0:0::/64');
	assert.equal(keyOf('fe80::1%en0'), 'fe80:0:0:0::/64', 'a zone is dropped');
	assert.equal(keyOf('::ffff:203.0.113.9'), '::ffff:203.0.113.9', 'a mapped IPv4 address is one client, not a shared network');
	assert.equal(keyOf('::1'), '::1');
	assert.equal(keyOf('203.0.113.9'), '203.0.113.9');
	assert.equal(keyOf('2001:db8:::1'), '2001:db8:::1', 'not an address: as it came');
	assert.equal(keyOf('1:2:3:4:5:6:7:8:9'), '1:2:3:4:5:6:7:8:9');
	assert.equal(clientKey(requestWith({ 'x-nf-client-connection-ip': '2001:db8:aa:bb::7' })), '2001:db8:aa:bb::/64', 'from a header too');
});

test('one IPv6 client that changes its address inside its /64 is stopped like any other', () => {
	const limiter = createRateLimiter({ limit: 20, windowSeconds: 60 });
	let allowed = 0;
	for (let host = 1; host <= 400; host += 1) {
		const key = clientKey(requestWith({}), { ip: `2001:db8:aa:bb::${host.toString(16)}` });
		if (limiter.take(key, 0).allowed) allowed += 1;
	}
	assert.equal(allowed, 20);
	assert.equal(limiter.size(), 1);
});

test('rateLimitRefusal: null while allowed (or off), else a logged 429 with retry-after, never cached', async () => {
	const log = memoryLog();
	const limiter = createRateLimiter({ limit: 1, windowSeconds: 60 });
	const request = requestWith({});
	const context = { ip: '203.0.113.9' };
	assert.equal(rateLimitRefusal(request, context, null, log), null, 'off');
	assert.equal(rateLimitRefusal(request, context, limiter, log), null);
	const refused = rateLimitRefusal(request, context, limiter, log);
	assert.ok(refused instanceof Response);
	assert.equal(refused.status, TOO_MANY_REQUESTS);
	assert.equal(refused.headers.get('cache-control'), 'no-store');
	assert.match(refused.headers.get('retry-after'), /^\d+$/);
	const { message } = await bodyOf(refused);
	assert.equal(message, rateLimitMessage(limiter.settings, Number(refused.headers.get('retry-after'))));
	assert.ok(message.startsWith(RATE_LIMITED_MARKER), 'the editor matches the first words');
	assert.match(message, /at most 1 in 60 s/);
	assert.equal(log.lines.length, 1);
	assert.match(log.lines[0], /Rate limit.*203\.0\.113\.9.*1\/60/);
});
