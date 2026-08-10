// scripts/chart-honesty.test.mjs
// Invariants for the annual contribution chart that are about MEANING rather
// than markup: an empty placeholder must never out-tower measured data, the
// grouped history bar must be legible and announced, the headline growth rate
// must derive from a year that is actually plotted, and the two files GitHub
// really serves must be valid.
//
// Companion to chart-svg.test.mjs, which covers SVG structure. Split into its
// own file because these assertions are about the model's honesty, and because
// the bug that shipped (a raw less-than sign inside style content, fatal XML)
// was only ever provable by inspecting a WRITTEN theme variant -- so the
// splitThemes path needs coverage of its own, not just renderSVG.
//
// Run: node --test scripts/*.test.mjs
import test from "node:test";
import assert from "node:assert/strict";

import { STACK_THROUGH_YEAR, buildModel, renderSVG } from "./cumulative.mjs";
import { splitThemes } from "./theme-split.mjs";
import {
  declarationsOf,
  numAttr,
  tagsWithClass,
} from "./chart-test-helpers.mjs";

// Fixture years come from TWO anchors, and the split is deliberate: each half
// breaks in a DIFFERENT direction if anchored the other way.
//
//   * The GROUPED half is PINNED to STACK_THROUGH_YEAR, so a stacked history bar
//     always exists. Sliding it with the clock (as this fixture used to) empties
//     it silently: once the clock passes the boundary -- around 2035 -- every
//     fixture year sorts AFTER STACK_THROUGH_YEAR, no grouped row is built at
//     all, and the isStack assertions start failing for no real reason.
//   * The RECENT half SLIDES with the current year, so the in-progress and
//     next-year-placeholder branches keep being exercised after every rollover.
//     Pinning it to a literal year leaves nothing flagged isCurrent, and the cap
//     assertions then assert over an empty set and still pass -- the quieter and
//     more dangerous of the two failures.
//
// Shape mirrors the real profile: a long sparse tail, then steep recent growth.
// The module resolves "this year" in Berlin time; that can disagree with UTC for
// a few hours around New Year, which is acceptable here because every assertion
// below is relative to whichever row the model itself flagged.
//
// At STACK_THROUGH_YEAR 2022 the grouped half spans 2014-2022, which is exactly
// what the old current-year-relative arithmetic produced, so pinning it changes
// no assertion's numbers today.
const GROUPED_TOTALS = [1, 4, 32, 19, 0, 0, 234, 61, 188];
const COMPLETE_RECENT_TOTALS = [236, 1676, 2027];

function fixture(currentTotal = 6240) {
  const now = new Date().getUTCFullYear();
  // Emitted in ONE ascending pass: the grouped half ends ON the boundary, the
  // recent half ends on the current year, and each is laid down ascending from a
  // fixed start. So the halves can only ever meet if the clock runs close enough
  // to STACK_THROUGH_YEAR for the two ranges to touch. `now` only grows while the
  // boundary is pinned, so that cannot happen with a real clock -- but a raised
  // CUMULATIVE_STACK_THROUGH or a mocked clock could, and duplicate/out-of-order
  // years would make buildModel's output quietly nonsensical rather than
  // obviously broken. Reject it with a named cause instead.
  const recentTotals = [...COMPLETE_RECENT_TOTALS, currentTotal];
  const firstGrouped = STACK_THROUGH_YEAR - (GROUPED_TOTALS.length - 1);
  const firstRecent = now - (recentTotals.length - 1);
  assert.ok(
    firstRecent > STACK_THROUGH_YEAR,
    `fixture halves collide: recent years start at ${firstRecent}, which is not after the grouping boundary ${STACK_THROUGH_YEAR}`
  );

  const years = [];
  GROUPED_TOTALS.forEach((total, i) => {
    years.push({ year: firstGrouped + i, total, source: "h2" });
  });
  recentTotals.forEach((total, i) => {
    years.push({ year: firstRecent + i, total, source: "h2" });
  });

  // Uniqueness and ordering ASSERTED, not assumed. The guard above names the one
  // plausible cause; this covers the invariant itself across both halves and
  // their junction, so no future edit to either anchor can reintroduce a repeated
  // or descending year unnoticed.
  for (let i = 1; i < years.length; i += 1) {
    assert.ok(
      years[i].year > years[i - 1].year,
      `fixture years must strictly ascend: ${years[i - 1].year} then ${years[i].year}`
    );
  }
  return years;
}

