/**
 * useNearViewport.test.js — loading an editor only near the window (../useNearViewport.js): the
 * observer (watchNearViewport) with a fake IntersectionObserver — its margin, an entry outside
 * and inside it, once only, stop(), and every case where it cannot watch and so shows at once
 * (no element, no IntersectionObserver as in node, a refused margin); the effect's decision
 * (nearViewportEffect: near, not enabled, enabled, enabled without an element); and the hook
 * rendered on the server (false
 * only while enabled, nothing touched that the server lacks). Run with `npm run test:shared`.
 * To change it: a new case of ../useNearViewport.js gets a test here, with the fake observer.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DEFAULT_ROOT_MARGIN, nearViewportEffect, useNearViewport, watchNearViewport } from '../useNearViewport.js';

/** An element (only its identity matters). */
const ELEMENT = Object.freeze({ id: 'code-editor-two-sum' });

/**
 * A fake IntersectionObserver class: every instance is in `instances`, records its options, what
 * it observes and whether it was disconnected; report(entries) calls its callback.
 */
function fakeObserverClass({ throwOnCreate = false, throwOnObserve = false } = {}) {
	const instances = [];
	class FakeObserver {
		constructor(callback, options) {
			if (throwOnCreate) throw new SyntaxError("Failed to construct 'IntersectionObserver': rootMargin must be specified in pixels or percent.");
			this.callback = callback;
			this.options = options;
			this.observed = [];
			this.disconnected = false;
			instances.push(this);
		}

		observe(element) {
			if (throwOnObserve) throw new TypeError('not an Element');
			this.observed.push(element);
		}

		disconnect() {
			this.disconnected = true;
		}

		report(entries) {
			this.callback(entries, this);
		}
	}
	return { FakeObserver, instances };
}

/** A counter to hand in as onNear / markNear. */
function counter() {
	const calls = { count: 0 };
	calls.fn = () => {
		calls.count += 1;
	};
	return calls;
}

test('watchNearViewport observes the element with the default margin and any-pixel threshold', () => {
	const { FakeObserver, instances } = fakeObserverClass();
	const near = counter();
	watchNearViewport(ELEMENT, { onNear: near.fn, Observer: FakeObserver });
	assert.equal(instances.length, 1);
	assert.deepEqual(instances[0].options, { rootMargin: DEFAULT_ROOT_MARGIN, threshold: 0 });
	assert.deepEqual(instances[0].observed, [ELEMENT]);
	assert.equal(near.count, 0, 'not near until the observer says so');
});

test('an entry outside the margin does nothing; inside it calls onNear once and disconnects', () => {
	const { FakeObserver, instances } = fakeObserverClass();
	const near = counter();
	watchNearViewport(ELEMENT, { rootMargin: '200px 0px', onNear: near.fn, Observer: FakeObserver });
	const [observer] = instances;
	assert.equal(observer.options.rootMargin, '200px 0px');
	observer.report([{ isIntersecting: false, intersectionRatio: 0 }]);
	assert.equal(near.count, 0);
	assert.equal(observer.disconnected, false);
	observer.report([{ isIntersecting: true, intersectionRatio: 0.1 }]);
	assert.equal(near.count, 1);
	assert.equal(observer.disconnected, true);
	observer.report([{ isIntersecting: true, intersectionRatio: 1 }]);
	assert.equal(near.count, 1, 'once only');
});

test('a browser without isIntersecting: a ratio above 0 counts as near', () => {
	const { FakeObserver, instances } = fakeObserverClass();
	const near = counter();
	watchNearViewport(ELEMENT, { onNear: near.fn, Observer: FakeObserver });
	instances[0].report([{ intersectionRatio: 0.5 }]);
	assert.equal(near.count, 1);
});

test('stop() disconnects; a late report does nothing; stop twice is harmless', () => {
	const { FakeObserver, instances } = fakeObserverClass();
	const near = counter();
	const stop = watchNearViewport(ELEMENT, { onNear: near.fn, Observer: FakeObserver });
	stop();
	assert.equal(instances[0].disconnected, true);
	instances[0].report([{ isIntersecting: true, intersectionRatio: 1 }]);
	assert.equal(near.count, 0);
	assert.doesNotThrow(stop);
});

