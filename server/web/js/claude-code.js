// claude-code.js — Claude Code view: all cc_* functions
// Depends on: core.js, chart.js, i18n.js

// ===================================================================
// Claude Code view — Cards
// ===================================================================
async function cc_loadCards() {
  var iv = intervalSQL();
  try {
    var results = await Promise.all([
      query("SELECT ROUND(SUM(json_get_float(log_attributes, 'cost_usd')), 4) AS v FROM opentelemetry_logs WHERE body = 'claude_code.api_request' AND timestamp > NOW() - INTERVAL '" + iv + "'"),
      query("SELECT SUM(json_get_int(log_attributes, 'cache_read_tokens') + json_get_int(log_attributes, 'cache_creation_tokens') + json_get_int(log_attributes, 'output_tokens')) AS v FROM opentelemetry_logs WHERE body = 'claude_code.api_request' AND timestamp > NOW() - INTERVAL '" + iv + "'"),
      query("SELECT COUNT(*) AS v FROM opentelemetry_logs WHERE body = 'claude_code.api_request' AND timestamp > NOW() - INTERVAL '" + iv + "'"),
      query("SELECT ROUND(AVG(json_get_float(log_attributes, 'duration_ms')), 0) AS v FROM opentelemetry_logs WHERE body = 'claude_code.api_request' AND timestamp > NOW() - INTERVAL '" + iv + "'"),
    ]);
    document.getElementById('cc-val-cost').textContent = fmtCost(rows(results[0])?.[0]?.[0]);
    document.getElementById('cc-val-tokens').textContent = fmtNum(rows(results[1])?.[0]?.[0]);
    document.getElementById('cc-val-requests').textContent = fmtNum(rows(results[2])?.[0]?.[0]);
    var latVal = rows(results[3])?.[0]?.[0];
    document.getElementById('cc-val-latency').textContent = latVal != null ? Math.round(latVal) + 'ms' : '\u2014';
  } catch (err) {
    var banner = document.getElementById('error-banner');
    banner.style.display = 'block';
    banner.textContent = t('error.cc_metrics') + err.message;
  }
}

// ===================================================================
// Claude Code view — Overview tab
// ===================================================================
async function cc_loadOverview() {
  await Promise.all([
    cc_loadTokenChart(),
    cc_loadCostChart(),
    cc_loadLatencyChart(),
    cc_loadErrorChart(),
    cc_loadToolDistribution(),
    cc_loadToolPerformance(),
    cc_loadActivityHeatmap(),
    cc_loadMetricsExplorer(),
  ]);
}

async function cc_loadTokenChart() {
  try {
    var res = await query(
      "SELECT date_bin('5 minutes'::INTERVAL, timestamp) AS t, " +
      "SUM(json_get_int(log_attributes, 'cache_read_tokens')) AS cache_read, " +
      "SUM(json_get_int(log_attributes, 'cache_creation_tokens')) AS cache_create, " +
      "SUM(json_get_int(log_attributes, 'output_tokens')) AS outp " +
      "FROM opentelemetry_logs " +
      "WHERE body = 'claude_code.api_request' AND timestamp > NOW() - INTERVAL '" + intervalSQL() + "' " +
      "GROUP BY t ORDER BY t"
    );
    var data = rowsToObjects(res);
    if (!data.length) return;
    renderChart('cc-chart-tokens', data, [
      { label: t('chart.cache_read'), key: 'cache_read', color: '#3fb950' },
      { label: t('chart.cache_creation'), key: 'cache_create', color: '#79c0ff' },
      { label: t('chart.output_tokens'), key: 'outp', color: '#f0883e' },
    ], function(v) { return fmtNum(v); });
  } catch { /* no data */ }
}

async function cc_loadCostChart() {
  try {
    var res = await query(
      "SELECT date_bin('5 minutes'::INTERVAL, timestamp) AS t, " +
      "SUM(json_get_float(log_attributes, 'cost_usd')) AS cost " +
      "FROM opentelemetry_logs " +
      "WHERE body = 'claude_code.api_request' AND timestamp > NOW() - INTERVAL '" + intervalSQL() + "' " +
      "GROUP BY t ORDER BY t"
    );
    var data = rowsToObjects(res);
    if (!data.length) return;
    renderChart('cc-chart-cost', data, [
      { label: t('chart.cost_usd'), key: 'cost', color: '#f0883e' },
    ], function(v) { return '$' + Number(v).toFixed(4); });
  } catch { /* no data */ }
}

async function cc_loadLatencyChart() {
  try {
    var res = await query(
      "SELECT date_bin('5 minutes'::INTERVAL, timestamp) AS t, " +
      "ROUND(AVG(json_get_float(log_attributes, 'duration_ms')), 0) AS avg_ms " +
      "FROM opentelemetry_logs " +
      "WHERE body = 'claude_code.api_request' AND timestamp > NOW() - INTERVAL '" + intervalSQL() + "' " +
      "GROUP BY t ORDER BY t"
    );
    var data = rowsToObjects(res);
    if (!data.length) return;
    renderChart('cc-chart-latency', data, [
      { label: t('chart.avg_latency'), key: 'avg_ms', color: '#d2a8ff' },
    ], function(v) { return Math.round(v) + 'ms'; });
  } catch { /* no data */ }
}

