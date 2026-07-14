import assert from "node:assert/strict";
import test from "node:test";

import {
  buildActivityUrl,
  fetchActivityPage,
  fetchGarminActivities,
  GarminApiError,
} from "../lib/garmin-api.js";

function jsonResponse(payload, overrides = {}) {
  return {
    ok: true,
    status: 200,
    url: "https://connect.garmin.cn/app/proxy/activitylist-service/activities/search/activities",
    headers: new Headers({ "content-type": "application/json" }),
    json: async () => payload,
    ...overrides,
  };
}

test("builds the China activity query with explicit sort order", () => {
  const url = buildActivityUrl({
    sport: "running",
    startDate: "2026-07-01",
    endDate: "2026-07-14",
    start: 0,
    limit: 100,
  });
  assert.equal(url.pathname, "/app/proxy/activitylist-service/activities/search/activities");
  assert.equal(url.searchParams.get("activityType"), "running");
  assert.equal(url.searchParams.get("sortOrder"), "asc");
});

test("sends the Garmin web API marker header", async () => {
  let requestOptions;
  await fetchActivityPage({
    sport: "running",
    startDate: "2026-07-01",
    endDate: "2026-07-14",
    start: 0,
    limit: 100,
    fetchImpl: async (_url, options) => {
      requestOptions = options;
      return jsonResponse([]);
    },
  });

  assert.equal(requestOptions.headers.NK, "NT");
  assert.equal(requestOptions.credentials, "include");
});

test("classifies a redirected HTML login page as authentication required", async () => {
  await assert.rejects(
    fetchActivityPage({
      sport: "running",
      startDate: "2026-07-01",
      endDate: "2026-07-14",
      start: 0,
      limit: 100,
      fetchImpl: async () =>
        jsonResponse([], {
          url: "https://connect.garmin.cn/signin/",
          headers: new Headers({ "content-type": "text/html" }),
        }),
    }),
    (error) => error instanceof GarminApiError && error.code === "AUTH_REQUIRED",
  );
});

test("classifies rate limiting separately", async () => {
  await assert.rejects(
    fetchActivityPage({
      sport: "cycling",
      startDate: "2026-07-01",
      endDate: "2026-07-14",
      start: 0,
      limit: 100,
      fetchImpl: async () => jsonResponse([], { ok: false, status: 429 }),
    }),
    (error) => error instanceof GarminApiError && error.code === "RATE_LIMITED",
  );
});

test("does not misclassify an HTML server error as authentication", async () => {
  await assert.rejects(
    fetchActivityPage({
      sport: "running",
      startDate: "2026-07-01",
      endDate: "2026-07-14",
      start: 0,
      limit: 100,
      fetchImpl: async () =>
        jsonResponse([], {
          ok: false,
          status: 503,
          headers: new Headers({ "content-type": "text/html" }),
        }),
    }),
    (error) => error instanceof GarminApiError && error.code === "HTTP_ERROR",
  );
});

test("paginates and removes duplicate activity ids", async () => {
  const starts = [];
  const pages = [
    [{ activityId: 1 }, { activityId: 2 }],
    [{ activityId: 2 }, { activityId: 3 }],
    [],
  ];
  const activities = await fetchGarminActivities({
    sport: "running",
    startDate: "2026-07-01",
    endDate: "2026-07-31",
    pageSize: 2,
    maxPages: 5,
    fetchImpl: async (url) => {
      starts.push(Number(url.searchParams.get("start")));
      return jsonResponse(pages.shift());
    },
  });

  assert.deepEqual(starts, [0, 2, 4]);
  assert.deepEqual(
    activities.map((activity) => activity.activityId),
    [1, 2, 3],
  );
});
