/**
 * themeMenu.test.js — the header's Theme button and its menu (../ThemeMenu.jsx), rendered on the
 * server through this folder's module hooks (jsxHooks.js):
 *   - closed: one small icon button named "Editor theme" (aria-haspopup="menu", no
 *     aria-expanded and no aria-controls until it opens), a palette icon, in the header's tooltip wrapper
 *     with no aria-label of its own; no menu in the page; an empty families list draws nothing;
 *   - open (ThemeMenuList, without a portal: the server draws none): a menu labelled by its
 *     button and carrying the id its aria-controls names, one menuitemradio per family in the
 *     given order, only the current one
 *     aria-checked and showing the check mark; a current id no entry has checks none;
 *   - each entry: its label, its note ("Follows the site's light / dark switch" with two
 *     variants, "Always dark" with one, the family's own `note` instead when it has one), and
 *     an aria-hidden swatch with one box per variant, light first, in the variant's colours (a
 *     lone box marked with its mode, so it stands in its column);
 *   - a click on an entry hands its id to onPick (the element tree, called without a DOM);
 *   - every class ThemeMenu.jsx uses exists in ThemeMenu.module.css.
 * Picking, the focus and the menu's position need a browser: checked by hand where the editor
 * uses the menu. Run with `npm run test:shared`.
 * To change it: a new part of ../ThemeMenu.jsx gets a test here, rendered through the hooks; a new
 * class goes in ThemeMenu.module.css.
 */

import { register } from 'node:module';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

register('./jsxHooks.js', import.meta.url);

