/**
 * ThemeMenu.jsx — the editor header's Theme button (a palette icon, tooltip "Editor theme") and
 * the menu it opens: one entry per theme family, the current one checked (2026-10-25: the
 * reader picks the editor's colours; VS Code's stay the default).
 *
 *   ┌──────────────────────────────────────────────────────────┐
 *   │ ✓  [Aa|Aa]  VS Code                                      │
 *   │             Follows the site's light / dark switch       │
 *   │    [Aa]     Dracula (like the site's code blocks)        │
 *   │             Always dark                                  │
 *   └──────────────────────────────────────────────────────────┘
 *
 * Each entry: a check mark on the current family (an empty space on the others), a swatch (one
 * small box per variant, light first: its background with "Aa" in its text colour, the "a" in
 * its accent colour when the family gives one; a lone dark box stands in the dark column, so
 * the labels line up), the label, and a note under it — the family's
 * own `note` when it has one, else "Follows the site's light / dark switch" for a family with a
 * light and a dark variant, "Always dark" (or light) for a family with one.
 *
 * Only draws: the families come in as a prop (this file never imports the theme registry,
 * editorThemes.js), and a pick goes out through `onChange`; storing the choice and recolouring
 * every editor on the page is useEditorTheme.js's job.
 *
 * PROPS
 *   families  [{ id, label, note?, swatches: [{ mode: 'light' | 'dark', background,
 *             foreground, accent? }] }] — in menu order, one swatch per variant. An empty list
 *             draws nothing (there is nothing to pick).
 *   current   the checked family's id (one no entry has checks none)
 *   onChange  (id) => void — called with the picked family's id, only when it differs from
 *             `current`; picking the current one just closes the menu
 *
 * ACCESSIBILITY
 *   - The button: aria-label "Editor theme", aria-haspopup="menu", and aria-expanded="true"
 *     plus aria-controls while the menu is open (left out while it is closed, as MUI's own menu
 *     examples and the ARIA practices' menu button do); the menu is labelled by the button.
 *   - Entries are MUI MenuItems with role="menuitemradio": MUI sets aria-checked from
 *     `selected`, so a screen reader hears which theme is on. The check mark repeats it without
 *     colour. The swatches are aria-hidden (the label names the theme).
 *   - The keyboard: Enter / Space / ↓ on the button opens the menu with the focus on the
 *     current entry (MUI's 'selectedMenu' variant), ↑ / ↓ move, Enter picks, Escape closes, and
 *     the focus goes back to the button either way (MUI's Menu). Typing a letter moves to the
 *     next entry whose label starts with it (MUI's type-ahead, which reads an entry's
 *     innerText: the swatch's "Aa" is CSS generated text, so it never comes first).
 *   - The tooltip hides while the menu is open (an empty title), so it never sits on the menu.
 *   - The tooltip's <span> wrapper carries no aria-label (UNLABELLED, as Toolbar.jsx's):
 *     MUI's Tooltip would put its text there, on a plain span.
 *
 * LOOKS  The button is a small IconButton in the header's shared tooltip wrapper
 * (styles.module.css > .tooltipAnchor), the size of every other header icon button, so the
 * placeholder's icon space (index.jsx) fits it. The menu is drawn in a portal outside the editor's
 * frame: the frame's --ce-* colours do not reach it; MUI's theme (the editor's <MuiScope> around
 * it, MuiScope.jsx, through React's context) colours the menu, and the swatches carry their own colours.
 * The menu's own layout: ThemeMenu.module.css.
 *
 * HOW TO CHANGE IT
 *   The words: WORDS below. The icon: the @mui/icons-material import. Where the menu opens:
 *   MENU_ANCHOR / MENU_ORIGIN. The swatch's sample text: WORDS.sample; its size and outline:
 *   ThemeMenu.module.css. A new theme is NOT a change here: it is one entry in the registry
 *   (editorThemes.js), which the editor turns into `families`.
 */

import { useId, useState } from 'react';
import IconButton from '@mui/material/IconButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Tooltip from '@mui/material/Tooltip';
import CheckIcon from '@mui/icons-material/Check';
import PaletteOutlinedIcon from '@mui/icons-material/PaletteOutlined';
import menuStyles from './ThemeMenu.module.css';
import styles from './styles.module.css';

/** Every word the button and the menu show. */
export const WORDS = Object.freeze({
	button: 'Editor theme',
	followsSite: "Follows the site's light / dark switch",
	alwaysLight: 'Always light',
	alwaysDark: 'Always dark',
	sample: 'Aa',
});

/** The two variants' modes, in the order the swatch draws them (light, then dark). */
const MODE_ORDER = Object.freeze(['light', 'dark']);

/** A one-variant family's note, by its mode. */
const ONE_MODE_NOTES = Object.freeze({ light: WORDS.alwaysLight, dark: WORDS.alwaysDark });

/** The menu opens under the button, its right edge on the button's (the button sits at the header's right). */
const MENU_ANCHOR = Object.freeze({ vertical: 'bottom', horizontal: 'right' });
const MENU_ORIGIN = Object.freeze({ vertical: 'top', horizontal: 'right' });

/** Spread on the tooltip's <span> wrapper (see ACCESSIBILITY in the header; the same as Toolbar.jsx's). */
const UNLABELLED = Object.freeze({ 'aria-label': undefined });

