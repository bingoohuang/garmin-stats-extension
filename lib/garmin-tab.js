import { GarminApiError } from "./garmin-api.js";

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

  return {
    kind: "dom-activities",
    activities,
    oldestDate: activities.at(-1)?.startTimeLocal?.slice(0, 10) ?? null,
  };
}

export async function fetchActivityPageInGarminTab({
  sport,
  startDate,
  endDate,
  start,
  limit,
}) {
  const expectedOrigin = "https://connect.garmin.cn";
  if (globalThis.location?.origin !== expectedOrigin) {
    return {
      kind: "error",
      code: "TAB_ORIGIN_MISMATCH",
      message: "当前标签页不是 Garmin Connect China",
    };
  }

  try {
    const observedRequest = [
      ...(globalThis.performance?.getEntriesByType?.("resource") || []),
    ]
      .reverse()
      .map((entry) => entry?.name)
      .find((name) => {
        try {
          const candidate = new URL(name);
          return (
            candidate.origin === expectedOrigin &&
            candidate.pathname.includes(
              "/activitylist-service/activities/search/activities",
            )
          );
        } catch {
          return false;
        }
      });
    const url = new URL(
      observedRequest ||
        "/app/proxy/activitylist-service/activities/search/activities",
      expectedOrigin,
    );
    url.searchParams.set("start", String(start));
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("startDate", startDate);
    url.searchParams.set("endDate", endDate);
    url.searchParams.set("activityType", sport);
    url.searchParams.set("sortOrder", "asc");

    const response = await globalThis.fetch(url.toString(), {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      headers: {
        Accept: "application/json",
        NK: "NT",
      },
    });

    return {
      kind: "response",
      ok: response.ok,
      status: response.status,
      url: response.url,
      contentType: response.headers.get("content-type") ?? "",
      body: await response.text(),
    };
  } catch (error) {
    return {
      kind: "error",
      code: "TAB_FETCH_FAILED",
      message: error?.message || "无法通过 Garmin 页面读取活动数据",
    };
  }
}

function parseInjectedPage(result) {
  if (!result || result.kind === "error") {
    throw new GarminApiError(
      result?.code || "TAB_FETCH_FAILED",
      result?.message || "Garmin 页面没有返回数据",
    );
  }

  if (
    result.status === 401 ||
    result.status === 403 ||
    String(result.url).includes("/signin/")
  ) {
    throw new GarminApiError(
      "AUTH_REQUIRED",
      "Garmin Connect 页面登录状态已失效",
      result.status,
    );
  }
  if (result.status === 429) {
    throw new GarminApiError("RATE_LIMITED", "请求过于频繁，请稍后再试", result.status);
  }
  if (!result.ok) {
    throw new GarminApiError("HTTP_ERROR", `Garmin 接口返回 ${result.status}`, result.status);
  }
  if (String(result.contentType).includes("text/html")) {
    throw new GarminApiError(
      "AUTH_REQUIRED",
      "Garmin Connect 页面登录状态已失效",
      result.status,
    );
  }

  let payload;
  try {
    payload = JSON.parse(result.body);
  } catch {
    throw new GarminApiError("INVALID_RESPONSE", "Garmin 返回了无法解析的数据");
  }

  if (Array.isArray(payload)) {
    return payload;
  }
  if (Array.isArray(payload?.activities)) {
    return payload.activities;
  }
  throw new GarminApiError("INVALID_RESPONSE", "Garmin 返回了无法识别的数据格式");
}

function selectReadyActivityTab(tabs) {
  const readyTabs = tabs.filter(
    (tab) => !tab.discarded && (tab.status === "complete" || tab.status === undefined),
  );
  return readyTabs.find((tab) => tab.active) ?? readyTabs[0] ?? null;
}

export async function fetchGarminActivitiesViaTab(
  { sport, startDate, endDate, pageSize = 100, maxPages = 5 },
  chromeApi = chrome,
) {
  let tabs;
  try {
    tabs = await chromeApi.tabs.query({
      url: ["https://connect.garmin.cn/app/activities*"],
    });
  } catch (error) {
    throw new GarminApiError(
      "TAB_ACCESS_FAILED",
      error?.message || "无法查找 Garmin Connect 活动页",
    );
  }

  if (tabs.length === 0) {
    throw new GarminApiError(
      "GARMIN_TAB_REQUIRED",
      "请保持 Garmin Connect 活动页处于打开状态，然后重试",
    );
  }
  const tab = selectReadyActivityTab(tabs);
  if (!tab?.id) {
    throw new GarminApiError(
      "GARMIN_TAB_NOT_READY",
      "Garmin Connect 活动页仍在加载，请等待页面显示活动后重试",
    );
  }

  try {
    const domResults = await chromeApi.scripting.executeScript({
      target: { tabId: tab.id },
      func: readActivityRowsInGarminTab,
    });
    const domResult = domResults?.[0]?.result;
    if (
      domResult?.kind === "dom-activities" &&
      domResult.activities.length > 0 &&
      domResult.oldestDate &&
      domResult.oldestDate <= startDate
    ) {
      return domResult.activities;
    }
  } catch {
    // The API request below remains available when Garmin changes its activity-list DOM.
  }

  const activities = [];
  const seenIds = new Set();
  for (let page = 0; page < maxPages; page += 1) {
    let injectionResults;
    try {
      injectionResults = await chromeApi.scripting.executeScript({
        target: { tabId: tab.id },
        world: "MAIN",
        func: fetchActivityPageInGarminTab,
        args: [
          {
            sport,
            startDate,
            endDate,
            start: page * pageSize,
            limit: pageSize,
          },
        ],
      });
    } catch (error) {
      throw new GarminApiError(
        "TAB_ACCESS_FAILED",
        `无法访问 Garmin Connect 活动页：${error?.message || "标签页已关闭"}`,
      );
    }

    const pageItems = parseInjectedPage(injectionResults?.[0]?.result);
    for (const activity of pageItems) {
      const id = activity?.activityId ?? activity?.id;
      const key = id === null || id === undefined || id === "" ? null : String(id);
      if (key && seenIds.has(key)) {
        continue;
      }
      if (key) {
        seenIds.add(key);
      }
      activities.push(activity);
    }
    if (pageItems.length < pageSize) {
      break;
    }
  }

  return activities;
}
