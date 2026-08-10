// scripts/chart-svg.test.mjs
// Structural regression tests for the generated activity-chart SVG.
//
// WHY THIS FILE EXISTS. The chart is one big template literal that emits XML by
// hand, and it has been broken twice by characters that are harmless in JS but
// fatal in the output:
//
//   1. A backtick inside a CSS comment terminated the template literal and the
//      module stopped parsing entirely.
//   2. A raw less-than sign inside a CSS comment made the SVG malformed XML.
//      Style content is ordinary character data, not CDATA, so an image-embedded
//      SVG fails to render outright - yet `node --check` passes, the generator
//      exits 0, and it writes a plausible-looking file. Nothing caught it.
//
// Both are invisible to a syntax check and to any test that only inspects the
// model, so this file scans the RENDERED STRING. There is no XML parser
// dependency (this repo is deliberately zero-dep), so the scanner below is
// hand-rolled: it requires every less-than sign to open a legal XML construct,
// which is precisely the class of bug that shipped.
//
// It also covers the newer bar cues (the next-year ghost slot and the
// in-progress dashed cap), because those render on conditional branches that a
// happy-path render does not necessarily exercise.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { buildModel, renderSVG } from "./cumulative.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");

// Mirrors CHART_TZ's default in cumulative.mjs: the current-year boundary is
// anchored to Berlin, not to the runner's local clock.
const CHART_TZ = process.env.CHART_TZ || "Europe/Berlin";
const thisYear = Number(
  new Intl.DateTimeFormat("en-CA", {
    timeZone: CHART_TZ,
    year: "numeric",
  }).format(new Date())
);

// Real-shaped history. The trailing entry is the in-progress year, whose total
// each fixture varies to reach a different rendering branch.
const HISTORY = [
  [2014, 6],
  [2015, 14],
  [2016, 31],
  [2017, 44],
  [2018, 52],
  [2019, 70],
  [2020, 73],
  [2021, 61],
  [2022, 188],
  [2023, 236],
  [2024, 1676],
  [2025, 2027],
];

function fixture(currentTotal) {
  const years = HISTORY.filter(([year]) => year < thisYear).map(
    ([year, total]) => ({ year, total, source: "h2" })
  );
  years.push({ year: thisYear, total: currentTotal, source: "h2" });
  return years;
}

const render = (currentTotal) => renderSVG(buildModel(fixture(currentTotal)));

// The three branches worth covering:
//   tall     - an ordinary large in-progress year; cap drawn.
//   maxed    - a total the scale ladder maps to exactly itself, so the bar fills
//              100% and hits the clamp. This is the case that used to shove the
//              value label into the era captions.
//   nearZero - every January the in-progress year sits on the minimum-height
//              floor, where the cap is deliberately suppressed.
const CASES = [
  ["tall", 6240],
  ["maxed", 6000],
  ["nearZero", 1],
];

// ---------------------------------------------------------------------------
// A hand-rolled strict XML scanner.
// ---------------------------------------------------------------------------

const NAME_START = /[A-Za-z_:]/;
const NAME = /^[A-Za-z_:][A-Za-z0-9_.:-]*/;

/** Human-readable "line N, column M" plus a snippet, so failures are diagnosable. */
function where(svg, index) {
  const before = svg.slice(0, index);
  const line = before.split("\n").length;
  const column = index - (before.lastIndexOf("\n") + 1) + 1;
  const snippet = svg.slice(Math.max(0, index - 70), index + 40).replace(/\n/g, "\\n");
  return `line ${line}, column ${column}\n    …${snippet}…`;
}

/**
 * Walks the document, requiring every "<" to open a legal XML construct and
 * every element to be closed by its matching end tag. Returns the tag names in
 * document order. Throws an assertion error (with position) on the first
 * problem.
 */
