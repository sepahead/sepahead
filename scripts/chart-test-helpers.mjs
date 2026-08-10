// scripts/chart-test-helpers.mjs
// Shared extraction helpers for the chart SVG tests. Zero dependencies, and no
// test assertions of its own -- callers assert, these only extract.
//
// The one exception: an extractor THROWS when its own arguments or input are
// malformed. That is a contract violation, not a test outcome, and throwing is
// the whole point -- a malformed argument would otherwise match nothing and
// hand the caller a silent pass, which is the bug class this file exists to
// prevent. Fail loudly at the source instead.
//
// WHY THIS FILE EXISTS. Every assertion in the chart suite works by pulling
// values back out of a generated SVG string with a regular expression. A regex
// that matches NOTHING makes its test pass silently: it asserts over an empty
// set. That is strictly worse than having no test, because the green result is
// then mistaken for coverage. It has already happened twice in this repo:
//
//   * a themed-variant test counted the bare substring "prefers-color-scheme"
//     and fired on a PROSE COMMENT, reporting a failure that did not exist;
//   * a curve-clearance check extracted zero coordinates, so reverting the fix
//     it supposedly guarded left the whole suite green.
//
// So the rules encoded here are:
//
//   1. Every extractor returns an ARRAY. Callers assert a minimum count before
//      asserting anything about the values.
//   2. Element matching is TAG-FIRST: find the whole tag, then read attributes
//      out of that one tag. Never assume one attribute precedes another, and
//      never let a match span two elements.
//   3. Class matching is on the class LIST, so class="bar peak" still matches
//      "bar". An exact class="bar" comparison silently drops the peak bar.
//   4. CSS is DECOMMENTED before selectors are matched, so prose can never be
//      mistaken for a rule -- but only AFTER any raw-character check, because a
//      raw less-than sign inside a comment is exactly the fatal XML bug that
//      shipped once. Strip comments late, never first.
//   5. A class argument is a plain TOKEN, never a regex fragment and never a
//      CSS selector. Token matching is what makes rule 3 work, so anything
//      regex-shaped ("bar(?: peak)?") or dot-prefixed (".bar") is rejected
//      rather than quietly matching nothing. Both mistakes have real history
//      here: the fragment form was a workaround for the older exact-attribute
//      matcher and became a silent zero-match the moment token matching landed.

// ---------------------------------------------------------------------------
// Markup
// ---------------------------------------------------------------------------

// Every opening tag of `tag` in the document, as raw tag text.
// `[^>]*` cannot cross a closing angle bracket, so a match always stays inside
// ONE element. That matters more than it looks: the bars nest <animate>
// children carrying their own y/height values, and a pattern able to span
// elements would fold those into any minimum computed from the results.
export function tags(svg, tag) {
  return [...svg.matchAll(new RegExp(`<${tag}\\s[^>]*>`, "g"))].map((m) => m[0]);
}

// The class attribute of a single tag, split into a list.
export function classListOf(tag) {
  const m = /\sclass="([^"]*)"/.exec(tag);
  return m ? m[1].trim().split(/\s+/).filter(Boolean) : [];
}

// A single CSS class token: what actually appears inside a class attribute.
// Deliberately strict, because every character this rejects is one that would
// make `includes` compare against something no class list can ever contain.
const CLASS_TOKEN = /^[A-Za-z_][A-Za-z0-9_-]*$/;

// Every `tag` whose class LIST contains `cls`. Attribute-order-independent by
// construction, because the tag is matched first and attributes are read out of
// it afterwards.
//
// `cls` is compared as a whole TOKEN, so "bar" matches class="bar" AND
// class="bar peak", while class="bar-glow" is correctly excluded (its only
// token is "bar-glow"). That is why no caller needs an alternation fragment --
// and why one is rejected outright: a regex-shaped or dot-prefixed argument
// matches no token at all, so the caller would assert over an empty set and
// pass. Throwing converts that silent pass into an obvious failure.
export function tagsWithClass(svg, tag, cls) {
  if (!CLASS_TOKEN.test(cls)) {
    throw new TypeError(
      `tagsWithClass: "${cls}" is not a plain class token. Pass the bare token ` +
        `as it appears in a class attribute ("bar"), not a CSS selector (".bar") ` +
        `and not a regex fragment ("bar(?: peak)?"). Matching is per-token, so ` +
        `"bar" already covers class="bar peak".`
    );
  }
  return tags(svg, tag).filter((t) => classListOf(t).includes(cls));
}