const render = (totalForCurrentYear) =>
  renderSVG(buildModel(fixture(totalForCurrentYear)));

// Imported rather than restated so the tooltip test cannot drift from the
// generator's own pluralisation rule.
import { contributionCount } from "./cumulative.mjs";

// The grouped range as the aria-label spells it: full years, "to" rather than a
// dash, so a screen reader reads it as two whole years. Derived from the same
// anchor the fixture uses, so moving the grouping boundary cannot leave this
// asserting a range the chart no longer draws.
const FULL_GROUPED_RANGE = `${
  STACK_THROUGH_YEAR - (GROUPED_TOTALS.length - 1)
} to ${STACK_THROUGH_YEAR}`;

// Heights of every rect whose class LIST contains `cls`. Delegates to the
// shared extractor, which fixes two defects in the pattern this replaced: it
// required an EXACT class attribute, so the peak bar (`class="bar peak"`) was
// silently dropped from the set and any minimum taken from it was quietly
// wrong; and it required `height` to appear before `class`, despite claiming
// attribute-order independence.
//
// `cls` is a plain class TOKEN. Matching is per-token, so "bar" covers both
// class="bar" and class="bar peak" while excluding class="bar-glow" -- no
// alternation fragment needed. Passing one ("bar(?: peak)?", a leftover from
// the old exact-attribute matcher) matches nothing at all, so tagsWithClass
// now rejects it instead of handing back an empty set.
const heightsOfClass = (svg, cls) =>
  tagsWithClass(svg, "rect", cls).map((tag) => numAttr(tag, "height"));

// Guards the two ways a height set can lie about a passing bound: an EMPTY set
// makes every comparison below trivially true, and a null or NaN entry (a rect
// with no numeric height) poisons Math.min into NaN, which fails every `<=`
// comparison silently rather than reporting the real geometry.
function assertMeasured(values, what) {
  assert.ok(values.length > 0, `expected ${what}`);
  assert.ok(
    values.every((v) => Number.isFinite(v)),
    `${what}: every value must be numeric, got ${JSON.stringify(values)}`
  );
}

test("the empty next-year slot never out-towers a measured bar", () => {
  // The regression this guards: the runway outline was sized as a fraction of
  // the plot (12.6px) while a real year of 236 contributions rendered 3.4px, so
  // a year with NO data was drawn roughly four times taller than a year with
  // data. Because the bar scale moves with yMax, the placeholder has to be
  // bounded by the actual bars rather than by the canvas.
  for (const current of [4206, 6000, 6240, 9999]) {
    const svg = render(current);
    const bars = heightsOfClass(svg, "bar");
    const ghost = heightsOfClass(svg, "future-ghost");

    assert.equal(ghost.length, 1, `expected one runway outline (${current})`);
    assertMeasured(bars, `measured bars (${current})`);
    assertMeasured(ghost, `runway outline (${current})`);
    assert.ok(
      ghost[0] <= Math.min(...bars),
      `runway outline ${ghost[0]} must not exceed the shortest measured bar ` +
        `${Math.min(...bars)} (current year ${current})`
    );
    assert.ok(ghost[0] > 0, "runway outline must still be visible");
  }
});

test("the runway outline stays bar-shaped rather than a pill", () => {
  // A corner radius larger than half the height consumes the whole silhouette,
  // so the slot stops echoing a bar and reads as an unrelated lozenge.
  const svg = render();
  const rect = svg.match(/<rect[^>]*\sclass="future-ghost"[^>]*>/)[0];
  const h = Number(rect.match(/\sheight="([0-9.]+)"/)[1]);
  const rx = Number(rect.match(/\srx="([0-9.]+)"/)[1]);
  assert.ok(rx <= h / 2, `rx ${rx} must not exceed half the height ${h}`);
});

