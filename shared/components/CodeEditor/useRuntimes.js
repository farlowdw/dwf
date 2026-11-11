/**
 * useRuntimes.js — the runtimes installed on the code runner, for the version menu.
 *
 *     const { status, runtimes, error } = useRuntimes(runtimesUrl);
 *     // status: 'loading' | 'ready' | 'failed' (runtimeChoice.js > RUNTIMES_*)
 *     // runtimesUrl: the site's (the monaco-editor plugin's option, through its global data:
 *     //   CodeEditorClient.jsx); undefined = the library's default, the site's own function
 *
 * One request per page load, however many editors the page has: the library's fetchRuntimes()
 * (lib/codeRunner/client.js) shares its answer and never rejects; a failed request is not
 * remembered, so the next editor to mount (or a reload) tries again. A failure is not shown on
 * its own: the editor keeps working and Run reports the real problem (runtimeChoice.js).
 *
 * HOW TO CHANGE IT
 *   Where the list comes from: shared/functions/code-runner/runtimes.mjs (the Netlify function), at the URL
 *   the plugin's options give (shared/plugins/monaco-editor > runtimesUrl; the default is
 *   lib/codeRunner/client.js > RUNTIMES_URL). What is done with it: runtimeChoice.js.
 */

import { useEffect, useState } from 'react';
import { fetchRuntimes } from './lib/codeRunner/index.js';
import { RUNTIMES_FAILED, RUNTIMES_LOADING, RUNTIMES_READY } from './runtimeChoice.js';

/** The state before the answer arrives. */
const LOADING_STATE = Object.freeze({ status: RUNTIMES_LOADING, runtimes: [], error: null });

/** The hook's state from fetchRuntimes()'s answer. */
function stateFrom({ runtimes, error }) {
	if (error) return { status: RUNTIMES_FAILED, runtimes: [], error };
	return { status: RUNTIMES_READY, runtimes: Array.isArray(runtimes) ? runtimes : [], error: null };
}

/** { status, runtimes, error } — see the header. `url`: the runtimes function's (undefined: the default). */
export function useRuntimes(url) {
	const [state, setState] = useState(LOADING_STATE);
	useEffect(() => {
		let mounted = true;
		fetchRuntimes({ url })
			.then((answer) => stateFrom(answer ?? {}))
			.catch((error) => ({ status: RUNTIMES_FAILED, runtimes: [], error }))
			.then((next) => {
				if (mounted) setState(next);
			});
		return () => {
			mounted = false;
		};
	}, [url]);
	return state;
}
