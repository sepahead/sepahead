#!/usr/bin/env node
// scripts/cumulative.mjs
// Generates assets/cumulative.svg, an annual contribution bar chart
// (grouped 2014–22, then one bar per year through the current year, plus two
// non-measured future runway slots) with a headline cumulative total.
// Zero npm dependencies; uses the global `fetch` (Node 20+).
//
// DESIGN COUSIN of weekdays.svg: same design language (brand cyan, monospace,
// dark/light theming via internal prefers-color-scheme, SMIL animation gated
// by prefers-reduced-motion). Bolder than weekdays: vertical gradient bars,
// a glowing peak bar, a left-to-right draw-in on load, and a large headline
// cumulative total.
//
// DATA SOURCE: server-rendered HTML fragment, NOT the API (same rationale as
// weekdays.mjs). The endpoint github.com/users/{login}/contributions accepts a
// ?from=YYYY-01-01 query param that returns that FULL calendar year, and embeds
// the per-year total in an <h2 id="js-contribution-activity-description">:
//     <h2 ...>1,676\n contributions\n in 2024</h2>
// We loop from=<START_YEAR>-01-01 .. from=<currentYear>-01-01 and parse that
// total (one regex per year, robust to whitespace/newlines between tokens).
// The trailing future runway slots are NEVER fetched: years that have not
// started have no fragment, so requesting them would 404 or return junk.
// This host is NOT api.github.com, so it is not subject to the 60/hr
// unauthenticated rate limit that is permanently exhausted on Actions runners.
//
// FALLBACK: if the <h2> regex misses for a given year (markup drift), sum the
// per-day <tool-tip> counts for that year instead (same regex pair weekdays.mjs
// uses), so the bar still renders with accurate data.

import { writeFileSync, mkdirSync } from "node:fs";
import { writeThemedPair } from "./theme-split.mjs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = resolve(__dirname, "..", "assets", "cumulative.svg");
const USERNAME = process.env.GH_USERNAME || "sepahead";
// NO TOKEN by design. The public per-year <h2> total already INCLUDES this
// user's private contributions (the profile has "Include private contributions
// on my profile" enabled; verified: the unauthenticated h2 equals the
// authenticated contributionsCollection total). So the unauthenticated numbers
// are already complete, and we avoid a PAT that could expose private repos.
// First year of activity on GitHub for this user (account created 2014). The
// early years (2014–2022) were sparse, so rather than nine tiny standalone
// bars they are collapsed into ONE stacked, multi-colour bar (a segment per
// year). 2023 onward each get their own bar.
const START_YEAR = Number(process.env.CUMULATIVE_START_YEAR) || 2014;
// Years <= this are merged into the first, stacked bar.
const STACK_THROUGH_YEAR =
  Number(process.env.CUMULATIVE_STACK_THROUGH) || 2022;
// First year of the agentic-engineering era; the gold mirror seam sits in
// the gap just before this year's bar.
const SEAM_YEAR = Number(process.env.CUMULATIVE_SEAM_YEAR) || 2024;

// ---------------------------------------------------------------------------
// 0. Helpers
// ---------------------------------------------------------------------------
const XML_ENTITIES = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&apos;",
};
const escapeXML = (s) => String(s).replace(/[&<>"']/g, (c) => XML_ENTITIES[c]);

// 1,234 -> "1,234" (en-US grouping). Browsers render SVG <text> locale-agnostic.
const fmt = (n) => Number(n).toLocaleString("en-US");
// Tooltips ARE user-visible on hover, and the earliest year in the real series
// is a single contribution, so the plural has to be derived from the count
// rather than assumed: "1 contributions" shipped in the committed asset until
// this existed. One helper, so every count-plus-noun surface agrees.
export const contributionCount = (n) =>
  `${fmt(n)} contribution${Number(n) === 1 ? "" : "s"}`;

// Reference timezone for "today" / the in-progress year. GitHub Actions runs in
// UTC and has no notion of the viewer's local timezone, so we can't use "the
// user's time" directly; instead we anchor to the user's zone (Europe/Berlin),
// which is DST-aware via Intl. Override with CHART_TZ if ever needed. This makes
// the current-year boundary flip at Berlin midnight rather than UTC midnight.
const TZ = process.env.CHART_TZ || "Europe/Berlin";
const tzDateParts = () =>
  Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: TZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(new Date())
      .filter((p) => p.type !== "literal")
      .map((p) => [p.type, Number(p.value)])
  );
// Current year in the reference timezone; the in-progress year is its own bar.
const currentYear = () => tzDateParts().year;

// ---------------------------------------------------------------------------
// 1. Fetch per-year totals from the contribution fragment.
//    Returns [{year, total}], ascending by year. Uses the embedded <h2> total;
//    falls back to summing per-day <tool-tip> counts if the <h2> is absent.
// ---------------------------------------------------------------------------
const FRAGMENT_URL = (login, year) =>
  `https://github.com/users/${encodeURIComponent(
    login
  )}/contributions?from=${year}-01-01`;

// Parse "<N> contributions on <Month> <day>." for the fallback path.
const parseTipCount = (tipText) => {
  if (/^\s*No contributions\b/i.test(tipText)) return 0;
  const m = tipText.match(/([\d,]+)\s+contributions?\b/i);
  if (!m) throw new Error(`unrecognised contribution tool-tip: ${tipText.slice(0, 120)}`);
  return Number(m[1].replace(/,/g, ""));
};


async function fetchYearTotal(login, year, fetchImpl = globalThis.fetch) {
  const res = await fetchImpl(FRAGMENT_URL(login, year), {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; sepahead-profile-cumulative-chart/1.0)",
      Accept: "text/html,application/xhtml+xml",
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `contributions fragment ${res.status} for ${year}: ${body.slice(0, 160)}`
    );
  }
  const html = await res.text();

  // Primary: the embedded <h2> "... contributions in YYYY" total.
  const h2 = html.match(/([\d,]+)\s+contributions?\s+in\s+(\d{4})/i);
  if (h2) {
    const responseYear = Number(h2[2]);
    if (responseYear !== year) {
      throw new Error(
        `requested contribution year ${year}, response reported ${responseYear}`
      );
    }
    return { year, total: Number(h2[1].replace(/,/g, "")), source: "h2" };
  }

  // Fallback: sum per-day <tool-tip> counts (same pair as weekdays.mjs).
  const tipBlocks = [
    ...html.matchAll(/<tool-tip[^>]*>([\s\S]*?)<\/tool-tip>/g),
  ].map((m) => m[1].trim());
  if (tipBlocks.length === 0) {
    throw new Error(
      `contributions fragment for ${year} contained neither a yearly total nor daily tool-tips`
    );
  }
  const total = tipBlocks.reduce((s, t) => s + parseTipCount(t), 0);
  console.warn(
    `[cumulative] <h2> total missing for ${year}; summed ${tipBlocks.length} tool-tips → ${total}.`
  );
  return { year, total, source: "tooltip-sum" };
}

async function fetchYearTotals(
  login,
  startYear,
  endYear,
  fetchImpl = globalThis.fetch
) {
  const out = [];
  for (let year = startYear; year <= endYear; year += 1) {
    out.push(await fetchYearTotal(login, year, fetchImpl));
  }
  return out; // ascending by year
}

// ---------------------------------------------------------------------------
// 2. Build the render model (add cumulative + flag the in-progress year).
// ---------------------------------------------------------------------------
// Every row carries an explicit `kind`, and the aggregates below filter on
// KIND rather than on year arithmetic. That is what keeps the synthesized
// next-year placeholder out of the peak, the growth rate, the headline total
// and the cumulative curve by construction: a zero-total row mistaken for the
// newest COMPLETE year would, for example, drive the CAGR to -100%.
//   stack   - the grouped early-years bar
//   year    - a complete, measured year
//   current - the in-progress year (measured, but partial)
//   future  - synthesized, zero, never-fetched runway slot
function buildModel(years) {
  // One read, so a build that straddles midnight in the reference timezone
  // can't disagree with itself about which year is "current".
  const thisYear = currentYear();

  // Peak single-year total (for y-axis scaling) across the MEASURED years.
  // `years` only ever holds fetched years, so the placeholder can't be peak.
  let peak = 0;
  for (const y of years) if (y.total > peak) peak = y.total;

  const early = years.filter((y) => y.year <= STACK_THROUGH_YEAR);
  const late = years.filter((y) => y.year > STACK_THROUGH_YEAR);

  let cumulative = 0;
  const rows = [];

  // Bar 0: the stacked, multi-colour history bar (one segment per early year).
  if (early.length) {
    const earlyTotal = early.reduce((s, y) => s + y.total, 0);
    cumulative += earlyTotal;
    const firstYear = early[0].year;
    rows.push({
      kind: "stack",
      isStack: true,
      isCurrent: false,
      isFuture: false,
      total: earlyTotal,
      cumulative,
      // e.g. 2014–22
      label: `${firstYear}–${String(STACK_THROUGH_YEAR).slice(2)}`,
      segments: early.map((y) => ({ year: y.year, total: y.total })),
    });
  }

  // Bars 1..n: one per year after the stack cutoff.
  for (const y of late) {
    cumulative += y.total;
    const isCurrent = y.year === thisYear;
    rows.push({
      kind: isCurrent ? "current" : "year",
      isStack: false,
      isCurrent,
      isFuture: false,
      year: y.year,
      total: y.total,
      cumulative,
      label: String(y.year),
    });
  }

  // Post-current runway: two synthesized, non-measured slots. The first is
  // next year's explicit empty placeholder; the second gives the final phase
  // a real temporal boundary, exactly like the existing seams between bars.
  // Neither year is fetched, counted, plotted on the cumulative curve, or
  // allowed into peak/growth aggregates. The enlightenment phase lives in the
  // gap BETWEEN these two slots: after 2027, before 2028.
  for (const [futureIndex, year] of [thisYear + 1, thisYear + 2].entries()) {
    rows.push({
      kind: "future",
      isStack: false,
      isCurrent: false,
      isFuture: true,
      isRunway: futureIndex === 1,
      futureIndex,
      year,
      total: 0,
      cumulative,
      label: String(year),
    });
  }

  // Average year-over-year PERCENT growth (CAGR, geometric mean of the YoY
  // ratios, robust to wild single-year swings). Measured over the post-stack
  // era (years >= STACK_THROUGH_YEAR), COMPLETE years only: the sparse
  // pre-2022 years would explode a percentage, and the in-progress year would
  // understate it. null when there isn't enough data.
  // `y.year < thisYear` (not `!== thisYear`) is deliberate: it excludes the
  // in-progress year AND anything dated later, so no future/placeholder year
  // can ever be mistaken for the final complete year and crater the CAGR.
  // Window: the individually-plotted complete years only. The base must be
  // STRICTLY after STACK_THROUGH_YEAR — a base year that is absorbed into the
  // grouped history bar is not visible as a bar, so the headline rate would be
  // computed from a year the viewer cannot see (and the base silently changes
  // meaning whenever the grouping moves). Deriving the bound from
  // STACK_THROUGH_YEAR keeps the two in lockstep.
  const growthYears = years.filter(
    (y) => y.year > STACK_THROUGH_YEAR && y.year < thisYear
  );
  let avgGrowthPct = null;
  let growthBaseYear = null;
  if (growthYears.length >= 2) {
    const first = growthYears[0];
    const last = growthYears[growthYears.length - 1];
    const periods = last.year - first.year;
    if (first.total > 0 && periods > 0) {
      avgGrowthPct = (Math.pow(last.total / first.total, 1 / periods) - 1) * 100;
      // Assigned in the SAME branch as the rate, never beside it. The label
      // reads "since <growthBaseYear>", so a base recorded where no rate was
      // computed -- or a rate with no base -- would advertise a window the
      // number was never measured over.
      growthBaseYear = first.year;
    }
  }

  return {
    rows,
    peak,
    avgGrowthPct,
    growthBaseYear,
    cumulative,
    startYear: years[0]?.year ?? START_YEAR,
  };
}

// ---------------------------------------------------------------------------
// 3. Render SVG.
//    Layout: headline total top-left; a bar per year; faint gridlines.
//    Bars: vertical cyan gradient, glowing + pulsing peak, staggered draw-in.
// ---------------------------------------------------------------------------
const W = 820;
const H = 300;
const PAD_LEFT = 56;
const PAD_RIGHT = 28;
const HEAD_TOP = 26; // headline number
// Keep the full plot tableau comfortably below the headline subtitle. All bars,
// labels, gridlines, cumulative curve, era captions, seam and portal geometry
// derive from this box, so moving both edges together preserves their alignment
// while opening a clear gap after "total contributions since <year>".
const PLOT_TOP = 120;
const PLOT_BOTTOM = 260; // baseline; year labels sit below
const PLOT_HEIGHT = PLOT_BOTTOM - PLOT_TOP;
const PLOT_LEFT = PAD_LEFT;
const PLOT_RIGHT = W - PAD_RIGHT;
const PLOT_WIDTH = PLOT_RIGHT - PLOT_LEFT;

// --- Reserved value-label band ---------------------------------------------
// Every bar draws its value label ABOVE its own top edge, i.e. OUTSIDE the
// bar. When bars were scaled into the FULL plot height, a bar approaching
// 100% of scale pushed that label clean out of the plot and into the era
// captions (which sit at PLOT_TOP - 8). That is a STRUCTURAL collision, not
// a data accident: it fired as soon as the peak year passed ~85% of scale.
//
// The cure is to reserve the top of the plot. Bars scale into BAR_HEIGHT and
// are clamped at BAR_CEILING, so LABEL_BAND px of clearance always remains
// above the tallest bar for its label plus the peak bar's soft glow --
// whatever the data does. Gridlines, the baseline, the era bands, the
// cumulative curve and all decoration art still span the FULL
// PLOT_TOP..PLOT_BOTTOM box; only the BARS are inset.
const LABEL_BAND = 26;
const BAR_HEIGHT = PLOT_HEIGHT - LABEL_BAND;
const BAR_CEILING = PLOT_TOP + LABEL_BAND;

// Single source of truth for bar scaling, shared by BOTH bar paths (the
// stacked history bar and the normal single-year bars) so that neither can
// bypass the reserved band. 2px floor so every non-zero year keeps a
// visible tick.
// Floor so every non-zero year shows at least a visible tick, and the gap
// between a bar top and its value label. Both are leaf values, but they are
// named because other derived constants below are expressed in terms of them.
const BAR_MIN_H = 2;
const VALUE_LABEL_GAP = 8;
const scaledBarHeight = (total, yMax) =>
  yMax > 0 && total > 0 ? Math.max((total / yMax) * BAR_HEIGHT, BAR_MIN_H) : 0;
// Top edge of a bar of height h, clamped out of the reserved label band.
const clampedBarTop = (h) => Math.max(PLOT_BOTTOM - h, BAR_CEILING);
// Lowest baseline a value label can take. DERIVED from BAR_CEILING rather than
// restated as a literal: clampedBarTop already guarantees top >= BAR_CEILING,
// so this is a pure backstop and the two numbers cannot drift apart the way an
// independent "PLOT_TOP + 12" could (that literal was in fact unreachable, and
// silently encoded a different clearance from the one the band actually gives).
const LABEL_MIN_Y = BAR_CEILING - VALUE_LABEL_GAP;
const valueLabelBaseline = (top) =>
  Math.max(top - VALUE_LABEL_GAP, LABEL_MIN_Y);

// Corner radius shared by the bars and by the in-progress cap that is drawn on
// top of one. A bar's top edge is only FLAT between x + BAR_RADIUS and
// x + barW - BAR_RADIUS; outside that the rx corner curves away and the pixels
// are transparent. Deriving the cap's inset from the same constant is what
// stops the cap overhanging into thin air if the radius is ever retuned.
const BAR_RADIUS = 5;