test("every grouped year gets its own colour", () => {
  // The grouped bar spans nine years and the palette holds exactly nine
  // colours, so there is no headroom: widening the grouping made two different
  // years render as identically coloured segments of the same bar. Silent, and
  // invisible to a purely structural test. cumulative.mjs now throws at
  // generation time rather than reusing a colour; this asserts the rendered
  // result, which is the invariant that actually matters.
  const svg = render();
  // Selected TAG-FIRST via the segment class, then the fill is read out of each
  // individual tag. The previous version required `fill` to be the LAST
  // attribute on the rect, so adding `class="stack-seg"` silently reduced it to
  // matching nothing -- the exact vacuity this suite exists to prevent. Reading
  // attributes out of an already-selected tag makes order irrelevant.
  const segments = tagsWithClass(svg, "rect", "stack-seg");
  // Nine grouped years, but a year with zero contributions emits no rect at
  // all, so the count is data-dependent. Five is a floor comfortably above the
  // sparse tail's zero years and far above the two needed to make the
  // distinctness check meaningful.
  assert.ok(
    segments.length >= 5,
    `expected stacked history segments, found ${segments.length}`
  );

  const fills = segments.map((tag) => {
    const m = /\sfill="(#[0-9a-fA-F]{6})"/.exec(tag);
    assert.ok(m, `stack segment carries no hex fill: ${tag}`);
    return m[1].toLowerCase();
  });
  assert.equal(
    new Set(fills).size,
    fills.length,
    `grouped segments must all differ, got ${fills.join(", ")}`
  );
});

test("segment tooltips agree with their count in number", () => {
  const svg = render(4206);
  const titles = [...svg.matchAll(/<title>([^<]*)<\/title>/g)].map((m) => m[1]);
  // Non-empty guard: a selector that matched nothing would make every
  // assertion below vacuously true -- the exact failure mode that let
  // "1 contributions" reach a committed asset.
  assert.ok(titles.length > 0, "expected per-segment tooltips, found none");

  // This chart emits THREE distinct year-tooltip shapes, and an earlier version
  // of this test only matched one of them:
  //   stack segment  2014: 1 contribution
  //   plotted bar    2023: 236 contributions · cumulative 775
  //                  2026: 4,214 contributions (year in progress) · cumulative 8,692
  //   grouped frame  2014–22: 539 contributions (stacked by year) · cumulative 539
  // The old pattern was `/^\d{4}: ([\d,]+) contributions?$/` -- anchored at BOTH
  // ends, so it rejected every suffixed shape, and its `/^\d{4}: /` prefilter
  // also missed the grouped frame because that label carries an en-dash range
  // (`2014–22`) rather than a bare year. Match the label, the count and the noun,
  // and leave the tail unanchored.
  const YEAR_LABEL = String.raw`\d{4}(?:[–-]\d{2})?`;
  const yearTitles = titles.filter((t) =>
    new RegExp(`^${YEAR_LABEL}: `).test(t)
  );
  assert.ok(
    yearTitles.length > 0,
    `expected year-prefixed tooltips, got ${titles.join(" | ")}`
  );

  // The placeholder year carries no count at all, so it is legitimately outside
  // the count-phrase grammar. Partition rather than prefilter, and assert the
  // discarded set is EXACTLY that -- otherwise a future wording change could
  // silently move real tooltips into the ignored bucket, which is how the
  // zero-match bug hid the first time.
  const countRx = new RegExp(`^(${YEAR_LABEL}): ([\\d,]+) (contributions?)\\b`);
  const counted = yearTitles.filter((t) => countRx.test(t));
  const uncounted = yearTitles.filter((t) => !countRx.test(t));
  for (const title of uncounted) {
    assert.match(
      title,
      /not started yet$/,
      `only the empty placeholder may omit a count phrase: "${title}"`
    );
  }
  assert.ok(
    uncounted.length <= 1,
    `at most one countless tooltip (the placeholder) expected, got ${uncounted.join(" | ")}`
  );

  // Pin every shape by structure instead of a bare non-empty guard: a bare
  // `length > 0` is what let the old matcher pass while dropping whole classes
  // of tooltip. Each of these three must be represented.
  assert.ok(
    counted.some((t) => /\(stacked by year\)/.test(t)),
    `expected the grouped frame tooltip, got ${counted.join(" | ")}`
  );
  assert.ok(
    counted.some((t) => / · cumulative /.test(t) && !/\(stacked by year\)/.test(t)),
    `expected a plotted-bar tooltip, got ${counted.join(" | ")}`
  );
  assert.ok(
    counted.some((t) => !/ · cumulative /.test(t)),
    `expected bare per-year stack-segment tooltips, got ${counted.join(" | ")}`
  );

  for (const title of counted) {
    const [, , count, noun] = title.match(countRx);
    const n = Number(count.replace(/,/g, ""));
    assert.ok(
      Number.isFinite(n),
      `tooltip count must parse as a number: "${title}"`
    );
    // Compare the CAPTURED count phrase against the generator's own helper. The
    // old assertion used `title.slice(6)`, which assumed the label prefix was
    // always exactly `"YYYY: "` -- already false for the grouped `2014–22: `.
    assert.equal(
      `${count} ${noun}`,
      contributionCount(n),
      `tooltip must match the generator's own pluralisation for ${n}: "${title}"`
    );
  }

  // Word-boundary rather than end-anchored, so the disagreement is caught
  // wherever it appears in the phrase, not just at the very end of the string.
  for (const title of titles) {
    assert.ok(
      !/\b1 contributions\b/.test(title),
      `a count of 1 must read "1 contribution" (singular): "${title}"`
    );
  }

  // The real series opens on a single contribution, so the singular branch is
  // reachable with live data rather than only in theory. Pin it directly.
  assert.equal(contributionCount(1), "1 contribution");
  assert.equal(contributionCount(0), "0 contributions");
  assert.equal(contributionCount(2), "2 contributions");
});

