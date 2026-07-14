import {
  formatDistance,
  formatDuration,
  formatPace,
  formatSpeed,
  SPORTS,
} from "./lib/stats.js";

const state = {
  sport: "running",
  period: "month",
  chartMetric: "distance",
  requestId: 0,
  renderedView: null,
};

const elements = {
  body: document.body,
  appShell: document.querySelector(".app-shell"),
  sportControl: document.querySelector("#sportControl"),
  periodControl: document.querySelector("#periodControl"),
  chartMode: document.querySelector("#chartMode"),
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
  totalDistance: document.querySelector("#totalDistance"),
  distanceMetric: document.querySelector("#distanceMetric"),
  countMetric: document.querySelector("#countMetric"),
  activityMeta: document.querySelector("#activityMeta"),
  durationMetric: document.querySelector("#durationMetric"),
  paceMetricLabel: document.querySelector("#paceMetricLabel"),
  paceMetric: document.querySelector("#paceMetric"),
  paceMetricUnit: document.querySelector("#paceMetricUnit"),
  elevationMetric: document.querySelector("#elevationMetric"),
  averageDistanceMetric: document.querySelector("#averageDistanceMetric"),
  averageDurationMetric: document.querySelector("#averageDurationMetric"),
  chartTitle: document.querySelector("#chartTitle"),
  chartSubtitle: document.querySelector("#chartSubtitle"),
  peakLegend: document.querySelector("#peakLegend"),
  barChart: document.querySelector("#barChart"),
  chartDetail: document.querySelector("#chartDetail"),
  emptyMessage: document.querySelector("#emptyMessage"),
  warningBanner: document.querySelector("#warningBanner"),
};

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
  elements.body.dataset.sport = state.sport;
  elements.sportControl.querySelectorAll("button").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.sport === state.sport));
  });
  elements.periodControl.querySelectorAll("button").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.period === state.period));
  });
}

