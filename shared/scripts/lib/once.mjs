/**
 * scripts/lib/once.mjs: one small helper, a value worked out on first use and then kept. A status
 * run has many readers of the same slow answer: the fetch, the docs, the tracked files.
 *
 * HOW TO CHANGE IT
 *   There is nothing to set. The value is kept for the life of the returned function.
 */

/** Wraps `compute` so it runs at most once. */
export function once(compute) {
  let cached;
  let done = false;
  return () => {
    if (!done) {
      cached = compute();
      done = true;
    }
    return cached;
  };
}
