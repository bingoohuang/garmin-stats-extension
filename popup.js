import {
  formatDistance,
  formatDuration,
  formatPace,
  formatSpeed,
  SPORTS,
} from "./lib/stats.js";

const SPORT_ORDER = Object.keys(SPORTS);
const state = {
  sports: ["running"],
  period: "month",
  chartMetrics: Object.fromEntries(SPORT_ORDER.map((sport) => [sport, "distance"])),
  requestId: 0,
  results: new Map(),
};

const elements = {
  body: document.body,
  appShell: document.querySelector(".app-shell"),
  sportControl: document.querySelector("#sportControl"),
  periodControl: document.querySelector("#periodControl"),
  refreshButton: document.querySelector("#refreshButton"),
  retryButton: document.querySelector("#retryButton"),
  loginButton: document.querySelector("#loginButton"),
  connectionStatus: document.querySelector("#connectionStatus"),
  loadingView: document.querySelector("#loadingView"),
  errorView: document.querySelector("#errorView"),
  dataView: document.querySelector("#dataView"),
  errorTitle: document.querySelector("#errorTitle"),
  errorMessage: document.querySelector("#errorMessage"),
  periodTitle: document.querySelector("#periodTitle"),
  statsGrid: document.querySelector("#statsGrid"),
};

function normalizeSports(preferences = {}) {
  const storedSports = Array.isArray(preferences.sports)
    ? preferences.sports.filter((sport) => SPORTS[sport])
    : [];
  const uniqueSports = SPORT_ORDER.filter((sport) => storedSports.includes(sport));
  if (uniqueSports.length > 0) {
    return uniqueSports;
  }
  return SPORTS[preferences.sport] ? [preferences.sport] : ["running"];
}

function resultKey(sport, period = state.period) {
  return `${sport}:${period}`;
}

function setView(view) {
  elements.loadingView.hidden = view !== "loading";
  elements.errorView.hidden = view !== "error";
  elements.dataView.hidden = view !== "data";
}

function setBusy(isBusy) {
  elements.refreshButton.disabled = isBusy;
  elements.refreshButton.classList.toggle("is-spinning", isBusy);
  elements.appShell.setAttribute("aria-busy", String(isBusy));
}

function syncControls() {
  const columnCount = String(state.sports.length);
  elements.body.dataset.columnCount = columnCount;
  document.documentElement.dataset.columnCount = columnCount;
  elements.statsGrid.style.setProperty("--column-count", columnCount);
  elements.loadingView.style.setProperty("--column-count", columnCount);
  elements.sportControl.querySelectorAll("button").forEach((button) => {
    const isSelected = state.sports.includes(button.dataset.sport);
    button.setAttribute("aria-pressed", String(isSelected));
    button.disabled = isSelected && state.sports.length === 1;
  });
  elements.periodControl.querySelectorAll("button").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.period === state.period));
  });
}

function renderLoading() {
  elements.loadingView.replaceChildren();
  for (const sport of state.sports) {
    const card = document.createElement("div");
    card.className = "loading-card";
    card.dataset.sport = sport;
    card.innerHTML = '<div class="skeleton skeleton-total"></div><div class="skeleton skeleton-chart"></div><div class="skeleton skeleton-metrics"></div>';
    elements.loadingView.append(card);
  }
}

function formatPeriodTitle(summary) {
  const start = new Date(`${summary.range.startDate}T00:00:00`);
  const end = new Date(`${summary.range.endDate}T00:00:00`);
  const prefix = summary.period === "month" ? "本月" : "本周";
  const short = (date) =>
    `${String(date.getMonth() + 1).padStart(2, "0")}.${String(date.getDate()).padStart(2, "0")}`;
  return `${prefix} ${short(start)}–${short(end)}`;
}

function formatDayLabel(dateKey, period) {
  const date = new Date(`${dateKey}T00:00:00`);
  if (period === "week") {
    return ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][date.getDay()];
  }
  return String(date.getDate());
}

