import { getPeriodRange } from "./dates.js";

export const SPORTS = Object.freeze({
  running: {
    label: "跑步",
  },
  cycling: {
    label: "骑行",
  },
});

function finiteNumber(value, fallback = 0) {
  if (value === null || value === undefined || value === "" || value === "--") {
    return fallback;
  }
  const parsed = typeof value === "string" ? Number(value.replaceAll(",", "")) : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function firstFinite(values, fallback = 0) {
  for (const value of values) {
    const parsed = finiteNumber(value, Number.NaN);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return fallback;
}

export function activitySport(activity) {
  const type = activity?.activityType ?? {};
  const candidates = [
    type.typeKey,
    type.parentTypeKey,
    type.typeName,
    activity?.activityTypeDTO?.typeKey,
    activity?.activityTypeDTO?.parentTypeKey,
    activity?.activityTypeKey,
    activity?.sport,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (/(cycling|biking|bike|骑行)/.test(candidates)) {
    return "cycling";
  }
  if (/(running|run|跑步)/.test(candidates)) {
    return "running";
  }
  return null;
}

function hasActivityTypeMetadata(activity) {
  const type = activity?.activityType ?? {};
  return Boolean(
    type.typeKey ||
      type.parentTypeKey ||
      type.typeName ||
      activity?.activityTypeDTO?.typeKey ||
      activity?.activityTypeDTO?.parentTypeKey ||
      activity?.activityTypeKey ||
      activity?.sport,
  );
}

export function normalizeActivity(activity, requestedSport = null) {
  const localStart = String(
    activity?.startTimeLocal ??
      activity?.startTimeGMT ??
      activity?.startTime ??
      "",
  );
  const dateMatch = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(?::\d{2})?/.exec(localStart);
  if (!dateMatch) {
    return null;
  }

  const detectedSport = activitySport(activity);
  if (!detectedSport && hasActivityTypeMetadata(activity)) {
    return null;
  }
  const sport = detectedSport ?? requestedSport;
  if (!SPORTS[sport]) {
    return null;
  }

  const distanceMeters = firstFinite([
    activity?.distance,
    activity?.distanceMeters,
    activity?.summaryDTO?.distance,
  ]);
  const durationSeconds = firstFinite([
    activity?.movingDuration,
    activity?.duration,
    activity?.elapsedDuration,
    activity?.summaryDTO?.movingDuration,
    activity?.summaryDTO?.duration,
  ]);

  return {
    sport,
    dateKey: dateMatch[1],
    distanceKm: distanceMeters / 1000,
    durationSeconds,
    calories: firstFinite([activity?.calories, activity?.summaryDTO?.calories]),
    elevationGain: firstFinite([
      activity?.elevationGain,
      activity?.totalAscent,
      activity?.summaryDTO?.elevationGain,
    ]),
  };
}

export function normalizeActivities(rawActivities, requestedSport) {
  if (!Array.isArray(rawActivities)) {
    return [];
  }

  return rawActivities
    .map((activity) => normalizeActivity(activity, requestedSport))
    .filter(Boolean)
    .filter((activity) => activity.sport === requestedSport);
}

export function summarizeActivities(activities, sport, period, now = new Date()) {
  if (!SPORTS[sport]) {
    throw new Error(`Unsupported sport: ${sport}`);
  }

  const range = getPeriodRange(period, now);
  const allowedDays = new Set(range.days);
  const todayKey = range.today;
  const relevant = activities.filter(
    (activity) =>
      activity.sport === sport && allowedDays.has(activity.dateKey) && activity.dateKey <= todayKey,
  );

  const daily = new Map(
    range.days.map((dateKey) => [
      dateKey,
      {
        dateKey,
        distanceKm: 0,
        durationSeconds: 0,
        count: 0,
        isFuture: dateKey > todayKey,
      },
    ]),
  );

  let totalDistanceKm = 0;
  let totalDurationSeconds = 0;
  let calories = 0;
  let elevationGain = 0;

  for (const activity of relevant) {
    totalDistanceKm += activity.distanceKm;
    totalDurationSeconds += activity.durationSeconds;
    calories += activity.calories;
    elevationGain += activity.elevationGain;

    const bucket = daily.get(activity.dateKey);
    if (bucket) {
      bucket.distanceKm += activity.distanceKm;
      bucket.durationSeconds += activity.durationSeconds;
      bucket.count += 1;
    }
  }

  const dailyValues = [...daily.values()];
  const activeDays = dailyValues.filter((day) => day.count > 0).length;
  const maxDailyDistanceKm = Math.max(0, ...dailyValues.map((day) => day.distanceKm));
  const averagePaceSecondsPerKm =
    totalDistanceKm > 0 ? totalDurationSeconds / totalDistanceKm : 0;
  const averageSpeedKmh =
    totalDurationSeconds > 0 ? totalDistanceKm / (totalDurationSeconds / 3600) : 0;

  return {
    sport,
    period,
    range,
    totalDistanceKm,
    totalDurationSeconds,
    count: relevant.length,
    activeDays,
    calories,
    elevationGain,
    averagePaceSecondsPerKm,
    averageSpeedKmh,
    maxDailyDistanceKm,
    daily: dailyValues,
  };
}

export function formatDistance(distanceKm, compact = false) {
  const digits = compact && distanceKm >= 100 ? 0 : 1;
  return distanceKm.toLocaleString("zh-CN", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function formatDuration(totalSeconds) {
  const seconds = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours === 0) {
    return `${minutes} 分`;
  }
  return `${hours}:${String(minutes).padStart(2, "0")}`;
}

export function formatPace(secondsPerKm) {
  if (!Number.isFinite(secondsPerKm) || secondsPerKm <= 0) {
    return "--";
  }
  const rounded = Math.round(secondsPerKm);
  const minutes = Math.floor(rounded / 60);
  const seconds = rounded % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function formatSpeed(speedKmh) {
  if (!Number.isFinite(speedKmh) || speedKmh <= 0) {
    return "--";
  }
  return speedKmh.toLocaleString("zh-CN", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}
