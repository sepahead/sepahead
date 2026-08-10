// scripts/chart-theme.test.mjs
// Two invariants that were previously IMPOSSIBLE to test, for different reasons:
//
//   * The dimmed next-year label's contrast is a per-THEME property. Asserting
//     the raw `opacity` literal (as an earlier test did) is theme-blind: opacity
//     composites toward the backdrop, so the same number lands at a different
//     ratio on #0d1117 than on #ffffff. A value can therefore pass on the dark
//     canvas while failing on the light one, and that is exactly what happened
//     at 0.85 (4.73:1 dark, 4.48:1 light). So compute the BLENDED ratio for each
//     themed variant instead of trusting the number.
//
//   * The grouped history bar had NO coverage at all, because its segments were
//     emitted as bare `<rect fill="...">` with no class attribute. Nothing could
//     address them: the audit regexes and heightsOfClass both look for a class,
//     so the honesty ceiling that stops nine min-inflated segments out-towering
//     a genuinely larger single year was silently untested. The segments now
//     carry class="stack-seg", which is what makes the assertions below possible.
//
// Companions: chart-svg (structure), chart-honesty (meaning), chart-clearance
// (geometry), chart-contrast (static palette). This file is the per-theme and
// stacked-bar half. Shared extraction lives in chart-test-helpers.mjs.
//
// Run: node --test scripts/*.test.mjs
import test from "node:test";
import assert from "node:assert/strict";

import { STACK_THROUGH_YEAR, buildModel, renderSVG } from "./cumulative.mjs";
import { splitThemes } from "./theme-split.mjs";
import {
  blend,
  contrastRatio,
  effectiveDeclValue,
  numAttr,
  parseHex,
  styleBlocks,
  tagsWithClass,
} from "./chart-test-helpers.mjs";

// Same two-anchor shape as the other chart fixtures: the grouped half is pinned
// to STACK_THROUGH_YEAR so a stacked bar always exists, the recent half slides
// with the clock so the in-progress branch keeps being exercised.
const GROUPED = [1, 4, 32, 19, 0, 0, 234, 61, 188];
const RECENT = [236, 1676, 2027];

function fixture(currentTotal = 4214) {
  const now = new Date().getUTCFullYear();
  const recent = [...RECENT, currentTotal];
  const firstGrouped = STACK_THROUGH_YEAR - (GROUPED.length - 1);
  const firstRecent = now - (recent.length - 1);
  assert.ok(
    firstRecent > STACK_THROUGH_YEAR,
    `fixture halves collide: recent starts ${firstRecent}, boundary ${STACK_THROUGH_YEAR}`
  );
  return [
    ...GROUPED.map((total, i) => ({ year: firstGrouped + i, total, source: "h2" })),
    ...recent.map((total, i) => ({ year: firstRecent + i, total, source: "h2" })),
  ];
}

const render = (currentTotal) => renderSVG(buildModel(fixture(currentTotal)));

// The page backdrop each themed variant is composited over. These are the two
// canvas colours the chart is served on, and they are what make the SAME opacity
// resolve to two different contrast ratios.
const BACKDROP = { dark: "#0d1117", light: "#ffffff" };

// WCAG 1.4.3 normal text. The year labels are 13px, which is below the 18.66px
// large-text threshold, so the 3:1 large-text allowance does NOT apply here.
const TEXT_MIN = 4.5;

const cssOf = (svg) => {
  const blocks = styleBlocks(svg);
  assert.equal(blocks.length, 1, "expected exactly one style block");
  return blocks[0];
};

