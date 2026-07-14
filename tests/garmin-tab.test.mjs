import assert from "node:assert/strict";
import test from "node:test";

import {
  fetchActivityPageInGarminTab,
  fetchGarminActivitiesViaTab,
  readActivityRowsInGarminTab,
} from "../lib/garmin-tab.js";

function textResponse(payload, overrides = {}) {
  return {
    ok: true,
    status: 200,
    url: "https://connect.garmin.cn/app/proxy/activitylist-service/activities/search/activities",
    headers: new Headers({ "content-type": "application/json" }),
    text: async () => JSON.stringify(payload),
    ...overrides,
  };
}

async function withGarminPage(fetchImpl, callback, resourceNames = []) {
  const originalFetch = globalThis.fetch;
  const locationDescriptor = Object.getOwnPropertyDescriptor(globalThis, "location");
  const performanceDescriptor = Object.getOwnPropertyDescriptor(globalThis, "performance");
  Object.defineProperty(globalThis, "location", {
    configurable: true,
    value: { origin: "https://connect.garmin.cn" },
  });
  Object.defineProperty(globalThis, "performance", {
    configurable: true,
    value: {
      getEntriesByType: () => resourceNames.map((name) => ({ name })),
    },
  });
  globalThis.fetch = fetchImpl;
  try {
    return await callback();
  } finally {
    globalThis.fetch = originalFetch;
    if (locationDescriptor) {
      Object.defineProperty(globalThis, "location", locationDescriptor);
    } else {
      delete globalThis.location;
    }
    if (performanceDescriptor) {
      Object.defineProperty(globalThis, "performance", performanceDescriptor);
    } else {
      delete globalThis.performance;
    }
  }
}

test("injected page request uses fixed Garmin endpoint and returns text envelope", async () => {
  let requestedUrl;
  let requestOptions;
  const result = await withGarminPage(
    async (url, options) => {
      requestedUrl = new URL(url);
      requestOptions = options;
      return textResponse([{ activityId: 1 }]);
    },
    () =>
      fetchActivityPageInGarminTab({
        sport: "running",
        startDate: "2026-07-01",
        endDate: "2026-07-14",
        start: 0,
        limit: 100,
      }),
  );

  assert.equal(requestedUrl.origin, "https://connect.garmin.cn");
  assert.equal(requestedUrl.pathname, "/app/proxy/activitylist-service/activities/search/activities");
  assert.equal(requestedUrl.searchParams.get("activityType"), "running");
  assert.equal(requestOptions.headers.NK, "NT");
  assert.equal(requestOptions.credentials, "include");
  assert.equal(result.kind, "response");
  assert.equal(result.body, JSON.stringify([{ activityId: 1 }]));
});

test("reuses the activity endpoint observed from the logged-in Garmin page", async () => {
  let requestedUrl;
  const observedUrl =
    "https://connect.garmin.cn/web-gateway/activitylist-service/activities/search/activities?start=20&limit=20&activityType=all";
  await withGarminPage(
    async (url) => {
      requestedUrl = new URL(url);
      return textResponse([]);
    },
    () =>
      fetchActivityPageInGarminTab({
        sport: "cycling",
        startDate: "2026-07-01",
        endDate: "2026-07-14",
        start: 0,
        limit: 100,
      }),
    ["https://connect.garmin.cn/assets/app.js", observedUrl],
  );

  assert.equal(
    requestedUrl.pathname,
    "/web-gateway/activitylist-service/activities/search/activities",
  );
  assert.equal(requestedUrl.searchParams.get("start"), "0");
  assert.equal(requestedUrl.searchParams.get("limit"), "100");
  assert.equal(requestedUrl.searchParams.get("activityType"), "cycling");
});

test("injected request rejects an unexpected page origin", async () => {
  const locationDescriptor = Object.getOwnPropertyDescriptor(globalThis, "location");
  Object.defineProperty(globalThis, "location", {
    configurable: true,
    value: { origin: "https://example.com" },
  });
  try {
    const result = await fetchActivityPageInGarminTab({
      sport: "running",
      startDate: "2026-07-01",
      endDate: "2026-07-14",
      start: 0,
      limit: 100,
    });
    assert.equal(result.kind, "error");
    assert.equal(result.code, "TAB_ORIGIN_MISMATCH");
  } finally {
    if (locationDescriptor) {
      Object.defineProperty(globalThis, "location", locationDescriptor);
    } else {
      delete globalThis.location;
    }
  }
});

