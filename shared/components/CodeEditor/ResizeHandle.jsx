/**
 * ResizeHandle.jsx — the strip under the code that resizes the editor box: drag it (mouse, pen or
 * a finger) up or down, or focus it and use the keys; a double-click, a double tap or Enter puts
 * the box back to its first size. A grab pill in the middle and a grip in the right corner (like
 * a text area's) say "drag me" at a glance.
 *
 *     <ResizeHandle boxRef={boxRef} onResizeStart={…} onReset={…} />
 *
 * HOW IT WORKS
 *   - A press captures the pointer (setPointerCapture), so the drag goes on when the pointer
 *     leaves the strip or the window. It becomes a DRAG only once the pointer has moved a few px
 *     (resize.js > hasDragStarted): a click, or the two presses of a double-click, change
 *     nothing. On that first move onResizeStart runs (CodeEditorClient pins the box to the height
 *     it is drawn at and stops height="fit"), then every move sets the box's height directly
 *     (resize.js > heightAfterDrag) — no React render per move. Monaco follows by itself
 *     (automaticLayout watches its container). Only the pointer that started a press counts; a
 *     second finger is ignored. `touch-action: none` keeps a finger's drag from scrolling the page.
 *   - Reset: a double-click, two quick taps without a drag (resize.js > isDoubleTap: touch
 *     browsers rarely send dblclick), or Enter -> onReset.
 *   - Keyboards and screen readers: a focusable separator (role="separator") whose aria-valuenow
 *     is the box's height in px, read when the strip mounts, on focus and after every change.
 *     Arrow Up / Down, Page Up / Down, Home / End resize (resize.js > heightAfterKey). In the page's
 *     Tab order the strip comes after the editor, which keeps Tab for indenting: reach it with
 *     Shift+Tab from what follows, or after Monaco's Ctrl+M (Ctrl+Shift+M on a Mac) lets Tab
 *     leave the editor.
 *
 * HOW TO CHANGE IT  The rules and steps: resize.js. The look: styles.module.css > .resizeHandle,
 *   .resizeGrip. The words: messages.js > LABELS.resize, LABELS.resizeTooltip.
 */

import React, { useLayoutEffect, useRef, useState } from 'react';
import { LABELS } from './messages.js';
import { hasDragStarted, heightAfterDrag, heightAfterKey, isDoubleTap, isResetKey, resizeBounds } from './resize.js';
import styles from './styles.module.css';

/** The box's current height in px (0 when it is not on the page). */
function boxHeightOf(boxRef) {
	return boxRef.current ? Math.round(boxRef.current.getBoundingClientRect().height) : 0;
}

/** Give the box a height in px. */
function setBoxHeight(boxRef, px) {
	if (boxRef.current) boxRef.current.style.height = `${px}px`;
}

/** The window's height (0 on the server). */
function viewportHeight() {
	return typeof window === 'undefined' ? 0 : window.innerHeight;
}

/** The grip in the strip's right corner: diagonal strokes, like a text area's. Also drawn by the placeholder (index.jsx). */
export function ResizeGrip() {
	return (
		<svg className={styles.resizeGrip} viewBox="0 0 10 10" aria-hidden="true" focusable="false">
			<path d="M9 3 L3 9 M9 6 L6 9 M9 9 L9 9" />
		</svg>
	);
}

export default function ResizeHandle({ boxRef, onResizeStart, onReset }) {
	const pressRef = useRef(null);
	const lastTapRef = useRef(null);
	const [dragging, setDragging] = useState(false);
	const [valueNow, setValueNow] = useState(0);

	/** Read the box's height into aria-valuenow (now, and once more after the next frame's layout). */
	function measure({ afterLayout = false } = {}) {
		if (!afterLayout) {
			setValueNow(boxHeightOf(boxRef));
			return;
		}
		requestAnimationFrame(() => requestAnimationFrame(() => setValueNow(boxHeightOf(boxRef))));
	}

	useLayoutEffect(() => {
		setValueNow(boxHeightOf(boxRef));
	}, [boxRef]);

	function startPress(event) {
		if (pressRef.current || !event.isPrimary) return;
		if (event.pointerType === 'mouse' && event.button !== 0) return;
		event.preventDefault();
		event.currentTarget.setPointerCapture?.(event.pointerId);
		const startHeight = boxHeightOf(boxRef);
		pressRef.current = {
			pointerId: event.pointerId,
			pointerType: event.pointerType,
			startHeight,
			startY: event.clientY,
			startX: event.clientX,
			bounds: resizeBounds(viewportHeight(), startHeight),
			dragged: false,
		};
	}

	function movePress(event) {
		const press = pressRef.current;
		if (!press || event.pointerId !== press.pointerId) return;
		if (!press.dragged) {
			if (!hasDragStarted(press.startY, event.clientY)) return;
			press.dragged = true;
			setDragging(true);
			onResizeStart();
		}
		setBoxHeight(boxRef, heightAfterDrag({ startHeight: press.startHeight, startY: press.startY, currentY: event.clientY }, press.bounds));
	}

	function endPress(event) {
		const press = pressRef.current;
		if (!press || (event && event.pointerId !== press.pointerId)) return;
		pressRef.current = null;
		if (press.dragged) {
			setDragging(false);
			lastTapRef.current = null;
			measure();
			return;
		}
		// A tap (no drag) by a finger or a pen: two quick ones reset the size (touch rarely sends dblclick).
		if (press.pointerType === 'mouse' || event?.type !== 'pointerup') return;
		const tap = { time: event.timeStamp, x: event.clientX, y: event.clientY };
		if (isDoubleTap(lastTapRef.current, tap)) {
			lastTapRef.current = null;
			reset();
		} else {
			lastTapRef.current = tap;
		}
	}

	function reset() {
		onReset();
		measure({ afterLayout: true });
	}

	function handleKeyDown(event) {
		if (isResetKey(event.key)) {
			event.preventDefault();
			reset();
			return;
		}
		const current = boxHeightOf(boxRef);
		const next = heightAfterKey(current, event.key, resizeBounds(viewportHeight(), current));
		if (next === null) return;
		event.preventDefault();
		onResizeStart();
		setBoxHeight(boxRef, next);
		setValueNow(next);
	}

	const bounds = resizeBounds(viewportHeight(), valueNow);
	return (
		<div
			role="separator"
			aria-orientation="horizontal"
			aria-label={LABELS.resize}
			aria-valuemin={bounds.min}
			aria-valuemax={bounds.max}
			aria-valuenow={valueNow || undefined}
			tabIndex={0}
			title={LABELS.resizeTooltip}
			className={dragging ? `${styles.resizeHandle} ${styles.resizeHandleActive}` : styles.resizeHandle}
			onPointerDown={startPress}
			onPointerMove={movePress}
			onPointerUp={endPress}
			onPointerCancel={endPress}
			onLostPointerCapture={endPress}
			onKeyDown={handleKeyDown}
			onDoubleClick={reset}
			onFocus={() => measure()}
		>
			<ResizeGrip />
		</div>
	);
}
