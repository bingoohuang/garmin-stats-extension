import { getPeriodRange } from "./lib/dates.js";
import { fetchGarminActivities, GarminApiError } from "./lib/garmin-api.js";
import { fetchGarminActivitiesViaTab } from "./lib/garmin-tab.js";
import { normalizeActivities, SPORTS, summarizeActivities } from "./lib/stats.js";

async function loadActivities(query) {
  try {
    return {
      activities: await fetchGarminActivities(query),
      source: "extension",
    };
  } catch (error) {
    if (!(error instanceof GarminApiError) || error.code !== "AUTH_REQUIRED") {
      throw error;
    }
    return {
      activities: await fetchGarminActivitiesViaTab(query),
      source: "garmin-tab",
    };
  }
}

async function getStats({ sport, period }) {
  if (!SPORTS[sport] || !["month", "week"].includes(period)) {
    throw new Error("不支持的统计视图");
  }

  const now = new Date();
  const range = getPeriodRange(period, now);
  const result = await loadActivities({
    sport: SPORTS[sport].apiType,
    startDate: range.startDate,
    endDate: range.queryEndDate,
  });
  const activities = normalizeActivities(result.activities, sport);
  return {
    summary: summarizeActivities(activities, sport, period, now),
    fetchedAt: Date.now(),
    source: result.source,
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
          code: error instanceof GarminApiError ? error.code : "FETCH_FAILED",
          message: error?.message || "读取 Garmin 数据失败",
        },
      }),
    );
  return true;
});
