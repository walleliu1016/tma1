// views.js — view management, theme, tab navigation, init
// Depends on: core.js, chart.js, i18n.js, traces.js, claude-code.js
// Must be loaded LAST. Calls initViews() at the bottom.

var currentView = null; // 'claude-code', 'openclaw', or 'traces'
var dataSources = { hasLogs: false, hasTraces: false, hasOpenClaw: false, hasGenAITraces: false, ccMetrics: [] };

async function detectDataSources() {
  try {
    var res = await query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'"
    );
    var tables = rowsToObjects(res).map(function(r) { return r.table_name; });
    var result = {
      hasLogs: tables.includes('opentelemetry_logs'),
      hasTraces: tables.includes('opentelemetry_traces'),
      hasOpenClaw: false,
      hasGenAITraces: false,
      ccMetrics: tables.filter(function(t) { return t.startsWith('claude_code_'); }),
    };
    if (result.hasTraces) {
      try {
        var colRes = await query(
          "SELECT column_name FROM information_schema.columns " +
          "WHERE table_name = 'opentelemetry_traces' AND table_schema = 'public'"
        );
        var columns = rowsToObjects(colRes).map(function(r) { return r.column_name; });
        result.hasOpenClaw = columns.some(function(c) { return c.indexOf('span_attributes.openclaw.') === 0; });
        result.hasGenAITraces = columns.some(function(c) { return c.indexOf('span_attributes.gen_ai.') === 0; });
      } catch { /* column detection failed, fall back to showing traces view */ }
      // If column detection failed or neither schema found, default to GenAI
      if (!result.hasOpenClaw && !result.hasGenAITraces) {
        result.hasGenAITraces = true;
      }
    }
    return result;
  } catch {
    return { hasLogs: false, hasTraces: false, hasOpenClaw: false, hasGenAITraces: false, ccMetrics: [] };
  }
}

function updateHash() {
  var hash = currentView || '';
  if (currentView === 'claude-code') {
    var tab = document.querySelector('#cc-tabs .tab.active');
    var tabName = tab ? tab.dataset.cctab : null;
    if (tabName && tabName !== 'cc-overview') hash += '/' + tabName;
  } else if (currentView === 'openclaw') {
    var tab3 = document.querySelector('#oc-tabs .tab.active');
    var tabName3 = tab3 ? tab3.dataset.octab : null;
    if (tabName3 && tabName3 !== 'oc-overview') hash += '/' + tabName3;
  } else if (currentView === 'traces') {
    var tab2 = document.querySelector('#view-traces .tab.active');
    var tabName2 = tab2 ? tab2.dataset.tab : null;
    if (tabName2 && tabName2 !== 'overview') hash += '/' + tabName2;
  }
  hash += '/' + currentTimeRange;
  history.replaceState(null, '', '#' + hash);
}

function parseHash() {
  var h = location.hash.replace('#', '');
  if (!h) return { view: null, tab: null, range: null };
  var parts = h.split('/');
  var validRanges = ['1h', '6h', '24h', '7d'];
  var range = null;
  if (parts.length > 0 && validRanges.includes(parts[parts.length - 1])) {
    range = parts.pop();
  }
  return { view: parts[0] || null, tab: parts[1] || null, range: range };
}

async function switchView(viewId, skipHash) {
  document.getElementById('view-claude-code').style.display = 'none';
  document.getElementById('view-openclaw').style.display = 'none';
  document.getElementById('view-traces').style.display = 'none';
  document.getElementById('setup-notice').style.display = 'none';

  currentView = viewId;
  var viewEl = document.getElementById('view-' + viewId);
  if (viewEl) {
    viewEl.style.display = 'block';
    if (viewId === 'claude-code') {
      cc_loadCards();
      cc_loadOverview();
    } else if (viewId === 'openclaw') {
      oc_loadCards();
      oc_loadOverview();
    } else if (viewId === 'traces') {
      await loadPricing();
      loadMetrics();
      loadOverviewCharts();
    }
  }
  if (!skipHash) updateHash();
}

async function initViews() {
  dataSources = await detectDataSources();
  var hasCCView = dataSources.hasLogs || dataSources.ccMetrics.length > 0;
  var hasTracesView = dataSources.hasTraces;
  var viewSelect = document.getElementById('view-select');

  viewSelect.innerHTML = '';
  var views = [];
  if (hasCCView) views.push({ id: 'claude-code', label: 'Claude Code' });
  if (dataSources.hasOpenClaw) views.push({ id: 'openclaw', label: 'OpenClaw' });
  if (dataSources.hasGenAITraces) views.push({ id: 'traces', label: 'OTel GenAI' });

  if (views.length === 0) {
    document.getElementById('setup-notice').style.display = 'block';
    viewSelect.style.display = 'none';
    return;
  }

  views.forEach(function(v) {
    var opt = document.createElement('option');
    opt.value = v.id;
    opt.textContent = v.label;
    viewSelect.appendChild(opt);
  });

  if (views.length > 1) {
    viewSelect.style.display = '';
  } else {
    viewSelect.style.display = 'none';
  }

  // Restore view + tab + time range from URL hash
  var hash = parseHash();
  if (hash.range) {
    currentTimeRange = hash.range;
    document.getElementById('time-range').value = hash.range;
  }
  var viewIds = views.map(function(v) { return v.id; });
  var targetView = hash.view && viewIds.includes(hash.view) ? hash.view : views[0].id;
  viewSelect.value = targetView;
  switchView(targetView, true);

  // Restore tab within view
  if (hash.tab) {
    if (targetView === 'claude-code') {
      var tabBtn = document.querySelector('#cc-tabs .tab[data-cctab="' + hash.tab + '"]');
      if (tabBtn) tabBtn.click();
    } else if (targetView === 'openclaw') {
      var tabBtn3 = document.querySelector('#oc-tabs .tab[data-octab="' + hash.tab + '"]');
      if (tabBtn3) tabBtn3.click();
    } else if (targetView === 'traces') {
      var tabBtn2 = document.querySelector('#view-traces .tab[data-tab="' + hash.tab + '"]');
      if (tabBtn2) tabBtn2.click();
    }
  }
  updateHash();
}