function scanXML(svg) {
  const stack = [];
  const opened = [];
  let index = 0;

  while (index < svg.length) {
    const lt = svg.indexOf("<", index);
    if (lt === -1) break;
    index = lt;

    if (svg.startsWith("<!--", index)) {
      const end = svg.indexOf("-->", index + 4);
      assert.notEqual(end, -1, `unterminated comment at ${where(svg, index)}`);
      index = end + 3;
      continue;
    }
    if (svg.startsWith("<![CDATA[", index)) {
      const end = svg.indexOf("]]>", index + 9);
      assert.notEqual(end, -1, `unterminated CDATA at ${where(svg, index)}`);
      index = end + 3;
      continue;
    }
    if (svg.startsWith("<?", index)) {
      const end = svg.indexOf("?>", index + 2);
      assert.notEqual(end, -1, `unterminated processing instruction at ${where(svg, index)}`);
      index = end + 2;
      continue;
    }

    const isEnd = svg[index + 1] === "/";
    const nameAt = index + (isEnd ? 2 : 1);

    // THE LOAD-BEARING ASSERTION. A stray less-than sign in text or style
    // content lands here, because what follows it is not a legal name start.
    assert.ok(
      NAME_START.test(svg[nameAt] ?? ""),
      `raw "<" that does not open a tag - it must be escaped as &lt; - at ${where(svg, index)}`
    );

    const nameMatch = NAME.exec(svg.slice(nameAt));
    assert.ok(nameMatch, `unreadable tag name at ${where(svg, index)}`);
    const name = nameMatch[0];

    // Find the tag's closing ">", ignoring any ">" inside an attribute value.
    let cursor = nameAt + name.length;
    let quote = null;
    while (cursor < svg.length) {
      const ch = svg[cursor];
      if (quote) {
        if (ch === quote) quote = null;
      } else if (ch === '"' || ch === "'") {
        quote = ch;
      } else if (ch === ">") {
        break;
      }
      cursor += 1;
    }
    assert.ok(cursor < svg.length, `unterminated tag at ${where(svg, index)}`);

    const body = svg.slice(nameAt + name.length, cursor);

    if (isEnd) {
      const expected = stack.pop();
      assert.equal(
        name,
        expected,
        `end tag "${name}" does not match open element "${expected}" at ${where(svg, index)}`
      );
    } else {
      opened.push(name);
      if (!body.trimEnd().endsWith("/")) stack.push(name);
    }

    index = cursor + 1;
  }

  assert.deepEqual(stack, [], `unclosed elements: ${stack.join(", ")}`);
  return opened;
}

/** Contents of the single <style> element. */
function styleBody(svg) {
  const match = /<style>([\s\S]*?)<\/style>/.exec(svg);
  assert.ok(match, "expected exactly one <style> block in the chart SVG");
  return match[1];
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

for (const [label, currentTotal] of CASES) {
  test(`rendered SVG is well-formed and balanced (${label})`, () => {
    const svg = render(currentTotal);
    const tags = scanXML(svg);
    assert.equal(tags[0], "svg", "root element must be <svg>");
    assert.ok(tags.includes("style"), "expected an inline <style> block");
  });

  test(`style content carries no template-breaking characters (${label})`, () => {
    const body = styleBody(render(currentTotal));

    // Guards bug #2 directly, with a far clearer message than the scanner's.
    // Style content is character data, so a raw "<" is fatal XML.
    assert.ok(
      !body.includes("<"),
      "style content contains a raw less-than sign; escape it or reword the comment"
    );
    // Guards bug #1. A backtick here means the template literal was terminated
    // early, so this can only fail if the file somehow still parses.
    assert.ok(!body.includes("`"), "style content contains a backtick");
  });

  test(`no unescaped ampersands or placeholder leakage (${label})`, () => {
    const svg = render(currentTotal);
    const bad = svg.match(/&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9A-Fa-f]+);)/g);
    assert.equal(bad, null, `unescaped ampersand(s): ${bad?.join(", ")}`);
    assert.ok(!svg.includes("NaN"), "NaN leaked into the SVG");
    assert.ok(!svg.includes("undefined"), "undefined leaked into the SVG");
  });
}

test("the new age 20-rays fan survives every branch", () => {
  for (const [label, currentTotal] of CASES) {
    const svg = render(currentTotal);
    assert.equal(
      (svg.match(/class="[^"]*\bnew-age-ray\b[^"]*"/g) || []).length,
      20,
      `expected 20 ray polygons (${label})`
    );
    assert.equal(
      (svg.match(/class="[^"]*\bnew-age-seed-core\b[^"]*"/g) || []).length,
      12,
      `expected 12 terraforming seed cores (${label})`
    );
    assert.equal(
      (svg.match(/class="[^"]*\bnew-age-bloom\b[^"]*"/g) || []).length,
      12,
      `expected 12 bloom rings (${label})`
    );
    const rays = svg.match(/<polygon[^>]*class="[^"]*\bnew-age-ray\b[^"]*"[^>]*>/g) || [];
    for (const ray of rays) {
      const pts = (ray.match(/points="([^"]+)"/)?.[1] || "").trim().split(/\s+/);
      assert.ok(pts.length >= 8, `ray must be a polygon with 4+ points (${label})`);
    }
  }
});

