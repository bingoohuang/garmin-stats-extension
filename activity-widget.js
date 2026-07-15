(() => {
  const activityRowSelector = '[class*="ActivityListItem_listItem"]';
  const activityMetricsSelector = '[class*="ActivityListItem_metricsContainer"]';
  const activityMetricSelector = '[class*="ActivityListItem_metricItem__"]';
  const activityMetricValueSelector = '[class*="ActivityListItem_metricValue__"]';
  const activityMetricLabelSelector = '[class*="ActivityListItem_metricLabel__"]';
  const sportOrder = ["running", "cycling"];
  const sportLabels = { running: "跑步", cycling: "骑行" };

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
      sports: ["running"],
      period: "month",
      chartMetrics: { running: "distance", cycling: "distance" },
      selectedIndexes: { running: null, cycling: null },
      summaries: new Map(),
      open: false,
      requestId: 0,
    };

    root.innerHTML = `
      <style>
        :host { all:initial; }
        * { box-sizing:border-box; letter-spacing:0; }
        .wrap { --ink:#161a19; --muted:#66716c; --line:#e8ecea; position:fixed; right:24px; bottom:24px; z-index:2147483646; color:var(--ink); font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif; }
        button { color:inherit; font:inherit; }
        .launcher { display:flex; align-items:center; justify-content:center; width:52px; height:52px; margin-left:auto; padding:0; border:1px solid rgba(0,0,0,.1); border-radius:50%; background:#fff; box-shadow:0 6px 20px rgba(23,32,29,.22); cursor:pointer; }
        .launcher:hover { transform:translateY(-1px); box-shadow:0 8px 24px rgba(23,32,29,.26); }
        .launcher img { width:34px; height:34px; }
        .panel { width:390px; max-width:calc(100vw - 48px); max-height:min(720px,calc(100vh - 90px)); margin-bottom:12px; overflow:auto; border:1px solid #e8ecea; border-radius:12px; background:#f4f6f7; box-shadow:0 16px 42px rgba(23,32,29,.24); }
        .wrap.multi .panel { width:780px; }
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
        .period-tabs button[aria-pressed="true"] { color:#087a58; background:#fff; box-shadow:0 2px 7px rgba(31,52,45,.07); }
        .filters { display:flex; align-items:center; justify-content:space-between; gap:10px; padding:14px; }
        .sport { display:flex; gap:4px; }
        .sport button { min-height:32px; padding:5px 10px; border:1px solid var(--line); border-radius:8px; background:#fff; color:#626a67; font-size:11px; font-weight:650; cursor:pointer; }
        .sport button[aria-pressed="true"]::before { content:"✓"; margin-right:4px; font-size:9px; }
        .sport button[data-sport="running"][aria-pressed="true"] { border-color:#087a58; color:#fff; background:#087a58; }
        .sport button[data-sport="cycling"][aria-pressed="true"] { border-color:#a9402d; color:#fff; background:#a9402d; }
        .sport button:disabled { cursor:default; }
        .range { color:#66716c; font-size:10px; font-weight:650; }
        .columns { display:grid; grid-template-columns:repeat(var(--column-count,1),minmax(0,1fr)); gap:10px; margin:0 14px 14px; }
        .column { --accent:#24ca91; --accent-dark:#087a58; --soft:#e4f8f0; min-width:0; min-height:350px; padding:18px 16px; border:1px solid #eef1f0; border-radius:12px; background:#fff; box-shadow:0 8px 24px rgba(31,52,45,.06); }
        .column[data-sport="cycling"] { --accent:#ff795e; --accent-dark:#a9402d; --soft:#fff0ec; }
        .column-title { display:flex; align-items:center; gap:6px; margin:0 0 12px; font-size:12px; line-height:17px; }
        .column-title::before { content:""; width:4px; height:14px; border-radius:2px; background:var(--accent); }
        .loading,.error { display:flex; min-height:314px; align-items:center; justify-content:center; color:var(--muted); font-size:12px; text-align:center; }
        .error { flex-direction:column; gap:7px; color:#a64b36; }
        .error span { color:var(--muted); font-size:10px; line-height:16px; }
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
        .bar { min-height:2px; height:var(--height); border-radius:3px 3px 1px 1px; background:linear-gradient(180deg,#55e0ad,var(--accent)); opacity:.8; cursor:pointer; }
        .column[data-sport="cycling"] .bar { background:linear-gradient(180deg,#ff9a82,var(--accent)); }
        .bar.selected { opacity:1; box-shadow:0 0 0 1px var(--accent-dark); }
        .chart-detail { min-height:16px; margin-top:6px; color:var(--accent-dark); font-size:9px; font-weight:700; text-align:center; }
        .cumulative-title { margin:15px 0 10px; color:#5e6763; font-size:10px; }
        .metrics { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:13px 20px; }
        .metric span { display:block; color:#5e6763; font-size:10px; }
        .metric strong { display:block; margin-top:3px; font-family:"Arial Narrow","Roboto Condensed",Impact,sans-serif; font-size:20px; line-height:24px; font-weight:800; font-variant-numeric:tabular-nums; }
        .warning { margin:12px 0 0; padding:8px 10px; border-radius:8px; color:#754d0b; background:#fff2d6; font-size:10px; text-align:center; }
        @keyframes spin { to { transform:rotate(360deg); } }
        @media (max-width:820px) {
          .wrap { right:12px; bottom:12px; }
          .panel,.wrap.multi .panel { width:calc(100vw - 24px); max-width:none; }
          .wrap.multi .columns { grid-template-columns:repeat(2,minmax(340px,1fr)); overflow-x:auto; padding-bottom:5px; }
        }
        @media (prefers-reduced-motion:reduce) { * { animation-duration:.01ms!important; transition-duration:.01ms!important; } }
      </style>
      <div class="wrap">
        <section class="panel" hidden tabindex="-1" aria-label="Garmin 运动数据统计">
          <header class="head"><div class="brand"><img src="${chrome.runtime.getURL("icons/icon32.png")}" alt=""><div><strong>运动数据统计</strong><span>Garmin Connect China</span></div></div><div class="actions"><button class="icon refresh" type="button" title="刷新" aria-label="刷新"><svg viewBox="0 0 24 24"><path d="M21 12a9 9 0 0 0-15.1-6.6L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 15.1 6.6L21 16"/><path d="M16 16h5v5"/></svg></button><button class="icon close" type="button" title="关闭" aria-label="关闭"><svg viewBox="0 0 24 24"><path d="m6 6 12 12M18 6 6 18"/></svg></button></div></header>
          <div class="period-tabs period"><button data-period="week" aria-pressed="false">周</button><button data-period="month" aria-pressed="true">月</button></div>
          <div class="filters"><div class="sport" role="group" aria-label="运动类型"><button data-sport="running" aria-pressed="true">跑步</button><button data-sport="cycling" aria-pressed="false">骑行</button></div><span class="range"></span></div>
          <div class="columns" style="--column-count:1"><div class="column"><div class="loading">正在读取活动数据...</div></div></div>
        </section>
        <button class="launcher" type="button" aria-label="打开 Garmin 运动统计" aria-expanded="false"><img src="${chrome.runtime.getURL("icons/icon48.png")}" alt=""></button>
      </div>`;

    const wrap = root.querySelector(".wrap");
    const panel = root.querySelector(".panel");
    const launcher = root.querySelector(".launcher");
    const columns = root.querySelector(".columns");
    const refresh = root.querySelector(".refresh");
    const range = root.querySelector(".range");
    const number = (value, digits = 1) =>
      Number(value || 0).toLocaleString("zh-CN", {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      });
    const escapeHtml = (value) =>
      String(value).replace(
        /[&<>"']/g,
        (character) =>
          ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
            character
          ],
      );
    const duration = (seconds) => {
      const minutes = Math.round(Number(seconds || 0) / 60);
      return minutes >= 60
        ? `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`
        : `${minutes} 分`;
    };
    const shortDate = (value) => {
      const date = new Date(`${value}T00:00:00`);
      return `${String(date.getMonth() + 1).padStart(2, "0")}.${String(date.getDate()).padStart(2, "0")}`;
    };
    const summaryKey = (sport, period = state.period) => `${sport}:${period}`;

    function normalizeSports(preferences = {}) {
      const storedSports = Array.isArray(preferences.sports)
        ? preferences.sports.filter((sport) => sportOrder.includes(sport))
        : [];
      const sports = sportOrder.filter((sport) => storedSports.includes(sport));
      if (sports.length > 0) return sports;
      return sportOrder.includes(preferences.sport) ? [preferences.sport] : ["running"];
    }

    function syncControls() {
      wrap.classList.toggle("multi", state.sports.length > 1);
      columns.style.setProperty("--column-count", String(state.sports.length));
      root.querySelectorAll("[data-sport]").forEach((button) => {
        const isSelected = state.sports.includes(button.dataset.sport);
        button.setAttribute("aria-pressed", String(isSelected));
        button.disabled = isSelected && state.sports.length === 1;
      });
      root.querySelectorAll("[data-period]").forEach((button) => {
        button.setAttribute("aria-pressed", String(button.dataset.period === state.period));
      });
    }

    function selectedIndexFor(summary) {
      const storedIndex = state.selectedIndexes[summary.sport];
      if (Number.isInteger(storedIndex) && summary.daily[storedIndex]) return storedIndex;
      const todayIndex = summary.daily.findIndex(
        (day) => day.dateKey === summary.range.today && !day.isFuture,
      );
      if (todayIndex >= 0 && summary.daily[todayIndex].count > 0) return todayIndex;
      let latestActivityIndex = -1;
      for (let index = summary.daily.length - 1; index >= 0; index -= 1) {
        if (summary.daily[index].count > 0) {
          latestActivityIndex = index;
          break;
        }
      }
      return Math.max(0, latestActivityIndex >= 0 ? latestActivityIndex : todayIndex);
    }

    function createSummaryColumn(summary, warning = "") {
      const sport = summary.sport;
      const metric = state.chartMetrics[sport];
      const values = summary.daily.map((day) =>
        metric === "duration" ? day.durationSeconds : day.distanceKm,
      );
      const max = Math.max(0, ...values);
      const selectedIndex = selectedIndexFor(summary);
      state.selectedIndexes[sport] = selectedIndex;
      const bars = summary.daily
        .map(
          (day, index) =>
            `<div id="garmin-widget-day-${sport}-${day.dateKey}" class="bar${index === selectedIndex ? " selected" : ""}" role="option" aria-selected="${index === selectedIndex}" aria-label="${day.dateKey}，${metric === "duration" ? duration(day.durationSeconds) : `${number(day.distanceKm)} 公里`}，${day.count} 次活动" data-index="${index}" style="--height:${max ? Math.max(3, (values[index] / max) * 100) : 3}%"></div>`,
        )
        .join("");
      const column = document.createElement("article");
      column.className = "column";
      column.dataset.sport = sport;
      column.setAttribute("aria-label", `${sportLabels[sport]}统计`);
      column.innerHTML = `
        <h2 class="column-title">${sportLabels[sport]}统计</h2>
        <div class="summary"><div><div class="distance"><strong>${number(summary.totalDistanceKm)}</strong><span>公里</span></div><p class="meta">累计${sportLabels[sport]} · ${summary.activeDays} 个运动日</p></div><div class="mode" role="group" aria-label="${sportLabels[sport]}图表指标"><button data-metric="distance" aria-pressed="${metric === "distance"}">里程</button><button data-metric="duration" aria-pressed="${metric === "duration"}">时长</button></div></div>
        <div class="chart-head"><span>${metric === "duration" ? "每日运动时长" : `每日${sportLabels[sport]}里程`}</span><span>${metric === "duration" ? "单位：小时" : "单位：公里"}</span></div><div class="chart" role="listbox" tabindex="0" aria-label="${sportLabels[sport]}每日运动数据，使用左右方向键查看日期" aria-activedescendant="garmin-widget-day-${sport}-${summary.daily[selectedIndex]?.dateKey}" style="--days:${summary.daily.length}">${bars}</div><div class="chart-detail" aria-live="polite"></div>
        <p class="cumulative-title">累计数据</p><div class="metrics"><div class="metric"><span>累计里程（公里）</span><strong>${number(summary.totalDistanceKm)}</strong></div><div class="metric"><span>累计运动（次）</span><strong>${summary.count}</strong></div><div class="metric"><span>累计时长</span><strong>${duration(summary.totalDurationSeconds)}</strong></div><div class="metric"><span>累计爬升（米）</span><strong>${Math.round(summary.elevationGain)}</strong></div></div>
        <div class="warning" ${warning ? "" : "hidden"}>${escapeHtml(warning)}</div>`;
      return column;
    }

    function createErrorColumn(sport, error) {
      const column = document.createElement("article");
      column.className = "column";
      column.dataset.sport = sport;
      column.innerHTML = `<div class="error"><strong>${sportLabels[sport]}数据读取失败</strong><span>${escapeHtml(error?.message || "请稍后刷新重试")}</span></div>`;
      return column;
    }

    function updateChartDetail(sport, index) {
      const summary = state.summaries.get(summaryKey(sport));
      const column = columns.querySelector(`.column[data-sport="${sport}"]`);
      const day = summary?.daily[index];
      const chart = column?.querySelector(".chart");
      const detail = column?.querySelector(".chart-detail");
      if (!day || !chart || !detail) return;
      state.selectedIndexes[sport] = index;
      chart.setAttribute("aria-activedescendant", `garmin-widget-day-${sport}-${day.dateKey}`);
      chart.querySelectorAll(".bar").forEach((bar, barIndex) => {
        bar.classList.toggle("selected", barIndex === index);
        bar.setAttribute("aria-selected", String(barIndex === index));
      });
      detail.textContent = `${day.dateKey.slice(5).replace("-", "月")}日 · ${state.chartMetrics[sport] === "duration" ? duration(day.durationSeconds) : `${number(day.distanceKm)} km`} · ${day.count} 次`;
    }

    function renderEntries(entries) {
      columns.replaceChildren();
      for (const entry of entries) {
        const column = entry.summary
          ? createSummaryColumn(entry.summary, entry.warning)
          : createErrorColumn(entry.sport, entry.error);
        columns.append(column);
        if (entry.summary) updateChartDetail(entry.sport, state.selectedIndexes[entry.sport]);
      }
      const firstSummary = entries.find((entry) => entry.summary)?.summary;
      if (firstSummary) {
        range.textContent = `${state.period === "month" ? "本月" : "本周"} ${shortDate(firstSummary.range.startDate)}–${shortDate(firstSummary.range.endDate)}`;
      }
    }

    async function requestSport(sport, force) {
      try {
        const response = await chrome.runtime.sendMessage({
          type: "GARMIN_STATS_GET",
          payload: { sport, period: state.period, force },
        });
        return response?.ok
          ? {
              sport,
              summary: response.data.summary,
              warning: response.data?.warning || "",
            }
          : { sport, error: response?.error || { message: "读取 Garmin 数据失败" } };
      } catch (error) {
        return { sport, error: { message: error?.message || "读取 Garmin 数据失败" } };
      }
    }

    async function load(force = false) {
      const requestId = ++state.requestId;
      const requestedSports = [...state.sports];
      refresh.classList.add("spin");
      if (!force) {
        columns.replaceChildren();
        for (const sport of requestedSports) {
          const column = document.createElement("div");
          column.className = "column";
          column.dataset.sport = sport;
          column.innerHTML = '<div class="loading">正在读取活动数据...</div>';
          columns.append(column);
        }
      }
      try {
        const entries = await Promise.all(
          requestedSports.map((sport) => requestSport(sport, force)),
        );
        if (requestId !== state.requestId) return;
        const displayEntries = entries.map((entry) => {
          if (entry.summary) {
            state.summaries.set(summaryKey(entry.sport), entry.summary);
            return entry;
          }
          const cachedSummary = state.summaries.get(summaryKey(entry.sport));
          return force && cachedSummary
            ? {
                sport: entry.sport,
                summary: cachedSummary,
                warning: `${entry.error?.message || "刷新失败"}，当前数据未更新`,
              }
            : entry;
        });
        renderEntries(displayEntries);
      } finally {
        if (requestId === state.requestId) refresh.classList.remove("spin");
      }
    }

    async function savePreferences() {
      await chrome.storage.local.set({
        preferences: {
          sports: state.sports,
          sport: state.sports[0],
          period: state.period,
        },
      });
    }

    async function setFilter(next) {
      Object.assign(state, next);
      syncControls();
      await savePreferences();
      await load();
    }

    launcher.addEventListener("click", async () => {
      state.open = !state.open;
      panel.hidden = !state.open;
      launcher.setAttribute("aria-expanded", String(state.open));
      if (state.open) {
        refresh.focus();
        await load();
      }
    });
    root.querySelector(".close").addEventListener("click", () => {
      state.open = false;
      panel.hidden = true;
      launcher.setAttribute("aria-expanded", "false");
      launcher.focus();
    });
    refresh.addEventListener("click", () => load(true));
    root.querySelector(".sport").addEventListener("click", (event) => {
      const button = event.target.closest("button[data-sport]");
      if (!button) return;
      const sport = button.dataset.sport;
      const isSelected = state.sports.includes(sport);
      if (isSelected && state.sports.length === 1) return;
      const sports = isSelected
        ? state.sports.filter((selectedSport) => selectedSport !== sport)
        : sportOrder.filter((availableSport) =>
            [...state.sports, sport].includes(availableSport),
          );
      setFilter({ sports });
    });
    root.querySelector(".period").addEventListener("click", (event) => {
      const button = event.target.closest("button[data-period]");
      if (button && button.dataset.period !== state.period) {
        setFilter({ period: button.dataset.period });
      }
    });
    columns.addEventListener("click", (event) => {
      const column = event.target.closest(".column");
      const sport = column?.dataset.sport;
      if (!sport) return;
      const bar = event.target.closest(".bar[data-index]");
      if (bar) {
        updateChartDetail(sport, Number(bar.dataset.index));
        column.querySelector(".chart")?.focus();
        return;
      }
      const metricButton = event.target.closest("button[data-metric]");
      if (!metricButton || metricButton.dataset.metric === state.chartMetrics[sport]) return;
      state.chartMetrics[sport] = metricButton.dataset.metric;
      const summary = state.summaries.get(summaryKey(sport));
      if (!summary) return;
      const replacement = createSummaryColumn(summary);
      column.replaceWith(replacement);
      updateChartDetail(sport, state.selectedIndexes[sport]);
    });
    columns.addEventListener("keydown", (event) => {
      if (!event.target.classList.contains("chart") || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const sport = event.target.closest(".column")?.dataset.sport;
      const summary = sport ? state.summaries.get(summaryKey(sport)) : null;
      if (!sport || !summary) return;
      const last = summary.daily.length - 1;
      const current = state.selectedIndexes[sport];
      if (event.key === "ArrowLeft") updateChartDetail(sport, Math.max(0, current - 1));
      if (event.key === "ArrowRight") updateChartDetail(sport, Math.min(last, current + 1));
      if (event.key === "Home") updateChartDetail(sport, 0);
      if (event.key === "End") updateChartDetail(sport, last);
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
      state.sports = normalizeSports(preferences);
      if (["month", "week"].includes(preferences.period)) state.period = preferences.period;
      syncControls();
    });
  }

  function syncRoute() {
    const onActivities =
      location.origin === "https://connect.garmin.cn" && location.pathname === "/app/activities";
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
