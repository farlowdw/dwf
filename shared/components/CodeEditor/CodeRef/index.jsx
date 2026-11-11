/**
 * <CodeRef to="…" lines="…">words</CodeRef> — a phrase in the prose that points into a code
 * editor on the same page: the words look like a link (the link blue, a dotted underline), and
 * a click (or Enter / Space) brings the editor into view and makes it show those lines —
 * revealed, unfolded if folded, and briefly flashed — or go to one of its steps.
 *
 * IN A NOTE (a .md or .mdx file), with its import at the top (an explicit import, like
 * <DropDownIC>: it is not registered for every page):
 *     import CodeRef from '@site/src/components/CodeEditor/CodeRef';
 *     <CodeEditor id="two-sum" initialCode={snippet} steps={…} />
 *     The <CodeRef to="two-sum" lines="10-12">inner loop</CodeRef> checks each pair once;
 *     <CodeRef to="two-sum" step={2}>the second step</CodeRef> shows why the map helps.
 *     <CodeRef to="two-sum" lines="4" />      (no words: it shows "line 4")
 *     <CodeRef to="two-sum">the editor</CodeRef>   (neither: it only brings the editor into view)
 *   README.md beside this file has every form and the rules.
 *
 * PROPS
 *   to        the editor's id (<CodeEditor id="two-sum">); required
 *   lines     a line spec, as the editor's `highlight` takes it: 5, "10-12", "3-5, 8", [3, [5, 7]]
 *             (the lines the reader sees, numbered from 1)
 *   step      a step's number as the reader sees it ("Step 2 of 4" → step={2})
 *   children  the words; without any, the reference names its target ("lines 10–12", "step 2")
 *   Both lines and step: the step wins (with a console warning). A `to` that cannot be an id
 *   (missing, blank, or with a space): the words are plain text, with a warning at render
 *   (reference.js > WARNINGS.badTo). A well-formed `to` that matches no editor on the page still
 *   looks and acts like a link: only a click logs a warning (goToEditor.js > WARNINGS.noEditor),
 *   so a typo in an id does not show up in the build log.
 *
 * HOW IT IS BUILT  The words are a span[role=button] (a <button> is inline-block and could not
 *   wrap over two lines like text — <DropDownIC>'s trigger is built the same way); a click,
 *   Enter or Space on the words themselves (not a held key's repeats, not a key pressed on a
 *   link inside them) runs goToEditor.js: the scroll, the wait for it to settle, then the
 *   request through the page registry (shared/components/CodeEditor/lib/registry), which delivers it when the
 *   editor is ready — at once, or once Monaco has loaded; an editor that loads only near the
 *   viewport (loadWhenVisible) is told to mount at once. The props are read by reference.js
 *   (the line spec into ranges, by the run library's parser). The tooltip (title) says what
 *   the click does ("Show lines 10–12 in the code editor"), which screen readers give as the
 *   button's description, and aria-controls names the editor's element. The focus stays on
 *   the words, so the reader carries on reading from there; the editor says what it did in
 *   its own status region ("Showing lines 10 to 12 of main.py.": useGuided.js). A <CodeRef>
 *   that unmounts (the reader left the page) withdraws a request that still waits. The server
 *   renders the same markup, so hydration matches.
 *
 * HOW TO CHANGE IT  The look: styles.module.css (its header lists the knobs). The words and
 *   the warnings: reference.js (WORDS, WARNINGS) and goToEditor.js (WARNINGS). Where the editor
 *   lands and how long the click waits for the scroll: goToEditor.js. The keys that activate it:
 *   ACTIVATION_KEYS. What the editor does with a request: its handle in
 *   shared/components/CodeEditor/useGuided.js. Tests: __tests__ (`npm run test:shared`).
 */

import React, { useEffect, useRef } from 'react';
import { editorDomId } from '../lib/registry/index.js';
import { goToEditor } from './goToEditor.js';
import { readReference } from './reference.js';
import styles from './styles.module.css';

/** Keys that activate the reference when it has the focus (Space must not scroll the page). */
const ACTIVATION_KEYS = Object.freeze(['Enter', ' ']);

/** What the cancel ref holds before the first click. */
const NOTHING_TO_UNDO = () => {};

/** Warnings already given (each once per page load: a component renders many times). */
const givenWarnings = new Set();

/** console.warn, once per distinct message. */
function warnOnce(message) {
	if (givenWarnings.has(message)) return;
	givenWarnings.add(message);
	console.warn(message);
}

/**
 * Is this keydown one that activates the reference: Enter or Space, without Alt, Ctrl or ⌘,
 * pressed on the words themselves (not on a link inside them, whose own Enter must work)?
 */
function isActivationKey(event) {
	if (event.altKey || event.ctrlKey || event.metaKey) return false;
	if (event.target !== event.currentTarget) return false;
	return ACTIVATION_KEYS.includes(event.key);
}

/** <CodeRef to lines step>words</CodeRef> — see the header and README.md. */
export default function CodeRef({ to, lines, step, children }) {
	// The last click's cancel(): a new click or an unmount stops its wait and withdraws its request.
	const cancelRef = useRef(NOTHING_TO_UNDO);
	useEffect(() => () => cancelRef.current(), []);

	const reference = readReference({ to, lines, step });
	for (const warning of reference.warnings) warnOnce(warning);
	const words = children ?? reference.label;
	if (reference.id === null) return <>{words}</>;

	const activate = () => {
		cancelRef.current();
		cancelRef.current = goToEditor({ id: reference.id, action: reference.action });
	};

	const onKeyDown = (event) => {
		if (!isActivationKey(event)) return;
		event.preventDefault(); // every keydown, the repeats of a held key included: Space must never scroll the page
		if (event.repeat) return;
		activate();
	};

	return (
		<span
			className={styles.reference}
			role="button"
			tabIndex={0}
			title={reference.description}
			aria-controls={editorDomId(reference.id)}
			onClick={activate}
			onKeyDown={onKeyDown}>
			{words}
		</span>
	);
}

export { ACTIVATION_KEYS, isActivationKey };