test("the visible growth figure is reachable from the aria-label", () => {
  const svg = render(4206);
  // role="img" plus an aria-label makes the subtree presentational, so any
  // figure that exists only as <text> is announced to nobody.
  const root = svg.match(/<svg\b[^>]*>/)[0];
  assert.match(root, /role="img"/, "this test's premise is role=\"img\"");
  const aria = svg.match(/aria-label="([^"]*)"/)[1];

  const visible = svg.match(/class="sub">avg growth ([^<]+)</);
  assert.ok(visible, "expected the visible growth figure in the panel corner");
  const figure = visible[1];
  assert.match(
    figure,
    /^[+-]?\d+%\/yr since \d{4}$/,
    `the visible rate must state its own window, got "${figure}"`
  );

  // Same figure, one source. If the panel and the sentence ever diverge, the
  // chart states two different growth rates at once.
  assert.ok(
    aria.includes(figure),
    `aria-label must carry the visible growth figure "${figure}": ${aria}`
  );
  assert.match(
    aria,
    /average growth/,
    `aria-label must spell "average" rather than the panel's "avg": ${aria}`
  );
});

test("the growth rate and its stated window are inseparable", () => {
  // A rate without a base year advertises a window it was never measured over;
  // a base year without a rate labels nothing. Both or neither, on every input.
  for (const current of [0, 1, 4206, 9999]) {
    const model = buildModel(fixture(current));
    assert.equal(
      model.avgGrowthPct == null,
      model.growthBaseYear == null,
      `rate and base year must appear together (current ${current}): ` +
        `rate=${model.avgGrowthPct}, base=${model.growthBaseYear}`
    );
    if (model.growthBaseYear != null) {
      assert.ok(
        model.growthBaseYear > STACK_THROUGH_YEAR,
        `the base year must be individually plotted, got ${model.growthBaseYear}`
      );
    }
  }
});

test("an unfinished record year is not announced as a settled peak", () => {
  // When the in-progress year holds the record, "peak" contradicts the same
  // sentence's "still in progress" -- the number keeps moving until the year
  // closes.
  const hot = render(99999);
  const hotAria = hot.match(/aria-label="([^"]*)"/)[1];
  assert.match(hotAria, /in progress/, "fixture premise: a partial year exists");
  assert.match(
    hotAria,
    /highest so far/,
    `a record held by the unfinished year must be hedged: ${hotAria}`
  );
  assert.ok(
    !/peak/.test(hotAria),
    `"peak" must not survive alongside the hedge: ${hotAria}`
  );

  // When a CLOSED year holds the record the superlative is exact, so the hedge
  // must not fire -- otherwise it is unconditional and says nothing.
  const cold = render(1);
  const coldAria = cold.match(/aria-label="([^"]*)"/)[1];
  assert.match(
    coldAria,
    /peak [\d,]+ in \d{4}/,
    `a record held by a completed year stays "peak": ${coldAria}`
  );
  assert.ok(
    !/highest so far/.test(coldAria),
    `the hedge must be conditional, not unconditional: ${coldAria}`
  );
});

