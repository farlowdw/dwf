/**
 * <DropDownIC title="…">…</DropDownIC> — an inline dropdown for the notes, after Interview
 * Cake's: in the middle of a sentence a phrase with a dashed underline and a small blue ↴ (the
 * same text glyph, placed as they place it); a click opens a box right there, in the
 * paragraph — the words before it stay above, the
 * words after it carry on below — and closes it again. The box holds any MDX (an imported
 * partial with paragraphs, code blocks and maths, or inline text), and the title can hold
 * inline markdown and maths.
 *
 * IN A NOTE (a .md or .mdx file), with its import at the top:
 *     import DropDownIC from '@site/src/components/DropDownIC';
 *     …the <DropDownIC title="modulus operator ($\%$)">the remainder after dividing</DropDownIC>. More…
 *     …as <DropDownIC title="this partial shows"><Modulus /></DropDownIC> — with, at the top,
 *     import Modulus from './_partials/modulus.mdx';
 *   The title is read as the page's own text would be (mdx.cjs next to this file: maths through
 *   remark-math + rehype-katex at build time, emphasis, code spans) and arrives here as a child
 *   <DropDownIC.Title>. A body of blocks (paragraphs, lists, code) in the middle of a sentence:
 *   end a line of words with the opening tag, start a line with the closing tag and the words
 *   that follow, the body between (mdx.cjs > preprocessDropDownIc rewrites it for MDX and the
 *   paragraph is joined back). A body in a partial works anywhere. With a blank line around
 *   its tags the dropdown is a paragraph of its own (`block`). The README has every form.
 *
 * FROM JSX  <DropDownIC title={<>any nodes</>}>body</DropDownIC> — or a child
 *   <DropDownIC.Title>…</DropDownIC.Title>, which wins over the prop. Put it in a <div>, never
 *   in a <p> (the box is a block; in MDX mdx.cjs takes care of the paragraph).
 *
 * PROPS
 *   title        the underlined words: a string, or any React nodes
 *   label        the trigger's accessible name, when the words alone would not do (the plugin
 *                sets it for a title with maths: a screen reader gets nothing from KaTeX's
 *                markup, so the name carries each formula's TeX as written)
 *   children     the body; a <DropDownIC.Title> child among them is the title
 *   block        draw it as a paragraph of its own (set by the rehype plugin when the element
 *                is a block in the MDX; the trigger then sits alone on its line)
 *   defaultOpen  start open (false)
 *
 * HOW IT IS BUILT  The trigger is a span[role=button] (a <button> is inline-block and could
 *   not wrap over two lines like text); a click, Enter or Space toggles it (not a held key's
 *   repeats, not the second click of a double-click when it selected the words — a quick
 *   second click that selected nothing reverses the motion — not a key or click meant for a
 *   link someone put in a JSX title). The box is a <div> after the trigger,
 *   display:none while closed (so a closed dropdown never breaks its line, and its contents
 *   are out of the tab order and the accessibility tree — `inert` too, while it closes). The
 *   arrow is tied to the title's last word (withArrow: the two in a span that never wraps), so
 *   it cannot drop to the next line alone. The server renders the closed state, so hydration
 *   matches and nothing flashes. When the box opens, a `resize` event is sent to the window:
 *   Docusaurus's code blocks measure whether they scroll (their "Toggle word wrap" button) at
 *   mount and on resize only, and inside a closed box they measured nothing.
 *
 * THE MOTION  Four phases (PHASE). Opening is two steps so that the box slides instead of
 *   appearing: `opening` displays the panel at no height (its grid row at 0fr), then a layout
 *   effect makes the browser compute that state (flushLayout) and moves to `open`, where the
 *   row is 1fr — a CSS transition carries it there (styles.module.css). Closing moves to
 *   `closing`, where the row is 0fr again; when that transition ends (the panel's
 *   transitionend for grid-template-rows, or the stylesheet's duration plus CLOSE_GRACE_MS
 *   when no event comes — motion off, an older browser) the panel is `closed`, display:none —
 *   written to the DOM inside the transitionend event itself (flushSync), so the words after
 *   the box come back beside the title in the very frame the box reaches nothing, not one
 *   frame later.
 *   A click during a move reverses it from wherever it is. Nothing is measured, so a box whose
 *   contents change (a nested dropdown, an image) keeps up.
 *
 * ON A SITE  This folder is the whole component. A site reaches it through a plain re-export
 *   stub, src/components/DropDownIC/index.jsx (a wrapper would break the plugin's
 *   <DropDownIC.Title>). The preprocessor (markdown.preprocessor, for the mid-sentence form) and
 *   the two plugins of mdx.cjs reach the site's docusaurus.config.js through
 *   shared/wiring/index.cjs (mdx.cjs's header shows the lines; remark-math + rehype-katex only
 *   if titles are to hold maths).
 *   It needs React 18 or 19 and Docusaurus 3 (the `@site` alias, CSS modules, Infima's
 *   variables — styles.module.css falls back to Infima's colours where the shared tokens are
 *   missing) and no npm package of its own; `inert` is set on the element in an effect and the
 *   layout effect is skipped on the server, because React 18 would otherwise drop the one and
 *   warn about the other. The tests travel with the folder (__tests__: their own JSX loader; the
 *   maths cases skip themselves where remark-math and rehype-katex are not installed). The
 *   README next to this file says the rest.
 *
 * HOW TO CHANGE IT  The look and the timing: styles.module.css (its header lists the knobs).
 *   The keys that toggle: TOGGLE_KEYS. The arrow's character: ARROW_GLYPH (its size, place
 *   and colour are CSS: .arrow). The MDX side (titles with maths, the paragraph that holds
 *   it): mdx.cjs. Tests: __tests__ (`npm run test:shared`).
 */

