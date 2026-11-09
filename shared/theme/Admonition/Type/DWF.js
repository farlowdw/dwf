/**
 * Type/DWF.js — the :::dwf admonition: theme-classic's layout with its own icon, label and
 * .alert--dwf class. Listed in ../Types.js.
 *
 * HOW TO CHANGE IT  The icon: the @mui/icons-material import below. The colours:
 * .alert--dwf in shared/css/custom.scss.
 */
import React from 'react';
import clsx from 'clsx';
import Translate from '@docusaurus/Translate';
import AdmonitionLayout from '@theme/Admonition/Layout';
import BoltIcon from '@mui/icons-material/Bolt';      // lightning bolt (default)

const infimaClassName = 'alert alert--dwf';

const defaultProps = {
  icon: <BoltIcon fontSize='tiny' />,
  title: (
    <Translate
      id="theme.admonition.dwf"
      description="The default label used for the DWF admonition (:::dwf)">
      dwf
    </Translate>
  ),
};

export default function AdmonitionTypeDWF(props) {
  return (
    <AdmonitionLayout
      {...defaultProps}
      {...props}
      className={clsx(infimaClassName, props.className)}>
      {props.children}
    </AdmonitionLayout>
  );
}