function formatPeriodTitle(summary) {
  const start = new Date(`${summary.range.startDate}T00:00:00`);
  const end = new Date(`${summary.range.endDate}T00:00:00`);
  const prefix = summary.period === "month" ? "本月" : "本周";
  const short = (date) => `${String(date.getMonth() + 1).padStart(2, "0")}.${String(date.getDate()).padStart(2, "0")}`;
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

function shouldShowDayLabel(index, day, period, dayCount) {
  if (period === "week") {
    return true;
  }
  const dayOfMonth = Number(day.dateKey.slice(-2));
  return dayOfMonth === 1 || dayOfMonth === dayCount || dayOfMonth % 5 === 0;
}

function setChartDetail(day) {
  const countText = day.isFuture ? "尚未开始" : day.count > 0 ? `${day.count} 次` : "无活动";
  const value = state.chartMetric === "duration"
    ? formatDuration(day.durationSeconds)
    : `${formatDistance(day.distanceKm)} km`;
  elements.chartDetail.textContent = `${formatFullDay(day.dateKey)} · ${value} · ${countText}`;
}

function renderChart(summary) {
  const values = summary.daily.map((day) =>
    state.chartMetric === "duration" ? day.durationSeconds : day.distanceKm,
  );
  const maxValue = Math.max(0, ...values);
  const dayCount = summary.daily.length;
  elements.barChart.replaceChildren();
  elements.barChart.style.setProperty("--day-count", String(dayCount));
  elements.barChart.style.setProperty("--chart-gap", summary.period === "week" ? "8px" : "3px");
  elements.peakLegend.hidden = false;
  elements.peakLegend.textContent = state.chartMetric === "duration" ? "单位：小时" : "单位：公里";
  elements.chartTitle.textContent = state.chartMetric === "duration" ? "每日运动时长" : state.sport === "running" ? "每日跑量" : "每日骑行距离";

  const todayDay = summary.daily.find((day) => day.dateKey === summary.range.today && !day.isFuture);
  let selectedDay = todayDay;
  if (!selectedDay || selectedDay.count === 0) {
    selectedDay = [...summary.daily].reverse().find((day) => day.count > 0) ?? todayDay ?? summary.daily[0];
  }

  const selectDay = (index, shouldFocus = false) => {
    const day = summary.daily[index];
    const item = elements.barChart.children[index];
    if (!day || !item) {
      return;
    }
    elements.barChart.querySelectorAll(".is-selected").forEach((element) => {
      element.classList.remove("is-selected");
      element.setAttribute("aria-selected", "false");
    });
    item.classList.add("is-selected");
    item.setAttribute("aria-selected", "true");
    elements.barChart.setAttribute("aria-activedescendant", item.id);
    elements.barChart.dataset.selectedIndex = String(index);
    setChartDetail(day);
    if (shouldFocus) {
      elements.barChart.focus();
    }
  };

  summary.daily.forEach((day, index) => {
    const item = document.createElement("div");
    item.id = `chart-day-${day.dateKey}`;
    item.className = "bar-day";
    item.setAttribute("role", "option");
    item.setAttribute("aria-selected", "false");
    item.dataset.label = formatDayLabel(day.dateKey, summary.period);
    item.dataset.showLabel = String(shouldShowDayLabel(index, day, summary.period, dayCount));
    item.classList.toggle("is-zero", day.count === 0);
    item.classList.toggle("is-future", day.isFuture);
    item.classList.toggle(
      "is-peak",
      maxValue > 0 && Math.abs(values[index] - maxValue) < 0.0001,
    );
    item.setAttribute(
      "aria-label",
      `${formatFullDay(day.dateKey)}，${state.chartMetric === "duration" ? formatDuration(day.durationSeconds) : `${formatDistance(day.distanceKm)} 公里`}，${day.count} 次活动`,
    );
    item.title = `${formatFullDay(day.dateKey)} · ${formatDistance(day.distanceKm)} km · ${day.count} 次`;

    const rect = document.createElement("span");
    rect.className = "bar-rect";
    const percentage = maxValue > 0 ? (values[index] / maxValue) * 100 : 0;
    rect.style.setProperty("--bar-height", `${Math.max(day.count > 0 ? 6 : 2, percentage)}%`);
    item.append(rect);
    item.addEventListener("mouseenter", () => setChartDetail(day));
    item.addEventListener("mouseleave", () => {
      const selectedIndex = Number(elements.barChart.dataset.selectedIndex);
      setChartDetail(summary.daily[selectedIndex] ?? day);
    });
    item.addEventListener("click", () => selectDay(index, true));
    elements.barChart.append(item);
  });

  if (selectedDay) {
    selectDay(summary.daily.indexOf(selectedDay));
  }
}

elements.barChart.addEventListener("keydown", (event) => {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
    return;
  }
  event.preventDefault();
  const lastIndex = elements.barChart.children.length - 1;
  const currentIndex = Number(elements.barChart.dataset.selectedIndex || 0);
  let nextIndex = currentIndex;
  if (event.key === "ArrowLeft") nextIndex = Math.max(0, currentIndex - 1);
  if (event.key === "ArrowRight") nextIndex = Math.min(lastIndex, currentIndex + 1);
  if (event.key === "Home") nextIndex = 0;
  if (event.key === "End") nextIndex = lastIndex;
  elements.barChart.children[nextIndex]?.click();
});