test("the headline growth rate ignores years hidden inside the grouped bar", () => {
  // The growth window must start STRICTLY after the grouping boundary. When the
  // grouping moved from 2020 to 2022 the window's base year became a year that
  // is no longer drawn as a bar, so the headline rate was computed from data the
  // viewer cannot see. Behavioural check: perturbing a grouped year must not
  // move the rate, while perturbing a plotted year must.
  //
  // Both boundary years are read back OUT of the model rather than guessed from
  // the calendar. The grouping boundary is a fixed year while the fixture slides
  // with the current year, so any arithmetic like "now - 4" would drift across
  // that boundary on New Year and silently invert what the test proves.
  const model = buildModel(fixture());
  const baseline = model.avgGrowthPct;
  assert.ok(baseline != null, "expected a growth rate for this fixture");

  assert.ok(
    model.rows.some((r) => r.isStack),
    "expected a grouped history bar"
  );
  const plottedRow = model.rows.find(
    (r) => !r.isStack && !r.isCurrent && !r.isFuture
  );
  assert.ok(plottedRow, "expected at least one individually plotted year");

  // Rows are contiguous, so the year immediately before the first individually
  // plotted bar is by definition the last year swallowed by the grouped bar.
  // Deriving it this way depends only on the row flags, not on the internal
  // shape of the stack row's segment list.
  const groupedYear = plottedRow.year - 1;
  assert.ok(
    fixture().some((y) => y.year === groupedYear),
    `fixture must contain the boundary year ${groupedYear}`
  );

  const bump = (year) =>
    buildModel(
      fixture().map((y) =>
        y.year === year ? { ...y, total: y.total * 10 + 100 } : y
      )
    ).avgGrowthPct;

  assert.equal(
    bump(groupedYear),
    baseline,
    `${groupedYear} is inside the grouped bar and must not move the growth rate`
  );
  assert.notEqual(
    bump(plottedRow.year),
    baseline,
    `${plottedRow.year} is plotted as its own bar and must move the growth rate`
  );
});

test("the in-progress year never craters the growth rate", () => {
  // The current year is partial and the trailing placeholder is zero; letting
  // either terminate the window yields a nonsense negative CAGR.
  for (const current of [1, 4206, 9999]) {
    const { avgGrowthPct } = buildModel(fixture(current));
    assert.ok(avgGrowthPct > 0, `growth must stay positive (current ${current})`);
  }
  const rates = [1, 4206, 9999].map((c) => buildModel(fixture(c)).avgGrowthPct);
  assert.equal(
    new Set(rates).size,
    1,
    "growth rate must be independent of the in-progress year's total"
  );
});

