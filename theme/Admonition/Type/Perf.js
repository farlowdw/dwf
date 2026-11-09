/**
 * Type/Perf.js — the :::perf admonition: theme-classic's layout with its own icon, label and
 * .alert--perf class. Listed in ../Types.js.
 *
 * HOW TO CHANGE IT  The icon: the @mui/icons-material import below. The colours:
 * .alert--perf in shared/css/custom.scss.
 */
import React from 'react';
import clsx from 'clsx';
import Translate from '@docusaurus/Translate';
import AdmonitionLayout from '@theme/Admonition/Layout';
import AccessAlarmIcon from '@mui/icons-material/AccessAlarm';      // alarm clock (default)

const infimaClassName = 'alert alert--perf';

const defaultProps = {
  icon: <AccessAlarmIcon fontSize='tiny' />,
  title: (
    <Translate
      id="theme.admonition.perf"
      description="The default label used for the perf admonition (:::perf)">
      perf
    </Translate>
  ),
};

export default function AdmonitionTypePerf(props) {
  return (
    <AdmonitionLayout
      {...defaultProps}
      {...props}
      className={clsx(infimaClassName, props.className)}>
      {props.children}
    </AdmonitionLayout>
  );
}