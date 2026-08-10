// scripts/chart-contrast.test.mjs
// Contrast invariants for the chart's two dashed cues: the in-progress bar cap
// and the next-year runway outline.
//
// WHY THIS FILE EXISTS. Mutation testing found this gap: swapping
// `.bar-cap { stroke: #0d1117 }` for the teal `#0e7490` it replaced left the
// ENTIRE suite green. The teal measures about 2.96:1 against the bar it is
// drawn on -- a shade under the 3:1 WCAG 1.4.11 minimum for non-text -- so the
// cue was allowed to regress into near-invisibility with no test objecting.
//
// The assertions here are RATIOS, not hex literals. Pinning the exact colour
// would catch this one mutation while saying nothing about intent, and would
// fire on any harmless restyle. Computing the ratio states the actual
// requirement, so any low-contrast colour fails and any legible one passes.
//
// Every check runs against the combined render AND both splitThemes outputs.
// The two written variants are what GitHub actually serves, and this suite has
// already been bitten once by a defect that existed only after the split -- so
// the light variant is covered explicitly rather than by inference.
//
// Run: node --test scripts/*.test.mjs
import test from "node:test";
import assert from "node:assert/strict";

import { STACK_THROUGH_YEAR, buildModel, renderSVG } from "./cumulative.mjs";
import { splitThemes } from "./theme-split.mjs";
import {
  attrOf,
  declValues,
  declarationsOf,
  styleBlocks,
  tags,
  tagsWithClass,
} from "./chart-test-helpers.mjs";

// The two page backgrounds this chart is designed to sit on (GitHub's dark and
// light canvases). They are not invented here: they are the same values the
// file's own text legibility halos use, which is how the generator declares
// "this is the colour behind me". A cue with ONE theme-invariant colour has to
// remain legible on both, so both are checked.
const PAGE_DARK = "#0d1117";
const PAGE_LIGHT = "#ffffff";

// WCAG 1.4.11: user interface components and graphical objects need 3:1.
const NON_TEXT_MIN = 3;

// Two anchors, same split as the other chart fixtures: the grouped half is
// pinned to STACK_THROUGH_YEAR so a stacked bar always exists, the recent half
// slides with the clock so the in-progress branch keeps being exercised. The
// current year is deliberately large so its bar clears BAR_CAP_MIN_H and the
// cap is actually emitted -- otherwise the CSS rule under test would be dead.
function chartSVG() {
  const now = new Date().getUTCFullYear();
  const grouped = [1, 4, 32, 19, 0, 0, 234, 61, 188];
  const recent = [236, 1676, 2027, 6240];
  const firstGrouped = STACK_THROUGH_YEAR - (grouped.length - 1);
  const firstRecent = now - (recent.length - 1);
  assert.ok(
    firstRecent > STACK_THROUGH_YEAR,
    `fixture halves collide: recent years start at ${firstRecent}, not after ${STACK_THROUGH_YEAR}`
  );

  const years = [
    ...grouped.map((total, i) => ({ year: firstGrouped + i, total, source: "h2" })),
    ...recent.map((total, i) => ({ year: firstRecent + i, total, source: "h2" })),
  ];
  return renderSVG(buildModel(years));
}

// ---------------------------------------------------------------------------
// Colour maths (WCAG 2.x). Local and dependency-free; ~20 lines is cheaper than
// reaching into accessibility.test.mjs for internals it does not export. The
// shared chart-test-helpers module also exports parseHex/luminance/contrastRatio,
// but this file keeps its string-facing copy because the self-check deliberately
// requires null for malformed colours and identical 3-/6-digit luminance results;
// adapting every call site would weaken that test's contract rather than remove
// meaningful duplication.
// ---------------------------------------------------------------------------

const HEX = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i;

function hexToRgb(value) {
  const m = HEX.exec(String(value).trim());
  if (!m) return null;
  const h = m[1].length === 3 ? m[1].replace(/./g, (c) => c + c) : m[1];
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}

