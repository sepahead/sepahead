// scripts/chart-bar-geometry.test.mjs
// Geometry invariants that relate one drawn element to ANOTHER drawn element,
// rather than to a constant. Both tests here exist because mutation testing
// proved the invariant was unguarded: reverting the product code left the whole
// suite green.
//
//   * the in-progress cap must sit entirely INSIDE the bar it marks. Reverting
//     `capY = y + BAR_CAP_WIDTH / 2` to `capY = y` was STILL GREEN.
//   * the grouped history bar's rendered extent must stay under every year that
//     genuinely beat it. Its segments carried no class at all until recently, so
//     nothing could address them and the clamp had zero coverage.
//
// Companion to chart-honesty.test.mjs (model meaning) and chart-svg.test.mjs
// (markup structure). These belong in the honesty file once the pending test
// consolidation lands; they are separate only so they could be added without
// rewriting a file wholesale.
//
// Run: node --test scripts/*.test.mjs
import test from "node:test";
import assert from "node:assert/strict";

import { STACK_THROUGH_YEAR, buildModel, renderSVG } from "./cumulative.mjs";
import {
  attrOf,
  soleDeclValue,
  declarationsOf,
  numAttr,
  styleBlocks,
  tags,
  tagsWithClass,
} from "./chart-test-helpers.mjs";

// Coordinates are snapped to one decimal place before they are interpolated, so
// exact arithmetic should hold. The tolerance only absorbs binary float noise;
// it is deliberately far smaller than the 1px effects under test, so a real
// off-by-one cannot hide inside it.
const EPS = 0.05;

// Fixture anchored the same way as the other chart tests: the GROUPED half is
// pinned to STACK_THROUGH_YEAR so a stacked bar always exists, while the RECENT
// half slides with the clock so the in-progress branch keeps being exercised
// after every rollover. Defining the totals here (rather than importing them)
// is what lets the segment-count assertion below be derived rather than guessed.
const GROUPED_TOTALS = [1, 4, 32, 19, 0, 0, 234, 61, 188];
const COMPLETE_RECENT_TOTALS = [236, 1676, 2027];

function fixture(currentTotal = 4214) {
  const now = new Date().getUTCFullYear();
  const recentTotals = [...COMPLETE_RECENT_TOTALS, currentTotal];
  const firstGrouped = STACK_THROUGH_YEAR - (GROUPED_TOTALS.length - 1);
  const firstRecent = now - (recentTotals.length - 1);
  // The two halves can only meet if the clock runs close enough to the pinned
  // boundary for the ranges to touch. A real clock only grows while the boundary
  // stays put, but a raised CUMULATIVE_STACK_THROUGH or a mocked clock could do
  // it, and duplicate years would make the model quietly nonsensical rather than
  // obviously broken. Reject it with a named cause.
  assert.ok(
    firstRecent > STACK_THROUGH_YEAR,
    `fixture halves collide: recent years start at ${firstRecent}, ` +
      `which is not after the grouping boundary ${STACK_THROUGH_YEAR}`
  );

  const years = [];
  GROUPED_TOTALS.forEach((total, i) => {
    years.push({ year: firstGrouped + i, total, source: "h2" });
  });
  recentTotals.forEach((total, i) => {
    years.push({ year: firstRecent + i, total, source: "h2" });
  });
  return years;
}

// The module resolves "this year" in Berlin time, which can disagree with UTC
// for a few hours around New Year. That is acceptable because every assertion
// below is relative to whichever row the MODEL itself flagged, never to a year
// this file computed.
function render(currentTotal) {
  const model = buildModel(fixture(currentTotal));
  return { model, svg: renderSVG(model) };
}

// Rendered rect heights are read tag-first, so no assertion depends on the order
// attributes happen to be emitted in.
function rectGeometry(tag) {
  return {
    tag,
    x: numAttr(tag, "x"),
    y: numAttr(tag, "y"),
    width: numAttr(tag, "width"),
    height: numAttr(tag, "height"),
  };
}

