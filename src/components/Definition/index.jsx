import React from 'react';
import { useColorMode } from '@docusaurus/theme-common';

export default function Definition({ children }) {
  const { colorMode } = useColorMode();
  const textColor = colorMode === 'dark' ? '#56C5D0' : '#0086BC';
	return (
		<span
			style={{
				borderRadius: '2px',
				color: textColor,
        fontStyle: 'italic',
        paddingRight: '0.2rem',
			}}>
			{children}
		</span>
	);
}