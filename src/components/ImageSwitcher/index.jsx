import React from 'react';
import { useColorMode } from '@docusaurus/theme-common';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';

const ImageSwitcher = ({ lightImageSrc, darkImageSrc }) => {
	const { colorMode } = useColorMode();
	const config = useDocusaurusContext();

	return (
		<React.Fragment>
			<img
				src={colorMode === 'dark' ? darkImageSrc : lightImageSrc}
				alt="Example banner"
			/>
		</React.Fragment>
	);
};

export default ImageSwitcher;