// A single attribute's raw string value from one tag, or null when absent.
// Returning null rather than "" lets callers distinguish "missing" from
// "present but empty" and fail loudly on the former.
export function attrOf(tag, name) {
  const m = new RegExp(`\\s${name}="([^"]*)"`).exec(tag);
  return m ? m[1] : null;
}

// Numeric form of attrOf. Returns NaN for a non-numeric value and null for a
// missing one, so `Number.isFinite` is a sufficient guard at the call site.
export function numAttr(tag, name) {
  const raw = attrOf(tag, name);
  return raw === null ? null : Number(raw);
}

// The root svg element's aria-label, or null. escapeXML guarantees the value
// contains no raw angle bracket, so `[^>]*` is safe to scan the root tag with.
export function ariaLabelOf(svg) {
  const root = /<svg\s[^>]*>/.exec(svg);
  return root ? attrOf(root[0], "aria-label") : null;
}

// Every Y coordinate in an SVG path `d`, whatever the commands are.
// Coordinates are parsed as PAIRS rather than per-command on purpose: a cubic
// `C` carries THREE pairs, so anything assuming one pair per command would read
// two thirds of the curve as X values and miss the crest entirely.
export function pathYs(d) {
  const nums = (d.match(/-?\d*\.?\d+/g) ?? []).map(Number);
  // Pair-stepping is only valid while every command takes whole x,y pairs, which
  // M/L/C/Z all do. An odd count means a command with an odd argument list got
  // emitted (an arc carries seven numbers), and the stepping would then read X
  // values as Y and report a crest that does not exist. Refuse rather than
  // return plausible-looking nonsense.
  if (nums.length % 2 !== 0) {
    throw new Error(
      `pathYs: expected whole x,y pairs but found ${nums.length} numbers. A ` +
        `command with an odd argument list (such as an arc) would desynchronise ` +
        `the pairing and misreport every Y coordinate.`
    );
  }
  const ys = [];
  for (let i = 1; i < nums.length; i += 2) ys.push(nums[i]);
  return ys;
}

// ---------------------------------------------------------------------------
// CSS
// ---------------------------------------------------------------------------