async function cc_loadErrorChart() {
  try {
    var res = await query(
      "SELECT date_bin('5 minutes'::INTERVAL, timestamp) AS t, " +
      "SUM(CASE WHEN body = 'claude_code.api_request' THEN 1 ELSE 0 END) AS total, " +
      "SUM(CASE WHEN body = 'claude_code.api_error' THEN 1 ELSE 0 END) AS errors " +
      "FROM opentelemetry_logs " +
      "WHERE body IN ('claude_code.api_request', 'claude_code.api_error') " +
      "  AND timestamp > NOW() - INTERVAL '" + intervalSQL() + "' " +
      "GROUP BY t ORDER BY t"
    );
    var data = rowsToObjects(res);
    if (!data.length) return;
    renderChart('cc-chart-errors', data, [
      { label: t('chart.total'), key: 'total', color: '#3fb950' },
      { label: t('chart.errors'), key: 'errors', color: '#f85149' },
    ], function(v) { return fmtNum(v); });
  } catch { /* no data */ }
}

async function cc_loadToolDistribution() {
  try {
    var tc = getThemeColors();
    var res = await query(
      "SELECT json_get_string(log_attributes, 'tool_name') AS tool, " +
      "COUNT(*) AS cnt, " +
      "SUM(CASE WHEN json_get_string(log_attributes, 'success') = 'false' THEN 1 ELSE 0 END) AS errs " +
      "FROM opentelemetry_logs " +
      "WHERE body = 'claude_code.tool_result' " +
      "  AND timestamp > NOW() - INTERVAL '" + intervalSQL() + "' " +
      "GROUP BY tool ORDER BY cnt DESC LIMIT 15"
    );
    var data = rowsToObjects(res);
    var el = document.getElementById('cc-tool-distribution');
    if (!data.length) { el.innerHTML = '<div class="chart-empty">' + t('empty.no_tool_data') + '</div>'; return; }
    var maxCnt = Math.max.apply(null, data.map(function(d) { return Number(d.cnt) || 0; }));
    el.innerHTML = data.map(function(d) {
      var cnt = Number(d.cnt) || 0;
      var errs = Number(d.errs) || 0;
      var pct = maxCnt > 0 ? (cnt / maxCnt * 100) : 0;
      var errPct = cnt > 0 ? (errs / cnt * 100) : 0;
      return '<div class="bar-row">' +
        '<div class="bar-label" title="' + escapeHTML(d.tool) + '">' + escapeHTML(d.tool || 'unknown') + '</div>' +
        '<div class="bar-track bar-track-stacked">' +
          '<div class="bar-fill" style="width:' + pct + '%;background:' + tc.green + '"></div>' +
          (errs > 0 ? '<div class="bar-fill-error" style="width:' + (pct * errPct / 100) + '%;left:' + (pct - pct * errPct / 100) + '%"></div>' : '') +
        '</div>' +
        '<div class="bar-value">' + fmtNum(cnt) + (errs > 0 ? ' <span style="color:' + tc.red + '">(' + errs + ' err)</span>' : '') + '</div>' +
        '</div>';
    }).join('');
  } catch { /* no data */ }
}

async function cc_loadToolPerformance() {
  var tbody = document.getElementById('cc-tool-perf-body');
  try {
    var res = await query(
      "SELECT json_get_string(log_attributes, 'tool_name') AS tool, " +
      "COUNT(*) AS calls, " +
      "SUM(CASE WHEN json_get_string(log_attributes, 'success') = 'true' THEN 1 ELSE 0 END) AS ok, " +
      "ROUND(AVG(json_get_float(log_attributes, 'duration_ms')), 0) AS avg_ms, " +
      "ROUND(SUM(json_get_int(log_attributes, 'tool_result_size_bytes')) / 1024.0, 1) AS total_kb " +
      "FROM opentelemetry_logs " +
      "WHERE body = 'claude_code.tool_result' " +
      "  AND timestamp > NOW() - INTERVAL '" + intervalSQL() + "' " +
      "GROUP BY tool ORDER BY calls DESC LIMIT 15"
    );
    var data = rowsToObjects(res);
    if (!data.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="loading">' + t('empty.no_tool_data') + '</td></tr>';
      return;
    }
    var tc = getThemeColors();
    tbody.innerHTML = data.map(function(d) {
      var calls = Number(d.calls) || 0;
      var ok = Number(d.ok) || 0;
      var rate = calls > 0 ? ((ok / calls) * 100).toFixed(1) : '0.0';
      var rateColor = Number(rate) >= 95 ? tc.green : Number(rate) >= 80 ? tc.yellow : tc.red;
      return '<tr>' +
        '<td>' + escapeHTML(d.tool || 'unknown') + '</td>' +
        '<td>' + fmtNum(calls) + '</td>' +
        '<td><span style="color:' + rateColor + '">' + rate + '%</span></td>' +
        '<td>' + (d.avg_ms != null ? Math.round(d.avg_ms) + 'ms' : '\u2014') + '</td>' +
        '<td>' + (d.total_kb != null ? d.total_kb + ' KB' : '\u2014') + '</td></tr>';
    }).join('');
  } catch {
    tbody.innerHTML = '<tr><td colspan="5" class="loading">' + t('error.load_tool_perf') + '</td></tr>';
  }
}

