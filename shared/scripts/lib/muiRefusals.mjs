/**
 * scripts/lib/muiRefusals.mjs: what `shared:status` refuses to find under shared/. MUI X's paid
 * packages and their licence wiring belong to the one site that holds the licence, and shared/ is
 * public through another site. The scan reads code files. A README may name these words, and so may
 * this file and the tests that check for them.
 *
 * HOW TO CHANGE IT
 *   Add a term to REFUSED_TERMS. CODE_FILE says which files count, EXEMPT_FILES which never do.
 */

/** Each of these in a shared code file is a refusal. */
export const REFUSED_TERMS = Object.freeze([
  'MUI_LICENSE_KEY',
  'x-license',
  'LicenseInfo',
  'x-data-grid-pro',
  'x-data-grid-premium',
]);

const CODE_FILE = /\.(?:js|jsx|mjs|cjs|ts|tsx|json|scss|css)$/;

const EXEMPT_FILES = /(?:^|\/)(?:__tests__\/|scripts\/lib\/muiRefusals\.mjs$)/;

/** Every refused term in the texts: [{ path, line, term }]. */
export function findRefusedTerms(texts) {
  const hits = [];
  for (const { path, text } of texts) {
    if (!CODE_FILE.test(path) || EXEMPT_FILES.test(path)) continue;
    text.split('\n').forEach((line, index) => {
      for (const term of REFUSED_TERMS) {
        if (line.includes(term)) hits.push({ path, line: index + 1, term });
      }
    });
  }
  return hits;
}
