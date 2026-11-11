/**
 * useStaticStores.js — the static view's stores (staticCodeStore.js), ONE PER LANGUAGE for the
 * editor's life, so that each language keeps its text and its open folds across the language
 * picker's switches — as Monaco keeps one text model per language (monacoSetup.js). The hook
 * StaticBox.jsx calls; a plain React hook (no DOM, no Monaco), so __tests__/staticBox.test.js
 * drives it through reactHookShim.js.
 *
 *     const stores = useStaticStores(settings, drafts);
 *     stores.storeFor(lang)   // the language's store, made on its first show (never twice)
 *     stores.reset(lang)      // Reset: the page's snippet back, the author's folds closed again
 *     stores.foldsFor(lang)   // the author's folds, or none while lang shows a restored draft (useDrafts.js)
 *
 * THE RULES
 *   - A store is made when a language is first asked for, with drafts.startingCode(lang) (the
 *     restored draft, else the page's snippet) and drafts.foldsFor(lang) (the author's folds,
 *     all closed; none over a restored draft — the same rule as the Monaco view's first fold
 *     pass). The marks (the `highlight` prop and the magic comments) are not set here: the
 *     shell sets them through the surface (useGuided.js > applyMarks), as for Monaco.
 *   - reset(lang) is what Reset does to a model (CodeEditorClient.jsx): the snippet as the text
 *     (the store drops the folds and marks with it: their line numbers were the old text's),
 *     then the author's folds closed again. The shell calls drafts.discard first, as today, and
 *     sets the marks again after (the fold pass).
 *   - `settings` is fixed at mount (props.js); `drafts` is read through a ref that follows the
 *     latest render, so the functions here never change identity and an effect keyed on them
 *     runs once.
 *
 * HOW TO CHANGE IT  What a new store starts with: storeFor. What Reset restores: reset (the
 * snippet: props.js's `snippets.code`, the folds: `foldedRegions`).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createStaticCodeStore } from './staticCodeStore.js';

/** The page's snippet for `lang` ('' when it gave none), without magic comments (props.js). */
function snippetOf(settings, lang) {
	return settings.snippets.code[lang] ?? '';
}

/** The author's fold regions for `lang` (props.js > foldedRegions), [] without. */
function authorFoldsOf(settings, lang) {
	return settings.foldedRegions[lang] ?? [];
}

/** See the header. `drafts`: useDrafts.js's object (startingCode, foldsFor). */
export function useStaticStores(settings, drafts) {
	const [stores] = useState(() => new Map());
	const draftsRef = useRef(drafts);
	useEffect(() => {
		draftsRef.current = drafts;
	});

	const storeFor = useCallback(
		(lang) => {
			if (!stores.has(lang)) {
				const current = draftsRef.current;
				stores.set(lang, createStaticCodeStore({ text: current.startingCode(lang), foldRegions: current.foldsFor(lang) }));
			}
			return stores.get(lang);
		},
		[stores],
	);

	const reset = useCallback(
		(lang) => {
			const store = storeFor(lang);
			store.setText(snippetOf(settings, lang));
			store.setFolds(authorFoldsOf(settings, lang));
		},
		[storeFor, settings],
	);

	const foldsFor = useCallback((lang) => draftsRef.current.foldsFor(lang), []);

	return useMemo(() => ({ storeFor, reset, foldsFor }), [storeFor, reset, foldsFor]);
}
