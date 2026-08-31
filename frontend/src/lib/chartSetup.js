// chart.js and react-chartjs-2 are about 200 KB together, and every page that
// uses them shows several other things first - stat cards, tables, alert
// lists. Loading the charting library on demand lets the rest of the page
// paint while it arrives, instead of holding the whole route back.

let setupPromise = null;

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
      return reactChart;
    });
  }

  return setupPromise;
};

// Lets a page start the download before a chart is on screen, e.g. as soon as
// its data request goes out.
export const preloadCharts = loadCharts;