function formatFullDay(dateKey) {
  const date = new Date(`${dateKey}T00:00:00`);
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

function shouldShowDayLabel(day, period, dayCount) {
  if (period === "week") {
    return true;
  }
  const dayOfMonth = Number(day.dateKey.slice(-2));
  return dayOfMonth === 1 || dayOfMonth === dayCount || dayOfMonth % 5 === 0;
}

function setChartDetail(column, day, metric) {
  const countText = day.isFuture ? "尚未开始" : day.count > 0 ? `${day.count} 次` : "无活动";
  const value = metric === "duration"
    ? formatDuration(day.durationSeconds)
    : `${formatDistance(day.distanceKm)} km`;
  column.querySelector("[data-role='chart-detail']").textContent =
    `${formatFullDay(day.dateKey)} · ${value} · ${countText}`;
}

function renderChart(column, summary) {
  const metric = state.chartMetrics[summary.sport];
  const chart = column.querySelector("[data-role='bar-chart']");
  const values = summary.daily.map((day) =>
    metric === "duration" ? day.durationSeconds : day.distanceKm,
  );
  const maxValue = Math.max(0, ...values);
  const dayCount = summary.daily.length;
  chart.replaceChildren();
  chart.style.setProperty("--day-count", String(dayCount));
  chart.style.setProperty("--chart-gap", summary.period === "week" ? "8px" : "3px");
  column.querySelector("[data-role='unit-label']").textContent =
    metric === "duration" ? "单位：小时" : "单位：公里";
  column.querySelector("[data-role='chart-title']").textContent =
    metric === "duration"
      ? "每日运动时长"
      : summary.sport === "running"
        ? "每日跑量"
        : "每日骑行距离";
  column.querySelectorAll("[data-metric]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.metric === metric));
  });

  const todayDay = summary.daily.find(
    (day) => day.dateKey === summary.range.today && !day.isFuture,
  );
  const selectedDay =
    (todayDay?.count > 0 ? todayDay : null) ??
    [...summary.daily].reverse().find((day) => day.count > 0) ??
    todayDay ??
    summary.daily[0];

  const selectDay = (index, shouldFocus = false) => {
    const day = summary.daily[index];
    const item = chart.children[index];
    if (!day || !item) {
      return;
    }
    chart.querySelectorAll(".is-selected").forEach((element) => {
      element.classList.remove("is-selected");
      element.setAttribute("aria-selected", "false");
    });
    item.classList.add("is-selected");
    item.setAttribute("aria-selected", "true");
    chart.setAttribute("aria-activedescendant", item.id);
    chart.dataset.selectedIndex = String(index);
    setChartDetail(column, day, metric);
    if (shouldFocus) {
      chart.focus();
    }
  };

  summary.daily.forEach((day, index) => {
    const item = document.createElement("div");
    item.id = `chart-day-${summary.sport}-${day.dateKey}`;
    item.className = "bar-day";
    item.setAttribute("role", "option");
    item.setAttribute("aria-selected", "false");
    item.dataset.label = formatDayLabel(day.dateKey, summary.period);
    item.dataset.showLabel = String(shouldShowDayLabel(day, summary.period, dayCount));
    item.classList.toggle("is-zero", day.count === 0);
    item.classList.toggle("is-future", day.isFuture);
    item.classList.toggle(
      "is-peak",
      maxValue > 0 && Math.abs(values[index] - maxValue) < 0.0001,
    );
    item.setAttribute(
      "aria-label",
      `${formatFullDay(day.dateKey)}，${metric === "duration" ? formatDuration(day.durationSeconds) : `${formatDistance(day.distanceKm)} 公里`}，${day.count} 次活动`,
    );
    item.title = `${formatFullDay(day.dateKey)} · ${formatDistance(day.distanceKm)} km · ${day.count} 次`;

    const rect = document.createElement("span");
    rect.className = "bar-rect";
    const percentage = maxValue > 0 ? (values[index] / maxValue) * 100 : 0;
    rect.style.setProperty("--bar-height", `${Math.max(day.count > 0 ? 6 : 2, percentage)}%`);
    item.append(rect);
    item.addEventListener("mouseenter", () => setChartDetail(column, day, metric));
    item.addEventListener("mouseleave", () => {
      const selectedIndex = Number(chart.dataset.selectedIndex);
      setChartDetail(column, summary.daily[selectedIndex] ?? day, metric);
    });
    item.addEventListener("click", () => selectDay(index, true));
    chart.append(item);
  });

  if (selectedDay) {
    selectDay(summary.daily.indexOf(selectedDay));
  }
}

