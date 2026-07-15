import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const projectRoot = new URL("../", import.meta.url);

test("popup exposes multi-select sports and a horizontal statistics grid", async () => {
  const html = await readFile(new URL("popup.html", projectRoot), "utf8");
  for (const id of ["periodControl", "sportControl", "statsGrid"]) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  }
  assert.match(html, /data-sport="running" aria-pressed="true"/);
  assert.match(html, /data-sport="cycling" aria-pressed="false"/);

  const script = await readFile(new URL("popup.js", projectRoot), "utf8");
  const styles = await readFile(new URL("popup.css", projectRoot), "utf8");
  assert.match(script, /sports: \["running"\]/);
  assert.match(script, /Promise\.all/);
  assert.match(script, /preferences:\s*\{[\s\S]*sports: state\.sports/);
  assert.match(styles, /html\[data-column-count="2"\].*width: 800px/);
  assert.match(styles, /grid-template-columns: repeat\(var\(--column-count/);
});

test("manifest installs the Garmin activity-page statistics widget", async () => {
  const manifest = JSON.parse(
    await readFile(new URL("manifest.json", projectRoot), "utf8"),
  );
  assert.equal(manifest.version, "1.2.1");
  assert.deepEqual(manifest.content_scripts[0].js, ["activity-widget.js"]);
  assert.deepEqual(manifest.content_scripts[0].matches, [
    "https://connect.garmin.cn/app/*",
  ]);
});

test("runtime reads current page data instead of Garmin activity APIs", async () => {
  const background = await readFile(new URL("background.js", projectRoot), "utf8");
  const garminTab = await readFile(new URL("lib/garmin-tab.js", projectRoot), "utf8");
  const runtimeCode = `${background}\n${garminTab}`;

  assert.match(runtimeCode, /readActivityRowsInGarminTab/);
  assert.doesNotMatch(runtimeCode, /activitylist-service/);
  assert.doesNotMatch(runtimeCode, /fetchActivityPage/);
  assert.doesNotMatch(runtimeCode, /world:\s*["']MAIN["']/);
  assert.doesNotMatch(runtimeCode, /GarminApi/);
});

test("activity page adds linked activity ids before the distance metric", async () => {
  const widget = await readFile(new URL("activity-widget.js", projectRoot), "utf8");
  assert.match(widget, /data-garmin-stats-activity-id/);
  assert.match(widget, /metrics\.insertBefore\(cell, distanceMetric\)/);
  assert.match(widget, /target = "_blank"/);
  assert.match(widget, /app\/activity\/\$\{activityId\}/);
  assert.match(widget, /existingCell\?\.dataset\.garminStatsActivityId === activityId/);
  assert.match(widget, /existingCell\?\.remove\(\)/);
});

test("activity-page chart exposes keyboard selection semantics", async () => {
  const widget = await readFile(new URL("activity-widget.js", projectRoot), "utf8");
  assert.match(widget, /role="listbox"/);
  assert.match(widget, /aria-activedescendant/);
  assert.match(widget, /aria-live="polite"/);
  assert.match(widget, /ArrowLeft/);
  assert.match(widget, /ArrowRight/);
});

test("activity-page widget keeps multiple selected sports in side-by-side columns", async () => {
  const widget = await readFile(new URL("activity-widget.js", projectRoot), "utf8");
  assert.match(widget, /sports: \["running"\]/);
  assert.match(widget, /wrap\.classList\.toggle\("multi", state\.sports\.length > 1\)/);
  assert.match(widget, /grid-template-columns:repeat\(var\(--column-count,1\)/);
  assert.match(widget, /Promise\.all/);
  assert.match(widget, /sports: state\.sports/);
});
