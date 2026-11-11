/**
 * Toolbar.jsx — <CodeEditor>'s header bar.
 *
 *   left    the title (the file name, main.py, unless the page sets `title`), the language
 *           picker (only when the page gives code in more than one language) and the version
 *           picker (every installed version of the language, newest first: "Python 3.12.0";
 *           one installed version, or an unknown list, shows as plain text)
 *   right   Reset · Copy code · Clear (not when read-only) · Input (stdin) toggle · Copy output
 *           (greyed out until a run printed something) · Theme (a palette icon: the menu of
 *           editor themes, ThemeMenu.jsx; every editor has it) · Hints (a light bulb) · Solution ·
 *           Check · Run (contained, ⌘/Ctrl+Enter) — Stop (outlined, red) while a run is
 *           waiting. The order of 2026-10-26; Hints, Solution and Check only in an
 *           exercise.
 *   An exercise's buttons appear only with their props (2026-10-25): the light bulb (`hints`,
 *   2026-10-26: shows and hides the hints area under the code, a toggle like Input (stdin):
 *   aria-pressed, tooltip "Show hints" / "Hide hints"; HintList.jsx draws the area), Solution
 *   (`solution`: opens and closes the solution panel, aria-expanded), Check (`tests`: outlined
 *   text button before Run; Stop, red, while the check waits). A TypeScript editor shows its
 *   runtime as text, never a menu ("TypeScript 5.9.3 · Node 20.11.1": runtimeChoice.js >
 *   textOnly).
 *   THE RUNTIME SLOT  For an exercise or a TypeScript editor (props.js > runtimeSlotFor) the
 *   pickers or the version text sit in a slot of one fixed width (styles.module.css >
 *   .runtimeSlot), the width the placeholder (index.jsx) draws as an empty space: the header
 *   then wraps exactly where the placeholder did, whatever text arrives later (the runtimes
 *   list, Monaco's TypeScript version). Text longer than the slot ends in an ellipsis. Other
 *   editors have no slot: their header is unchanged.
 * Every icon button has an aria-label and a tooltip; a disabled button sits in a <span> so its
 * tooltip still says why. The two groups wrap onto two lines on a phone; the actions themselves
 * wrap when an exercise's buttons do not fit on one line (styles.module.css > .actions). The
 * pickers' menus, like the Theme menu, never lock the page's scroll (PICKER_MENU_PROPS).
 *
 * ACCESSIBILITY
 *   - Run and Stop are ONE <button> whose label, icon, colour and action change with `running`:
 *     two buttons swapped in and out dropped the keyboard focus to the page when a run started
 *     or ended. Check and its Stop are one button too, for the same reason.
 *   - The two toggles, Input (stdin) and the light bulb, keep ONE name ("Input (stdin)",
 *     "Hints") and say their state with aria-pressed; only the tooltip says what a press does
 *     ("Show hints" / "Hide hints": hintsTooltip). A name that flipped with the state would be
 *     read as "Hide hints, toggle button, pressed". The light bulb's aria-controls names the
 *     hints area while it is open. The idle line's cue names it the same way for screen
 *     readers ("click the Hints button": messages.js > HINT_CUE.icon).
 *   - Each copy result ("Copied", or "Couldn't copy …") is also said in a polite live region
 *     (role="status", visually hidden), so a screen reader hears it: the tooltip alone reached
 *     pointer users only.
 *   - MUI's Tooltip labels the element it wraps with its text (aria-label). On the tooltips'
 *     <span> wrappers that label is removed (UNLABELLED): a plain span may not carry one, and
 *     the button inside has its own.
 *
 * Only draws: every action is a callback from CodeEditorClient.jsx.
 *
 * HOW TO CHANGE IT
 *   A new action: an <IconAction> in the right group, its words in messages.js, its handler in
 *   CodeEditorClient.jsx, and index.jsx > ICON_BUTTONS one higher (the placeholder draws a space
 *   per button; an exercise button that only some editors have: props.js > exerciseButtonsFor,
 *   which the placeholder reads too). The icons: @mui/icons-material imports below (one file
 *   each, so the bundle carries only these). Run / Stop's looks: RUN_LOOK / STOP_LOOK; Check's:
 *   CHECK_LOOK / STOP_CHECK_LOOK (Run's and Check's light-mode blue: buttonInk.js). Layout and
 *   spacing: styles.module.css (.toolbar, .identity, .actions; .actions .runButton and .actions
 *   .checkButton for the two text buttons' widths; .runtimeSlot and its widths, which the
 *   placeholder shares). Which editors get the runtime slot: props.js > runtimeSlotFor.
 */

