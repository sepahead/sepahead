#!/usr/bin/env node
// scripts/cumulative.mjs
// Generates assets/cumulative.svg, an annual contribution bar chart
// (2020 → current year) with a headline cumulative total.
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
// We loop from=2020-01-01 .. from=<currentYear>-01-01 and parse that total
// (one regex per year, robust to the whitespace/newlines between tokens).
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
// early years (2014–2020) were sparse, so rather than seven tiny standalone
// bars they are collapsed into ONE stacked, multi-colour bar (a segment per
// year). 2021 onward each get their own bar.
const START_YEAR = Number(process.env.CUMULATIVE_START_YEAR) || 2014;
// Years <= this are merged into the first, stacked bar.
const STACK_THROUGH_YEAR =
  Number(process.env.CUMULATIVE_STACK_THROUGH) || 2020;

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
  const m = tipText.match(/(\d+)\s+contributions?\b/i);
  return m ? Number(m[1]) : 0;
};


async function fetchYearTotal(login, year) {
  const res = await fetch(FRAGMENT_URL(login, year), {
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
  const h2 = html.match(/([\d,]+)\s+contributions\s+in\s+\d{4}/i);
  if (h2) {
    return { year, total: Number(h2[1].replace(/,/g, "")), source: "h2" };
  }

  // Fallback: sum per-day <tool-tip> counts (same pair as weekdays.mjs).
  const tipBlocks = [
    ...html.matchAll(/<tool-tip[^>]*>([\s\S]*?)<\/tool-tip>/g),
  ].map((m) => m[1].trim());
  const total = tipBlocks.reduce((s, t) => s + parseTipCount(t), 0);
  console.warn(
    `[cumulative] <h2> total missing for ${year}; summed ${tipBlocks.length} tool-tips → ${total}.`
  );
  return { year, total, source: "tooltip-sum" };
}

async function fetchYearTotals(login, startYear, endYear) {
  const out = [];
  for (let year = startYear; year <= endYear; year += 1) {
    out.push(await fetchYearTotal(login, year));
  }
  return out; // ascending by year
}

// ---------------------------------------------------------------------------
// 2. Build the render model (add cumulative + flag the in-progress year).
// ---------------------------------------------------------------------------
function buildModel(years) {
  // Peak single-year total (for y-axis scaling) across ALL years.
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
      isStack: true,
      isCurrent: false,
      total: earlyTotal,
      cumulative,
      // e.g. 2014–20
      label: `${firstYear}–${String(STACK_THROUGH_YEAR).slice(2)}`,
      segments: early.map((y) => ({ year: y.year, total: y.total })),
    });
  }

  // Bars 1..n: one per year after the stack cutoff.
  for (const y of late) {
    cumulative += y.total;
    rows.push({
      isStack: false,
      isCurrent: y.year === currentYear(),
      total: y.total,
      cumulative,
      label: String(y.year),
    });
  }

  // Average year-over-year PERCENT growth (CAGR, geometric mean of the YoY
  // ratios, robust to wild single-year swings). Measured over the post-stack
  // era (years >= STACK_THROUGH_YEAR), complete years only: the sparse pre-2020
  // years would explode a percentage, and the in-progress year would understate
  // it. null when there isn't enough data.
  const growthYears = years.filter(
    (y) => y.year >= STACK_THROUGH_YEAR && y.year !== currentYear()
  );
  let avgGrowthPct = null;
  if (growthYears.length >= 2) {
    const first = growthYears[0];
    const last = growthYears[growthYears.length - 1];
    const periods = last.year - first.year;
    if (first.total > 0 && periods > 0) {
      avgGrowthPct = (Math.pow(last.total / first.total, 1 / periods) - 1) * 100;
    }
  }

  return {
    rows,
    peak,
    avgGrowthPct,
    cumulative,
    startYear: years[0]?.year ?? START_YEAR,
  };
}

// ---------------------------------------------------------------------------
// 3. No-data placeholder (still valid SVG so the workflow artifact commits).
// ---------------------------------------------------------------------------
function placeholder(errorMessage) {
  const warning = errorMessage
    ? `Live contribution data could not be fetched: ${errorMessage}`
    : "Live contribution data could not be fetched.";
  return {
    rows: [],
    peak: 0,
    avgGrowthPct: null,
    cumulative: 0,
    startYear: START_YEAR,
    warning,
  };
}

