/**
 * shared/functions/code-runner/lib/rateLimit.mjs — how many requests one client may make: a token
 * bucket per client IP, kept in the memory of the function instance that is warm. Used by
 * execute.mjs (CODE_RUNNER_RATE_LIMIT, default 20 runs per 60 s) and runtimes.mjs (RUNTIMES_LIMIT, fixed).
 *
 * WHY
 *   A small Piston server runs few jobs at a time: a page that fires Run in a loop, or a
 *   script that found the function on a public site, would queue everyone else's runs behind
 *   its own. Netlify's own rate limiting (every plan; a 429 per domain and IP) is a `config`
 *   export of the modern functions API that needs a `path` of its own, which these functions
 *   do not set (they keep Netlify's default URLs; shared/functions/code-runner/README.md >
 *   Netlify's own rate limiting has the syntax). So the limit lives here, at no cost and with no service: a bucket per
 *   client with `limit` tokens, refilled evenly over `windowSeconds`; a request takes one token
 *   or is refused with 429 and a `retry-after`.
 *
 * ITS LIMITS (what it does NOT do)
 *   Per warm instance: Netlify may run several instances of a function at once, and a cold start
 *   begins with full buckets, so a determined client gets more than the number says — the limit
 *   bounds the damage, it is not an exact count. The client is the IP Netlify reports: the
 *   function context's `ip` (the modern API's own field; `netlify dev` fills it too), else the
 *   first of CLIENT_IP_HEADERS present (x-nf-client-connection-ip, then client-ip — Netlify's
 *   edge and `netlify dev` both set BOTH to the connecting address; then x-forwarded-for's
 *   first address, reached only on a host that sets neither, i.e. not Netlify — there that
 *   address is the client's own choice and the limit is advisory only); readers behind one
 *   shared address (an office, a school) share one bucket. An IPv6 client is its /64, the
 *   network one home line or one rented server holds whole: counted by the full address, a
 *   script that takes a new address of its own network for every request would never be
 *   stopped (networkKey; a client that holds many networks still gets a bucket for each). A request with none of those shares
 *   the UNKNOWN_CLIENT bucket. At most MAX_TRACKED_CLIENTS buckets are kept: beyond that the
 *   full and then the oldest ones are dropped (their owners get a full bucket next time).
 *
 * WHAT IT GIVES
 *   parseRateLimit(text)         "20/60" → { limit: 20, windowSeconds: 60 }; "off" → OFF; null for
 *                                anything else.
 *   rateLimitSettings(env, log)  CODE_RUNNER_RATE_LIMIT parsed, or DEFAULT_EXECUTE_LIMIT when it
 *                                is unset or blank; an unreadable value is logged and the default
 *                                used (never "no limit" by accident). Pure: parses on every call.
 *   instanceRateLimitSettings(env, log)
 *                                the same, parsed ONCE per warm instance: the variable never
 *                                changes while an instance lives, so the text is remembered with
 *                                its settings and an unreadable value is logged once, not once per
 *                                request. Parsed (and logged) again only when the text differs.
 *                                The functions use this one. forgetRateLimitSettings() clears the
 *                                memory (tests).
 *   createRateLimiter(settings)  { take(key, nowMs), settings, size() }: take() answers
 *                                { allowed: true, remaining } or
 *                                { allowed: false, retryAfterSeconds } (whole seconds, at least 1).
 *   sharedLimiter(settings)      the one limiter this instance keeps for those settings (so both
 *                                functions, bundled apart, each keep their own).
 *   clientKey(request, context)  the client's IP: context.ip, else the request headers, else
 *                                UNKNOWN_CLIENT. An IPv6 address gives its /64, written one way
 *                                ("2001:db8:aa:bb::/64").
 *   rateLimitRefusal(request, context, limiter, log)
 *                                null when the request may go on (or `limiter` is null: off),
 *                                else the logged 429 Response: JSON { message } whose first words
 *                                are RATE_LIMITED_MARKER (the editor reads them) and a
 *                                `retry-after` header in seconds.
 *
 * HOW TO CHANGE IT
 *   The default for runs: DEFAULT_EXECUTE_LIMIT (or set CODE_RUNNER_RATE_LIMIT on Netlify:
 *   "N/S", N requests per S seconds; "off" switches both functions' limits off). The list's:
 *   RUNTIMES_LIMIT. The variable's name: RATE_LIMIT_VARIABLE (also
 *   shared/functions/code-runner/README.md > The rate limit). The 429's
 *   words: rateLimitMessage() (keep RATE_LIMITED_MARKER at the start). How many clients are
 *   remembered: MAX_TRACKED_CLIENTS. Tests: __tests__/rateLimit.test.mjs (`npm run test:shared`).
 */

import { errorResponse, headerValue } from './piston.mjs';

/** Environment variable holding the runs limit as "N/S" (N runs per S seconds) or "off". */
export const RATE_LIMIT_VARIABLE = 'CODE_RUNNER_RATE_LIMIT';

/** The value that switches the limits off. */
export const OFF = 'off';

