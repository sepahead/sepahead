// scripts/enlightenment.test.mjs
// Structural design contracts for the new age 20-rays phase.
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

test("new age phase has 20 light rays fanning from the singularity", () => {
  const out = svg();
  assert.equal(tagsWithClass(out, "g", "narrative-enlightenment").length, 1);

  // 20 ray polygons
  const rays = tagsWithClass(out, "polygon", "new-age-ray");
  assert.equal(rays.length, 20, "expected 20 ray polygons");

  // 10 spark motes (use raw match since tags helper only captures opening tags)
  const sparkMatches = [...out.matchAll(/<circle[^>]*class="[^"]*\bnew-age-spark\b[^"]*"[^>]*>/g)];
  assert.equal(sparkMatches.length, 10, "expected 10 spark motes");

  // Verify spark animation: each spark tag must be followed by an animateTransform
  for (let i = 0; i < sparkMatches.length; i++) {
    const idx = sparkMatches[i].index;
    const nearby = out.slice(idx, idx + 200);
    assert.match(nearby, /<animateTransform[^>]*values="0 0;[\d.]+ [\d.-]+"/, `spark ${i} must have translate animation`);
  }

  // Every ray must be inside the plot bounds
  for (const [i, ray] of rays.entries()) {
    const pts = (attrOf(ray, "points") || "").trim().split(/\s+/);
    assert.ok(pts.length >= 8, `ray ${i} must have at least 4 points`);
    for (let j = 0; j < pts.length; j += 2) {
      const px = number(pts[j], `ray ${i} point ${j} x`);
      const py = number(pts[j + 1], `ray ${i} point ${j + 1} y`);
      assert.ok(px > 680 && px < 800, `ray ${i} point ${j/2} x=${px} must stay in plot`);
      assert.ok(py >= 120 && py <= 260, `ray ${i} point ${j/2} y=${py} must stay in plot`);
    }
    const xs = pts.filter((_, idx) => idx % 2 === 0).map(Number);
    const leftX = Math.min(...xs.slice(0, 2));
    const rightX = Math.max(...xs.slice(2, 4));
    assert.ok(leftX < rightX, `ray ${i} must fan rightward`);
  }

  const aria = out.match(/aria-label="([^"]*)"/)?.[1] ?? "";
  assert.match(aria, /20 rays of light fanning from the singularity/);
});

test("new age uses dedicated ray gradient and glow filter", () => {
  const out = svg();
  assert.match(out, /id="newAgeRayGrad"/);
  assert.match(out, /id="newAgeGlow"/);
});

test("all new age parts share one phase opacity", () => {
  const out = svg();
  const shared = "0.52";
  const tableauStart = out.indexOf('<g class="narrative-enlightenment">');
  const labelStart = out.indexOf('<g class="new-age-label"');
  assert.ok(tableauStart >= 0 && labelStart > tableauStart, "expected new age groups");
  const tableau = out.slice(tableauStart, labelStart);
  assert.doesNotMatch(
    tableau,
    /attributeName="(?:opacity|stroke-opacity|fill-opacity)"/,
    "new age parts must not animate opacity independently"
  );
  const label = out.slice(labelStart, out.indexOf("</g>", labelStart) + 4);
  assert.match(label, new RegExp(`opacity="${shared}"`));

  const { dark, light } = splitThemes(out);
  for (const [name, out] of Object.entries({ dark, light })) {
    const css = styleBlocks(out)[0];
    assert.ok(css.includes(".new-age-ray"), `${name}: missing ray CSS`);
    assert.ok(css.includes(".new-age-spark"), `${name}: missing spark CSS`);
    assert.ok(css.includes(".new-age-text"), `${name}: missing label text CSS`);
    assert.ok(css.includes("animate, animateTransform { display: none; }"), `${name}: missing reduced-motion rule`);
  }
  const lightCss = styleBlocks(light)[0];
  assert.ok(declarationsOf(lightCss, ".new-age-ray").length >= 1);
  assert.ok(lightCss.includes("newAgeRayGradLight"));

  for (const [name, css] of Object.entries({ dark, light })) {
    const reducedMotion = css.match(/@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n    \}/)?.[1] ?? "";
    assert.doesNotMatch(
      reducedMotion,
      /\.new-age-[^{]+\s*\{[^}]*\b(?:opacity|fill-opacity|stroke-opacity)\s*:/,
      `${name}: reduced motion must not add a child opacity`
    );
    assert.match(
      css,
      new RegExp(`\\.narrative-enlightenment\\s*\\{[^}]*opacity:\\s*${shared}`),
      `${name}: missing shared new age opacity`
    );
  }
  for (const [name, css] of Object.entries({ dark, light })) {
    for (const selector of ["new-age-ray", "new-age-spark"]) {
      const rule = css.match(new RegExp(`\\.${selector}\\s*\\{([^}]*)\\}`))?.[1] ?? "";
      assert.doesNotMatch(
        rule,
        /(?:^|;)\s*(?:opacity|fill-opacity|stroke-opacity)\s*:/,
        `${name}: ${selector} must inherit the shared new age opacity`
      );
    }
  }
});
