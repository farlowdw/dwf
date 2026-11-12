---
title: Synchronizing light and dark modes when using Material UI with Docusaurus
draft: false
description: This post details how to synchronize Material UI's light and dark palettes with Docusaurus's light and dark modes, respectively.
tags: 
  - Light/Dark Mode
  - Theming
  - Material UI
keywords: 
  - material ui
  - theming
  - light mode
  - dark mode
  - docusaurus
authors: 
  - farlow
hide_table_of_contents: false
toc_min_heading_level: 2
toc_max_heading_level: 6
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';
import LocalVarSpan from '@site/src/components/LocalVarSpan';
import VerticalLinearStepper from '@site/src/components/VerticalLinearStepper';
import CodeBlock from '@theme/CodeBlock';

import DataGridBad from '@site/src/components/_IllustrationsOnly/DataGridBad';
import DataGridGood from '@site/src/components/_IllustrationsOnly/DataGridGood';

This post details how to synchronize Material UI's light and dark palettes with Docusaurus's light and dark modes, respectively.

<!--truncate-->

<details open>
<summary> TLDR</summary>

To get MUI to play nicely with Docusaurus when it comes to light and dark modes, paste the following code after your normal `import` statements for a React component within which you plan to utilize MUI functionality:

```jsx
import { useColorMode } from '@docusaurus/theme-common';
import { ThemeProvider, createTheme } from '@mui/material/styles';
const muiLightTheme = createTheme({ palette: { mode: 'light' } });
const muiDarkTheme = createTheme({ palette: { mode: 'dark' } });
```

Paste the following *between* the component function signature and its `return` statement:

```jsx
const { colorMode } = useColorMode();
const muiTheme = colorMode === 'dark' ? muiDarkTheme : muiLightTheme;
```

Finally, wrap everything in the `return` statement within `ThemeProvider` in the following manner:

```jsx
...
return (
  <ThemeProvider theme={muiTheme}>
    ...
  </ThemeProvider>
);
```

</details>

## Problem description and context

Getting Material UI (MUI) to work with a site powered by Docusaurus may not seem to be all that difficult at first &#8212; you can plug and play and largely be happy to see MUI components behaving as expected. Unless you have light and dark modes enabled for your Docusaurus site (i.e., *most* Docusaurus sites). This can become a real problem.

For example, suppose we are interested in using MUI's [`DataGrid`](https://mui.com/x/react-data-grid/) component. If we copy the code for the very first example in the MUI docs for the `DataGrid` component, then we will get the default behavior as shown below in the first tab (toggle the light and dark modes for this site to *see* the problem). The default behavior, for this site at least, is that the data grid is perfectly fine in light mode, but it quickly becomes almost incomprehensible in dark mode. We need a solution that will produce the behavior illustrated below in the second tab (toggle the light and dark modes for this site again to note the difference).

<Tabs>
<TabItem value='bad' label='Default behavior'>

<DataGridBad />

</TabItem>
<TabItem value='good' label='Desired behavior'>

<DataGridGood />

</TabItem>
</Tabs>

## One of many possible solutions

There are *many* possible solutions to the problem outlined above. I will present a stunningly simple solution that has worked for me &#8212; if you feel you have a better solution, then please share!

The following code was lifted directly from MUI's docs for the `DataGrid` example above (default behavior):

```jsx
import * as React from 'react';
import Box from '@mui/material/Box';
import { DataGrid } from '@mui/x-data-grid';

const columns = [
  { field: 'id', headerName: 'ID', width: 90 },
  {
    field: 'firstName',
    headerName: 'First name',
    width: 150,
    editable: true,
  },
  {
    field: 'lastName',
    headerName: 'Last name',
    width: 150,
    editable: true,
  },
  {
    field: 'age',
    headerName: 'Age',
    type: 'number',
    width: 110,
    editable: true,
  },
  {
    field: 'fullName',
    headerName: 'Full name',
    description: 'This column has a value getter and is not sortable.',
    sortable: false,
    width: 160,
    valueGetter: (value, row) =>
      `${row.firstName || ''} ${row.lastName || ''}`,
  },
];

const rows = [
  { id: 1, lastName: 'Snow', firstName: 'Jon', age: 35 },
  { id: 2, lastName: 'Lannister', firstName: 'Cersei', age: 42 },
  { id: 3, lastName: 'Lannister', firstName: 'Jaime', age: 45 },
  { id: 4, lastName: 'Stark', firstName: 'Arya', age: 16 },
  { id: 5, lastName: 'Targaryen', firstName: 'Daenerys', age: null },
  { id: 6, lastName: 'Melisandre', firstName: null, age: 150 },
  { id: 7, lastName: 'Clifford', firstName: 'Ferrara', age: 44 },
  { id: 8, lastName: 'Frances', firstName: 'Rossini', age: 36 },
  { id: 9, lastName: 'Roxie', firstName: 'Harvey', age: 65 },
];

export default function SampleDataGrid() {
  return (
    <Box sx={{ height: 400, width: '100%' }}>
      <DataGrid
        rows={rows}
        columns={columns}
        initialState={{
          pagination: { paginationModel: { pageSize: 5 } },
        }}
        pageSizeOptions={[5]}
        checkboxSelection
        disableRowSelectionOnClick
      />
    </Box>
  );
}
```

To get the desired behavior, we just need to make the following code changes (only highlighted lines have been changed):

