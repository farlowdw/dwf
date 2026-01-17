import * as React from 'react';
import Box from '@mui/material/Box';
import Rating from '@mui/material/Rating';
import Typography from '@mui/material/Typography';

import { useColorMode } from '@docusaurus/theme-common';
import { ThemeProvider, createTheme } from '@mui/material/styles';
const muiLightTheme = createTheme({ palette: { mode: 'light' } });
const muiDarkTheme = createTheme({ palette: { mode: 'dark' } });

export default function StarRating({
	value,
  label,
  valueMeaning = '',
	ratingName = '',
	isDisabled = false,
	isReadOnly = true,
	ratingMax = 4,
	ratingSize = 'medium',
  styles={}
}) {
	const { colorMode } = useColorMode();
	const muiTheme = colorMode === 'dark' ? muiDarkTheme : muiLightTheme;

  const starRatingCorrespondence = {
    1: 'Poor',
    2: 'Could use improvement',
    3: 'Solid',
    4: 'Excellent'
  }

  const labelSummary = !valueMeaning ? starRatingCorrespondence[value] : valueMeaning;

	return (
		<ThemeProvider theme={muiTheme}>
			<Box
				sx={{
					'& > legend': { mt: 2 },
          'marginTop': '1em',
          'marginBottom': '1em',
				}}>
          <Typography 
            component="legend"
          >{label}
          </Typography>
          <Box sx={{
            display: 'flex',
            alignItems: 'center'
          }}>
            <Rating
              value={value ? value : null}
              name={ratingName}
              max={ratingMax}
              size={ratingSize}
              disabled={isDisabled}
              readOnly={isReadOnly}
              sx={styles}
            />
            <Typography>&nbsp;&nbsp;{labelSummary}</Typography>
          </Box>
			</Box>
		</ThemeProvider>
	);
}