// IN-PROGRESS CUE. The current year's bar is a PARTIAL total, but rendered like
// any other bar it reads as a finished one - and it is currently also the peak,
// so it carries the peak glow that shouts "record" rather than "still running".
// The cue is a dashed cap with a slowly marching dash offset, drawn exactly ON
// the bar's top edge.
//
// "Exactly on the edge" is load-bearing, not cosmetic. The only gap between a
// bar top and its value label is 8px (the label baseline is top - 8, and digits
// have no descenders so their ink bottom IS the baseline), and the label also
// carries a 2px legibility halo. Anything floated into that gap would collide.
// Sitting on the edge instead means the cue can never intrude into the reserved
// LABEL_BAND, whatever the bar height.
//
// The dash offset animates 0 -> BAR_CAP_PERIOD, so the period MUST equal
// dash + gap for the loop to be seamless; the CSS dasharray and the animation
// are both derived from these two numbers so they cannot drift apart.
const BAR_CAP_DASH = 5;
const BAR_CAP_GAP = 3;
const BAR_CAP_PERIOD = BAR_CAP_DASH + BAR_CAP_GAP;
// Minimum bar height that can carry the in-progress cap. The cap is a 2px
// stroke centred ON the bar's top edge, so it consumes ~2px of the bar's own
// height. On a bar at or near the 2px minimum floor - every January, when the
// current year has only a handful of contributions - the cap would cover
// essentially the whole bar and read AS the bar rather than as a marker on it.
// Below this height the cue is simply not emitted (no dead markup, no dead
// SMIL); the dimmed year label and the hover tooltip still say the year is in
// progress, so nothing is actually lost.
const BAR_CAP_WIDTH = 2;
// Suppress the cap on a near-empty bar. DERIVED from the cap's own stroke
// width: the cap is centred on the bar's top edge, so it consumes about
// BAR_CAP_WIDTH of the bar's height; below twice that the cap would cover
// essentially the whole bar and read as the bar itself rather than as a cue.
// The year label and the tooltip still say "in progress" when it is suppressed.
const BAR_CAP_MIN_H = BAR_CAP_WIDTH * 2;

// FUTURE RUNWAY. Each trailing placeholder is drawn as a short dashed ghost
// outline resting on the baseline, NOT as a zero-height bar and not as a tick
// laid over the baseline (which just read as a rendering artifact of the solid
// full-width baseline underneath it). Outlined, clearly empty slots read as
// deliberate headroom for years that have not started. Expressed as a fraction
// of the plot so it stays proportional if PLOT_HEIGHT is retuned.
// Snapped to 1dp to match the LANE/artRy convention. The snapping is
// load-bearing rather than cosmetic: this value is interpolated straight into
// geometry attributes, so rounding AT THE SOURCE is what keeps 13-digit floats
// out of the emitted SVG and makes the .toFixed(1) at the call site meaningful
// instead of decorative.
// Tallest the next-year runway outline is ever allowed to be. This gets its OWN
// constant and is deliberately NOT derived from BAR_RADIUS: the two happen to
// want the same handful of pixels today, but one governs data honesty and the
// other is pure corner styling, so retuning the bars' radius for looks must
// never silently change how large an empty slot is allowed to render.
// The previous "PLOT_HEIGHT * 0.09" (12.6px) was a data-honesty bug, not just a
// styling choice: at yMax 8,000 a measured year of 236 contributions renders
// 3.4px tall, so an EMPTY placeholder was drawn ~4x taller than a real bar.
const GHOST_MAX_H = 5;
// The runway outline's stroke and dash pattern live here rather than as CSS
// literals so there is one source of truth for them: they are read both by the
// style block (interpolated, same convention as BAR_CAP_WIDTH and the cap
// dasharray) and by the reasoning below about how short the outline may get.
const GHOST_STROKE = 1.5;
const GHOST_DASH = 4;
// Corner-radius cap for the runway outline, kept well below half its height so
// the rect reads as a short bar-shaped lip rather than a stadium.
const GHOST_RX_MAX = 2;

// Height of the runway outline for a given render: never taller than the
// SHORTEST measured bar, so an empty slot can never out-tower real data no
// matter how yMax moves. Snapped to 1dp like every other derived geometry
// value, since it is interpolated straight into height/y attributes.
//
// There is deliberately NO legibility floor here, and that is a structural
// argument rather than a preference. A floor can only ever RAISE the height, so
// a floor that respects this ceiling is dead code, while a floor that overrides
// it lets an EMPTY slot out-tower a measured year. Honesty therefore wins: it is
// the one property a data chart cannot trade away, and the slot's meaning is
// carried independently by its dimmed year label and its title text.
// No floor is needed in practice either. scaledBarHeight floors every measured
// bar at BAR_MIN_H (2px), so the outline always lands in [BAR_MIN_H,
// GHOST_MAX_H]; at GHOST_STROKE (1.5px) the top and bottom strokes still leave a
// gap even at 2px, so the hollow never fills in and reads as a solid sliver.
const ghostHeightFor = (rows, yMax) => {
  const measured = rows
    .filter((row) => !row.isFuture && row.total > 0)
    .map((row) => scaledBarHeight(row.total, yMax));
  const h = measured.length ? Math.min(GHOST_MAX_H, ...measured) : GHOST_MAX_H;
  // TRUNCATE, do not round. Rounding to 1dp can push the outline a hair ABOVE
  // the shortest measured bar (a 2.75px bar would snap the runway up to 2.8px),
  // which is precisely the honesty bound this helper exists to hold. Flooring can
  // only ever shorten the outline, so the bound survives snapping by
  // construction instead of relying on the call site rounding identically.
  // No risk of collapsing to nothing: scaledBarHeight already floors every
  // measured bar at BAR_MIN_H, so h is always at least 2.
  return Math.floor(h * 10) / 10;
};

// DECORATION LANES. The portal warp rays, the seam gate's launch ports and
// rails, the membrane's vesicles and pores and every particle track used to be
// hardcoded at y = 110/134/158/182/206. Those literals silently encoded ONE
// plot box (92..224): move PLOT_TOP/PLOT_BOTTOM and the entire tableau would
// keep sitting at the old coordinates while the bars, gridlines and baseline
// moved out from under it. Deriving every lane from the live plot box keeps the
// art in sync with any future resize by construction.
const MID_Y = (PLOT_TOP + PLOT_BOTTOM) / 2;
// One lane step. Five lanes (k = -2..2) span 8/11 of the plot height, which
// reproduces the historical 24px step exactly at PLOT_HEIGHT = 132 (132/5.5 =
// 24). Fractional k addresses the in-between machined details (gate jambs at
// +/-1.75 and +/-0.75, membrane cells at +/-1.5).
const LANE_STEP = PLOT_HEIGHT / 5.5;
// Rounded to 0.1 so emitted path data stays compact after a resize (and stays
// byte-identical to the old integer literals at the historical plot size).
const LANE = (k) => Math.round((MID_Y + k * LANE_STEP) * 10) / 10;
const LANES = [-2, -1, 0, 1, 2].map(LANE);

// Distinct colours for the stacked history bar, one per early year (oldest
// first, drawn from the baseline up). Harmonious with the cyan theme but
// individually distinguishable; cycles if there are more years than colours.
// Nine entries for the nine grouped years 2014–22 — keep this list at least as
// long as the group, or the cycle silently repaints late years with an early
// year's colour and the per-year breakdown stops being readable.
const STACK_COLORS = [
  "#a78bfa", // violet
  "#60a5fa", // blue
  "#22d3ee", // cyan
  "#34d399", // emerald
  "#fbbf24", // amber
  "#fb7185", // rose
  "#f472b6", // pink
  "#2dd4bf", // teal
  "#818cf8", // indigo
];

// Colour for one segment of the grouped history bar. FAILS LOUDLY instead of
// cycling. The palette holds exactly as many colours as the default grouping
// has years, so there is zero headroom, and the previous "index modulo length"
// wrapped around in silence: a tenth segment reused the first colour and two
// different years became indistinguishable bands of the same bar.
//
// That is reachable WITHOUT editing this file. Both CUMULATIVE_START_YEAR and
// CUMULATIVE_STACK_THROUGH are environment overrides, so START_YEAR 2010 alone
// already asks for thirteen segments. A thrown error names the cause; a reused
// colour just quietly misrepresents the data, which is worse.
const stackColorFor = (index) => {
  if (index >= STACK_COLORS.length) {
    throw new Error(
      `[cumulative] the grouped history bar needs at least ${index + 1} ` +
        `distinct segment colours but STACK_COLORS has ${STACK_COLORS.length}. ` +
        `Widening the grouping via CUMULATIVE_STACK_THROUGH or CUMULATIVE_START_YEAR ` +
        `requires adding colours to match, or two years render identically.`
    );
  }
  return STACK_COLORS[index];
};

// "Nice" rounded-up max for the y-axis (e.g. 1676 -> 2000; 4206 -> 5000).
// The ladder is deliberately FINER than the classic 1/2/5/10: with only those
// steps the tallest bar swung between 50% and 100% of the plot, so a peak
// crossing a power of ten (5,000 -> 5,001 snapping yMax to 10,000) halved every
// bar in the chart overnight. These steps keep the tallest bar in a ~75-100%
// band year-round, which matters now that the in-progress year is heading for
// 6,000+ (6,000 -> 6,000 = a full-height bar; 6,001 -> 8,000 = 75%).
// A 100%-fill bar is safe because bars are scaled into a reserved band that
// leaves room above them for their own value labels.
const NICE_STEPS = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
const niceMax = (v) => {
  if (v <= 0) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / mag;
  const step = NICE_STEPS.find((s) => n <= s) ?? 10;
  return step * mag;
};

// ---------------------------------------------------------------------------
// Decoration-art VERTICAL EXTENTS.
//
// The portal/gate/membrane art is drawn around MID_Y, and its half-heights were
// originally authored as raw pixel numbers for a 132px plot (LANE_STEP = 24).
// That made every extent silently wrong the moment the plot grew: the lanes
// tracked the new box while the shells, swirls and funnel mouth stayed sized
// for the old one, so the whole portal read as proportionally shrunken.
//
// So express each extent in LANES (multiples of LANE_STEP) instead. The
// multipliers are exact rationals chosen to reproduce the authored pixel values
// at LANE_STEP = 24, so introducing them is a numeric no-op today and a
// verifiable regression check; changing PLOT_HEIGHT now rescales the art with
// the plot automatically. Deliberately NOT named `snap` — a helper by that name
// may already exist and a duplicate top-level const is a SyntaxError.
const artRy = (lanes) => Math.round(LANE_STEP * lanes * 10) / 10;

// Event-horizon glow shells, outermost -> core (authored 64/54/40/27/12).
const PORTAL_AURA_RY = artRy(8 / 3); // 64: past the outer lanes, with margin
const PORTAL_HALO_RY = artRy(2.25); // 54: outer shell
const PORTAL_SHELL_RY = artRy(5 / 3); // 40: mid shell
const PORTAL_INNER_RY = artRy(1.125); // 27: inner shell
const PORTAL_CORE_RY = artRy(0.5); // 12: bright core
// Accretion swirls. The arc RADIUS and the arc ENDPOINT offsets must stay in
// lockstep: derive one and not the other and the arc distorts on resize.
const SWIRL_RY_OUTER = artRy(2); // 48: exactly the outer lane pair
const SWIRL_RY_INNER = artRy(17 / 12); // 34
// Half-height of the funnel mouth where the era band pinches into the portal.
const MOUTH_HALF = artRy(13 / 6); // 52
// Disintegrating wavefront arcs, largest first (authored 46/38/31).
const WAVE_RY_OUTER = artRy(23 / 12); // 46
const WAVE_RY_MID = artRy(19 / 12); // 38
const WAVE_RY_INNER = artRy(31 / 24); // 31

// The new age: 20 rays of light streaming down from above — like divine
// illumination pouring into the future from the top of the chart.
// Each ray is a tapered luminous beam — narrow at the top source, widening
// slightly at its destination — filled with a radial gradient that fades
// from bright ivory at the core to warm amber at the edges. Rays fan outward
// from nearly-vertical: central rays are longest and brightest, edge rays are
// shorter and dimmer, together creating a dramatic top-down illumination.
// One shared phase opacity applied to the complete tableau.
const NEW_AGE_OPACITY = 0.78;
// 20 rays fanning downward from the top-centre of the new age area.
// 0° = horizontal right, 90° = straight down. Central rays go nearly straight
// down; edge rays fan outward to the sides.
const NEW_AGE_RAYS = [
  // Central core — straight down, longest and brightest
  { angle: 88, len: 115, w: 6.0, o: 1.00 },
  { angle: 89, len: 118, w: 5.5, o: 1.00 },
  { angle: 90, len: 120, w: 6.0, o: 1.00 },
  { angle: 91, len: 118, w: 5.5, o: 1.00 },
  { angle: 92, len: 115, w: 6.0, o: 1.00 },
  // Inner right fan
  { angle: 84, len: 110, w: 4.4, o: 0.92 },
  { angle: 80, len: 104, w: 4.0, o: 0.85 },
  { angle: 76, len: 96, w: 3.5, o: 0.78 },
  // Inner left fan
  { angle: 96, len: 110, w: 4.4, o: 0.92 },
  { angle: 100, len: 104, w: 4.0, o: 0.85 },
  { angle: 104, len: 96, w: 3.5, o: 0.78 },
  // Mid right fan
  { angle: 72, len: 84, w: 3.0, o: 0.68 },
  { angle: 68, len: 72, w: 2.6, o: 0.58 },
  // Mid left fan
  { angle: 108, len: 84, w: 3.0, o: 0.68 },
  { angle: 112, len: 72, w: 2.6, o: 0.58 },
  // Outer right — shorter, dimmer
  { angle: 64, len: 58, w: 2.2, o: 0.48 },
  { angle: 60, len: 46, w: 1.8, o: 0.38 },
  // Outer left
  { angle: 116, len: 58, w: 2.2, o: 0.48 },
  { angle: 120, len: 46, w: 1.8, o: 0.38 },
  // Steep accent
  { angle: 56, len: 36, w: 1.5, o: 0.28 },
];

// ---------------------------------------------------------------------------
// Singularity portal: a gold event-horizon seam in the gap between the last
// complete year and the in-progress year, with a hyperdrive warp field
// opening to its RIGHT. Motion language is strictly horizontal (time flows
// left→right in this chart): intake meteors from the seam are absorbed at
// the horizon, and on the right a warp field of horizontal
// rays extends from the seam to the end of the x-axis, drawn BEHIND the
// in-progress bar, with pulses born at the horizon that accelerate
// rightward along the rays. Nothing moves vertically. Same SMIL contract as
// the rest of the chart: the base (non-animated) state IS the finished
// state (no-SMIL surfaces show a complete frozen tableau), reveal delays
// are keyTimes-encoded on begin="0s" animations, loops start only after
// the reveal, and prefers-reduced-motion hides every <animate>/
// <animateTransform>.
function portalDefs(px) {
  const R = PLOT_RIGHT;
  const X = px.toFixed(1);
  // Horizontal fade for a warp ray: bright at the portal, gone at plot right.
  const exit = (id, c0, c1) =>
    `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${X}" y1="0" x2="${R}" y2="0">
      <stop offset="0%" stop-color="${c0}" stop-opacity="0.95"/>
      <stop offset="55%" stop-color="${c1}" stop-opacity="0.5"/>
      <stop offset="100%" stop-color="${c1}" stop-opacity="0"/>
    </linearGradient>`;
  return `<radialGradient id="portalAura" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0%" stop-color="#84cc16" stop-opacity="0.26"/>
      <stop offset="60%" stop-color="#84cc16" stop-opacity="0.10"/>
      <stop offset="100%" stop-color="#84cc16" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="portalAuraLight" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0%" stop-color="#4d7c0f" stop-opacity="0.15"/>
      <stop offset="60%" stop-color="#4d7c0f" stop-opacity="0.06"/>
      <stop offset="100%" stop-color="#4d7c0f" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="rmGlow" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0%" stop-color="#a3e635" stop-opacity="0.5"/>
      <stop offset="60%" stop-color="#84cc16" stop-opacity="0.2"/>
      <stop offset="100%" stop-color="#84cc16" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="rmGlowLight" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0%" stop-color="#65a30d" stop-opacity="0.35"/>
      <stop offset="60%" stop-color="#4d7c0f" stop-opacity="0.14"/>
      <stop offset="100%" stop-color="#4d7c0f" stop-opacity="0"/>
    </radialGradient>
    ${exit("exitGold", "#d9f99d", "#84cc16")}
    ${exit("exitCyan", "#65a30d", "#4d7c0f")}
    ${exit("exitViolet", "#bef264", "#a3e635")}
    ${exit("exitGoldL", "#65a30d", "#4d7c0f")}
    ${exit("exitCyanL", "#4d7c0f", "#365314")}
    ${exit("exitVioletL", "#84cc16", "#65a30d")}
    <clipPath id="portalGap"><rect x="${(px - 24).toFixed(1)}" y="${PLOT_TOP - 24}" width="40" height="${PLOT_HEIGHT + 48}"/></clipPath>
    <filter id="portalWobble" filterUnits="userSpaceOnUse" x="${(px - 44).toFixed(1)}" y="${PLOT_TOP - 24}" width="88" height="${PLOT_HEIGHT + 48}">
      <feTurbulence type="fractalNoise" baseFrequency="0.02 0.05" numOctaves="3" seed="7" result="n"/>
      <feDisplacementMap in="SourceGraphic" in2="n" scale="6" xChannelSelector="R" yChannelSelector="G"/>
    </filter>`;
}

