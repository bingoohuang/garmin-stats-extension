if (!globalThis.chrome?.runtime?.sendMessage) {
  const daily = [
    ["2026-07-13", 11.06, 3980, 1],
    ["2026-07-14", 13.56, 5338, 1],
    ["2026-07-15", 0, 0, 0],
    ["2026-07-16", 0, 0, 0],
    ["2026-07-17", 0, 0, 0],
    ["2026-07-18", 0, 0, 0],
    ["2026-07-19", 0, 0, 0],
  ].map(([dateKey, distanceKm, durationSeconds, count], index) => ({
    dateKey,
    distanceKm,
    durationSeconds,
    count,
    isFuture: index > 1,
  }));
  globalThis.chrome = {
    runtime: {
      sendMessage: async ({ payload }) => ({
        ok: true,
        data: {
          fetchedAt: Date.now(),
          source: "fixture",
          summary: {
            sport: payload.sport,
            period: payload.period,
            range: {
              startDate: "2026-07-13",
              endDate: "2026-07-19",
              today: "2026-07-14",
            },
            totalDistanceKm: 24.62,
            totalDurationSeconds: 9318,
            count: 2,
            activeDays: 2,
            calories: 1760,
            elevationGain: 55,
            averagePaceSecondsPerKm: 379,
            averageSpeedKmh: 9.5,
            maxDailyDistanceKm: 13.56,
            daily,
          },
        },
      }),
    },
    storage: {
      local: {
        get: async () => ({ preferences: { sport: "running", period: "week" } }),
        set: async () => {},
      },
    },
  };
}