// The single entry point for every style assertion in this file. Style facts
// must be read from the style block ONLY, with CSS comments stripped first.
// The stylesheet's own prose legitimately names the features it explains --
// including prefers-color-scheme, in the comment above the legibility-halo
// rules -- so scanning the whole document for that substring reports a
// theme-conditional variant that does not exist. Extract, decomment, then
// assert on live declarations and at-rule preludes.
function styleFacts(svg, name) {
  const blocks = [...svg.matchAll(/<style>([\s\S]*?)<\/style>/g)];
  assert.equal(blocks.length, 1, `${name}: expected exactly one style block`);
  const raw = blocks[0][1];
  assert.ok(
    !raw.includes("<"),
    `${name}: a raw less-than sign in style content is fatal XML`
  );
  const css = raw.replace(/\/\*[\s\S]*?\*\//g, "");
  // Prelude of each at-rule, e.g. "(prefers-reduced-motion: reduce)".
  const atRules = [...css.matchAll(/@media([^{]*)\{/g)].map((m) => m[1].trim());
  return { css, atRules };
}

// EVERY declaration block for a selector. The light variant carries the base
// rule AND its unwrapped override, so a non-global match would only ever check
// the first of the two and an override could smuggle in a bad declaration.
const declsFor = (css, selector) =>
  [...css.matchAll(new RegExp(`\\${selector}\\s*\\{([^}]*)\\}`, "g"))].map(
    (m) => m[1]
  );

test("both themed variants are valid and keep the new cues", () => {
  // This is the path the shipped XML bug travelled: renderSVG was fine to eyeball
  // but the two WRITTEN variants were what broke. splitThemes rewrites the style
  // block, so it must be re-checked rather than assumed.
  const svg = render();
  const variants = splitThemes(svg);

  for (const [name, out] of Object.entries(variants)) {
    const { css, atRules } = styleFacts(out, name);
    // splitThemes either DROPS the light block (dark) or UNWRAPS it (light), so
    // no theme query may remain. Filter rather than count all at-rules: the
    // reduced-motion at-rule is expected to survive and is not a theme
    // condition. deepEqual against [] also prints the offending queries.
    assert.deepEqual(
      atRules.filter((q) => q.includes("prefers-color-scheme")),
      [],
      `${name}: theme variants must not stay media-query conditional`
    );
    for (const cls of [".bar-cap", ".future-ghost", ".year-future"]) {
      assert.ok(declsFor(css, cls).length > 0, `${name}: lost ${cls}`);
    }
    assert.match(
      css,
      /\.bar-cap\s*\{[^}]*stroke-dasharray:\s*\d+\s+\d+/,
      `${name}: interpolated cap dasharray must survive the split`
    );
    // Round caps swallow these small gaps and the dashed cue reads as solid.
    for (const rule of [".bar-cap", ".future-ghost"]) {
      // Base rule AND, in the light variant, its unwrapped override.
      const decl = declsFor(css, rule).join(" ");
      assert.ok(
        !/stroke-linecap:\s*round/.test(decl),
        `${name}: ${rule} must not use a round linecap`
      );
    }
  }
});

test("the accessible description explains the grouped bar and the curve", () => {
  // A screen-reader user is told the range begins years ago but has no way to
  // learn the first bar is a multi-year aggregate: the per-segment titles are
  // not exposed inside an image role, so the label is the only channel.
  const svg = render();
  const aria = svg.match(/aria-label="([^"]*)"/)[1];
  const stackLabel = svg.match(/class="year">([^<]*\u2013[^<]*)</)[1];

  // The aria text deliberately spells the range out in FULL years rather than
  // reusing the compact axis label. The axis says "2014-22" because it has to
  // fit under a bar, but a screen reader renders that as "twenty fourteen to
  // twenty-two", and it also diverges from the README alt text. So assert the
  // spoken form, and assert the compact label is NOT what got interpolated.
  assert.ok(
    aria.includes(FULL_GROUPED_RANGE),
    `aria-label must name the grouped bar as "${FULL_GROUPED_RANGE}" (full years, not the axis label ${stackLabel}): ${aria}`
  );
  assert.ok(
    !aria.includes(stackLabel),
    `aria-label must not reuse the compact axis label ${stackLabel}: ${aria}`
  );
  assert.match(aria, /grouped/, "aria-label must say the years are grouped");
  assert.match(aria, /cumulative total curve/, "aria-label must mention the curve");
  assert.match(aria, /in progress/, "aria-label must flag the partial year");
  assert.match(aria, /placeholder/, "aria-label must flag the empty slot");
});

test("the peak bar does not stack a pulse under the in-progress cap", () => {
  // When the newest year is also the peak it would otherwise carry a glow, an
  // indefinite opacity pulse AND the dashed cap at once; the pulse is the one
  // that muddies the cue, so it is dropped rather than layered.
  const svg = render();
  const peakBar = svg.match(
    /<rect[^>]*\sclass="bar peak"[\s\S]*?<\/rect>/
  )[0];
  if (/class="bar-cap"/.test(svg)) {
    assert.ok(
      !/attributeName="opacity"[^>]*repeatCount="indefinite"/.test(peakBar),
      "peak pulse must be suppressed while the in-progress cap is shown"
    );
  }
});
