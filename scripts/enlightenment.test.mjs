// scripts/enlightenment.test.mjs
// Structural design contracts for the final authored enlightenment phase.
// These tests deliberately assert geometry and semantics, not a particular
// screenshot: the phase must remain bounded, directional, theme-safe, and
// subordinate to the measured chart.
import test from "node:test";
import assert from "node:assert/strict";

import { STACK_THROUGH_YEAR, buildModel, renderSVG } from "./cumulative.mjs";
import { splitThemes } from "./theme-split.mjs";
import { attrOf, declarationsOf, styleBlocks, tagsWithClass } from "./chart-test-helpers.mjs";

function fixture(currentTotal = 4214) {
  const now = new Date().getUTCFullYear();
  const grouped = [1, 4, 32, 19, 0, 0, 234, 61, 188];
  const recent = [236, 1676, 2027, currentTotal];
  const firstGrouped = STACK_THROUGH_YEAR - (grouped.length - 1);
  const firstRecent = now - (recent.length - 1);
  return [
    ...grouped.map((total, i) => ({ year: firstGrouped + i, total, source: "h2" })),
    ...recent.map((total, i) => ({ year: firstRecent + i, total, source: "h2" })),
  ];
}

const svg = () => renderSVG(buildModel(fixture()));
const number = (value, name) => {
  const n = Number(value);
  assert.ok(Number.isFinite(n), `${name} must be numeric, got ${value}`);
  return n;
};