test("the in-progress cap lies entirely inside the bar it marks", () => {
  // WHY THIS IS LOAD-BEARING, not cosmetic. The cap is a stroked line, and a
  // stroke is centred on its path: half its width falls either side. Drawn ON
  // the bar's top edge, the upper half therefore sits over the PAGE background,
  // which differs per theme -- near-invisible in dark mode, near-black on white
  // in light mode, where it stops reading as notches eroding an unfinished edge
  // and starts reading as a heavy line floating above the bar.
  //
  // Offsetting the cap down by half its stroke width puts the WHOLE stroke
  // inside the bar. That is what makes the single-colour choice correct: the
  // only backdrop the cap is ever measured against becomes the bar's own
  // theme-invariant cyan gradient, so a light-theme override really would be
  // dead code. Revert the offset and that claim silently becomes false, which
  // is exactly the regression this test catches.
  const { svg } = render();

  // Stroke width comes from the RENDERED CSS, not from a copy of the constant.
  // The invariant is about what actually ships; a hardcoded 2 here would keep
  // passing if the declared width ever changed without the offset following it.
  const css = styleBlocks(svg);
  assert.equal(css.length, 1, "expected exactly one style block");
  const capDecls = declarationsOf(css[0], ".bar-cap");
  assert.ok(capDecls.length >= 1, "expected a .bar-cap rule in the style block");
  const rawWidth = soleDeclValue(capDecls, "stroke-width");
  assert.ok(
    rawWidth !== null,
    "expected .bar-cap to declare a stroke-width to reason about"
  );
  const strokeWidth = Number(rawWidth);
  assert.ok(
    Number.isFinite(strokeWidth) && strokeWidth > 0,
    `unparseable .bar-cap stroke-width: ${rawWidth}`
  );

  const caps = tagsWithClass(svg, "line", "bar-cap");
  assert.equal(
    caps.length,
    1,
    `expected exactly one in-progress cap, found ${caps.length}`
  );
  const cap = caps[0];

  const capY1 = numAttr(cap, "y1");
  const capY2 = numAttr(cap, "y2");
  const capX1 = numAttr(cap, "x1");
  const capX2 = numAttr(cap, "x2");
  for (const [name, value] of [
    ["y1", capY1],
    ["y2", capY2],
    ["x1", capX1],
    ["x2", capX2],
  ]) {
    assert.ok(
      Number.isFinite(value),
      `cap is missing a numeric ${name}: ${cap}`
    );
  }
  assert.equal(capY1, capY2, "the cap must be horizontal");
  assert.ok(capX2 > capX1, "the cap must have a positive width");

  // Locate the OWNING bar by horizontal containment rather than by assuming
  // which bar it is: the cap spans the bar's flat top between its rounded
  // corners, so its x-range is strictly inside the bar's.
  const bars = tagsWithClass(svg, "rect", "bar").map(rectGeometry);
  assert.ok(bars.length > 0, "expected measured bars to be present");
  const owner = bars.find(
    (bar) =>
      Number.isFinite(bar.x) &&
      Number.isFinite(bar.width) &&
      bar.x <= capX1 + EPS &&
      capX2 <= bar.x + bar.width + EPS
  );
  assert.ok(
    owner,
    `no bar horizontally contains the cap (${capX1}..${capX2}); ` +
      `bar spans were ${bars.map((b) => `${b.x}..${b.x + b.width}`).join(", ")}`
  );
  assert.ok(
    Number.isFinite(owner.y) && Number.isFinite(owner.height),
    `owning bar is missing numeric geometry: ${owner.tag}`
  );
  // The in-progress year is the newest measured year, so its bar is the last one
  // emitted. Derived from document order rather than from a hardcoded year.
  assert.equal(
    bars.indexOf(owner),
    bars.length - 1,
    "the cap must mark the newest measured bar"
  );

  const capTop = capY1 - strokeWidth / 2;
  const capBottom = capY1 + strokeWidth / 2;
  assert.ok(
    capTop >= owner.y - EPS,
    `the cap's stroke reaches ${capTop}, above the bar top ${owner.y}, so ` +
      `${strokeWidth / 2}px of it is drawn over the page background instead of ` +
      `the bar -- which differs per theme and breaks the single-colour rationale`
  );
  assert.ok(
    capBottom <= owner.y + owner.height + EPS,
    `the cap's stroke reaches ${capBottom}, past the bar bottom ` +
      `${owner.y + owner.height}`
  );

  // The cap animates up from the baseline with fill="freeze", so its authored
  // y1/y2 must already BE the resting position and every animation must end
  // there too. Otherwise the reduced-motion / no-SMIL state (which renders the
  // attribute values) and the animated end state would disagree.
  const openIndex = svg.indexOf(cap);
  const closeIndex = svg.indexOf("</line>", openIndex);
  assert.ok(closeIndex > openIndex, "cap element is not closed");
  const capInner = svg.slice(openIndex + cap.length, closeIndex);

  const endpointAnimations = tags(capInner, "animate").filter((animation) =>
    ["y1", "y2"].includes(attrOf(animation, "attributeName"))
  );
  assert.equal(
    endpointAnimations.length,
    2,
    "expected the cap to animate both endpoints into place"
  );
  for (const animation of endpointAnimations) {
    assert.equal(
      numAttr(animation, "to"),
      capY1,
      `cap animation must settle at the authored position ${capY1}: ${animation}`
    );
  }
});

