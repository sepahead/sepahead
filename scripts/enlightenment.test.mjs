// scripts/enlightenment.test.mjs
// Structural design contracts for the new age 20-rays phase with terraforming seeds.
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

test("new age phase has 20 rays, 12 terraforming seeds with bloom rings", () => {
  const out = svg();
  assert.equal(tagsWithClass(out, "g", "narrative-enlightenment").length, 1);

  // 20 ray polygons
  const rays = tagsWithClass(out, "polygon", "new-age-ray");
  assert.equal(rays.length, 20, "expected 20 ray polygons");

  // 12 terraforming seed cores (raw count from SVG since tagsWithClass strips children)
  const seedMatches = [...out.matchAll(/<circle[^>]*class="[^"]*\bnew-age-seed-core\b[^"]*"[^>]*>/g)];
  assert.equal(seedMatches.length, 12, "expected 12 seed cores");

  // 12 bloom rings
  const blooms = tagsWithClass(out, "circle", "new-age-bloom");
  assert.equal(blooms.length, 12, "expected 12 bloom rings");

  // Every bloom ring must be positioned at a ray destination
  for (const [i, bloom] of blooms.entries()) {
    const cx = number(attrOf(bloom, "cx"), `bloom ${i} cx`);
    const cy = number(attrOf(bloom, "cy"), `bloom ${i} cy`);
    assert.ok(cx > 690 && cx < 800, `bloom ${i} cx=${cx} must be in the new age zone`);
    assert.ok(cy >= 120 && cy <= 260, `bloom ${i} cy=${cy} must stay in plot bounds`);
  }

  // Each seed core must have translate + radius animation nearby
  for (let i = 0; i < seedMatches.length; i++) {
    const pos = seedMatches[i].index;
    const nearby = out.slice(pos, pos + 350);
    assert.match(nearby, /animateTransform/, `seed ${i} must have translate animation`);
    assert.match(nearby, /attributeName="r"/, `seed ${i} must pulse in size (terraforming bloom)`);
  }

  // Every ray must fan downward (from top source toward bottom)
  for (const [i, ray] of rays.entries()) {
    const pts = (attrOf(ray, "points") || "").trim().split(/\s+/);
    const ys = pts.filter((_, idx) => idx % 2 === 1).map(Number);
    const topY = Math.min(...ys.slice(0, 2));   // source edge (top)
    const botY = Math.max(...ys.slice(2, 4));   // destination edge (bottom)
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
  const shared = "0.65";
  const tableauStart = out.indexOf('<g class="narrative-enlightenment">');
  const labelStart = out.indexOf('<g class="new-age-label"');
  assert.ok(tableauStart >= 0 && labelStart > tableauStart, "expected new age groups");
  const tableau = out.slice(tableauStart, labelStart);
  // Bloom rings intentionally animate their own opacity (expand-and-fade).
  // All other new-age elements must not animate opacity independently.
  const tableauWithoutBlooms = tableau.replace(/<circle[^>]*class="[^"]*new-age-bloom[^"]*"[^>]*>[\s\S]*?<\/circle>/g, "");
  assert.doesNotMatch(
    tableauWithoutBlooms,
    /attributeName="(?:opacity|stroke-opacity|fill-opacity)"/,
    "new age parts (excluding bloom rings) must not animate opacity independently"
  );
  const label = out.slice(labelStart, out.indexOf("</g>", labelStart) + 4);
  assert.match(label, new RegExp(`opacity="${shared}"`));

  const { dark, light } = splitThemes(out);
  for (const [name, out] of Object.entries({ dark, light })) {
    const css = styleBlocks(out)[0];
    assert.ok(css.includes(".new-age-ray"), `${name}: missing ray CSS`);
    assert.ok(css.includes(".new-age-seed-core"), `${name}: missing seed core CSS`);
    assert.ok(css.includes(".new-age-bloom"), `${name}: missing bloom CSS`);
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
  for (const [name, css] of Object.entries({ dark, light })) {
    for (const selector of ["new-age-ray", "new-age-seed-core", "new-age-bloom"]) {
      const rule = css.match(new RegExp(`\\.${selector}\\s*\\{([^}]*)\\}`))?.[1] ?? "";
      assert.doesNotMatch(
        rule,
        /(?:^|;)\s*(?:opacity|fill-opacity|stroke-opacity)\s*:/,
        `${name}: ${selector} must inherit the shared new age opacity`
      );
    }
  }
});
