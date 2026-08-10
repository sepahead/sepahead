// scripts/enlightenment.test.mjs
// Structural design contracts for the new age 20-rays phase with liquid droplets.
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

test("new age phase has 20 rays, 20 liquid droplets with pulsating animations", () => {
  const out = svg();
  assert.equal(tagsWithClass(out, "g", "narrative-enlightenment").length, 1);

  // 20 ray polygons
  const rays = tagsWithClass(out, "polygon", "new-age-ray");
  assert.equal(rays.length, 20, "expected 20 ray polygons");

  // 20 liquid droplet ellipses (one per ray)
  const droplets = tagsWithClass(out, "ellipse", "new-age-droplet");
  assert.equal(droplets.length, 20, "expected 20 liquid droplets");

  // 20 liquid droplet groups with propagation animation
  const liquidGroups = tagsWithClass(out, "g", "new-age-liquid");
  assert.equal(liquidGroups.length, 20, "expected 20 liquid droplet groups");

  // Each droplet must pulsate (opacity + ry animations within the ellipse)
  // tagsWithClass only returns opening tags, so use raw SVG matching
  const dropletBlocks = [...out.matchAll(/<ellipse[^>]*class="[^"]*\bnew-age-droplet\b[^"]*"[\s\S]*?<\/ellipse>/g)];
  assert.equal(dropletBlocks.length, 20, "expected 20 complete droplet ellipse elements");
  for (let i = 0; i < dropletBlocks.length; i++) {
    const d = dropletBlocks[i][0];
    assert.match(d, /attributeName="opacity"/, `droplet ${i} must pulse opacity`);
    assert.match(d, /attributeName="ry"/, `droplet ${i} must breathe in size`);
  }

  // Each liquid group must have a translate animation (propagation)
  const liquidBlocks = [...out.matchAll(/<g class="new-age-liquid">[\s\S]*?<\/g>/g)];
  assert.equal(liquidBlocks.length, 20, "expected 20 complete liquid group elements");
  for (let i = 0; i < liquidBlocks.length; i++) {
    assert.match(liquidBlocks[i][0], /animateTransform/, `liquid group ${i} must have translate animation`);
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

test("new age uses dedicated ray, liquid, and glow definitions", () => {
  const out = svg();
  assert.match(out, /id="newAgeRayGrad"/);
  assert.match(out, /id="newAgeLiquidGrad"/);
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
    assert.ok(css.includes(".new-age-droplet"), `${name}: missing droplet CSS`);
    assert.ok(css.includes(".new-age-liquid"), `${name}: missing liquid group CSS`);
    assert.ok(css.includes(".new-age-text"), `${name}: missing label text CSS`);
  }
  const lightCss = styleBlocks(light)[0];
  assert.ok(lightCss.includes("newAgeRayGradLight"));
  assert.ok(lightCss.includes("newAgeLiquidGradLight"));

  for (const [name, css] of Object.entries({ dark, light })) {
    assert.match(
      css,
      new RegExp(`\\.narrative-enlightenment\\s*\\{[^}]*opacity:\\s*${shared}`),
      `${name}: missing shared new age opacity`
    );
  }
  // Liquid droplets intentionally animate their own opacity (vibrating effect).
  // Rays must not animate opacity independently — they inherit the phase opacity.
  for (const [name, css] of Object.entries({ dark, light })) {
    for (const selector of ["new-age-ray"]) {
      const rule = css.match(new RegExp(`\\.${selector}\\s*\\{([^}]*)\\}`))?.[1] ?? "";
      assert.doesNotMatch(
        rule,
        /(?:^|;)\s*(?:opacity|fill-opacity|stroke-opacity)\s*:/,
        `${name}: ${selector} must inherit the shared new age opacity`
      );
    }
  }
});