test("the grouped history bar never out-towers a year that beat it", () => {
  // The grouped bar pads each segment up to a legibility floor, so its drawn
  // height overstates its total. That is acceptable on its own, but it must not
  // invert RANK: a year with several times the contributions has to stay
  // visibly taller. Nine grouped segments (up from seven) raised the padding
  // pressure by roughly a third, which is precisely when this clamp starts to
  // matter -- and until the segments carried a class, nothing could measure it.
  const { model, svg } = render();

  const segments = tagsWithClass(svg, "rect", "stack-seg").map(rectGeometry);
  // Zero-total years contribute no rect, so the expected count is the number of
  // NON-ZERO grouped totals. Derived from the fixture this file owns, so it
  // cannot silently encode an assumption about how zeroes are handled.
  const expectedSegments = GROUPED_TOTALS.filter((total) => total > 0).length;
  assert.equal(
    segments.length,
    expectedSegments,
    `expected ${expectedSegments} addressable stack segments, found ${segments.length}`
  );
  for (const segment of segments) {
    assert.ok(
      Number.isFinite(segment.y) && Number.isFinite(segment.height),
      `stack segment is missing numeric geometry: ${segment.tag}`
    );
  }

  // Measure the drawn EXTENT rather than summing heights, so any gap or overlap
  // between segments is reflected instead of cancelling out.
  const stackTop = Math.min(...segments.map((s) => s.y));
  const stackBottom = Math.max(...segments.map((s) => s.y + s.height));
  const stackExtent = stackBottom - stackTop;
  assert.ok(stackExtent > 0, "the grouped bar must have a visible height");

  const stackRow = model.rows.find((row) => row.isStack);
  assert.ok(stackRow, "expected the model to build a grouped history row");

  // Bars are emitted in row order, so zipping document order onto the model's
  // own rows is safe -- and asserting the counts match is what keeps that
  // assumption honest instead of implicit.
  const bars = tagsWithClass(svg, "rect", "bar").map(rectGeometry);
  const barRows = model.rows.filter((row) => !row.isStack && !row.isFuture);
  assert.equal(
    bars.length,
    barRows.length,
    `expected one bar per measured year: ${barRows.length} rows, ${bars.length} bars`
  );

  const taller = barRows.filter((row) => row.total > stackRow.total);
  const shorter = barRows.filter((row) => row.total < stackRow.total);
  assert.ok(
    taller.length > 0 && shorter.length > 0,
    `fixture must straddle the grouped total ${stackRow.total} to test rank ` +
      `ordering in both directions`
  );

  for (const row of taller) {
    const bar = bars[barRows.indexOf(row)];
    assert.ok(
      stackExtent < bar.height,
      `grouped bar (${stackRow.total} contributions) renders ${stackExtent}px, ` +
        `which is not shorter than ${row.label} (${row.total}) at ${bar.height}px`
    );
  }

  // The other direction: padding must not be so aggressive... nor the ceiling
  // clamp so severe... that the grouped bar drops below a year it genuinely
  // beat. Padding only grows the stack, so this holds by construction today;
  // asserting it means a future squeeze cannot quietly break it.
  for (const row of shorter) {
    const bar = bars[barRows.indexOf(row)];
    assert.ok(
      stackExtent > bar.height,
      `grouped bar (${stackRow.total} contributions) renders ${stackExtent}px, ` +
        `which is not taller than ${row.label} (${row.total}) at ${bar.height}px`
    );
  }
});
