import React, { lazy, Suspense } from 'react';
import { loadCharts } from '../lib/chartSetup';

// Thin wrappers so a page can write <Bar …> without knowing that the charting
// library is fetched on demand. See lib/chartSetup.js for why.

const LazyBar = lazy(() => loadCharts().then(m => ({ default: m.Bar })));
const LazyLine = lazy(() => loadCharts().then(m => ({ default: m.Line })));
const LazyDoughnut = lazy(() => loadCharts().then(m => ({ default: m.Doughnut })));

// Holds the chart's space while the library loads, so nothing below it jumps.
const ChartFallback = ({ height }) => (
  <div
    className="chart-loading"
    style={{ height: height || '100%', minHeight: 160 }}
    role="status"
    aria-label="Loading chart"
  />
);

export const Bar = ({ height, ...props }) => (
  <Suspense fallback={<ChartFallback height={height} />}>
    <LazyBar {...props} />
  </Suspense>
);

export const Line = ({ height, ...props }) => (
  <Suspense fallback={<ChartFallback height={height} />}>
    <LazyLine {...props} />
  </Suspense>
);

export const Doughnut = ({ height, ...props }) => (
  <Suspense fallback={<ChartFallback height={height} />}>
    <LazyDoughnut {...props} />
  </Suspense>
);