function luminance(value) {
  const rgb = hexToRgb(value);
  if (!rgb) return null;
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// Null when either colour is unparseable, so callers can fail loudly on a bad
// extraction instead of silently comparing NaN and passing.
function contrast(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  if (la === null || lb === null) return null;
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

const ratio = (n) => (n === null ? "unparseable" : `${n.toFixed(2)}:1`);

// ---------------------------------------------------------------------------
// Extraction
// ---------------------------------------------------------------------------

// Stops of one gradient, scoped to that element so neighbouring gradients in
// defs cannot leak in. Returns [] when the id is absent, which callers turn
// into a loud failure.
function gradientStops(svg, id) {
  const block = new RegExp(
    `<linearGradient id="${id}"[^>]*>([\\s\\S]*?)</linearGradient>`
  ).exec(svg);
  if (!block) return [];
  return tags(block[1], "stop")
    .map((t) => ({ offset: attrOf(t, "offset"), color: attrOf(t, "stop-color") }))
    .filter((s) => s.color !== null);
}

// The combined render plus both written variants.
function variants() {
  const combined = chartSVG();
  const { dark, light } = splitThemes(combined);
  return [
    ["combined", combined],
    ["dark", dark],
    ["light", light],
  ];
}

// Sole style block of a variant. Asserted as EXACTLY one: theme-split.mjs
// unwraps a single light block, so a second block is a real failure mode.
function cssOf(name, svg) {
  const blocks = styleBlocks(svg);
  assert.equal(blocks.length, 1, `${name}: expected exactly one style block`);
  return blocks[0];
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test("the in-progress cap stays legible against the bar it notches", () => {
  // The cap is stroked in the PAGE BACKGROUND colour on purpose, so its dashes
  // read as notches eroding an unfinished top edge rather than as decoration
  // sitting on top of one. That is why the backdrop measured here is the BAR
  // and never the page: against the page the cap is 1:1 by design, invisible,
  // which is the whole effect. Background-coloured strokes are already this
  // file's convention -- the text legibility halos work the same way.
  for (const [name, svg] of variants()) {
    const css = cssOf(name, svg);

    // The rule must not be dead CSS: the element has to exist for the fixture's
    // tall in-progress bar.
    assert.equal(
      tagsWithClass(svg, "line", "bar-cap").length,
      1,
      `${name}: expected exactly one bar-cap element`
    );

    // Derive the backdrop from the code rather than assuming a gradient id, so
    // renaming or repointing the bar fill cannot leave this test measuring
    // against a colour the bars no longer use.
    const barDecls = declarationsOf(css, ".bar");
    assert.equal(
      barDecls.length,
      1,
      `${name}: .bar must be declared exactly once -- a single theme-invariant ` +
        `cap colour is only justified while the bar's own colour is invariant`
    );
    const fills = declValues(barDecls, "fill");
    assert.equal(fills.length, 1, `${name}: expected one .bar fill, got ${fills.length}`);
    const ref = /^url\(#([^)]+)\)$/.exec(fills[0]);
    assert.ok(ref, `${name}: .bar fill must reference a gradient, got ${fills[0]}`);

    const stops = gradientStops(svg, ref[1]);
    assert.ok(
      stops.length >= 2,
      `${name}: gradient ${ref[1]} must expose its stops, found ${stops.length}`
    );
    // The cap sits on the bar's TOP edge, so the 0% stop is the backdrop it is
    // actually measured against. Checking the bottom stop as well would be
    // over-constraining: the cap never touches it.
    const top = stops.find((s) => s.offset === "0%") ?? stops[0];

    const strokes = declValues(declarationsOf(css, ".bar-cap"), "stroke");
    assert.ok(
      strokes.length >= 1,
      `${name}: found no .bar-cap stroke -- extraction matched nothing, which ` +
        `would make this assertion vacuous`
    );
    for (const stroke of strokes) {
      const c = contrast(stroke, top.color);
      assert.ok(
        c !== null && c >= NON_TEXT_MIN,
        `${name}: bar-cap ${stroke} on ${top.color} measures ${ratio(c)}, ` +
          `below the ${NON_TEXT_MIN}:1 WCAG 1.4.11 minimum for non-text`
      );
    }
  }
});

test("the runway outline stays legible on both page backgrounds", () => {
  // The runway is a single theme-invariant colour with no light override, which
  // is only sound if one value clears BOTH canvases. The value it replaced
  // (#30363d) measured about 1.55:1 on dark, so the empty slot was effectively
  // invisible -- this catches a revert to that class of colour too.
  for (const [name, svg] of variants()) {
    const css = cssOf(name, svg);

    assert.equal(
      tagsWithClass(svg, "rect", "future-ghost").length,
      1,
      `${name}: expected exactly one future-ghost element`
    );

    const strokes = declValues(declarationsOf(css, ".future-ghost"), "stroke");
    assert.ok(
      strokes.length >= 1,
      `${name}: found no .future-ghost stroke -- extraction matched nothing`
    );
    for (const stroke of strokes) {
      for (const page of [PAGE_DARK, PAGE_LIGHT]) {
        const c = contrast(stroke, page);
        assert.ok(
          c !== null && c >= NON_TEXT_MIN,
          `${name}: future-ghost ${stroke} on ${page} measures ${ratio(c)}, ` +
            `below the ${NON_TEXT_MIN}:1 minimum -- a single theme-invariant ` +
            `stroke has to clear both canvases`
        );
      }
    }
  }
});

test("the contrast maths agrees with the values that motivated these bounds", () => {
  // Self-check on the helper itself. Without this, a broken luminance formula
  // could return a large number for everything and both tests above would pass
  // while asserting nothing -- the same vacuity trap the rest of the suite
  // guards against, one level down.
  const cases = [
    ["#0d1117", "#22d3ee", 10.47], // shipped cap on the bar: ample
    ["#0e7490", "#22d3ee", 2.96], // the teal it replaced: under 3:1
    ["#6e7681", "#0d1117", 4.12], // runway on the dark canvas
    ["#6e7681", "#ffffff", 4.59], // runway on the light canvas
    ["#30363d", "#0d1117", 1.55], // the near-invisible original runway
  ];
  for (const [a, b, expected] of cases) {
    const c = contrast(a, b);
    assert.ok(c !== null, `contrast(${a}, ${b}) must be computable`);
    assert.ok(
      Math.abs(c - expected) < 0.05,
      `contrast(${a}, ${b}) = ${ratio(c)}, expected about ${expected}:1`
    );
  }
  assert.equal(contrast("not-a-colour", "#0d1117"), null);
  // 3-digit hex must fold to the same colour as its 6-digit form.
  assert.equal(luminance("#fff"), luminance("#ffffff"));
});