import React from 'react';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Tooltip from '@mui/material/Tooltip';
import CheckIcon from '@mui/icons-material/Check';
import ClearAllIcon from '@mui/icons-material/ClearAll';
import CompareArrowsIcon from '@mui/icons-material/CompareArrows';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import ErrorOutlinedIcon from '@mui/icons-material/ErrorOutlined';
import KeyboardIcon from '@mui/icons-material/Keyboard';
import LightbulbOutlinedIcon from '@mui/icons-material/LightbulbOutlined';
import TerminalIcon from '@mui/icons-material/Terminal';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import StopIcon from '@mui/icons-material/Stop';
import { ANY_VERSION } from './lib/codeRunner/index.js';
import { LIGHT_PRIMARY_INK_SX } from './buttonInk.js';
import { THEME_MENU_FAMILIES } from './editorThemes.js';
import { LABELS } from './messages.js';
import { runtimeSlotFor } from './props.js';
import ThemeMenu from './ThemeMenu.jsx';
import styles from './styles.module.css';

/** Copy button states (CodeEditorClient.jsx sets them). */
export const COPY_STATES = Object.freeze({ idle: 'idle', copied: 'copied', failed: 'failed' });

/**
 * The two copy buttons' tooltips and icons per state. Copy output's icon is a console window
 * (Terminal), so it never looks like Copy code's two sheets; both show a check mark once copied.
 */
const COPY_CODE_LOOK = Object.freeze({
	[COPY_STATES.idle]: { label: LABELS.copy, Icon: ContentCopyIcon },
	[COPY_STATES.copied]: { label: LABELS.copied, Icon: CheckIcon },
	[COPY_STATES.failed]: { label: LABELS.copyFailed, Icon: ErrorOutlinedIcon },
});
const COPY_OUTPUT_LOOK = Object.freeze({
	[COPY_STATES.idle]: { label: LABELS.copyOutput, Icon: TerminalIcon },
	[COPY_STATES.copied]: { label: LABELS.copied, Icon: CheckIcon },
	[COPY_STATES.failed]: { label: LABELS.copyOutputFailed, Icon: ErrorOutlinedIcon },
});

/** A copy button's look for its state (idle when the state is unknown). */
function copyLookOf(looks, state) {
	return looks[state] ?? looks[COPY_STATES.idle];
}

/**
 * Run and Stop: the one button's looks (RunButton). `sx`: Run's light-mode blue (buttonInk.js:
 * primary.dark, 4.5:1 or more on the header grey; dark mode untouched).
 */
const RUN_LOOK = Object.freeze({ label: LABELS.run, variant: 'contained', color: 'primary', Icon: PlayArrowIcon, sx: LIGHT_PRIMARY_INK_SX.contained });
const STOP_LOOK = Object.freeze({ label: LABELS.stop, variant: 'outlined', color: 'error', Icon: StopIcon });

/** Check and its Stop: the one button's looks (CheckButton; no icon, so it stays narrow; `sx` as Run's). */
const CHECK_LOOK = Object.freeze({ label: LABELS.check, variant: 'outlined', color: 'primary', sx: LIGHT_PRIMARY_INK_SX.outlined });
const STOP_CHECK_LOOK = Object.freeze({ label: LABELS.stop, variant: 'outlined', color: 'error' });

/**
 * Spread on a tooltip's <span> wrapper: MUI's Tooltip would give the span its text as
 * aria-label (not allowed on a plain span); the wrapper's own props win over MUI's, and an
 * undefined one is left out of the page.
 */
const UNLABELLED = Object.freeze({ 'aria-label': undefined });