async function cc_loadActivityHeatmap() {
  var el = document.getElementById('cc-activity-heatmap');

  // Adaptive bucket size and grid layout based on time range
  var config = {
    '1h':  { bucket: '5 minutes',  interval: '1 hour',  cols: 12, rowCount: 1 },
    '6h':  { bucket: '15 minutes', interval: '6 hours', cols: 24, rowCount: 1 },
    '24h': { bucket: '1 hour',     interval: '1 day',   cols: 24, rowCount: 1 },
    '7d':  { bucket: '1 hour',     interval: '7 days',  cols: 24, rowCount: 7 },
  };
  var cfg = config[currentTimeRange] || config['24h'];

  try {
    var res = await query(
      "SELECT date_bin('" + cfg.bucket + "'::INTERVAL, timestamp) AS t, COUNT(*) AS cnt " +
      "FROM opentelemetry_logs " +
      "WHERE body = 'claude_code.api_request' " +
      "  AND timestamp > NOW() - INTERVAL '" + cfg.interval + "' " +
      "GROUP BY t ORDER BY t"
    );
    var data = rowsToObjects(res);
    if (!data.length) { el.innerHTML = '<div class="chart-empty">' + t('empty.no_activity') + '</div>'; return; }

    var tc = getThemeColors();
    var heatColors = tc.heatmap;
    var counts = {};
    var maxCnt = 0;
    var now = new Date();
    var locale = currentLocale === 'zh' ? 'zh-CN' : currentLocale === 'es' ? 'es' : 'en';

    function cellColor(cnt) {
      if (!cnt) return heatColors[0];
      var ratio = cnt / maxCnt;
      if (ratio < 0.25) return heatColors[1];
      if (ratio < 0.50) return heatColors[2];
      if (ratio < 0.75) return heatColors[3];
      return heatColors[4];
    }

    if (currentTimeRange === '7d') {
      // 7-day mode: 7 rows (days) × 24 cols (hours)
      var weekAgo = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
      data.forEach(function(d) {
        var dt = new Date(tsToMs(d.t));
        var dayIdx = Math.floor((dt.getTime() - weekAgo.getTime()) / (24 * 3600 * 1000));
        var hour = dt.getHours();
        var key = dayIdx + ':' + hour;
        var cnt = Number(d.cnt) || 0;
        counts[key] = (counts[key] || 0) + cnt;
        if (counts[key] > maxCnt) maxCnt = counts[key];
      });

      var dayNames = [];
      for (var i = 0; i < 7; i++) {
        var d = new Date(weekAgo.getTime() + i * 24 * 3600 * 1000);
        dayNames.push(d.toLocaleDateString(locale, { weekday: 'short' }));
      }

      var html = '<div class="heatmap-grid" style="grid-template-columns:40px repeat(24, 1fr)">';
      html += '<div class="heatmap-label"></div>';
      for (var h = 0; h < 24; h++) {
        html += '<div class="heatmap-label" style="justify-content:center">' + (h % 3 === 0 ? h : '') + '</div>';
      }
      for (var day = 0; day < 7; day++) {
        html += '<div class="heatmap-label">' + dayNames[day] + '</div>';
        for (var h2 = 0; h2 < 24; h2++) {
          var cnt = counts[day + ':' + h2] || 0;
          html += '<div class="heatmap-cell" style="background:' + cellColor(cnt) + '" title="' + dayNames[day] + ' ' + h2 + ':00 \u2014 ' + cnt + '"></div>';
        }
      }
      html += '</div>';

    } else if (currentTimeRange === '24h') {
      // 24h mode: single row × 24 cols (hours)
      var dayStart = new Date(now.getTime() - 24 * 3600 * 1000);
      data.forEach(function(d) {
        var dt = new Date(tsToMs(d.t));
        var hour = Math.floor((dt.getTime() - dayStart.getTime()) / (3600 * 1000));
        if (hour < 0 || hour >= 24) return;
        var key = '0:' + hour;
        var cnt = Number(d.cnt) || 0;
        counts[key] = (counts[key] || 0) + cnt;
        if (counts[key] > maxCnt) maxCnt = counts[key];
      });

      var html = '<div class="heatmap-grid" style="grid-template-columns:40px repeat(24, 1fr)">';
      html += '<div class="heatmap-label"></div>';
      for (var h = 0; h < 24; h++) {
        var hourLabel = new Date(dayStart.getTime() + h * 3600 * 1000);
        html += '<div class="heatmap-label" style="justify-content:center">' + (h % 3 === 0 ? hourLabel.getHours() + 'h' : '') + '</div>';
      }
      html += '<div class="heatmap-label"></div>';
      for (var h2 = 0; h2 < 24; h2++) {
        var cnt = counts['0:' + h2] || 0;
        var hourLabel2 = new Date(dayStart.getTime() + h2 * 3600 * 1000);
        html += '<div class="heatmap-cell" style="background:' + cellColor(cnt) + '" title="' + hourLabel2.getHours() + ':00 \u2014 ' + cnt + '"></div>';
      }
      html += '</div>';

    } else if (currentTimeRange === '6h') {
      // 6h mode: single row × 24 cols (15-min buckets)
      var rangeStart = new Date(now.getTime() - 6 * 3600 * 1000);
      data.forEach(function(d) {
        var dt = new Date(tsToMs(d.t));
        var slot = Math.floor((dt.getTime() - rangeStart.getTime()) / (15 * 60 * 1000));
        if (slot < 0 || slot >= 24) return;
        var key = '0:' + slot;
        var cnt = Number(d.cnt) || 0;
        counts[key] = (counts[key] || 0) + cnt;
        if (counts[key] > maxCnt) maxCnt = counts[key];
      });

      var html = '<div class="heatmap-grid" style="grid-template-columns:40px repeat(24, 1fr)">';
      html += '<div class="heatmap-label"></div>';
      for (var s = 0; s < 24; s++) {
        var slotTime = new Date(rangeStart.getTime() + s * 15 * 60 * 1000);
        var showLabel = s % 4 === 0;
        html += '<div class="heatmap-label" style="justify-content:center;font-size:9px">' +
          (showLabel ? slotTime.getHours() + ':' + String(slotTime.getMinutes()).padStart(2, '0') : '') + '</div>';
      }
      html += '<div class="heatmap-label"></div>';
      for (var s2 = 0; s2 < 24; s2++) {
        var cnt = counts['0:' + s2] || 0;
        var slotTime2 = new Date(rangeStart.getTime() + s2 * 15 * 60 * 1000);
        html += '<div class="heatmap-cell" style="background:' + cellColor(cnt) + '" title="' +
          slotTime2.getHours() + ':' + String(slotTime2.getMinutes()).padStart(2, '0') + ' \u2014 ' + cnt + '"></div>';
      }
      html += '</div>';

    } else {
      // 1h mode: single row × 12 cols (5-min buckets)
      var rangeStart = new Date(now.getTime() - 3600 * 1000);
      data.forEach(function(d) {
        var dt = new Date(tsToMs(d.t));
        var slot = Math.floor((dt.getTime() - rangeStart.getTime()) / (5 * 60 * 1000));
        if (slot < 0 || slot >= 12) return;
        var key = '0:' + slot;
        var cnt = Number(d.cnt) || 0;
        counts[key] = (counts[key] || 0) + cnt;
        if (counts[key] > maxCnt) maxCnt = counts[key];
      });

      var html = '<div class="heatmap-grid" style="grid-template-columns:40px repeat(12, 1fr)">';
      html += '<div class="heatmap-label"></div>';
      for (var s = 0; s < 12; s++) {
        var slotTime = new Date(rangeStart.getTime() + s * 5 * 60 * 1000);
        var showLabel = s % 2 === 0;
        html += '<div class="heatmap-label" style="justify-content:center;font-size:9px">' +
          (showLabel ? ':' + String(slotTime.getMinutes()).padStart(2, '0') : '') + '</div>';
      }
      html += '<div class="heatmap-label"></div>';
      for (var s2 = 0; s2 < 12; s2++) {
        var cnt = counts['0:' + s2] || 0;
        var slotTime2 = new Date(rangeStart.getTime() + s2 * 5 * 60 * 1000);
        html += '<div class="heatmap-cell" style="background:' + cellColor(cnt) + '" title="' +
          slotTime2.getHours() + ':' + String(slotTime2.getMinutes()).padStart(2, '0') + ' \u2014 ' + cnt + '"></div>';
      }
      html += '</div>';
    }

    html += '<div class="heatmap-legend">' + t('heatmap.less') + ' ';
    heatColors.forEach(function(c) { html += '<div class="heatmap-legend-cell" style="background:' + c + '"></div>'; });
    html += ' ' + t('heatmap.more') + '</div>';
    el.innerHTML = html;
  } catch {
    el.innerHTML = '<div class="chart-empty">' + t('error.load_activity') + '</div>';
  }
}