// Warp field RIGHT of the seam: rendered before the bars so the whole field
// sits behind the in-progress year's bar (the singularity era extends
// through it to the end of the x-axis). A vortex tunnel seen side-on: six
// gently curved rays shoot out of the seam and converge toward the field's
// midline (the funnel narrowing into the distance), small pulses born at
// the horizon accelerate rightward along them, and tiny star motes stream
// across the field. All motion is strictly left→right; the curvature is
// static geometry. The shared horizontal gradients fade everything to
// nothing at the right edge, so the whole field dissolves exactly at the
// end of the axis.
function portalFieldMarkup(px) {
  const X = px.toFixed(1);
  const R = PLOT_RIGHT;
  const midY = MID_Y;
  const span = R - px;
  // Exit cone: rays burst OUT of the portal mouth — born tight around the
  // portal centre, diverging outward to full plot height at the right edge
  // (the singularity expands what passes through it).
  const rayPath = (y) => {
    const yStart = midY + (y - midY) * 0.16;
    const c1x = (px + span * 0.3).toFixed(1);
    const c2x = (px + span * 0.68).toFixed(1);
    return `M ${X} ${yStart.toFixed(1)} C ${c1x} ${yStart.toFixed(1)} ${c2x} ${y} ${R} ${y}`;
  };
  const ray = (y, cls, drawDur, dash, pulseDur) =>
    `<path d="${rayPath(y)}" class="portal-ray ${cls}" pathLength="1" stroke-dasharray="1 1">
      <animate attributeName="stroke-dashoffset" values="1;1;0" keyTimes="0;0.6;1" begin="0s" dur="${drawDur}s" fill="freeze" calcMode="spline" keySplines="0 0 1 1;0.3 0 0.2 1"/>
    </path>
    <path d="${rayPath(y)}" class="portal-pulse ${cls}" pathLength="1" stroke-dasharray="${dash} ${(1 - dash).toFixed(2)}" opacity="0.9">
      <animate attributeName="opacity" values="0;0;0.9" keyTimes="0;0.85;1" begin="0s" dur="2.8s" fill="freeze"/>
      <animate attributeName="stroke-dashoffset" values="1;0" begin="2.8s" dur="${pulseDur}s" repeatCount="indefinite" calcMode="spline" keyTimes="0;1" keySplines="0.55 0 1 1"/>
    </path>`;
  // Star motes: tiny specks streaming left→right through the tunnel. Each
  // one BREAKS THE BARRIER at the singularity: a brief head-swell right at
  // the crossing plus an expanding shockwave ring left behind at the horizon
  // (vapour-cone style), which dissipates while the mote races on. Base =
  // faint specks resting mid-field; the boom ring's base state is invisible
  // (it's transient, so the frozen tableau simply omits it).
  const mote = (x0, y, r, cls, begin, dur) => {
    // Diverging flight: enters the portal at the pinched mouth (near midY),
    // spreads outward to its own lane by the right edge. (The arrival boom
    // is owned by the intake meteors on the seam side — one cause, one bang.)
    const dy0 = (midY - y) * 0.84;
    return `<circle cx="${(px + x0).toFixed(1)}" cy="${y}" r="${r}" class="portal-mote ${cls}" opacity="0.35">
      <animateTransform attributeName="transform" type="translate" values="${-x0} ${dy0.toFixed(1)};${(span - x0 - 8).toFixed(1)} 0" begin="${begin}" dur="${dur}" repeatCount="indefinite" calcMode="spline" keyTimes="0;1" keySplines="0.55 0 1 1"/>
      <animate attributeName="r" values="${r};${(r * 1.8).toFixed(2)};${r};${r}" keyTimes="0;0.1;0.28;1" begin="${begin}" dur="${dur}" repeatCount="indefinite"/>
      <animate attributeName="opacity" values="0;1;0.55;0" keyTimes="0;0.25;0.75;1" begin="${begin}" dur="${dur}" repeatCount="indefinite"/>
    </circle>`;
  };
  // Disintegrating waves: right-bowed wavefront arcs born at the seam that
  // drift SLOWLY down the tunnel to the end of the x-axis, their stroke
  // crumbling into fragments (animated dasharray) and fading as they go.
  // Base = a faint, partially-crumbled wave train near the mouth.
  const wave = (x0, h, cls, begin, dur) => {
    const wx = (px + x0).toFixed(1);
    // Expanding wavefront: leaves the mouth small, grows to full height h as
    // it travels down the widening cone.
    const arc = (hh) =>
      `M ${wx} ${(midY - hh).toFixed(1)} Q ${(px + x0 + 16).toFixed(1)} ${midY} ${wx} ${(midY + hh).toFixed(1)}`;
    const d0 = arc(h * 0.35);
    return `<path d="${d0}" class="portal-wave ${cls}" pathLength="1" stroke-dasharray="0.11 0.08" opacity="0.3">
      <animate attributeName="d" values="${d0};${arc(h)}" keyTimes="0;1" begin="${begin}" dur="${dur}" repeatCount="indefinite"/>
      <animateTransform attributeName="transform" type="translate" values="0 0;${(span - x0 - 20).toFixed(1)} 0" begin="${begin}" dur="${dur}" repeatCount="indefinite" calcMode="spline" keyTimes="0;1" keySplines="0.4 0 0.9 1"/>
      <animate attributeName="stroke-dasharray" values="1 0;0.28 0.05;0.04 0.15" keyTimes="0;0.45;1" begin="${begin}" dur="${dur}" repeatCount="indefinite"/>
      <animate attributeName="opacity" values="0;0.5;0.32;0" keyTimes="0;0.2;0.65;1" begin="${begin}" dur="${dur}" repeatCount="indefinite"/>
    </path>`;
  };
  return `
  <g class="narrative-context narrative-field">
    <rect x="${(px - 30).toFixed(1)}" y="${PLOT_TOP}" width="40" height="${PLOT_HEIGHT}" fill="url(#portalAura)" class="portal-aura" opacity="0.7">
      <animate attributeName="opacity" values="0;0;0.7" keyTimes="0;0.5;1" begin="0s" dur="2.2s" fill="freeze"/>
      <animate attributeName="opacity" values="0.7;0.45;0.7" begin="2.2s" dur="3.6s" repeatCount="indefinite"/>
    </rect>
    <ellipse cx="${(px - 4).toFixed(1)}" cy="${midY}" rx="11" ry="${PORTAL_AURA_RY}" class="rm-glowEl" opacity="0.7">
      <animate attributeName="opacity" values="0;0;0.7" keyTimes="0;0.5;1" begin="0s" dur="2.4s" fill="freeze"/>
      <animate attributeName="opacity" values="0.7;0.45;0.7" begin="2.4s" dur="3.6s" repeatCount="indefinite"/>
    </ellipse>
    ${ray(LANES[0], "px-gold", 2.3, 0.09, 0.9)}
    ${ray(LANES[1], "px-cyan", 2.5, 0.07, 0.9)}
    ${ray(LANES[2], "px-violet", 2.4, 0.08, 0.9)}
    ${ray(LANES[3], "px-gold", 2.6, 0.06, 0.9)}
    ${ray(LANES[4], "px-cyan", 2.35, 0.09, 0.9)}
    ${wave(10, WAVE_RY_OUTER, "pw-violet", "2.8s", "1.2s")}
    ${wave(15, WAVE_RY_MID, "pw-cyan", "3.2s", "1.2s")}
    ${wave(20, WAVE_RY_INNER, "pw-gold", "3.6s", "1.2s")}
    ${mote(16, LANES[0], 1.1, "pm-cyan", "2.8s", "0.9s")}
    ${mote(34, LANES[1], 0.9, "pm-gold", "3.1s", "0.9s")}
    ${mote(24, LANES[2], 1.3, "pm-violet", "2.95s", "0.9s")}
    ${mote(42, LANES[3], 0.9, "pm-gold", "3.25s", "0.9s")}
    ${mote(20, LANES[4], 1.1, "pm-cyan", "3.4s", "0.9s")}
  </g>`;
}

// Seam-side markup (drawn ABOVE the bars): the intake streaks absorbed at
// the horizon, the aura, the seam itself and its label.
// Enlightenment phase: the singularity's particles resolve into a bounded
// upper-right cloud aperture. The rays point from that aperture down-left and
// stop before the plot edges; the destination is atmospheric context, never a
// measured bar or a claim about contributions beyond the future placeholder.
function enlightenmentDefs() {
  return `<radialGradient id="newAgeRayGrad" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.82"/>
      <stop offset="28%" stop-color="#fff7cc" stop-opacity="0.64"/>
      <stop offset="62%" stop-color="#fde68a" stop-opacity="0.32"/>
      <stop offset="100%" stop-color="#f59e0b" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="newAgeRayGradLight" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.88"/>
      <stop offset="28%" stop-color="#fff7cc" stop-opacity="0.58"/>
      <stop offset="62%" stop-color="#fbbf24" stop-opacity="0.28"/>
      <stop offset="100%" stop-color="#d97706" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="newAgeLiquidGrad" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#fde68a" stop-opacity="0"/>
      <stop offset="35%" stop-color="#fff7cc" stop-opacity="0.72"/>
      <stop offset="50%" stop-color="#ffffff" stop-opacity="0.85"/>
      <stop offset="65%" stop-color="#fff7cc" stop-opacity="0.72"/>
      <stop offset="100%" stop-color="#f59e0b" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="newAgeLiquidGradLight" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#d97706" stop-opacity="0"/>
      <stop offset="35%" stop-color="#fbbf24" stop-opacity="0.55"/>
      <stop offset="50%" stop-color="#fff7cc" stop-opacity="0.72"/>
      <stop offset="65%" stop-color="#fbbf24" stop-opacity="0.55"/>
      <stop offset="100%" stop-color="#d97706" stop-opacity="0"/>
    </linearGradient>
    <filter id="newAgeGlow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="1.8" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>`;
}

function enlightenmentMarkup(portalX) {
  // Rays stream down from the top of the new-age zone — like light from above.
  const srcX = (portalX + PLOT_RIGHT) / 2;
  const srcY = PLOT_TOP + 6;
  // Each ray is a tapered polygon: narrow at the source, widening at the tip.
  // The beam runs from the singularity boundary out into the new age.
  const rayPolygon = (ray, i) => {
    const rad = (ray.angle * Math.PI) / 180;
    const cosA = Math.cos(rad);
    const sinA = Math.sin(rad);
    // Destination center
    const ex = srcX + ray.len * cosA;
    const ey = srcY + ray.len * sinA;
    // Perpendicular direction for beam width
    const px = -sinA;
    const py = cosA;
    // Source half-width (tight near the singularity)
    const sw = 0.4 + ray.w * 0.08;
    // Destination half-width
    const dw = ray.w * 0.5;
    const p = (x, y) => `${x.toFixed(1)} ${y.toFixed(1)}`;
    const points = [
      p(srcX + px * sw, srcY + py * sw),
      p(ex + px * dw, ey + py * dw),
      p(ex - px * dw, ey - py * dw),
      p(srcX - px * sw, srcY - py * sw),
    ];
    const opacity = (ray.o * NEW_AGE_OPACITY).toFixed(2);
    return `<polygon points="${points.join(" ")}" class="new-age-ray" opacity="${opacity}"/>`;
  };
  // Liquid droplets: organic rounded blobs that ride on top of each ray,
  // vibrating (pulsing opacity), breathing (pulsing size), and propagating
  // (sliding along the beam). Inspired by Prisoma's liquid UI shapes —
  // soft, rounded, organically animated.
  const liquidDroplet = (ray, i) => {
    const rad = (ray.angle * Math.PI) / 180;
    const cosA = Math.cos(rad);
    const sinA = Math.sin(rad);
    // Droplet sits 40% down the ray from source
    const frac = 0.4;
    const mx = srcX + ray.len * cosA * frac;
    const my = srcY + ray.len * sinA * frac;
    // Ellipse aligned with ray: rx ~25% of ray length, ry ~35% of ray width
    const rx = (ray.len * 0.25).toFixed(1);
    const ry = (ray.w * 0.35).toFixed(1);
    const angleDeg = ray.angle.toFixed(1);
    // Staggered animation timing
    const begin = (i * 0.28).toFixed(2);
    // Translate: slide the droplet down the ray and back (propagating)
    const travelX = (ray.len * cosA * 0.35).toFixed(1);
    const travelY = (ray.len * sinA * 0.35).toFixed(1);
    return `<g class="new-age-liquid">
      <ellipse cx="${mx.toFixed(1)}" cy="${my.toFixed(1)}" rx="${rx}" ry="${ry}" transform="rotate(${angleDeg} ${mx.toFixed(1)} ${my.toFixed(1)})" class="new-age-droplet">
        <animate attributeName="opacity" values="0.35;0.68;0.35" keyTimes="0;0.48;1" begin="${begin}s" dur="2.8s" repeatCount="indefinite" calcMode="spline" keySplines="0.42 0 0.58 1;0.42 0 0.58 1"/>
        <animate attributeName="ry" values="${ry};${(parseFloat(ry) * 1.45).toFixed(1)};${ry}" keyTimes="0;0.52;1" begin="${begin}s" dur="2.8s" repeatCount="indefinite" calcMode="spline" keySplines="0.42 0 0.58 1;0.42 0 0.58 1"/>
      </ellipse>
      <animateTransform attributeName="transform" type="translate" values="0 0;${travelX} ${travelY};0 0" keyTimes="0;0.5;1" begin="${begin}s" dur="3.4s" repeatCount="indefinite" calcMode="spline" keySplines="0.38 0 0.82 1;0.38 0 0.82 1"/>
    </g>`;
  };
  return `
  <g class="narrative-enlightenment">
    <title>the new age: 20 rays of light streaming from above, each carrying a liquid droplet that pulsates and propagates</title>
    ${NEW_AGE_RAYS.map(rayPolygon).join("\n    ")}
    ${NEW_AGE_RAYS.map((r, i) => liquidDroplet(r, i)).join("\n    ")}
  </g>
  <g class="new-age-label" opacity="${NEW_AGE_OPACITY}">
    <text x="${(PLOT_RIGHT - 2).toFixed(1)}" y="${(PLOT_TOP - 8).toFixed(1)}" text-anchor="end" class="new-age-text">the new age</text>
  </g>`;
}

function portalMarkup(px, fromLabel, toLabel) {
  const X = px.toFixed(1);
  const CX = (px - 4).toFixed(1);
  const top = PLOT_TOP;
  const bot = PLOT_BOTTOM;
  const midY = (top + bot) / 2;
  const title = escapeXML(`${fromLabel} → ${toLabel}: singularity`);

  return `
  <g class="narrative-context narrative-portal">
    <title>${title}</title>
    <g filter="url(#portalWobble)" clip-path="url(#portalGap)">
      <animate attributeName="opacity" values="0;0;1" keyTimes="0;0.5;1" begin="0s" dur="2.4s" fill="freeze"/>
      <ellipse cx="${CX}" cy="${midY}" rx="13" ry="${PORTAL_HALO_RY}" class="rm-g1">
        <animateTransform attributeName="transform" type="rotate" values="0 ${CX} ${midY};4 ${CX} ${midY};0 ${CX} ${midY};-4 ${CX} ${midY};0 ${CX} ${midY}" begin="2.4s" dur="7.2s" repeatCount="indefinite"/>
      </ellipse>
      <ellipse cx="${CX}" cy="${midY}" rx="9.5" ry="${PORTAL_SHELL_RY}" class="rm-g2">
        <animateTransform attributeName="transform" type="rotate" values="0 ${CX} ${midY};-5 ${CX} ${midY};0 ${CX} ${midY};5 ${CX} ${midY};0 ${CX} ${midY}" keyTimes="0;0.28;0.5;0.78;1" begin="2.4s" dur="3.6s" repeatCount="indefinite"/>
      </ellipse>
      <ellipse cx="${CX}" cy="${midY}" rx="6" ry="${PORTAL_INNER_RY}" class="rm-g3">
        <animateTransform attributeName="transform" type="rotate" values="0 ${CX} ${midY};6 ${CX} ${midY};0 ${CX} ${midY};-6 ${CX} ${midY};0 ${CX} ${midY}" keyTimes="0;0.22;0.5;0.72;1" begin="2.4s" dur="3.6s" repeatCount="indefinite"/>
      </ellipse>
      <ellipse cx="${CX}" cy="${midY}" rx="3" ry="${PORTAL_CORE_RY}" class="rm-core">
        <animate attributeName="ry" values="${PORTAL_CORE_RY};${artRy(0.605)};${PORTAL_CORE_RY}" begin="2.4s" dur="3.6s" repeatCount="indefinite"/>
      </ellipse>
      <path d="M ${CX} ${(midY - SWIRL_RY_OUTER).toFixed(1)} A 11.5 ${SWIRL_RY_OUTER} 0 1 1 ${(px - 4.1).toFixed(1)} ${(midY - SWIRL_RY_OUTER).toFixed(1)} Z" class="rm-swirl" pathLength="1" stroke-dasharray="0.16 0.09">
        <animate attributeName="stroke-dashoffset" values="1;0" begin="2.4s" dur="3.6s" repeatCount="indefinite"/>
      </path>
      <path d="M ${CX} ${(midY - SWIRL_RY_INNER).toFixed(1)} A 7.5 ${SWIRL_RY_INNER} 0 1 1 ${(px - 4.1).toFixed(1)} ${(midY - SWIRL_RY_INNER).toFixed(1)} Z" class="rm-swirl" pathLength="1" stroke-dasharray="0.13 0.12">
        <animate attributeName="stroke-dashoffset" values="0;1" begin="2.4s" dur="3.6s" repeatCount="indefinite"/>
      </path>
    </g>
  </g>
  <g class="narrative-label">
    <text x="${X}" y="${top - 8}" text-anchor="middle" class="portal-text">singularity
      <animate attributeName="opacity" values="0;0;1" keyTimes="0;0.7;1" begin="0s" dur="2.6s" fill="freeze"/>
      <animate attributeName="opacity" values="1;0.75;1" begin="2.6s" dur="3.6s" repeatCount="indefinite"/>
    </text>
  </g>`;
}