// ---------------------------------------------------------------------------
// 4. Render SVG.
//    Layout: headline total top-left; a bar per year; faint gridlines.
//    Bars: vertical cyan gradient, glowing + pulsing peak, staggered draw-in.
// ---------------------------------------------------------------------------
const W = 820;
const H = 280;
const PAD_LEFT = 56;
const PAD_RIGHT = 28;
const HEAD_TOP = 26; // headline number
const PLOT_TOP = 92;
const PLOT_BOTTOM = 224; // baseline; year labels sit below
const PLOT_HEIGHT = PLOT_BOTTOM - PLOT_TOP;
const PLOT_LEFT = PAD_LEFT;
const PLOT_RIGHT = W - PAD_RIGHT;
const PLOT_WIDTH = PLOT_RIGHT - PLOT_LEFT;

// Distinct colours for the stacked history bar, one per early year (oldest
// first, drawn from the baseline up). Harmonious with the cyan theme but
// individually distinguishable; cycles if there are more years than colours.
const STACK_COLORS = [
  "#a78bfa", // violet
  "#60a5fa", // blue
  "#22d3ee", // cyan
  "#34d399", // emerald
  "#fbbf24", // amber
  "#fb7185", // rose
  "#f472b6", // pink
];

// "Nice" rounded-up max for the y-axis (e.g. 1996 -> 2000; 1676 -> 2000).
const niceMax = (v) => {
  if (v <= 0) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / mag;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * mag;
};