import React, { Children, Fragment, isValidElement, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import styles from './styles.module.css';

/** The class names that apply, joined (so the file needs no helper package). */
const classes = (...names) => names.filter(Boolean).join(' ');

/** A layout effect in the browser; on the server (React 18 warns about useLayoutEffect there) an effect that never runs. */
const useBrowserLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;


/** Keys that open / close the dropdown when the trigger has focus (Space must not scroll the page). */
const TOGGLE_KEYS = ['Enter', ' '];

/** The panel's phases (see THE MOTION in the file comment). */
const PHASE = Object.freeze({ closed: 'closed', opening: 'opening', open: 'open', closing: 'closing' });

/** Added to the stylesheet's close duration before a closing panel is hidden without a transitionend. */
const CLOSE_GRACE_MS = 50;

/** The transitioned property whose end means the panel has closed. */
const ROW_PROPERTY = 'grid-template-rows';

/** Sent to the window when the box opens (see HOW IT IS BUILT). */
const OPENED_EVENT = 'resize';

/** The arrow is Interview Cake's: the text glyph ↴ (RIGHTWARDS ARROW WITH CORNER DOWNWARDS, U+21B4). */
const ARROW_GLYPH = '\u21B4';

/**
 * The arrow, exactly as Interview Cake draws it: the ↴ glyph as text (so it takes the shape
 * and weight of the font the device gives it, like the one you can paste), at 0.8 of the
 * text's size, aligned to the top of the line and pulled left over the last letter
 * (styles.module.css > .arrow has the geometry and the colour, the site's link blue).
 */
function Arrow() {
	return (
		<span className={styles.arrow} aria-hidden="true">
			{ARROW_GLYPH}
		</span>
	);
}

/**
 * The title's marker element: <DropDownIC.Title>words</DropDownIC.Title> among the children
 * (what mdx.cjs makes of `title="…"`). Rendered on its own, it is just its words.
 */
function Title({ children }) {
	return children;
}

const isText = (part) => typeof part === 'string' || typeof part === 'number';
const isFragment = (part) => isValidElement(part) && part.type === Fragment;

/**
 * The title's nodes with the arrow attached to the last word: the words before it in one
 * underlined span, then the last word (or the last node, when it is not text — a formula, a
 * <strong>) underlined too and the arrow, in a span that never wraps, so a line break can come
 * before them but never between them. (A WORD JOINER before an inline SVG does not stop
 * Chrome from breaking there.) A trailing fragment (a JSX title) is opened up first.
 */
function withArrow(heading) {
	const parts = Children.toArray(heading);
	for (;;) {
		const last = parts[parts.length - 1];
		if (isFragment(last)) parts.splice(parts.length - 1, 1, ...Children.toArray(last.props.children));
		else if (parts.length && isText(last) && !String(last).trim()) parts.pop();
		else break;
	}
	const last = parts.pop();
	let tail = last;
	if (isText(last)) {
		const text = String(last).trimEnd();
		const cut = text.search(/\S+$/);
		parts.push(text.slice(0, cut));
		tail = text.slice(cut);
	}
	const before = parts.filter((part) => !(isText(part) && String(part) === ''));
	return [
		before.length ? (
			<span key="words" className={styles.words}>
				{before}
			</span>
		) : null,
		<span key="tail" className={styles.tail}>
			<span className={styles.words}>{tail}</span>
			<Arrow />
		</span>,
	];
}

/** Splits the children into the title (a Title child, else the prop) and the body. */
function titleAndBody(title, children) {
	const all = Children.toArray(children);
	const marker = all.find((child) => isValidElement(child) && child.type === Title);
	return {
		heading: marker ? marker.props.children : title,
		body: all.filter((child) => !(isValidElement(child) && child.type === Title)),
	};
}

/** The next phase after a click: closed → opening, opening / open → closing, closing → open. */
function toggled(phase) {
	if (phase === PHASE.closed) return PHASE.opening;
	if (phase === PHASE.closing) return PHASE.open;
	return PHASE.closing;
}

/** Makes the browser compute the element's current style and layout (so the next change is a transition). */
function flushLayout(element) {
	if (element) element.getBoundingClientRect();
}

/** '0.24s' / '240ms' / '0.24s, 0.24s' → the longest, in ms (0 when there is no transition). */
function longestDurationMs(list) {
	let longest = 0;
	for (const entry of String(list || '').split(',')) {
		const text = entry.trim();
		const number = Number.parseFloat(text);
		if (Number.isNaN(number)) continue;
		const ms = text.endsWith('ms') ? number : number * 1000;
		if (ms > longest) longest = ms;
	}
	return longest;
}

/** How long the stylesheet gives the panel to close, read from the panel itself. */
function closeDurationMs(panel) {
	if (!panel || typeof window === 'undefined') return 0;
	return longestDurationMs(window.getComputedStyle(panel).transitionDuration);
}

/** Did the click leave words selected (a double-click selects the word under it)? */
function selectedSomething() {
	const selection = typeof window !== 'undefined' && window.getSelection ? window.getSelection() : null;
	return Boolean(selection && !selection.isCollapsed);
}

/** A click or key that lands on a link inside the trigger (a JSX title's) is the link's, not ours. */
function onLinkInside(event) {
	const link = typeof event.target.closest === 'function' ? event.target.closest('a') : null;
	return Boolean(link && event.currentTarget.contains(link));
}

export default function DropDownIC({ title, label, block = false, defaultOpen = false, children }) {
	const [phase, setPhase] = useState(defaultOpen ? PHASE.open : PHASE.closed);
	const panelRef = useRef(null);
	const panelId = useId();
	const { heading, body } = titleAndBody(title, children);

	const expanded = phase === PHASE.opening || phase === PHASE.open;
	const shown = phase !== PHASE.closed;

	// Opening, step two: the panel is displayed at 0fr; have that computed, then let it grow.
	useBrowserLayoutEffect(() => {
		if (phase !== PHASE.opening) return;
		flushLayout(panelRef.current);
		setPhase(PHASE.open);
	}, [phase]);

	// Open: tell the code blocks inside to measure themselves (see HOW IT IS BUILT).
	useEffect(() => {
		if (phase === PHASE.open) window.dispatchEvent(new Event(OPENED_EVENT));
	}, [phase]);

	// A closed or closing panel is inert: set on the element itself, since React 18 drops a boolean
	// `inert` prop and React 19 warns about a string one (a closed panel is display:none anyway,
	// so the server's markup needs nothing).
	useEffect(() => {
		const panel = panelRef.current;
		if (!panel) return;
		if ('inert' in panel) panel.inert = !expanded;
		else panel.toggleAttribute('inert', !expanded);
	}, [expanded]);

	// Closing: hide the panel once its row has shrunk — at transitionend, or after the
	// stylesheet's duration when no such event comes.
	useEffect(() => {
		if (phase !== PHASE.closing) return undefined;
		const wait = closeDurationMs(panelRef.current);
		if (wait === 0) {
			setPhase(PHASE.closed);
			return undefined;
		}
		const timer = setTimeout(() => setPhase((was) => (was === PHASE.closing ? PHASE.closed : was)), wait + CLOSE_GRACE_MS);
		return () => clearTimeout(timer);
	}, [phase]);

	const toggle = () => setPhase(toggled);

	const onClick = (event) => {
		if (onLinkInside(event)) return; // a link's own click (a JSX title's)
		if (event.detail > 1 && selectedSomething()) return; // the second click of a double-click that selected the words
		toggle();
	};

	const onKeyDown = (event) => {
		if (!TOGGLE_KEYS.includes(event.key) || event.altKey || event.ctrlKey || event.metaKey) return;
		if (event.target !== event.currentTarget) return; // a key pressed on something focusable inside (a JSX title's link)
		event.preventDefault(); // every keydown, the repeats of a held key included: Space must never scroll the page
		if (event.repeat) return;
		toggle();
	};

	const onTransitionEnd = (event) => {
		if (event.target !== panelRef.current || event.propertyName !== ROW_PROPERTY) return;
		// Synchronously: the hide must paint in this frame, with the row's last frame (see THE MOTION).
		flushSync(() => setPhase((was) => (was === PHASE.closing ? PHASE.closed : was)));
	};

	const trigger = (
		<span
			className={classes(styles.trigger, expanded && styles.triggerOpen)}
			role="button"
			tabIndex={0}
			aria-label={label || undefined}
			aria-expanded={expanded}
			aria-controls={panelId}
			onClick={onClick}
			onKeyDown={onKeyDown}>
			<span className={styles.title}>{withArrow(heading)}</span>
		</span>
	);

	const panel = (
		<div
			id={panelId}
			ref={panelRef}
			className={classes(styles.panel, shown && styles.shown, phase === PHASE.open && styles.open)}
			onTransitionEnd={onTransitionEnd}>
			<div className={styles.clip}>
				<div className={styles.box}>{body}</div>
			</div>
		</div>
	);

	if (block) {
		return (
			<div className={styles.block}>
				{trigger}
				{panel}
			</div>
		);
	}
	return (
		<>
			{trigger}
			{panel}
		</>
	);
}

DropDownIC.Title = Title;

export { Title as DropDownICTitle, CLOSE_GRACE_MS, OPENED_EVENT, PHASE, TOGGLE_KEYS, longestDurationMs, toggled, withArrow };
