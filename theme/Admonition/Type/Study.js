/**
 * Type/Study.js — the :::study admonition: theme-classic's layout with its own icon, label and
 * .alert--study class. Listed in ../Types.js.
 *
 * HOW TO CHANGE IT  The icon: the @mui/icons-material import below. The colours:
 * .alert--study in shared/css/custom.scss.
 */
import React from 'react';
import clsx from 'clsx';
import Translate from '@docusaurus/Translate';
import AdmonitionLayout from '@theme/Admonition/Layout';
import CreateIcon from '@mui/icons-material/Create';      // pencil (default)

const infimaClassName = 'alert alert--study';

const defaultProps = {
  icon: <CreateIcon fontSize='tiny' />,
  title: (
    <Translate
      id="theme.admonition.study"
      description="The default label used for the study admonition (:::study)">
      study
    </Translate>
  ),
};

export default function AdmonitionTypeStudy(props) {
  return (
    <AdmonitionLayout
      {...defaultProps}
      {...props}
      className={clsx(infimaClassName, props.className)}>
      {props.children}
    </AdmonitionLayout>
  );
}