```jsx
import * as React from 'react';
import Box from '@mui/material/Box';
import { DataGrid } from '@mui/x-data-grid';
// highlight-start
import { useColorMode } from '@docusaurus/theme-common';
import { ThemeProvider, createTheme } from '@mui/material/styles';
const muiLightTheme = createTheme({ palette: { mode: 'light' } });
const muiDarkTheme = createTheme({ palette: { mode: 'dark' } });
// highlight-end

const columns = [
  { field: 'id', headerName: 'ID', width: 90 },
  {
    field: 'firstName',
    headerName: 'First name',
    width: 150,
    editable: true,
  },
  {
    field: 'lastName',
    headerName: 'Last name',
    width: 150,
    editable: true,
  },
  {
    field: 'age',
    headerName: 'Age',
    type: 'number',
    width: 110,
    editable: true,
  },
  {
    field: 'fullName',
    headerName: 'Full name',
    description: 'This column has a value getter and is not sortable.',
    sortable: false,
    width: 160,
    valueGetter: (value, row) =>
      `${row.firstName || ''} ${row.lastName || ''}`,
  },
];

const rows = [
  { id: 1, lastName: 'Snow', firstName: 'Jon', age: 35 },
  { id: 2, lastName: 'Lannister', firstName: 'Cersei', age: 42 },
  { id: 3, lastName: 'Lannister', firstName: 'Jaime', age: 45 },
  { id: 4, lastName: 'Stark', firstName: 'Arya', age: 16 },
  { id: 5, lastName: 'Targaryen', firstName: 'Daenerys', age: null },
  { id: 6, lastName: 'Melisandre', firstName: null, age: 150 },
  { id: 7, lastName: 'Clifford', firstName: 'Ferrara', age: 44 },
  { id: 8, lastName: 'Frances', firstName: 'Rossini', age: 36 },
  { id: 9, lastName: 'Roxie', firstName: 'Harvey', age: 65 },
];

export default function SampleDataGrid() {
  // highlight-start
  const { colorMode } = useColorMode();
  const muiTheme = colorMode === 'dark' ? muiDarkTheme : muiLightTheme;
  // highlight-end
  return (
    // highlight-next-line
    <ThemeProvider theme={muiTheme}>
      <Box sx={{ height: 400, width: '100%' }}>
        <DataGrid
          rows={rows}
          columns={columns}
          initialState={{
            pagination: { paginationModel: { pageSize: 5 } },
          }}
          pageSizeOptions={[5]}
          checkboxSelection
          disableRowSelectionOnClick
        />
      </Box>
    // highlight-next-line
    </ThemeProvider>
  );
}
```

## Refinements

An immediate objection you may have to the solution above is that the styling for all of your components that use MUI will be different from the styling of your site. This is true. As with nearly all development tasks, you have a tradeoff decision to make: simplicity at the cost of quality or quality at the cost of simplicity?

In the solution above, the default MUI light and dark themes are being used, respectively:

```jsx
const muiLightTheme = createTheme({ palette: { mode: 'light' } });
const muiDarkTheme = createTheme({ palette: { mode: 'dark' } });
```

