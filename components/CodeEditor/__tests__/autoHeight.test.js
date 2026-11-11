/**
 * autoHeight.test.js — the editor box's auto height (../autoHeight.js), with fake animation
 * frames: one height per frame (the last wins), the hold while the fold cover is up (heights
 * only remembered, the last one applied on release), a frame already waiting when the hold
 * starts, dispose (a waiting frame cancelled and forgotten), and stop / resume (the reader
 * dragged the resize strip: a waiting frame is cancelled and heights are only remembered until a
 * double-click resumes; stop and hold each keep the box still until BOTH are over). Run with
 * `npm run test:shared`.
 * To change it: a new rule of ../autoHeight.js (a hold, a stop, a waiting frame) gets a test here, over
 * the fake frames.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { createAutoHeight } from '../autoHeight.js';

/** Fake requestAnimationFrame / cancelAnimationFrame: runFrame() runs the waiting callbacks. */
function fakeFrames() {
	const waiting = new Map();
	let nextId = 1;
	return {
		requestFrame(callback) {
			const id = nextId++;
			waiting.set(id, callback);
			return id;
		},
		cancelFrame(id) {
			waiting.delete(id);
		},
		runFrame() {
			const callbacks = [...waiting.values()];
			waiting.clear();
			for (const callback of callbacks) callback();
		},
		waitingCount() {
			return waiting.size;
		},
	};
}

/** An auto height over fake frames; `applied` lists every height given to the box. */
function setup() {
	const frames = fakeFrames();
	const applied = [];
	const auto = createAutoHeight({ setHeight: (px) => applied.push(px), requestFrame: frames.requestFrame, cancelFrame: frames.cancelFrame });
	return { frames, applied, auto };
}

test('a height is applied in the next frame, rounded; several in one frame make one change (the last)', () => {
	const { frames, applied, auto } = setup();
	auto.fit(200.4);
	auto.fit(310.6);
	assert.deepEqual(applied, [], 'nothing before the frame');
	assert.equal(frames.waitingCount(), 1, 'one frame for both');
	frames.runFrame();
	assert.deepEqual(applied, [311]);
});

test('while held, heights are only remembered; release applies the last one in the next frame', () => {
	const { frames, applied, auto } = setup();
	auto.hold();
	assert.equal(auto.isHeld(), true);
	auto.fit(900); // the unfolded code
	auto.fit(400); // the folds closed
	assert.equal(frames.waitingCount(), 0, 'no frame while held');
	auto.release();
	assert.equal(auto.isHeld(), false);
	frames.runFrame();
	assert.deepEqual(applied, [400]);
});

test('a frame already waiting when the hold starts applies nothing', () => {
	const { frames, applied, auto } = setup();
	auto.fit(900);
	auto.hold();
	frames.runFrame();
	assert.deepEqual(applied, []);
	auto.release();
	frames.runFrame();
	assert.deepEqual(applied, [900]);
});

test('release without a hold, or with no height yet, changes nothing', () => {
	const { frames, applied, auto } = setup();
	auto.release();
	assert.equal(frames.waitingCount(), 0);
	auto.hold();
	auto.release();
	frames.runFrame();
	assert.deepEqual(applied, [], 'no height was ever given');
});

test('dispose cancels a waiting frame and forgets it, so a later height still gets its frame', () => {
	const { frames, applied, auto } = setup();
	auto.fit(250);
	auto.dispose();
	assert.equal(frames.waitingCount(), 0);
	frames.runFrame();
	assert.deepEqual(applied, []);
	auto.fit(260);
	frames.runFrame();
	assert.deepEqual(applied, [260]);
});

test('stop cancels a waiting frame; from then on fit() only remembers the height', () => {
	const { frames, applied, auto } = setup();
	assert.equal(auto.isStopped(), false, 'not stopped at first');
	auto.fit(300);
	assert.equal(frames.waitingCount(), 1);
	auto.stop();
	assert.equal(auto.isStopped(), true);
	assert.equal(frames.waitingCount(), 0, 'the waiting frame is cancelled');
	frames.runFrame();
	assert.deepEqual(applied, [], 'the reader\'s height stays');
	auto.fit(420);
	auto.fit(450);
	assert.equal(frames.waitingCount(), 0, 'no frame while stopped');
	frames.runFrame();
	assert.deepEqual(applied, []);
});

test('a frame that slips past the cancel (already running) still applies nothing once stopped', () => {
	const frames = fakeFrames();
	const applied = [];
	const auto = createAutoHeight({ setHeight: (px) => applied.push(px), requestFrame: frames.requestFrame, cancelFrame: () => {} });
	auto.fit(300);
	auto.stop();
	frames.runFrame();
	assert.deepEqual(applied, []);
});

test('resume applies the last remembered height in the next frame, and fitting goes on after it', () => {
	const { frames, applied, auto } = setup();
	auto.fit(300);
	frames.runFrame();
	auto.stop();
	auto.fit(500);
	auto.fit(520.4);
	auto.resume();
	assert.equal(auto.isStopped(), false);
	assert.deepEqual(applied, [300], 'nothing before the frame');
	assert.equal(frames.waitingCount(), 1);
	frames.runFrame();
	assert.deepEqual(applied, [300, 520], 'the last one, rounded');
	auto.fit(540);
	frames.runFrame();
	assert.deepEqual(applied, [300, 520, 540], 'following the code again');
});

test('resume without a stop changes nothing; resume with no height yet applies nothing', () => {
	const { frames, applied, auto } = setup();
	auto.resume();
	assert.equal(frames.waitingCount(), 0, 'not stopped: no frame');
	auto.stop();
	auto.resume();
	frames.runFrame();
	assert.deepEqual(applied, [], 'no height was ever given');
});

test('stop twice and resume once: following the code again (stop is a switch, not a counter)', () => {
	const { frames, applied, auto } = setup();
	auto.stop();
	auto.stop();
	auto.fit(310);
	auto.resume();
	assert.equal(auto.isStopped(), false);
	frames.runFrame();
	assert.deepEqual(applied, [310]);
});

test('stopped during a hold: release does not apply (still stopped); resume then does', () => {
	const { frames, applied, auto } = setup();
	auto.hold();
	auto.stop();
	auto.fit(600);
	auto.release();
	assert.equal(auto.isHeld(), false);
	assert.equal(frames.waitingCount(), 0, 'the reader\'s height stays after the folds close');
	auto.resume();
	frames.runFrame();
	assert.deepEqual(applied, [600]);
});

test('held during a stop: resume does not apply (still held); release then does', () => {
	const { frames, applied, auto } = setup();
	auto.stop();
	auto.hold();
	auto.fit(700);
	auto.resume();
	assert.equal(auto.isStopped(), false);
	assert.equal(frames.waitingCount(), 0, 'the fold cover is still up');
	auto.release();
	frames.runFrame();
	assert.deepEqual(applied, [700]);
});

test('a stop while a release frame waits cancels it; dispose after a stop is harmless', () => {
	const { frames, applied, auto } = setup();
	auto.hold();
	auto.fit(800);
	auto.release();
	assert.equal(frames.waitingCount(), 1);
	auto.stop();
	assert.equal(frames.waitingCount(), 0);
	frames.runFrame();
	assert.deepEqual(applied, []);
	assert.doesNotThrow(() => auto.dispose());
	auto.resume();
	frames.runFrame();
	assert.deepEqual(applied, [800], 'resume after dispose still works');
});