/** The pickers' size: as tall as the header's buttons (MUI's small Select is 40 px; this makes it about 31). */
const COMPACT_SELECT_SX = Object.freeze({
	fontSize: '0.8125rem',
	'& .MuiSelect-select': { paddingTop: '4px', paddingBottom: '4px' },
});

/**
 * The pickers' menus leave the page's scroll alone (MUI's Menu props). MUI's scroll lock pads
 * and freezes the page while a menu is open; on a phone, on a page a few pixels wider than the
 * screen (maths that overflows, for one), that moved the page about 535 px under the finger and
 * the menu closed within 300 ms. The Theme menu does the same (ThemeMenu.jsx).
 */
export const PICKER_MENU_PROPS = Object.freeze({ disableScrollLock: true });

/**
 * A small icon button with a tooltip (the <span> keeps the tooltip working while it is disabled).
 * `pressed`: a toggle (aria-pressed; `controls` names what it shows while pressed); `expanded`
 * + `controls`: it opens and closes a panel (aria-expanded, aria-controls: the disclosure
 * pattern).
 */
function IconAction({ label, tooltip = label, onClick, disabled = false, pressed, expanded, controls, children }) {
	return (
		<Tooltip title={tooltip}>
			<span className={styles.tooltipAnchor} {...UNLABELLED}>
				<IconButton
					size="small"
					aria-label={label}
					aria-pressed={pressed}
					aria-expanded={expanded}
					aria-controls={controls}
					onClick={onClick}
					disabled={disabled}>
					{children}
				</IconButton>
			</span>
		</Tooltip>
	);
}

/** The language picker: one entry per language the page gave code for. */
function LanguageSelect({ languages, language, onChange }) {
	return (
		<Select
			size="small"
			value={language}
			onChange={(event) => onChange(event.target.value)}
			inputProps={{ 'aria-label': LABELS.language }}
			MenuProps={PICKER_MENU_PROPS}
			className={styles.select}
			sx={COMPACT_SELECT_SX}>
			{languages.map(({ id, label }) => (
				<MenuItem key={id} value={id}>
					{label}
				</MenuItem>
			))}
		</Select>
	);
}

/** The version as plain text (one installed version, the list is unknown, or a TypeScript editor's "TypeScript 5.9.3 · Node 20.11.1"). */
function versionText(runtime, withLanguage) {
	if (runtime.textOnly) return withLanguage ? runtime.text : runtime.shortText;
	const [only] = runtime.options;
	if (only) return withLanguage ? only.label : only.shortLabel;
	if (withLanguage) return runtime.text;
	return runtime.version === ANY_VERSION ? '' : runtime.version;
}

/** The version picker, or plain text when there is nothing to pick from. */
function VersionControl({ runtime, withLanguage, onChange }) {
	if (runtime.options.length > 1) {
		return (
			<Select
				size="small"
				value={runtime.version}
				onChange={(event) => onChange(event.target.value)}
				inputProps={{ 'aria-label': LABELS.version }}
				MenuProps={PICKER_MENU_PROPS}
				className={styles.select}
				sx={COMPACT_SELECT_SX}>
				{runtime.options.map((option) => (
					<MenuItem key={option.version} value={option.version}>
						{withLanguage ? option.label : option.shortLabel}
					</MenuItem>
				))}
			</Select>
		);
	}
	const text = versionText(runtime, withLanguage);
	return text ? <span className={styles.versionText}>{text}</span> : null;
}

/**
 * The language picker (when the page gave code in several languages) and the version picker or
 * text: in the runtime slot when the editor has one (`slot`, see THE RUNTIME SLOT in the
 * header), else on their own, exactly as before.
 */
function RuntimeControls({ slot, languages, language, onLanguageChange, runtime, onVersionChange }) {
	const hasLanguagePicker = languages.length > 1;
	const controls = (
		<>
			{hasLanguagePicker ? <LanguageSelect languages={languages} language={language} onChange={onLanguageChange} /> : null}
			<VersionControl runtime={runtime} withLanguage={!hasLanguagePicker} onChange={onVersionChange} />
		</>
	);
	if (slot === null) return controls;
	return (
		<div className={styles.runtimeSlot} data-slot={slot}>
			{controls}
		</div>
	);
}