test("the dimmed next-year label clears text contrast in BOTH themes", () => {
  const variants = splitThemes(render());
  const measured = {};

  for (const [name, out] of Object.entries(variants)) {
    const css = cssOf(out);

    // Read the values a browser would actually USE, i.e. the last declaration
    // of each. theme-split appends the unwrapped light rules after the base
    // ones, so taking the FIRST match would report the dark fill for the light
    // file and quietly measure the wrong colour.
    const fill = effectiveDeclValue(css, ".year", "fill");
    const rawOpacity = effectiveDeclValue(css, ".year-future", "opacity");

    // Guard the extraction before trusting it: a selector rename would
    // otherwise leave this test asserting over nulls and still passing.
    assert.ok(fill, `${name}: no effective .year fill found`);
    assert.ok(rawOpacity, `${name}: no effective .year-future opacity found`);
    assert.ok(parseHex(fill), `${name}: .year fill ${fill} is not parseable hex`);

    const opacity = Number(rawOpacity);
    assert.ok(
      Number.isFinite(opacity) && opacity > 0 && opacity <= 1,
      `${name}: .year-future opacity ${rawOpacity} is not a fraction`
    );

    const blended = blend(fill, BACKDROP[name], opacity);
    assert.ok(blended, `${name}: could not blend ${fill} over ${BACKDROP[name]}`);
    const ratio = contrastRatio(blended, parseHex(BACKDROP[name]));
    measured[name] = ratio;

    assert.ok(
      ratio >= TEXT_MIN,
      `${name}: dimmed year label is ${ratio.toFixed(2)}:1 against ` +
        `${BACKDROP[name]}, below the ${TEXT_MIN}:1 minimum for 13px text ` +
        `(fill ${fill} at opacity ${opacity})`
    );

    // The cue still has to READ as dimmer than its neighbours, or the
    // placeholder stops looking like a placeholder. Fixing contrast by setting
    // opacity to 1 would satisfy the bound above and silently delete the cue.
    assert.ok(
      opacity < 1,
      `${name}: .year-future must stay visibly dimmer than .year`
    );
  }

  // Both themes must be covered; a splitThemes change that collapsed the pair
  // would otherwise reduce this test to a single-variant check.
  assert.deepEqual(
    Object.keys(measured).sort(),
    ["dark", "light"],
    "expected both themed variants to be measured"
  );

  // Light is the BINDING constraint (it composites toward white, which is much
  // closer to the mid-grey label than the near-black canvas is). Recording that
  // here means a future retune checked only against dark cannot look safe.
  assert.ok(
    measured.light <= measured.dark,
    `expected light (${measured.light.toFixed(2)}:1) to be the tighter of the ` +
      `two; if dark (${measured.dark.toFixed(2)}:1) becomes tighter the palette ` +
      `changed and both bounds need rechecking`
  );
});

test("the grouped history bar cannot out-tower a larger single year", () => {
  // The regression this guards: every non-zero segment is padded up to a legible
  // minimum height so sparse early years stay visible. With the grouping now
  // running through 2022 there are nine segments rather than seven, so that
  // padding accumulates ~29% harder -- enough that an inflated 539-contribution
  // stack could render taller than a year several times its size.
  const svg = render();
  const model = buildModel(fixture());

  const segments = tagsWithClass(svg, "rect", "stack-seg").map((t) =>
    numAttr(t, "height")
  );
  assert.ok(
    segments.length > 0 && segments.every(Number.isFinite),
    `expected addressable stack segments, got ${JSON.stringify(segments)}`
  );

  // One segment per non-zero grouped year: zero years contribute no rect, so a
  // silent change in which years are grouped shows up here rather than as a
  // quietly shorter bar.
  const stackRow = model.rows.find((r) => r.isStack);
  assert.ok(stackRow, "fixture must produce a grouped history row");
  const expected = GROUPED.filter((t) => t > 0).length;
  assert.equal(
    segments.length,
    expected,
    `expected ${expected} non-zero stack segments, got ${segments.length}`
  );

  const stackHeight = segments.reduce((a, b) => a + b, 0);

  const barHeights = tagsWithClass(svg, "rect", "bar").map((t) =>
    numAttr(t, "height")
  );
  assert.ok(
    barHeights.length > 0 && barHeights.every(Number.isFinite),
    `expected measured single-year bars, got ${JSON.stringify(barHeights)}`
  );

  // Pair each single-year ROW with its rendered bar. Bars are emitted in row
  // order, so the zip is positional -- assert the counts line up first, because
  // a silent misalignment here would compare the stack against the wrong year
  // and the bound would still "pass".
  const singleRows = model.rows.filter((r) => !r.isStack && !r.isFuture);
  assert.equal(
    barHeights.length,
    singleRows.length,
    `expected one bar per single-year row: ${singleRows.length} rows but ` +
      `${barHeights.length} bars`
  );

  // Only years that genuinely BEAT the stack are relevant: a real year smaller
  // than the grouped total is allowed to render shorter, that is honest.
  const tallerHeights = singleRows
    .map((row, i) => ({ total: row.total, h: barHeights[i] }))
    .filter((b) => b.total > stackRow.total)
    .map((b) => b.h);
  assert.ok(
    tallerHeights.length > 0,
    "fixture must contain at least one year larger than the grouped total"
  );

  // The SMALLEST of those is the binding one: it is the year the inflated stack
  // is most likely to overtake. Taking the largest would make this trivially
  // satisfiable by the peak bar and assert almost nothing.
  const shortestTaller = Math.min(...tallerHeights);

  // Rank order must survive the inflation: the grouped bar stays strictly
  // shorter than the smallest year that outranks it on real data.
  assert.ok(
    stackHeight < shortestTaller,
    `grouped bar renders ${stackHeight.toFixed(1)}px (total ${stackRow.total}) ` +
      `but a larger single year renders only ${shortestTaller.toFixed(1)}px -- ` +
      `min-segment inflation has inverted the visual ranking`
  );
});
