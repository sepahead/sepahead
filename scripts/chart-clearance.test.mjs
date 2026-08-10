// scripts/chart-clearance.test.mjs
// Geometry and legibility bounds for the annual contribution chart that are
// reserved-space invariants rather than data facts: nothing may intrude into
// the band kept clear above the bars, and the two dimmed cues must stay
// readable.
//
// Every test here exists because MUTATION TESTING proved the invariant was
// unguarded -- reverting the product fix left the suite green:
//
//   * reverting `CUM_TOP = BAR_CEILING` to `PLOT_TOP + 10` -> still green,
//     because the curve check was extracting ZERO coordinates and asserting
//     over an empty set;
//   * reverting `.year-future` opacity 0.85 to 0.45 -> still green, because
//     nothing asserted the placeholder label's contrast at all.
//
// So the guards below assert a MINIMUM MATCH COUNT before asserting any value.
// A regex that stops matching must fail loudly, not pass quietly. Extraction
// itself lives in chart-test-helpers.mjs; see that file's header for the rules.
//
// Run: node --test scripts/*.test.mjs
import test from "node:test";
import assert from "node:assert/strict";

import {
  BAR_CEILING,
  GHOST_MAX_H,
  STACK_THROUGH_YEAR,
  buildModel,
  renderSVG,
} from "./cumulative.mjs";
import {
  attrOf,
  soleDeclValue,
  declarationsOf,
  numAttr,
  pathYs,
  styleBlocks,
  tagsWithClass,
} from "./chart-test-helpers.mjs";

// Two anchors, same reasoning as the honesty suite's fixture: the grouped years
// are PINNED relative to STACK_THROUGH_YEAR so a stacked bar always exists, and
// the recent years SLIDE with the clock so the in-progress and next-year
// placeholder branches keep being exercised after every rollover.
const GROUPED_TOTALS = [1, 4, 32, 19, 0, 0, 234, 61, 188];
const RECENT_TOTALS = [236, 1676, 2027, 6240];

function fixture() {
  const now = new Date().getUTCFullYear();
  const firstGrouped = STACK_THROUGH_YEAR - (GROUPED_TOTALS.length - 1);
  const firstRecent = now - (RECENT_TOTALS.length - 1);
  assert.ok(
    firstRecent > STACK_THROUGH_YEAR,
    `fixture halves collide: recent years start at ${firstRecent}, not after the grouping boundary ${STACK_THROUGH_YEAR}`
  );
  return [
    ...GROUPED_TOTALS.map((total, i) => ({
      year: firstGrouped + i,
      total,
      source: "h2",
    })),
    ...RECENT_TOTALS.map((total, i) => ({
      year: firstRecent + i,
      total,
      source: "h2",
    })),
  ];
}

const render = () => renderSVG(buildModel(fixture()));

// Cubic control points may sit a hair above the endpoints they smooth between,
// so the whole-path bound carries a couple of pixels of slack while the end
// dot -- a real endpoint -- is checked exactly. The slack cannot mask the
// regression this guards: the reverted CUM_TOP lands 16px above BAR_CEILING.
const SPLINE_SLACK = 2;

test("the cumulative curve stays out of the reserved label band", () => {
  // The bars are clamped out of the band, but the curve is on its OWN scale, so
  // clamping the bars never constrained it. Before CUM_TOP was derived from
  // BAR_CEILING the crest and its pulsing end dot could pass straight through
  // the right-most value labels: the band was reserved against bars only.
  const svg = render();

  const lines = tagsWithClass(svg, "path", "cum-line");
  assert.equal(lines.length, 1, "expected exactly one cum-line path");
  const d = attrOf(lines[0], "d");
  assert.ok(d, "cum-line must carry a d attribute");

  // Non-vacuity guard. This is the most important line in the file: without it
  // a markup change silently reduces the assertion below to a no-op over an
  // empty array, which is how this invariant went unguarded in the first place.
  const ys = pathYs(d);
  assert.ok(
    ys.length >= 4,
    `curve must yield several Y coordinates, parsed ${ys.length} from ${d.slice(0, 80)}`
  );

  const crest = Math.min(...ys);
  assert.ok(
    crest >= BAR_CEILING - SPLINE_SLACK,
    `curve crest ${crest} must not rise above the reserved band at BAR_CEILING ${BAR_CEILING}`
  );

  const dots = tagsWithClass(svg, "circle", "cum-dot");
  assert.equal(dots.length, 1, "expected exactly one cum-dot");
  const cy = numAttr(dots[0], "cy");
  assert.ok(Number.isFinite(cy), `cum-dot needs a numeric cy, got ${cy}`);
  // The final measured row is the running total's maximum, so this endpoint
  // lands exactly on CUM_TOP -- the tightest available check on the bound.
  assert.ok(
    cy >= BAR_CEILING,
    `curve end dot ${cy} must not rise above BAR_CEILING ${BAR_CEILING}`
  );
});

test("the placeholder year label stays legible", () => {
  // .year is #8b949e. At opacity 0.45 over the #0d1117 background it blends to
  // roughly #464c54, about 2.17:1 -- far below the 4.5:1 WCAG requires for 13px
  // text. At 0.85 it measures about 4.7:1. This repo already asserts contrast
  // in accessibility.test.mjs, so a silently dimmed label would put the chart
  // at odds with its own standard.
  const blocks = styleBlocks(render());
  assert.equal(blocks.length, 1, "expected exactly one style block");

  const decls = declarationsOf(blocks[0], ".year-future");
  assert.ok(decls.length >= 1, ".year-future rule not found in the style block");

  const raw = soleDeclValue(decls, "opacity");
  assert.ok(raw !== null, ".year-future must declare an opacity");
  const opacity = Number(raw);
  assert.ok(Number.isFinite(opacity), `unparseable .year-future opacity ${raw}`);

  assert.ok(
    opacity >= 0.7,
    `.year-future opacity ${opacity} is too faint for 13px text; 0.7 is the floor`
  );
});

test("the future runway outlines never exceed their honesty ceiling", () => {
  // Both slots are EMPTY and must never read as measured data. GHOST_MAX_H is
  // the hard ceiling; ghostHeightFor additionally caps each outline at the
  // shortest measured bar. The regression this replaced sized the outline as a
  // fraction of the plot (12.6px) while a real year of 236 contributions
  // rendered 3.4px.
  const ghosts = tagsWithClass(render(), "rect", "future-ghost");
  assert.equal(ghosts.length, 2, "expected one future-ghost rect per future slot");

  for (const [index, ghost] of ghosts.entries()) {
    const h = numAttr(ghost, "height");
    assert.ok(Number.isFinite(h) && h > 0, `ghost ${index} height must be positive, got ${h}`);
    assert.ok(
      h <= GHOST_MAX_H,
      `runway outline ${index} ${h} must not exceed GHOST_MAX_H ${GHOST_MAX_H}`
    );
  }
});