/** Run (contained) — or Stop while a run is waiting: the SAME element either way, so the focus stays on it (see the header). */
function RunButton({ running, disabledReason, onRun, onStop }) {
	const look = running ? STOP_LOOK : RUN_LOOK;
	const tooltip = running ? LABELS.stopTooltip : disabledReason || LABELS.runTooltip;
	const RunIcon = look.Icon;
	return (
		<Tooltip title={tooltip}>
			<span className={styles.tooltipAnchor} {...UNLABELLED}>
				<Button
					size="small"
					variant={look.variant}
					color={look.color}
					disableElevation
					startIcon={<RunIcon />}
					onClick={running ? onStop : onRun}
					disabled={!running && Boolean(disabledReason)}
					className={styles.runButton}
					sx={look.sx}>
					{look.label}
				</Button>
			</span>
		</Tooltip>
	);
}

/** Check (outlined) — or Stop while the check is waiting: the SAME element either way, so the focus stays on it. */
function CheckButton({ checking, disabledReason, onCheck, onStop }) {
	const look = checking ? STOP_CHECK_LOOK : CHECK_LOOK;
	const tooltip = checking ? LABELS.stopCheckTooltip : disabledReason || LABELS.checkTooltip;
	return (
		<Tooltip title={tooltip}>
			<span className={styles.tooltipAnchor} {...UNLABELLED}>
				<Button
					size="small"
					variant={look.variant}
					color={look.color}
					disableElevation
					onClick={checking ? onStop : onCheck}
					disabled={!checking && Boolean(disabledReason)}
					className={styles.checkButton}
					sx={look.sx}>
					{look.label}
				</Button>
			</span>
		</Tooltip>
	);
}

/** The light bulb's tooltip: what a press does — "Show hints" while the area is closed, "Hide hints" while it is open. */
export function hintsTooltip(open) {
	return open ? LABELS.hideHints : LABELS.showHints;
}

/** The Solution button's tooltip: "Show the solution" while the panel is closed, "Hide the solution" while it is open. */
export function solutionTooltip(open) {
	return open ? LABELS.hideSolution : LABELS.showSolution;
}

/**
 * The light bulb (the editor has hints): shows and hides the hints area (`hint`: { open, areaId });
 * a toggle with one name, "Hints" (see ACCESSIBILITY). The idle line's cue draws this icon too
 * (IdleLine.jsx > LIGHTBULB_PATH): change both together.
 */
function HintsToggle({ hint, onToggle }) {
	return (
		<IconAction
			label={LABELS.hints}
			tooltip={hintsTooltip(hint.open)}
			pressed={hint.open}
			controls={hint.open ? hint.areaId : undefined}
			onClick={onToggle}>
			<LightbulbOutlinedIcon fontSize="small" />
		</IconAction>
	);
}

/** The Solution button: opens and closes the solution panel (`solution`: { open, panelId }). */
function SolutionAction({ solution, disabled, onToggle }) {
	return (
		<IconAction
			label={LABELS.solution}
			tooltip={solutionTooltip(solution.open)}
			expanded={solution.open}
			controls={solution.open ? solution.panelId : undefined}
			disabled={disabled}
			onClick={onToggle}>
			<CompareArrowsIcon fontSize="small" />
		</IconAction>
	);
}

/** The copy result for screen readers (a polite live region; empty while there is nothing to say). */
function CopyAnnouncement({ copyState, label }) {
	return (
		<span className={styles.visuallyHidden} role="status">
			{copyState === COPY_STATES.idle ? '' : label}
		</span>
	);
}