How are these light and dark themes actually defined though? As [the MUI docs note](https://mui.com/material-ui/customization/palette/):

> The palette enables you to modify the color of the components to suit your brand.

The palette's default values may be found using MUI's [theme explorer](https://mui.com/material-ui/customization/default-theme/?expand-path=$.palette) or by opening the dev tools console on the [default values page](https://mui.com/material-ui/customization/palette/#default-values) and exploring `window.theme.palette`. As noted on [MUI's dark mode page](https://mui.com/material-ui/customization/dark-mode/):

> You can make your application use the dark theme as the default—regardless of the user's preference—by adding `mode: 'dark'` to the `createTheme` helper:
> 
> ```jsx
> // highlight-next-line
> import { ThemeProvider, createTheme } from '@mui/material/styles';
> import CssBaseline from '@mui/material/CssBaseline';
> 
> // highlight-start
> const darkTheme = createTheme({
>   palette: {
>     mode: 'dark',
>   },
> });
> // highlight-end
> 
> function App() {
>   return (
>     // highlight-next-line
>     <ThemeProvider theme={darkTheme}>
>       <CssBaseline />
>       <main>This app is using the dark mode</main>
>     // highlight-next-line
>     </ThemeProvider>
>   );
> }
> 
> export default App;
> ```
> 
> Adding `mode: 'dark'` to the `createTheme` helper modifies several palette values [...].
> 
> Adding `<CssBaseline />` inside of the `<ThemeProvider>` component will also enable dark mode for the app's background.
> 
> **Note:** setting the dark mode this way only works if you are using [the default palette](https://mui.com/material-ui/customization/default-theme/). If you have a custom palette, make sure that you have the correct values based on the `mode`.  [...]

The takeaway from the excerpts above? We are only interested in using the default palettes for light and dark mode. Only the highlighted lines of code above are of any interest to us for the very simple solution. If you want to get fancy with your palettes, ostensibly to make MUI's light and dark modes match those of your Docusaurus site, then you may be in for a bit of work. MUI's default light and dark palettes are included below for reference in case you want to really customize things.

<details>
<summary> Light and dark palettes for Material UI (default values)</summary>

Visit [MUI's default theme page](https://mui.com/material-ui/customization/default-theme/?expand-path=$.palette) and run the following in the console (assuming you are using Chrome):

```js
copy(JSON.stringify(window.theme.palette,null,2))
```

Run the code above *twice* (once for when you have chosen light mode on the default theme page and again for when you have chosen dark mode). The resultant values are shown in the first two tabs below. You can also run

```js
copy(JSON.stringify(window.theme,null,2))
```

to get the *complete* themes (shown in the last two tabs below).

<Tabs>
<TabItem value='light' label='Light palette'>

```json
{
  "mode": "light",
  "common": {
    "black": "#000",
    "white": "#fff"
  },
  "primary": {
    "main": "#1976d2",
    "light": "#42a5f5",
    "dark": "#1565c0",
    "contrastText": "#fff"
  },
  "secondary": {
    "main": "#9c27b0",
    "light": "#ba68c8",
    "dark": "#7b1fa2",
    "contrastText": "#fff"
  },
  "error": {
    "main": "#d32f2f",
    "light": "#ef5350",
    "dark": "#c62828",
    "contrastText": "#fff"
  },
  "warning": {
    "main": "#ed6c02",
    "light": "#ff9800",
    "dark": "#e65100",
    "contrastText": "#fff"
  },
  "info": {
    "main": "#0288d1",
    "light": "#03a9f4",
    "dark": "#01579b",
    "contrastText": "#fff"
  },
  "success": {
    "main": "#2e7d32",
    "light": "#4caf50",
    "dark": "#1b5e20",
    "contrastText": "#fff"
  },
  "grey": {
    "50": "#fafafa",
    "100": "#f5f5f5",
    "200": "#eeeeee",
    "300": "#e0e0e0",
    "400": "#bdbdbd",
    "500": "#9e9e9e",
    "600": "#757575",
    "700": "#616161",
    "800": "#424242",
    "900": "#212121",
    "A100": "#f5f5f5",
    "A200": "#eeeeee",
    "A400": "#bdbdbd",
    "A700": "#616161"
  },
  "contrastThreshold": 3,
  "tonalOffset": 0.2,
  "text": {
    "primary": "rgba(0, 0, 0, 0.87)",
    "secondary": "rgba(0, 0, 0, 0.6)",
    "disabled": "rgba(0, 0, 0, 0.38)"
  },
  "divider": "rgba(0, 0, 0, 0.12)",
  "background": {
    "paper": "#fff",
    "default": "#fff"
  },
  "action": {
    "active": "rgba(0, 0, 0, 0.54)",
    "hover": "rgba(0, 0, 0, 0.04)",
    "hoverOpacity": 0.04,
    "selected": "rgba(0, 0, 0, 0.08)",
    "selectedOpacity": 0.08,
    "disabled": "rgba(0, 0, 0, 0.26)",
    "disabledBackground": "rgba(0, 0, 0, 0.12)",
    "disabledOpacity": 0.38,
    "focus": "rgba(0, 0, 0, 0.12)",
    "focusOpacity": 0.12,
    "activatedOpacity": 0.12
  }
}
```

</TabItem>
<TabItem value='dark' label='Dark palette'>

```json
{
  "mode": "dark",
  "common": {
    "black": "#000",
    "white": "#fff"
  },
  "primary": {
    "main": "#90caf9",
    "light": "#e3f2fd",
    "dark": "#42a5f5",
    "contrastText": "rgba(0, 0, 0, 0.87)"
  },
  "secondary": {
    "main": "#ce93d8",
    "light": "#f3e5f5",
    "dark": "#ab47bc",
    "contrastText": "rgba(0, 0, 0, 0.87)"
  },
  "error": {
    "main": "#f44336",
    "light": "#e57373",
    "dark": "#d32f2f",
    "contrastText": "#fff"
  },
  "warning": {
    "main": "#ffa726",
    "light": "#ffb74d",
    "dark": "#f57c00",
    "contrastText": "rgba(0, 0, 0, 0.87)"
  },
  "info": {
    "main": "#29b6f6",
    "light": "#4fc3f7",
    "dark": "#0288d1",
    "contrastText": "rgba(0, 0, 0, 0.87)"
  },
  "success": {
    "main": "#66bb6a",
    "light": "#81c784",
    "dark": "#388e3c",
    "contrastText": "rgba(0, 0, 0, 0.87)"
  },
  "grey": {
    "50": "#fafafa",
    "100": "#f5f5f5",
    "200": "#eeeeee",
    "300": "#e0e0e0",
    "400": "#bdbdbd",
    "500": "#9e9e9e",
    "600": "#757575",
    "700": "#616161",
    "800": "#424242",
    "900": "#212121",
    "A100": "#f5f5f5",
    "A200": "#eeeeee",
    "A400": "#bdbdbd",
    "A700": "#616161"
  },
  "contrastThreshold": 3,
  "tonalOffset": 0.2,
  "text": {
    "primary": "#fff",
    "secondary": "rgba(255, 255, 255, 0.7)",
    "disabled": "rgba(255, 255, 255, 0.5)",
    "icon": "rgba(255, 255, 255, 0.5)"
  },
  "divider": "rgba(255, 255, 255, 0.12)",
  "background": {
    "paper": "#121212",
    "default": "#121212"
  },
  "action": {
    "active": "#fff",
    "hover": "rgba(255, 255, 255, 0.08)",
    "hoverOpacity": 0.08,
    "selected": "rgba(255, 255, 255, 0.16)",
    "selectedOpacity": 0.16,
    "disabled": "rgba(255, 255, 255, 0.3)",
    "disabledBackground": "rgba(255, 255, 255, 0.12)",
    "disabledOpacity": 0.38,
    "focus": "rgba(255, 255, 255, 0.12)",
    "focusOpacity": 0.12,
    "activatedOpacity": 0.24
  }
}
```

</TabItem>
<TabItem value='light-complete' label='Complete theme (light palette)'>

```json
{
  "breakpoints": {
    "keys": [
      "xs",
      "sm",
      "md",
      "lg",
      "xl"
    ],
    "values": {
      "xs": 0,
      "sm": 600,
      "md": 900,
      "lg": 1200,
      "xl": 1536
    },
    "unit": "px",
    "internal_mediaKeys": [
      "@media (min-width:0px)",
      "@media (min-width:600px)",
      "@media (min-width:900px)",
      "@media (min-width:1200px)",
      "@media (min-width:1536px)"
    ]
  },
  "direction": "ltr",
  "components": {},
  "palette": {
    "mode": "light",
    "common": {
      "black": "#000",
      "white": "#fff"
    },
    "primary": {
      "main": "#1976d2",
      "light": "#42a5f5",
      "dark": "#1565c0",
      "contrastText": "#fff"
    },
    "secondary": {
      "main": "#9c27b0",
      "light": "#ba68c8",
      "dark": "#7b1fa2",
      "contrastText": "#fff"
    },
    "error": {
      "main": "#d32f2f",
      "light": "#ef5350",
      "dark": "#c62828",
      "contrastText": "#fff"
    },
    "warning": {
      "main": "#ed6c02",
      "light": "#ff9800",
      "dark": "#e65100",
      "contrastText": "#fff"
    },
    "info": {
      "main": "#0288d1",
      "light": "#03a9f4",
      "dark": "#01579b",
      "contrastText": "#fff"
    },
    "success": {
      "main": "#2e7d32",
      "light": "#4caf50",
      "dark": "#1b5e20",
      "contrastText": "#fff"
    },
    "grey": {
      "50": "#fafafa",
      "100": "#f5f5f5",
      "200": "#eeeeee",
      "300": "#e0e0e0",
      "400": "#bdbdbd",
      "500": "#9e9e9e",
      "600": "#757575",
      "700": "#616161",
      "800": "#424242",
      "900": "#212121",
      "A100": "#f5f5f5",
      "A200": "#eeeeee",
      "A400": "#bdbdbd",
      "A700": "#616161"
    },
    "contrastThreshold": 3,
    "tonalOffset": 0.2,
    "text": {
      "primary": "rgba(0, 0, 0, 0.87)",
      "secondary": "rgba(0, 0, 0, 0.6)",
      "disabled": "rgba(0, 0, 0, 0.38)"
    },
    "divider": "rgba(0, 0, 0, 0.12)",
    "background": {
      "paper": "#fff",
      "default": "#fff"
    },
    "action": {
      "active": "rgba(0, 0, 0, 0.54)",
      "hover": "rgba(0, 0, 0, 0.04)",
      "hoverOpacity": 0.04,
      "selected": "rgba(0, 0, 0, 0.08)",
      "selectedOpacity": 0.08,
      "disabled": "rgba(0, 0, 0, 0.26)",
      "disabledBackground": "rgba(0, 0, 0, 0.12)",
      "disabledOpacity": 0.38,
      "focus": "rgba(0, 0, 0, 0.12)",
      "focusOpacity": 0.12,
      "activatedOpacity": 0.12
    }
  },
  "shape": {
    "borderRadius": 4
  },
  "unstable_sxConfig": {
    "border": {
      "themeKey": "borders"
    },
    "borderTop": {
      "themeKey": "borders"
    },
    "borderRight": {
      "themeKey": "borders"
    },
    "borderBottom": {
      "themeKey": "borders"
    },
    "borderLeft": {
      "themeKey": "borders"
    },
    "borderColor": {
      "themeKey": "palette"
    },
    "borderTopColor": {
      "themeKey": "palette"
    },
    "borderRightColor": {
      "themeKey": "palette"
    },
    "borderBottomColor": {
      "themeKey": "palette"
    },
    "borderLeftColor": {
      "themeKey": "palette"
    },
    "outline": {
      "themeKey": "borders"
    },
    "outlineColor": {
      "themeKey": "palette"
    },
    "borderRadius": {
      "themeKey": "shape.borderRadius"
    },
    "color": {
      "themeKey": "palette"
    },
    "bgcolor": {
      "themeKey": "palette",
      "cssProperty": "backgroundColor"
    },
    "backgroundColor": {
      "themeKey": "palette"
    },
    "p": {},
    "pt": {},
    "pr": {},
    "pb": {},
    "pl": {},
    "px": {},
    "py": {},
    "padding": {},
    "paddingTop": {},
    "paddingRight": {},
    "paddingBottom": {},
    "paddingLeft": {},
    "paddingX": {},
    "paddingY": {},
    "paddingInline": {},
    "paddingInlineStart": {},
    "paddingInlineEnd": {},
    "paddingBlock": {},
    "paddingBlockStart": {},
    "paddingBlockEnd": {},
    "m": {},
    "mt": {},
    "mr": {},
    "mb": {},
    "ml": {},
    "mx": {},
    "my": {},
    "margin": {},
    "marginTop": {},
    "marginRight": {},
    "marginBottom": {},
    "marginLeft": {},
    "marginX": {},
    "marginY": {},
    "marginInline": {},
    "marginInlineStart": {},
    "marginInlineEnd": {},
    "marginBlock": {},
    "marginBlockStart": {},
    "marginBlockEnd": {},
    "displayPrint": {
      "cssProperty": false
    },
    "display": {},
    "overflow": {},
    "textOverflow": {},
    "visibility": {},
    "whiteSpace": {},
    "flexBasis": {},
    "flexDirection": {},
    "flexWrap": {},
    "justifyContent": {},
    "alignItems": {},
    "alignContent": {},
    "order": {},
    "flex": {},
    "flexGrow": {},
    "flexShrink": {},
    "alignSelf": {},
    "justifyItems": {},
    "justifySelf": {},
    "gap": {},
    "rowGap": {},
    "columnGap": {},
    "gridColumn": {},
    "gridRow": {},
    "gridAutoFlow": {},
    "gridAutoColumns": {},
    "gridAutoRows": {},
    "gridTemplateColumns": {},
    "gridTemplateRows": {},
    "gridTemplateAreas": {},
    "gridArea": {},
    "position": {},
    "zIndex": {
      "themeKey": "zIndex"
    },
    "top": {},
    "right": {},
    "bottom": {},
    "left": {},
    "boxShadow": {
      "themeKey": "shadows"
    },
    "width": {},
    "maxWidth": {},
    "minWidth": {},
    "height": {},
    "maxHeight": {},
    "minHeight": {},
    "boxSizing": {},
    "font": {
      "themeKey": "font"
    },
    "fontFamily": {
      "themeKey": "typography"
    },
    "fontSize": {
      "themeKey": "typography"
    },
    "fontStyle": {
      "themeKey": "typography"
    },
    "fontWeight": {
      "themeKey": "typography"
    },
    "letterSpacing": {},
    "textTransform": {},
    "lineHeight": {},
    "textAlign": {},
    "typography": {
      "cssProperty": false,
      "themeKey": "typography"
    }
  },
  "internal_cache": {},
  "mixins": {
    "toolbar": {
      "minHeight": 56,
      "@media (min-width:0px)": {
        "@media (orientation: landscape)": {
          "minHeight": 48
        }
      },
      "@media (min-width:600px)": {
        "minHeight": 64
      }
    }
  },
  "shadows": [
    "none",
    "0px 2px 1px -1px rgba(0,0,0,0.2),0px 1px 1px 0px rgba(0,0,0,0.14),0px 1px 3px 0px rgba(0,0,0,0.12)",
    "0px 3px 1px -2px rgba(0,0,0,0.2),0px 2px 2px 0px rgba(0,0,0,0.14),0px 1px 5px 0px rgba(0,0,0,0.12)",
    "0px 3px 3px -2px rgba(0,0,0,0.2),0px 3px 4px 0px rgba(0,0,0,0.14),0px 1px 8px 0px rgba(0,0,0,0.12)",
    "0px 2px 4px -1px rgba(0,0,0,0.2),0px 4px 5px 0px rgba(0,0,0,0.14),0px 1px 10px 0px rgba(0,0,0,0.12)",
    "0px 3px 5px -1px rgba(0,0,0,0.2),0px 5px 8px 0px rgba(0,0,0,0.14),0px 1px 14px 0px rgba(0,0,0,0.12)",
    "0px 3px 5px -1px rgba(0,0,0,0.2),0px 6px 10px 0px rgba(0,0,0,0.14),0px 1px 18px 0px rgba(0,0,0,0.12)",
    "0px 4px 5px -2px rgba(0,0,0,0.2),0px 7px 10px 1px rgba(0,0,0,0.14),0px 2px 16px 1px rgba(0,0,0,0.12)",
    "0px 5px 5px -3px rgba(0,0,0,0.2),0px 8px 10px 1px rgba(0,0,0,0.14),0px 3px 14px 2px rgba(0,0,0,0.12)",
    "0px 5px 6px -3px rgba(0,0,0,0.2),0px 9px 12px 1px rgba(0,0,0,0.14),0px 3px 16px 2px rgba(0,0,0,0.12)",
    "0px 6px 6px -3px rgba(0,0,0,0.2),0px 10px 14px 1px rgba(0,0,0,0.14),0px 4px 18px 3px rgba(0,0,0,0.12)",
    "0px 6px 7px -4px rgba(0,0,0,0.2),0px 11px 15px 1px rgba(0,0,0,0.14),0px 4px 20px 3px rgba(0,0,0,0.12)",
    "0px 7px 8px -4px rgba(0,0,0,0.2),0px 12px 17px 2px rgba(0,0,0,0.14),0px 5px 22px 4px rgba(0,0,0,0.12)",
    "0px 7px 8px -4px rgba(0,0,0,0.2),0px 13px 19px 2px rgba(0,0,0,0.14),0px 5px 24px 4px rgba(0,0,0,0.12)",
    "0px 7px 9px -4px rgba(0,0,0,0.2),0px 14px 21px 2px rgba(0,0,0,0.14),0px 5px 26px 4px rgba(0,0,0,0.12)",
    "0px 8px 9px -5px rgba(0,0,0,0.2),0px 15px 22px 2px rgba(0,0,0,0.14),0px 6px 28px 5px rgba(0,0,0,0.12)",
    "0px 8px 10px -5px rgba(0,0,0,0.2),0px 16px 24px 2px rgba(0,0,0,0.14),0px 6px 30px 5px rgba(0,0,0,0.12)",
    "0px 8px 11px -5px rgba(0,0,0,0.2),0px 17px 26px 2px rgba(0,0,0,0.14),0px 6px 32px 5px rgba(0,0,0,0.12)",
    "0px 9px 11px -5px rgba(0,0,0,0.2),0px 18px 28px 2px rgba(0,0,0,0.14),0px 7px 34px 6px rgba(0,0,0,0.12)",
    "0px 9px 12px -6px rgba(0,0,0,0.2),0px 19px 29px 2px rgba(0,0,0,0.14),0px 7px 36px 6px rgba(0,0,0,0.12)",
    "0px 10px 13px -6px rgba(0,0,0,0.2),0px 20px 31px 3px rgba(0,0,0,0.14),0px 8px 38px 7px rgba(0,0,0,0.12)",
    "0px 10px 13px -6px rgba(0,0,0,0.2),0px 21px 33px 3px rgba(0,0,0,0.14),0px 8px 40px 7px rgba(0,0,0,0.12)",
    "0px 10px 14px -6px rgba(0,0,0,0.2),0px 22px 35px 3px rgba(0,0,0,0.14),0px 8px 42px 7px rgba(0,0,0,0.12)",
    "0px 11px 14px -7px rgba(0,0,0,0.2),0px 23px 36px 3px rgba(0,0,0,0.14),0px 9px 44px 8px rgba(0,0,0,0.12)",
    "0px 11px 15px -7px rgba(0,0,0,0.2),0px 24px 38px 3px rgba(0,0,0,0.14),0px 9px 46px 8px rgba(0,0,0,0.12)"
  ],
  "typography": {
    "htmlFontSize": 16,
    "fontFamily": "\"Roboto\", \"Helvetica\", \"Arial\", sans-serif",
    "fontSize": 14,
    "fontWeightLight": 300,
    "fontWeightRegular": 400,
    "fontWeightMedium": 500,
    "fontWeightBold": 700,
    "h1": {
      "fontFamily": "\"Roboto\", \"Helvetica\", \"Arial\", sans-serif",
      "fontWeight": 300,
      "fontSize": "6rem",
      "lineHeight": 1.167,
      "letterSpacing": "-0.01562em"
    },
    "h2": {
      "fontFamily": "\"Roboto\", \"Helvetica\", \"Arial\", sans-serif",
      "fontWeight": 300,
      "fontSize": "3.75rem",
      "lineHeight": 1.2,
      "letterSpacing": "-0.00833em"
    },
    "h3": {
      "fontFamily": "\"Roboto\", \"Helvetica\", \"Arial\", sans-serif",
      "fontWeight": 400,
      "fontSize": "3rem",
      "lineHeight": 1.167,
      "letterSpacing": "0em"
    },
    "h4": {
      "fontFamily": "\"Roboto\", \"Helvetica\", \"Arial\", sans-serif",
      "fontWeight": 400,
      "fontSize": "2.125rem",
      "lineHeight": 1.235,
      "letterSpacing": "0.00735em"
    },
    "h5": {
      "fontFamily": "\"Roboto\", \"Helvetica\", \"Arial\", sans-serif",
      "fontWeight": 400,
      "fontSize": "1.5rem",
      "lineHeight": 1.334,
      "letterSpacing": "0em"
    },
    "h6": {
      "fontFamily": "\"Roboto\", \"Helvetica\", \"Arial\", sans-serif",
      "fontWeight": 500,
      "fontSize": "1.25rem",
      "lineHeight": 1.6,
      "letterSpacing": "0.0075em"
    },
    "subtitle1": {
      "fontFamily": "\"Roboto\", \"Helvetica\", \"Arial\", sans-serif",
      "fontWeight": 400,
      "fontSize": "1rem",
      "lineHeight": 1.75,
      "letterSpacing": "0.00938em"
    },
    "subtitle2": {
      "fontFamily": "\"Roboto\", \"Helvetica\", \"Arial\", sans-serif",
      "fontWeight": 500,
      "fontSize": "0.875rem",
      "lineHeight": 1.57,
      "letterSpacing": "0.00714em"
    },
    "body1": {
      "fontFamily": "\"Roboto\", \"Helvetica\", \"Arial\", sans-serif",
      "fontWeight": 400,
      "fontSize": "1rem",
      "lineHeight": 1.5,
      "letterSpacing": "0.00938em"
    },
    "body2": {
      "fontFamily": "\"Roboto\", \"Helvetica\", \"Arial\", sans-serif",
      "fontWeight": 400,
      "fontSize": "0.875rem",
      "lineHeight": 1.43,
      "letterSpacing": "0.01071em"
    },
    "button": {
      "fontFamily": "\"Roboto\", \"Helvetica\", \"Arial\", sans-serif",
      "fontWeight": 500,
      "fontSize": "0.875rem",
      "lineHeight": 1.75,
      "letterSpacing": "0.02857em",
      "textTransform": "uppercase"
    },
    "caption": {
      "fontFamily": "\"Roboto\", \"Helvetica\", \"Arial\", sans-serif",
      "fontWeight": 400,
      "fontSize": "0.75rem",
      "lineHeight": 1.66,
      "letterSpacing": "0.03333em"
    },
    "overline": {
      "fontFamily": "\"Roboto\", \"Helvetica\", \"Arial\", sans-serif",
      "fontWeight": 400,
      "fontSize": "0.75rem",
      "lineHeight": 2.66,
      "letterSpacing": "0.08333em",
      "textTransform": "uppercase"
    },
    "inherit": {
      "fontFamily": "inherit",
      "fontWeight": "inherit",
      "fontSize": "inherit",
      "lineHeight": "inherit",
      "letterSpacing": "inherit"
    }
  },
  "motion": {
    "reducedMotion": "never"
  },
  "transitions": {
    "easing": {
      "easeInOut": "cubic-bezier(0.4, 0, 0.2, 1)",
      "easeOut": "cubic-bezier(0.0, 0, 0.2, 1)",
      "easeIn": "cubic-bezier(0.4, 0, 1, 1)",
      "sharp": "cubic-bezier(0.4, 0, 0.6, 1)"
    },
    "duration": {
      "shortest": 150,
      "shorter": 200,
      "short": 250,
      "standard": 300,
      "complex": 375,
      "enteringScreen": 225,
      "leavingScreen": 195
    }
  },
  "zIndex": {
    "mobileStepper": 1000,
    "fab": 1050,
    "speedDial": 1050,
    "appBar": 1100,
    "drawer": 1200,
    "modal": 1300,
    "snackbar": 1400,
    "tooltip": 1500
  }
}
```

</TabItem>
<TabItem value='dark-complete' label='Complete theme (dark palette)'>

```json
{
  "breakpoints": {
    "keys": [
      "xs",
      "sm",
      "md",
      "lg",
      "xl"
    ],
    "values": {
      "xs": 0,
      "sm": 600,
      "md": 900,
      "lg": 1200,
      "xl": 1536
    },
    "unit": "px",
    "internal_mediaKeys": [
      "@media (min-width:0px)",
      "@media (min-width:600px)",
      "@media (min-width:900px)",
      "@media (min-width:1200px)",
      "@media (min-width:1536px)"
    ]
  },
  "direction": "ltr",
  "components": {},
  "palette": {
    "mode": "dark",
    "common": {
      "black": "#000",
      "white": "#fff"
    },
    "primary": {
      "main": "#90caf9",
      "light": "#e3f2fd",
      "dark": "#42a5f5",
      "contrastText": "rgba(0, 0, 0, 0.87)"
    },
    "secondary": {
      "main": "#ce93d8",
      "light": "#f3e5f5",
      "dark": "#ab47bc",
      "contrastText": "rgba(0, 0, 0, 0.87)"
    },
    "error": {
      "main": "#f44336",
      "light": "#e57373",
      "dark": "#d32f2f",
      "contrastText": "#fff"
    },
    "warning": {
      "main": "#ffa726",
      "light": "#ffb74d",
      "dark": "#f57c00",
      "contrastText": "rgba(0, 0, 0, 0.87)"
    },
    "info": {
      "main": "#29b6f6",
      "light": "#4fc3f7",
      "dark": "#0288d1",
      "contrastText": "rgba(0, 0, 0, 0.87)"
    },
    "success": {
      "main": "#66bb6a",
      "light": "#81c784",
      "dark": "#388e3c",
      "contrastText": "rgba(0, 0, 0, 0.87)"
    },
    "grey": {
      "50": "#fafafa",
      "100": "#f5f5f5",
      "200": "#eeeeee",
      "300": "#e0e0e0",
      "400": "#bdbdbd",
      "500": "#9e9e9e",
      "600": "#757575",
      "700": "#616161",
      "800": "#424242",
      "900": "#212121",
      "A100": "#f5f5f5",
      "A200": "#eeeeee",
      "A400": "#bdbdbd",
      "A700": "#616161"
    },
    "contrastThreshold": 3,
    "tonalOffset": 0.2,
    "text": {
      "primary": "#fff",
      "secondary": "rgba(255, 255, 255, 0.7)",
      "disabled": "rgba(255, 255, 255, 0.5)",
      "icon": "rgba(255, 255, 255, 0.5)"
    },
    "divider": "rgba(255, 255, 255, 0.12)",
    "background": {
      "paper": "#121212",
      "default": "#121212"
    },
    "action": {
      "active": "#fff",
      "hover": "rgba(255, 255, 255, 0.08)",
      "hoverOpacity": 0.08,
      "selected": "rgba(255, 255, 255, 0.16)",
      "selectedOpacity": 0.16,
      "disabled": "rgba(255, 255, 255, 0.3)",
      "disabledBackground": "rgba(255, 255, 255, 0.12)",
      "disabledOpacity": 0.38,
      "focus": "rgba(255, 255, 255, 0.12)",
      "focusOpacity": 0.12,
      "activatedOpacity": 0.24
    }
  },
  "shape": {
    "borderRadius": 4
  },
  "unstable_sxConfig": {
    "border": {
      "themeKey": "borders"
    },
    "borderTop": {
      "themeKey": "borders"
    },
    "borderRight": {
      "themeKey": "borders"
    },
    "borderBottom": {
      "themeKey": "borders"
    },
    "borderLeft": {
      "themeKey": "borders"
    },
    "borderColor": {
      "themeKey": "palette"
    },
    "borderTopColor": {
      "themeKey": "palette"
    },
    "borderRightColor": {
      "themeKey": "palette"
    },
    "borderBottomColor": {
      "themeKey": "palette"
    },
    "borderLeftColor": {
      "themeKey": "palette"
    },
    "outline": {
      "themeKey": "borders"
    },
    "outlineColor": {
      "themeKey": "palette"
    },
    "borderRadius": {
      "themeKey": "shape.borderRadius"
    },
    "color": {
      "themeKey": "palette"
    },
    "bgcolor": {
      "themeKey": "palette",
      "cssProperty": "backgroundColor"
    },
    "backgroundColor": {
      "themeKey": "palette"
    },
    "p": {},
    "pt": {},
    "pr": {},
    "pb": {},
    "pl": {},
    "px": {},
    "py": {},
    "padding": {},
    "paddingTop": {},
    "paddingRight": {},
    "paddingBottom": {},
    "paddingLeft": {},
    "paddingX": {},
    "paddingY": {},
    "paddingInline": {},
    "paddingInlineStart": {},
    "paddingInlineEnd": {},
    "paddingBlock": {},
    "paddingBlockStart": {},
    "paddingBlockEnd": {},
    "m": {},
    "mt": {},
    "mr": {},
    "mb": {},
    "ml": {},
    "mx": {},
    "my": {},
    "margin": {},
    "marginTop": {},
    "marginRight": {},
    "marginBottom": {},
    "marginLeft": {},
    "marginX": {},
    "marginY": {},
    "marginInline": {},
    "marginInlineStart": {},
    "marginInlineEnd": {},
    "marginBlock": {},
    "marginBlockStart": {},
    "marginBlockEnd": {},
    "displayPrint": {
      "cssProperty": false
    },
    "display": {},
    "overflow": {},
    "textOverflow": {},
    "visibility": {},
    "whiteSpace": {},
    "flexBasis": {},
    "flexDirection": {},
    "flexWrap": {},
    "justifyContent": {},
    "alignItems": {},
    "alignContent": {},
    "order": {},
    "flex": {},
    "flexGrow": {},
    "flexShrink": {},
    "alignSelf": {},
    "justifyItems": {},
    "justifySelf": {},
    "gap": {},
    "rowGap": {},
    "columnGap": {},
    "gridColumn": {},
    "gridRow": {},
    "gridAutoFlow": {},
    "gridAutoColumns": {},
    "gridAutoRows": {},
    "gridTemplateColumns": {},
    "gridTemplateRows": {},
    "gridTemplateAreas": {},
    "gridArea": {},
    "position": {},
    "zIndex": {
      "themeKey": "zIndex"
    },
    "top": {},
    "right": {},
    "bottom": {},
    "left": {},
    "boxShadow": {
      "themeKey": "shadows"
    },
    "width": {},
    "maxWidth": {},
    "minWidth": {},
    "height": {},
    "maxHeight": {},
    "minHeight": {},
    "boxSizing": {},
    "font": {
      "themeKey": "font"
    },
    "fontFamily": {
      "themeKey": "typography"
    },
    "fontSize": {
      "themeKey": "typography"
    },
    "fontStyle": {
      "themeKey": "typography"
    },
    "fontWeight": {
      "themeKey": "typography"
    },
    "letterSpacing": {},
    "textTransform": {},
    "lineHeight": {},
    "textAlign": {},
    "typography": {
      "cssProperty": false,
      "themeKey": "typography"
    }
  },
  "internal_cache": {},
  "mixins": {
    "toolbar": {
      "minHeight": 56,
      "@media (min-width:0px)": {
        "@media (orientation: landscape)": {
          "minHeight": 48
        }
      },
      "@media (min-width:600px)": {
        "minHeight": 64
      }
    }
  },
  "shadows": [
    "none",
    "0px 2px 1px -1px rgba(0,0,0,0.2),0px 1px 1px 0px rgba(0,0,0,0.14),0px 1px 3px 0px rgba(0,0,0,0.12)",
    "0px 3px 1px -2px rgba(0,0,0,0.2),0px 2px 2px 0px rgba(0,0,0,0.14),0px 1px 5px 0px rgba(0,0,0,0.12)",
    "0px 3px 3px -2px rgba(0,0,0,0.2),0px 3px 4px 0px rgba(0,0,0,0.14),0px 1px 8px 0px rgba(0,0,0,0.12)",
    "0px 2px 4px -1px rgba(0,0,0,0.2),0px 4px 5px 0px rgba(0,0,0,0.14),0px 1px 10px 0px rgba(0,0,0,0.12)",
    "0px 3px 5px -1px rgba(0,0,0,0.2),0px 5px 8px 0px rgba(0,0,0,0.14),0px 1px 14px 0px rgba(0,0,0,0.12)",
    "0px 3px 5px -1px rgba(0,0,0,0.2),0px 6px 10px 0px rgba(0,0,0,0.14),0px 1px 18px 0px rgba(0,0,0,0.12)",
    "0px 4px 5px -2px rgba(0,0,0,0.2),0px 7px 10px 1px rgba(0,0,0,0.14),0px 2px 16px 1px rgba(0,0,0,0.12)",
    "0px 5px 5px -3px rgba(0,0,0,0.2),0px 8px 10px 1px rgba(0,0,0,0.14),0px 3px 14px 2px rgba(0,0,0,0.12)",
    "0px 5px 6px -3px rgba(0,0,0,0.2),0px 9px 12px 1px rgba(0,0,0,0.14),0px 3px 16px 2px rgba(0,0,0,0.12)",
    "0px 6px 6px -3px rgba(0,0,0,0.2),0px 10px 14px 1px rgba(0,0,0,0.14),0px 4px 18px 3px rgba(0,0,0,0.12)",
    "0px 6px 7px -4px rgba(0,0,0,0.2),0px 11px 15px 1px rgba(0,0,0,0.14),0px 4px 20px 3px rgba(0,0,0,0.12)",
    "0px 7px 8px -4px rgba(0,0,0,0.2),0px 12px 17px 2px rgba(0,0,0,0.14),0px 5px 22px 4px rgba(0,0,0,0.12)",
    "0px 7px 8px -4px rgba(0,0,0,0.2),0px 13px 19px 2px rgba(0,0,0,0.14),0px 5px 24px 4px rgba(0,0,0,0.12)",
    "0px 7px 9px -4px rgba(0,0,0,0.2),0px 14px 21px 2px rgba(0,0,0,0.14),0px 5px 26px 4px rgba(0,0,0,0.12)",
    "0px 8px 9px -5px rgba(0,0,0,0.2),0px 15px 22px 2px rgba(0,0,0,0.14),0px 6px 28px 5px rgba(0,0,0,0.12)",
    "0px 8px 10px -5px rgba(0,0,0,0.2),0px 16px 24px 2px rgba(0,0,0,0.14),0px 6px 30px 5px rgba(0,0,0,0.12)",
    "0px 8px 11px -5px rgba(0,0,0,0.2),0px 17px 26px 2px rgba(0,0,0,0.14),0px 6px 32px 5px rgba(0,0,0,0.12)",
    "0px 9px 11px -5px rgba(0,0,0,0.2),0px 18px 28px 2px rgba(0,0,0,0.14),0px 7px 34px 6px rgba(0,0,0,0.12)",
    "0px 9px 12px -6px rgba(0,0,0,0.2),0px 19px 29px 2px rgba(0,0,0,0.14),0px 7px 36px 6px rgba(0,0,0,0.12)",
    "0px 10px 13px -6px rgba(0,0,0,0.2),0px 20px 31px 3px rgba(0,0,0,0.14),0px 8px 38px 7px rgba(0,0,0,0.12)",
    "0px 10px 13px -6px rgba(0,0,0,0.2),0px 21px 33px 3px rgba(0,0,0,0.14),0px 8px 40px 7px rgba(0,0,0,0.12)",
    "0px 10px 14px -6px rgba(0,0,0,0.2),0px 22px 35px 3px rgba(0,0,0,0.14),0px 8px 42px 7px rgba(0,0,0,0.12)",
    "0px 11px 14px -7px rgba(0,0,0,0.2),0px 23px 36px 3px rgba(0,0,0,0.14),0px 9px 44px 8px rgba(0,0,0,0.12)",
    "0px 11px 15px -7px rgba(0,0,0,0.2),0px 24px 38px 3px rgba(0,0,0,0.14),0px 9px 46px 8px rgba(0,0,0,0.12)"
  ],
  "typography": {
    "htmlFontSize": 16,
    "fontFamily": "\"Roboto\", \"Helvetica\", \"Arial\", sans-serif",
    "fontSize": 14,
    "fontWeightLight": 300,
    "fontWeightRegular": 400,
    "fontWeightMedium": 500,
    "fontWeightBold": 700,
    "h1": {
      "fontFamily": "\"Roboto\", \"Helvetica\", \"Arial\", sans-serif",
      "fontWeight": 300,
      "fontSize": "6rem",
      "lineHeight": 1.167,
      "letterSpacing": "-0.01562em"
    },
    "h2": {
      "fontFamily": "\"Roboto\", \"Helvetica\", \"Arial\", sans-serif",
      "fontWeight": 300,
      "fontSize": "3.75rem",
      "lineHeight": 1.2,
      "letterSpacing": "-0.00833em"
    },
    "h3": {
      "fontFamily": "\"Roboto\", \"Helvetica\", \"Arial\", sans-serif",
      "fontWeight": 400,
      "fontSize": "3rem",
      "lineHeight": 1.167,
      "letterSpacing": "0em"
    },
    "h4": {
      "fontFamily": "\"Roboto\", \"Helvetica\", \"Arial\", sans-serif",
      "fontWeight": 400,
      "fontSize": "2.125rem",
      "lineHeight": 1.235,
      "letterSpacing": "0.00735em"
    },
    "h5": {
      "fontFamily": "\"Roboto\", \"Helvetica\", \"Arial\", sans-serif",
      "fontWeight": 400,
      "fontSize": "1.5rem",
      "lineHeight": 1.334,
      "letterSpacing": "0em"
    },
    "h6": {
      "fontFamily": "\"Roboto\", \"Helvetica\", \"Arial\", sans-serif",
      "fontWeight": 500,
      "fontSize": "1.25rem",
      "lineHeight": 1.6,
      "letterSpacing": "0.0075em"
    },
    "subtitle1": {
      "fontFamily": "\"Roboto\", \"Helvetica\", \"Arial\", sans-serif",
      "fontWeight": 400,
      "fontSize": "1rem",
      "lineHeight": 1.75,
      "letterSpacing": "0.00938em"
    },
    "subtitle2": {
      "fontFamily": "\"Roboto\", \"Helvetica\", \"Arial\", sans-serif",
      "fontWeight": 500,
      "fontSize": "0.875rem",
      "lineHeight": 1.57,
      "letterSpacing": "0.00714em"
    },
    "body1": {
      "fontFamily": "\"Roboto\", \"Helvetica\", \"Arial\", sans-serif",
      "fontWeight": 400,
      "fontSize": "1rem",
      "lineHeight": 1.5,
      "letterSpacing": "0.00938em"
    },
    "body2": {
      "fontFamily": "\"Roboto\", \"Helvetica\", \"Arial\", sans-serif",
      "fontWeight": 400,
      "fontSize": "0.875rem",
      "lineHeight": 1.43,
      "letterSpacing": "0.01071em"
    },
    "button": {
      "fontFamily": "\"Roboto\", \"Helvetica\", \"Arial\", sans-serif",
      "fontWeight": 500,
      "fontSize": "0.875rem",
      "lineHeight": 1.75,
      "letterSpacing": "0.02857em",
      "textTransform": "uppercase"
    },
    "caption": {
      "fontFamily": "\"Roboto\", \"Helvetica\", \"Arial\", sans-serif",
      "fontWeight": 400,
      "fontSize": "0.75rem",
      "lineHeight": 1.66,
      "letterSpacing": "0.03333em"
    },
    "overline": {
      "fontFamily": "\"Roboto\", \"Helvetica\", \"Arial\", sans-serif",
      "fontWeight": 400,
      "fontSize": "0.75rem",
      "lineHeight": 2.66,
      "letterSpacing": "0.08333em",
      "textTransform": "uppercase"
    },
    "inherit": {
      "fontFamily": "inherit",
      "fontWeight": "inherit",
      "fontSize": "inherit",
      "lineHeight": "inherit",
      "letterSpacing": "inherit"
    }
  },
  "motion": {
    "reducedMotion": "never"
  },
  "transitions": {
    "easing": {
      "easeInOut": "cubic-bezier(0.4, 0, 0.2, 1)",
      "easeOut": "cubic-bezier(0.0, 0, 0.2, 1)",
      "easeIn": "cubic-bezier(0.4, 0, 1, 1)",
      "sharp": "cubic-bezier(0.4, 0, 0.6, 1)"
    },
    "duration": {
      "shortest": 150,
      "shorter": 200,
      "short": 250,
      "standard": 300,
      "complex": 375,
      "enteringScreen": 225,
      "leavingScreen": 195
    }
  },
  "zIndex": {
    "mobileStepper": 1000,
    "fab": 1050,
    "speedDial": 1050,
    "appBar": 1100,
    "drawer": 1200,
    "modal": 1300,
    "snackbar": 1400,
    "tooltip": 1500
  }
}
```

</TabItem>
</Tabs>

</details>

Customize at your own risk!