/** Runs per client when CODE_RUNNER_RATE_LIMIT is unset: 20 in 60 s (a reader pressing Run by hand never meets it). */
export const DEFAULT_EXECUTE_LIMIT = Object.freeze({ limit: 20, windowSeconds: 60 });

/** Requests for the runtime list per client (asked once per page load, cached 5 minutes): 60 in 60 s. */
export const RUNTIMES_LIMIT = Object.freeze({ limit: 60, windowSeconds: 60 });

/** The shape of the variable's value: two positive whole numbers with a slash between. */
const RATE_LIMIT_SHAPE = /^(\d+)\s*\/\s*(\d+)$/;

/**
 * Request headers that carry the client's IP, most trustworthy first (see ITS LIMITS): Netlify
 * and `netlify dev` set the first two to the same address; the last is client-chosen off Netlify.
 * Read only when the function context carries no `ip`.
 */
export const CLIENT_IP_HEADERS = Object.freeze(['x-nf-client-connection-ip', 'client-ip', 'x-forwarded-for']);

/** The bucket shared by requests whose client IP is unknown. */
export const UNKNOWN_CLIENT = 'unknown';

/** Most clients one instance remembers (each is one small object). */
export const MAX_TRACKED_CLIENTS = 1000;

/** The status of a refused request. */
export const TOO_MANY_REQUESTS = 429;

/** The first words of the 429's message: the editor reads them (shared/components/CodeEditor/lib/codeRunner/errors.js). */
export const RATE_LIMITED_MARKER = 'Too many requests';

/** An IPv6 address has eight groups; the first four name the client's network (its /64). */
const IPV6_GROUPS = 8;
const NETWORK_GROUPS = 4;

/** One group of an IPv6 address: one to four hexadecimal digits. */
const IPV6_GROUP = /^[0-9a-f]{1,4}$/i;

/** What ends an IPv6 network's key. */
const NETWORK_SUFFIX = '::/64';

/** Separator of a list of addresses in x-forwarded-for. */
const ADDRESS_SEPARATOR = ',';

/** Milliseconds in a second. */
const MS_PER_SECOND = 1000;

/** The limiters this instance keeps, by settings (see sharedLimiter). */
const limiters = new Map();

/** What this instance remembers of the variable: { text, settings } (see instanceRateLimitSettings), or null. */
let rememberedSettings = null;

/** "N/S" → { limit, windowSeconds }; "off" → OFF; null for anything else (blank included). */
export function parseRateLimit(text) {
	const trimmed = String(text ?? '').trim();
	if (trimmed.toLowerCase() === OFF) return OFF;
	const match = RATE_LIMIT_SHAPE.exec(trimmed);
	if (match === null) return null;
	const limit = Number(match[1]);
	const windowSeconds = Number(match[2]);
	if (limit < 1 || windowSeconds < 1) return null;
	return { limit, windowSeconds };
}

/** The variable's value, trimmed; '' when it is unset (or there is no environment at all). */
function settingText(env) {
	if (!env || typeof env[RATE_LIMIT_VARIABLE] !== 'string') return '';
	return env[RATE_LIMIT_VARIABLE].trim();
}

/** The runs limit from the environment, parsed on every call (see WHAT IT GIVES). */
export function rateLimitSettings(env, log) {
	const text = settingText(env);
	if (text === '') return DEFAULT_EXECUTE_LIMIT;
	const parsed = parseRateLimit(text);
	if (parsed !== null) return parsed;
	log(`${RATE_LIMIT_VARIABLE} must be "N/S" (N requests per S seconds) or "off"; using the default ${DEFAULT_EXECUTE_LIMIT.limit}/${DEFAULT_EXECUTE_LIMIT.windowSeconds}.`);
	return DEFAULT_EXECUTE_LIMIT;
}

/** The runs limit parsed once per instance and remembered by the variable's text (see WHAT IT GIVES). */
export function instanceRateLimitSettings(env, log) {
	const text = settingText(env);
	if (rememberedSettings !== null && rememberedSettings.text === text) return rememberedSettings.settings;
	const settings = rateLimitSettings(env, log);
	rememberedSettings = { text, settings };
	return settings;
}

/** Forgets the remembered settings: the next instanceRateLimitSettings() parses (and logs) again. Tests only. */
export function forgetRateLimitSettings() {
	rememberedSettings = null;
}

/** The words of the 429 for these settings and wait. */
export function rateLimitMessage({ limit, windowSeconds }, retryAfterSeconds) {
	return `${RATE_LIMITED_MARKER} from your connection (at most ${limit} in ${windowSeconds} s): try again in ${retryAfterSeconds} s.`;
}