const { createElement } = await import('react');
const { renderToStaticMarkup } = await import('react-dom/server');
const { default: ThemeMenu, ThemeMenuList, WORDS, noteFor, orderedSwatches } = await import('../ThemeMenu.jsx');

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** Families in the shape the editor hands over (colours: the themes' editor background, text and keyword colours). */
const FAMILIES = Object.freeze([
	{
		id: 'vscode',
		label: 'VS Code',
		swatches: [
			{ mode: 'light', background: '#fffffe', foreground: '#000000', accent: '#0000ff' },
			{ mode: 'dark', background: '#1e1e1e', foreground: '#d4d4d4', accent: '#569cd6' },
		],
	},
	{
		id: 'github',
		label: 'GitHub',
		// given dark first: the swatch still draws light first
		swatches: [
			{ mode: 'dark', background: '#0d1117', foreground: '#e6edf3' },
			{ mode: 'light', background: '#ffffff', foreground: '#1f2328' },
		],
	},
	{ id: 'dracula', label: "Dracula (like the site's code blocks)", swatches: [{ mode: 'dark', background: '#282a36', foreground: '#f8f8f2', accent: '#ff79c6' }] },
	{ id: 'own-note', label: 'Own note', note: 'A note of its own', swatches: [{ mode: 'light', background: '#fdf6e3', foreground: '#586e75' }] },
]);

/**
 * A stand-in for the button the menu hangs from: MUI checks that it is an element with a size and
 * takes its document's body as the menu's container (unused without a portal); the server never
 * positions it.
 */
const FAKE_ANCHOR = Object.freeze({
	nodeType: 1,
	ownerDocument: { body: {} },
	getBoundingClientRect: () => ({ top: 10, left: 10, right: 40, bottom: 40, width: 30, height: 30, x: 10, y: 10 }),
});

/** Markup without MUI's emotion <style> tags and generated css-… classes (they are not under test). */
function render(element) {
	return renderToStaticMarkup(element)
		.replace(/<style[^>]*>[\s\S]*?<\/style>/g, '')
		.replace(/ ?css-[\w-]+/g, '');
}

/** The closed button, as the header draws it. */
function renderButton(props = {}) {
	return render(createElement(ThemeMenu, { families: FAMILIES, current: 'vscode', onChange: () => {}, ...props }));
}

/** The open menu (no portal), with `current` checked. */
function renderOpenMenu(current = 'vscode', families = FAMILIES) {
	return render(
		createElement(ThemeMenuList, {
			anchorEl: FAKE_ANCHOR,
			open: true,
			onClose: () => {},
			families,
			current,
			onPick: () => {},
			menuId: 'theme-menu',
			buttonId: 'theme-button',
			disablePortal: true,
		}),
	);
}

/** Each menu entry's markup (an <li role="menuitemradio"> up to its closing tag), in order. */
function entriesOf(html) {
	return [...html.matchAll(/<li[^>]*role="menuitemradio"[^>]*>[\s\S]*?<\/li>/g)].map((match) => match[0]);
}

/** The opening tag of the first element in `html` whose tag matches `pattern`. */
function tagOf(html, pattern) {
	const match = html.match(pattern);
	assert.ok(match, `found ${pattern}`);
	return match[0];
}

test('closed: one icon button named "Editor theme" that opens a menu, with a palette icon', () => {
	const html = renderButton();
	const button = tagOf(html, /<button[^>]*>/);
	assert.equal([...html.matchAll(/<button/g)].length, 1, 'one button');
	assert.match(button, /MuiIconButton-root/);
	assert.match(button, /MuiIconButton-sizeSmall/, 'small, like every header icon button (the placeholder space fits it)');
	assert.match(button, new RegExp(`aria-label="${WORDS.button}"`));
	assert.match(button, /aria-haspopup="menu"/);
	assert.doesNotMatch(button, /aria-expanded=/, 'aria-expanded only while open (MUI\'s menu pattern)');
	assert.doesNotMatch(button, /aria-controls=/, 'nothing to control while closed');
	assert.match(html, /data-testid="PaletteOutlinedIcon"/);
});

test('closed: the button sits in the header\'s tooltip wrapper, which has no aria-label; no menu yet', () => {
	const html = renderButton();
	const wrapper = tagOf(html, /<span[^>]*class="tooltipAnchor"[^>]*>/);
	assert.doesNotMatch(wrapper, /aria-label/);
	assert.doesNotMatch(html, /role="menu"/);
	assert.doesNotMatch(html, /menuitemradio/);
});

test('an empty families list draws nothing', () => {
	assert.equal(renderButton({ families: [] }), '');
});

test('open: a menu labelled by its button, one menuitemradio per family, in order', () => {
	const html = renderOpenMenu();
	const menu = tagOf(html, /<ul[^>]*role="menu"[^>]*>/);
	assert.match(menu, /aria-labelledby="theme-button"/);
	assert.match(menu, /id="theme-menu"/, 'the id the button\'s aria-controls names is on the menu itself');
	assert.equal([...html.matchAll(/id="theme-menu"/g)].length, 1);
	const entries = entriesOf(html);
	assert.equal(entries.length, FAMILIES.length);
	FAMILIES.forEach((family, index) => {
		const label = family.label.replace(/'/g, '&#x27;');
		assert.ok(entries[index].includes(label), `entry ${index} is ${family.label}`);
	});
});

test('open: only the current family is checked, and only it shows the check mark', () => {
	const entries = entriesOf(renderOpenMenu('github'));
	const checked = entries.map((entry) => /aria-checked="true"/.test(entry));
	assert.deepEqual(checked, [false, true, false, false]);
	for (const entry of entries) assert.match(entry, /aria-checked="(true|false)"/, 'every entry says whether it is checked');
	const marks = entries.map((entry) => /data-testid="CheckIcon"/.test(entry));
	assert.deepEqual(marks, checked);
});

test('open: a current id no family has checks none', () => {
	const entries = entriesOf(renderOpenMenu('gone'));
	assert.ok(entries.every((entry) => /aria-checked="false"/.test(entry)));
	assert.ok(entries.every((entry) => !/data-testid="CheckIcon"/.test(entry)));
});

test('each entry\'s note: follows the site with two variants, "Always …" with one, else its own', () => {
	const entries = entriesOf(renderOpenMenu());
	const followsSite = WORDS.followsSite.replace(/'/g, '&#x27;');
	assert.ok(entries[0].includes(followsSite));
	assert.ok(entries[1].includes(followsSite));
	assert.ok(entries[2].includes(WORDS.alwaysDark));
	assert.ok(entries[3].includes('A note of its own'));
	assert.ok(!entries[3].includes(WORDS.alwaysLight), 'the family\'s own note replaces the derived one');
});

test('each entry\'s swatch: aria-hidden, one box per variant, light first, in the variant\'s colours', () => {
	const entries = entriesOf(renderOpenMenu());
	const boxesOf = (entry) => [...entry.matchAll(/<span class="swatchPart" data-mode="(\w+)" style="([^"]*)"/g)].map(([, mode, style]) => ({ mode, style }));
	for (const entry of entries) assert.match(entry, /<span class="swatchSlot" aria-hidden="true"[^>]*><span class="swatch">/);
	assert.doesNotMatch(entries[0], /data-only=/, 'two variants: the slot is full');
	assert.match(entries[2], /<span class="swatchSlot" aria-hidden="true" data-only="dark">/, 'a lone dark box stands in the dark column');
	assert.match(entries[3], /data-only="light"/);

	const [vscode, github, dracula] = entries.map(boxesOf);
	assert.deepEqual(vscode.map((box) => box.mode), ['light', 'dark']);
	assert.match(vscode[0].style, /background-color:#fffffe;color:#000000/);
	assert.match(vscode[1].style, /background-color:#1e1e1e;color:#d4d4d4/);
	assert.deepEqual(github.map((box) => box.mode), ['light', 'dark'], 'light first whatever the order given');
	assert.match(github[0].style, /background-color:#ffffff/);
	assert.deepEqual(dracula.map((box) => box.mode), ['dark']);
});

test('the swatch\'s sample: "Aa" (generated text), the "a" in the accent colour when the variant gives one', () => {
	const entries = entriesOf(renderOpenMenu());
	assert.match(entries[2], /<span class="sampleLetter" data-letter="A"><\/span><span class="sampleLetter" data-letter="a" style="color:#ff79c6"><\/span>/, 'Dracula: its pink accent');
	assert.match(entries[1], /<span class="sampleLetter" data-letter="A"><\/span><span class="sampleLetter" data-letter="a"><\/span>/, 'GitHub here: no accent, both letters in the text colour');
	const stylesheet = readFileSync(path.join(HERE, '../ThemeMenu.module.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
	assert.match(stylesheet, /\.sampleLetter::before \{\s*content: attr\(data-letter\);/, 'the stylesheet draws the letters');
	assert.equal(WORDS.sample, 'Aa');
});

/** An entry's text as innerText reads it (what MUI's type-ahead compares): its text nodes, tags dropped (generated text is none). */
function textOf(entry) {
	return entry
		.replace(/<[^>]+>/g, ' ')
		.replace(/&#x27;/g, "'")
		.replace(/\s+/g, ' ')
		.trim();
}

test("type-ahead: each entry's text starts with its label (MUI's MenuList moves to the entry whose innerText starts with the typed letters)", () => {
	const entries = entriesOf(renderOpenMenu());
	entries.forEach((entry, index) => {
		const text = textOf(entry);
		assert.ok(text.startsWith(FAMILIES[index].label), `entry ${index}: "${text}" starts with "${FAMILIES[index].label}" (no swatch letters before it)`);
	});
	const firstLetters = entries.map((entry) => textOf(entry)[0].toLowerCase());
	assert.deepEqual(firstLetters, FAMILIES.map((family) => family.label[0].toLowerCase()), 'typing a label\'s first letter can reach it');
});

test('a click on an entry hands its id to onPick', () => {
	const picked = [];
	const menu = ThemeMenuList({ anchorEl: null, open: true, onClose: () => {}, families: FAMILIES, current: 'vscode', onPick: (id) => picked.push(id), menuId: 'm', buttonId: 'b' });
	const items = [].concat(menu.props.children);
	assert.equal(items.length, FAMILIES.length);
	for (const element of items) {
		const ItemComponent = element.type;
		const menuItem = ItemComponent(element.props);
		menuItem.props.onClick();
	}
	assert.deepEqual(picked, FAMILIES.map((family) => family.id));
});

test('noteFor and orderedSwatches on their own', () => {
	assert.equal(noteFor({ swatches: [{ mode: 'light' }, { mode: 'dark' }] }), WORDS.followsSite);
	assert.equal(noteFor({ swatches: [{ mode: 'light' }] }), WORDS.alwaysLight);
	assert.equal(noteFor({ swatches: [{ mode: 'dark' }] }), WORDS.alwaysDark);
	assert.equal(noteFor({ note: 'Own', swatches: [{ mode: 'dark' }] }), 'Own');
	assert.equal(noteFor({ swatches: [] }), '');
	assert.equal(noteFor({}), '');
	assert.equal(noteFor({ swatches: [{ mode: 'sepia' }] }), '', 'an unknown mode says nothing rather than something wrong');
	assert.deepEqual(orderedSwatches([{ mode: 'dark' }, { mode: 'other' }, { mode: 'light' }]).map((swatch) => swatch.mode), ['light', 'dark', 'other']);
	assert.deepEqual(orderedSwatches(), []);
});

test('every class ThemeMenu.jsx uses exists in ThemeMenu.module.css', () => {
	const component = readFileSync(path.join(HERE, '../ThemeMenu.jsx'), 'utf8');
	const stylesheet = readFileSync(path.join(HERE, '../ThemeMenu.module.css'), 'utf8');
	const used = new Set([...component.matchAll(/menuStyles\.(\w+)/g)].map((match) => match[1]));
	const defined = new Set([...stylesheet.matchAll(/\.([A-Za-z_][\w-]*)\b/g)].map((match) => match[1]));
	assert.ok(used.size > 0);
	for (const name of used) assert.ok(defined.has(name), `ThemeMenu.jsx uses menuStyles.${name}, which ThemeMenu.module.css does not define`);
});
