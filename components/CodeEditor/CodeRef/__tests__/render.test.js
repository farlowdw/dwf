/**
 * render.test.js — <CodeRef> (../index.jsx) rendered on the server through the editor folder's
 * JSX hooks (../../__tests__/jsxHooks.js), as the site renders every page at build time:
 *   - a reference is a span[role=button] in the tab order, with its words, a tooltip saying
 *     what the click does, and aria-controls naming the editor's element ('code-editor-<id>');
 *   - without children it names its target ("lines 10–12", "step 2", "the code editor");
 *   - a `to` that names no editor: the words as plain text, and one console warning (once,
 *     however often it renders); a broken line spec still renders a working reference, and
 *     the line spec parser's warnings come out at render (the build log shows them);
 *   - the keys that activate it (Enter and Space, never with Alt, Ctrl or ⌘);
 *   - the folder's files: every relative import names its file exactly (the folder is
 *     "type": "module"), every styles.<class> used exists in styles.module.css, no inline
 *     <style> and no third-party host.
 * The click itself (scroll, wait, request) is goToEditor.test.js; a real click and the keys need
 * a browser: they are checked by hand on the built site. Run with `npm run test:shared`.
 * To change it: a new prop or key of ../index.jsx gets a test here, rendered through the hooks.
 */

import { register } from 'node:module';
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

register('../../__tests__/jsxHooks.js', import.meta.url);

const { createElement } = await import('react');
const { renderToStaticMarkup } = await import('react-dom/server');
const { default: CodeRef, ACTIVATION_KEYS, isActivationKey } = await import('../index.jsx');

const FOLDER = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** The component rendered to markup. */
function render(props, ...children) {
	return renderToStaticMarkup(createElement(CodeRef, props, ...children));
}

/** The component's source files (not the tests). */
function sourceFiles() {
	return readdirSync(FOLDER)
		.filter((name) => /\.(js|jsx)$/.test(name))
		.map((name) => path.join(FOLDER, name));
}

test('a reference: a span[role=button] in the tab order, with its words, its tooltip and the editor it controls', () => {
	const html = render({ to: 'two-sum', lines: '10-12' }, 'the inner loop');
	assert.equal(
		html,
		'<span class="reference" role="button" tabindex="0" title="Show lines 10–12 in the code editor" aria-controls="code-editor-two-sum">the inner loop</span>',
	);
});

test('a step and a scroll-only reference have their own tooltips', () => {
	assert.match(render({ to: 'two-sum', step: 2 }, 'the second step'), /title="Go to step 2 in the code editor"/);
	assert.match(render({ to: 'two-sum' }, 'the editor'), /title="Go to the code editor"/);
});

test('without children it names its target', () => {
	assert.match(render({ to: 'two-sum', lines: '3-5,8' }), />lines 3–5, 8<\/span>$/);
	assert.match(render({ to: 'two-sum', lines: 4 }), />line 4<\/span>$/);
	assert.match(render({ to: 'two-sum', step: '3' }), />step 3<\/span>$/);
	assert.match(render({ to: 'two-sum' }), />the code editor<\/span>$/);
});

test('children may be any nodes (inline code among them)', () => {
	const html = render({ to: 'two-sum', lines: 7 }, 'the ', createElement('code', null, 'for'), ' loop');
	assert.match(html, /aria-controls="code-editor-two-sum">the <code>for<\/code> loop<\/span>$/);
});

test('a `to` that names no editor: the words as plain text, and one warning however often it renders', (t) => {
	const warn = t.mock.method(console, 'warn', () => {});
	const props = { to: 'not an id', lines: '2' };
	assert.equal(render(props, 'these words'), 'these words');
	assert.equal(render(props, 'these words'), 'these words');
	assert.equal(warn.mock.callCount(), 1);
	assert.match(warn.mock.calls[0].arguments[0], /^CodeRef: to="not an id" names no editor/);
});

test('a broken line spec: a warning, and still a reference that brings the editor into view', (t) => {
	const warn = t.mock.method(console, 'warn', () => {});
	const html = render({ to: 'render-test-broken-lines', lines: '' }, 'here');
	assert.match(html, /role="button"/);
	assert.match(html, /title="Go to the code editor"/);
	assert.equal(warn.mock.callCount(), 1);
	assert.match(warn.mock.calls[0].arguments[0], /^CodeRef: lines="" names no line/);
});

test("a line spec's warnings come out at render (so the build log shows them), once each", (t) => {
	const warn = t.mock.method(console, 'warn', () => {});
	const props = { to: 'render-test-bad-part', lines: '3-x, 7' };
	const html = render(props, 'here');
	render(props, 'here');
	assert.match(html, /title="Show line 7 in the code editor"/);
	assert.equal(warn.mock.callCount(), 1);
	assert.match(warn.mock.calls[0].arguments[0], /^CodeRef lines: '3-x' was skipped/);
});

test('the keys that activate it: Enter and Space, never with Alt, Ctrl or ⌘', () => {
	assert.deepEqual([...ACTIVATION_KEYS], ['Enter', ' ']);
	assert.equal(isActivationKey({ key: 'Enter' }), true);
	assert.equal(isActivationKey({ key: ' ' }), true);
	assert.equal(isActivationKey({ key: 'a' }), false);
	assert.equal(isActivationKey({ key: 'Tab' }), false);
	for (const modifier of ['altKey', 'ctrlKey', 'metaKey']) {
		assert.equal(isActivationKey({ key: 'Enter', [modifier]: true }), false, modifier);
	}
	assert.equal(isActivationKey({ key: 'Enter', shiftKey: true }), true, 'Shift does not stop it');
	const words = {};
	assert.equal(isActivationKey({ key: 'Enter', target: words, currentTarget: words }), true, 'on the words');
	assert.equal(isActivationKey({ key: 'Enter', target: {}, currentTarget: words }), false, 'on a link inside the words');
});

test('every relative import of the folder names its file exactly (the folder is "type": "module")', () => {
	const files = sourceFiles();
	assert.ok(files.length >= 3, 'index.jsx, reference.js, goToEditor.js');
	for (const file of files) {
		const source = readFileSync(file, 'utf8');
		for (const match of source.matchAll(/^import [^;]*? from '(\.[^']+)';$/gm)) {
			assert.ok(existsSync(path.resolve(path.dirname(file), match[1])), `${path.basename(file)} imports '${match[1]}', which is not a file`);
		}
	}
});

test('every styles.<class> the component uses is defined in styles.module.css', () => {
	const css = readFileSync(path.join(FOLDER, 'styles.module.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
	const defined = new Set([...css.matchAll(/\.([A-Za-z_][\w-]*)/g)].map((match) => match[1]));
	// every `styles.name`, but not the file name `styles.module.css` (in the import and the comments)
	const used = [...readFileSync(path.join(FOLDER, 'index.jsx'), 'utf8').matchAll(/\bstyles\.(?!module\.css)([A-Za-z_]\w*)/g)].map((match) => match[1]);
	assert.ok(used.length > 0, 'the component uses its stylesheet');
	for (const name of used) assert.ok(defined.has(name), `index.jsx uses styles.${name}, which styles.module.css does not define`);
});

test('no inline <style> tags and no third-party hosts in the component', () => {
	for (const file of sourceFiles()) {
		const source = readFileSync(file, 'utf8');
		assert.doesNotMatch(source, /<style[\s>]/, `${path.basename(file)}: styles belong in styles.module.css`);
		assert.doesNotMatch(source, /https?:\/\/(?!localhost)[a-z0-9.-]+\.(com|net|org|io|dev)\b/i, `${path.basename(file)}: no third-party URLs`);
	}
});
