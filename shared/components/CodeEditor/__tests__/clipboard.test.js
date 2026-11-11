/**
 * clipboard.test.js — copyText (clipboard.js): the Clipboard API first, the textarea and
 * execCommand('copy') when it is refused, and false when both are. Run with `npm run test:shared`.
 * To change it: a new way to copy in ../clipboard.js gets a test here, both when it works and when it
 * is refused.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { copyText } from '../clipboard.js';

/** A tiny document: body, createElement('textarea'), execCommand, selection and focus. */
function fakeDocument({ execResult = true } = {}) {
	const appended = [];
	const doc = {
		executed: [],
		activeElement: { focused: 0, focus() { this.focused += 1; } },
		body: { appendChild: (node) => appended.push(node) },
		createElement: () => ({
			value: '',
			style: {},
			removed: false,
			setAttribute() {},
			select() {},
			remove() { this.removed = true; },
		}),
		execCommand(command) {
			doc.executed.push([command, appended.at(-1)?.value]);
			if (execResult instanceof Error) throw execResult;
			return execResult;
		},
		getSelection: () => null,
		appended,
	};
	return doc;
}

test('the Clipboard API is used first; the old way is not touched when it works', async () => {
	const written = [];
	const doc = fakeDocument();
	assert.equal(await copyText('print(1)', { clipboard: { writeText: async (text) => written.push(text) }, document: doc }), true);
	assert.deepEqual(written, ['print(1)']);
	assert.deepEqual(doc.executed, []);
});

test('a refused Clipboard API falls back to a textarea and execCommand("copy"), then cleans up', async () => {
	const doc = fakeDocument();
	const refused = { writeText: async () => { throw Object.assign(new Error('Write permission denied.'), { name: 'NotAllowedError' }); } };
	assert.equal(await copyText('[1, 4, 9]\n', { clipboard: refused, document: doc }), true);
	assert.deepEqual(doc.executed, [['copy', '[1, 4, 9]\n']]);
	assert.equal(doc.appended[0].removed, true, 'the textarea is removed again');
	assert.equal(doc.activeElement.focused, 1, 'the focus goes back where it was');
});

test('no Clipboard API at all: the old way alone', async () => {
	const doc = fakeDocument();
	assert.equal(await copyText('x', { clipboard: undefined, document: doc }), true);
});

test('both ways refused (or no document, as on the server): false', async () => {
	const refused = { writeText: async () => { throw new Error('denied'); } };
	assert.equal(await copyText('x', { clipboard: refused, document: fakeDocument({ execResult: false }) }), false);
	assert.equal(await copyText('x', { clipboard: refused, document: fakeDocument({ execResult: new Error('nope') }) }), false);
	assert.equal(await copyText('x', { clipboard: undefined, document: undefined }), false);
});