test("written dark/light assets preserve 20-rays and ray gradient opacities", () => {
  const expectedStops = {
    newAgeRayGrad: ["0.82", "0.64", "0.32", "0"],
    newAgeRayGradLight: ["0.88", "0.58", "0.28", "0"],
  };
  for (const theme of ["dark", "light"]) {
    const asset = readFileSync(resolve(REPO_ROOT, `assets/cumulative-${theme}.svg`), "utf8");
    assert.equal(
      (asset.match(/class="[^"]*\bnew-age-ray\b[^"]*"/g) || []).length,
      20,
      `${theme}: written asset must contain 20 ray polygons`
    );
    assert.equal(
      (asset.match(/class="[^"]*\bnew-age-seed-core\b[^"]*"/g) || []).length,
      12,
      `${theme}: written asset must contain 12 seed cores`
    );
    const activeGradientIds =
      theme === "dark"
        ? ["newAgeRayGrad"]
        : Object.keys(expectedStops);
    for (const id of activeGradientIds) {
      const block = asset.match(new RegExp(`<(?:linear|radial)Gradient id="${id}"[^>]*>([\\s\\S]*?)</(?:linear|radial)Gradient>`))?.[1] ?? "";
      assert.deepEqual(
        [...block.matchAll(/stop-opacity="([^"]+)"/g)].map((m) => m[1]),
        expectedStops[id],
        `${theme}: ${id} stop opacities must remain unchanged`
      );
    }
    assert.match(asset, /\.narrative-enlightenment\s*\{[^}]*opacity:\s*0\.78/);
  }
});

test("written assets retain bounded ray geometry", () => {
  for (const theme of ["dark", "light"]) {
    const asset = readFileSync(resolve(REPO_ROOT, `assets/cumulative-${theme}.svg`), "utf8");
    const rays = asset.match(/<polygon[^>]*class="[^\"]*\bnew-age-ray\b[^\"]*"[^>]*>/g) || [];
    assert.equal(rays.length, 20, `${theme}: expected 20 written ray polygons`);
    for (const ray of rays) {
      const pts = (ray.match(/points="([^"]+)"/)?.[1] || "").trim().split(/\s+/);
      assert.ok(pts.length >= 8, `${theme}: ray must have 4+ points`);
      // Source points (first two) must be near the top of the plot
      const y0 = Number(pts[1]);
      assert.ok(y0 > 115 && y0 < 150, `${theme}: ray source y=${y0} must be near plot top`);
      // Destination points (last two) must extend downward
      const y2 = Number(pts[3]);
      assert.ok(y2 > y0, `${theme}: ray must extend downward`);
    }
  }
});

test("legacy phase gradients retain their authored opacity snapshots", () => {
  const expected = {
    seamFieldGrad: ["0.20", "0.22", "0.30", "0.34", "0.32", "0.30", "0.26", "0.20", "0.13"],
    seamFieldGradLight: ["0.26", "0.24", "0.24", "0.25", "0.25", "0.24", "0.20", "0.18", "0.13"],
    originBand: ["0.18", "0.14", "0.18", "0.22"],
    originBandLight: ["0.20", "0.16", "0.20", "0.24"],
    cumGrad: ["0.16", "0.06", "0"],
    cumGradLight: ["0.13", "0.05", "0"],
  };
  for (const theme of ["dark", "light"]) {
    const asset = readFileSync(resolve(REPO_ROOT, `assets/cumulative-${theme}.svg`), "utf8");
    const activeIds = theme === "dark"
      ? Object.keys(expected).filter((id) => !id.endsWith("Light"))
      : Object.keys(expected);
    for (const id of activeIds) {
      const stops = expected[id];
      const block = asset.match(new RegExp(`<(?:linear|radial)Gradient id="${id}"[^>]*>([\\s\\S]*?)</(?:linear|radial)Gradient>`))?.[1] ?? "";
      assert.deepEqual(
        [...block.matchAll(/stop-opacity="([^"]+)"/g)].map((m) => m[1]),
        stops,
        `${theme}: ${id} opacity snapshot changed`
      );
    }
  }
});

test("future runway slots render on every branch", () => {
  for (const [label, currentTotal] of CASES) {
    const svg = render(currentTotal);
    // Match the ELEMENTS, not the CSS rule: the ".future-ghost" selector is
    // always in the style block, so asserting on it alone would prove nothing.
    assert.equal(
      (svg.match(/class="future-ghost"/g) || []).length,
      2,
      `expected one future-ghost element per future slot (${label})`
    );
    for (const year of [thisYear + 1, thisYear + 2]) {
      assert.ok(
        svg.includes(`class="year year-future">${year}`),
        `expected a dimmed ${year} label (${label})`
      );
    }
  }
});

test("in-progress cap renders when the bar is tall and is suppressed when it is not", () => {
  const capMarker = 'class="bar-cap"';

  for (const total of [6240, 6000]) {
    assert.ok(
      render(total).includes(capMarker),
      `expected an in-progress cap for a current-year total of ${total}`
    );
  }

  // On the minimum-height floor the cap would be as thick as the bar itself and
  // would read as the bar rather than as a cue, so it is intentionally dropped.
  // The year label and the tooltip still say "in progress".
  const tiny = render(1);
  assert.ok(
    !tiny.includes(capMarker),
    "cap must be suppressed on a near-empty in-progress bar"
  );
  assert.ok(
    tiny.includes("(year in progress)"),
    "the tooltip must still mark the year as in progress when the cap is dropped"
  );
});

