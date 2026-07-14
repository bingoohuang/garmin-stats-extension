if (!globalThis.chrome?.runtime?.sendMessage) {
  const requestedSports = new URLSearchParams(globalThis.location?.search || "").get("sports");
  const fixtureSports = requestedSports
    ?.split(",")
    .filter((sport) => ["running", "cycling"].includes(sport));
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
            totalDistanceKm: payload.sport === "cycling" ? 67.31 : 24.62,
            totalDurationSeconds: payload.sport === "cycling" ? 16322 : 9318,
            count: payload.sport === "cycling" ? 5 : 2,
            activeDays: payload.sport === "cycling" ? 4 : 2,
            calories: 1760,
            elevationGain: 55,
            averagePaceSecondsPerKm: 379,
            averageSpeedKmh: payload.sport === "cycling" ? 14.8 : 9.5,
            maxDailyDistanceKm: 13.56,
            daily,
          },
        },
      }),
    },
    storage: {
      local: {
        get: async () => ({
          preferences: {
            sports: fixtureSports?.length ? fixtureSports : ["running"],
            sport: fixtureSports?.[0] || "running",
            period: "week",
          },
        }),
        set: async () => {},
      },
    },
  };
}
