// scripts/enlightenment.test.mjs
// Structural design contracts for the new age 20-lens phase.
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

test("new age phase has 20 lenses (40 ellipses), 8 singularity traces, and 8 sparks", () => {
  const out = svg();
  assert.equal(tagsWithClass(out, "g", "narrative-enlightenment").length, 1);

  // 20 lens-back + 20 lens-front = 40 ellipses total
  const lensBacks = tagsWithClass(out, "ellipse", "new-age-lens-back");
  const lensFronts = tagsWithClass(out, "ellipse", "new-age-lens-front");
  assert.equal(lensBacks.length, 20, "expected 20 lens-back ellipses");
  assert.equal(lensFronts.length, 20, "expected 20 lens-front ellipses");

  // 8 traces from the singularity boundary to trail/ring lenses
  const traceLines = tagsWithClass(out, "path", "new-age-trace-line");
  assert.equal(traceLines.length, 8, "expected 8 trace paths");
  const sparks = tagsWithClass(out, "circle", "new-age-spark");
  assert.equal(sparks.length, 8, "expected 8 spark particles");

  // Every lens-front must be inside the plot bounds
  for (const [i, lens] of lensFronts.entries()) {
    const cx = number(attrOf(lens, "cx"), `lens ${i} cx`);
    const cy = number(attrOf(lens, "cy"), `lens ${i} cy`);
    const rx = number(attrOf(lens, "rx"), `lens ${i} rx`);
    const ry = number(attrOf(lens, "ry"), `lens ${i} ry`);
    assert.ok(cx > 680 && cx < 800, `lens ${i} cx ${cx} must live in the upper-right`);
    assert.ok(cy >= 120 && cy <= 260, `lens ${i} cy ${cy} must stay in the plot vertical bounds`);
    assert.ok(rx >= 1.5 && rx <= 8, `lens ${i} rx ${rx} must be a reasonable lens size`);
    assert.ok(ry >= 1 && ry <= 6.5, `lens ${i} ry ${ry} must be a reasonable lens size`);
  }

  // Every back lens must be offset from its front lens
  for (let i = 0; i < 20; i++) {
    const bx = number(attrOf(lensBacks[i], "cx"), `back lens ${i} cx`);
    const by = number(attrOf(lensBacks[i], "cy"), `back lens ${i} cy`);
    const fx = number(attrOf(lensFronts[i], "cx"), `front lens ${i} cx`);
    const fy = number(attrOf(lensFronts[i], "cy"), `front lens ${i} cy`);
    assert.ok(bx !== fx || by !== fy, `lens ${i} back must be offset from front for refractive depth`);
  }

  // Trace paths must move right/up from the singularity boundary
  const futureGhosts = tagsWithClass(out, "rect", "future-ghost");
  assert.equal(futureGhosts.length, 2, "fixture must expose both future slots");
  const ghostCenters = futureGhosts.map(
    (ghost) =>
      number(attrOf(ghost, "x"), "future slot x") +
      number(attrOf(ghost, "width"), "future slot width") / 2
  );
  const slot = ghostCenters[1] - ghostCenters[0];
  assert.ok(slot > 0, "future slots must advance left-to-right");
  const boundary = ghostCenters[1] - slot / 2;

  for (const [i, path] of traceLines.entries()) {
    const d = attrOf(path, "d");
    assert.match(d, /^M /, `trace ${i} must have a path`);
    const nums = [...d.matchAll(/-?[\d.]+/g)].map((m) => Number(m[0]));
    assert.ok(nums[0] < nums[nums.length - 2], `trace ${i} must move right toward the lens aperture`);
    // Launch from near the singularity boundary
    assert.ok(
      Math.abs(nums[0] - (boundary + 4)) < 0.15,
      `trace ${i} must launch from the future-slot boundary`
    );
  }

  const aria = out.match(/aria-label="([^"]*)"/)?.[1] ?? "";
  assert.match(aria, /20-lens compound-eye aperture with singularity traces/);
});

test("new age uses dedicated lens and trace gradients", () => {
  const out = svg();
  assert.match(out, /id="newAgeLensGrad"/);
  assert.match(out, /id="newAgeTraceGrad"/);
  assert.match(out, /id="newAgeGlow"/);
});

test("all new age parts share one phase opacity", () => {
  const out = svg();
  const shared = "0.52";
  const tableauStart = out.indexOf('<g class="narrative-enlightenment">');
  const labelStart = out.indexOf('<g class="enlightenment-label"');
  assert.ok(tableauStart >= 0 && labelStart > tableauStart, "expected new age groups");
  const tableau = out.slice(tableauStart, labelStart);
  assert.doesNotMatch(
    tableau,
    /(?:opacity|fill-opacity|stroke-opacity)=|attributeName="(?:opacity|stroke-opacity|fill-opacity)"/,
    "new age parts must inherit one shared opacity rather than pulsing independently"
  );
  const label = out.slice(labelStart, out.indexOf("</g>", labelStart) + 4);
  assert.match(label, new RegExp(`opacity="${shared}"`));

  const { dark, light } = splitThemes(out);
  for (const [name, out] of Object.entries({ dark, light })) {
    const css = styleBlocks(out)[0];
    assert.ok(css.includes(".new-age-lens-front"), `${name}: missing lens-front CSS`);
    assert.ok(css.includes(".new-age-lens-back"), `${name}: missing lens-back CSS`);
    assert.ok(css.includes(".new-age-trace-line"), `${name}: missing trace-line CSS`);
    assert.ok(css.includes(".new-age-spark"), `${name}: missing spark CSS`);
    assert.ok(css.includes(".enlightenment-text"), `${name}: missing label CSS`);
    assert.ok(css.includes("animate, animateTransform { display: none; }"), `${name}: missing reduced-motion rule`);
  }
  const lightCss = styleBlocks(light)[0];
  assert.ok(declarationsOf(lightCss, ".new-age-lens-front").length >= 1);
  assert.ok(lightCss.includes("newAgeLensGradLight"));

  for (const [name, css] of Object.entries({ dark, light })) {
    const reducedMotion = css.match(/@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n    \}/)?.[1] ?? "";
    assert.doesNotMatch(
      reducedMotion,
      /\.new-age-[^{]+\s*\{[^}]*\b(?:opacity|fill-opacity|stroke-opacity)\s*:/,
      `${name}: reduced motion must not add a child opacity that compounds the shared parent opacity`
    );
    assert.match(
      css,
      new RegExp(`\\.narrative-enlightenment\\s*\\{[^}]*opacity:\\s*${shared}`),
      `${name}: missing shared new age opacity`
    );
  }
  for (const [name, css] of Object.entries({ dark, light })) {
    for (const selector of [
      "new-age-lens-back",
      "new-age-lens-front",
      "new-age-trace-line",
      "new-age-spark",
    ]) {
      const rule = css.match(new RegExp(`\\.${selector}\\s*\\{([^}]*)\\}`))?.[1] ?? "";
      assert.doesNotMatch(
        rule,
        /(?:^|;)\s*(?:opacity|fill-opacity|stroke-opacity)\s*:/,
        `${name}: ${selector} must inherit the shared new age opacity`
      );
    }
  }
});
