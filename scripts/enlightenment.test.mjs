// scripts/enlightenment.test.mjs
// Spectral fringing on all rays + interference bands on wing rays only. Rays fan rightward from the portal.
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

test("winged design: 20 rays, 40 fringe edges, 15 interference lines (central 5 pure)", () => {
  const out = svg();
  assert.equal(tagsWithClass(out, "g", "narrative-enlightenment").length, 1);

  const rays = tagsWithClass(out, "polygon", "golden-age-ray");
  assert.equal(rays.length, 20);

  const fringes = tagsWithClass(out, "polygon", "golden-age-fringe");
  assert.equal(fringes.length, 40);

  // 15 interference lines (20 total - 5 central core angles -2..2)
  const lineBlocks = [...out.matchAll(/<line[^>]*class="[^"]*\bgolden-age-interference\b[^"]*"[^>]*>/g)];
  assert.equal(lineBlocks.length, 15, "expected 15 interference lines on wings");

  const interferenceBlocks = [...out.matchAll(/<line[^>]*class="[^"]*\bgolden-age-interference\b[^"]*"[^]*?<\/line>/g)];
  for (let i = 0; i < interferenceBlocks.length; i++) {
    assert.match(interferenceBlocks[i][0], /stroke-dashoffset/, "interference must animate");
  }

  const fringeBlocks = [...out.matchAll(/<polygon[^>]*class="[^"]*\bgolden-age-fringe\b[^"]*"[^]*?<\/polygon>/g)];
  for (let i = 0; i < fringeBlocks.length; i++) {
    assert.match(fringeBlocks[i][0], /repeatCount="indefinite"/, "fringe must repeat indefinitely");
  }

  for (const [i, ray] of rays.entries()) {
    const pts = (attrOf(ray, "points") || "").trim().split(/\s+/);
    const ys = pts.filter((_, idx) => idx % 2 === 1).map(Number);
    const xs = pts.filter((_, idx) => idx % 2 === 0).map(Number);
    assert.ok(xs[0] < xs[2], "ray must fan rightward from portal");
  }

  const aria = out.match(/aria-label="([^"]*)"/)?.[1] ?? "";
  assert.match(aria, /20 rays/);
});

test("golden age uses dedicated ray gradient and glow filter", () => {
  const out = svg();
  assert.match(out, /id="goldenAgeRayGrad"/);
  assert.match(out, /id="goldenAgeGlow"/);
});

test("all golden age parts share one phase opacity", () => {
  const out = svg();
  const shared = "1";
  const labelStart = out.indexOf('<g class="golden-age-label"');
  const label = out.slice(labelStart, out.indexOf("</g>", labelStart) + 4);
  assert.match(label, new RegExp(`opacity="${shared}"`));

  const { dark, light } = splitThemes(out);
  for (const [name, out] of Object.entries({ dark, light })) {
    const css = styleBlocks(out)[0];
    assert.ok(css.includes(".golden-age-ray"), `${name}: missing ray CSS`);
    assert.ok(css.includes(".golden-age-fringe"), `${name}: missing fringe CSS`);
    assert.ok(css.includes(".golden-age-interference"), `${name}: missing interference CSS`);
    assert.ok(css.includes(".golden-age-text"), `${name}: missing label text CSS`);
  }
  for (const [name, css] of Object.entries({ dark, light })) {
    assert.match(css, new RegExp(`\\.narrative-enlightenment\\s*\\{[^}]*opacity:\\s*${shared}`));
  }
});
