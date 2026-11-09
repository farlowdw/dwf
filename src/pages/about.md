---
title: About
description: About the site author
hide_table_of_contents: false
---

import React from 'react';
import { Grid, Box, Typography } from '@mui/material';
import Link from '@docusaurus/Link';
import DocsLink from '@site/src/components/DocsLink';
import ResponsiveAboutAvatar from '@site/src/components/ResponsiveAboutAvatar';

<Grid>
  <Grid>
    <ResponsiveAboutAvatar />
    <Box sx={{ mt: 4, display: 'flex', alignItems: 'center' }}>
      <Box sx={{ flexGrow: 1 }}>
        <Typography variant="h4">Contact Me</Typography>
        <Typography component={'div'}>
            Comments can be provided for most posts on this site. Page-specific comments invite interactive discussion of a public nature (you just need to be signed in to your GitHub account). If, however, you'd like to reach out to me personally, then please consider <a href="mailto:daniel@danielwfarlow.com?subject=Hey%20Daniel%21%20Nice%20Website%21">sending me an email</a>.
        </Typography>
      </Box>
    </Box>
  </Grid>
</Grid>