// ---------------------------------------------------------------------------
// Singularity portal: a gold event-horizon seam in the gap between the last
// complete year and the in-progress year, with a hyperdrive warp field
// opening to its RIGHT. Motion language is strictly horizontal (time flows
// left→right in this chart): spectrum streaks on the left accelerate into
// the seam and are absorbed, and on the right a warp field of horizontal
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
  // Horizontal fade for a warp ray: bright at the seam, gone at plot right.
  const exit = (id, c0, c1) =>
    `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${X}" y1="0" x2="${R}" y2="0">
      <stop offset="0%" stop-color="${c0}" stop-opacity="0.95"/>
      <stop offset="55%" stop-color="${c1}" stop-opacity="0.5"/>
      <stop offset="100%" stop-color="${c1}" stop-opacity="0"/>
    </linearGradient>`;
  // The glow filter AND the seam gradients MUST be userSpaceOnUse: a vertical
  // line has a zero-width bounding box, so objectBoundingBox filter regions
  // collapse and objectBoundingBox gradient paints are disabled entirely
  // (the seam would silently not render).
  return `<linearGradient id="portalGrad" gradientUnits="userSpaceOnUse" x1="${X}" y1="${PLOT_TOP}" x2="${X}" y2="${PLOT_BOTTOM}">
      <stop offset="0%" stop-color="#f59e0b"/>
      <stop offset="50%" stop-color="#fde68a"/>
      <stop offset="100%" stop-color="#f59e0b"/>
    </linearGradient>
    <linearGradient id="portalGradLight" gradientUnits="userSpaceOnUse" x1="${X}" y1="${PLOT_TOP}" x2="${X}" y2="${PLOT_BOTTOM}">
      <stop offset="0%" stop-color="#b45309"/>
      <stop offset="50%" stop-color="#f59e0b"/>
      <stop offset="100%" stop-color="#b45309"/>
    </linearGradient>
    <radialGradient id="portalAura" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0%" stop-color="#fbbf24" stop-opacity="0.26"/>
      <stop offset="60%" stop-color="#fbbf24" stop-opacity="0.10"/>
      <stop offset="100%" stop-color="#fbbf24" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="portalAuraLight" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0%" stop-color="#d97706" stop-opacity="0.15"/>
      <stop offset="60%" stop-color="#d97706" stop-opacity="0.06"/>
      <stop offset="100%" stop-color="#d97706" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="portalFieldGrad" gradientUnits="userSpaceOnUse" x1="${X}" y1="0" x2="${R}" y2="0">
      <stop offset="0%" stop-color="#fbbf24" stop-opacity="0.13"/>
      <stop offset="45%" stop-color="#fbbf24" stop-opacity="0.05"/>
      <stop offset="100%" stop-color="#fbbf24" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="portalFieldGradLight" gradientUnits="userSpaceOnUse" x1="${X}" y1="0" x2="${R}" y2="0">
      <stop offset="0%" stop-color="#d97706" stop-opacity="0.09"/>
      <stop offset="45%" stop-color="#d97706" stop-opacity="0.03"/>
      <stop offset="100%" stop-color="#d97706" stop-opacity="0"/>
    </linearGradient>
    ${exit("exitGold", "#fde68a", "#f59e0b")}
    ${exit("exitCyan", "#a5f3fc", "#22d3ee")}
    ${exit("exitViolet", "#c4b5fd", "#a78bfa")}
    ${exit("exitGoldL", "#92400e", "#b45309")}
    ${exit("exitCyanL", "#155e75", "#0891b2")}
    ${exit("exitVioletL", "#5b21b6", "#7c3aed")}
    <filter id="portalGlow" filterUnits="userSpaceOnUse" x="${(px - 46).toFixed(1)}" y="${PLOT_TOP - 34}" width="92" height="${PLOT_HEIGHT + 68}">
      <feGaussianBlur stdDeviation="3" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
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
  const midY = (PLOT_TOP + PLOT_BOTTOM) / 2;
  const span = R - px;
  // Vortex wall: starts horizontal at the seam, bends toward the midline.
  const rayPath = (y) => {
    const yEnd = midY + (y - midY) * 0.45;
    const c1x = (px + span * 0.35).toFixed(1);
    const c2x = (px + span * 0.72).toFixed(1);
    return `M ${X} ${y} C ${c1x} ${y} ${c2x} ${yEnd.toFixed(1)} ${R} ${yEnd.toFixed(1)}`;
  };
  const ray = (y, cls, drawDur, dash, pulseDur) =>
    `<path d="${rayPath(y)}" class="portal-ray ${cls}" pathLength="1" stroke-dasharray="1 1">
      <animate attributeName="stroke-dashoffset" values="1;1;0" keyTimes="0;0.45;1" begin="0s" dur="${drawDur}s" fill="freeze" calcMode="spline" keySplines="0 0 1 1;0.3 0 0.2 1"/>
    </path>
    <path d="${rayPath(y)}" class="portal-pulse ${cls}" pathLength="1" stroke-dasharray="${dash} ${(1 - dash).toFixed(2)}" opacity="0.9">
      <animate attributeName="opacity" values="0;0;0.9" keyTimes="0;0.85;1" begin="0s" dur="2.8s" fill="freeze"/>
      <animate attributeName="stroke-dashoffset" values="1;0" begin="2.8s" dur="${pulseDur}s" repeatCount="indefinite" calcMode="spline" keyTimes="0;1" keySplines="0.55 0 0.85 0.55"/>
    </path>`;
  // Star motes: tiny specks streaming left→right through the tunnel,
  // accelerating and fading out before the right edge. Base = faint specks
  // resting mid-field (part of the frozen tableau).
  const mote = (x0, y, r, cls, begin, dur) =>
    `<circle cx="${(px + x0).toFixed(1)}" cy="${y}" r="${r}" class="portal-mote ${cls}" opacity="0.35">
      <animateTransform attributeName="transform" type="translate" values="${-x0} 0;${(span - x0 - 8).toFixed(1)} 0" begin="${begin}" dur="${dur}" repeatCount="indefinite" calcMode="spline" keyTimes="0;1" keySplines="0.5 0 0.85 0.5"/>
      <animate attributeName="opacity" values="0;0.85;0.5;0" keyTimes="0;0.2;0.75;1" begin="${begin}" dur="${dur}" repeatCount="indefinite"/>
    </circle>`;
  // Disintegrating waves: right-bowed wavefront arcs born at the seam that
  // drift SLOWLY down the tunnel to the end of the x-axis, their stroke
  // crumbling into fragments (animated dasharray) and fading as they go.
  // Base = a faint, partially-crumbled wave train near the mouth.
  const wave = (x0, h, cls, begin, dur) => {
    const wx = (px + x0).toFixed(1);
    const d = `M ${wx} ${(midY - h).toFixed(1)} Q ${(px + x0 + 16).toFixed(1)} ${midY} ${wx} ${(midY + h).toFixed(1)}`;
    return `<path d="${d}" class="portal-wave ${cls}" pathLength="1" stroke-dasharray="0.11 0.08" opacity="0.3">
      <animateTransform attributeName="transform" type="translate" values="0 0;${(span - x0 - 20).toFixed(1)} 0" begin="${begin}" dur="${dur}" repeatCount="indefinite" calcMode="spline" keyTimes="0;1" keySplines="0.3 0 0.7 1"/>
      <animate attributeName="stroke-dasharray" values="1 0;0.28 0.05;0.04 0.15" keyTimes="0;0.45;1" begin="${begin}" dur="${dur}" repeatCount="indefinite"/>
      <animate attributeName="opacity" values="0;0.5;0.32;0" keyTimes="0;0.2;0.65;1" begin="${begin}" dur="${dur}" repeatCount="indefinite"/>
    </path>`;
  };
  return `
  <g>
    <rect x="${X}" y="${PLOT_TOP}" width="${span.toFixed(1)}" height="${PLOT_HEIGHT}" class="portal-field">
      <animate attributeName="opacity" values="0;0;1" keyTimes="0;0.3;1" begin="0s" dur="2.2s" fill="freeze"/>
      <animate attributeName="opacity" values="1;0.65;1" begin="2.8s" dur="4s" repeatCount="indefinite"/>
    </rect>
    ${ray(98, "px-gold", 2.3, 0.09, 2.6)}
    ${ray(121, "px-cyan", 2.5, 0.07, 3.3)}
    ${ray(144, "px-violet", 2.4, 0.08, 2.9)}
    ${ray(172, "px-gold", 2.6, 0.06, 3.6)}
    ${ray(195, "px-cyan", 2.35, 0.09, 2.75)}
    ${ray(218, "px-violet", 2.55, 0.07, 3.15)}
    ${wave(10, 46, "pw-violet", "2.9s", "5.6s")}
    ${wave(15, 38, "pw-cyan", "4.9s", "6.6s")}
    ${wave(20, 31, "pw-gold", "6.9s", "6.0s")}
    ${mote(16, 110, 1.1, "pm-cyan", "2.8s", "2.2s")}
    ${mote(34, 133, 0.9, "pm-gold", "3.4s", "2.7s")}
    ${mote(24, 158, 1.3, "pm-violet", "3.0s", "2.4s")}
    ${mote(42, 183, 0.9, "pm-gold", "3.7s", "2.05s")}
    ${mote(20, 206, 1.1, "pm-cyan", "3.2s", "2.55s")}
  </g>`;
}

// Seam-side markup (drawn ABOVE the bars): the intake streaks absorbed at
// the horizon, the aura, the seam itself and its label.
function portalMarkup(px, fromLabel, toLabel) {
  const X = px.toFixed(1);
  const top = PLOT_TOP;
  const bot = PLOT_BOTTOM;
  const title = escapeXML(`${fromLabel} → ${toLabel}: singularity begins`);

  // Hyperdrive streaks: short spectrum dashes accelerating left→right INTO
  // the seam, brightening on approach and vanishing exactly at the horizon
  // (absorbed — nothing ever crosses to the right side here; the warp field
  // behind the bars continues the story). Rows below the neighbouring bar's
  // top get a shorter runway so no streak ever overlaps a bar. Base = faint
  // resting ticks just left of the seam.
  const streak = (y, len, run, cls, begin, dur) =>
    `<line x1="${(px - 6 - len).toFixed(1)}" y1="${y}" x2="${(px - 6).toFixed(1)}" y2="${y}" class="portal-streak ${cls}" opacity="0.35">
      <animateTransform attributeName="transform" type="translate" values="${-run} 0;6 0" begin="${begin}" dur="${dur}" repeatCount="indefinite" calcMode="spline" keyTimes="0;1" keySplines="0.5 0 0.9 0.45"/>
      <animate attributeName="opacity" values="0;0.95;0" keyTimes="0;0.7;1" begin="${begin}" dur="${dur}" repeatCount="indefinite"/>
    </line>`;

  return `
  <g>
    <title>${title}</title>
    <rect x="${(px - 22).toFixed(1)}" y="${top}" width="44" height="${bot - top}" fill="url(#portalAura)" class="portal-aura">
      <animate attributeName="opacity" values="0;0;1" keyTimes="0;0.25;1" begin="0s" dur="2.2s" fill="freeze"/>
      <animate attributeName="opacity" values="1;0.62;1" begin="2.8s" dur="3.6s" repeatCount="indefinite"/>
    </rect>
    ${streak(104, 13, 14, "ps-cyan", "2.8s", "1.3s")}
    ${streak(122, 9, 12, "ps-white", "3.3s", "1.1s")}
    ${streak(141, 12, 14, "ps-violet", "3.0s", "1.5s")}
    ${streak(176, 8, 5, "ps-gold", "3.6s", "1.2s")}
    ${streak(200, 7, 5, "ps-cyan", "3.15s", "1.4s")}
    <line x1="${X}" y1="${top}" x2="${X}" y2="${bot}" class="portal-seam">
      <animate attributeName="opacity" values="0;0;1" keyTimes="0;0.25;1" begin="0s" dur="2.4s" fill="freeze"/>
      <animate attributeName="stroke-width" values="0.5;0.5;3.6;2.4" keyTimes="0;0.25;0.75;1" begin="0s" dur="2.4s" fill="freeze"/>
      <animate attributeName="stroke-opacity" values="1;0.7;1" begin="2.9s" dur="3.8s" repeatCount="indefinite"/>
    </line>
    <text x="${X}" y="${top - 8}" text-anchor="middle" class="portal-text">singularity begins
      <animate attributeName="opacity" values="0;0;1" keyTimes="0;0.55;1" begin="0s" dur="2.6s" fill="freeze"/>
      <animate attributeName="opacity" values="1;0.75;1" begin="3.2s" dur="3.4s" repeatCount="indefinite"/>
    </text>
  </g>`;
}

function renderSVG(model) {
  const { rows, peak, avgGrowthPct, cumulative, warning, startYear } = model;
  const yMax = niceMax(peak);
  const n = rows.length || 1;

  // Bar geometry: even spacing across the plot width.
  const slot = PLOT_WIDTH / n;
  const barW = Math.min(slot * 0.62, 64);

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
      const h = yMax > 0 ? (row.total / yMax) * PLOT_HEIGHT : 0;
      const y = PLOT_BOTTOM - h;
      // Staggered draw-in: each bar starts from the baseline and grows.
      const begin = 0.15 + i * 0.13; // seconds
      const dur = 0.7; // seconds

      // --- Stacked history bar (multi-colour, one segment per early year) -----
      if (row.isStack) {
        // These early years are so sparse (single/double digits) that a strictly
        // proportional stack would be a few invisible sub-pixel slivers. To make
        // the per-year breakdown actually legible, each NON-ZERO year gets a
        // minimum visible band; exact counts live in the hover tooltips and the
        // bar's total label. Zero years are omitted entirely. The stack is thus
        // a qualitative "this bar spans several years" cue, not a proportional one.
        const MIN_SEG_PX = 7;
        let accH = 0;
        const segs = row.segments
          .map((seg, si) => {
            if (seg.total <= 0) return ""; // omit empty years, keep colour order
            const prop = yMax > 0 ? (seg.total / yMax) * PLOT_HEIGHT : 0;
            const sh = Math.max(prop, MIN_SEG_PX);
            const sy = PLOT_BOTTOM - accH - sh;
            accH += sh;
            const color = STACK_COLORS[si % STACK_COLORS.length];
            const segTitle = escapeXML(
              `${seg.year}: ${fmt(seg.total)} contributions`
            );
            return `<rect x="${x.toFixed(1)}" y="${sy.toFixed(1)}" width="${barW.toFixed(1)}" height="${sh.toFixed(1)}" fill="${color}"><title>${segTitle}</title></rect>`;
          })
          .join("\n    ");
        // Actual rendered top of the (min-band-inflated) stack.
        const stackTop = PLOT_BOTTOM - accH;
        const stackTitle = escapeXML(
          `${row.label}: ${fmt(row.total)} contributions (stacked by year) · cumulative ${fmt(row.cumulative)}`
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
      <text x="${cx.toFixed(1)}" y="${(stackTop - 8).toFixed(1)}" text-anchor="middle" class="value">${fmt(row.total)}
        <animate attributeName="opacity" from="0" to="1" begin="${(begin + dur * 0.6).toFixed(2)}s" dur="${(dur * 0.4).toFixed(2)}s" fill="freeze"/>
      </text>
    </g>
    <text x="${cx.toFixed(1)}" y="${PLOT_BOTTOM + 22}" text-anchor="middle" class="year">${escapeXML(row.label)}</text>
  </g>`;
      }

      // --- Normal single-year bar --------------------------------------------
      const isPeak = peak > 0 && row.total === peak;
      // Peak pulse starts only AFTER the draw-in finishes (begin + dur), so
      // the glow doesn't throb while the bar is still rising.
      const pulseBegin = begin + dur;
      const title = `${row.label}: ${fmt(row.total)} contributions${
        row.isCurrent ? " (year in progress)" : ""
      } · cumulative ${fmt(row.cumulative)}`;
      const titleEsc = escapeXML(title);
      return `
  <g>
    ${isPeak ? `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" rx="5" class="bar-glow"/>` : ""}
    <rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" rx="5" class="bar${isPeak ? " peak" : ""}">
      <title>${titleEsc}</title>
      <animate attributeName="height" from="0" to="${h.toFixed(1)}" begin="${begin.toFixed(2)}s" dur="${dur}s" fill="freeze" calcMode="spline" keyTimes="0;1" keySplines="0.2 0.8 0.2 1"/>
      <animate attributeName="y" from="${PLOT_BOTTOM}" to="${y.toFixed(1)}" begin="${begin.toFixed(2)}s" dur="${dur}s" fill="freeze" calcMode="spline" keyTimes="0;1" keySplines="0.2 0.8 0.2 1"/>
      ${isPeak ? `<animate attributeName="opacity" values="1;0.65;1" dur="2.6s" begin="${pulseBegin.toFixed(2)}s" repeatCount="indefinite"/>` : ""}
    </rect>
    <g class="bar-label">
      <text x="${cx.toFixed(1)}" y="${(y - 8).toFixed(1)}" text-anchor="middle" class="value">${fmt(row.total)}
        <animate attributeName="y" from="${PLOT_BOTTOM}" to="${(y - 8).toFixed(1)}" begin="${begin.toFixed(2)}s" dur="${dur}s" fill="freeze" calcMode="spline" keyTimes="0;1" keySplines="0.2 0.8 0.2 1"/>
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
  const CUM_TOP = PLOT_TOP + 10; // leave headroom so the crest isn't clipped
  const cumPts = rows.map((row, i) => {
    const cx = PLOT_LEFT + slot * i + slot / 2;
    // Anchor the ends to the bar EDGES (not centres): the curve starts at the
    // left edge of the first bar and finishes at the right edge of the last bar,
    // so the line + area span the full width of the bar chart.
    let px = cx;
    if (i === 0) px = cx - barW / 2;
    if (i === rows.length - 1) px = cx + barW / 2;
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
  </path>
  <circle cx="${endX.toFixed(1)}" cy="${endY.toFixed(1)}" r="3.5" class="cum-dot">
    <animate attributeName="opacity" values="0;0;1" keyTimes="0;0.83;1" begin="0s" dur="2.3s" fill="freeze"/>
    <animate attributeName="r" values="3.5;5;3.5" begin="2.3s" dur="2.4s" repeatCount="indefinite"/>
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
  const rangeLabel = `${startYear}–${currentYear()}`;
  const warningBanner = warning
    ? `<text x="${W / 2}" y="${H - 8}" text-anchor="middle" class="warning">${escapeXML(
        warning
      )}</text>`
    : "";

  const aria = cumulative > 0
    ? `Cumulative contributions ${rangeLabel}: ${fmt(cumulative)} total, peak ${fmt(peak)} in a single year`
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
      <stop offset="100%" stop-color="#a5f3fc"/>
    </linearGradient>
    <!-- Light-mode variants: darker, more saturated so the curve, fill and dot
         keep good contrast on a white background. -->
    <linearGradient id="cumLineGradLight" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#0e7490"/>
      <stop offset="55%" stop-color="#0891b2"/>
      <stop offset="100%" stop-color="#06b6d4"/>
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
  </defs>
  <style>
    :root { color-scheme: light dark; }
    .panel { fill: #ffffff; fill-opacity: 0.022; stroke: #ffffff; stroke-opacity: 0.07; }
    .headline { font: 700 38px ui-monospace, SFMono-Regular, Menlo, monospace; fill: #22d3ee; letter-spacing: -1px; }
    .sub { font: 500 13px ui-monospace, SFMono-Regular, Menlo, monospace; fill: #8b949e; }
    .value { font: 600 13px ui-monospace, SFMono-Regular, Menlo, monospace; fill: #c9d1d9; }
    .year { font: 500 13px ui-monospace, SFMono-Regular, Menlo, monospace; fill: #8b949e; }
    .year-peak { font-weight: 700; fill: #22d3ee; }
    .axis { font: 400 10px ui-monospace, SFMono-Regular, Menlo, monospace; fill: #6e7681; }
    .warning { font: 500 10px ui-monospace, SFMono-Regular, Menlo, monospace; fill: #fbbf24; }
    .grid { stroke: #21262d; stroke-width: 1; }
    .baseline { stroke: #30363d; stroke-width: 1; }
    .bar { fill: url(#barGrad); }
    .bar-glow { fill: #22d3ee; filter: url(#glow); opacity: 0.55; }
    .bar-label { opacity: 1; }
    .cum-area { fill: url(#cumGrad); }
    .cum-line { fill: none; stroke: url(#cumLineGrad); stroke-width: 2.5; stroke-opacity: 0.3; stroke-linecap: round; stroke-linejoin: round; filter: url(#lineGlow); }
    .cum-dot { fill: #a5f3fc; fill-opacity: 0.7; stroke: #22d3ee; stroke-width: 1.5; filter: url(#lineGlow); }
    .portal-seam { stroke: url(#portalGrad); stroke-width: 2.4; stroke-linecap: round; filter: url(#portalGlow); }
    .portal-field { fill: url(#portalFieldGrad); }
    .portal-ray { fill: none; stroke-width: 1; opacity: 0.4; }
    .portal-pulse { fill: none; stroke-width: 1.8; stroke-linecap: round; }
    .px-gold { stroke: url(#exitGold); }
    .px-cyan { stroke: url(#exitCyan); }
    .px-violet { stroke: url(#exitViolet); }
    .portal-mote { stroke: none; }
    .pm-gold { fill: #fde68a; }
    .pm-cyan { fill: #a5f3fc; }
    .pm-violet { fill: #c4b5fd; }
    .portal-wave { fill: none; stroke-width: 1.3; stroke-linecap: round; }
    .pw-gold { stroke: #fbbf24; }
    .pw-cyan { stroke: #22d3ee; }
    .pw-violet { stroke: #a78bfa; }
    .portal-streak { stroke-width: 1.6; stroke-linecap: round; }
    .ps-cyan { stroke: #22d3ee; }
    .ps-white { stroke: #fef3c7; }
    .ps-violet { stroke: #a78bfa; }
    .ps-gold { stroke: #fbbf24; }
    .portal-text { font: 600 11px ui-monospace, SFMono-Regular, Menlo, monospace; fill: #fbbf24; letter-spacing: 2.5px; }
    /* Legibility halo. An image-embedded SVG resolves prefers-color-scheme from the
       OS/browser, NOT from GitHub's theme, so the two can disagree, e.g. GitHub in
       dark mode while the OS reports "light" (common on mobile). That would paint the
       light-mode near-black labels as black-on-dark and make them unreadable. A
       paint-order stroke in the page-background colour is invisible in the matching
       case and only appears to outline the text when the scheme mismatches, so the
       numbers stay legible on either background. */
    .headline, .sub, .value, .year, .portal-text { paint-order: stroke; stroke: #0d1117; stroke-width: 3; stroke-linejoin: round; }
    @media (prefers-color-scheme: light) {
      .headline { fill: #0891b2; }
      .sub { fill: #57606a; }
      .value { fill: #1f2328; }
      .year { fill: #57606a; }
      .year-peak { fill: #0891b2; }
      .axis { fill: #6e7681; }
      .warning { fill: #b45309; }
      .grid { stroke: #eaeef2; }
      .baseline { stroke: #d0d7de; }
      .panel { fill: #0b1f2a; fill-opacity: 0.025; stroke: #0b1f2a; stroke-opacity: 0.08; }
      .cum-line { stroke: url(#cumLineGradLight); stroke-opacity: 0.35; }
      .cum-area { fill: url(#cumGradLight); }
      .cum-dot { fill: #0891b2; stroke: #0e7490; }
      .portal-seam { stroke: url(#portalGradLight); }
      .portal-field { fill: url(#portalFieldGradLight); }
      .px-gold { stroke: url(#exitGoldL); }
      .px-cyan { stroke: url(#exitCyanL); }
      .px-violet { stroke: url(#exitVioletL); }
      .pm-gold { fill: #b45309; }
      .pm-cyan { fill: #0891b2; }
      .pm-violet { fill: #7c3aed; }
      .pw-gold { stroke: #d97706; }
      .pw-cyan { stroke: #0891b2; }
      .pw-violet { stroke: #7c3aed; }
      .ps-white { stroke: #b45309; }
      .ps-cyan { stroke: #0891b2; }
      .ps-violet { stroke: #7c3aed; }
      .ps-gold { stroke: #d97706; }
      .portal-aura { fill: url(#portalAuraLight); }
      .portal-text { fill: #b45309; }
      .headline, .sub, .value, .year, .portal-text { stroke: #ffffff; }
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
  ${avgGrowthPct != null
    ? `<text x="${PLOT_RIGHT}" y="${HEAD_TOP}" text-anchor="end" class="sub">avg growth ${avgGrowthPct >= 0 ? "+" : ""}${Math.round(avgGrowthPct)}%/yr</text>`
    : ""}
  ${gridlines}
  <line x1="${PLOT_LEFT}" y1="${PLOT_BOTTOM}" x2="${PLOT_RIGHT}" y2="${PLOT_BOTTOM}" class="baseline"/>
  ${portalField}
  ${cumArea}
  ${bars}
  ${portal}
  ${warningBanner}
</svg>`;
}

// ---------------------------------------------------------------------------
// 5. Pipeline.
// ---------------------------------------------------------------------------
async function main() {
  const end = currentYear();
  console.log(
    `[cumulative] fetching per-year totals for ${USERNAME}, ${START_YEAR}–${end}…`
  );
  let model;
  try {
    const years = await fetchYearTotals(USERNAME, START_YEAR, end);
    const summary = years.map((y) => `${y.year}=${y.total}`).join(" ");
    console.log(`[cumulative] ${summary}`);
    model = buildModel(years);
    console.log(
      `[cumulative] ${model.rows.length} bars; cumulative=${model.cumulative}; peak=${model.peak}; avgGrowth=${model.avgGrowthPct?.toFixed(1)}%/yr (sources: ${years
        .map((y) => `${y.year}:${y.source}`)
        .join(", ")}).`
    );
    // Silent-zero guard: this profile always has thousands of contributions, so
    // a parsed total of 0 means GitHub changed BOTH the <h2> total AND the
    // <tool-tip> fallback markup, a 200 OK with unrecognised HTML, which
    // fetchYearTotal() does NOT throw on. Fail here so the catch below renders
    // the visible placeholder banner instead of silently committing a blank
    // chart to the live profile.
    if (!(model.cumulative > 0)) {
      throw new Error(
        `parsed 0 total contributions for ${START_YEAR}–${end}, likely a ` +
          `contributions-page markup change; refusing to emit a blank chart`
      );
    }
  } catch (err) {
    const msg = String(err?.message ?? err);
    console.warn(`[cumulative] failed (reason below); using placeholder: ${msg}`);
    model = placeholder(msg);
  }

  const svg = renderSVG(model);
  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeThemedPair(OUT_PATH, svg);
  console.log(`[cumulative] wrote ${OUT_PATH} (${svg.length} bytes)`);
}

main().catch((err) => {
  console.error("[cumulative] FATAL:", err?.message ?? err);
  process.exit(1);
});
