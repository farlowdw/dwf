/**
 * autoHeight.js — the editor box's height when it fits its content (height="fit"): applied
 * once per animation frame, with a HOLD for while the fold cover is up. No React and no DOM of
 * its own (the box and the frame functions are handed in), so __tests__/autoHeight.test.js
 * drives it with fakes. CodeEditorClient.jsx > useFitHeight makes one per editor.
 *
 *     const auto = createAutoHeight({ setHeight: (px) => { box.style.height = `${px}px`; } });
 *     auto.fit(contentHeight);   // applied in the next frame (several in one frame: the last wins)
 *     auto.hold();               // from now on fit() only remembers the height …
 *     auto.release();            // … until release() applies the last one (in the next frame)
 *     auto.stop();               // the reader resized the box by hand: fit() only remembers …
 *     auto.resume();             // … until resume() (a double-click on the handle) applies the last one
 *     auto.dispose();            // cancels a waiting frame (and forgets it, so fit() works again)
 *
 * WHY A FRAME  The height comes from Monaco's onDidContentSizeChange; Monaco's own resize
 *   observer (automaticLayout) would answer a height set at once with another layout, in the
 *   same frame, and loop. One frame later it never does.
 *
 * WHY THE HOLD  While a language's first folds close, the code is covered (CodeEditorClient.jsx
 *   > the cover) and Monaco reports the UNFOLDED height first. Applied, the box would grow and
 *   shrink back a few hundred ms later, and the page under the editor would jump although the
 *   code is hidden. So the box keeps the height it was drawn with (the folded estimate,
 *   sizing.js) until the folds are done — or the cover's safety timer gives up, or a newer fold
 *   without a cover takes over — and then gets the last height Monaco reported.
 *
 * WHY STOP  A height the reader dragged (ResizeHandle.jsx) is the reader's: once they resize, the
 *   code's height no longer moves the box, until they double-click the handle to go back.
 *
 * HOW TO CHANGE IT
 *   When the hold starts and ends: CodeEditorClient.jsx (foldLanguage, useFoldCover). How the
 *   height reaches the box: the `setHeight` handed in (rounded to whole px here).
 */

/** requestAnimationFrame / cancelAnimationFrame, looked up when called (none in node: pass your own). */
function browserRequestFrame(callback) {
	return requestAnimationFrame(callback);
}

function browserCancelFrame(frame) {
	cancelAnimationFrame(frame);
}

/**
 * The auto height of one box (see the header):
 *   setHeight     (px) => void, given whole px
 *   requestFrame  (callback) => id (default requestAnimationFrame)
 *   cancelFrame   (id) => void (default cancelAnimationFrame)
 * Returns { fit(contentHeight), hold(), release(), stop(), resume(), dispose(), isHeld(), isStopped() }.
 */
export function createAutoHeight({ setHeight, requestFrame = browserRequestFrame, cancelFrame = browserCancelFrame }) {
	let frame = 0;
	let height = null;
	let held = false;
	let stopped = false;

	function applyNow() {
		frame = 0;
		if (held || stopped || height === null) return;
		setHeight(Math.round(height));
	}

	function applyNextFrame() {
		if (frame) return;
		frame = requestFrame(applyNow);
	}

	return {
		fit(contentHeight) {
			height = contentHeight;
			if (!held && !stopped) applyNextFrame();
		},
		hold() {
			held = true;
		},
		release() {
			if (!held) return;
			held = false;
			if (!stopped) applyNextFrame();
		},
		stop() {
			stopped = true;
			cancelFrame(frame);
			frame = 0;
		},
		resume() {
			if (!stopped) return;
			stopped = false;
			if (!held) applyNextFrame();
		},
		dispose() {
			cancelFrame(frame);
			frame = 0;
		},
		isHeld() {
			return held;
		},
		isStopped() {
			return stopped;
		},
	};
}
