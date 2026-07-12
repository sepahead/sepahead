// scripts/logo-extract.mjs
// Extract each project's work-graph node-mark as a STANDALONE themed logo SVG
// (dark + light variants) for use in that project's repo README. Reuses the exact
// generator (nodeMark + SHARED_DEFS + SHARED_STYLE) so the logo is pixel-identical
// to the mark in "THE SYSTEM" graph (animations included — SMIL plays in an <img>
// on GitHub, and the reduced-motion CSS still applies). The project label/wordmark
// is stripped so the logo is a clean badge; the README supplies the name. Background
// is transparent so the badge floats on any README. Zero deps beyond the generator.
import { nodeMark, SHARED_DEFS, SHARED_STYLE, nodes } from "./work-graph.mjs";
import { splitThemes } from "./theme-split.mjs";
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const f1 = (v) => Number(v.toFixed(1));

// Per-project viewBox half-size (px, node-space): wide enough to keep the badge's
// glow/shadow bleed (the label is stripped, so no need to clip tightly).
const SPEC = {
  pidrs:    { half: 50 },
  ncp:      { half: 46 },
  crebain:  { half: 64 }, // raven raster scaled to ~118 wide (radius ~59)
  melkor:   { half: 57 }, // hexagon + bezel
  cortexel: { half: 53 }, // code-tag chevrons sit at the outer corners (~r47)
  manwe:    { half: 44 },
  engram:   { half: 54 }, // medallion scaled to radius ~46 + bezel/shadow
  haldir:   { half: 46 },
};

// Remove a whole <g class="cls">...</g> group (balanced, handles nesting).
function stripGroup(s, cls) {
  const start = s.indexOf(`<g class="${cls}">`);
  if (start === -1) return s;
  const re = /<g\b[^>]*>|<\/g>/g; re.lastIndex = start;
  let depth = 0, m;
  while ((m = re.exec(s))) {
    if (m[0] === "</g>") { if (--depth === 0) return s.slice(0, start) + s.slice(m.index + 4); }
    else depth++;
  }
  return s;
}

// Strip the name label / wordmark so the logo is a clean badge.
function stripChrome(mark) {
  let s = mark.replace(/<text\b[^>]*class="[^"]*label[^"]*"[^>]*>[\s\S]*?<\/text>/g, "");
  s = stripGroup(s, "raven-typeline"); // crebain: typed wordmark + cursor + flag
  return s;
}

export function logoSVG(key) {
  const n = nodes[key];
  if (!n) throw new Error(`no node ${key}`);
  const H = SPEC[key].half;
  const vb = `${f1(n.x - H)} ${f1(n.y - H)} ${f1(2 * H)} ${f1(2 * H)}`;
  const mark = stripChrome(nodeMark(n));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" width="${f1(2 * H)}" height="${f1(2 * H)}" role="img" aria-label="${key} logo">
  <defs>${SHARED_DEFS}</defs>
  <style>${SHARED_STYLE}</style>
  ${mark}
</svg>`;
}

// Write <outDir>/<base>-dark.svg and -light.svg for a project.
export function writeLogo(key, outDir, base) {
  const { dark, light } = splitThemes(logoSVG(key));
  mkdirSync(outDir, { recursive: true });
  writeFileSync(resolve(outDir, `${base}-dark.svg`), dark, "utf8");
  writeFileSync(resolve(outDir, `${base}-light.svg`), light, "utf8");
}

// CLI: node logo-extract.mjs <key> <outDir> <base>  → writes the pair.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [key, outDir, base] = process.argv.slice(2);
  if (!key) {
    console.log("keys:", Object.keys(SPEC).join(", "));
  } else {
    writeLogo(key, outDir || resolve(__dirname, "..", "assets", "logos"), base || key);
    console.log(`[logo] wrote ${base || key}-{dark,light}.svg for ${key}`);
  }
}