// Gold mirror seam: the revived double-line "glass" seam from the previous
// design, now marking where the agentic-engineering era begins (the gap
// before 2024). A soft gold band extends rightward from the seam and fades
// out just before the green portal, so the two graphics never blend. Same
// SMIL contract as everything else. All gradients/filters are
// userSpaceOnUse (zero-width-bbox rule, see portalDefs).
function seamDefs(sx, endX) {
  const X = sx.toFixed(1);
  const E = endX.toFixed(1);
  return `<linearGradient id="seamGrad" gradientUnits="userSpaceOnUse" x1="${X}" y1="${PLOT_TOP}" x2="${X}" y2="${PLOT_BOTTOM}">
      <stop offset="0%" stop-color="#f59e0b"/>
      <stop offset="50%" stop-color="#fde68a"/>
      <stop offset="100%" stop-color="#f59e0b"/>
    </linearGradient>
    <linearGradient id="seamGradLight" gradientUnits="userSpaceOnUse" x1="${X}" y1="${PLOT_TOP}" x2="${X}" y2="${PLOT_BOTTOM}">
      <stop offset="0%" stop-color="#a16207"/>
      <stop offset="50%" stop-color="#eab308"/>
      <stop offset="100%" stop-color="#a16207"/>
    </linearGradient>
    <radialGradient id="seamAuraGrad" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0%" stop-color="#fbbf24" stop-opacity="0.14"/>
      <stop offset="60%" stop-color="#fbbf24" stop-opacity="0.085"/>
      <stop offset="100%" stop-color="#fbbf24" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="seamAuraGradLight" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0%" stop-color="#d97706" stop-opacity="0.15"/>
      <stop offset="60%" stop-color="#d97706" stop-opacity="0.06"/>
      <stop offset="100%" stop-color="#d97706" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="seamGlassGrad" gradientUnits="userSpaceOnUse" x1="${X}" y1="${PLOT_TOP}" x2="${X}" y2="${PLOT_BOTTOM}">
      <stop offset="0%" stop-color="#fde68a" stop-opacity="0.08"/>
      <stop offset="50%" stop-color="#fef3c7" stop-opacity="0.28"/>
      <stop offset="100%" stop-color="#fde68a" stop-opacity="0.08"/>
    </linearGradient>
    <linearGradient id="seamGlassGradLight" gradientUnits="userSpaceOnUse" x1="${X}" y1="${PLOT_TOP}" x2="${X}" y2="${PLOT_BOTTOM}">
      <stop offset="0%" stop-color="#f59e0b" stop-opacity="0.06"/>
      <stop offset="50%" stop-color="#fbbf24" stop-opacity="0.2"/>
      <stop offset="100%" stop-color="#f59e0b" stop-opacity="0.06"/>
    </linearGradient>
    <linearGradient id="seamFieldGrad" gradientUnits="userSpaceOnUse" x1="${X}" y1="0" x2="${E}" y2="0">
      <stop offset="0%" stop-color="#fbbf24" stop-opacity="0.20"/>
      <stop offset="22%" stop-color="#eab308" stop-opacity="0.22"/>
      <stop offset="45%" stop-color="#bef264" stop-opacity="0.30"/>
      <stop offset="62%" stop-color="#a3e635" stop-opacity="0.34"/>
      <stop offset="67%" stop-color="#84cc16" stop-opacity="0.32"/>
      <stop offset="78%" stop-color="#a3e635" stop-opacity="0.30"/>
      <stop offset="88%" stop-color="#fbbf24" stop-opacity="0.26"/>
      <stop offset="96%" stop-color="#fde68a" stop-opacity="0.20"/>
      <stop offset="100%" stop-color="#fff7cc" stop-opacity="0.13"/>
    </linearGradient>
    <linearGradient id="seamFieldGradLight" gradientUnits="userSpaceOnUse" x1="${X}" y1="0" x2="${E}" y2="0">
      <stop offset="0%" stop-color="#d97706" stop-opacity="0.26"/>
      <stop offset="22%" stop-color="#eab308" stop-opacity="0.24"/>
      <stop offset="35%" stop-color="#a3a80c" stop-opacity="0.24"/>
      <stop offset="58%" stop-color="#84cc16" stop-opacity="0.25"/>
      <stop offset="67%" stop-color="#4d7c0f" stop-opacity="0.25"/>
      <stop offset="78%" stop-color="#65a30d" stop-opacity="0.24"/>
      <stop offset="88%" stop-color="#a16207" stop-opacity="0.20"/>
      <stop offset="96%" stop-color="#d97706" stop-opacity="0.18"/>
      <stop offset="100%" stop-color="#f59e0b" stop-opacity="0.13"/>
    </linearGradient>
    <linearGradient id="intakeTailGrad" gradientUnits="userSpaceOnUse" x1="${(sx + 2.8).toFixed(1)}" y1="0" x2="${(sx + 18.8).toFixed(1)}" y2="0">
      <stop offset="0%" stop-color="#fbbf24" stop-opacity="0"/>
      <stop offset="60%" stop-color="#fbbf24" stop-opacity="0.55"/>
      <stop offset="100%" stop-color="#fde68a" stop-opacity="1"/>
    </linearGradient>
    <linearGradient id="intakeTailGradLight" gradientUnits="userSpaceOnUse" x1="${(sx + 2.8).toFixed(1)}" y1="0" x2="${(sx + 18.8).toFixed(1)}" y2="0">
      <stop offset="0%" stop-color="#b45309" stop-opacity="0"/>
      <stop offset="60%" stop-color="#b45309" stop-opacity="0.5"/>
      <stop offset="100%" stop-color="#d97706" stop-opacity="1"/>
    </linearGradient>
    <filter id="seamGlowSoft" filterUnits="userSpaceOnUse" x="${(sx - 46).toFixed(1)}" y="${PLOT_TOP - 34}" width="92" height="${PLOT_HEIGHT + 68}">
      <feGaussianBlur stdDeviation="0.9" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>`;
}

// Origin-membrane defs: the organic living-bilayer construct lives at the
// PLOT origin (the "human engineering" era, 2014 -> seam). It needs its OWN
// userSpaceOnUse gradients and filter instances pinned to ox — reusing the
// sx-pinned seam filters would clip the displaced strokes to an empty
// region and silently blank the membrane.
function originDefs(mx, ox, sx) {
  const X = mx.toFixed(1);
  const B = ox.toFixed(1);
  return `<linearGradient id="originGrad" gradientUnits="userSpaceOnUse" x1="${X}" y1="${PLOT_TOP}" x2="${X}" y2="${PLOT_BOTTOM}">
      <stop offset="0%" stop-color="#e11d48"/>
      <stop offset="50%" stop-color="#fda4af"/>
      <stop offset="100%" stop-color="#e11d48"/>
    </linearGradient>
    <linearGradient id="originGradLight" gradientUnits="userSpaceOnUse" x1="${X}" y1="${PLOT_TOP}" x2="${X}" y2="${PLOT_BOTTOM}">
      <stop offset="0%" stop-color="#9f1239"/>
      <stop offset="50%" stop-color="#e11d48"/>
      <stop offset="100%" stop-color="#9f1239"/>
    </linearGradient>
    <radialGradient id="originAuraGrad" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0%" stop-color="#fb7185" stop-opacity="0.14"/>
      <stop offset="60%" stop-color="#fb7185" stop-opacity="0.085"/>
      <stop offset="100%" stop-color="#fb7185" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="originAuraGradLight" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0%" stop-color="#be123c" stop-opacity="0.15"/>
      <stop offset="60%" stop-color="#be123c" stop-opacity="0.06"/>
      <stop offset="100%" stop-color="#be123c" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="originGlassGrad" gradientUnits="userSpaceOnUse" x1="${X}" y1="${PLOT_TOP}" x2="${X}" y2="${PLOT_BOTTOM}">
      <stop offset="0%" stop-color="#fda4af" stop-opacity="0.08"/>
      <stop offset="50%" stop-color="#fecdd3" stop-opacity="0.28"/>
      <stop offset="100%" stop-color="#fda4af" stop-opacity="0.08"/>
    </linearGradient>
    <linearGradient id="originGlassGradLight" gradientUnits="userSpaceOnUse" x1="${X}" y1="${PLOT_TOP}" x2="${X}" y2="${PLOT_BOTTOM}">
      <stop offset="0%" stop-color="#e11d48" stop-opacity="0.06"/>
      <stop offset="50%" stop-color="#f43f5e" stop-opacity="0.2"/>
      <stop offset="100%" stop-color="#e11d48" stop-opacity="0.06"/>
    </linearGradient>
    <linearGradient id="originBand" gradientUnits="userSpaceOnUse" x1="${B}" y1="0" x2="${sx.toFixed(1)}" y2="0">
      <stop offset="0%" stop-color="#fb7185" stop-opacity="0.18"/>
      <stop offset="40%" stop-color="#f43f5e" stop-opacity="0.14"/>
      <stop offset="72%" stop-color="#fb923c" stop-opacity="0.18"/>
      <stop offset="100%" stop-color="#fbbf24" stop-opacity="0.22"/>
    </linearGradient>
    <linearGradient id="originBandLight" gradientUnits="userSpaceOnUse" x1="${B}" y1="0" x2="${sx.toFixed(1)}" y2="0">
      <stop offset="0%" stop-color="#9f1239" stop-opacity="0.20"/>
      <stop offset="40%" stop-color="#be123c" stop-opacity="0.16"/>
      <stop offset="72%" stop-color="#c2410c" stop-opacity="0.20"/>
      <stop offset="100%" stop-color="#d97706" stop-opacity="0.24"/>
    </linearGradient>
    <filter id="originGlowSoft" filterUnits="userSpaceOnUse" x="${(mx - 46).toFixed(1)}" y="${PLOT_TOP - 34}" width="92" height="${PLOT_HEIGHT + 68}">
      <feGaussianBlur stdDeviation="1.5" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <filter id="originMembrane" filterUnits="userSpaceOnUse" x="${(mx - 18).toFixed(1)}" y="${PLOT_TOP - 8}" width="36" height="${PLOT_HEIGHT + 16}">
      <feTurbulence type="fractalNoise" baseFrequency="0.008 0.09" numOctaves="2" seed="11" result="n"/>
      <feDisplacementMap in="SourceGraphic" in2="n" scale="3.0" xChannelSelector="R" yChannelSelector="G"/>
    </filter>`;
}

// Gold era band behind the bars: seam → just before the portal, plus the
// era's particle traffic. SPEED GRAMMAR: motion accelerates left→right
// across the whole chart — pre-seam drifters crawl (7.2s), gold-era motes
// cruise (3.6s), the intake meteors rush (2.4s), and past the
// singularity the warp field snaps to 0.6s: an extreme jump, time itself
// speeding up through the eras.
function seamFieldMarkup(sx, endX) {
  const span = endX - sx;
  // Pre-seam drifters: near-still specks of the pre-agentic era, crawling
  // toward the seam. Base = faint speck mid-journey (frozen tableau).
  const drift = (x0, x1, y, r, begin) => {
    const cx = (x0 + x1) / 2;
    return `<circle cx="${cx.toFixed(1)}" cy="${y}" r="${r}" class="drift-mote" opacity="0.22">
      <animateTransform attributeName="transform" type="translate" values="${(x0 - cx).toFixed(1)} 0;${(x1 - cx).toFixed(1)} 0" begin="${begin}" dur="7.2s" repeatCount="indefinite" calcMode="spline" keyTimes="0;1" keySplines="0.3 0 0.7 1"/>
      <animate attributeName="opacity" values="0;0.5;0.35;0" keyTimes="0;0.15;0.8;1" begin="${begin}" dur="7.2s" repeatCount="indefinite"/>
    </circle>`;
  };
  const midY = MID_Y;
  // Gold-era motes: born at the seam, cruising toward the portal and
  // funnelling toward its centre. Each is a gold/lime crossfade pair so the
  // particle's colour tracks the band beneath it (gold hands off to green
  // mid-flight instead of snapping at the portal).
  const goldMote = (x0, y, r, begin) => {
    const dy = ((midY - y) * 0.55).toFixed(1);
    const cx = (sx + x0).toFixed(1);
    const end = (span - x0 - 6).toFixed(1);
    return `<g>
      <circle cx="${cx}" cy="${y}" r="${r}" class="seam-mote" opacity="0.3">
        <animate attributeName="opacity" values="0;0.7;0.35;0;0" keyTimes="0;0.2;0.5;0.72;1" begin="${begin}" dur="3.6s" repeatCount="indefinite"/>
      </circle>
      <circle cx="${cx}" cy="${y}" r="${r}" class="seam-mote-lime" opacity="0">
        <animate attributeName="opacity" values="0;0;0.35;0.6;0" keyTimes="0;0.35;0.55;0.8;1" begin="${begin}" dur="3.6s" repeatCount="indefinite"/>
      </circle>
      <animateTransform attributeName="transform" type="translate" values="${-x0} 0;${end} ${dy}" begin="${begin}" dur="3.6s" repeatCount="indefinite" calcMode="spline" keyTimes="0;1" keySplines="0.4 0 1 1"/>
    </g>`;
  };
  // Intake meteors: launched FROM the seam line itself, crossing the whole
  // agentic-engineering band and diving INTO the portal mouth, accelerating
  // the whole way, igniting at the horizon and decaying over the final
  // approach. The head crossfades gold->lime mid-flight; the arrival
  // detonates a shockwave ring on the same lane at the portal (transient,
  // base-invisible). Tail gradient is userSpaceOnUse in local coordinates,
  // so it travels with the group.
  const intake = (y, begin) => {
    const x1 = sx + 2.8;
    const x2 = x1 + 16;
    const dy = (midY - y) * 0.8;
    const run = endX - 7 - x2;
    const angle = ((Math.atan2(dy, run) * 180) / Math.PI).toFixed(2);
    const boomX = (endX - 4).toFixed(1);
    const boomY = (y + dy).toFixed(1);
    return `<g opacity="0.3">
      <g transform="rotate(${angle} ${x2.toFixed(1)} ${y})">
        <line x1="${x1.toFixed(1)}" y1="${y}" x2="${x2.toFixed(1)}" y2="${y}" class="intake-tail"/>
        <circle cx="${x2.toFixed(1)}" cy="${y}" r="1.4" class="intake-head">
          <animate attributeName="opacity" values="1;1;0.25" keyTimes="0;0.55;1" begin="${begin}" dur="2.4s" repeatCount="indefinite"/>
        </circle>
        <circle cx="${x2.toFixed(1)}" cy="${y}" r="1.4" class="intake-head-lime" opacity="0">
          <animate attributeName="opacity" values="0;0;1" keyTimes="0;0.55;1" begin="${begin}" dur="2.4s" repeatCount="indefinite"/>
        </circle>
      </g>
      <animateTransform attributeName="transform" type="translate" values="0 0;${run.toFixed(1)} ${dy.toFixed(1)}" begin="${begin}" dur="2.4s" repeatCount="indefinite" calcMode="spline" keyTimes="0;1" keySplines="0.45 0 1 1"/>
      <animate attributeName="opacity" values="0;0.85;1;0.85;0" keyTimes="0;0.06;0.6;0.85;1" begin="${begin}" dur="2.4s" repeatCount="indefinite"/>
    </g>
    <circle cx="${boomX}" cy="${boomY}" r="1.5" class="portal-boom" opacity="0">
      <animate attributeName="r" values="1.5;1.5;9;11" keyTimes="0;0.86;0.95;1" begin="${begin}" dur="2.4s" repeatCount="indefinite"/>
      <animate attributeName="opacity" values="0;0;0.75;0" keyTimes="0;0.86;0.9;1" begin="${begin}" dur="2.4s" repeatCount="indefinite"/>
    </circle>`;
  };
  // Band narrows into the portal mouth and re-expands past it — an hourglass
  // with CURVED walls: flat near the seam, diving hard at the portal (trumpet
  // funnel in), then flaring back out along the same curvature as the exit
  // rays. One gradient carries the whole run seam -> portal -> axis end.
  const mouthHalf = MOUTH_HALF;
  const mTop = (midY - mouthHalf).toFixed(1);
  const mBot = (midY + mouthHalf).toFixed(1);
  const E = endX.toFixed(1);
  const inC1 = (sx + span * 0.35).toFixed(1);
  const inC2 = (sx + span * 0.72).toFixed(1);
  const wspan = PLOT_RIGHT - endX;
  const outC1 = (endX + wspan * 0.3).toFixed(1);
  const outC2 = (endX + wspan * 0.68).toFixed(1);
  const bandPath = `M ${sx.toFixed(1)} ${PLOT_TOP} C ${inC1} ${PLOT_TOP} ${inC2} ${mTop} ${E} ${mTop} L ${E} ${mBot} C ${inC2} ${mBot} ${inC1} ${PLOT_BOTTOM} ${sx.toFixed(1)} ${PLOT_BOTTOM} Z`;
  const washPath = `M ${E} ${mTop} C ${outC1} ${mTop} ${outC2} ${PLOT_TOP} ${PLOT_RIGHT} ${PLOT_TOP} L ${PLOT_RIGHT} ${PLOT_BOTTOM} C ${outC2} ${PLOT_BOTTOM} ${outC1} ${mBot} ${E} ${mBot} Z`;
  return `
  <g class="narrative-context narrative-field">
  <path d="${bandPath}" class="seam-field">
    <animate attributeName="opacity" values="0;0;1" keyTimes="0;0.3;1" begin="0s" dur="2.2s" fill="freeze"/>
    <animate attributeName="opacity" values="1;0.8;1" begin="2.2s" dur="3.6s" repeatCount="indefinite"/>
  </path>
  <path d="${washPath}" class="seam-field">
    <animate attributeName="opacity" values="0;0;1" keyTimes="0;0.45;1" begin="0s" dur="2.4s" fill="freeze"/>
    <animate attributeName="opacity" values="1;0.8;1" begin="2.4s" dur="3.6s" repeatCount="indefinite"/>
  </path>
  ${drift(PLOT_LEFT + 8, sx - 8, LANES[1], 1.0, "2.8s")}
  ${drift(PLOT_LEFT + 8, sx - 8, LANES[3], 0.8, "4.6s")}
  ${drift(PLOT_LEFT + 8, sx - 8, LANES[2], 0.9, "6.2s")}
  ${drift(PLOT_LEFT + 8, sx - 8, LANES[0], 0.8, "3.6s")}
  ${drift(PLOT_LEFT + 8, sx - 8, LANES[4], 0.9, "5.4s")}
  ${drift(PLOT_LEFT + 8, sx - 8, LANES[1], 0.7, "7.0s")}
  ${goldMote(32, LANES[1], 1.1, "2.8s")}
  ${goldMote(74, LANES[3], 0.9, "4.0s")}
  ${goldMote(116, LANES[0], 1.0, "5.2s")}
  ${goldMote(158, LANES[4], 0.9, "6.4s")}
  ${intake(LANES[0], "2.6s")}
  ${intake(LANES[2], "3.4s")}
  ${intake(LANES[4], "4.2s")}
  </g>`;
}

