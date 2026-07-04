// scripts/theme-split.mjs
// Splits a themed SVG (dark base rules + a single `@media (prefers-color-scheme:
// light)` override block) into two SINGLE-THEME variants: `<name>-dark.svg` and
// `<name>-light.svg`.
//
// Why: an SVG loaded via <img> on a GitHub README evaluates prefers-color-scheme
// UNRELIABLY on mobile WebKit (the media query intermittently resolves to the
// wrong scheme, and `color-scheme` doesn't influence it on Safari). That makes
// cards/graphs randomly flash the wrong theme — e.g. an opaque white card on a
// dark page. The robust fix is to resolve the theme at the PAGE level with a
// <picture> element (already used for the aws/x logos here) and serve a fixed,
// media-query-free SVG per scheme, so nothing depends on in-image detection.
//
// The transform is purely mechanical, so each variant keeps the exact colours the
// generator already produced:
//   dark  = base rules, with the prefers-color-scheme:light block removed.
//   light = base rules + that block's inner rules promoted to unconditional scope
//           (source-order-later, so they override the base — exactly what the
//           media query did). Non-theme blocks (@media hover / reduced-motion) and
//           everything else are preserved verbatim in both. `color-scheme:
//           light dark` is dropped (each variant is now single-scheme).
// Zero deps.

import { writeFileSync } from "node:fs";

const LIGHT_MEDIA = "@media (prefers-color-scheme: light)";

// Find the matching close brace for the block whose opening `{` is at/after `from`.
function matchBlock(s, from) {
  const open = s.indexOf("{", from);
  if (open === -1) return null;
  let depth = 0;
  for (let i = open; i < s.length; i++) {
    if (s[i] === "{") depth++;
    else if (s[i] === "}") {
      depth--;
      if (depth === 0) return { open, close: i };
    }
  }
  return null;
}

const stripColorScheme = (s) => s.replace(/\s*color-scheme:\s*light dark;/g, "");

export function splitThemes(svg) {
  const base = stripColorScheme(svg);
  const at = base.indexOf(LIGHT_MEDIA);
  if (at === -1) return { dark: base, light: base }; // nothing theme-conditional

  const block = matchBlock(base, at + LIGHT_MEDIA.length);
  if (!block) throw new Error("theme-split: unbalanced prefers-color-scheme block");

  const before = base.slice(0, at);
  const after = base.slice(block.close + 1);
  const inner = base.slice(block.open + 1, block.close); // rules inside the block

  // dark: drop the whole block (and a trailing blank line it may leave behind).
  const dark = (before + after).replace(/[ \t]*\n[ \t]*\n(\s*)/, "\n$1");
  // light: unwrap — the inner rules apply unconditionally, after the dark base.
  const light = before + inner.trim() + after;

  return { dark, light };
}

// Write `<combinedPath with -dark/-light before .svg>`; returns the two paths.
export function writeThemedPair(combinedPath, svg) {
  const { dark, light } = splitThemes(svg);
  const darkPath = combinedPath.replace(/\.svg$/, "-dark.svg");
  const lightPath = combinedPath.replace(/\.svg$/, "-light.svg");
  writeFileSync(darkPath, dark, "utf8");
  writeFileSync(lightPath, light, "utf8");
  return { darkPath, lightPath };
}
