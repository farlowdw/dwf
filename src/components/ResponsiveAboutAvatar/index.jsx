import React from 'react';
import { useMediaQuery, Box, Typography, Avatar } from '@mui/material';
import Link from '@docusaurus/Link';
import DocsLink from '@site/src/components/DocsLink';

const ResponsiveAboutAvatar = () => {
	const isSmallScreen = useMediaQuery('(max-width:1000px)');

	return (
		<Box
			sx={{
				display: 'flex',
				flexDirection: isSmallScreen ? 'column-reverse' : 'row',
				alignItems: 'center',
				justifyContent: 'center',
			}}>
			<Box sx={{ flexGrow: 1 }}>
        <Typography variant="h4">About Daniel Farlow</Typography>
        <Typography component={'div'}>
            Hey there! I'm Daniel, the author of this site, a site dedicated to sharing my personal interests and lived experiences. The <Link to="/docs/intro">explorations page</Link> may give you a better sense of what you can expect to find on this site. But <em>this</em> small page is more about myself. And who am I exactly? I love to learn, educate, experiment, and solve problems &#8212; so whatever the mashed up noun version of all that is. <em>Come on, you know what I mean: why should I read what you've written? What are your background, credentials, and training?</em>
        </Typography>
        <Typography component={'div'} sx={{ marginTop: '20px' }}>
            The answer to the second question, however prosaic, may be found in <DocsLink to="/resume" target="_blank">my resume</DocsLink>. I'll even save you a click by offering a TLDR for my occupational history: researcher at an analytical chemistry lab (high school and college), math teacher (directly after college), and now software engineer (present). But answering the first question is far more interesting. I generally don't feel as though an answer to the second question provides, or even implies, an answer to the first (for myself or others). A person's work should stand on its own merit.
        </Typography>
        <Typography component={'div'} sx={{ marginTop: '20px' }}>
            And that is what I hope you will find on this site. Work standing on its own merit that makes it worth reading. But you'll have to be the judge of that for yourself. If any of my entries resonate with you, then I'll consider that to be a great success! I'd love to hear what resonated with you and why. I'd also love to hear what <em>didn't</em> resonate with you and how you might suggest doing things differently (specific posts or content in general).
        </Typography>
			</Box>
			<DocsLink to="/resume" target="_blank">
				<Avatar
					src={require('@site/static/img/headshot.jpeg').default}
					alt="Daniel Farlow"
					sx={{
						borderRadius: '50%',
            marginLeft: isSmallScreen ? '0px' : '10px',
            marginBottom: isSmallScreen ? '10px' : '0px',
						height: 130,
						width: 130,
						ml: 2,
						mt: isSmallScreen ? 2 : 0,
					}}
				/>
			</DocsLink>
		</Box>
	);
};

export default ResponsiveAboutAvatar;
