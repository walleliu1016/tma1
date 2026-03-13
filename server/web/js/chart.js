// chart.js — uPlot chart helpers + theme color utilities
// Depends on: core.js (fmtNum, tsToMs)

var chartInstances = {};

var chartColors = ['#79c0ff', '#f0883e', '#3fb950', '#d2a8ff', '#f778ba', '#ffa657'];

function getThemeColors() {
  var cs = getComputedStyle(document.documentElement);
  return {
    axisStroke: cs.getPropertyValue('--text-dim').trim(),
    gridStroke: cs.getPropertyValue('--border').trim(),
    blue: cs.getPropertyValue('--blue').trim(),
    orange: cs.getPropertyValue('--orange').trim(),
    green: cs.getPropertyValue('--green').trim(),
    purple: cs.getPropertyValue('--purple').trim(),
    red: cs.getPropertyValue('--red').trim(),
    yellow: cs.getPropertyValue('--yellow').trim(),
    heatmap: [
      cs.getPropertyValue('--heatmap-0').trim(),
      cs.getPropertyValue('--heatmap-1').trim(),
      cs.getPropertyValue('--heatmap-2').trim(),
      cs.getPropertyValue('--heatmap-3').trim(),
      cs.getPropertyValue('--heatmap-4').trim(),
    ],
  };
}

function makeUPlotOpts(title, series, width, yFormatter) {
  var tc = getThemeColors();
  return {
    width: width,
    height: 220,
    cursor: { show: true },
    scales: { x: { time: true } },
    axes: [
      { stroke: tc.axisStroke, grid: { stroke: tc.gridStroke } },
      { stroke: tc.axisStroke, grid: { stroke: tc.gridStroke },
        values: function(u, vals) { return vals.map(function(v) { return yFormatter ? yFormatter(v) : String(v); }); } },
    ],
    series: series,
  };
}

function renderChart(containerId, data, seriesDefs, yFmt) {
  var container = document.getElementById(containerId);
  container.innerHTML = '';
  var width = container.clientWidth - 32;
  var tc = getThemeColors();

  var timestamps = data.map(function(d) { return tsToMs(d.t) / 1000; });
  var uData = [timestamps];
  var uSeries = [{}];

  // Map named colors to theme colors
  var colorMap = {
    '#79c0ff': tc.blue,
    '#f0883e': tc.orange,
    '#3fb950': tc.green,
    '#d2a8ff': tc.purple,
    '#f85149': tc.red,
  };

  seriesDefs.forEach(function(s) {
    uData.push(data.map(function(d) { return d[s.key] != null ? Number(d[s.key]) : null; }));
    var color = colorMap[s.color] || s.color;
    uSeries.push({
      label: s.label,
      stroke: color,
      width: 2,
      fill: color + '1a',
    });
  });

  var opts = makeUPlotOpts('', uSeries, width, yFmt);
  if (chartInstances[containerId]) {
    chartInstances[containerId].destroy();
  }
  chartInstances[containerId] = new uPlot(opts, uData, container);
}