function cc_loadMetricsExplorer() {
  initMetricsExplorer('cc-metrics');
}

// ===================================================================
// Claude Code view — Events tab
// ===================================================================
async function cc_loadEvents() {
  var filter = document.getElementById('cc-event-filter').value;
  var iv = intervalSQL();
  var where = "WHERE body LIKE 'claude_code.%' AND timestamp > NOW() - INTERVAL '" + iv + "'";
  if (filter) where = "WHERE body = '" + escapeSQLString(filter) + "' AND timestamp > NOW() - INTERVAL '" + iv + "'";

  try {
    var res = await query(
      "SELECT timestamp, body, " +
      "json_get_string(log_attributes, 'model') AS model, " +
      "json_get_int(log_attributes, 'input_tokens') AS input_tok, " +
      "json_get_int(log_attributes, 'output_tokens') AS output_tok, " +
      "json_get_int(log_attributes, 'cache_read_tokens') AS cache_read, " +
      "json_get_int(log_attributes, 'cache_creation_tokens') AS cache_create, " +
      "json_get_float(log_attributes, 'cost_usd') AS cost_usd, " +
      "json_get_float(log_attributes, 'duration_ms') AS duration_ms, " +
      "json_get_string(log_attributes, 'tool_name') AS tool_name, " +
      "json_get_string(log_attributes, 'success') AS success, " +
      "json_get_string(log_attributes, 'error') AS error, " +
      "log_attributes " +
      "FROM opentelemetry_logs " +
      where + " ORDER BY timestamp DESC LIMIT 100"
    );
    var data = rowsToObjects(res);
    var tbody = document.getElementById('cc-events-body');
    if (!data.length) {
      tbody.innerHTML = '<tr><td colspan="8" class="loading">' + t('empty.no_events') + '</td></tr>';
      return;
    }
    tbody.innerHTML = data.map(function(d, i) {
      var evtName = (d.body || '').replace('claude_code.', '');
      var tokens = (d.input_tok || d.output_tok) ? fmtNum((Number(d.input_tok) || 0) + (Number(d.output_tok) || 0)) : '\u2014';
      var cacheRead = Number(d.cache_read) || 0;
      var cacheCreate = Number(d.cache_create) || 0;
      var cacheDisplay = '\u2014';
      if (cacheRead || cacheCreate) {
        var total = cacheRead + cacheCreate;
        var hitPct = total > 0 ? ((cacheRead / total) * 100).toFixed(0) : '0';
        cacheDisplay = fmtNum(cacheRead) + ' / ' + fmtNum(cacheCreate) + ' <span style="color:var(--text-muted)">(' + hitPct + '% hit)</span>';
      }
      var cost = d.cost_usd != null ? fmtCost(d.cost_usd) : '\u2014';
      var dur = d.duration_ms != null ? Math.round(d.duration_ms) + 'ms' : '\u2014';
      var isErr = d.error || d.success === 'false' || evtName === 'api_error';
      var label = d.tool_name ? evtName + ' (' + d.tool_name + ')' : evtName;
      var attrsStr = typeof d.log_attributes === 'string' ? d.log_attributes : JSON.stringify(d.log_attributes || {});
      return '<tr class="clickable" onclick="cc_toggleEventDetail(this, ' + i + ')" data-attrs="' + escapeHTML(attrsStr) + '">' +
        '<td>' + fmtTime(d.timestamp) + '</td>' +
        '<td>' + escapeHTML(label) + '</td>' +
        '<td>' + escapeHTML(d.model || '\u2014') + '</td>' +
        '<td>' + tokens + '</td>' +
        '<td>' + cacheDisplay + '</td>' +
        '<td>' + cost + '</td>' +
        '<td>' + dur + '</td>' +
        '<td><span class="badge ' + (isErr ? 'badge-error' : 'badge-ok') + '">' + (isErr ? 'ERROR' : 'OK') + '</span></td>' +
        '</tr>';
    }).join('');
  } catch (err) {
    document.getElementById('cc-events-body').innerHTML =
      '<tr><td colspan="8" class="loading">Error: ' + escapeHTML(err.message) + '</td></tr>';
  }
}