test("enlightenment phase has a bounded cloud, diagonal rays, and singularity traces", () => {
  const out = svg();
  assert.equal(tagsWithClass(out, "g", "narrative-enlightenment").length, 1);
  assert.equal(tagsWithClass(out, "ellipse", "enlightenment-cloud").length, 1);
  assert.equal(tagsWithClass(out, "ellipse", "enlightenment-cloud-core").length, 1);
  assert.equal(tagsWithClass(out, "ellipse", "enlightenment-cloud-hole").length, 1);
  const liquidRays = tagsWithClass(out, "path", "enlightenment-liquid-ray");
  assert.equal(liquidRays.length, 5);
  assert.equal(tagsWithClass(out, "path", "enlightenment-ray-highlight").length, 5);
  assert.equal(tagsWithClass(out, "path", "enlightenment-trace-line").length, 3);
  assert.equal(tagsWithClass(out, "path", "enlightenment-fragment").length, 3);
  assert.equal(tagsWithClass(out, "circle", "enlightenment-spark").length, 3);

  const cloud = tagsWithClass(out, "ellipse", "enlightenment-cloud")[0];
  const cloudX = number(attrOf(cloud, "cx"), "cloud cx");
  const cloudY = number(attrOf(cloud, "cy"), "cloud cy");
  const cloudRx = number(attrOf(cloud, "rx"), "cloud rx");
  const cloudRy = number(attrOf(cloud, "ry"), "cloud ry");
  assert.ok(cloudX > 760 && cloudX < 800, `cloud must live in the upper-right, got ${cloudX}`);
  assert.ok(cloudY >= 120 && cloudY <= 160, `cloud must stay in the upper plot, got ${cloudY}`);
  assert.ok(cloudRx > 0 && cloudRy > 0);
  const hole = tagsWithClass(out, "ellipse", "enlightenment-cloud-hole")[0];
  assert.ok(number(attrOf(hole, "rx"), "hole rx") < cloudRx);
  assert.ok(number(attrOf(hole, "ry"), "hole ry") < cloudRy);

  for (const [i, ray] of liquidRays.entries()) {
    const d = attrOf(ray, "d");
    assert.match(d, /^M /, `liquid ray ${i} must have a path`);
    assert.match(d, / Z$/, `liquid ray ${i} must close into a tapered ribbon`);
    const nums = [...d.matchAll(/-?[\d.]+/g)].map((m) => Number(m[0]));
    const xs = nums.filter((_, index) => index % 2 === 0);
    const ys = nums.filter((_, index) => index % 2 === 1);
    assert.ok(xs[0] > Math.min(...xs), `ray ${i} must travel down-left from its aperture`);
    assert.ok(ys[0] < Math.max(...ys), `ray ${i} must descend from its aperture`);
    assert.ok(Math.min(...xs) > 56 && Math.max(...xs) < 792, `ray ${i} must stay inside horizontal plot bounds`);
    assert.ok(Math.min(...ys) >= 120 && Math.max(...ys) < 260, `ray ${i} must stay inside vertical plot bounds`);
    assert.ok(
      Math.abs(xs[0] - (cloudX - cloudRx + 4)) <= 6,
      `ray ${i} must launch within the cloud-edge ribbon width`
    );
    assert.ok(
      Math.min(...xs) < xs[0] - 1,
      `ray ${i} must taper toward a lower-left tip`
    );
  }

  const futureGhosts = tagsWithClass(out, "rect", "future-ghost");
  assert.equal(futureGhosts.length, 2, "enlightenment fixture must expose both future slots");
  const ghostCenters = futureGhosts.map(
    (ghost) =>
      number(attrOf(ghost, "x"), "future slot x") +
      number(attrOf(ghost, "width"), "future slot width") / 2
  );
  const slot = ghostCenters[1] - ghostCenters[0];
  assert.ok(slot > 0, `future slots must advance left-to-right, got ${slot}`);
  const boundary = ghostCenters[1] - slot / 2;

  const tracePaths = tagsWithClass(out, "path", "enlightenment-trace-line");
  for (const [i, path] of tracePaths.entries()) {
    const d = attrOf(path, "d");
    assert.match(d, /^M /, `trace ${i} must have a path`);
    const nums = [...d.matchAll(/-?[\d.]+/g)].map((m) => Number(m[0]));
    assert.ok(nums[0] < nums[nums.length - 2], `trace ${i} must move right toward the aperture`);
    assert.ok(nums[1] !== nums[nums.length - 1], `trace ${i} must curve vertically into the aperture`);
    assert.ok(
      Math.abs(nums[0] - (boundary + 5)) < 0.11,
      `trace ${i} must launch after the 2027–2028 boundary, not at the measured singularity`
    );
  }

  const aria = out.match(/aria-label="([^"]*)"/)?.[1] ?? "";
  assert.match(aria, /bounded age of enlightenment cloud with diagonal rays/);
});

test("enlightenment gradient transitions green to lime to gold to ivory", () => {
  const out = svg();
  const block = out.match(/<linearGradient id="seamFieldGrad"[^>]*>([\s\S]*?)<\/linearGradient>/)?.[1] ?? "";
  const colors = [...block.matchAll(/stop-color="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(colors.slice(-4), ["#a3e635", "#fbbf24", "#fde68a", "#fff7cc"]);
  assert.match(out, /id="enlightenmentCloud"/);
  assert.match(out, /id="enlightenmentRayGrad"/);
});

test("enlightenment has explicit dark/light palette and reduced-motion rules", () => {
  const { dark, light } = splitThemes(svg());
  for (const [name, out] of Object.entries({ dark, light })) {
    const css = styleBlocks(out)[0];
      assert.ok(css.includes(".enlightenment-ray"), `${name}: missing liquid-ray CSS`);
    assert.ok(css.includes(".enlightenment-ray-highlight"), `${name}: missing ray highlight CSS`);
    assert.ok(css.includes(".enlightenment-text"), `${name}: missing label CSS`);
    assert.ok(css.includes("animate, animateTransform { display: none; }"), `${name}: missing reduced-motion rule`);
  }
  const lightCss = styleBlocks(light)[0];
  assert.ok(declarationsOf(lightCss, ".enlightenment-ray").length >= 1);
  assert.ok(lightCss.includes("enlightenmentRayGradLight"));
});
