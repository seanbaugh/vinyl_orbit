import { Fragment, type ReactNode } from 'react';
import { useParams } from 'react-router-dom';

/**
 * Renders a page keyed by a route param, so navigating /release/1 → /release/2 remounts it
 * instead of reusing component state (e.g. an in-progress note) for the wrong record.
 */
export function KeyedByParam({ param, render }: { param: string; render: (value: string) => ReactNode }) {
  const value = useParams()[param] ?? '';
  return <Fragment key={value}>{render(value)}</Fragment>;
}