function cc_toggleEventDetail(clickedRow, idx) {
  var prev = document.querySelector('.cc-event-detail-row');
  if (prev) {
    var prevIdx = prev.dataset.idx;
    prev.remove();
    if (prevIdx == idx) return;
  }
  var attrs = clickedRow.dataset.attrs;
  var formatted = attrs;
  try { formatted = JSON.stringify(JSON.parse(attrs), null, 2); } catch(e) {}
  var detailRow = document.createElement('tr');
  detailRow.className = 'cc-event-detail-row trace-detail-row';
  detailRow.dataset.idx = idx;
  detailRow.innerHTML = '<td colspan="8"><div class="trace-detail-inner">' +
    '<div class="detail-header"><h3>' + t('detail.event_details') + '</h3>' +
    '<button class="close-btn" onclick="this.closest(\'.cc-event-detail-row\').remove()">&times;</button></div>' +
    '<pre style="font-size:12px;color:var(--text-muted);overflow-x:auto;white-space:pre-wrap;word-break:break-all">' +
    escapeHTML(formatted) + '</pre></div></td>';
  clickedRow.after(detailRow);
}

// ===================================================================
// Claude Code view — Cost tab
// ===================================================================
async function cc_loadCostTab() {
  await Promise.all([
    cc_loadBurnRate(),
    cc_loadCostByModel(),
    cc_loadExpensiveRequests(),
    cc_loadCacheEfficiency(),
    cc_loadCCModelComparison(),
  ]);
}

async function cc_loadBurnRate() {
  try {
    var res = await query(
      "SELECT ROUND(SUM(json_get_float(log_attributes, 'cost_usd')), 4) AS cost_1h " +
      "FROM opentelemetry_logs " +
      "WHERE body = 'claude_code.api_request' " +
      "  AND timestamp > NOW() - INTERVAL '1 hour'"
    );
    var cost1h = Number(rows(res)?.[0]?.[0]) || 0;
    var container = document.getElementById('cc-burn-rate-cards');
    if (cost1h > 0) {
      container.style.display = '';
      document.getElementById('cc-burn-hour').textContent = '$' + cost1h.toFixed(4) + '/hr';
      document.getElementById('cc-burn-day').textContent = '$' + (cost1h * 24).toFixed(2);
      document.getElementById('cc-burn-week').textContent = '$' + (cost1h * 24 * 7).toFixed(2);
    } else {
      container.style.display = 'none';
    }
  } catch { /* ignore */ }
}

