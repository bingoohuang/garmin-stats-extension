export const GARMIN_ACTIVITY_API =
  "https://connect.garmin.cn/app/proxy/activitylist-service/activities/search/activities";

export class GarminApiError extends Error {
  constructor(code, message, status = null) {
    super(message);
    this.name = "GarminApiError";
    this.code = code;
    this.status = status;
  }
}

export function buildActivityUrl({ sport, startDate, endDate, start, limit }) {
  const url = new URL(GARMIN_ACTIVITY_API);
  url.searchParams.set("start", String(start));
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("startDate", startDate);
  url.searchParams.set("endDate", endDate);
  url.searchParams.set("activityType", sport);
  url.searchParams.set("sortOrder", "asc");
  return url;
}

function responseItems(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }
  if (Array.isArray(payload?.activities)) {
    return payload.activities;
  }
  throw new GarminApiError("INVALID_RESPONSE", "Garmin 返回了无法识别的数据格式");
}

export async function fetchActivityPage({
  sport,
  startDate,
  endDate,
  start,
  limit,
  fetchImpl = fetch,
}) {
  const response = await fetchImpl(
    buildActivityUrl({ sport, startDate, endDate, start, limit }),
    {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      headers: {
        Accept: "application/json",
        NK: "NT",
      },
    },
  );

  const contentType = response.headers.get("content-type") ?? "";
  if (
    response.status === 401 ||
    response.status === 403 ||
    response.url.includes("/signin/")
  ) {
    throw new GarminApiError("AUTH_REQUIRED", "Garmin Connect 登录状态已失效", response.status);
  }
  if (response.status === 429) {
    throw new GarminApiError("RATE_LIMITED", "请求过于频繁，请稍后再试", response.status);
  }
  if (!response.ok) {
    throw new GarminApiError("HTTP_ERROR", `Garmin 接口返回 ${response.status}`, response.status);
  }
  if (contentType.includes("text/html")) {
    throw new GarminApiError("AUTH_REQUIRED", "Garmin Connect 登录状态已失效", response.status);
  }

  try {
    return responseItems(await response.json());
  } catch (error) {
    if (error instanceof GarminApiError) {
      throw error;
    }
    throw new GarminApiError("INVALID_RESPONSE", "Garmin 返回了无法解析的数据");
  }
}

function dedupeActivities(activities) {
  const seenIds = new Set();
  return activities.filter((activity) => {
    const id = activity?.activityId ?? activity?.id;
    if (id === null || id === undefined || id === "") {
      return true;
    }
    const key = String(id);
    if (seenIds.has(key)) {
      return false;
    }
    seenIds.add(key);
    return true;
  });
}

export async function fetchGarminActivities({
  sport,
  startDate,
  endDate,
  fetchImpl = fetch,
  pageSize = 100,
  maxPages = 5,
}) {
  const activities = [];
  for (let page = 0; page < maxPages; page += 1) {
    const pageItems = await fetchActivityPage({
      sport,
      startDate,
      endDate,
      start: page * pageSize,
      limit: pageSize,
      fetchImpl,
    });
    activities.push(...pageItems);
    if (pageItems.length < pageSize) {
      break;
    }
  }
  return dedupeActivities(activities);
}