test("bar-cap dasharray survives CSS interpolation", () => {
  // This is the first CSS rule in the file with an interpolated value, so a
  // broken constant would silently emit "NaN" or "undefined" into the stylesheet
  // and the cue would render solid rather than dashed.
  const rule = /\.bar-cap\s*\{[^}]*\}/.exec(styleBody(render(6240)));
  assert.ok(rule, "expected a .bar-cap rule");
  assert.match(
    rule[0],
    /stroke-dasharray:\s*\d+(?:\.\d+)?\s+\d+(?:\.\d+)?\s*;/,
    `.bar-cap dasharray is not two numbers: ${rule[0]}`
  );
});

test("value labels never reach the era captions", () => {
  // The structural bug this guards: bars scale into a reserved band, but their
  // value labels are drawn ABOVE the bar top, i.e. outside it. Without the
  // reservation a tall bar pushes its label into the era captions. Asserted
  // RELATIVELY (labels vs captions) rather than against hardcoded pixels, so a
  // future layout retune stays honest instead of needing the numbers updated.
  const MIN_CLEARANCE = 12; // caption font is 11px and both texts carry a 2px halo

  for (const [label, currentTotal] of CASES) {
    const svg = render(currentTotal);

    const labels = [
      ...svg.matchAll(/y="([\d.]+)" text-anchor="middle" class="value/g),
    ].map((m) => Number(m[1]));
    const captions = [
      ...svg.matchAll(
        /y="([\d.]+)" text-anchor="middle" class="(?:portal-text|seam-text)"/g
      ),
    ].map((m) => Number(m[1]));

    assert.ok(labels.length > 0, `expected value labels (${label})`);
    assert.ok(captions.length > 0, `expected era captions (${label})`);

    // Smaller y is higher up the canvas.
    const highestLabel = Math.min(...labels);
    const lowestCaption = Math.max(...captions);
    assert.ok(
      highestLabel - lowestCaption >= MIN_CLEARANCE,
      `only ${(highestLabel - lowestCaption).toFixed(1)}px between the highest value ` +
        `label (y=${highestLabel}) and the lowest era caption (y=${lowestCaption}) ` +
        `in the "${label}" case; need >= ${MIN_CLEARANCE}px`
    );
  }
});

test("future runway slots stay out of every aggregate", () => {
  const model = buildModel(fixture(6240));
  const future = model.rows.filter((row) => row.isFuture);

  assert.equal(future.length, 2, "expected two synthesized future rows");
  assert.deepEqual(
    future.map((row) => row.year),
    [thisYear + 1, thisYear + 2],
    "future slots must be the two years after the current year"
  );
  assert.deepEqual(
    future.map((row) => row.total),
    [0, 0],
    "future slots must never carry measured totals"
  );
  assert.equal(future[0].isRunway, false, "the first future slot is the placeholder");
  assert.equal(future[1].isRunway, true, "the second future slot is the runway boundary");
  assert.equal(model.rows.at(-1), future[1], "the second future slot must be last");

  assert.equal(model.peak, 6240, "zero rows must not be able to tie for peak");
  assert.equal(
    model.cumulative,
    model.rows.filter((row) => !row.isFuture).at(-1).cumulative,
    "the running total must end on the last MEASURED year"
  );
  // A zero year inside the growth window would compute a -100% collapse.
  assert.ok(
    model.avgGrowthPct > 0,
    `growth must be computed from measured years only, got ${model.avgGrowthPct}`
  );
});

test("README embed height matches the SVG aspect ratio", () => {
  // The generator owns the viewBox; the README hardcodes display dimensions.
  // Those two drift apart silently on any canvas resize, letterboxing or
  // squashing the chart on the profile. Derive rather than hardcode.
  const svg = render(6240);
  const viewBox = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg);
  assert.ok(viewBox, "expected a viewBox on the chart SVG");
  const [, vbWidth, vbHeight] = viewBox.map(Number);

  const readme = readFileSync(resolve(REPO_ROOT, "README.md"), "utf8");
  const embed =
    /<img src="[^"]*assets\/cumulative-dark\.svg" width="(\d+)" height="(\d+)"/.exec(
      readme
    );
  assert.ok(embed, "could not find the cumulative chart <img> embed in README.md");
  const width = Number(embed[1]);
  const height = Number(embed[2]);

  assert.equal(
    height,
    Math.round((vbHeight * width) / vbWidth),
    `README embed is ${width}x${height} but the SVG viewBox is ${vbWidth}x${vbHeight}; ` +
      `height should be ${Math.round((vbHeight * width) / vbWidth)}`
  );
});