test("tab fallback prefers a ready active activity tab and paginates", async () => {
  const starts = [];
  const tabIds = [];
  const worlds = [];
  const pages = [
    [{ activityId: 1 }, { activityId: 2 }],
    [{ activityId: 2 }, { activityId: 3 }],
    [],
  ];
  const chromeApi = {
    tabs: {
      query: async () => [
        {
          id: 11,
          url: "https://connect.garmin.cn/app/activities",
          active: false,
          discarded: false,
          status: "complete",
        },
        {
          id: 22,
          url: "https://connect.garmin.cn/app/activities",
          active: true,
          discarded: false,
          status: "complete",
        },
      ],
    },
    scripting: {
      executeScript: async (options) => {
        if (options.func === readActivityRowsInGarminTab) {
          return [{ result: { kind: "dom-activities", activities: [], oldestDate: null } }];
        }
        starts.push(options.args[0].start);
        tabIds.push(options.target.tabId);
        worlds.push(options.world);
        return [
          {
            result: {
              kind: "response",
              ok: true,
              status: 200,
              url: "https://connect.garmin.cn/app/proxy/activitylist-service/activities/search/activities",
              contentType: "application/json",
              body: JSON.stringify(pages.shift()),
            },
          },
        ];
      },
    },
  };

  const activities = await fetchGarminActivitiesViaTab(
    {
      sport: "cycling",
      startDate: "2026-07-01",
      endDate: "2026-07-14",
      pageSize: 2,
    },
    chromeApi,
  );

  assert.deepEqual(starts, [0, 2, 4]);
  assert.deepEqual(tabIds, [22, 22, 22]);
  assert.deepEqual(worlds, ["MAIN", "MAIN", "MAIN"]);
  assert.deepEqual(
    activities.map((activity) => activity.activityId),
    [1, 2, 3],
  );
});

test("tab fallback uses rendered activities when they cover the requested period", async () => {
  const renderedActivities = [
    {
      activityId: "616476892",
      activityType: { typeName: "跑步" },
      startTimeLocal: "2026-07-14 00:00:00",
      distance: 13560,
      duration: 5338,
    },
  ];
  const chromeApi = {
    tabs: {
      query: async () => [
        {
          id: 55,
          url: "https://connect.garmin.cn/app/activities",
          active: true,
          discarded: false,
          status: "complete",
        },
      ],
    },
    scripting: {
      executeScript: async (options) => {
        assert.equal(options.func, readActivityRowsInGarminTab);
        return [
          {
            result: {
              kind: "dom-activities",
              activities: renderedActivities,
              oldestDate: "2026-06-30",
            },
          },
        ];
      },
    },
  };

  const activities = await fetchGarminActivitiesViaTab(
    { sport: "running", startDate: "2026-07-01", endDate: "2026-07-14" },
    chromeApi,
  );
  assert.deepEqual(activities, renderedActivities);
});

test("tab fallback distinguishes missing and loading activity pages", async () => {
  const noTabChrome = {
    tabs: { query: async () => [] },
  };
  await assert.rejects(
    fetchGarminActivitiesViaTab(
      { sport: "running", startDate: "2026-07-01", endDate: "2026-07-14" },
      noTabChrome,
    ),
    (error) => error.code === "GARMIN_TAB_REQUIRED",
  );

  const loadingTabChrome = {
    tabs: {
      query: async () => [
        {
          id: 33,
          url: "https://connect.garmin.cn/app/activities",
          active: true,
          discarded: false,
          status: "loading",
        },
      ],
    },
  };
  await assert.rejects(
    fetchGarminActivitiesViaTab(
      { sport: "running", startDate: "2026-07-01", endDate: "2026-07-14" },
      loadingTabChrome,
    ),
    (error) => error.code === "GARMIN_TAB_NOT_READY",
  );
});

test("tab fallback classifies a redirected HTML response as authentication required", async () => {
  const chromeApi = {
    tabs: {
      query: async () => [
        {
          id: 44,
          url: "https://connect.garmin.cn/app/activities",
          active: true,
          discarded: false,
          status: "complete",
        },
      ],
    },
    scripting: {
      executeScript: async (options) => {
        if (options.func === readActivityRowsInGarminTab) {
          return [{ result: { kind: "dom-activities", activities: [], oldestDate: null } }];
        }
        return [
          {
            result: {
              kind: "response",
              ok: true,
              status: 200,
              url: "https://connect.garmin.cn/signin/",
              contentType: "text/html",
              body: "<html></html>",
            },
          },
        ];
      },
    },
  };

  await assert.rejects(
    fetchGarminActivitiesViaTab(
      { sport: "running", startDate: "2026-07-01", endDate: "2026-07-14" },
      chromeApi,
    ),
    (error) => error.code === "AUTH_REQUIRED",
  );
});