// ===================================================================
// Tab navigation (Traces view)
// ===================================================================
document.querySelectorAll('#view-traces .tab').forEach(function(btn) {
  btn.addEventListener('click', function() {
    document.querySelectorAll('#view-traces .tab').forEach(function(t) { t.classList.remove('active'); });
    document.querySelectorAll('#view-traces .tab-content').forEach(function(t) { t.classList.remove('active'); });
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
    onTabChange(btn.dataset.tab);
    updateHash();
  });
});

async function onTabChange(tab) {
  if (tab === 'traces') loadTraces();
  else if (tab === 'cost') { await loadPricing(); loadCostTab(); }
  else if (tab === 'security') loadSecurityTab();
  else if (tab === 'search') loadAnomalies();
  else if (tab === 'overview') { await loadPricing(); loadOverviewCharts(); }
}

// Tab navigation (OpenClaw view)
document.querySelectorAll('#oc-tabs .tab').forEach(function(btn) {
  btn.addEventListener('click', function() {
    document.querySelectorAll('#oc-tabs .tab').forEach(function(t) { t.classList.remove('active'); });
    document.querySelectorAll('#view-openclaw .tab-content').forEach(function(t) { t.classList.remove('active'); });
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.octab).classList.add('active');
    oc_onTabChange(btn.dataset.octab);
    updateHash();
  });
});

// Tab navigation (Claude Code view)
document.querySelectorAll('#cc-tabs .tab').forEach(function(btn) {
  btn.addEventListener('click', function() {
    document.querySelectorAll('#cc-tabs .tab').forEach(function(t) { t.classList.remove('active'); });
    document.querySelectorAll('#view-claude-code .tab-content').forEach(function(t) { t.classList.remove('active'); });
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.cctab).classList.add('active');
    cc_onTabChange(btn.dataset.cctab);
    updateHash();
  });
});

function cc_onTabChange(tab) {
  if (tab === 'cc-overview') cc_loadOverview();
  else if (tab === 'cc-events') cc_loadEvents();
  else if (tab === 'cc-cost') cc_loadCostTab();
  else if (tab === 'cc-search') cc_loadAnomalies();
}

function onTimeRangeChange() {
  currentTimeRange = document.getElementById('time-range').value;
  updateHash();
  if (currentView === 'traces') {
    loadMetrics();
    var activeTab = document.querySelector('#view-traces .tab.active');
    var tabName = activeTab ? activeTab.dataset.tab : null;
    if (tabName) onTabChange(tabName);
  } else if (currentView === 'openclaw') {
    oc_loadCards();
    var activeTab3 = document.querySelector('#oc-tabs .tab.active');
    var tabName3 = activeTab3 ? activeTab3.dataset.octab : null;
    if (tabName3) oc_onTabChange(tabName3);
  } else if (currentView === 'claude-code') {
    cc_loadCards();
    var activeTab2 = document.querySelector('#cc-tabs .tab.active');
    var tabName2 = activeTab2 ? activeTab2.dataset.cctab : null;
    if (tabName2) cc_onTabChange(tabName2);
  }
}

// ===================================================================
// Status check
// ===================================================================
async function checkStatus() {
  try {
    var r = await fetch('/status');
    var data = await r.json();
    var dot = document.getElementById('status-dot');
    if (data.greptimedb === 'running') {
      dot.classList.remove('offline');
    } else {
      dot.classList.add('offline');
    }
  } catch {
    document.getElementById('status-dot').classList.add('offline');
  }
}

// ===================================================================
// Theme management
// ===================================================================
function getSystemTheme() {
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

function setTheme(mode) {
  // mode: 'light', 'dark', or 'system'
  localStorage.setItem('tma1-theme', mode);
  var resolved = mode === 'system' ? getSystemTheme() : mode;
  document.documentElement.setAttribute('data-theme', resolved);
  // Update toggle buttons
  document.querySelectorAll('.theme-toggle button').forEach(function(btn) {
    btn.classList.toggle('active', btn.dataset.theme === mode);
  });
  // Rebuild current view charts (colors change with theme)
  if (currentView === 'claude-code') {
    cc_loadOverview();
  } else if (currentView === 'openclaw') {
    oc_loadOverview();
  } else if (currentView === 'traces') {
    loadOverviewCharts();
  }
}

function initTheme() {
  var saved = localStorage.getItem('tma1-theme') || 'dark';
  var resolved = saved === 'system' ? getSystemTheme() : (saved === 'light' || saved === 'dark' ? saved : 'dark');
  document.documentElement.setAttribute('data-theme', resolved);
  document.querySelectorAll('.theme-toggle button').forEach(function(btn) {
    btn.classList.toggle('active', btn.dataset.theme === saved);
  });
  // Listen for OS theme changes when in system mode
  window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', function() {
    if (localStorage.getItem('tma1-theme') === 'system') {
      document.documentElement.setAttribute('data-theme', getSystemTheme());
    }
  });
}

// ===================================================================
// Init
// ===================================================================
initTheme();
initLocale();
checkStatus();
initViews();
setInterval(checkStatus, 10000);
