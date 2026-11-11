/**
 * typescriptLibs.js — the declaration files every TypeScript editor on a page knows without an
 * import: the type-test helpers in the Total TypeScript style (Expect, Equal, NotEqual, IsAny,
 * IsUnknown, Debug) and the few Node.js globals a program run on the code runner uses (require
 * with require.main and require.resolve, process with process.hrtime(), module, exports,
 * __dirname, __filename, setImmediate / clearImmediate, global). typescript.js >
 * configureTypeScript hands them to Monaco's TypeScript checker once per page (addExtraLib).
 * Pure data; no React, no DOM.
 *
 *     type test = Expect<Equal<typeof total, number>>;   // a red squiggle until total is a number
 *     const input: string = require('fs').readFileSync(0, 'utf8');   // the program's stdin
 *
 * WHY THESE
 *   The helpers are the editor's own, written from the well-known idioms (no package is copied):
 *   Equal compares two types exactly (any, unknown and never are told apart), Expect accepts only
 *   true, so a type test that fails is a type error on its line. Debug spells out an
 *   intersection's properties, so a hover shows them all.
 *   The code runs in Node, but Monaco's checker knows only the browser's globals (console,
 *   setTimeout, URL … — which Node has too). Without these few declarations a strict checker
 *   would call require('fs') or process.argv an error. They are small on purpose: the full
 *   @types/node is megabytes. The common idioms are known: `if (require.main === module) main();`,
 *   setImmediate, process.hrtime() and process.hrtime.bigint(), global. Anything else Node-only
 *   is unknown to the checker: Buffer, and Node's modules as modules (`import fs from 'fs'`,
 *   `import fs = require('fs')`: there are no module declarations); `require` returns `any`, so
 *   require('fs') always works. `global.x = 1` is an error under strict, as it is with
 *   @types/node; `(global as any).x = 1` works.
 *
 * A .d.ts FILE IS GLOBAL  The two files are declaration files without import or export, so what
 *   they declare is visible in every TypeScript editor (moduleDetection 'force' makes the
 *   readers' files modules, never these: typescript.js > COMPILER_OPTIONS). A reader's own
 *   `type Equal …` in their code simply wins in their file.
 *
 * CHECK_DECLARATION  The exercise harness calls check(name, got, expected) (the protocol of
 *   lib/codeRunner/exercise.js). typescript.js > combineWithHarness adds this declaration
 *   at the end of the harness, inside the harness's own namespace (after its last line, so no
 *   line moves; a reader's own `check` is shadowed, not clashed with), unless the harness
 *   defines check itself. It is not in the global files: an ordinary editor has no check().
 *
 * HOW TO CHANGE IT
 *   A new helper type: add it to TYPE_HELPERS_LIB (one line, with a short doc comment: readers
 *   see it in the hover). Another Node global: NODE_GLOBALS_LIB. A changed file reaches the
 *   checker on the next page load (addExtraLib with the same path replaces it). Keep backticks
 *   out of the declaration texts (they are template literals).
 */

/**
 * Where Monaco's checker files the two declaration files (any path ending in .d.ts; site-neutral,
 * so every site reads the same). A reader meets the path only in a go-to-definition peek on a
 * helper (Monaco opens a model for an extra lib then), never elsewhere.
 */
export const TYPE_HELPERS_PATH = 'file:///code-editor/type-helpers.d.ts';
export const NODE_GLOBALS_PATH = 'file:///code-editor/node-globals.d.ts';

/** The type-test helpers (see the header). */
export const TYPE_HELPERS_LIB = `/** Accepts only true: type test = Expect<Equal<A, B>>; fails (a type error) until A and B are the same type. */
type Expect<T extends true> = T;

/** true when X and Y are exactly the same type (any, unknown and never are told apart), else false. */
type Equal<X, Y> = (<T>() => T extends X ? 1 : 2) extends (<T>() => T extends Y ? 1 : 2) ? true : false;

/** true when X and Y are different types: the opposite of Equal. */
type NotEqual<X, Y> = true extends Equal<X, Y> ? false : true;

/** true only for any. */
type IsAny<T> = 0 extends 1 & T ? true : false;

/** true only for unknown (not for any). */
type IsUnknown<T> = unknown extends T ? (IsAny<T> extends true ? false : true) : false;

/** The same type with its properties spelled out, so a hover shows them all: type Shown = Debug<A & B>; */
type Debug<T> = { [K in keyof T]: T[K] } & {};
`;

/** The Node.js globals a program on the code runner uses (see the header). */
export const NODE_GLOBALS_LIB = `/** Node's process object: the parts a short program uses. */
interface NodeProcess {
	argv: string[];
	env: { [name: string]: string | undefined };
	exitCode: number | undefined;
	exit(code?: number): never;
	cwd(): string;
	platform: string;
	version: string;
	versions: { [name: string]: string | undefined };
	stdin: any;
	stdout: { write(text: string): boolean };
	stderr: { write(text: string): boolean };
	hrtime: { (time?: [number, number]): [number, number]; bigint(): bigint };
	memoryUsage(): { rss: number; heapTotal: number; heapUsed: number; external: number };
	nextTick(callback: (...args: any[]) => void, ...args: any[]): void;
	on(event: string, listener: (...args: any[]) => void): NodeProcess;
}

/** Node's process: argv, env, exit, stdout … */
declare var process: NodeProcess;

/** Node's CommonJS module object (module, and require.main). */
interface NodeModule {
	exports: any;
	id: string;
	filename: string;
	loaded: boolean;
	parent: NodeModule | null | undefined;
	children: NodeModule[];
	paths: string[];
	require(id: string): any;
}

/** Node's require function: called, and its main, resolve and cache. */
interface NodeRequire {
	(id: string): any;
	main: NodeModule | undefined;
	resolve(id: string): string;
	cache: { [id: string]: NodeModule | undefined };
}

/** Node's require: require('fs').readFileSync(0, 'utf8') reads the program's input (returns any); if (require.main === module) main(); runs main only when this file is the program. */
declare var require: NodeRequire;

/** Node's CommonJS module object. */
declare var module: NodeModule;

/** Node's CommonJS exports object. */
declare var exports: any;

/** The folder of the running file (Node). */
declare var __dirname: string;

/** The running file's name (Node). */
declare var __filename: string;

/** Node's setImmediate: run the callback once the current work and its I/O are done. */
declare function setImmediate(callback: (...args: any[]) => void, ...args: any[]): any;

/** Node's clearImmediate: cancel a setImmediate. */
declare function clearImmediate(handle: any): void;

/** Node's global object (the same as globalThis). */
declare var global: typeof globalThis;
`;

/** Both files, in the order configureTypeScript adds them: [{ filePath, content }]. */
export const EXTRA_LIBS = Object.freeze([
	Object.freeze({ filePath: TYPE_HELPERS_PATH, content: TYPE_HELPERS_LIB }),
	Object.freeze({ filePath: NODE_GLOBALS_PATH, content: NODE_GLOBALS_LIB }),
]);

/**
 * check()'s type for an exercise's type check (see the header): one line, added after the harness.
 * The same text as lib/codeRunner/checkHelpers.js > TYPESCRIPT_CHECK_DECLARATION (without its
 * newline): T comes from `got` alone (NoInfer), so `expected` is checked against the reader's
 * type. Keep the two equal (__tests__/typescript.test.js compares them when that file exists).
 */
export const CHECK_DECLARATION = 'declare function check<T>(name: string, got: T, expected: NoInfer<T>): boolean;';
