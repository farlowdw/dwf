/**
 * Type/Extension.js — the :::extension admonition: theme-classic's layout with its own icon, label and
 * .alert--extension class. Listed in ../Types.js.
 *
 * HOW TO CHANGE IT  The icon: the @mui/icons-material import below. The colours:
 * .alert--extension in shared/css/custom.scss.
 */
import React from 'react';
import clsx from 'clsx';
import Translate from '@docusaurus/Translate';
import AdmonitionLayout from '@theme/Admonition/Layout';
import ExtensionIcon from '@mui/icons-material/Extension';      // puzzle piece (default)

const infimaClassName = 'alert alert--extension';

const defaultProps = {
  icon: <ExtensionIcon fontSize='tiny' />,
  title: (
    <Translate
      id="theme.admonition.extension"
      description="The default label used for the extension admonition (:::extension)">
      extension
    </Translate>
  ),
};

export default function AdmonitionTypeExtension(props) {
  return (
    <AdmonitionLayout
      {...defaultProps}
      {...props}
      className={clsx(infimaClassName, props.className)}>
      {props.children}
    </AdmonitionLayout>
  );
}