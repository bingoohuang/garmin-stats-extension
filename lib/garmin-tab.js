export class GarminTabError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "GarminTabError";
    this.code = code;
  }
}

export function readActivityRowsInGarminTab() {
  const rows = Array.from(
    document.querySelectorAll('[class*="ActivityListItem_listItem"]'),
  );

  const activities = rows
    .map((row) => {
      const textByClass = (fragment) =>
        row.querySelector(`[class*="${fragment}"]`)?.textContent?.trim() ?? "";
      const dateText = textByClass("ActivityListItem_activityDate__");
      const yearText = textByClass("ActivityListItem_activityDateYear__");
      const typeText = textByClass("ActivityListItem_activityTypeButton__");
      const activityLink = row.querySelector('a[href^="/app/activity/"]');
      const dateMatch = /^(\d{1,2})月\s*(\d{1,2})日$/.exec(dateText);
      if (!dateMatch || !/^\d{4}$/.test(yearText) || !activityLink) {
        return null;
      }

      const metrics = {};
      row.querySelectorAll('[class*="ActivityListItem_metricItem__"]').forEach((item) => {
        const label = item
          .querySelector('[class*="ActivityListItem_metricLabel__"]')
          ?.textContent?.trim();
        const value = item
          .querySelector('[class*="ActivityListItem_metricValue__"]')
          ?.textContent?.trim();
        if (label && value) {
          metrics[label] = value;
        }
      });

      const durationParts = String(metrics["时间"] || "")
        .split(":")
        .map(Number);
      const duration = durationParts.every(Number.isFinite)
        ? durationParts.reduce((total, part) => total * 60 + part, 0)
        : 0;
      const distanceKm = Number.parseFloat(
        String(metrics["距离"] || "0").replaceAll(",", ""),
      );
      const elevationGain = Number.parseFloat(
        String(metrics["累计爬升"] || "0").replaceAll(",", ""),
      );
      const month = dateMatch[1].padStart(2, "0");
      const day = dateMatch[2].padStart(2, "0");

      return {
        activityId: activityLink.getAttribute("href")?.split("/").pop(),
        activityType: { typeName: typeText },
        startTimeLocal: `${yearText}-${month}-${day} 00:00:00`,
        distance: Number.isFinite(distanceKm) ? distanceKm * 1000 : 0,
        duration,
        movingDuration: duration,
        elevationGain: Number.isFinite(elevationGain) ? elevationGain : 0,
        calories: 0,
      };
    })
    .filter(Boolean);

  const renderedDates = activities
    .map((activity) => activity.startTimeLocal?.slice(0, 10))
    .filter(Boolean)
    .sort();

  return {
    kind: "dom-activities",
    activities,
    oldestDate: renderedDates[0] ?? null,
    newestDate: renderedDates.at(-1) ?? null,
  };
}

function selectReadyActivityTab(tabs) {
  const readyTabs = tabs.filter(
    (tab) => !tab.discarded && (tab.status === "complete" || tab.status === undefined),
  );
  return readyTabs.find((tab) => tab.active) ?? readyTabs[0] ?? null;
}

function visibleDataWarning({ activities, oldestDate, startDate }) {
  if (!activities.length) {
    return "当前活动页未读取到可见活动记录；请等待活动列表加载完成，或调整页面筛选后刷新。";
  }
  if (oldestDate && oldestDate > startDate) {
    return `仅统计当前活动页已加载的可见记录（最早 ${oldestDate}）；如需覆盖完整周期，请在活动列表继续向下滚动加载更多记录后刷新。`;
  }
  return "";
}

export async function fetchGarminActivitiesViaTabWithMetadata(
  { startDate },
  chromeApi = chrome,
) {
  let tabs;
  try {
    tabs = await chromeApi.tabs.query({
      url: ["https://connect.garmin.cn/app/activities*"],
      active: true,
      currentWindow: true,
    });
  } catch (error) {
    throw new GarminTabError(
      "TAB_ACCESS_FAILED",
      error?.message || "无法查找 Garmin Connect 活动页",
    );
  }

  if (tabs.length === 0) {
    throw new GarminTabError(
      "GARMIN_TAB_REQUIRED",
      "请打开或切换到 Garmin Connect 活动页，然后重试",
    );
  }
  const tab = selectReadyActivityTab(tabs);
  if (!tab?.id) {
    throw new GarminTabError(
      "GARMIN_TAB_NOT_READY",
      "Garmin Connect 活动页仍在加载，请等待页面显示活动后重试",
    );
  }

  let domResult;
  try {
    const domResults = await chromeApi.scripting.executeScript({
      target: { tabId: tab.id },
      func: readActivityRowsInGarminTab,
    });
    domResult = domResults?.[0]?.result;
  } catch (error) {
    throw new GarminTabError(
      "TAB_ACCESS_FAILED",
      `无法读取 Garmin Connect 当前页面数据：${error?.message || "标签页已关闭"}`,
    );
  }

  if (domResult?.kind !== "dom-activities" || !Array.isArray(domResult.activities)) {
    throw new GarminTabError(
      "TAB_FETCH_FAILED",
      "Garmin 当前页面没有返回可识别的活动列表数据",
    );
  }

  const warning = visibleDataWarning({
    activities: domResult.activities,
    oldestDate: domResult.oldestDate,
    startDate,
  });

  return {
    activities: domResult.activities,
    source: "garmin-tab",
    sourceDetail: "rendered",
    partial: Boolean(warning),
    warning,
  };
}

export async function fetchGarminActivitiesViaTab(query, chromeApi = chrome) {
  const result = await fetchGarminActivitiesViaTabWithMetadata(query, chromeApi);
  return result.activities;
}