async function cc_loadCostByModel() {
  try {
    var tc = getThemeColors();
    var res = await query(
      "SELECT json_get_string(log_attributes, 'model') AS model, " +
      "SUM(json_get_float(log_attributes, 'cost_usd')) AS total_cost " +
      "FROM opentelemetry_logs " +
      "WHERE body = 'claude_code.api_request' " +
      "  AND timestamp > NOW() - INTERVAL '" + intervalSQL() + "' " +
      "GROUP BY model ORDER BY total_cost DESC"
    );
    var data = rowsToObjects(res);
    var el = document.getElementById('cc-cost-by-model');
    if (!data.length) { el.innerHTML = '<div class="chart-empty">' + t('empty.no_cost_data') + '</div>'; return; }
    var maxCost = Math.max.apply(null, data.map(function(d) { return Number(d.total_cost) || 0; }));
    el.innerHTML = data.map(function(d) {
      var pct = maxCost > 0 ? (Number(d.total_cost) / maxCost * 100) : 0;
      return '<div class="bar-row">' +
        '<div class="bar-label">' + escapeHTML(d.model || 'unknown') + '</div>' +
        '<div class="bar-track"><div class="bar-fill" style="width:' + pct + '%;background:' + tc.orange + '"></div></div>' +
        '<div class="bar-value">' + fmtCost(d.total_cost) + '</div></div>';
    }).join('');
  } catch { /* ignore */ }
}

async function cc_loadExpensiveRequests() {
  try {
    var res = await query(
      "SELECT timestamp, " +
      "json_get_string(log_attributes, 'model') AS model, " +
      "json_get_int(log_attributes, 'input_tokens') AS input_tok, " +
      "json_get_int(log_attributes, 'output_tokens') AS output_tok, " +
      "json_get_float(log_attributes, 'cost_usd') AS cost_usd, " +
      "json_get_float(log_attributes, 'duration_ms') AS duration_ms " +
      "FROM opentelemetry_logs " +
      "WHERE body = 'claude_code.api_request' " +
      "  AND timestamp > NOW() - INTERVAL '" + intervalSQL() + "' " +
      "ORDER BY json_get_float(log_attributes, 'cost_usd') DESC LIMIT 10"
    );
    var data = rowsToObjects(res);
    var tbody = document.getElementById('cc-expensive-body');
    if (!data.length) { tbody.innerHTML = '<tr><td colspan="6" class="loading">' + t('empty.no_data') + '</td></tr>'; return; }
    tbody.innerHTML = data.map(function(d) {
      return '<tr><td>' + fmtTime(d.timestamp) + '</td>' +
      '<td>' + escapeHTML(d.model || 'unknown') + '</td>' +
      '<td>' + fmtNum(d.input_tok) + '</td>' +
      '<td>' + fmtNum(d.output_tok) + '</td>' +
      '<td>' + fmtCost(d.cost_usd) + '</td>' +
      '<td>' + (d.duration_ms != null ? Math.round(d.duration_ms) + 'ms' : '\u2014') + '</td></tr>';
    }).join('');
  } catch { /* ignore */ }
}

async function cc_loadCacheEfficiency() {
  try {
    var tc = getThemeColors();
    var res = await query(
      "SELECT json_get_string(log_attributes, 'model') AS model, " +
      "SUM(json_get_int(log_attributes, 'cache_read_tokens')) AS cache_read, " +
      "SUM(json_get_int(log_attributes, 'cache_creation_tokens')) AS cache_create " +
      "FROM opentelemetry_logs " +
      "WHERE body = 'claude_code.api_request' " +
      "  AND timestamp > NOW() - INTERVAL '" + intervalSQL() + "' " +
      "GROUP BY model"
    );
    var data = rowsToObjects(res);
    var el = document.getElementById('cc-cache-chart');
    if (!data.length) { el.innerHTML = '<div class="chart-empty">' + t('empty.no_cache_data') + '</div>'; return; }
    el.innerHTML = data.map(function(d) {
      var cacheRead = Number(d.cache_read) || 0;
      var cacheCreate = Number(d.cache_create) || 0;
      var total = cacheRead + cacheCreate;
      var hitRate = total > 0 ? (cacheRead / total * 100).toFixed(1) : '0.0';
      return '<div class="bar-row">' +
        '<div class="bar-label">' + escapeHTML(d.model || 'unknown') + '</div>' +
        '<div class="bar-track"><div class="bar-fill" style="width:' + hitRate + '%;background:' + tc.green + '"></div></div>' +
        '<div class="bar-value">' + hitRate + '% hit (' + fmtNum(cacheRead) + '/' + fmtNum(total) + ')</div></div>';
    }).join('');
  } catch { /* ignore */ }
}