/** A family's swatches, light first (a swatch without a known mode goes last, in its order). */
export function orderedSwatches(swatches = []) {
	const rank = (swatch) => {
		const index = MODE_ORDER.indexOf(swatch.mode);
		return index === -1 ? MODE_ORDER.length : index;
	};
	return [...swatches].sort((a, b) => rank(a) - rank(b));
}

/** The note under a family's label (see the header): its own `note`, else what its variants say. */
export function noteFor(family) {
	if (family.note) return family.note;
	const swatches = family.swatches ?? [];
	if (swatches.length >= MODE_ORDER.length) return WORDS.followsSite;
	if (swatches.length === 1) return ONE_MODE_NOTES[swatches[0].mode] ?? '';
	return '';
}

/**
 * One variant's box: its background, "Aa" in its text colour (the "a" in its accent, when given).
 * The letters are CSS generated text (data-letter, ThemeMenu.module.css > .sampleLetter), not
 * text in the page: MUI's type-ahead reads each entry's innerText, which then starts with the
 * family's label (see ACCESSIBILITY).
 */
function SwatchPart({ swatch }) {
	const firstLetter = WORDS.sample.slice(0, 1);
	const otherLetters = WORDS.sample.slice(1);
	const accentStyle = swatch.accent ? { color: swatch.accent } : undefined;
	return (
		<span className={menuStyles.swatchPart} data-mode={swatch.mode} style={{ backgroundColor: swatch.background, color: swatch.foreground }}>
			<span className={menuStyles.sampleLetter} data-letter={firstLetter} />
			<span className={menuStyles.sampleLetter} data-letter={otherLetters} style={accentStyle} />
		</span>
	);
}

/**
 * A family's swatch: one box per variant, light first; decorative (the label names the theme).
 * It sits in a slot two boxes wide, so every label starts at the same place; a one-variant
 * family's box stands in its mode's column (`data-only`: a dark-only box under the others'
 * dark boxes).
 */
function ThemeSwatch({ swatches = [] }) {
	const onlyMode = swatches.length === 1 ? swatches[0].mode : undefined;
	return (
		<span className={menuStyles.swatchSlot} aria-hidden="true" data-only={onlyMode}>
			<span className={menuStyles.swatch}>
				{orderedSwatches(swatches).map((swatch, index) => (
					<SwatchPart key={`${swatch.mode}-${index}`} swatch={swatch} />
				))}
			</span>
		</span>
	);
}

/** One entry of the menu (a menuitemradio, checked when it is the current family). */
function ThemeItem({ family, checked, onPick }) {
	return (
		<MenuItem role="menuitemradio" selected={checked} onClick={() => onPick(family.id)}>
			<ListItemIcon>{checked ? <CheckIcon fontSize="small" /> : null}</ListItemIcon>
			<ThemeSwatch swatches={family.swatches} />
			<ListItemText className={menuStyles.text} primary={family.label} secondary={noteFor(family) || null} />
		</MenuItem>
	);
}

/**
 * The menu itself (ThemeMenu draws it; exported for the server-render test). `menuId` /
 * `buttonId`: the ids that tie it to its button — `menuId` is on the list with role="menu"
 * (what the button's aria-controls names), not on MUI's presentation wrapper around it. The
 * other props go to MUI's Menu (the test passes `disablePortal`: the server draws no portal).
 * `disableScrollLock`: the page's scroll is left alone while the menu is open, as the header's
 * pickers leave it (Toolbar.jsx > PICKER_MENU_PROPS: MUI's lock moved a phone's page that is a
 * few pixels wider than the screen).
 */
export function ThemeMenuList({ anchorEl, open, onClose, families, current, onPick, menuId, buttonId, ...menuProps }) {
	return (
		<Menu
			anchorEl={anchorEl}
			open={open}
			onClose={onClose}
			disableScrollLock
			anchorOrigin={MENU_ANCHOR}
			transformOrigin={MENU_ORIGIN}
			slotProps={{ list: { id: menuId, 'aria-labelledby': buttonId, dense: true, className: menuStyles.list } }}
			{...menuProps}>
			{families.map((family) => (
				<ThemeItem key={family.id} family={family} checked={family.id === current} onPick={onPick} />
			))}
		</Menu>
	);
}

/** The Theme button and its menu (props: see PROPS in the header). */
export default function ThemeMenu({ families = [], current, onChange }) {
	const [anchorEl, setAnchorEl] = useState(null);
	const buttonId = useId();
	const menuId = useId();
	const open = anchorEl !== null;
	const close = () => setAnchorEl(null);
	const pick = (id) => {
		close();
		if (id !== current) onChange?.(id);
	};
	if (families.length === 0) return null;
	return (
		<>
			<Tooltip title={open ? '' : WORDS.button}>
				<span className={styles.tooltipAnchor} {...UNLABELLED}>
					<IconButton
						id={buttonId}
						size="small"
						aria-label={WORDS.button}
						aria-haspopup="menu"
						aria-expanded={open ? 'true' : undefined}
						aria-controls={open ? menuId : undefined}
						onClick={(event) => setAnchorEl(event.currentTarget)}>
						<PaletteOutlinedIcon fontSize="small" />
					</IconButton>
				</span>
			</Tooltip>
			<ThemeMenuList anchorEl={anchorEl} open={open} onClose={close} families={families} current={current} onPick={pick} menuId={menuId} buttonId={buttonId} />
		</>
	);
}
