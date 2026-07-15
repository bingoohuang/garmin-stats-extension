import assert from "node:assert/strict";
import test from "node:test";

import {
  fetchGarminActivitiesViaTab,
  fetchGarminActivitiesViaTabWithMetadata,
  readActivityRowsInGarminTab,
} from "../lib/garmin-tab.js";

function activity(overrides = {}) {
  return {
    activityId: "616476892",
    activityType: { typeName: "跑步" },
    startTimeLocal: "2026-07-14 00:00:00",
    distance: 13560,
    duration: 5338,
    ...overrides,
  };
}

function chromeWithRenderedRows(domResult, tabs = null, onExecute = null, onQuery = null) {
  return {
    tabs: {
      query: async (options) => {
        onQuery?.(options);
        return tabs ?? [
          {
            id: 55,
            url: "https://connect.garmin.cn/app/activities",
            active: true,
            discarded: false,
            status: "complete",
          },
        ];
      },
    },
    scripting: {
      executeScript: async (options) => {
        onExecute?.(options);
        assert.equal(options.func, readActivityRowsInGarminTab);
        return [{ result: domResult }];
      },
    },
  };
}

test("tab reader uses the ready active Garmin activity tab without calling Garmin APIs", async () => {
  const renderedActivities = [activity({ activityId: "1" }), activity({ activityId: "2" })];
  const calls = [];
  const queries = [];
  const chromeApi = chromeWithRenderedRows(
    {
      kind: "dom-activities",
      activities: renderedActivities,
      oldestDate: "2026-06-30",
      newestDate: "2026-07-14",
    },
    [
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
    (options) => calls.push(options),
    (options) => queries.push(options),
  );

  const result = await fetchGarminActivitiesViaTabWithMetadata(
    { sport: "running", startDate: "2026-07-01", endDate: "2026-07-14" },
    chromeApi,
  );

  assert.deepEqual(result.activities, renderedActivities);
  assert.equal(result.source, "garmin-tab");
  assert.equal(result.sourceDetail, "rendered");
  assert.equal(result.warning, "");
  assert.equal(result.partial, false);
  assert.deepEqual(queries, [
    {
      url: ["https://connect.garmin.cn/app/activities*"],
      active: true,
      currentWindow: true,
    },
  ]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].target.tabId, 22);
  assert.equal(calls[0].world, undefined);
  assert.equal(calls[0].args, undefined);
});

test("legacy tab helper returns the current rendered activities", async () => {
  const renderedActivities = [activity({ activityId: "3" })];
  const activities = await fetchGarminActivitiesViaTab(
    { sport: "running", startDate: "2026-07-01", endDate: "2026-07-14" },
    chromeWithRenderedRows({
      kind: "dom-activities",
      activities: renderedActivities,
      oldestDate: "2026-06-30",
      newestDate: "2026-07-14",
    }),
  );

  assert.deepEqual(activities, renderedActivities);
});

test("tab metadata warns when the current page does not cover the requested period", async () => {
  const renderedActivities = [activity()];
  const result = await fetchGarminActivitiesViaTabWithMetadata(
    { sport: "running", startDate: "2026-07-01", endDate: "2026-07-14" },
    chromeWithRenderedRows({
      kind: "dom-activities",
      activities: renderedActivities,
      oldestDate: "2026-07-06",
      newestDate: "2026-07-14",
    }),
  );

  assert.deepEqual(result.activities, renderedActivities);
  assert.equal(result.partial, true);
  assert.match(result.warning, /仅统计当前活动页已加载的可见记录/);
  assert.match(result.warning, /2026-07-06/);
});

test("tab metadata returns an empty rendered set with a page-data warning", async () => {
  const result = await fetchGarminActivitiesViaTabWithMetadata(
    { sport: "cycling", startDate: "2026-07-01", endDate: "2026-07-14" },
    chromeWithRenderedRows({
      kind: "dom-activities",
      activities: [],
      oldestDate: null,
      newestDate: null,
    }),
  );

  assert.deepEqual(result.activities, []);
  assert.equal(result.partial, true);
  assert.match(result.warning, /当前活动页未读取到可见活动记录/);
});

test("tab reader distinguishes missing and loading activity pages", async () => {
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

test("tab reader classifies page script failures without falling back to API requests", async () => {
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
      executeScript: async () => {
        throw new Error("No access");
      },
    },
  };

  await assert.rejects(
    fetchGarminActivitiesViaTab(
      { sport: "running", startDate: "2026-07-01", endDate: "2026-07-14" },
      chromeApi,
    ),
    (error) =>
      error.code === "TAB_ACCESS_FAILED" && /当前页面数据/.test(error.message),
  );
});

test("tab reader rejects unrecognized page data envelopes", async () => {
  await assert.rejects(
    fetchGarminActivitiesViaTab(
      { sport: "running", startDate: "2026-07-01", endDate: "2026-07-14" },
      chromeWithRenderedRows({ kind: "unknown" }),
    ),
    (error) => error.code === "TAB_FETCH_FAILED",
  );
});
