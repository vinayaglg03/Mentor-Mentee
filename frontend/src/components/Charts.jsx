import React, { lazy, Suspense, useEffect } from 'react';
import { loadCharts, applyChartTheme } from '../lib/chartSetup';
import { useTheme } from '../context/useTheme';

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

// chart.js reads its defaults once, when a chart is constructed, so switching
// theme has to re-read the tokens and rebuild the canvas. Keying on the
// resolved theme does that: cheap, and it happens at most once per switch.
const useChartTheme = () => {
  const { resolvedTheme } = useTheme();

  useEffect(() => { applyChartTheme(); }, [resolvedTheme]);

  return resolvedTheme;
};

export const Bar = ({ height, label, summary, ...props }) => {
  const theme = useChartTheme();

  return (
    <Suspense fallback={<ChartFallback height={height} />}>
      <LazyBar
        key={theme}
        aria-label={label}
        fallbackContent={summary ? <p>{summary}</p> : undefined}
        {...props}
      />
    </Suspense>
  );
};

export const Line = ({ height, label, summary, ...props }) => {
  const theme = useChartTheme();

  return (
    <Suspense fallback={<ChartFallback height={height} />}>
      <LazyLine
        key={theme}
        aria-label={label}
        fallbackContent={summary ? <p>{summary}</p> : undefined}
        {...props}
      />
    </Suspense>
  );
};

export const Doughnut = ({ height, label, summary, ...props }) => {
  const theme = useChartTheme();

  return (
    <Suspense fallback={<ChartFallback height={height} />}>
      <LazyDoughnut
        key={theme}
        aria-label={label}
        fallbackContent={summary ? <p>{summary}</p> : undefined}
        {...props}
      />
    </Suspense>
  );
};