async function cc_loadCCModelComparison() {
  try {
    var res = await query(
      "SELECT json_get_string(log_attributes, 'model') AS model, " +
      "COUNT(*) AS reqs, " +
      "ROUND(AVG(json_get_float(log_attributes, 'duration_ms')), 0) AS avg_lat, " +
      "ROUND(AVG(json_get_float(log_attributes, 'cost_usd')), 6) AS avg_cost " +
      "FROM opentelemetry_logs " +
      "WHERE body = 'claude_code.api_request' " +
      "  AND timestamp > NOW() - INTERVAL '" + intervalSQL() + "' " +
      "GROUP BY model ORDER BY reqs DESC"
    );
    var data = rowsToObjects(res);

    var errMap = {};
    try {
      var errRes = await query(
        "SELECT json_get_string(log_attributes, 'model') AS model, COUNT(*) AS errs " +
        "FROM opentelemetry_logs " +
        "WHERE body = 'claude_code.api_error' " +
        "  AND timestamp > NOW() - INTERVAL '" + intervalSQL() + "' " +
        "GROUP BY model"
      );
      rowsToObjects(errRes).forEach(function(d) { errMap[d.model] = Number(d.errs) || 0; });
    } catch { /* no errors */ }

    var tbody = document.getElementById('cc-model-compare-body');
    if (!data.length) { tbody.innerHTML = '<tr><td colspan="5" class="loading">' + t('empty.no_data') + '</td></tr>'; return; }
    tbody.innerHTML = data.map(function(d) {
      var reqs = Number(d.reqs) || 0;
      var errs = errMap[d.model] || 0;
      var errRate = reqs > 0 ? ((errs / reqs) * 100).toFixed(1) + '%' : '0%';
      return '<tr>' +
        '<td>' + escapeHTML(d.model || 'unknown') + '</td>' +
        '<td>' + fmtNum(reqs) + '</td>' +
        '<td>' + (d.avg_lat != null ? Math.round(d.avg_lat) + 'ms' : '\u2014') + '</td>' +
        '<td>' + fmtCost(d.avg_cost) + '</td>' +
        '<td>' + errRate + '</td></tr>';
    }).join('');
  } catch { /* ignore */ }
}

// ===================================================================
// Claude Code view — Search tab
// ===================================================================
async function cc_doSearch() {
  var term = document.getElementById('cc-search-input').value.trim();
  if (!term) return;
  var el = document.getElementById('cc-search-results');
  el.innerHTML = '<div class="loading">' + t('empty.searching') + '</div>';

  try {
    var safeTerm = escapeSQLString(term);
    var like = "'%" + safeTerm + "%'";
    var res = await query(
      "SELECT timestamp, body, log_attributes " +
      "FROM opentelemetry_logs " +
      "WHERE body LIKE 'claude_code.%' " +
      "  AND (json_get_string(log_attributes, 'model') LIKE " + like +
      "  OR json_get_string(log_attributes, 'tool_name') LIKE " + like +
      "  OR json_get_string(log_attributes, 'error') LIKE " + like +
      "  OR json_get_string(log_attributes, 'decision') LIKE " + like +
      "  OR body LIKE " + like + ") " +
      "  AND timestamp > NOW() - INTERVAL '" + intervalSQL() + "' " +
      "ORDER BY timestamp DESC LIMIT 50"
    );
    var data = rowsToObjects(res);
    if (!data.length) { el.innerHTML = '<div class="loading">' + t('empty.no_results') + '</div>'; return; }
    el.innerHTML = data.map(function(d) {
      var evtName = (d.body || '').replace('claude_code.', '');
      var preview = typeof d.log_attributes === 'string' ? d.log_attributes : JSON.stringify(d.log_attributes || {});
      if (preview.length > 200) preview = preview.substring(0, 200) + '...';
      return '<div class="search-result-item">' +
        '<div class="search-result-meta">' +
        '<span>' + fmtTime(d.timestamp) + '</span>' +
        '<span>' + escapeHTML(evtName) + '</span></div>' +
        '<div class="search-result-content">' + escapeHTML(preview) + '</div></div>';
    }).join('');
  } catch (err) {
    el.innerHTML = '<div class="loading">' + t('error.search') + escapeHTML(err.message) + '</div>';
  }
}

