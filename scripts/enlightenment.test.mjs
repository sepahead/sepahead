// scripts/enlightenment.test.mjs
// Structural design contracts for the new age 20-rays phase with diffraction interference bands.
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

test("new age phase has 20 rays, 20 diffraction interference lines", () => {
  const out = svg();
  assert.equal(tagsWithClass(out, "g", "narrative-enlightenment").length, 1);

  // 20 ray polygons
  const rays = tagsWithClass(out, "polygon", "new-age-ray");
  assert.equal(rays.length, 20, "expected 20 ray polygons");

  // 20 interference lines
  const lines = tagsWithClass(out, "line", "new-age-interference");
  assert.equal(lines.length, 20, "expected 20 interference lines");

  // Each interference line must have dasharray + animated dashoffset
  // tagsWithClass only returns opening tags, so use raw SVG matching
  const lineBlocks = [...out.matchAll(/<line[^>]*class="[^"]*\bnew-age-interference\b[^"]*"[\s\S]*?<\/line>/g)];
  assert.equal(lineBlocks.length, 20, "expected 20 complete interference line elements");
  for (let i = 0; i < lineBlocks.length; i++) {
    const l = lineBlocks[i][0];
    assert.match(l, /stroke-dasharray="5 4"/, `line ${i} must have 5-4 dash pattern`);
    assert.match(l, /attributeName="stroke-dashoffset"/, `line ${i} must animate dashoffset`);
  }

  // Every ray must fan downward (from top source toward bottom)
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
    assert.ok(css.includes(".new-age-text"), `${name}: missing label text CSS`);
  }
  const lightCss = styleBlocks(light)[0];
  assert.ok(lightCss.includes("newAgeRayGradLight"));

  for (const [name, css] of Object.entries({ dark, light })) {
    assert.match(
      css,
      new RegExp(`\\.narrative-enlightenment\\s*\\{[^}]*opacity:\\s*${shared}`),
      `${name}: missing shared new age opacity`
    );
  }
  // Interference lines set their own stroke-opacity (brightness of bands).
  // Rays must not animate opacity independently — they inherit the phase opacity.
  for (const [name, css] of Object.entries({ dark, light })) {
    const rule = css.match(/\.new-age-ray\s*\{([^}]*)\}/)?.[1] ?? "";
    assert.doesNotMatch(
      rule,
      /(?:^|;)\s*opacity\s*:/,
      `${name}: new-age-ray must not set its own opacity`
    );
  }
});
