// scripts/enlightenment.test.mjs
// Structural design contracts for combined spectral fringing + diffraction interference.
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

test("combined design: 20 rays, 40 fringe edges, 19 interference lines (center ray pure)", () => {
  const out = svg();
  assert.equal(tagsWithClass(out, "g", "narrative-enlightenment").length, 1);

  // 20 ray polygons
  const rays = tagsWithClass(out, "polygon", "new-age-ray");
  assert.equal(rays.length, 20, "expected 20 ray polygons");

  // 40 spectral fringe polygons (2 per ray)
  const fringes = tagsWithClass(out, "polygon", "new-age-fringe");
  assert.equal(fringes.length, 40, "expected 40 fringe edge polygons (2 per ray)");

  // 19 interference lines (center ray angle=90 skipped)
  const lineBlocks = [...out.matchAll(/<line[^>]*class="[^"]*\bnew-age-interference\b[^"]*"[^>]*>/g)];
  assert.equal(lineBlocks.length, 19, "expected 19 interference lines (center ray excluded)");

  // Verify center ray (angle 90°) has NO interference line
  const centerInterference = [...out.matchAll(/<line[^>]*x2="([^"]*)"[^>]*y2="([^"]*)"[^>]*class="[^"]*\bnew-age-interference\b[^"]*"[^>]*>/g)]
    .filter(m => Math.abs(parseFloat(m[2]) - parseFloat(m[1])) < 4); // nearly vertical
  assert.equal(centerInterference.length, 0, "center ray must have no interference");

  // Each fringe must have breathing stroke-opacity animation
  const fringeBlocks = [...out.matchAll(/<polygon[^>]*class="[^"]*\bnew-age-fringe\b[^"]*"[^]*?<\/polygon>/g)];
  assert.equal(fringeBlocks.length, 40, "expected 40 complete fringe polygon elements");
  for (let i = 0; i < fringeBlocks.length; i++) {
    assert.match(fringeBlocks[i][0], /attributeName="stroke-opacity"/, `fringe ${i} must animate stroke-opacity`);
  }

  // Each interference line must animate dashoffset
  const interferenceBlocks = [...out.matchAll(/<line[^>]*class="[^"]*\bnew-age-interference\b[^"]*"[^]*?<\/line>/g)];
  assert.equal(interferenceBlocks.length, 19, "expected 19 complete interference line elements");
  for (let i = 0; i < interferenceBlocks.length; i++) {
    assert.match(interferenceBlocks[i][0], /attributeName="stroke-dashoffset"/, `interference ${i} must animate dashoffset`);
  }

  // Every ray must fan downward
  for (const [i, ray] of rays.entries()) {
    const pts = (attrOf(ray, "points") || "").trim().split(/\s+/);
    const ys = pts.filter((_, idx) => idx % 2 === 1).map(Number);
    const topY = Math.min(...ys.slice(0, 2));
    const botY = Math.max(...ys.slice(2, 4));
    assert.ok(topY < botY, `ray ${i} must fan downward (top=${topY}, bottom=${botY})`);
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
  const tableauStart = out.indexOf('<g class="narrative-enlightenment">');
  const labelStart = out.indexOf('<g class="new-age-label"');
  assert.ok(tableauStart >= 0 && labelStart > tableauStart, "expected new age groups");
  const label = out.slice(labelStart, out.indexOf("</g>", labelStart) + 4);
  assert.match(label, new RegExp(`opacity="${shared}"`));

  const { dark, light } = splitThemes(out);
  for (const [name, out] of Object.entries({ dark, light })) {
    const css = styleBlocks(out)[0];
    assert.ok(css.includes(".new-age-ray"), `${name}: missing ray CSS`);
    assert.ok(css.includes(".new-age-interference"), `${name}: missing interference CSS`);
    assert.ok(css.includes(".new-age-fringe"), `${name}: missing fringe CSS`);
    assert.ok(css.includes(".new-age-text"), `${name}: missing label text CSS`);
  }

  for (const [name, css] of Object.entries({ dark, light })) {
    assert.match(
      css,
      new RegExp(`\\.narrative-enlightenment\\s*\\{[^}]*opacity:\\s*${shared}`),
      `${name}: missing shared new age opacity`
    );
  }
});
