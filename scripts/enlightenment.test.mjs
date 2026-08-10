// scripts/enlightenment.test.mjs
// Structural design contracts for the new age 20-rays phase with spectral color fringing.
import test from "node:test";
import assert from "node:assert/strict";

import { STACK_THROUGH_YEAR, buildModel, renderSVG } from "./cumulative.mjs";
import { splitThemes } from "./theme-split.mjs";
import { attrOf, styleBlocks, tagsWithClass } from "./chart-test-helpers.mjs";

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

test("spectral fringing only: 20 rays, 40 fringe edges, no interference bands", () => {
  const out = svg();
  assert.equal(tagsWithClass(out, "g", "narrative-enlightenment").length, 1);

  const rays = tagsWithClass(out, "polygon", "new-age-ray");
  assert.equal(rays.length, 20, "expected 20 ray polygons");

  const fringes = tagsWithClass(out, "polygon", "new-age-fringe");
  assert.equal(fringes.length, 40, "expected 40 fringe edge polygons (2 per ray)");

  // No interference lines
  assert.ok(!out.includes("new-age-interference"), "must not contain interference bands");

  // Fringes must repeat indefinitely
  const fringeBlocks = [...out.matchAll(/<polygon[^>]*class="[^"]*\bnew-age-fringe\b[^"]*"[^]*?<\/polygon>/g)];
  assert.equal(fringeBlocks.length, 40);
  for (let i = 0; i < fringeBlocks.length; i++) {
    assert.match(fringeBlocks[i][0], /repeatCount="indefinite"/, "fringe must repeat indefinitely");
  }

  // Every ray must fan downward
  for (const [i, ray] of rays.entries()) {
    const pts = (attrOf(ray, "points") || "").trim().split(/\s+/);
    const ys = pts.filter((_, idx) => idx % 2 === 1).map(Number);
    assert.ok(Math.min(...ys.slice(0,2)) < Math.max(...ys.slice(2,4)), "ray must fan downward");
  }

  const aria = out.match(/aria-label="([^"]*)"/)?.[1] ?? "";
  assert.match(aria, /20 rays of light streaming from above/);
});

test("new age uses dedicated ray gradient and glow filter", () => {
  const out = svg();
  assert.match(out, /id="newAgeRayGrad"/);
  assert.match(out, /id="newAgeGlow"/);
});

test("all new age parts share one phase opacity", () => {
  const out = svg();
  const shared = "0.78";
  const labelStart = out.indexOf('<g class="new-age-label"');
  const label = out.slice(labelStart, out.indexOf("</g>", labelStart) + 4);
  assert.match(label, new RegExp(`opacity="${shared}"`));

  const { dark, light } = splitThemes(out);
  for (const [name, out] of Object.entries({ dark, light })) {
    const css = styleBlocks(out)[0];
    assert.ok(css.includes(".new-age-ray"), `${name}: missing ray CSS`);
    assert.ok(css.includes(".new-age-fringe"), `${name}: missing fringe CSS`);
    assert.ok(css.includes(".new-age-text"), `${name}: missing label text CSS`);
  }
  for (const [name, css] of Object.entries({ dark, light })) {
    assert.match(css, new RegExp(`\\.narrative-enlightenment\\s*\\{[^}]*opacity:\\s*${shared}`));
  }
});
