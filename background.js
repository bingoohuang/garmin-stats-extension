import { getPeriodRange } from "./lib/dates.js";
import { fetchGarminActivitiesViaTabWithMetadata } from "./lib/garmin-tab.js";
import { normalizeActivities, SPORTS, summarizeActivities } from "./lib/stats.js";

async function loadActivities(query) {
  const tabResult = await fetchGarminActivitiesViaTabWithMetadata(query);
  return {
    activities: tabResult.activities,
    source: tabResult.source,
    sourceDetail: tabResult.sourceDetail,
    warning: tabResult.warning,
  };
}

async function getStats({ sport, period }) {
  if (!SPORTS[sport] || !["month", "week"].includes(period)) {
    throw new Error("不支持的统计视图");
  }

  const now = new Date();
  const range = getPeriodRange(period, now);
  const result = await loadActivities({
    startDate: range.startDate,
    endDate: range.queryEndDate,
  });
  const activities = normalizeActivities(result.activities, sport);
  return {
    summary: summarizeActivities(activities, sport, period, now),
    fetchedAt: Date.now(),
    source: result.source,
    sourceDetail: result.sourceDetail,
    warning: result.warning,
  };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "GARMIN_STATS_GET") {
    return false;
  }

  getStats(message.payload ?? {})
    .then((data) => sendResponse({ ok: true, data }))
    .catch((error) =>
      sendResponse({
        ok: false,
        error: {
          code: error?.code || "FETCH_FAILED",
          message: error?.message || "读取 Garmin 数据失败",
        },
      }),
    );
  return true;
});