async function cc_loadAnomalies() {
  var el = document.getElementById('cc-anomaly-list');
  el.innerHTML = '<div class="loading">' + t('empty.loading_anomalies') + '</div>';
  try {
    var iv = intervalSQL();
    var avgRes = await query(
      "SELECT AVG(json_get_float(log_attributes, 'cost_usd')) AS avg_cost " +
      "FROM opentelemetry_logs WHERE body = 'claude_code.api_request' " +
      "AND timestamp > NOW() - INTERVAL '" + iv + "'"
    );
    var avgCost = rows(avgRes)?.[0]?.[0] || 0;
    var threshold = Math.max(avgCost * 3, 0.01);

    var res = await query(
      "SELECT timestamp, " +
      "json_get_string(log_attributes, 'model') AS model, " +
      "json_get_float(log_attributes, 'cost_usd') AS cost_usd, " +
      "json_get_int(log_attributes, 'input_tokens') AS input_tok, " +
      "json_get_int(log_attributes, 'output_tokens') AS output_tok, " +
      "json_get_float(log_attributes, 'duration_ms') AS duration_ms, " +
      "json_get_string(log_attributes, 'error') AS error, " +
      "body, log_attributes " +
      "FROM opentelemetry_logs " +
      "WHERE ((body = 'claude_code.api_request' AND json_get_float(log_attributes, 'cost_usd') > " + threshold + ") " +
      "  OR body = 'claude_code.api_error') " +
      "  AND timestamp > NOW() - INTERVAL '" + iv + "' " +
      "ORDER BY timestamp DESC LIMIT 20"
    );
    var data = rowsToObjects(res);

    var slowToolItems = [];
    try {
      var toolAvgRes = await query(
        "SELECT json_get_string(log_attributes, 'tool_name') AS tool, " +
        "AVG(json_get_float(log_attributes, 'duration_ms')) AS avg_ms " +
        "FROM opentelemetry_logs " +
        "WHERE body = 'claude_code.tool_result' " +
        "  AND timestamp > NOW() - INTERVAL '" + iv + "' " +
        "GROUP BY tool"
      );
      var toolAvgs = {};
      rowsToObjects(toolAvgRes).forEach(function(r) { toolAvgs[r.tool] = Number(r.avg_ms) || 0; });

      var slowRes = await query(
        "SELECT timestamp, " +
        "json_get_string(log_attributes, 'tool_name') AS tool_name, " +
        "json_get_float(log_attributes, 'duration_ms') AS duration_ms, " +
        "log_attributes " +
        "FROM opentelemetry_logs " +
        "WHERE body = 'claude_code.tool_result' " +
        "  AND timestamp > NOW() - INTERVAL '" + iv + "' " +
        "ORDER BY json_get_float(log_attributes, 'duration_ms') DESC LIMIT 100"
      );
      rowsToObjects(slowRes).forEach(function(d) {
        var toolAvg = toolAvgs[d.tool_name] || 0;
        var dur = Number(d.duration_ms) || 0;
        if (toolAvg > 0 && dur > toolAvg * 3 && dur > 1000) {
          slowToolItems.push(d);
        }
      });
      slowToolItems = slowToolItems.slice(0, 10);
    } catch { /* ignore slow tool detection errors */ }

    if (!data.length && !slowToolItems.length) {
      el.innerHTML = '<div class="loading">' + t('empty.no_anomalies') + '</div>';
      return;
    }
    var html = data.map(function(d, i) {
      var reason = d.body === 'claude_code.api_error' ? t('anomaly.api_error') : t('anomaly.high_cost') + ' ($' + Number(d.cost_usd).toFixed(4) + ' > 3x avg $' + avgCost.toFixed(4) + ')';
      var severity = d.body === 'claude_code.api_error' ? '' : 'warn';
      var attrsStr = typeof d.log_attributes === 'string' ? d.log_attributes : JSON.stringify(d.log_attributes || {});
      return '<div class="anomaly-item ' + severity + '" style="cursor:pointer" onclick="cc_toggleAnomalyDetail(this, ' + i + ')" data-attrs="' + escapeHTML(attrsStr) + '">' +
        '<div class="anomaly-reason">' + reason + '</div>' +
        '<div style="font-size:13px">' +
        escapeHTML(d.model || 'unknown') + ' &middot; ' +
        fmtNum(d.input_tok) + ' in / ' + fmtNum(d.output_tok) + ' out &middot; ' +
        (d.duration_ms != null ? Math.round(d.duration_ms) + 'ms' : '') +
        (d.error ? ' &middot; ' + escapeHTML(d.error) : '') +
        ' &middot; ' + fmtTime(d.timestamp) +
        '</div><div class="anomaly-detail" style="display:none"></div></div>';
    }).join('');

    slowToolItems.forEach(function(d, i) {
      var attrsStr = typeof d.log_attributes === 'string' ? d.log_attributes : JSON.stringify(d.log_attributes || {});
      html += '<div class="anomaly-item warn" style="cursor:pointer" onclick="cc_toggleAnomalyDetail(this, ' + (data.length + i) + ')" data-attrs="' + escapeHTML(attrsStr) + '">' +
        '<div class="anomaly-reason">' + t('anomaly.slow_tool') + '</div>' +
        '<div style="font-size:13px">' +
        escapeHTML(d.tool_name || 'unknown') + ' &middot; ' +
        Math.round(Number(d.duration_ms)) + 'ms &middot; ' +
        fmtTime(d.timestamp) +
        '</div><div class="anomaly-detail" style="display:none"></div></div>';
    });
    el.innerHTML = html;
  } catch {
    el.innerHTML = '<div class="loading">' + t('error.load_anomalies') + '</div>';
  }
}

function cc_toggleAnomalyDetail(item, idx) {
  var detail = item.querySelector('.anomaly-detail');
  if (detail.style.display !== 'none') { detail.style.display = 'none'; return; }
  document.querySelectorAll('#cc-anomaly-list .anomaly-detail').forEach(function(d) { d.style.display = 'none'; });
  var attrs = item.dataset.attrs;
  var formatted = attrs;
  try { formatted = JSON.stringify(JSON.parse(attrs), null, 2); } catch(e) {}
  detail.innerHTML = '<pre style="font-size:12px;color:var(--text-muted);margin-top:8px;overflow-x:auto;white-space:pre-wrap;word-break:break-all">' + escapeHTML(formatted) + '</pre>';
  detail.style.display = 'block';
}