test('it cannot watch, so it shows at once: no element, no IntersectionObserver (as in node), a refused margin', () => {
	const cases = [
		[null, { Observer: fakeObserverClass().FakeObserver }],
		[ELEMENT, {}], // node has no IntersectionObserver: the default finds none
		[ELEMENT, { Observer: fakeObserverClass({ throwOnCreate: true }).FakeObserver, rootMargin: 'soon' }],
		[ELEMENT, { Observer: fakeObserverClass({ throwOnObserve: true }).FakeObserver }],
	];
	assert.equal(globalThis.IntersectionObserver, undefined, 'node has none');
	for (const [element, options] of cases) {
		const near = counter();
		const stop = watchNearViewport(element, { ...options, onNear: near.fn });
		assert.equal(near.count, 1);
		assert.equal(typeof stop, 'function');
		assert.doesNotThrow(stop);
	}
});

test('one near entry among several is enough; no onNear given is harmless', () => {
	const { FakeObserver, instances } = fakeObserverClass();
	const near = counter();
	watchNearViewport(ELEMENT, { onNear: near.fn, Observer: FakeObserver });
	instances[0].report([{ isIntersecting: false, intersectionRatio: 0 }, { isIntersecting: true, intersectionRatio: 0 }]);
	assert.equal(near.count, 1, 'isIntersecting with a ratio of 0: an edge touching the margin');
	assert.doesNotThrow(() => watchNearViewport(null, {}));
	assert.doesNotThrow(() => watchNearViewport(ELEMENT, { Observer: FakeObserver }));
});

test('an observer whose observe() throws is disconnected before onNear', () => {
	const { FakeObserver, instances } = fakeObserverClass({ throwOnObserve: true });
	watchNearViewport(ELEMENT, { onNear() {}, Observer: FakeObserver });
	assert.equal(instances[0].disconnected, true);
});

test('nearViewportEffect: already near → nothing to do', () => {
	const mark = counter();
	const { FakeObserver, instances } = fakeObserverClass();
	assert.equal(nearViewportEffect({ near: true, enabled: true, element: ELEMENT, markNear: mark.fn, Observer: FakeObserver }), undefined);
	assert.equal(mark.count, 0);
	assert.equal(instances.length, 0, 'no observer');
});

test('nearViewportEffect: not enabled → near at once, no observer (a later enabled never unmounts it)', () => {
	const mark = counter();
	const { FakeObserver, instances } = fakeObserverClass();
	assert.equal(nearViewportEffect({ near: false, enabled: false, element: ELEMENT, markNear: mark.fn, Observer: FakeObserver }), undefined);
	assert.equal(mark.count, 1);
	assert.equal(instances.length, 0);
});

test('nearViewportEffect: enabled → watches, returns the clean-up, marks near when the observer says so', () => {
	const mark = counter();
	const { FakeObserver, instances } = fakeObserverClass();
	const cleanUp = nearViewportEffect({ near: false, enabled: true, element: ELEMENT, rootMargin: '50% 0px', markNear: mark.fn, Observer: FakeObserver });
	assert.equal(typeof cleanUp, 'function');
	assert.equal(instances[0].options.rootMargin, '50% 0px');
	instances[0].report([{ isIntersecting: true, intersectionRatio: 0.2 }]);
	assert.equal(mark.count, 1);
	cleanUp();
	assert.equal(instances[0].disconnected, true);
});

test('nearViewportEffect: enabled but the ref holds no element (never attached) → near at once, never stuck unloaded', () => {
	const mark = counter();
	const { FakeObserver, instances } = fakeObserverClass();
	nearViewportEffect({ near: false, enabled: true, element: null, markNear: mark.fn, Observer: FakeObserver });
	assert.equal(mark.count, 1);
	assert.equal(instances.length, 0);
});

test('nearViewportEffect: no rootMargin given → the default', () => {
	const { FakeObserver, instances } = fakeObserverClass();
	nearViewportEffect({ near: false, enabled: true, element: ELEMENT, rootMargin: undefined, markNear() {}, Observer: FakeObserver });
	assert.equal(instances[0].options.rootMargin, DEFAULT_ROOT_MARGIN);
});

/** A component that prints what the hook answers on its first render. */
function Probe({ options }) {
	const [visible, forceVisible] = useNearViewport({ current: null }, options);
	return createElement('p', null, `${visible} ${typeof forceVisible}`);
}

test('the hook on the server: false only while enabled; nothing it needs is missing there', () => {
	assert.equal(globalThis.window, undefined, 'a server: no window');
	assert.equal(renderToStaticMarkup(createElement(Probe, { options: { enabled: true } })), '<p>false function</p>');
	assert.equal(renderToStaticMarkup(createElement(Probe, { options: { enabled: false } })), '<p>true function</p>');
	assert.equal(renderToStaticMarkup(createElement(Probe, { options: undefined })), '<p>true function</p>', 'not enabled by default: an editor without the prop shows at once');
});