// Bodies of every <style> block. Returned as an array so callers can assert
// there is EXACTLY ONE: theme-split.mjs unwraps a single light block, so a
// second style block is a real failure mode, not a stylistic quibble.
export function styleBlocks(svg) {
  return [...svg.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((m) => m[1]);
}

// Strip CSS comments. Call this only AFTER any raw-character check -- see the
// header note; stripping first would mask the bug class this suite exists for.
export function decomment(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

// EVERY declaration block for `selector`, not just the first. In a light
// variant the base rule and the unwrapped override BOTH exist, and a
// non-global match would only ever inspect the base -- which is precisely
// where a contrast regression would hide.
//
// Only single-selector rules are matched: a grouped rule such as
// `.value, .year { ... }` is intentionally out of scope, because callers here
// are checking a property a specific class owns, not one it inherits.
export function declarationsOf(css, selector) {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return [
    ...decomment(css).matchAll(new RegExp(`${esc}\\s*\\{([^}]*)\\}`, "g")),
  ].map((m) => m[1].trim());
}

// The SOLE value of `prop` across a set of declaration blocks. Matching is
// anchored on a semicolon or start-of-block, so `opacity` cannot match
// `fill-opacity`.
//
// Two failure modes are deliberately fatal rather than silent:
//   >1 declaration -- the caller is reading one block of a cascade and would
//      quietly ignore a light-theme override (see declValues/effectiveDeclValue
//      for the cascade-aware forms).
//   0 declarations -- returning null here reads as `0` through Number(), which
//      is a FLATTERING value for the geometry and contrast bounds these helpers
//      feed. A missing property must fail at the helper, not at the discretion
//      of each caller remembering to null-check.
export function soleDeclValue(decls, prop) {
  // Delegate to the cascade-aware collector so there is ONE extraction pattern
  // in this module, then require the sole-declaration invariant. A caller that
  // asserts one value while `prop` is declared in several blocks is testing
  // only the winner and silently ignoring the others -- so a regression in a
  // base rule passes as long as an override is still correct. Fail LOUDLY on
  // both ambiguity and absence instead. Callers that legitimately expect several
  // values (the per-theme contrast checks) want `declValues`, and callers that
  // want the rendered winner want `effectiveDeclValue`.
  const all = declValues(decls, prop);
  if (all.length !== 1) {
    throw new Error(
      `soleDeclValue("${prop}") expected exactly 1 declaration, found ${all.length}` +
        `${all.length ? `: ${all.join(" | ")}` : ""}. ` +
        `Use declValues/effectiveDeclValue if several blocks are expected.`
    );
  }
  return all[0];
}

// EVERY value of `prop`, in document order, across a set of declaration blocks.
// This module deliberately has no first-hit-wins extractor: one existed, and it
// quietly reinstated the single-block blind spot `declarationsOf` was made
// global to close. In a light variant the base rule AND the unwrapped override
// both declare the property, so inspecting only one block is exactly where a
// contrast regression would hide. The `(?:^|;)` anchor is load-bearing: without
// it, asking for `stroke` also matches inside `stroke-width` and
// `stroke-dasharray`. Callers that want the rendered winner use
// `effectiveDeclValue`; callers asserting a property is declared exactly once
// use `soleDeclValue`.
export function declValues(decls, prop) {
  const out = [];
  for (const decl of decls) {
    for (const m of decl.matchAll(
      new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`, "g")
    )) {
      out.push(m[1].trim());
    }
  }
  return out;
}

// The value a browser would actually USE for `prop` on `selector`: the LAST one
// declared, because theme-split builds the light variant by appending the
// unwrapped light rules after the base rules, and equal-specificity selectors
// are resolved last-wins. Reading the first value reports the DARK value for a
// light file, which is exactly backwards for a per-theme contrast assertion.
export function effectiveDeclValue(css, selector, prop) {
  const values = declValues(declarationsOf(css, selector), prop);
  return values.length ? values[values.length - 1] : null;
}

// ---------------------------------------------------------------------------
// Colour / WCAG contrast
// ---------------------------------------------------------------------------
//
// This duplicates nothing: accessibility.test.mjs has its own copy, but it is a
// TEST file, so importing from it would re-register and re-run its tests as a
// side effect. A plain module is the only clean shared home, so new callers
// should use these and that copy can migrate here later.

// A #rgb or #rrggbb colour as [r, g, b] bytes, or null when unparseable.
// Returning null rather than a default keeps a typo from silently computing a
// flattering ratio against black -- callers assert non-null first.
export function parseHex(color) {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(color).trim());
  if (!m) return null;
  const hex =
    m[1].length === 3
      ? m[1]
          .split("")
          .map((c) => c + c)
          .join("")
      : m[1];
  return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
}

// Composite `color` over `backdrop` at `alpha`. Renderers blend in ENCODED sRGB
// (the same space the hex literals are written in), not in linear light, so this
// deliberately interpolates the bytes directly. Blending linearly instead would
// report a materially different -- and wrong -- ratio for any dimmed text.
export function blend(color, backdrop, alpha) {
  const fg = parseHex(color);
  const bg = parseHex(backdrop);
  if (!fg || !bg) return null;
  return fg.map((c, i) => c * alpha + bg[i] * (1 - alpha));
}

// WCAG relative luminance from [r, g, b] bytes.
export function luminance(rgb) {
  const [r, g, b] = rgb.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// WCAG contrast ratio between two [r, g, b] triples, always at least 1.
export function contrastRatio(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

// At-rule PRELUDES only -- the text between `@media` and its opening brace.
// Counting preludes instead of bare substrings is what stops a media query
// being confused with the same words appearing in prose.
export function mediaPreludes(css) {
  return [...decomment(css).matchAll(/@media([^{]*)\{/g)].map((m) => m[1].trim());
}