function createSportColumn(result, warning = "") {
  const { summary } = result;
  const isRunning = summary.sport === "running";
  const averageDistance = summary.count > 0 ? summary.totalDistanceKm / summary.count : 0;
  const averageDuration = summary.count > 0 ? summary.totalDurationSeconds / summary.count : 0;
  const periodText = summary.period === "month" ? "按自然月统计" : "周一至周日";
  const updateTime = new Date(result.fetchedAt).toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const column = document.createElement("article");
  column.className = "sport-column";
  column.dataset.sport = summary.sport;
  column.setAttribute("aria-label", `${SPORTS[summary.sport].label}统计`);
  column.innerHTML = `
    <section class="stats-card">
      <div class="sport-column-heading"><span></span><h2>${SPORTS[summary.sport].label}统计</h2></div>
      <div class="summary-row">
        <div class="summary">
          <div class="distance-line"><strong>${formatDistance(summary.totalDistanceKm)}</strong><span>公里</span></div>
          <p class="summary-meta">累计${SPORTS[summary.sport].label} · ${summary.activeDays} 个运动日</p>
        </div>
        <div class="chart-mode" role="group" aria-label="${SPORTS[summary.sport].label}图表指标">
          <button type="button" data-metric="distance">里程</button>
          <button type="button" data-metric="duration">时长</button>
        </div>
      </div>
      <div class="chart-heading"><div><h2 data-role="chart-title"></h2><p>${periodText} · 更新于 ${updateTime}</p></div><span data-role="unit-label" class="unit-label"></span></div>
      <div data-role="bar-chart" class="bar-chart" role="listbox" aria-orientation="horizontal" tabindex="0" aria-label="${SPORTS[summary.sport].label}每日运动数据图，使用左右方向键查看日期"></div>
      <div data-role="chart-detail" class="chart-detail" aria-live="polite"></div>
      <p class="comparison-title">累计数据</p>
      <section class="cumulative-grid" aria-label="${SPORTS[summary.sport].label}累计指标">
        <div class="cumulative"><span>累计里程（公里）</span><strong>${formatDistance(summary.totalDistanceKm)}</strong></div>
        <div class="cumulative"><span>累计运动（次）</span><strong>${summary.count}</strong></div>
        <div class="cumulative"><span>累计时长</span><strong>${formatDuration(summary.totalDurationSeconds)}</strong></div>
        <div class="cumulative"><span>累计爬升（米）</span><strong>${Math.round(summary.elevationGain).toLocaleString("zh-CN")}</strong></div>
      </section>
    </section>
    <h2 class="section-title"><span></span>运动表现</h2>
    <section class="performance-card" aria-label="${SPORTS[summary.sport].label}周期表现">
      <div class="performance-tabs"><span>${isRunning ? "平均配速" : "平均速度"}</span><span>平均距离</span><span>平均时长</span></div>
      <div class="performance-values">
        <div><small>本期平均</small><strong>${isRunning ? formatPace(summary.averagePaceSecondsPerKm) : formatSpeed(summary.averageSpeedKmh)}</strong><span>${isRunning ? "/km" : "km/h"}</span></div>
        <div><small>单次平均</small><strong>${formatDistance(averageDistance)}</strong><span>km</span></div>
        <div><small>单次平均</small><strong>${formatDuration(averageDuration)}</strong></div>
      </div>
    </section>
    <p class="empty-message" ${summary.count === 0 ? "" : "hidden"}>本${summary.period === "month" ? "月" : "周"}暂无${SPORTS[summary.sport].label}记录</p>
    <div class="warning-banner" role="status" ${warning ? "" : "hidden"}></div>`;
  column.querySelector(".warning-banner").textContent = warning;
  renderChart(column, summary);
  return column;
}

function createErrorColumn(sport, error) {
  const column = document.createElement("article");
  column.className = "sport-column";
  column.dataset.sport = sport;
  const errorView = document.createElement("section");
  errorView.className = "column-error";
  const title = document.createElement("h2");
  title.textContent = `${SPORTS[sport].label}数据读取失败`;
  const message = document.createElement("p");
  message.textContent = error?.message || "请稍后刷新重试。";
  errorView.append(title, message);
  column.append(errorView);
  return column;
}

function renderResults(entries) {
  elements.statsGrid.replaceChildren();
  elements.statsGrid.style.setProperty("--column-count", String(state.sports.length));
  for (const entry of entries) {
    elements.statsGrid.append(
      entry.result
        ? createSportColumn(entry.result, entry.warning)
        : createErrorColumn(entry.sport, entry.error),
    );
  }

  const firstResult = entries.find((entry) => entry.result)?.result;
  if (firstResult) {
    elements.periodTitle.textContent = formatPeriodTitle(firstResult.summary);
  }
  const connectedViaTab = entries.some((entry) => entry.result?.source === "garmin-tab");
  elements.connectionStatus.textContent = connectedViaTab
    ? "Garmin Connect China · 活动页已连接"
    : "Garmin Connect China · 已连接";
  setView("data");
}

