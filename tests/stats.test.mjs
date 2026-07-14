import assert from "node:assert/strict";
import test from "node:test";

import { getPeriodRange } from "../lib/dates.js";
import {
  formatDuration,
  formatPace,
  normalizeActivities,
  summarizeActivities,
} from "../lib/stats.js";

const now = new Date(2026, 6, 14, 8, 30, 0);

test("month range includes every calendar day and queries through today", () => {
  const range = getPeriodRange("month", now);
  assert.equal(range.startDate, "2026-07-01");
  assert.equal(range.endDate, "2026-07-31");
  assert.equal(range.queryEndDate, "2026-07-14");
  assert.equal(range.days.length, 31);
});

test("week range starts Monday and ends Sunday", () => {
  const range = getPeriodRange("week", now);
  assert.equal(range.startDate, "2026-07-13");
  assert.equal(range.endDate, "2026-07-19");
  assert.equal(range.queryEndDate, "2026-07-14");
  assert.equal(range.days.length, 7);
});

test("normalizes established Garmin activity fields", () => {
  const activities = normalizeActivities(
    [
      {
        activityId: 42,
        activityName: "南京市 跑步",
        startTimeLocal: "2026-07-10 06:08:14",
        distance: 10050,
        movingDuration: 3814,
        calories: 764,
        elevationGain: 21,
        activityType: { typeKey: "running" },
      },
    ],
    "running",
  );

  assert.equal(activities.length, 1);
  assert.equal(activities[0].dateKey, "2026-07-10");
  assert.equal(activities[0].distanceKm, 10.05);
  assert.equal(activities[0].durationSeconds, 3814);
});

test("rejects explicit unsupported activity types but accepts missing type metadata", () => {
  const activities = normalizeActivities(
    [
      {
        startTimeLocal: "2026-07-10 08:00:00",
        distance: 2000,
        duration: 1200,
        activityType: { typeKey: "walking" },
      },
      {
        startTimeLocal: "2026-07-11 08:00:00",
        distance: 3000,
        duration: 1500,
      },
    ],
    "running",
  );

  assert.equal(activities.length, 1);
  assert.equal(activities[0].dateKey, "2026-07-11");
});

test("normalization skips null placeholders and recognizes cycling subtypes", () => {
  const activities = normalizeActivities(
    [
      {
        activityId: 7,
        activityName: "室内骑行",
        startTimeLocal: "2026-07-12 09:10:00",
        distance: 25000,
        movingDuration: null,
        duration: 3600,
        calories: "--",
        activityTypeDTO: { typeKey: "indoor_cycling" },
      },
    ],
    "cycling",
  );

  assert.equal(activities.length, 1);
  assert.equal(activities[0].durationSeconds, 3600);
  assert.equal(activities[0].calories, 0);
});

test("summarizes distance, active days, duration and weighted pace", () => {
  const activities = [
    {
      id: "1",
      name: "晨跑",
      sport: "running",
      startTimeLocal: "2026-07-13 06:00:00",
      dateKey: "2026-07-13",
      timeLabel: "06:00",
      distanceKm: 5,
      durationSeconds: 1800,
      calories: 320,
      elevationGain: 12,
    },
    {
      id: "2",
      name: "夜跑",
      sport: "running",
      startTimeLocal: "2026-07-13 20:00:00",
      dateKey: "2026-07-13",
      timeLabel: "20:00",
      distanceKm: 3,
      durationSeconds: 1200,
      calories: 210,
      elevationGain: 8,
    },
    {
      id: "3",
      name: "恢复跑",
      sport: "running",
      startTimeLocal: "2026-07-14 07:00:00",
      dateKey: "2026-07-14",
      timeLabel: "07:00",
      distanceKm: 2,
      durationSeconds: 900,
      calories: 150,
      elevationGain: 5,
    },
  ];

  const summary = summarizeActivities(activities, "running", "week", now);
  assert.equal(summary.count, 3);
  assert.equal(summary.activeDays, 2);
  assert.equal(summary.totalDistanceKm, 10);
  assert.equal(summary.totalDurationSeconds, 3900);
  assert.equal(summary.averagePaceSecondsPerKm, 390);
  assert.equal(summary.daily[0].distanceKm, 8);
  assert.equal(summary.daily[1].distanceKm, 2);
  assert.equal(summary.daily[2].isFuture, true);
});

test("matches the known July CSV running and cycling totals", () => {
  const buildActivities = (sport, rows) =>
    rows.map(([dateKey, distanceKm, durationSeconds], index) => ({
      id: `${sport}-${index}`,
      name: sport,
      sport,
      startTimeLocal: `${dateKey} 06:00:00`,
      dateKey,
      timeLabel: "06:00",
      distanceKm,
      durationSeconds,
      calories: 0,
      elevationGain: 0,
    }));

  const runs = buildActivities("running", [
    ["2026-07-10", 10.05, 3814],
    ["2026-07-09", 8.03, 2970],
    ["2026-07-08", 11.03, 3864],
    ["2026-07-08", 5.56, 2149],
    ["2026-07-07", 10.01, 4153],
    ["2026-07-06", 12.78, 5128],
    ["2026-07-05", 10, 3781],
    ["2026-07-04", 15.05, 5461],
    ["2026-07-03", 12.22, 4073],
    ["2026-07-02", 5.06, 2059],
  ]);
  const rides = buildActivities("cycling", [
    ["2026-07-06", 15.26, 3946],
    ["2026-07-05", 8.01, 1682],
    ["2026-07-04", 12.38, 2542],
    ["2026-07-04", 13.43, 2978],
    ["2026-07-02", 18.23, 5174],
  ]);

  const runningSummary = summarizeActivities(runs, "running", "month", now);
  assert.equal(runningSummary.count, 10);
  assert.equal(runningSummary.activeDays, 9);
  assert.equal(Number(runningSummary.totalDistanceKm.toFixed(2)), 99.79);
  assert.equal(runningSummary.totalDurationSeconds, 37452);
  assert.equal(formatPace(runningSummary.averagePaceSecondsPerKm), "6:15");

  const cyclingSummary = summarizeActivities(rides, "cycling", "month", now);
  assert.equal(cyclingSummary.count, 5);
  assert.equal(cyclingSummary.activeDays, 4);
  assert.equal(Number(cyclingSummary.totalDistanceKm.toFixed(2)), 67.31);
  assert.equal(cyclingSummary.totalDurationSeconds, 16322);
  assert.equal(Number(cyclingSummary.averageSpeedKmh.toFixed(1)), 14.8);
});

test("formatters produce compact Chinese popup values", () => {
  assert.equal(formatDuration(3740), "1:02");
  assert.equal(formatDuration(1250), "20 分");
  assert.equal(formatPace(375), "6:15");
  assert.equal(formatPace(0), "--");
});
