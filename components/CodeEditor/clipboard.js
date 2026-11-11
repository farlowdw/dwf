/**
 * clipboard.js — puts text on the clipboard for the editor's two copy buttons (Copy code, Copy
 * output). Resolves true when it did, false when the browser refused both ways.
 *
 *     const copied = await copyText('print(1)');
 *
 * TWO WAYS  First the Clipboard API (navigator.clipboard.writeText). Some browsers refuse it
 *   even on a click — an app's built-in webview, a page in a frame without the clipboard-write
 *   permission ("Write permission denied", seen in a desktop app's built-in browser on
 *   2026-10-24) — so the old way follows: the text in an off-screen <textarea>, selected, and
 *   document.execCommand('copy'), which those browsers still allow during a click. The focus
 *   and the page's selection are put back afterwards.
 *
 * `env` is for the tests: { clipboard, document }.
 *
 * HOW TO CHANGE IT  Only the order or the fallback lives here; the buttons' feedback (the check
 *   mark, the live region) is CodeEditorClient.jsx > useCopyFeedback.
 */

/** Copy with the Clipboard API; false when it is missing or refuses. */
async function copyWithClipboardApi(text, clipboard) {
	if (!clipboard || typeof clipboard.writeText !== 'function') return false;
	try {
		await clipboard.writeText(text);
		return true;
	} catch {
		return false;
	}
}

/** Copy through an off-screen <textarea> and execCommand('copy'); false when it is refused. */
function copyWithTextarea(text, doc) {
	if (!doc?.body || typeof doc.execCommand !== 'function') return false;
	const previousFocus = doc.activeElement;
	const selection = doc.getSelection?.();
	const previousRange = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
	const field = doc.createElement('textarea');
	field.value = text;
	field.setAttribute('readonly', '');
	field.style.position = 'fixed';
	field.style.top = '-1000px';
	field.style.opacity = '0';
	doc.body.appendChild(field);
	field.select();
	let copied = false;
	try {
		copied = doc.execCommand('copy');
	} catch {
		copied = false;
	}
	field.remove();
	if (previousRange && selection) {
		selection.removeAllRanges();
		selection.addRange(previousRange);
	}
	previousFocus?.focus?.({ preventScroll: true });
	return Boolean(copied);
}

/** Put `text` on the clipboard (see the header). */
export async function copyText(text, env = {}) {
	const clipboard = 'clipboard' in env ? env.clipboard : globalThis.navigator?.clipboard;
	const doc = 'document' in env ? env.document : globalThis.document;
	if (await copyWithClipboardApi(text, clipboard)) return true;
	return copyWithTextarea(text, doc);
}
