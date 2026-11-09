/**
 * shared/components/Asterisk/index.jsx — a small raised [*] inside a sentence, whose tooltip holds
 * the aside: <Asterisk>the aside</Asterisk>. A site reaches it through its one-line stub,
 * src/components/Asterisk/index.jsx, which is what a note imports.
 *
 * HOW TO CHANGE IT  The mark and its cursor: the `symbol` and `cursor` props, or their defaults
 * below. The tooltip's colours: the Tooltip's slotProps. The link's two blues: the sx on <Link>.
 */
import React from 'react';
import Tooltip from '@mui/material/Tooltip';
import Link from '@mui/material/Link';
import { useColorMode } from '@docusaurus/theme-common';

/**
 *
 * @param {string} cursor Symbol to be used when hovering over the asterisk
 * @param {string} symbol Symbol to be used as asterisk
 */
export default function Asterisk({
	// symbol to be used as asterisk
  cursor = 'help',
	symbol = '[*]',
	children = '',
}) {
  const { colorMode } = useColorMode();
	return (
		<Tooltip
			title={children}
			placement="top"
			arrow
			slotProps={{
				tooltip: {
					sx: {
						color: '#E3E3E3',
						backgroundColor: 'rgba(109, 109, 109, 1)',
					},
				},
			}}>
			<span style={{cursor, verticalAlign: 'super', marginLeft: '1px', fontSize: '0.75em'}}><Link sx={{color: colorMode == 'dark' ? '#48adf6' : '#0676c8'}}>{symbol}</Link></span>
		</Tooltip>
	);
}
