/**
 * useRunErrors.js — the run-error markers inside the editor: after a run (or an exercise's
 * Check) the places its errors point to are squiggled in the code (runMarkers.js) and listed as
 * "Line N · …" rows with a Go to line button (ErrorList.jsx: under the run's status line in
 * OutputPanel.jsx, under the check's headline in ExercisePanel.jsx). On for every editor; the
 * `hideErrors` prop turns it off.
 *
 *     const errors = useRunErrors({ settings, surfaceRef, surfaceReady, language, run, check });
 *     errors.beginRun();              // when a run or a check starts: old squiggles go, a snapshot of the code
 *     errors.clear();                 // Reset, Clear: the squiggles go even when the text does not change
 *     errors.watch();                 // in the listeners effect: the next edit or language switch clears them
 *     errors.runRows / errors.checkRows   // { locations, onGoToLine } for ErrorList
 *
 *   run / check: { phase, summary, response, sent } — a useCodeRun() state and the sent record
 *   kept with it (runErrors.js > sentRecord). `surfaceRef.current`: the editor's surface
 *   (surface.js), null before it is up; `surfaceReady`: the same as React state (the shell's
 *   `surface !== null`), so the rows are drawn again when it comes or goes.
 *
 * THE RULES  Which locations, and which of them are squiggled: runErrors.js > shownLocations
 *   (a failed run: all; a successful one: nothing, except Bash's errors — it carries on after
 *   "command not found" — and never a warning; TypeScript's syntax errors that stopped a run:
 *   rows only, Monaco already squiggles them; `hideErrors`: nothing). The squiggles follow the
 *   newest answer (a run and a check never wait at the same time) and are not drawn when the
 *   code changed while the run waited (the snapshot). The rows stay with the output after an
 *   edit, like the traceback; their Go to line button shows only while the language that ran is
 *   on screen and there is a surface to go to (none after Monaco failed to load in the Monaco
 *   view: a button there would do nothing). Go to line opens any fold over the line at once, then puts the cursor there
 *   (Monaco) or flashes the line and scrolls the page to it (the static view of a phone, which
 *   draws no squiggles: surface.js > markers).
 *
 * HOW TO CHANGE IT
 *   The rules: runErrors.js. The squiggles and Go to line: runMarkers.js (through the surface's
 *   `markers` and `goTo`: monacoSurface.js). The rows: ErrorList.jsx.
 */

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { shownLocations } from './runErrors.js';

/** One run's (or check's) shown locations, recomputed only when its answer or sent record changes. */
function useShown(hideErrors, { phase, summary, response, sent }) {
	return useMemo(
		() => shownLocations({ hideErrors, phase, summary, response, sent }),
		[hideErrors, phase, summary, response, sent],
	);
}

/** Squiggle `shown` once it changes (and asks for it), unless the code changed since the snapshot. */
function useMarkersFor(shown, { surfaceRef, snapshotRef }) {
	useEffect(() => {
		if (!shown.mark || shown.locations.length === 0) return;
		surfaceRef.current?.markers.show(shown.locations, snapshotRef.current);
	}, [shown, surfaceRef, snapshotRef]);
}

/** A watch that has nothing to dispose (no surface yet). */
function nothingToWatch() {
	return { dispose() {} };
}

/** See the header. */
export function useRunErrors({ settings, surfaceRef, surfaceReady, language, run, check }) {
	const snapshotRef = useRef(null);
	const runShown = useShown(settings.hideErrors, run);
	const checkShown = useShown(settings.hideErrors, check);
	useMarkersFor(runShown, { surfaceRef, snapshotRef });
	useMarkersFor(checkShown, { surfaceRef, snapshotRef });

	const beginRun = useCallback(() => {
		const surface = surfaceRef.current;
		if (!surface) return;
		surface.markers.clear();
		snapshotRef.current = surface.markers.begin();
	}, [surfaceRef]);

	const clear = useCallback(() => surfaceRef.current?.markers.clear(), [surfaceRef]);

	const watch = useCallback(() => surfaceRef.current?.markers.watch() ?? nothingToWatch(), [surfaceRef]);

	const goToLine = useCallback(
		async (line, location) => {
			const surface = surfaceRef.current;
			if (!surface) return;
			await surface.goTo({ ...location, line });
		},
		[surfaceRef],
	);

	/** Go to line only while there is a surface and the language that ran is the one on it (its lines are that code's). */
	const goToFor = (sent) => (surfaceReady && sent && sent.language === language ? goToLine : null);

	return {
		beginRun,
		clear,
		watch,
		runRows: { locations: runShown.locations, onGoToLine: goToFor(run.sent) },
		checkRows: { locations: checkShown.locations, onGoToLine: goToFor(check.sent) },
	};
}
