// CustomToolbar: the Data Grid demo on the docs features page, with its toolbar on.
// What it is for: shows Columns, Filters, Export and Search working on a small table of four rows.
// How to change it: the table is `columns` and `rows`. TOOLBAR_STYLE says why the toolbar is aligned.
import * as React from 'react';
import {DataGrid} from '@mui/x-data-grid';

import { useColorMode } from '@docusaurus/theme-common';
import { ThemeProvider, createTheme } from '@mui/material/styles';
const muiDarkTheme = createTheme({ palette: { mode: 'dark' } });
const muiLightTheme = createTheme({ palette: { mode: 'light' } });

const columns = [
	{field: 'commodity', headerName: 'Commodity', flex: 1, minWidth: 130},
	{field: 'market', headerName: 'Market', flex: 1, minWidth: 120},
	{field: 'quantity', headerName: 'Quantity', type: 'number', width: 110},
	{field: 'unitPrice', headerName: 'Unit price', type: 'number', width: 110},
];

const rows = [
	{id: 1, commodity: 'Wheat', market: 'Chicago', quantity: 245, unitPrice: 6.42},
	{id: 2, commodity: 'Coffee', market: 'New York', quantity: 180, unitPrice: 4.18},
	{id: 3, commodity: 'Cotton', market: 'Memphis', quantity: 320, unitPrice: 0.86},
	{id: 4, commodity: 'Corn', market: 'Chicago', quantity: 410, unitPrice: 4.07},
];

/**
 * Puts the toolbar's buttons at its start. The grid's default is its end, and an empty Search box
 * shrinks when it loses focus, so the buttons beside it slid away between a mouse press and its
 * release, and the click was lost. At the start, nothing to the left of Search moves. On a phone
 * this also keeps Columns and Filters in view while the box is open.
 */
const TOOLBAR_STYLE = {justifyContent: 'start'};

export default function ExportCustomToolbar () {
  const { colorMode } = useColorMode();
  const muiThemeToUse = colorMode === 'dark' ? muiDarkTheme : muiLightTheme;
  const muiTheme = createTheme(muiThemeToUse);

  return (
    <ThemeProvider theme={muiTheme}>
			<div style={{ height: 300, width: '100%' }}>
				<DataGrid
					rows={rows}
					columns={columns}
					showToolbar
					slotProps={{toolbar: {style: TOOLBAR_STYLE}}}
				/>
			</div>
    </ThemeProvider>
  );
}
