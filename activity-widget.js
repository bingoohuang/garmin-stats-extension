(() => {
  const activityRowSelector = '[class*="ActivityListItem_listItem"]';
  const activityMetricsSelector = '[class*="ActivityListItem_metricsContainer"]';
  const activityMetricSelector = '[class*="ActivityListItem_metricItem__"]';
  const activityMetricValueSelector = '[class*="ActivityListItem_metricValue__"]';
  const activityMetricLabelSelector = '[class*="ActivityListItem_metricLabel__"]';

  function addActivityIdColumns() {
    document.querySelectorAll(activityRowSelector).forEach((row) => {
      const activityLink = row.querySelector('a[href^="/app/activity/"]');
      const metrics = row.querySelector(activityMetricsSelector);
      const distanceMetric = Array.from(
        metrics?.querySelectorAll(activityMetricSelector) || [],
      ).find(
        (metric) =>
          metric.querySelector(activityMetricLabelSelector)?.textContent?.trim() ===
          "距离",
      );
      const activityId = activityLink?.getAttribute("href")?.split("/").pop();
      if (!metrics || !distanceMetric || !/^\d+$/.test(activityId || "")) return;
      const existingCell = row.querySelector("[data-garmin-stats-activity-id]");
      if (existingCell?.dataset.garminStatsActivityId === activityId) return;
      existingCell?.remove();

      const cell = distanceMetric.cloneNode(false);
      const value = distanceMetric.querySelector(activityMetricValueSelector)?.cloneNode(false);
      const label = distanceMetric.querySelector(activityMetricLabelSelector)?.cloneNode(false);
      if (!value || !label) return;

      const link = document.createElement("a");
      link.href = `https://connect.garmin.cn/app/activity/${activityId}`;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = activityId;
      link.title = `在新标签页打开活动 ${activityId}`;
      link.setAttribute("aria-label", `在新标签页打开 Garmin 活动 ${activityId}`);
      link.style.color = "#087a58";
      link.style.fontSize = "11px";
      link.style.fontWeight = "700";
      link.style.fontVariantNumeric = "tabular-nums";
      link.style.textUnderlineOffset = "2px";
      link.style.whiteSpace = "nowrap";
      value.append(link);
      label.textContent = "活动ID";
      cell.dataset.garminStatsActivityId = activityId;
      cell.append(value, label);
      metrics.insertBefore(cell, distanceMetric);
    });
  }

  function removeActivityIdColumns() {
    document.querySelectorAll("[data-garmin-stats-activity-id]").forEach((cell) => cell.remove());
  }

  function mountWidget() {
  if (document.querySelector("#garmin-stats-widget-host")) return;

  const host = document.createElement("div");
  host.id = "garmin-stats-widget-host";
  document.documentElement.append(host);
  const root = host.attachShadow({ mode: "open" });
  const state = {
    sport: "running",
    period: "month",
    chartMetric: "distance",
    open: false,
    loading: false,
    requestId: 0,
    selectedIndex: 0,
    summary: null,
  };

  root.innerHTML = `
    <style>
      :host { all:initial; }
      * { box-sizing:border-box; letter-spacing:0; }
      .wrap { --accent:#24ca91; --accent-dark:#087a58; --soft:#e4f8f0; --ink:#161a19; --muted:#66716c; --line:#e8ecea;
        position:fixed; right:24px; bottom:24px; z-index:2147483646; color:var(--ink); font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif; }
      .wrap.ride { --accent:#ff795e; --accent-dark:#a9402d; --soft:#fff0ec; }
      button { color:inherit; font:inherit; }
      .launcher { display:flex; align-items:center; justify-content:center; width:52px; height:52px; margin-left:auto; padding:0; border:1px solid rgba(0,0,0,.1); border-radius:50%; background:#fff; box-shadow:0 6px 20px rgba(23,32,29,.22); cursor:pointer; }
      .launcher:hover { transform:translateY(-1px); box-shadow:0 8px 24px rgba(23,32,29,.26); }
      .launcher img { width:34px; height:34px; }
      .panel { width:390px; max-height:min(720px,calc(100vh - 90px)); margin-bottom:12px; overflow:auto; border:1px solid #e8ecea; border-radius:12px; background:#f4f6f7; box-shadow:0 16px 42px rgba(23,32,29,.24); }
      .panel[hidden] { display:none; }
      .head { display:flex; align-items:center; justify-content:space-between; min-height:54px; padding:10px 14px 6px; }
      .brand { display:flex; align-items:center; gap:8px; }
      .brand img { width:28px; height:28px; }
      .brand strong { display:block; font-size:15px; line-height:19px; }
      .brand span { display:block; color:var(--muted); font-size:9px; }
      .actions { display:flex; gap:2px; }
      .icon { display:flex; align-items:center; justify-content:center; width:32px; height:32px; padding:0; border:0; border-radius:7px; background:transparent; cursor:pointer; }
      .icon:hover { background:#e7ebe9; }
      .icon svg { width:17px; height:17px; fill:none; stroke:currentColor; stroke-width:1.8; stroke-linecap:round; stroke-linejoin:round; }
      .icon.spin svg { animation:spin .8s linear infinite; }
      .period-tabs { display:grid; grid-template-columns:repeat(2,1fr); margin:4px 14px 0; padding:4px; border-radius:10px; background:#e7ecea; }
      .period-tabs button { min-height:34px; border:0; border-radius:8px; background:transparent; color:#565e5b; font-size:12px; font-weight:700; cursor:pointer; }
      .period-tabs button[aria-pressed="true"] { color:var(--accent-dark); background:#fff; box-shadow:0 2px 7px rgba(31,52,45,.07); }
      .filters { display:flex; align-items:center; justify-content:space-between; gap:10px; padding:14px; }
      .sport { display:flex; gap:4px; }
      .sport button { min-height:32px; padding:5px 10px; border:1px solid var(--line); border-radius:8px; background:#fff; color:#626a67; font-size:11px; font-weight:650; cursor:pointer; }
      .sport button[aria-pressed="true"] { border-color:var(--accent-dark); color:#fff; background:var(--accent-dark); }
      .range { color:#66716c; font-size:10px; font-weight:650; }
      .body { min-height:350px; margin:0 14px 14px; padding:18px 16px; border:1px solid #eef1f0; border-radius:12px; background:#fff; box-shadow:0 8px 24px rgba(31,52,45,.06); }
      .loading,.error { display:flex; min-height:314px; align-items:center; justify-content:center; color:var(--muted); font-size:12px; text-align:center; }
      .error { color:#a64b36; }
      .summary { display:flex; align-items:flex-start; justify-content:space-between; gap:10px; }
      .distance { display:flex; align-items:baseline; gap:6px; }
      .distance strong { font-family:"Arial Narrow","Roboto Condensed",Impact,sans-serif; font-size:36px; line-height:40px; font-weight:800; font-variant-numeric:tabular-nums; }
      .distance span { font-size:13px; font-weight:650; }
      .meta { margin:3px 0 0; color:var(--muted); font-size:10px; }
      .mode { display:flex; padding:2px; border:1px solid #dfe4e2; border-radius:8px; }
      .mode button { min-width:42px; min-height:27px; padding:3px 6px; border:0; border-radius:6px; background:transparent; font-size:10px; font-weight:700; cursor:pointer; }
      .mode button[aria-pressed="true"] { color:var(--accent-dark); background:var(--soft); }
      .chart-head { display:flex; justify-content:space-between; margin-top:14px; color:#66716c; font-size:9px; }
      .chart { display:grid; grid-template-columns:repeat(var(--days),minmax(0,1fr)); align-items:end; height:126px; gap:2px; margin-top:5px; padding:14px 1px 8px; border-bottom:1px solid var(--line); background:repeating-linear-gradient(to bottom,transparent 0,transparent 42px,#f0f2f1 43px); }
      .chart:focus-visible { outline:2px solid var(--accent-dark); outline-offset:2px; }
      .bar { min-height:2px; height:var(--height); border-radius:3px 3px 1px 1px; background:linear-gradient(180deg,#55e0ad,var(--accent)); opacity:.8; }
      .bar.selected { opacity:1; box-shadow:0 0 0 1px var(--accent-dark); }
      .ride .bar { background:linear-gradient(180deg,#ff9a82,var(--accent)); }
      .chart-detail { min-height:16px; margin-top:6px; color:var(--accent-dark); font-size:9px; font-weight:700; text-align:center; }
      .cumulative-title { margin:15px 0 10px; color:#5e6763; font-size:10px; }
      .metrics { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:13px 20px; }
      .metric span { display:block; color:#5e6763; font-size:10px; }
      .metric strong { display:block; margin-top:3px; font-family:"Arial Narrow","Roboto Condensed",Impact,sans-serif; font-size:20px; line-height:24px; font-weight:800; font-variant-numeric:tabular-nums; }
      .warning { margin:0 14px 14px; padding:8px 10px; border-radius:8px; color:#754d0b; background:#fff2d6; font-size:10px; text-align:center; }
      @keyframes spin { to { transform:rotate(360deg); } }
      @media (max-width:520px) { .wrap { right:12px; bottom:12px; } .panel { width:min(390px,calc(100vw - 24px)); } }
      @media (prefers-reduced-motion:reduce) { * { animation-duration:.01ms!important; transition-duration:.01ms!important; } }
    </style>
    <div class="wrap">
      <section class="panel" hidden tabindex="-1" aria-label="Garmin 运动数据统计">
        <header class="head"><div class="brand"><img src="${chrome.runtime.getURL("icons/icon32.png")}" alt=""><div><strong>运动数据统计</strong><span>Garmin Connect China</span></div></div><div class="actions"><button class="icon refresh" type="button" title="刷新" aria-label="刷新"><svg viewBox="0 0 24 24"><path d="M21 12a9 9 0 0 0-15.1-6.6L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 15.1 6.6L21 16"/><path d="M16 16h5v5"/></svg></button><button class="icon close" type="button" title="关闭" aria-label="关闭"><svg viewBox="0 0 24 24"><path d="m6 6 12 12M18 6 6 18"/></svg></button></div></header>
        <div class="period-tabs period"><button data-period="week" aria-pressed="false">周</button><button data-period="month" aria-pressed="true">月</button></div>
        <div class="filters"><div class="sport"><button data-sport="running" aria-pressed="true">跑步</button><button data-sport="cycling" aria-pressed="false">骑行</button></div><span class="range"></span></div>
        <div class="body"><div class="loading">正在读取活动数据...</div></div><div class="warning" hidden></div>
      </section>
      <button class="launcher" type="button" aria-label="打开 Garmin 运动统计" aria-expanded="false"><img src="${chrome.runtime.getURL("icons/icon48.png")}" alt=""></button>
    </div>`;

  const wrap = root.querySelector(".wrap");
  const panel = root.querySelector(".panel");
  const launcher = root.querySelector(".launcher");
  const body = root.querySelector(".body");
  const refresh = root.querySelector(".refresh");
  const range = root.querySelector(".range");
  const warning = root.querySelector(".warning");
  const number = (value, digits = 1) => Number(value || 0).toLocaleString("zh-CN", { minimumFractionDigits: digits, maximumFractionDigits: digits });
  const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" })[character]);
  const duration = (seconds) => {
    const minutes = Math.round(Number(seconds || 0) / 60);
    return minutes >= 60 ? `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}` : `${minutes} 分`;
  };
  const shortDate = (value) => {
    const date = new Date(`${value}T00:00:00`);
    return `${String(date.getMonth() + 1).padStart(2, "0")}.${String(date.getDate()).padStart(2, "0")}`;
  };

  function syncControls() {
    wrap.classList.toggle("ride", state.sport === "cycling");
    root.querySelectorAll("[data-sport]").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.sport === state.sport)));
    root.querySelectorAll("[data-period]").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.period === state.period)));
  }

  function render(summary) {
    state.summary = summary;
    range.textContent = `${state.period === "month" ? "本月" : "本周"} ${shortDate(summary.range.startDate)}–${shortDate(summary.range.endDate)}`;
    const values = summary.daily.map((day) => state.chartMetric === "duration" ? day.durationSeconds : day.distanceKm);
    const max = Math.max(0, ...values);
    state.selectedIndex = Math.max(0, summary.daily.findIndex((day) => day.dateKey === summary.range.today));
    const bars = summary.daily.map((day, index) => `<div id="garmin-widget-day-${day.dateKey}" class="bar${index === state.selectedIndex ? " selected" : ""}" role="option" aria-selected="${index === state.selectedIndex}" aria-label="${day.dateKey}，${state.chartMetric === "duration" ? duration(day.durationSeconds) : `${number(day.distanceKm)} 公里`}，${day.count} 次活动" data-index="${index}" style="--height:${max ? Math.max(3, values[index] / max * 100) : 3}%"></div>`).join("");
    body.innerHTML = `<div class="summary"><div><div class="distance"><strong>${number(summary.totalDistanceKm)}</strong><span>公里</span></div><p class="meta">累计${state.sport === "running" ? "跑步" : "骑行"} · ${summary.activeDays} 个运动日</p></div><div class="mode"><button data-metric="distance" aria-pressed="${state.chartMetric === "distance"}">里程</button><button data-metric="duration" aria-pressed="${state.chartMetric === "duration"}">时长</button></div></div>
      <div class="chart-head"><span>${state.chartMetric === "duration" ? "每日运动时长" : "每日运动里程"}</span><span>${state.chartMetric === "duration" ? "单位：小时" : "单位：公里"}</span></div><div class="chart" role="listbox" tabindex="0" aria-label="每日运动数据，使用左右方向键查看日期" aria-activedescendant="garmin-widget-day-${summary.daily[state.selectedIndex]?.dateKey}" style="--days:${summary.daily.length}">${bars}</div><div class="chart-detail" aria-live="polite"></div>
      <p class="cumulative-title">累计数据</p><div class="metrics"><div class="metric"><span>累计里程（公里）</span><strong>${number(summary.totalDistanceKm)}</strong></div><div class="metric"><span>累计运动（次）</span><strong>${summary.count}</strong></div><div class="metric"><span>累计时长</span><strong>${duration(summary.totalDurationSeconds)}</strong></div><div class="metric"><span>累计爬升（米）</span><strong>${Math.round(summary.elevationGain)}</strong></div></div>`;
    updateChartDetail(state.selectedIndex);
  }

  function updateChartDetail(index) {
    const day = state.summary?.daily[index];
    const chart = body.querySelector(".chart");
    const detail = body.querySelector(".chart-detail");
    if (!day || !chart || !detail) return;
    state.selectedIndex = index;
    chart.setAttribute("aria-activedescendant", `garmin-widget-day-${day.dateKey}`);
    chart.querySelectorAll(".bar").forEach((bar, barIndex) => {
      bar.classList.toggle("selected", barIndex === index);
      bar.setAttribute("aria-selected", String(barIndex === index));
    });
    detail.textContent = `${day.dateKey.slice(5).replace("-", "月")}日 · ${state.chartMetric === "duration" ? duration(day.durationSeconds) : `${number(day.distanceKm)} km`} · ${day.count} 次`;
  }

  async function load(force = false) {
    const requestId = ++state.requestId;
    const query = { sport: state.sport, period: state.period, force };
    state.loading = true;
    refresh.classList.add("spin");
    warning.hidden = true;
    if (!force || !state.summary) {
      body.innerHTML = '<div class="loading">正在读取活动数据...</div>';
    }
    try {
      const response = await chrome.runtime.sendMessage({ type:"GARMIN_STATS_GET", payload:query });
      if (requestId !== state.requestId) return;
      if (!response?.ok) throw new Error(response?.error?.message || "读取 Garmin 数据失败");
      render(response.data.summary);
    } catch (error) {
      if (requestId !== state.requestId) return;
      if (force && state.summary) {
        render(state.summary);
        warning.textContent = `${error?.message || "刷新失败"}，当前数据未更新`;
        warning.hidden = false;
      } else {
        body.innerHTML = `<div class="error">${escapeHtml(error?.message || "读取失败")}</div>`;
      }
    } finally {
      if (requestId === state.requestId) {
        state.loading = false;
        refresh.classList.remove("spin");
      }
    }
  }

  async function setFilter(next) {
    Object.assign(state, next);
    syncControls();
    await chrome.storage.local.set({ preferences:{ sport:state.sport, period:state.period } });
    await load();
  }

  launcher.addEventListener("click", async () => { state.open = !state.open; panel.hidden = !state.open; launcher.setAttribute("aria-expanded", String(state.open)); if (state.open) { refresh.focus(); await load(); } });
  root.querySelector(".close").addEventListener("click", () => {
    state.open = false;
    panel.hidden = true;
    launcher.setAttribute("aria-expanded", "false");
    launcher.focus();
  });
  refresh.addEventListener("click", () => load(true));
  root.querySelector(".sport").addEventListener("click", (event) => event.target.dataset.sport && setFilter({ sport:event.target.dataset.sport }));
  root.querySelector(".period").addEventListener("click", (event) => event.target.dataset.period && setFilter({ period:event.target.dataset.period }));
  body.addEventListener("click", (event) => {
    if (event.target.dataset.index !== undefined) {
      updateChartDetail(Number(event.target.dataset.index));
    }
    if (!event.target.dataset.metric || event.target.dataset.metric === state.chartMetric) return;
    state.chartMetric = event.target.dataset.metric;
    if (state.summary) render(state.summary);
  });
  body.addEventListener("keydown", (event) => {
    if (!event.target.classList.contains("chart") || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const last = (state.summary?.daily.length || 1) - 1;
    if (event.key === "ArrowLeft") updateChartDetail(Math.max(0, state.selectedIndex - 1));
    if (event.key === "ArrowRight") updateChartDetail(Math.min(last, state.selectedIndex + 1));
    if (event.key === "Home") updateChartDetail(0);
    if (event.key === "End") updateChartDetail(last);
  });
  panel.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      state.open = false;
      panel.hidden = true;
      launcher.setAttribute("aria-expanded", "false");
      launcher.focus();
    }
  });

  chrome.storage.local.get("preferences").then(({ preferences = {} }) => {
    if (["running", "cycling"].includes(preferences.sport)) state.sport = preferences.sport;
    if (["month", "week"].includes(preferences.period)) state.period = preferences.period;
    syncControls();
  });
  }

  function syncRoute() {
    const onActivities = location.origin === "https://connect.garmin.cn" && location.pathname === "/app/activities";
    const host = document.querySelector("#garmin-stats-widget-host");
    if (onActivities) {
      if (!host) mountWidget();
      addActivityIdColumns();
    } else {
      if (host) host.remove();
      removeActivityIdColumns();
    }
  }

  syncRoute();
  setInterval(syncRoute, 500);
})();