// Mirror seam above the bars: the Deco Turbine Gate. Sci-fi cyberpunk
// mechanical art-deco: stepped ziggurat jambs, a sunburst fan, a faceted
// octagon iris with a bright launch bore, two secondary launch ports and
// marching circuit rails. Shape-language contract: the ORIGIN membrane is
// curves + turbulence (organic), this gate is hard angles + zero
// turbulence (machined), the portal is round (transcendent). Base state =
// the fully-drawn OPEN gate; every loop starts AND ends at that state.
function seamMarkup(sx, fromLabel) {
  const X = sx.toFixed(1);
  const top = PLOT_TOP;
  const bot = PLOT_BOTTOM;
  const midY = MID_Y;
  const title = escapeXML(`agentic engineering since ${fromLabel}`);
  // Faceted octagon helper (flat-ish facets, machined look).
  const oct = (cx, cy, r) => {
    const pts = [];
    for (let k = 0; k < 8; k++) {
      const a = ((22.5 + k * 45) * Math.PI) / 180;
      pts.push(`${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`);
    }
    return pts.join(" ");
  };
  // 8-tooth indexing gear: 32 points, teeth every 45deg (rotationally
  // symmetric, so a 45deg index step lands on an identical pose).
  const gear = (cx, cy, rIn, rOut) => {
    const pts = [];
    for (let k = 0; k < 32; k++) {
      const a = (k * 11.25 * Math.PI) / 180;
      const r = k % 4 < 2 ? rOut : rIn;
      pts.push(`${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`);
    }
    return pts.join(" ");
  };
  // Stepped ziggurat shoulders. The four steps ride the half-lanes either side
  // of the iris (+/-1.75 and +/-0.75 lane steps), so the jamb keeps its
  // machined proportions at any plot height.
  const jTop = LANE(-1.75);
  const jUpper = LANE(-0.75);
  const jLower = LANE(0.75);
  const jBot = LANE(1.75);
  const jamb = (s) => {
    const x9 = (sx + s * 9).toFixed(1);
    const x60 = (sx + s * 6).toFixed(1);
    const x35 = (sx + s * 3.5).toFixed(1);
    return `M ${x9} ${top} V ${jTop} H ${x60} V ${jUpper} H ${x35} V ${jLower} H ${x60} V ${jBot} H ${x9} V ${bot}`;
  };
  // Two-sided sunburst: short intake spokes face the organic era, long
  // launch spokes face the portal — a directional emitter, not a half-fan.
  const fan = [
    ...[-36, -24, -12, 0, 12, 24, 36].map((deg) => [deg, 20]),
    ...[144, 168, 192, 216].map((deg) => [deg, 11]),
  ]
    .map(([deg, len]) => {
      const a = (deg * Math.PI) / 180;
      const x2 = (sx + len * Math.cos(a)).toFixed(1);
      const y2 = (midY + len * Math.sin(a)).toFixed(1);
      return `<line x1="${X}" y1="${midY}" x2="${x2}" y2="${y2}" class="gate-fan"/>`;
    })
    .join("\n      ");
  // Launch-port fire pulses: recoil dims phase-locked to the intake-meteor
  // begins; rest value (keyTimes 0 and 1) IS the open base state.
  const fire = (begin) =>
    `<animate attributeName="stroke-opacity" values="1;0.5;1;1" keyTimes="0;0.08;0.5;1" begin="${begin}" dur="2.4s" repeatCount="indefinite"/>`;
  return `
  <g class="narrative-context narrative-seam">
    <title>${title}</title>
    <rect x="${(sx - 22).toFixed(1)}" y="${top}" width="44" height="${bot - top}" fill="url(#seamAuraGrad)" class="seam-aura">
      <animate attributeName="opacity" values="0;0;1" keyTimes="0;0.25;1" begin="0s" dur="2.2s" fill="freeze"/>
      <animate attributeName="opacity" values="1;0.62;1" begin="2.2s" dur="3.6s" repeatCount="indefinite"/>
    </rect>
    <rect x="${(sx - 5).toFixed(1)}" y="${top}" width="10" height="${bot - top}" class="seam-glass">
      <animate attributeName="opacity" values="0;0;1" keyTimes="0;0.25;1" begin="0s" dur="2.4s" fill="freeze"/>
      <animate attributeName="opacity" values="1;0.6;1" begin="2.4s" dur="3.6s" repeatCount="indefinite"/>
    </rect>
    <g>
      <animate attributeName="opacity" values="0;0;1" keyTimes="0;0.25;1" begin="0s" dur="2.4s" fill="freeze"/>
      <path d="${jamb(-1)}" class="gate-jamb"/>
      <path d="${jamb(1)}" class="gate-jamb"/>
      ${fan}
      <line x1="${(sx - 6).toFixed(1)}" y1="${LANES[0]}" x2="${(sx - 6).toFixed(1)}" y2="${LANES[4]}" class="gate-rail" stroke-dasharray="3 3">
        <animate attributeName="stroke-dashoffset" values="0;6" begin="2.4s" dur="5.2s" repeatCount="indefinite"/>
      </line>
      <line x1="${(sx + 6).toFixed(1)}" y1="${LANES[0]}" x2="${(sx + 6).toFixed(1)}" y2="${LANES[4]}" class="gate-rail" stroke-dasharray="3 3">
        <animate attributeName="stroke-dashoffset" values="6;0" begin="2.4s" dur="5.2s" repeatCount="indefinite"/>
      </line>
      <polygon points="${oct(sx, LANES[0], 6)}" class="gate-port">${fire("2.6s")}</polygon>
      <polygon points="${oct(sx, LANES[4], 6)}" class="gate-port">${fire("4.2s")}</polygon>
      <polygon points="${oct(sx, midY, 8.5)}" class="gate-iris">${fire("3.4s")}</polygon>
      <polygon points="${gear(sx, midY, 4.2, 5.9)}" class="gate-iris-inner">
        <animateTransform attributeName="transform" type="rotate" values="0 ${X} ${midY};0 ${X} ${midY};45 ${X} ${midY};45 ${X} ${midY}" keyTimes="0;0.55;0.72;1" begin="2.4s" dur="2.4s" repeatCount="indefinite"/>
      </polygon>
      ${[[LANES[1] - 7, "2.4s"], [LANES[1], "2.7s"], [LANES[1] + 7, "3.0s"], [LANES[3] - 7, "3.6s"], [LANES[3], "3.9s"], [LANES[3] + 7, "4.2s"]]
        .map(
          ([ly, lb]) => `<rect x="${(sx - 0.9).toFixed(1)}" y="${ly}" width="1.8" height="1.8" rx="0.4" class="gate-led">
        <animate attributeName="opacity" values="1;0.25;1;1" keyTimes="0;0.12;0.35;1" begin="${lb}" dur="2.4s" repeatCount="indefinite"/>
      </rect>`
        )
        .join("\n      ")}
      <rect x="${(sx - 1).toFixed(1)}" y="${midY - 8}" width="2" height="16" rx="1" class="gate-slit">
        <animate attributeName="height" values="16;19;16" begin="2.6s" dur="4.2s" repeatCount="indefinite"/>
        <animate attributeName="y" values="${midY - 8};${midY - 9.5};${midY - 8}" begin="2.6s" dur="4.2s" repeatCount="indefinite"/>
        <animate attributeName="opacity" values="1;0.6;1;1" keyTimes="0;0.08;0.5;1" begin="3.4s" dur="2.4s" repeatCount="indefinite"/>
      </rect>
    </g>
  </g>
  <g class="narrative-label">
    <text x="${X}" y="${top - 8}" text-anchor="middle" class="seam-text">agentic engineering
      <animate attributeName="opacity" values="0;0;1" keyTimes="0;0.55;1" begin="0s" dur="2.6s" fill="freeze"/>
      <animate attributeName="opacity" values="1;0.75;1" begin="2.6s" dur="3.6s" repeatCount="indefinite"/>
    </text>
  </g>`;
}

// Organic living-bilayer membrane at the plot ORIGIN: the "human
// engineering" era wall that births the pre-seam drift motes. Two wavy
// dashed leaflets (originMembrane turbulence), interlocking vesicle cells
// with a nucleus + nucleolus at midY, and pore rings that dilate slowly in
// sync with the drift-mote births on their lanes (7.2s — the slowest tempo
// on the chart, per the left-to-right speed grammar). Base state = complete
// frozen bilayer.
function membraneMarkup(ox) {
  const X = ox.toFixed(1);
  const top = PLOT_TOP;
  const bot = PLOT_BOTTOM;
  const L = (ox - 5.0).toFixed(1);
  const Rr = (ox + 5.0).toFixed(1);
  const title = escapeXML("human engineering: the organic era");
  // Interlocking vesicles down the bilayer, on the half-lanes either side of the
  // nucleus (+/-1.5 and +/-0.75 lane steps). Each row carries its OWN breathing
  // timing: the previous version matched `cy === 158/140/176` to decide which
  // cells animate, which silently stopped matching (and dropped the animation)
  // as soon as the lane became a derived float.
  const cells = [
    { cy: LANE(-1.5), dx: -1.8, rx: 3.0, ry: 5.2, nucleus: false, breathe: null },
    { cy: LANE(-0.75), dx: 1.8, rx: 3.4, ry: 6.0, nucleus: false, breathe: { scale: 1.1, begin: "2.6s", dur: "3.8s" } },
    { cy: LANE(0), dx: 0, rx: 4.4, ry: 8.0, nucleus: true, breathe: { scale: 1.11, begin: "2.4s", dur: "4.2s" } },
    { cy: LANE(0.75), dx: 1.8, rx: 3.4, ry: 6.0, nucleus: false, breathe: { scale: 1.1, begin: "3.0s", dur: "4.6s" } },
    { cy: LANE(1.5), dx: -1.8, rx: 3.0, ry: 5.2, nucleus: false, breathe: null },
  ];
  const vesicles = cells
    .map(({ cy, dx, rx, ry, nucleus, breathe: b }) => {
      const fo = nucleus ? 0.85 : 0.5;
      const breathe = b
        ? `<animate attributeName="ry" values="${ry};${(ry * b.scale).toFixed(1)};${ry}" begin="${b.begin}" dur="${b.dur}" repeatCount="indefinite"/>`
        : "";
      return `<ellipse cx="${(ox + dx).toFixed(1)}" cy="${cy}" rx="${rx}" ry="${ry}" class="origin-cell" fill-opacity="${fo}">
        <animate attributeName="opacity" values="0;0;1" keyTimes="0;0.25;1" begin="0s" dur="2.4s" fill="freeze"/>
        ${breathe}
      </ellipse>`;
    })
    .join("\n      ");
  // Pore exhales phase-locked to the drift-mote births on their lanes
  // (top -> 3.6s, middle -> 6.2s, bottom -> 5.4s) at the slow 7.2s drift tempo.
  const pores = [
    [LANES[0], "3.6s", 3.2, 5.2],
    [LANES[2], "6.2s", 5.8, 9.8],
    [LANES[4], "5.4s", 3.2, 5.2],
  ]
    .map(
      ([y, begin, prx, pry]) => `<ellipse cx="${X}" cy="${y}" rx="${prx}" ry="${pry}" class="origin-pore">
        <animate attributeName="opacity" values="0;0;1" keyTimes="0;0.25;1" begin="0s" dur="2.4s" fill="freeze"/>
        <animate attributeName="rx" values="${(prx * 1.4).toFixed(1)};${prx};${prx};${(prx * 1.4).toFixed(1)}" keyTimes="0;0.08;0.92;1" begin="${begin}" dur="7.2s" repeatCount="indefinite"/>
        <animate attributeName="ry" values="${(pry * 1.25).toFixed(1)};${pry};${pry};${(pry * 1.25).toFixed(1)}" keyTimes="0;0.08;0.92;1" begin="${begin}" dur="7.2s" repeatCount="indefinite"/>
        <animate attributeName="stroke-opacity" values="1;0.8;0.8;1" keyTimes="0;0.08;0.92;1" begin="${begin}" dur="7.2s" repeatCount="indefinite"/>
      </ellipse>`
    )
    .join("\n      ");
  return `
  <g class="narrative-context narrative-origin">
    <title>${title}</title>
    <rect x="${(ox - 22).toFixed(1)}" y="${top}" width="44" height="${bot - top}" fill="url(#originAuraGrad)" class="origin-aura">
      <animate attributeName="opacity" values="0;0;1" keyTimes="0;0.25;1" begin="0s" dur="2.2s" fill="freeze"/>
      <animate attributeName="opacity" values="1;0.62;1" begin="2.2s" dur="3.6s" repeatCount="indefinite"/>
    </rect>
    <rect x="${L}" y="${top}" width="10" height="${bot - top}" class="origin-glass">
      <animate attributeName="opacity" values="0;0;1" keyTimes="0;0.25;1" begin="0s" dur="2.4s" fill="freeze"/>
      <animate attributeName="opacity" values="1;0.6;1" begin="2.4s" dur="3.6s" repeatCount="indefinite"/>
    </rect>
    <g filter="url(#originMembrane)">
      <path d="M ${L} ${top} V ${bot}" class="origin-line" fill="none" stroke-dasharray="7 5">
        <animate attributeName="opacity" values="0;0;1" keyTimes="0;0.25;1" begin="0s" dur="2.4s" fill="freeze"/>
        <animate attributeName="stroke-width" values="0.4;0.4;1.6;1.0" keyTimes="0;0.25;0.75;1" begin="0s" dur="2.4s" fill="freeze"/>
        <animate attributeName="stroke-dashoffset" values="0;12" begin="2.4s" dur="5.2s" repeatCount="indefinite"/>
      </path>
      <path d="M ${Rr} ${top} V ${bot}" class="origin-line" fill="none" stroke-dasharray="6 6" stroke-dashoffset="4">
        <animate attributeName="opacity" values="0;0;1" keyTimes="0;0.25;1" begin="0s" dur="2.4s" fill="freeze"/>
        <animate attributeName="stroke-width" values="0.4;0.4;1.6;1.0" keyTimes="0;0.25;0.75;1" begin="0s" dur="2.4s" fill="freeze"/>
        <animate attributeName="stroke-dashoffset" values="4;-8" begin="2.4s" dur="5.6s" repeatCount="indefinite"/>
      </path>
      ${vesicles}
      <circle cx="${X}" cy="${MID_Y}" r="2.0" class="origin-nucleolus" opacity="0.9">
        <animate attributeName="opacity" values="0;0;0.9" keyTimes="0;0.25;1" begin="0s" dur="2.4s" fill="freeze"/>
      </circle>
      ${pores}
    </g>
  </g>
  <g class="narrative-label">
    <text transform="rotate(-90 46 ${MID_Y})" x="46" y="${MID_Y}" text-anchor="middle" class="origin-text">human engineering
      <animate attributeName="opacity" values="0;0;1" keyTimes="0;0.55;1" begin="0s" dur="2.6s" fill="freeze"/>
      <animate attributeName="opacity" values="1;0.75;1" begin="2.6s" dur="3.6s" repeatCount="indefinite"/>
    </text>
  </g>`;
}

