// chart.js and react-chartjs-2 are about 200 KB together, and every page that
// uses them shows several other things first - stat cards, tables, alert
// lists. Loading the charting library on demand lets the rest of the page
// paint while it arrives, instead of holding the whole route back.

let setupPromise = null;
let chartModule = null;

// chart.js draws its axis labels and grid lines in a fixed grey that was
// chosen for a white page. Read the real token values instead, so a chart
// belongs to whichever theme is on.
const token = (name, fallback) => {
  if (typeof window === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
};

export const applyChartTheme = () => {
  if (!chartModule) return;

  const { Chart } = chartModule;
  Chart.defaults.color = token('--text-secondary', '#475569');
  Chart.defaults.borderColor = token('--border', '#e2e8f0');
  Chart.defaults.font.family = token('--font-ui', 'system-ui, sans-serif');
  Chart.defaults.plugins.tooltip.backgroundColor = token('--chrome-bg', '#030f1b');
  Chart.defaults.plugins.tooltip.titleColor = token('--chrome-fg', '#f8fafc');
  Chart.defaults.plugins.tooltip.bodyColor = token('--chrome-fg', '#f8fafc');
};

// Resolves to the react-chartjs-2 module, with every element AMIS draws
// registered exactly once, whichever chart asked for it first.
export const loadCharts = () => {
  if (!setupPromise) {
    setupPromise = Promise.all([
      import('chart.js'),
      import('react-chartjs-2'),
    ]).then(([chart, reactChart]) => {
      chart.Chart.register(
        chart.CategoryScale,
        chart.LinearScale,
        chart.BarElement,
        chart.PointElement,
        chart.LineElement,
        chart.ArcElement,
        chart.Title,
        chart.Tooltip,
        chart.Legend,
        chart.Filler,
      );
      chartModule = chart;
      applyChartTheme();
      return reactChart;
    });
  }

  return setupPromise;
};

// Lets a page start the download before a chart is on screen, e.g. as soon as
// its data request goes out.
export const preloadCharts = loadCharts;