/** A token bucket per key (see WHAT IT GIVES). */
export function createRateLimiter(settings) {
	const { limit, windowSeconds } = settings;
	const tokensPerMs = limit / (windowSeconds * MS_PER_SECOND);
	const buckets = new Map();

	/** The bucket's tokens brought up to `now`. */
	function refill(bucket, now) {
		const elapsed = Math.max(0, now - bucket.updatedAt);
		bucket.tokens = Math.min(limit, bucket.tokens + elapsed * tokensPerMs);
		bucket.updatedAt = now;
	}

	/** Makes room for one more bucket under MAX_TRACKED_CLIENTS: the full ones go first, then the oldest. */
	function makeRoom(now) {
		for (const [key, bucket] of buckets) {
			if (buckets.size < MAX_TRACKED_CLIENTS) return;
			refill(bucket, now);
			if (bucket.tokens >= limit) buckets.delete(key);
		}
		for (const key of buckets.keys()) {
			if (buckets.size < MAX_TRACKED_CLIENTS) return;
			buckets.delete(key);
		}
	}

	/** The bucket for `key`, made full when it is new. */
	function bucketFor(key, now) {
		const known = buckets.get(key);
		if (known !== undefined) {
			refill(known, now);
			return known;
		}
		if (buckets.size >= MAX_TRACKED_CLIENTS) makeRoom(now);
		const bucket = { tokens: limit, updatedAt: now };
		buckets.set(key, bucket);
		return bucket;
	}

	/** Whole seconds until the bucket holds one token again (at least 1). */
	function secondsUntilToken(bucket) {
		const missing = 1 - bucket.tokens;
		return Math.max(1, Math.ceil(missing / tokensPerMs / MS_PER_SECOND));
	}

	/** Takes one token for `key` at `now` (ms), or says how long to wait. */
	function take(key, now = Date.now()) {
		const bucket = bucketFor(key, now);
		if (bucket.tokens >= 1) {
			bucket.tokens -= 1;
			return { allowed: true, remaining: Math.floor(bucket.tokens) };
		}
		return { allowed: false, retryAfterSeconds: secondsUntilToken(bucket) };
	}

	return { take, settings, size: () => buckets.size };
}

/** The one limiter this instance keeps for `settings`; null for OFF. */
export function sharedLimiter(settings) {
	if (settings === OFF) return null;
	const key = `${settings.limit}/${settings.windowSeconds}`;
	if (!limiters.has(key)) limiters.set(key, createRateLimiter(settings));
	return limiters.get(key);
}

/** The context's `ip` when it is a non-blank string, else ''. */
function contextIp(context) {
	const ip = context && context.ip;
	if (typeof ip !== 'string') return '';
	return ip.trim();
}

/** The first address of the first of CLIENT_IP_HEADERS present, else ''. */
function headerIp(request) {
	for (const name of CLIENT_IP_HEADERS) {
		const [first] = headerValue(request, name).split(ADDRESS_SEPARATOR);
		const address = first.trim();
		if (address !== '') return address;
	}
	return '';
}

/** The groups on one side of an address's "::" (none for an empty side). */
function groupsOf(side) {
	return side === '' ? [] : side.split(':');
}

/** The eight groups of an IPv6 address ("::" filled in, a zone dropped), or null when `address` is not eight hexadecimal groups. */
function ipv6Groups(address) {
	const [bare] = address.split('%');
	const sides = bare.split('::');
	if (sides.length > 2) return null;
	const head = groupsOf(sides[0]);
	const tail = sides.length === 2 ? groupsOf(sides[1]) : [];
	const missing = IPV6_GROUPS - head.length - tail.length;
	if (sides.length === 2 ? missing < 1 : missing !== 0) return null;
	const groups = [...head, ...Array(missing).fill('0'), ...tail];
	return groups.every((group) => IPV6_GROUP.test(group)) ? groups : null;
}

/**
 * The bucket's key for an address: an IPv6 address gives its /64 (see ITS LIMITS), written one
 * way; anything else is the address as it came. So are an address this cannot read and one whose
 * first four groups are all zero (the loopback, an IPv4 address written as IPv6): those are single
 * clients, not one network.
 */
function networkKey(address) {
	if (!address.includes(':')) return address;
	const groups = ipv6Groups(address);
	if (groups === null) return address;
	const network = groups.slice(0, NETWORK_GROUPS).map((group) => Number.parseInt(group, 16).toString(16));
	if (network.every((group) => group === '0')) return address;
	return `${network.join(':')}${NETWORK_SUFFIX}`;
}

/** The client's IP (an IPv6 client's /64): the function context's, else the headers', else UNKNOWN_CLIENT. */
export function clientKey(request, context) {
	return networkKey(contextIp(context) || headerIp(request)) || UNKNOWN_CLIENT;
}

/** null when the request may go on, else the logged 429 answer (see WHAT IT GIVES). */
export function rateLimitRefusal(request, context, limiter, log) {
	if (limiter === null) return null;
	const key = clientKey(request, context);
	const outcome = limiter.take(key);
	if (outcome.allowed) return null;
	const { retryAfterSeconds } = outcome;
	log(`Rate limit: refused a request from ${key} (${limiter.settings.limit}/${limiter.settings.windowSeconds} s; retry after ${retryAfterSeconds} s).`);
	return errorResponse(TOO_MANY_REQUESTS, rateLimitMessage(limiter.settings, retryAfterSeconds), { 'retry-after': String(retryAfterSeconds) });
}