function renderData(result) {
  const { summary } = result;
  elements.periodTitle.textContent = formatPeriodTitle(summary);
  elements.totalDistance.textContent = formatDistance(summary.totalDistanceKm);
  elements.activityMeta.textContent = `累计${SPORTS[summary.sport].label} · ${summary.activeDays} 个运动日`;
  elements.distanceMetric.textContent = formatDistance(summary.totalDistanceKm);
  elements.countMetric.textContent = String(summary.count);
  elements.durationMetric.textContent = formatDuration(summary.totalDurationSeconds);
  elements.elevationMetric.textContent = Math.round(summary.elevationGain).toLocaleString("zh-CN");
  elements.averageDistanceMetric.textContent = formatDistance(
    summary.count > 0 ? summary.totalDistanceKm / summary.count : 0,
  );
  elements.averageDurationMetric.textContent = formatDuration(
    summary.count > 0 ? summary.totalDurationSeconds / summary.count : 0,
  );

  const isRunning = summary.sport === "running";
  elements.paceMetricLabel.textContent = isRunning ? "平均配速" : "平均速度";
  elements.paceMetric.textContent = isRunning
    ? formatPace(summary.averagePaceSecondsPerKm)
    : formatSpeed(summary.averageSpeedKmh);
  elements.paceMetricUnit.textContent = isRunning ? "/km" : "km/h";
  const periodText = summary.period === "month" ? "按自然月统计" : "周一至周日";
  const updateTime = new Date(result.fetchedAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
  elements.chartSubtitle.textContent = `${periodText} · 更新于 ${updateTime}`;
  elements.emptyMessage.hidden = summary.count !== 0;
  elements.emptyMessage.textContent = `本${summary.period === "month" ? "月" : "周"}暂无${SPORTS[summary.sport].label}记录`;
  elements.connectionStatus.textContent =
    result.source === "garmin-tab"
      ? "Garmin Connect China · 活动页已连接"
      : "Garmin Connect China · 已连接";
  elements.warningBanner.hidden = true;
  elements.warningBanner.textContent = "";

  renderChart(summary);
  state.renderedView = `${summary.sport}:${summary.period}`;
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

async function requestStats(force = false) {
  const requestId = ++state.requestId;
  setBusy(true);
  if (!force) {
    setView("loading");
  }

  try {
    const response = await chrome.runtime.sendMessage({
      type: "GARMIN_STATS_GET",
      payload: {
        sport: state.sport,
        period: state.period,
        force,
      },
    });
    if (requestId !== state.requestId) {
      return;
    }
    if (!response?.ok) {
      const canKeepCurrent =
        force &&
        response?.error?.code !== "AUTH_REQUIRED" &&
        state.renderedView === `${state.sport}:${state.period}`;
      if (canKeepCurrent) {
        elements.warningBanner.textContent = `${response?.error?.message || "刷新失败"}，当前数据未更新`;
        elements.warningBanner.hidden = false;
        elements.connectionStatus.textContent = "Garmin Connect China · 刷新失败";
        setView("data");
      } else {
        renderError(response?.error);
      }
      return;
    }
    renderData(response.data);
  } catch (error) {
    if (requestId === state.requestId) {
      const canKeepCurrent =
        force && state.renderedView === `${state.sport}:${state.period}`;
      if (canKeepCurrent) {
        elements.warningBanner.textContent = `${error?.message || "扩展后台服务未响应"}，当前数据未更新`;
        elements.warningBanner.hidden = false;
        elements.connectionStatus.textContent = "Garmin Connect China · 刷新失败";
        setView("data");
      } else {
        renderError({ message: error?.message || "扩展后台服务未响应" });
      }
    }
  } finally {
    if (requestId === state.requestId) {
      setBusy(false);
    }
  }
}

async function savePreferences() {
  await chrome.storage.local.set({
    preferences: {
      sport: state.sport,
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
  if (button && button.dataset.sport !== state.sport) {
    selectView({ sport: button.dataset.sport });
  }
});

elements.periodControl.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-period]");
  if (button && button.dataset.period !== state.period) {
    selectView({ period: button.dataset.period });
  }
});

elements.chartMode.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-metric]");
  if (!button || button.dataset.metric === state.chartMetric) return;
  state.chartMetric = button.dataset.metric;
  elements.chartMode.querySelectorAll("button").forEach((item) => {
    item.setAttribute("aria-pressed", String(item === button));
  });
  requestStats(false);
});

elements.refreshButton.addEventListener("click", () => requestStats(true));
elements.retryButton.addEventListener("click", () => requestStats(true));

async function init() {
  const stored = await chrome.storage.local.get("preferences");
  const preferences = stored.preferences ?? {};
  if (SPORTS[preferences.sport]) {
    state.sport = preferences.sport;
  }
  if (["month", "week"].includes(preferences.period)) {
    state.period = preferences.period;
  }
  syncControls();
  await requestStats(false);
}

init();