function renderSVG(model) {
  const {
    rows,
    peak,
    avgGrowthPct,
    growthBaseYear,
    cumulative,
    warning,
    startYear,
  } = model;
  const yMax = niceMax(peak);
  const n = rows.length || 1;

  // Bar geometry: even spacing across the plot width.
  const slot = PLOT_WIDTH / n;
  const barW = Math.min(slot * 0.62, 64);
  // Runway outline height for THIS render: capped by the shortest measured bar
  // (see ghostHeightFor), so an empty slot can never out-tower real data.
  const ghostH = ghostHeightFor(rows, yMax);
  // Corner radius must stay well BELOW half the height. At exactly half, a rect
  // becomes a stadium, and because ghostH is only a few pixels the previous
  // "min(BAR_RADIUS, ghostH / 2)" always picked ghostH / 2: the BAR_RADIUS arm
  // was dead and the outline was ALWAYS a pill, i.e. the one shape this cue is
  // meant not to be. A third of the height keeps it rounded but bar-like.
  // Snapped to 1dp like every other derived geometry value. GHOST_RX_MAX does not
  // bind at today's GHOST_MAX_H (5 / 3 is comfortably under 2); it is a guard so
  // that raising GHOST_MAX_H later cannot quietly round the lip back into a pill.
  const ghostRx = Math.round(Math.min(GHOST_RX_MAX, ghostH / 3) * 10) / 10;
  // Bar heights come from the module-level scale and nowhere else. This is a
  // partial application of scaledBarHeight, NOT a second implementation of it,
  // so both the normal bars and the stacked history bar are structurally unable
  // to escape the reserved label band.
  const barHeightFor = (total) => scaledBarHeight(total, yMax);
  // Honesty ceiling for the min-band-inflated history stack: it must stay
  // visibly SHORTER than the shortest single year that genuinely beat it, so
  // padding nine sparse segments up to legibility can never make the grouped
  // bar out-tower a year several times its size.
  const stackRow = rows.find((r) => r.isStack);
  const tallerYears = stackRow
    ? rows.filter((r) => !r.isStack && r.total > stackRow.total)
    : [];
  const stackCeiling = tallerYears.length
    ? Math.min(...tallerYears.map((r) => barHeightFor(r.total))) - 6
    : BAR_HEIGHT;

  // Faint horizontal gridlines only; NO numeric y-axis. The bars and the
  // cumulative curve live on different scales, so a single labelled axis would
  // be correct for one and wrong for the other. The lines stay purely as light
  // visual guides; values are read from each bar's own label and tooltips.
  const gridSteps = [0, 0.25, 0.5, 0.75, 1];
  const gridlines = gridSteps
    .map((frac) => {
      const y = PLOT_BOTTOM - frac * PLOT_HEIGHT;
      return `<line x1="${PLOT_LEFT}" y1="${y.toFixed(1)}" x2="${PLOT_RIGHT}" y2="${y.toFixed(1)}" class="grid"/>`;
    })
    .join("\n  ");

  const bars = rows
    .map((row, i) => {
      const cx = PLOT_LEFT + slot * i + slot / 2;
      const x = cx - barW / 2;
      // 2px floor so every non-zero year shows at least a visible tick.
      const h = barHeightFor(row.total);
      const y = PLOT_BOTTOM - h;
      // Staggered draw-in: each bar starts from the baseline and grows.
      const begin = 0.15 + i * 0.13; // seconds
      const dur = 0.7; // seconds

      // --- Stacked history bar (multi-colour, one segment per early year) -----
      if (row.isStack) {
        // These early years are so sparse (single/double digits) that a strictly
        // proportional stack would be a few invisible sub-pixel slivers. To make
        // the per-year breakdown legible, each NON-ZERO year gets a minimum
        // visible band; exact counts live in the hover tooltips and the bar's
        // total label. Zero years are omitted entirely. So the stack is a
        // qualitative "this bar spans several years" cue, not a proportional one.
        //
        // BUT that inflation is now bounded twice over, because grouping nine
        // years (2014-22) at a flat 4px floor would pad a ~500-contribution
        // group up to the height of a year three times larger:
        //   1. the per-segment floor shrinks as the segment count grows, and
        //   2. the assembled stack is rescaled uniformly if it would reach
        //      `stackCeiling` (see above), which keeps it strictly shorter than
        //      the shortest single year that genuinely beat it.
        // Rank between the grouped bar and any real year is therefore always
        // read correctly, while every segment stays visible.
        const nonZero = row.segments.filter((s) => s.total > 0).length || 1;
        const MIN_SEG_PX = Math.min(4, Math.max(1.5, 24 / nonZero));
        const rawSegs = row.segments.map((seg, si) => {
          if (seg.total <= 0) return null; // omit empty years, keep colour order
          const prop = yMax > 0 ? (seg.total / yMax) * BAR_HEIGHT : 0;
          return { seg, si, sh: Math.max(prop, MIN_SEG_PX) };
        });
        const rawH = rawSegs.reduce((s, r) => s + (r ? r.sh : 0), 0);
        // Uniform squeeze: preserves colour order and relative segment sizes.
        const squeeze =
          rawH > stackCeiling && rawH > 0 ? Math.max(stackCeiling, 8) / rawH : 1;
        let accH = 0;
        const segs = rawSegs
          .map((entry) => {
            if (!entry) return "";
            const { seg, si } = entry;
            const sh = entry.sh * squeeze;
            const sy = PLOT_BOTTOM - accH - sh;
            accH += sh;
            const color = stackColorFor(si);
            const segTitle = escapeXML(
              `${seg.year}: ${contributionCount(seg.total)}`
            );
            // The stack-seg class is load-bearing for the TESTS, not for
            // styling: every segment carries its own inline per-year fill and
            // no CSS rule targets this class, so it looks unused. Without it
            // the segments are unaddressable, and the honesty ceiling that
            // stops nine minimum-inflated segments out-towering a genuinely
            // larger single year had no coverage at all. Do not remove it as
            // dead markup.
            return `<rect x="${x.toFixed(1)}" y="${sy.toFixed(1)}" width="${barW.toFixed(1)}" height="${sh.toFixed(1)}" fill="${color}" class="stack-seg"><title>${segTitle}</title></rect>`;
          })
          .filter(Boolean)
          .join("\n    ");
        // Actual rendered top of the (min-band-inflated) stack.
        const stackTop = PLOT_BOTTOM - accH;
        const stackTitle = escapeXML(
          `${row.label}: ${contributionCount(row.total)} (stacked by year) · cumulative ${fmt(row.cumulative)}`
        );
        // Round only the top edge of the whole stack, matching the other bars.
        const clipId = `stackClip${i}`;
        return `
  <g>
    <clipPath id="${clipId}"><rect x="${x.toFixed(1)}" y="${stackTop.toFixed(1)}" width="${barW.toFixed(1)}" height="${accH.toFixed(1)}" rx="5"/></clipPath>
    <g clip-path="url(#${clipId})">
      <title>${stackTitle}</title>
      ${segs}
      <animate attributeName="opacity" from="0" to="1" begin="${begin.toFixed(2)}s" dur="${dur}s" fill="freeze"/>
    </g>
    <g class="bar-label">
      <text x="${cx.toFixed(1)}" y="${valueLabelBaseline(stackTop).toFixed(1)}" text-anchor="middle" class="value">${fmt(row.total)}
        <animate attributeName="opacity" from="0" to="1" begin="${(begin + dur * 0.6).toFixed(2)}s" dur="${(dur * 0.4).toFixed(2)}s" fill="freeze"/>
      </text>
    </g>
    <text x="${cx.toFixed(1)}" y="${PLOT_BOTTOM + 22}" text-anchor="middle" class="year">${escapeXML(row.label)}</text>
  </g>`;
      }

      // --- Next-year runway placeholder --------------------------------------
      // Deliberately NOT a data bar: a zero-height year would read as "measured
      // zero". Instead it is a dashed GHOST OUTLINE (see ghostHeightFor, which
      // keeps it no taller than the shortest measured bar) resting on
      // the baseline plus a dimmed label, so the empty slot reads as deliberate
      // headroom for the year ahead. An outline is used rather than a tick on
      // the baseline because a tick sits on top of the solid full-width
      // baseline and just reads as a rendering artifact. No animation at all,
      // so the static (no-SMIL) state is already correct.
      if (row.isFuture) {
        const futureTitle = escapeXML(`${row.label}: not started yet`);
        return `
  <g class="future-slot${row.isRunway ? " future-runway" : ""}">
    <title>${futureTitle}</title>
    <rect x="${x.toFixed(1)}" y="${(PLOT_BOTTOM - ghostH).toFixed(1)}" width="${barW.toFixed(1)}" height="${ghostH.toFixed(1)}" rx="${ghostRx.toFixed(1)}" class="future-ghost"/>
    <text x="${cx.toFixed(1)}" y="${PLOT_BOTTOM + 22}" text-anchor="middle" class="year year-future">${escapeXML(row.label)}</text>
  </g>`;
      }

      // --- Normal single-year bar --------------------------------------------
      // Future rows are excluded explicitly: a 0-total row must never be able to
      // tie for peak, even if every measured year were somehow zero.
      const isPeak = !row.isFuture && peak > 0 && row.total === peak;
      // One source of truth for "this bar wears the in-progress cap", used both
      // to emit the cap and to suppress the peak's pulse below (2026 is
      // typically BOTH peak and current, and the glow + pulse + cap stacked on
      // one bar is visually muddy — the pulse is the one that can go).
      // barW guard: the cap spans x + BAR_RADIUS .. x + barW - BAR_RADIUS, which
      // inverts if a bar is ever narrower than two corner radii.
      const hasCap =
        row.isCurrent && h >= BAR_CAP_MIN_H && barW > 2 * BAR_RADIUS;
      // Inset the cap fully ONTO the bar instead of centring it on the top edge.
      // Centred, half the stroke hung over the background and the on-bar half
      // was a near-invisible 1.45:1 against the bar's own cyan; sitting fully on
      // the bar lets one dark stroke carry real contrast (see .bar-cap).
      const capY = y + BAR_CAP_WIDTH / 2;
      const title = `${row.label}: ${contributionCount(row.total)}${
        row.isCurrent ? " (year in progress)" : ""
      } · cumulative ${fmt(row.cumulative)}`;
      const titleEsc = escapeXML(title);
      return `
  <g>
    ${isPeak ? `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" rx="${BAR_RADIUS}" class="bar-glow"/>` : ""}
    <rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" rx="${BAR_RADIUS}" class="bar${isPeak ? " peak" : ""}">
      <title>${titleEsc}</title>
      <animate attributeName="height" from="0" to="${h.toFixed(1)}" begin="${begin.toFixed(2)}s" dur="${dur}s" fill="freeze" calcMode="spline" keyTimes="0;1" keySplines="0.2 0.8 0.2 1"/>
      <animate attributeName="y" from="${PLOT_BOTTOM}" to="${y.toFixed(1)}" begin="${begin.toFixed(2)}s" dur="${dur}s" fill="freeze" calcMode="spline" keyTimes="0;1" keySplines="0.2 0.8 0.2 1"/>
      ${isPeak && !hasCap ? `<animate attributeName="opacity" values="1;0.65;1" dur="3.6s" begin="2.6s" repeatCount="indefinite"/>` : ""}
    </rect>
    ${/* In-progress cue. Authored at its FINAL y so the no-SMIL and
         reduced-motion states already render correctly; the animations only
         carry it up into place and then march the dashes. */
      hasCap
        ? `<line x1="${(x + BAR_RADIUS).toFixed(1)}" y1="${capY.toFixed(1)}" x2="${(x + barW - BAR_RADIUS).toFixed(1)}" y2="${capY.toFixed(1)}" class="bar-cap">
      <animate attributeName="y1" from="${PLOT_BOTTOM}" to="${capY.toFixed(1)}" begin="${begin.toFixed(2)}s" dur="${dur}s" fill="freeze" calcMode="spline" keyTimes="0;1" keySplines="0.2 0.8 0.2 1"/>
      <animate attributeName="y2" from="${PLOT_BOTTOM}" to="${capY.toFixed(1)}" begin="${begin.toFixed(2)}s" dur="${dur}s" fill="freeze" calcMode="spline" keyTimes="0;1" keySplines="0.2 0.8 0.2 1"/>
      <animate attributeName="stroke-dashoffset" from="0" to="${BAR_CAP_PERIOD}" begin="${(begin + dur).toFixed(2)}s" dur="2s" repeatCount="indefinite"/>
    </line>`
        : ""
    }
    <g class="bar-label">
      <text x="${cx.toFixed(1)}" y="${valueLabelBaseline(y).toFixed(1)}" text-anchor="middle" class="value${isPeak ? " value-peak" : ""}">${fmt(row.total)}
        <animate attributeName="y" from="${PLOT_BOTTOM}" to="${valueLabelBaseline(y).toFixed(1)}" begin="${begin.toFixed(2)}s" dur="${dur}s" fill="freeze" calcMode="spline" keyTimes="0;1" keySplines="0.2 0.8 0.2 1"/>
        <animate attributeName="opacity" from="0" to="1" begin="${(begin + dur * 0.6).toFixed(2)}s" dur="${(dur * 0.4).toFixed(2)}s" fill="freeze"/>
      </text>
    </g>
    <text x="${cx.toFixed(1)}" y="${PLOT_BOTTOM + 22}" text-anchor="middle" class="year${isPeak ? " year-peak" : ""}">${escapeXML(row.label)}</text>
  </g>`;
    })
    .join("");

  // Cumulative running-total curve behind the bars: a smooth, glowing,
  // gradient-stroked spline with a soft gradient fill and a pulsing end dot.
  // It has its own scale (the cumulative total far exceeds any single year, so
  // it can't share the bars' y-axis); we map 0..finalCumulative down to a top
  // margin so the curve crests just below the gridlines at the most recent bar.
  const cumMax = cumulative > 0 ? cumulative : 1;
  // Ceiling for the cumulative curve. DERIVED from BAR_CEILING so the curve
  // respects the SAME reserved label band the bars do. Pinning it to a separate
  // "PLOT_TOP + 10" put the crest and its end dot at y=114, i.e. 16px INSIDE the
  // band, where they crossed the right-most value labels the band exists to
  // protect. Bars and curve now share one ceiling.
  const CUM_TOP = BAR_CEILING;
  // MEASURED rows only. The trailing next-year placeholder carries the running
  // total forward unchanged, so including it would append a flat dead tail and
  // park the end dot over an empty slot. Future rows are always appended last,
  // so slicing them off keeps every remaining index aligned with its slot.
  const cumRows = rows.filter((row) => !row.isFuture);
  const cumPts = cumRows.map((row, i) => {
    const cx = PLOT_LEFT + slot * i + slot / 2;
    // Anchor the ends to the bar EDGES (not centres): the curve starts at the
    // left edge of the first bar and finishes at the right edge of the last
    // measured bar, so the line + area span the measured width of the chart.
    let px = cx;
    if (i === 0) px = cx - barW / 2;
    if (i === cumRows.length - 1) px = cx + barW / 2;
    const cy =
      PLOT_BOTTOM - (row.cumulative / cumMax) * (PLOT_BOTTOM - CUM_TOP);
    return [px, cy];
  });
  // Monotone cubic (Fritsch–Carlson) → cubic-bézier smoothing. The data is a
  // running cumulative total, so the curve must be non-decreasing everywhere;
  // Catmull-Rom overshoots at flat→steep junctions (it drew a visible false
  // dip between adjacent years). F-C clamps segment slopes so the interpolant
  // preserves monotonicity while staying smooth through every exact point.
  const fcTangents = (pts) => {
    const n = pts.length;
    const dx = [], slope = [];
    for (let i = 0; i < n - 1; i += 1) {
      dx.push(pts[i + 1][0] - pts[i][0]);
      slope.push((pts[i + 1][1] - pts[i][1]) / dx[i]);
    }
    // Tangents: harmonic mean of neighbouring slopes when they agree in sign,
    // zero at local extrema (F-C), one-sided at the ends.
    const m = new Array(n);
    m[0] = slope[0];
    m[n - 1] = slope[n - 2];
    for (let i = 1; i < n - 1; i += 1) {
      if (slope[i - 1] * slope[i] <= 0) {
        m[i] = 0;
      } else {
        const w1 = 2 * dx[i] + dx[i - 1];
        const w2 = dx[i] + 2 * dx[i - 1];
        m[i] = (w1 + w2) / (w1 / slope[i - 1] + w2 / slope[i]);
      }
    }
    return m;
  };
  const bezierSegs = (pts) => {
    const m = fcTangents(pts);
    const segs = [];
    for (let i = 0; i < pts.length - 1; i += 1) {
      const h = (pts[i + 1][0] - pts[i][0]) / 3;
      segs.push([
        pts[i],
        [pts[i][0] + h, pts[i][1] + m[i] * h],
        [pts[i + 1][0] - h, pts[i + 1][1] - m[i + 1] * h],
        pts[i + 1],
      ]);
    }
    return segs;
  };
  const smoothPath = (pts) => {
    if (pts.length < 2)
      return pts.length ? `M ${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}` : "";
    let d = `M ${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
    for (const [, c1, c2, p1] of bezierSegs(pts)) {
      d += ` C ${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${p1[0].toFixed(1)} ${p1[1].toFixed(1)}`;
    }
    return d;
  };
  const cumLineD = smoothPath(cumPts);
  const [endX, endY] = cumPts[cumPts.length - 1] ?? [0, 0];
  // IMPORTANT: base (non-animated) state must be the FINAL drawn state. GitHub
  // serves this SVG through <img>/camo and some surfaces (mobile app, cached
  // rasterizations, screenshots) never run SMIL; anything whose base state is
  // hidden would simply never appear there. So the line/area/dot are visible
  // by default, and the draw-in animations start at 0s with the reveal delay
  // encoded in keyTimes (a begin-delayed animation would flash the final state
  // before hiding it).
  const cumArea = cumPts.length
    ? `<path d="${cumLineD} L ${endX.toFixed(1)} ${PLOT_BOTTOM} L ${cumPts[0][0].toFixed(1)} ${PLOT_BOTTOM} Z" class="cum-area">
    <animate attributeName="opacity" values="0;0;1" keyTimes="0;0.2;1" begin="0s" dur="2s" fill="freeze"/>
  </path>
  <path d="${cumLineD}" class="cum-line" pathLength="1" stroke-dasharray="1 1">
    <animate attributeName="stroke-dashoffset" values="1;1;0" keyTimes="0;0.15;1" begin="0s" dur="2s" fill="freeze" calcMode="spline" keySplines="0 0 1 1;0.4 0 0.2 1"/>
    <animate attributeName="stroke-opacity" values="0.2;0.26;0.2" begin="2.4s" dur="3.6s" repeatCount="indefinite"/>
  </path>
  <circle cx="${endX.toFixed(1)}" cy="${endY.toFixed(1)}" r="2" class="cum-dot">
    <animate attributeName="opacity" values="0;0;1" keyTimes="0;0.83;1" begin="0s" dur="2.3s" fill="freeze"/>
  </circle>`
    : "";

  const headlineNum = fmt(cumulative);
  // Portal placement: the slot boundary between the in-progress year and the
  // year before it (skipped when there's no current-year bar, e.g. placeholder).
  const curIdx = rows.findIndex((r) => r.isCurrent);
  const portalX = curIdx > 0 ? PLOT_LEFT + slot * curIdx : null;
  const portalDefsStr = portalX != null ? portalDefs(portalX) : "";
  const portalField = portalX != null ? portalFieldMarkup(portalX) : "";
  const portal =
    portalX != null
      ? portalMarkup(portalX, rows[curIdx - 1].label, rows[curIdx].label)
      : "";
  // Gold mirror seam: gap before the agentic-engineering era's first year;
  // its band is ONE continuous gradient — gold at the seam, dimming
  // mid-band, then picking up the singularity's green and intensifying
  // right up to the portal (a single era-blend, not two fields).
  const seamIdx = rows.findIndex((r) => r.year === SEAM_YEAR);
  const seamX = seamIdx > 0 ? PLOT_LEFT + slot * seamIdx : null;
  const seamEnd = portalX != null ? portalX : PLOT_RIGHT;
  const seamDefsStr = seamX != null ? seamDefs(seamX, PLOT_RIGHT) : "";
  const seamField = seamX != null ? seamFieldMarkup(seamX, seamEnd) : "";
  const seam = seamX != null ? seamMarkup(seamX, rows[seamIdx].label) : "";
  const ox = PLOT_LEFT;
  const mx = PLOT_LEFT + 5;
  const originDefsStr = seamX != null ? originDefs(mx, ox, seamX) : "";
  const origin = seamX != null ? membraneMarkup(mx) : "";
  // Final authored phase: place its source at the boundary AFTER the first
  // future slot (2027) and BEFORE the second (2028), never at the measured
  // current-year singularity boundary.
  const futureStartIdx = rows.findIndex((r) => r.isFuture);
  const enlightenmentBoundaryX =
    futureStartIdx >= 0 && rows[futureStartIdx + 1]?.isFuture
      ? PLOT_LEFT + slot * (futureStartIdx + 1)
      : null;
  const enlightenment =
    enlightenmentBoundaryX != null
      ? enlightenmentMarkup(enlightenmentBoundaryX)
      : "";
  const originBandRect = seamX != null
    ? `<rect x="${ox}" y="${PLOT_TOP}" width="${(seamX - ox).toFixed(1)}" height="${PLOT_HEIGHT}" class="origin-band">
    <animate attributeName="opacity" values="0;0;1" keyTimes="0;0.3;1" begin="0s" dur="2.2s" fill="freeze"/>
    <animate attributeName="opacity" values="1;0.8;1" begin="2.2s" dur="3.6s" repeatCount="indefinite"/>
  </rect>`
    : "";
  const rangeLabel = `${startYear}–${currentYear()}`;
  const warningBanner = warning
    ? `<text x="${W / 2}" y="${H - 8}" text-anchor="middle" class="warning">${escapeXML(
        warning
      )}</text>`
    : "";

  // Spell out BOTH caveats a sighted reader gets from the visuals: the newest
  // bar is a partial year, and the trailing slot is an empty placeholder.
  const currentRow = rows.find((r) => r.isCurrent);
  const futureRows = rows.filter((r) => r.isFuture);
  const futureRow = futureRows[0];
  // The grouped history bar MUST be announced: without it a screen-reader user
  // is told the range starts in 2014 but never learns the first bar is a
  // multi-year aggregate rather than a single year. The per-segment title
  // elements carry that detail visually, but they are not exposed inside an
  // image role, so this sentence is the only place it can be conveyed. Keep the
  // facts here in step with the README alt text so the two cannot drift.
  // stackRow is already bound near the top of renderSVG, where it clamps the
  // grouped bar's height against genuinely taller single years. Reuse that
  // binding: a second const for the same value in the same function scope is a
  // SyntaxError, and re-deriving it would let the two copies drift apart.
  // Name the peak YEAR, not just its value. A sighted reader can see which bar
  // is highlighted; a screen-reader user was previously told only the number.
  const peakRow =
    peak > 0 ? rows.find((row) => !row.isFuture && row.total === peak) : null;
  // The growth rate is drawn as visible <text> in the panel corner, but this
  // SVG carries role="img" plus an aria-label, which makes the whole subtree
  // presentational: a screen reader announces the aria-label and NOTHING else,
  // so a figure that lives only in the markup is unreachable. Build the rate
  // and its window ONCE here and feed both surfaces from it, so the panel and
  // the sentence can never state different numbers.
  // The window travels with the rate on purpose. An unqualified "+193%/yr"
  // invites the reader to apply it to the whole startYear-onward span, when it
  // is measured only across the individually plotted complete years -- the
  // classic misleading-statistic shape, and the one claim on this panel a
  // reader could not otherwise check.
  const growthRate =
    avgGrowthPct != null && growthBaseYear != null
      ? `${avgGrowthPct >= 0 ? "+" : ""}${Math.round(
          avgGrowthPct
        )}%/yr since ${growthBaseYear}`
      : null;
  const ariaNotes = [
    // Spell BOTH years out in full here. The visible axis label is compact
      // ("2014-22") because it has to fit under a bar, but a screen reader
      // renders that abbreviation awkwardly, and it also diverges from the
      // README alt text. The range is startYear through the grouping boundary
      // by construction, so deriving it cannot drift from what is drawn.
    stackRow
      ? `${startYear} to ${STACK_THROUGH_YEAR} are grouped into one stacked bar totalling ${fmt(
          stackRow.total
        )}`
      : "",
    // The same string the panel corner shows, with the word spelled out:
    // "avg" is what fits the panel width, but a screen reader renders the
    // abbreviation poorly. Same compact-visible / spoken-in-full split as the
    // axis label above, and the figure itself is shared so it cannot drift.
    growthRate ? `average growth ${growthRate}` : "",
    currentRow ? `${currentRow.label} is still in progress` : "",
    futureRow ? `${futureRow.label} is an empty placeholder for the year ahead` : "",
    futureRows.length > 1
      ? `${futureRows[0].label} to ${futureRows[1].label} are an unstarted future runway; the enlightenment phase sits between them`
      : "",
    "the visual phase motif continues into 20 rays of light streaming from above with liquid droplets propagating along the beams",
  ].filter(Boolean);
  // Hedge the superlative while the record-holder is the year still running.
  // "peak 6,240 in 2026" alongside "2026 is still in progress" in the same
  // sentence undercuts itself: the number is the highest MEASURED so far and
  // keeps moving until the year closes. When the record belongs to a year that
  // is actually over, "peak" is exact and stays.
  // Declared after ariaNotes so it can test against the SAME currentRow that
  // phrases the in-progress clause, instead of re-deriving "the newest year"
  // and letting the two drift. Compared by label rather than by identity, so a
  // future currentRow that is a copy rather than the same row object cannot
  // quietly turn the hedge off.
  const peakUnfinished =
    peakRow != null && currentRow != null && peakRow.label === currentRow.label;
  const peakPhrase = peakRow
    ? `${peakUnfinished ? "highest so far" : "peak"} ${fmt(peak)} in ${
        peakRow.label
      }`
    : `peak ${fmt(peak)} in a single year`;
  const aria = cumulative > 0
    ? `Cumulative contributions ${rangeLabel}: ${fmt(cumulative)} total, ${peakPhrase}, shown as annual bars with a running cumulative total curve${
        ariaNotes.length ? `. ${ariaNotes.join("; ")}` : ""
      }`
    : `Cumulative contributions ${rangeLabel}: no data`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${escapeXML(aria)}">
  <defs>
    <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#22d3ee"/>
      <stop offset="100%" stop-color="#0891b2"/>
    </linearGradient>
    <linearGradient id="cumGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#67e8f9" stop-opacity="0.16"/>
      <stop offset="55%" stop-color="#22d3ee" stop-opacity="0.06"/>
      <stop offset="100%" stop-color="#22d3ee" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="cumLineGrad" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#0891b2"/>
      <stop offset="55%" stop-color="#22d3ee"/>
      <stop offset="85%" stop-color="#a5f3fc"/>
      <stop offset="100%" stop-color="#a3e635"/>
    </linearGradient>
    <!-- Light-mode variants: darker, more saturated so the curve, fill and dot
         keep good contrast on a white background. -->
    <linearGradient id="cumLineGradLight" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#0e7490"/>
      <stop offset="55%" stop-color="#0891b2"/>
      <stop offset="85%" stop-color="#06b6d4"/>
      <stop offset="100%" stop-color="#65a30d"/>
    </linearGradient>
    <linearGradient id="cumGradLight" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#0891b2" stop-opacity="0.13"/>
      <stop offset="55%" stop-color="#0891b2" stop-opacity="0.05"/>
      <stop offset="100%" stop-color="#0891b2" stop-opacity="0"/>
    </linearGradient>
    <filter id="lineGlow" x="-20%" y="-40%" width="140%" height="180%">
      <feGaussianBlur stdDeviation="2.6" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <filter id="glow" x="-60%" y="-60%" width="220%" height="220%">
      <feGaussianBlur stdDeviation="7" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    ${portalDefsStr}
    ${seamDefsStr}
    ${originDefsStr}
    ${portalX != null ? enlightenmentDefs() : ""}
  </defs>
  <style>
    :root { color-scheme: light dark; }
    .panel { fill: #ffffff; fill-opacity: 0.022; stroke: #ffffff; stroke-opacity: 0.07; }
    .headline { font: 700 28px ui-monospace, SFMono-Regular, Menlo, monospace; fill: #22d3ee; letter-spacing: -1px; }
    .sub { font: 500 13px ui-monospace, SFMono-Regular, Menlo, monospace; fill: #8b949e; }
    .value { font: 600 13px ui-monospace, SFMono-Regular, Menlo, monospace; fill: #c9d1d9; }
    .value-peak { font: 700 15px ui-monospace, SFMono-Regular, Menlo, monospace; fill: #22d3ee; }
    .year { font: 500 13px ui-monospace, SFMono-Regular, Menlo, monospace; fill: #8b949e; }
    .year-peak { font-weight: 700; fill: #22d3ee; }
    /* Next-year runway: dimmed so it reads as "not yet", not as a zero result.
       CONTRAST FLOOR, do not lower: .year is #8b949e, which is 6.15:1 on the dark
       background. Opacity composites toward the BACKDROP, so this ONE value has
       to clear the 4.5:1 normal-text minimum for a 13px label in BOTH themes.
       Measured on the blended result: dark #8b949e over #0d1117 gives 5.19:1,
       light #57606a over #ffffff gives 5.02:1. Earlier values failed on the LIGHT
       side while dark passed and hid it -- 0.85 was 4.48:1 light versus 4.73:1
       dark, and 0.45 was 2.17:1. Light is the binding constraint here, so any
       future retune has to be checked against white, not just the dark canvas.
       Opacity is used rather than an explicit fill because it is CASCADE-SAFE:
       theme-split appends the unwrapped light rules AFTER the base ones, so a
       light .year fill would outrank an equal-specificity .year-future fill and
       erase the cue entirely, whereas opacity is a different property and
       composes with whichever fill the active theme supplies. The dim stays
       shallow on purpose: the dashed runway outline below is the primary "not
       yet" cue, so the label only has to hint at it while remaining legible.
       The COMPUTED per-theme ratio is asserted in the chart contrast tests, not
       this literal, so raising it can never silently break either theme. */
    .year-future { opacity: 0.9; }
    /* Next-year runway outline. Dashed and unfilled so the slot reads as an
       empty placeholder rather than a measured zero-height result. */
    /* Butt caps (the default) are load-bearing on every dashed stroke here:
       stroke-linecap: round extends each dash by stroke-width/2 at BOTH ends,
       which at these small dash/gap sizes closes the gaps and renders as a
       near-solid line, defeating the "not a measured value" cue entirely. */
    /* Non-text graphical objects need 3:1 (WCAG 1.4.11), and #30363d on the dark
       background was only 1.49:1 -- effectively invisible for an element that
       CONVEYS INFORMATION rather than merely structuring the plot the way .grid
       and .baseline do. #6e7681 is already in this palette and measures 4.1:1 on
       the dark background and 4.6:1 on white, so it needs no light override. */
    .future-ghost { fill: none; stroke: #6e7681; stroke-width: ${GHOST_STROKE}; stroke-dasharray: ${GHOST_DASH} ${GHOST_DASH}; }
    .axis { font: 400 10px ui-monospace, SFMono-Regular, Menlo, monospace; fill: #6e7681; }
    .warning { font: 500 10px ui-monospace, SFMono-Regular, Menlo, monospace; fill: #fbbf24; }
    /* Narrative context is a signature accent, not a second data layer. Keep
       the measured bars, cumulative curve, and status cues visually dominant at
       README scale. Dim only graphical context; labels remain independently
       legible so the annotation still explains the motif in both themes. */
    .narrative-context.narrative-field,
    .narrative-context.narrative-portal,
    .narrative-context.narrative-seam,
    .narrative-context.narrative-origin { opacity: 0.28; }
    .narrative-label { opacity: 0.82; }
    /* Keep the context layer a calm, deterministic backdrop. Its authored base
       geometry is already the complete tableau, so hiding animation children
       leaves the shapes visible in SVG renderers that do not run SMIL while
       removing the perpetual motion that overwhelms the data at README scale.
       Labels are intentionally outside narrative-context and keep their own
       static opacity/contrast. */
    .narrative-context animate,
    .narrative-context animateTransform { display: none; }
    /* Enlightenment is the final authored atmosphere: a quiet gold/ivory
       threshold in the upper-right. Rays travel down-left and terminate inside
       the plot; they never become a new data encoding. */
    /* Every authored enlightenment part shares one phase opacity. The gradient
       stop opacities below remain colour falloff, not per-part intensity. */
    .narrative-enlightenment { pointer-events: none; opacity: ${NEW_AGE_OPACITY}; }
    .new-age-ray { fill: url(#newAgeRayGrad); stroke: none; filter: url(#newAgeGlow); mix-blend-mode: screen; }
    .new-age-liquid { pointer-events: none; }
    .new-age-droplet { fill: url(#newAgeLiquidGrad); filter: url(#newAgeGlow); mix-blend-mode: screen; }
    .new-age-text { font: 600 11px ui-monospace, SFMono-Regular, Menlo, monospace; fill: #fde68a; letter-spacing: 2px; }
    .grid { stroke: #21262d; stroke-width: 1; }
    .baseline { stroke: #30363d; stroke-width: 1; }
    .bar { fill: url(#barGrad); }
    .bar-glow { fill: #22d3ee; filter: url(#glow); opacity: 0.55; }
    /* In-progress cue: a dashed cap on the current (partial) year's bar, so a
       bar that is still growing never reads as a finished total. Drawn exactly
       ON the bar's top edge, so it cannot reach into the reserved LABEL_BAND.
       pointer-events: none keeps it from stealing hover from the bar's own
       tooltip. The dasharray is derived from the same constants as the
       marching dash-offset animation so the loop stays seamless. */
    /* In-progress cap: an ADDITIVE light-cyan dashed edge, deliberately not a
       subtractive notch stroked in the background/halo colour. A background-
       matched stroke silently becomes a visible smear the moment the page or
       halo colour changes; an additive tint from the existing palette cannot.
       Butt caps for the same reason as .future-ghost above, and the arithmetic
       is worth stating because it is the regression oracle: a round linecap
       extends every dash by stroke-width/2 at BOTH ends, so at stroke-width 2 a
       BAR_CAP_DASH/BAR_CAP_GAP of 5/3 would render as ~7px dashes separated by
       ~1px gaps - visually solid, and the whole "still accumulating" cue is
       lost. Keep the caps butt (the CSS default) whenever either value changes.
       The stroke is ADDITIVE cyan (#a5f3fc dark, #0e7490 light - both already in
       the palette) rather than a background-coloured subtractive notch, so it
       cannot silently break if the halo or background colour ever changes.
       EDITOR FOOTGUN: this comment lives inside the SVG template literal AND
       inside style content, so two characters are forbidden here. A backtick
       terminates the surrounding template literal (that already truncated this
       file once). A raw less-than sign is a FATAL XML parse error: style
       content is ordinary character data, not CDATA, so the whole image fails
       to render. Spell both out in prose, as this comment does, and never
       paste an element name in angle brackets. Guarded by
       scripts/chart-svg.test.mjs, which strict-scans the generated SVG. */
    /* DARK cyan, and the same value in both themes. The cap is inset fully onto
       the bar (see capY), and .bar is url(#barGrad) with no light-mode override,
       so the only background it is ever measured against is that theme-invariant
       cyan -- one value therefore suffices and a light override would be dead
       code. Luminance, not hue, is what buys contrast here: the previous light
       cyan #a5f3fc measured 1.45:1 against the bar, and the amber #fbbf24 in this
       palette is no better at 1.09:1 because both are bright.
       So go the other way and stroke it in the PAGE BACKGROUND colour: the
       dashes then read as notches eroding an unfinished top edge rather than as
       decoration laid on top of it, and #0d1117 measures roughly 10:1 against
       the bar. (#0e7490, tried before this, came to about 2.98:1 -- a shade
       UNDER the 3:1 WCAG 1.4.11 minimum for a graphical object.)
       Background-coloured strokes are already this file's convention; the text
       legibility halos work the same way.
       ONE value is correct here: .bar is a theme-invariant cyan gradient with
       no light variant, so that cyan is the only backdrop this is ever measured
       against, and a light override would be dead code. */
    .bar-cap { stroke: #0d1117; stroke-width: ${BAR_CAP_WIDTH}; stroke-dasharray: ${BAR_CAP_DASH} ${BAR_CAP_GAP}; pointer-events: none; }
    .bar-label { opacity: 1; }
    .cum-area { fill: url(#cumGrad); }
    .cum-line { fill: none; stroke: url(#cumLineGrad); stroke-width: 1.5; stroke-opacity: 0.2; stroke-linecap: round; stroke-linejoin: round; }
    .cum-dot { fill: #a5f3fc; fill-opacity: 0.35; stroke: #22d3ee; stroke-width: 0.8; stroke-opacity: 0.4; }
    .rm-glowEl { fill: url(#rmGlow); }
    .rm-g1 { fill: #4d7c0f; }
    .rm-g2 { fill: #84cc16; }
    .rm-g3 { fill: #bef264; }
    .rm-core { fill: #ecfccb; }
    .rm-swirl { fill: none; stroke: #d9f99d; stroke-width: 1.3; stroke-linecap: round; opacity: 0.7; }
    .portal-ray { fill: none; stroke-width: 1; opacity: 0.4; }
    .portal-pulse { fill: none; stroke-width: 1.8; stroke-linecap: round; }
    .px-gold { stroke: url(#exitGold); }
    .px-cyan { stroke: url(#exitCyan); }
    .px-violet { stroke: url(#exitViolet); }
    .portal-mote { stroke: none; }
    .pm-gold { fill: #d9f99d; }
    .pm-cyan { fill: #ecfccb; }
    .pm-violet { fill: #a3e635; }
    .portal-wave { fill: none; stroke-width: 1.3; stroke-linecap: round; }
    .pw-gold { stroke: #a3e635; }
    .pw-cyan { stroke: #bef264; }
    .pw-violet { stroke: #84cc16; }
    .portal-text { font: 600 11px ui-monospace, SFMono-Regular, Menlo, monospace; fill: #a3e635; letter-spacing: 2.5px; }
    .seam-field { fill: url(#seamFieldGrad); }
    .seam-glass { fill: url(#seamGlassGrad); }
    .origin-line { stroke: url(#originGrad); stroke-width: 1.0; stroke-linecap: round; filter: url(#originGlowSoft); }
    .origin-glass { fill: url(#originGlassGrad); }
    .origin-cell { fill: url(#originGlassGrad); stroke: url(#originGrad); stroke-width: 0.7; stroke-opacity: 0.8; }
    .origin-pore { fill: none; stroke: url(#originGrad); stroke-width: 0.9; stroke-opacity: 0.8; }
    .origin-nucleolus { fill: #fecdd3; }
    .origin-band { fill: url(#originBand); }
    .origin-text { font: 600 11px ui-monospace, SFMono-Regular, Menlo, monospace; fill: #fb7185; letter-spacing: 2.5px; }
    .gate-jamb { fill: none; stroke: url(#seamGrad); stroke-width: 1.2; filter: url(#seamGlowSoft); }
    .gate-fan { stroke: url(#seamGrad); stroke-width: 0.9; stroke-opacity: 0.55; }
    .gate-iris { fill: url(#seamGlassGrad); stroke: url(#seamGrad); stroke-width: 1.1; }
    .gate-iris-inner { fill: none; stroke: url(#seamGrad); stroke-width: 1.0; }
    .gate-port { fill: url(#seamGlassGrad); fill-opacity: 0.3; stroke: url(#seamGrad); stroke-width: 1.0; }
    .gate-rail { stroke: url(#seamGrad); stroke-width: 1.0; stroke-opacity: 0.6; }
    .gate-slit { fill: #fde68a; }
    .gate-led { fill: #fde68a; fill-opacity: 0.9; }
    .seam-text { font: 600 11px ui-monospace, SFMono-Regular, Menlo, monospace; fill: #fbbf24; letter-spacing: 2.5px; }
    .drift-mote { fill: #fda4af; }
    .seam-mote { fill: #fbbf24; }
    .seam-mote-lime { fill: #bef264; }
    .intake-tail { stroke: url(#intakeTailGrad); stroke-width: 1.6; stroke-linecap: round; }
    .intake-head { fill: #fde68a; }
    .intake-head-lime { fill: #bef264; }
    .portal-boom { fill: none; stroke: #d9f99d; stroke-width: 1.1; }
    /* Legibility halo. An image-embedded SVG resolves prefers-color-scheme from the
       OS/browser, NOT from GitHub's theme, so the two can disagree, e.g. GitHub in
       dark mode while the OS reports "light" (common on mobile). That would paint the
       light-mode near-black labels as black-on-dark and make them unreadable. A
       paint-order stroke in the page-background colour is invisible in the matching
       case and only appears to outline the text when the scheme mismatches, so the
       numbers stay legible on either background. */
    .headline, .sub, .value, .year, .portal-text, .seam-text, .origin-text, .new-age-text { paint-order: stroke; stroke: #0d1117; stroke-width: 2; stroke-linejoin: round; }
    @media (prefers-color-scheme: light) {
      .headline { fill: #0891b2; }
      .value-peak { fill: #0e7490; }
      .sub { fill: #57606a; }
      .value { fill: #1f2328; }
      .year { fill: #57606a; }
      .year-peak { fill: #0e7490; }
      .axis { fill: #6e7681; }
      .warning { fill: #92400e; }
      .grid { stroke: #eaeef2; }
      .baseline { stroke: #d0d7de; }
      .panel { fill: #0b1f2a; fill-opacity: 0.025; stroke: #0b1f2a; stroke-opacity: 0.08; }
      .cum-line { stroke: url(#cumLineGradLight); stroke-opacity: 0.16; }
      .cum-area { fill: url(#cumGradLight); }
      .cum-dot { fill: #0891b2; stroke: #0e7490; }
      .rm-glowEl { fill: url(#rmGlowLight); }
      .rm-swirl { stroke: #4d7c0f; }
      .px-gold { stroke: url(#exitGoldL); }
      .px-cyan { stroke: url(#exitCyanL); }
      .px-violet { stroke: url(#exitVioletL); }
      .pm-gold { fill: #4d7c0f; }
      .pm-cyan { fill: #3f6212; }
      .pm-violet { fill: #65a30d; }
      .pw-gold { stroke: #65a30d; }
      .pw-cyan { stroke: #3f6212; }
      .pw-violet { stroke: #4d7c0f; }
      .portal-aura { fill: url(#portalAuraLight); }
      .portal-text { fill: #3f6212; }
      .seam-field { fill: url(#seamFieldGradLight); }
      .seam-glass { fill: url(#seamGlassGradLight); }
      .origin-line { stroke: url(#originGradLight); filter: url(#originGlowSoft); }
      .origin-glass { fill: url(#originGlassGradLight); }
      .origin-aura { fill: url(#originAuraGradLight); }
      .origin-cell { fill: url(#originGlassGradLight); stroke: #be123c; stroke-width: 0.9; stroke-opacity: 0.9; }
      .origin-pore { stroke: #be123c; stroke-width: 1.1; stroke-opacity: 0.9; }
      .origin-nucleolus { fill: #be123c; }
      .origin-band { fill: url(#originBandLight); }
      .origin-text { fill: #9f1239; }
      .gate-jamb, .gate-fan, .gate-iris-inner, .gate-rail { stroke: url(#seamGradLight); }
      .gate-iris { fill: url(#seamGlassGradLight); stroke: url(#seamGradLight); }
      .gate-port { fill: url(#seamGlassGradLight); stroke: url(#seamGradLight); }
      .gate-slit { fill: #b45309; }
      .gate-led { fill: #b45309; }
      .seam-aura { fill: url(#seamAuraGradLight); }
      .seam-text { fill: #854d0e; }
      .drift-mote { fill: #be123c; }
      .seam-mote { fill: #a16207; }
      .seam-mote-lime { fill: #65a30d; }
      .intake-tail { stroke: url(#intakeTailGradLight); }
      .intake-head { fill: #a16207; }
      .intake-head-lime { fill: #4d7c0f; }
      .portal-boom { stroke: #4d7c0f; }
      .new-age-ray { fill: url(#newAgeRayGradLight); stroke: none; }
      .new-age-droplet { fill: url(#newAgeLiquidGradLight); }
      .new-age-text { fill: #92400e; }
      .headline, .sub, .value, .year, .portal-text, .seam-text, .origin-text, .new-age-text { stroke: #ffffff; }
    }
    @media (prefers-reduced-motion: reduce) {
      animate, animateTransform { display: none; }
      /* With the draw-in animation disabled, force the curve fully drawn and
         the end dot visible instead of stuck at their hidden start states. */
      .cum-line { stroke-dasharray: none; }
      .cum-dot { opacity: 1; }
    }
  </style>
  <rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="16" class="panel"/>
  <text x="${PAD_LEFT}" y="${HEAD_TOP + 32}" class="headline">${headlineNum}</text>
  <text x="${PAD_LEFT}" y="${HEAD_TOP + 60}" class="sub">total contributions since ${startYear}</text>
  ${growthRate
    ? `<text x="${PLOT_RIGHT}" y="${HEAD_TOP}" text-anchor="end" class="sub">avg growth ${escapeXML(growthRate)}</text>`
    : ""}
  ${gridlines}
  <line x1="${PLOT_LEFT}" y1="${PLOT_BOTTOM}" x2="${PLOT_RIGHT}" y2="${PLOT_BOTTOM}" class="baseline"/>
  ${originBandRect}
  ${seamField}
  ${portalField}
  ${enlightenment}
  ${cumArea}
  ${bars}
  ${origin}
  ${seam}
  ${portal}
  ${warningBanner}
</svg>`;
}

// ---------------------------------------------------------------------------
// 4. Pipeline.
// ---------------------------------------------------------------------------
async function loadModel(
  login = USERNAME,
  fetchImpl = globalThis.fetch,
  end = currentYear()
) {
  const years = await fetchYearTotals(
    login,
    START_YEAR,
    end,
    fetchImpl
  );
  const summary = years.map((y) => `${y.year}=${y.total}`).join(" ");
  console.log(`[cumulative] ${summary}`);
  const model = buildModel(years);
  const placeholders = model.rows.filter((r) => r.isFuture).length;
  console.log(
    `[cumulative] ${model.rows.length - placeholders} measured bars + ${placeholders} placeholder; cumulative=${model.cumulative}; peak=${model.peak}; avgGrowth=${model.avgGrowthPct?.toFixed(1)}%/yr (sources: ${years
      .map((y) => `${y.year}:${y.source}`)
      .join(", ")}).`
  );
  // Silent-zero guard: this profile always has thousands of contributions, so
  // a parsed total of 0 means GitHub changed both known markup forms. The
  // synthesized placeholder contributes 0 to `cumulative`, so it can never mask
  // a genuine parse failure here.
  if (!(model.cumulative > 0)) {
    throw new Error(
      `parsed 0 total contributions for ${START_YEAR}–${end}, likely a ` +
        `contributions-page markup change; refusing to emit a blank chart`
    );
  }
  return model;
}

async function main() {
  const end = currentYear();
  console.log(
    `[cumulative] fetching per-year totals for ${USERNAME}, ${START_YEAR}–${end}…`
  );
  // Fetch and parse completely before touching the committed assets. Failed
  // live data must preserve the last known-good chart and fail the workflow.
  const model = await loadModel(USERNAME, globalThis.fetch, end);

  const svg = renderSVG(model);
  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeThemedPair(OUT_PATH, svg);
  console.log(`[cumulative] wrote ${OUT_PATH} (${svg.length} bytes)`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    console.error("[cumulative] FATAL:", err?.message ?? err);
    process.exit(1);
  });
}

// ONE export site, so there is a single place to see the module's surface.
// Every constant here is the source of truth for a bound that a test asserts
// against: a test that restates the literal instead silently stops testing the
// renderer the moment the constant is retuned.
export {
  BAR_CEILING,
  GHOST_MAX_H,
  STACK_THROUGH_YEAR,
  START_YEAR,
  buildModel,
  fetchYearTotal,
  fetchYearTotals,
  loadModel,
  parseTipCount,
  renderSVG,
};
