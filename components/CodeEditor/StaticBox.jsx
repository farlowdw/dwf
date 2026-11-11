/**
 * StaticBox.jsx — the editor box of the STATIC VIEW (a phone or tablet: touchMode.js): the code
 * as highlighted text (StaticCode.jsx) and, under it where the Monaco view has its resize strip,
 * the full-width "Tap to edit" bar (TouchBar) that mounts Monaco. No fixed height: the box is as
 * tall as the code and the page scrolls past it. CodeEditorClient.jsx renders it in place of the
 * Monaco box and the strip while the view is static.
 *
 *     <StaticBox settings={settings} language={language} theme={theme} drafts={drafts} options={monacoOptions}
 *                onSurface={setSurface} onStores={setStores} onModelShown={handleModelShown} onEdit={() => setView(VIEWS.monaco)} />
 *
 * WHAT IT OWNS
 *   - one store per language (useStaticStores.js: made on a language's first show, kept across
 *     switches, so each language keeps its open folds), the shown language's handed to
 *     <StaticCode>;
 *   - ONE surface for its life (staticSurface.js, the static half of surface.js's contract),
 *     over whichever store is current and over this element (the host: the lines' elements and
 *     the bar are found inside it), made in a layout effect and handed to the shell
 *     (`onSurface(surface)`; `onSurface(null)` when the box unmounts). The shell talks to the
 *     code only through it: marks, reveals, Run's text, Reset's text.
 *   - the stores' API for the shell (`onStores(stores)`, once, before the surface; null at
 *     unmount): Reset needs `reset(lang)` and the fold pass `storeFor(lang)`, which the surface
 *     does not offer.
 *   - `onModelShown(language)` after the first show and after every language switch (what
 *     Monaco's onDidChangeModel tells the shell): the shell's handleModelShown then sets the
 *     language's marks and ends its (instant) fold pass. The surface is handed over first, so
 *     the handler may read it; the language goes along because this box's layout effects run
 *     before the shell's (a child's do), so the shell's own record of the language is not yet
 *     up to date when the first one fires.
 *   - the bar, unless the editor is read-only (there is nothing to edit); its tap calls
 *     `onEdit()`. While `editBlockedReason` is set (Monaco could not load: touchMode.js > WHEN
 *     MONACO CANNOT LOAD AFTER THE TAP) the bar is greyed out, its tooltip the reason: a tap
 *     would only fail again.
 * The callbacks are read through refs that follow the latest render, so an inline arrow from
 * the shell never remakes the surface.
 *
 * HOW TO CHANGE IT  The props: STATIC_BOX_PROPS (documented there). The bar's words:
 * StaticCode.jsx > WORDS; its look: static.module.css > .touchBar. The stores' rules:
 * useStaticStores.js.
 */

import React, { useLayoutEffect, useRef } from 'react';
import StaticCode, { WORDS } from './StaticCode.jsx';
import { createStaticSurface } from './staticSurface.js';
import { useStaticStores } from './useStaticStores.js';
import styles from './static.module.css';

export { useStaticStores } from './useStaticStores.js';

/** The props of <StaticBox>, each with what it is. */
export const STATIC_BOX_PROPS = Object.freeze({
	settings: "props.js > normalizeEditorProps's object (fixed at mount): the snippets, folds, title, read-only flag, Monaco options",
	language: 'the language shown now (the picker switches it)',
	theme: "the reader's editor theme (useEditorTheme.js): its name picks the Prism colours, its keyColors the line numbers'",
	drafts: "useDrafts.js's object: startingCode(lang) and foldsFor(lang) start each language's store",
	options: "the Monaco options the client built (props.js > buildMonacoOptions): the static view's font and metrics",
	onSurface: 'called with the surface once it exists (staticSurface.js), and with null when the box unmounts',
	onStores: "called with useStaticStores.js's API ({ storeFor, reset, foldsFor }) before the surface, and with null at unmount (optional)",
	onModelShown: 'called with the language after the first show and after every language switch (optional)',
	onEdit: 'called when the reader taps the bar: mount Monaco (optional; the bar then does nothing)',
	editBlockedReason: 'why the bar is greyed out (Monaco could not load: messages.js > RUN_DISABLED.noEditor), or null (optional)',
});

/** A ref that always holds the latest `value` (updated before the layout effects below run). */
function useLatest(value) {
	const ref = useRef(value);
	useLayoutEffect(() => {
		ref.current = value;
	});
	return ref;
}

/** The full-width "Tap to edit" bar (data-touch-bar: the surface's focus() finds it); greyed out, its tooltip `blockedReason`, while that is set. */
export function TouchBar({ onEdit, blockedReason = null }) {
	function handleClick() {
		onEdit?.();
	}
	const blocked = Boolean(blockedReason);
	return (
		<button
			type="button"
			className={styles.touchBar}
			data-touch-bar=""
			title={blocked ? blockedReason : WORDS.tapToEditTooltip}
			disabled={blocked}
			onClick={handleClick}>
			{WORDS.tapToEdit}
		</button>
	);
}

/** See the header and STATIC_BOX_PROPS. */
export default function StaticBox({ settings, language, theme, drafts, options, onSurface, onStores, onModelShown, onEdit, editBlockedReason }) {
	const stores = useStaticStores(settings, drafts);
	const store = stores.storeFor(language);
	const hostRef = useRef(null);
	const languageRef = useLatest(language);
	const onSurfaceRef = useLatest(onSurface);
	const onStoresRef = useLatest(onStores);
	const onModelShownRef = useLatest(onModelShown);

	// The stores first, then the surface, each once for the box's life (null again at unmount).
	useLayoutEffect(() => {
		onStoresRef.current?.(stores);
		return () => onStoresRef.current?.(null);
	}, [stores, onStoresRef]);

	useLayoutEffect(() => {
		const surface = createStaticSurface({ currentStore: () => stores.storeFor(languageRef.current), host: hostRef.current });
		onSurfaceRef.current?.(surface);
		return () => onSurfaceRef.current?.(null);
	}, [stores, languageRef, onSurfaceRef]);

	// After the surface: the first show, and every switch (the shell sets the marks, ends the fold pass).
	// The language goes along: a child's layout effect runs before the shell's own, which is
	// where the shell's languageRef would otherwise be brought up to date.
	useLayoutEffect(() => {
		onModelShownRef.current?.(language);
	}, [language, onModelShownRef]);

	return (
		<div ref={hostRef} className={styles.staticBox}>
			<StaticCode store={store} settings={settings} language={language} theme={theme} options={options} onToggleFold={(index) => store.toggleFold(index)} />
			{settings.readOnly ? null : <TouchBar onEdit={onEdit} blockedReason={editBlockedReason} />}
		</div>
	);
}