/**
 * Props: title; languages ([{ id, label }]), language, onLanguageChange; runtime
 * (runtimeChoice.js > chooseRuntime), onVersionChange; running, runDisabledReason (null = Run
 * is enabled); onRun, onStop, onReset, onClear (null = no Clear button), onCopy, copyState
 * (COPY_STATES); onCopyOutput, copyOutputState, hasOutput (false = Copy output greyed out);
 * stdinShown, onToggleStdin; themeFamily (the reader's theme family, checked in the Theme menu:
 * useEditorTheme.js) and onThemeChange (id) — the menu lists editorThemes.js >
 * THEME_MENU_FAMILIES, so a new theme needs nothing here.
 * An exercise's buttons (each left out when its prop is null, the default; any of them, or a
 * TypeScript `language`, gives the header its runtime slot):
 *   hint      { open, areaId } (the hints area shown, and its DOM id), with onToggleHints
 *   solution  { open, panelId, disabled }, with onToggleSolution
 *   check     { checking, disabledReason }, with onCheck and onStopCheck
 */
export default function Toolbar({
	title,
	languages,
	language,
	onLanguageChange,
	runtime,
	onVersionChange,
	running,
	runDisabledReason,
	onRun,
	onStop,
	onReset,
	onClear,
	onCopy,
	copyState,
	onCopyOutput,
	copyOutputState,
	hasOutput,
	stdinShown,
	onToggleStdin,
	themeFamily,
	onThemeChange,
	hint = null,
	onToggleHints,
	solution = null,
	onToggleSolution,
	check = null,
	onCheck,
	onStopCheck,
}) {
	const buttons = { hint: hint !== null, solution: solution !== null, check: check !== null };
	const slot = runtimeSlotFor({ buttons, language, languageCount: languages.length });
	const copyLook = copyLookOf(COPY_CODE_LOOK, copyState);
	const CopyIcon = copyLook.Icon;
	const outputLook = copyLookOf(COPY_OUTPUT_LOOK, copyOutputState);
	const OutputIcon = outputLook.Icon;
	const outputTooltip = hasOutput || copyOutputState !== COPY_STATES.idle ? outputLook.label : LABELS.copyOutputNone;
	return (
		<div className={styles.toolbar}>
			<div className={styles.identity}>
				<span className={styles.title} title={title}>
					{title}
				</span>
				<RuntimeControls
					slot={slot}
					languages={languages}
					language={language}
					onLanguageChange={onLanguageChange}
					runtime={runtime}
					onVersionChange={onVersionChange}
				/>
			</div>
			<div className={styles.actions}>
				<IconAction label={LABELS.reset} onClick={onReset}>
					<RestartAltIcon fontSize="small" />
				</IconAction>
				<IconAction label={LABELS.copy} tooltip={copyLook.label} onClick={onCopy}>
					<CopyIcon fontSize="small" />
				</IconAction>
				{onClear ? (
					<IconAction label={LABELS.clear} onClick={onClear}>
						<ClearAllIcon fontSize="small" />
					</IconAction>
				) : null}
				<IconAction
					label={LABELS.inputField}
					tooltip={stdinShown ? LABELS.hideInput : LABELS.showInput}
					pressed={stdinShown}
					onClick={onToggleStdin}>
					<KeyboardIcon fontSize="small" />
				</IconAction>
				<IconAction label={LABELS.copyOutput} tooltip={outputTooltip} onClick={onCopyOutput} disabled={!hasOutput}>
					<OutputIcon fontSize="small" />
				</IconAction>
				<ThemeMenu families={THEME_MENU_FAMILIES} current={themeFamily} onChange={onThemeChange} />
				{hint ? <HintsToggle hint={hint} onToggle={onToggleHints} /> : null}
				{solution ? <SolutionAction solution={solution} disabled={solution.disabled} onToggle={onToggleSolution} /> : null}
				{check ? (
					// Check and Run wrap together (.runGroup): on a phone Run never sits alone on a line of its own.
					<span className={styles.runGroup}>
						<CheckButton checking={check.checking} disabledReason={check.disabledReason} onCheck={onCheck} onStop={onStopCheck} />
						<RunButton running={running} disabledReason={runDisabledReason} onRun={onRun} onStop={onStop} />
					</span>
				) : (
					<RunButton running={running} disabledReason={runDisabledReason} onRun={onRun} onStop={onStop} />
				)}
			</div>
			<CopyAnnouncement copyState={copyState} label={copyLook.label} />
			<CopyAnnouncement copyState={copyOutputState} label={outputLook.label} />
		</div>
	);
}