function renderError(error) {
  const isAuth = error?.code === "AUTH_REQUIRED";
  const needsTab = [
    "GARMIN_TAB_REQUIRED",
    "GARMIN_TAB_NOT_READY",
    "TAB_ACCESS_FAILED",
    "TAB_FETCH_FAILED",
    "TAB_ORIGIN_MISMATCH",
  ].includes(error?.code);
  elements.errorTitle.textContent = isAuth
    ? "请先登录 Garmin Connect"
    : needsTab
      ? "请打开 Garmin 活动页"
      : "暂时无法读取数据";
  elements.errorMessage.textContent = isAuth
    ? "登录 Garmin Connect China 后返回此处重试。"
    : error?.message || "请检查网络后重试。";
  elements.loginButton.hidden = !(isAuth || needsTab);
  elements.connectionStatus.textContent = isAuth
    ? "Garmin Connect China · 未登录"
    : needsTab
      ? "Garmin Connect China · 等待活动页"
      : "Garmin Connect China · 连接失败";
  setView("error");
  elements.errorView.focus();
}

async function requestSport(sport, force) {
  try {
    const response = await chrome.runtime.sendMessage({
      type: "GARMIN_STATS_GET",
      payload: { sport, period: state.period, force },
    });
    return response?.ok
      ? { sport, result: response.data }
      : { sport, error: response?.error || { message: "读取 Garmin 数据失败" } };
  } catch (error) {
    return { sport, error: { message: error?.message || "扩展后台服务未响应" } };
  }
}

async function requestStats(force = false) {
  const requestId = ++state.requestId;
  const requestedSports = [...state.sports];
  setBusy(true);
  if (!force) {
    renderLoading();
    setView("loading");
  }

  try {
    const entries = await Promise.all(
      requestedSports.map((sport) => requestSport(sport, force)),
    );
    if (requestId !== state.requestId) {
      return;
    }

    const displayEntries = entries.map((entry) => {
      if (entry.result) {
        state.results.set(resultKey(entry.sport), entry.result);
        return entry;
      }
      const cachedResult = state.results.get(resultKey(entry.sport));
      const canKeepCurrent =
        force && cachedResult && entry.error?.code !== "AUTH_REQUIRED";
      return canKeepCurrent
        ? {
            sport: entry.sport,
            result: cachedResult,
            warning: `${entry.error?.message || "刷新失败"}，当前数据未更新`,
          }
        : entry;
    });

    if (displayEntries.every((entry) => !entry.result)) {
      renderError(displayEntries[0]?.error);
      return;
    }
    renderResults(displayEntries);
  } finally {
    if (requestId === state.requestId) {
      setBusy(false);
    }
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

async function selectView(nextState) {
  Object.assign(state, nextState);
  syncControls();
  await savePreferences();
  await requestStats(false);
}

elements.sportControl.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-sport]");
  if (!button) {
    return;
  }
  const sport = button.dataset.sport;
  const isSelected = state.sports.includes(sport);
  if (isSelected && state.sports.length === 1) {
    return;
  }
  const sports = isSelected
    ? state.sports.filter((selectedSport) => selectedSport !== sport)
    : SPORT_ORDER.filter((availableSport) =>
        [...state.sports, sport].includes(availableSport),
      );
  selectView({ sports });
});

elements.periodControl.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-period]");
  if (button && button.dataset.period !== state.period) {
    selectView({ period: button.dataset.period });
  }
});

elements.statsGrid.addEventListener("click", (event) => {
  const metricButton = event.target.closest("button[data-metric]");
  if (!metricButton) {
    return;
  }
  const column = metricButton.closest(".sport-column");
  const sport = column?.dataset.sport;
  if (!sport || metricButton.dataset.metric === state.chartMetrics[sport]) {
    return;
  }
  state.chartMetrics[sport] = metricButton.dataset.metric;
  const result = state.results.get(resultKey(sport));
  if (result) {
    renderChart(column, result.summary);
  }
});

elements.statsGrid.addEventListener("keydown", (event) => {
  const chart = event.target.closest(".bar-chart");
  if (!chart || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
    return;
  }
  event.preventDefault();
  const lastIndex = chart.children.length - 1;
  const currentIndex = Number(chart.dataset.selectedIndex || 0);
  let nextIndex = currentIndex;
  if (event.key === "ArrowLeft") nextIndex = Math.max(0, currentIndex - 1);
  if (event.key === "ArrowRight") nextIndex = Math.min(lastIndex, currentIndex + 1);
  if (event.key === "Home") nextIndex = 0;
  if (event.key === "End") nextIndex = lastIndex;
  chart.children[nextIndex]?.click();
});

elements.refreshButton.addEventListener("click", () => requestStats(true));
elements.retryButton.addEventListener("click", () => requestStats(true));

async function init() {
  const stored = await chrome.storage.local.get("preferences");
  const preferences = stored.preferences ?? {};
  state.sports = normalizeSports(preferences);
  if (["month", "week"].includes(preferences.period)) {
    state.period = preferences.period;
  }
  syncControls();
  await requestStats(false);
}

init();
