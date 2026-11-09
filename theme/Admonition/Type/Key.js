/**
 * Type/Key.js — the :::key admonition: theme-classic's layout with its own icon, label and
 * .alert--key class. Listed in ../Types.js.
 *
 * HOW TO CHANGE IT  The icon: the @mui/icons-material import below. The colours:
 * .alert--key in shared/css/custom.scss.
 */
import React from 'react';
import clsx from 'clsx';
import Translate from '@docusaurus/Translate';
import AdmonitionLayout from '@theme/Admonition/Layout';
import VpnKeyIcon from '@mui/icons-material/VpnKey';  // key (default)

const infimaClassName = 'alert alert--key';

const defaultProps = {
  icon: <VpnKeyIcon fontSize='tiny' />,
  title: (
    <Translate
      id="theme.admonition.key"
      description="The default label used for the Key admonition (:::key)">
      key
    </Translate>
  ),
};

export default function AdmonitionTypeKey(props) {
  return (
    <AdmonitionLayout
      {...defaultProps}
      {...props}
      className={clsx(infimaClassName, props.className)}>
      {props.children}
    </AdmonitionLayout>
  );
}