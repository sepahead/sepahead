#!/usr/bin/env node
// scripts/work-graph.mjs
// Generates assets/work-graph.svg, the "Selected work" project relationship
// graph, from a declarative {nodes, edges} spec so the geometry is correct and
// easy to edit:
//   • edges are trimmed to each node's true boundary (rect, circle, or polygon)
//     so a line never runs under a node;
//   • each edge is a gentle quadratic Bézier that bows AWAY from the graph
//     centroid (keeps the layout open and separates the bridge crossing);
//   • each edge is stroked with a gradient from the source node's colour to the
//     target node's colour; no arrowheads, just connections.
// NCP's connections are PERSISTENT, live links: a glowing spine plus TWO
// near-equal counter-flowing packet lanes (full-duplex, the edge echo of NCP's
// dual-lane gate glyph).
// Every project node is a bespoke "real object" mark on a machined border —
// the crebain-badge / engram-medallion tier: NCP is a dual-lane safety gate
// (perception ⇄ action through one checkpoint) on a solid amber badge seat;
// cortexel is a voxel NEURAL NETWORK on a fuchsia badge seat; crebain is its
// own raven-in-crosshair brand mark; engram a machined silver medallion;
// prisoma a smoked-glass prism with liquid-silver edges dispersing one beam
// into the three PID components; melkor an obsidian forge plate where a black
// massif condenses out of Gaussian splats; manwe a lens barrel whose six-blade
// iris frames a quadcopter caught in lock-on brackets; galadriel the sentinel
// shield; pid-rs a crisp instrument dial. The whole panel is wrapped in a
// "provenance instrument" frame (amber corner brackets).
// Theme-adaptive (prefers-color-scheme), reduced-motion safe. Zero deps.
// Run: `node scripts/work-graph.mjs`.

import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { writeThemedPair } from "./theme-split.mjs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = resolve(__dirname, "..", "assets", "work-graph.svg");

// crebain's brand mark (raven-in-crosshair) embedded as a base64 data-URI, so
// the self-contained SVG renders the real logo with zero external requests
// (an <img>-embedded SVG can't fetch external URLs, but data: URIs are fine).
const CREBAIN_LOGO =
  "data:image/png;base64," +
  readFileSync(resolve(__dirname, "..", "pics", "crebain-logo.png")).toString("base64");

// engram's mark: the torus-automations brand logo, embedded the same way so the
// self-contained SVG renders it with zero external requests.
const TORUS_LOGO =
  "data:image/png;base64," +
  readFileSync(resolve(__dirname, "..", "pics", "torus-automations-logo.png")).toString("base64");

const W = 860;
const H = 460;

// ---------------------------------------------------------------------------
// Spec. Positions are node centres; colours are per-project accents.
//   large: cube · hub (circle) · triangle · logo (image)
//   bespoke logos: gate (NCP) · voxel-net (cortexel) · raven (crebain) | chip
// ---------------------------------------------------------------------------
const nodes = {
  engram:      { x: 110, y: 230, color: "#bcc6d1", kind: "logo" },
  pidrs:       { x: 250, y: 98,  color: "#34d399", kind: "hub", label: "pid-rs", r: 36 },
  ncp:         { x: 250, y: 230, color: "#fbbf24", kind: "gate", label: "NCP" },
  prisoma:     { x: 460, y: 130, color: "#a78bfa", kind: "triangle", private: true },
  crebain:     { x: 460, y: 332, color: "#9caf88", kind: "raven" },
  cobotatlas:  { x: 690, y: 150, color: "#60a5fa", kind: "chip", label: "cobot-atlas", dataset: true },
  melkor:      { x: 690, y: 250, color: "#fb923c", kind: "cube" },
  reliefatlas: { x: 690, y: 350, color: "#fb7185", kind: "chip", label: "relief-atlas", dataset: true },
  cortexel:    { x: 110, y: 360, color: "#e879f9", kind: "voxel" },
  manwe:       { x: 298, y: 386, color: "#38bdf8", kind: "radar", label: "manwe" },
  galadriel:   { x: 375, y: 250, color: "#ef4444", kind: "sentinel", label: "galadriel", private: true },
};
// Uppercase every label in the SOURCE (not via CSS text-transform, which
// librsvg and other SVG renderers ignore — content-case renders everywhere).
for (const [id, n] of Object.entries(nodes)) n.label = (n.label || id).toUpperCase();

const edges = [
  { a: "engram",      b: "ncp" },
  { a: "ncp",         b: "prisoma" },
  { a: "ncp",         b: "crebain" },
  { a: "pidrs",       b: "prisoma" },
  { a: "cobotatlas",  b: "prisoma" },
  { a: "melkor",      b: "prisoma" },
  { a: "reliefatlas", b: "prisoma" },
  { a: "crebain",     b: "cobotatlas" },
  { a: "crebain",     b: "melkor" },
  { a: "crebain",     b: "reliefatlas" },
  { a: "cortexel",    b: "engram" },
  { a: "manwe",       b: "crebain" },
  { a: "galadriel",   b: "crebain" },
  { a: "galadriel",   b: "pidrs" },
];

// ---------------------------------------------------------------------------
// Geometry.
// ---------------------------------------------------------------------------
const HUB_R = 46;
const CUBE = 92; // melkor square, matched to a hub's diameter
const TRI_CIRCUM = 53; // prisoma triangle circumradius (~92 wide, like the others)
const SEAT_R = 34; // badge-seat radius shared by the seated marks (gate / voxel / optic)
const CHIP_H = 32;
const GAP = 7;

const escapeXML = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c]));

function nodeWidth(n) {
  if (n.kind === "hub") return (n.r || HUB_R) * 2;
  if (n.kind === "cube") return CUBE;
  // gate (NCP): the dual-lane glyph is hand-tuned at fixed coords and its label
  // floats below it, so size to the glyph (~7.8px/char), not the tracked label.
  if (n.kind === "gate") return Math.round(n.label.length * 7.8 + 28);
  // chips: the label sits INSIDE the rect, now bold + 2.5px tracked (10.3px/char)
  // so widen to keep it clear of the right edge.
  return Math.round(n.label.length * 10.3 + 36);
}
function halfExtents(n) {
  if (n.kind === "hub") return { hw: (n.r || HUB_R), hh: (n.r || HUB_R), circle: true };
  if (n.kind === "gate") return { hw: SEAT_R, hh: SEAT_R, circle: true };
  if (n.kind === "voxel") return { hw: SEAT_R, hh: SEAT_R, circle: true };
  if (n.kind === "raven") return { hw: 30, hh: 30, circle: true };
  if (n.kind === "radar") return { hw: SEAT_R, hh: SEAT_R, circle: true };
  if (n.kind === "sentinel") return { hw: 34, hh: 34, circle: true };
  if (n.kind === "logo") return { hw: 30, hh: 30, circle: true };
  if (n.kind === "cube") return { hw: 48, hh: 48, circle: true };
  return { hw: nodeWidth(n) / 2, hh: CHIP_H / 2, circle: false };
}

// Centre-relative polygon silhouette for the angular shapes (null => fall back
// to the rect/circle box in halfExtents). Kept in lockstep with the render
// geometry so edges trim to the TRUE outline.
function nodePolygon(n) {
  if (n.kind === "triangle") {
    const dx = (TRI_CIRCUM * Math.sqrt(3)) / 2;
    return [{ x: 0, y: -TRI_CIRCUM }, { x: dx, y: TRI_CIRCUM / 2 }, { x: -dx, y: TRI_CIRCUM / 2 }];
  }
  return null;
}

// Distance from a node centre to its polygon boundary along unit dir (ux,uy):
// the nearest positive ray–edge intersection. Ray P = s·D from the centre.
function polyBoundary(verts, ux, uy) {
  let best = Infinity;
  for (let i = 0; i < verts.length; i++) {
    const A = verts[i], B = verts[(i + 1) % verts.length];
    const Ex = B.x - A.x, Ey = B.y - A.y;
    const det = Ex * uy - ux * Ey;
    if (Math.abs(det) < 1e-9) continue;
    const s = (Ex * A.y - A.x * Ey) / det; // distance along the ray
    const t = (ux * A.y - uy * A.x) / det; // position along the edge [0,1]
    if (s >= 0 && t >= -1e-9 && t <= 1 + 1e-9 && s < best) best = s;
  }
  return Number.isFinite(best) ? best : 0;
}

function boundaryDist(n, ux, uy) {
  const poly = nodePolygon(n);
  if (poly) return polyBoundary(poly, ux, uy);
  const { hw, hh, circle } = halfExtents(n);
  if (circle) return hw;
  const tx = Math.abs(ux) < 1e-6 ? Infinity : hw / Math.abs(ux);
  const ty = Math.abs(uy) < 1e-6 ? Infinity : hh / Math.abs(uy);
  return Math.min(tx, ty);
}

const centroid = (() => {
  const ns = Object.values(nodes);
  return {
    x: ns.reduce((s, n) => s + n.x, 0) / ns.length,
    y: ns.reduce((s, n) => s + n.y, 0) / ns.length,
  };
})();

const f1 = (v) => Number(v.toFixed(1));

// ---------------------------------------------------------------------------
// Build edges.
// ---------------------------------------------------------------------------
const gradDefs = [];
const calmEdges = [];
const liveEdges = [];
const flows = [];

edges.forEach((e, i) => {
  const A = nodes[e.a];
  const B = nodes[e.b];
  const live = e.a === "ncp" || e.b === "ncp";
  const ux0 = B.x - A.x, uy0 = B.y - A.y;
  const len = Math.hypot(ux0, uy0);
  const ux = ux0 / len, uy = uy0 / len;

  const dA = boundaryDist(A, ux, uy) + GAP;
  const dB = boundaryDist(B, -ux, -uy) + GAP;
  const p0 = { x: A.x + dA * ux, y: A.y + dA * uy };
  const p1 = { x: B.x - dB * ux, y: B.y - dB * uy };

  const mid = { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 };
  let nx = -(p1.y - p0.y), ny = p1.x - p0.x;
  const nlen = Math.hypot(nx, ny) || 1;
  nx /= nlen; ny /= nlen;
  const out = (mid.x - centroid.x) * nx + (mid.y - centroid.y) * ny;
  const sign = out >= 0 ? 1 : -1;
  const chord = Math.hypot(p1.x - p0.x, p1.y - p0.y);
  const bow = sign * Math.min(0.16 * chord, 26);
  const c = { x: mid.x + bow * nx, y: mid.y + bow * ny };
  const d = `M ${f1(p0.x)} ${f1(p0.y)} Q ${f1(c.x)} ${f1(c.y)} ${f1(p1.x)} ${f1(p1.y)}`;

  const gid = `eg${i}`;
  gradDefs.push(
    `<linearGradient id="${gid}" gradientUnits="userSpaceOnUse" x1="${f1(p0.x)}" y1="${f1(p0.y)}" x2="${f1(p1.x)}" y2="${f1(p1.y)}">` +
      `<stop offset="0%" stop-color="${A.color}"/><stop offset="100%" stop-color="${B.color}"/></linearGradient>`
  );

  if (live) {
    // Glowing gradient spine with a slow opacity pulse…
    liveEdges.push(
      `<path d="${d}" fill="none" stroke="url(#${gid})" stroke-width="3" stroke-linecap="round" class="edge-live">` +
        `<animate attributeName="opacity" values="0.7;1;0.7" dur="2.8s" begin="${(i * 0.3).toFixed(2)}s" repeatCount="indefinite"/></path>`
    );
    // …plus TWO near-equal counter-flowing packet lanes, offset across the chord
    // normal (nx,ny) so they read full-duplex at any edge angle, the edge echo
    // of NCP's dual-lane gate. 21 = two dash periods (jump-free); matched dur.
    const off = 2.4;
    const dF = `M ${f1(p0.x + off * nx)} ${f1(p0.y + off * ny)} Q ${f1(c.x + off * nx)} ${f1(c.y + off * ny)} ${f1(p1.x + off * nx)} ${f1(p1.y + off * ny)}`;
    const dR = `M ${f1(p0.x - off * nx)} ${f1(p0.y - off * ny)} Q ${f1(c.x - off * nx)} ${f1(c.y - off * ny)} ${f1(p1.x - off * nx)} ${f1(p1.y - off * ny)}`;
    flows.push(
      `<path d="${dF}" class="flow"><animate attributeName="stroke-dashoffset" from="21" to="0" dur="1.7s" repeatCount="indefinite"/></path>`,
      `<path d="${dR}" class="flow flow-rev"><animate attributeName="stroke-dashoffset" from="0" to="21" dur="1.7s" repeatCount="indefinite"/></path>`
    );
  } else {
    calmEdges.push(
      `<path d="${d}" fill="none" stroke="url(#${gid})" stroke-width="2" stroke-linecap="round" class="edge"/>`
    );
  }
});

// ---------------------------------------------------------------------------
// Nodes.
// ---------------------------------------------------------------------------
function lock(cx, cy, scale, color) {
  return `<g transform="translate(${f1(cx - 6 * scale)} ${f1(cy - 7.5 * scale)}) scale(${scale})">` +
    `<path d="M2 6 V4.4 a4 4 0 0 1 8 0 V6" fill="none" stroke="${color}" stroke-width="1.5"/>` +
    `<rect x="0" y="6" width="12" height="9" rx="1.6" fill="${color}"/></g>`;
}

// A small stacked-isometric-plates glyph for a chip, reads as "a layered
// collection of 3-D mesh samples" (a dataset). Sits where the chip's accent dot does.
function datasetPlates(cx, cy, color) {
  const hw = 5, hh = 2.6, dy = 3.4, op = [0.16, 0.24, 0.34];
  return [-dy, 0, dy].map((o, i) => {
    const c = cy + o;
    const pts = `${f1(cx)},${f1(c - hh)} ${f1(cx + hw)},${f1(c)} ${f1(cx)},${f1(c + hh)} ${f1(cx - hw)},${f1(c)}`;
    return `<polygon points="${pts}" fill="${color}" fill-opacity="${op[i]}" stroke="${color}" stroke-width="1.1" stroke-linejoin="round"/>`;
  }).join("");
}

// crebain's wordmark flag: a clean, crisp German flag chip: three bands in rich
// official colours, softly rounded, with a whisper of matte top-light shading and
// a soft drop shadow for depth. Matte (not glossy), crisp (not distressed), still
// (not wavy). One instance, so the filter / gradient / clip ids are unique.
function germanFlag(cxf, top, w) {
  const h = Number((w * 0.62).toFixed(2)), s = Number((h / 3).toFixed(3));
  const x = f1(cxf - w / 2), tp = f1(top), rx = 1.6;
  const bh = f1(s + 0.4);
  return (
    `<defs>` +
      `<filter id="flagDrop" x="-35%" y="-35%" width="170%" height="185%">` +
        `<feDropShadow dx="0" dy="0.7" stdDeviation="0.9" flood-color="#000000" flood-opacity="0.4"/></filter>` +
      `<linearGradient id="flagShade" x1="0" y1="0" x2="0" y2="1">` +
        `<stop offset="0" stop-color="#ffffff" stop-opacity="0.06"/>` +
        `<stop offset="0.45" stop-color="#ffffff" stop-opacity="0"/>` +
        `<stop offset="1" stop-color="#000000" stop-opacity="0.13"/>` +
      `</linearGradient>` +
      `<clipPath id="flagClip"><rect x="${x}" y="${tp}" width="${w}" height="${h}" rx="${rx}"/></clipPath>` +
    `</defs>` +
    `<g filter="url(#flagDrop)">` +
      `<g clip-path="url(#flagClip)">` +
        `<rect x="${x}" y="${tp}" width="${w}" height="${bh}" class="flag-k"/>` +
        `<rect x="${x}" y="${f1(top + s)}" width="${w}" height="${bh}" class="flag-r"/>` +
        `<rect x="${x}" y="${f1(top + 2 * s)}" width="${w}" height="${bh}" class="flag-g"/>` +
        `<rect x="${x}" y="${tp}" width="${w}" height="${h}" fill="url(#flagShade)"/>` +
      `</g>` +
      `<rect x="${x}" y="${tp}" width="${w}" height="${h}" rx="${rx}" class="flag-edge"/>` +
    `</g>`
  );
}

// Solid badge seat shared by the seated marks (NCP's gate, cortexel's voxel
// net): an accent-tinted machined disc — crisp accent ring, dark inner groove,
// soft drop shadow — the same "real object" tier as engram's medallion and
// crebain's white badge, replacing the old barely-there glow discs.
function seat(cx, cy, name) {
  return `<g filter="url(#nodeShadow)"><circle cx="${cx}" cy="${cy}" r="${SEAT_R}" class="seat-${name}"/></g>
    <circle cx="${cx}" cy="${cy}" r="${SEAT_R}" class="seat-ring ring-${name}"/>
    <circle cx="${cx}" cy="${cy}" r="${f1(SEAT_R - 2.2)}" class="seat-groove"/>`;
}

const nodeEls = Object.values(nodes).map((n) => {
  if (n.kind === "hub") {
    // pid-rs: the crisp instrument dial — glow demoted to a soft underlay so
    // the ring itself stays sharp; the slow radial breath is kept on all layers.
    const r = n.r || HUB_R;
    const breathe = `<animate attributeName="r" values="${r};${r + 2};${r}" dur="3.2s" repeatCount="indefinite"/>`;
    return `<g>
    <circle cx="${n.x}" cy="${n.y}" r="${r}" class="hub-glow">${breathe}</circle>
    <g filter="url(#nodeShadow)"><circle cx="${n.x}" cy="${n.y}" r="${r}" class="hub-fill">${breathe}</circle></g>
    <circle cx="${n.x}" cy="${n.y}" r="${r}" class="hub-ring">${breathe}</circle>
    ${n.private ? lock(n.x, n.y - 24, 1, "var(--hub-accent)") : ""}
    <text x="${n.x}" y="${n.y + (n.private ? 12 : 6)}" text-anchor="middle" class="hub-label">${escapeXML(n.label)}</text>
  </g>`;
  }
  if (n.kind === "cube") {
    // melkor: the OBSIDIAN FORGE PLATE — a machined dark hexagonal plate with a
    // heated-metal bezel (lit crown → cooled base), forge light rising from
    // below, and a black twin-peak massif being RECONSTRUCTED against it: the
    // ridge carries an ember rim light and the right flank condenses out of
    // oriented Gaussian splats (3D Gaussian Splatting mid-solve). Plate + rock
    // are theme-FIXED (a real object, like engram's medallion); only the label
    // stroke adapts. The peak spark breathes; reduced-motion holds it lit.
    // One instance → unique ids.
    const cx = n.x, cy = n.y;
    const hex = (s) =>
      `M${f1(cx)} ${f1(cy - 48 * s)} L${f1(cx + 41.6 * s)} ${f1(cy - 24 * s)} L${f1(cx + 41.6 * s)} ${f1(cy + 24 * s)} L${f1(cx)} ${f1(cy + 48 * s)} L${f1(cx - 41.6 * s)} ${f1(cy + 24 * s)} L${f1(cx - 41.6 * s)} ${f1(cy - 24 * s)} Z`;
    // Massif: left foot → left peak → saddle → main peak → right foot. The
    // solid rock keeps the whole silhouette; the right flank's surface is
    // where the splats condense.
    const solid = `M${f1(cx - 30)} ${f1(cy + 20)} L${f1(cx - 12)} ${f1(cy - 26)} L${f1(cx)} ${f1(cy - 6)} L${f1(cx + 12)} ${f1(cy - 38)} L${f1(cx + 30)} ${f1(cy + 20)} Z`;
    const ridgeLine = `M${f1(cx - 30)} ${f1(cy + 20)} L${f1(cx - 12)} ${f1(cy - 26)} L${f1(cx)} ${f1(cy - 6)} L${f1(cx + 12)} ${f1(cy - 38)}`;
    // Gaussian splats straddling the right slope (peak → foot), oriented along
    // it, condensing onto the surface: opacity falls off downslope.
    const px = cx + 12, py = cy - 38, qx = cx + 30, qy = cy + 20;
    const sang = f1((Math.atan2(qy - py, qx - px) * 180) / Math.PI);
    const snx = -(qy - py) / Math.hypot(qx - px, qy - py), sny = (qx - px) / Math.hypot(qx - px, qy - py);
    const splats = [
      [0.12, -2.5, 4, 1.6, 1], [0.28, 2.8, 4.8, 1.9, 0.9], [0.35, 7.5, 2.4, 1, 0.35],
      [0.45, -3.2, 4.2, 1.7, 0.78], [0.62, 3.6, 5.2, 2, 0.62], [0.7, 8.5, 2, 0.9, 0.28],
      [0.8, -3, 3.8, 1.5, 0.5], [0.94, 4, 3.2, 1.2, 0.4],
    ].map(([t, off, rx, ry, op]) => {
      const ex = px + (qx - px) * t + snx * off, ey = py + (qy - py) * t + sny * off;
      return `<ellipse cx="${f1(ex)}" cy="${f1(ey)}" rx="${rx}" ry="${ry}" transform="rotate(${sang} ${f1(ex)} ${f1(ey)})" fill="url(#melSplat)" opacity="${op}"/>`;
    }).join("");
    return `<g>
    <defs>
      <linearGradient id="melPlate" x1="0" y1="${f1(cy - 48)}" x2="0" y2="${f1(cy + 48)}" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stop-color="#2b1a10"/><stop offset="55%" stop-color="#170d07"/><stop offset="100%" stop-color="#0b0604"/>
      </linearGradient>
      <radialGradient id="melHeat" gradientUnits="userSpaceOnUse" cx="${cx}" cy="${f1(cy + 22)}" r="62">
        <stop offset="0%" stop-color="#c2410c" stop-opacity="0.72"/><stop offset="45%" stop-color="#9a3412" stop-opacity="0.38"/><stop offset="100%" stop-color="#7c2d12" stop-opacity="0"/>
      </radialGradient>
      <linearGradient id="melBezel" x1="0" y1="${f1(cy - 48)}" x2="0" y2="${f1(cy + 48)}" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stop-color="#fed7aa"/><stop offset="45%" stop-color="#b45309"/><stop offset="100%" stop-color="#571c07"/>
      </linearGradient>
      <clipPath id="melClip"><path d="${hex(1)}"/></clipPath>
    </defs>
    <g filter="url(#nodeShadow)"><path d="${hex(1)}" class="mel-plate"/></g>
    <g clip-path="url(#melClip)">
      <path d="${hex(1)}" fill="url(#melHeat)"/>
      <path class="mel-scan" d="M${f1(cx - 42)} ${f1(cy - 14)} H${f1(cx + 42)} M${f1(cx - 42)} ${f1(cy + 2)} H${f1(cx + 42)} M${f1(cx - 42)} ${f1(cy + 18)} H${f1(cx + 42)}"/>
      <path d="${solid}" class="mel-rock"/>
      <path d="M${f1(cx + 12)} ${f1(cy - 38)} L${f1(cx + 16)} ${f1(cy + 20)} L${f1(cx + 4)} ${f1(cy + 20)} Z" class="mel-facet"/>
      <path d="${ridgeLine}" class="mel-ridge"/>
      ${splats}
      <circle cx="${f1(cx + 12)}" cy="${f1(cy - 38)}" r="1.8" class="mel-spark" filter="url(#soft)">
        <animate attributeName="opacity" values="0.55;1;0.55" dur="3.2s" repeatCount="indefinite"/>
      </circle>
    </g>
    <path d="${hex(1)}" class="mel-edge"/>
    <path d="${hex(0.9423)}" class="mel-groove"/>
    <path d="${hex(1.0337)}" class="mel-hairline"/>
    <text x="${cx}" y="${f1(cy + 34)}" text-anchor="middle" class="cube-label">${escapeXML(n.label)}</text>
  </g>`;
  }
  if (n.kind === "logo") {
    // engram: the torus-automations brand mark inlaid on a MACHINED SILVER
    // medallion — a chrome-banded face (bright crown → dark horizon → ground
    // lift) under a cool offset sheen for a hint of convexity, a machined DOUBLE
    // bezel (bright gradient rim + dark inner groove) plus a dark outer hairline
    // that keeps the coin's edge crisp on WHITE (where a bright rim melts into the
    // page), a clamped top reflection band and a whisper of warm bottom bounce,
    // all seated on a soft drop shadow for depth in BOTH themes. The dark emblem
    // pops on the silver in dark and light alike, so the metal is theme-FIXED (a
    // real object); only the label recolours. The node colour is silver, so its
    // live edges to NCP and cortexel resolve neutral via the edge-gradient system.
    // Static → reduced-motion safe. One instance → unique ids.
    const cx = n.x, cy = n.y, S = 54, r = 34;
    const top = f1(cy - r), bot = f1(cy + r);
    return `<g>
    <defs>
      <linearGradient id="engramFace" x1="0" y1="${top}" x2="0" y2="${bot}" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stop-color="#f2f6fa"/>
        <stop offset="32%" stop-color="#cbd4dd"/>
        <stop offset="64%" stop-color="#96a1ad"/>
        <stop offset="100%" stop-color="#79848f"/>
      </linearGradient>
      <radialGradient id="engramSheen" gradientUnits="userSpaceOnUse" cx="${f1(cx - 10)}" cy="${f1(cy - 14)}" r="${f1(r * 1.35)}">
        <stop offset="0%" stop-color="#ffffff" stop-opacity="0.30"/>
        <stop offset="55%" stop-color="#ffffff" stop-opacity="0.05"/>
        <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
      </radialGradient>
      <linearGradient id="engramBezel" x1="0" y1="${top}" x2="0" y2="${bot}" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stop-color="#ffffff"/>
        <stop offset="46%" stop-color="#c6d0da"/>
        <stop offset="100%" stop-color="#59646f"/>
      </linearGradient>
      <clipPath id="engramClip"><circle cx="${cx}" cy="${cy}" r="${r}"/></clipPath>
      <filter id="engramShadow" x="-70%" y="-70%" width="240%" height="240%">
        <feDropShadow dx="0" dy="1.5" stdDeviation="2.4" flood-color="#000000" flood-opacity="0.4"/>
      </filter>
    </defs>
    <g filter="url(#engramShadow)"><circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#engramFace)"/></g>
    <g clip-path="url(#engramClip)">
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#engramSheen)"/>
    </g>
    <image href="${TORUS_LOGO}" x="${f1(cx - S / 2)}" y="${f1(cy - S / 2)}" width="${S}" height="${S}" preserveAspectRatio="xMidYMid meet"/>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="url(#engramBezel)" stroke-width="2.6"/>
    <circle cx="${cx}" cy="${cy}" r="${f1(r - 2.4)}" fill="none" stroke="#37414c" stroke-width="1.1" stroke-opacity="0.5"/>
    <circle cx="${cx}" cy="${cy}" r="${f1(r + 1.4)}" fill="none" stroke="#2b333d" stroke-width="1" stroke-opacity="0.55"/>
    <text x="${cx}" y="${f1(cy - 46)}" text-anchor="middle" class="logo-label">${escapeXML(n.label)}</text>
  </g>`;
  }
  if (n.kind === "triangle") {
    // prisoma: the INFORMATION PRISM recut in SMOKED GLASS — a dark violet
    // glass body with an inner luminance core, a diagonal window-light sheen
    // and LIQUID-SILVER edges (chrome-gradient bezel + dark inner groove +
    // outer hairline: engram's machining applied to a prism). One white beam
    // of raw information enters, refracts through the glass, flares at the
    // point of incidence and disperses into the three PID component beams
    // (unique / redundant / synergistic) through a faint spectral fan. Glass
    // and silver are theme-FIXED (a real object); only the label ink adapts.
    // Static apart from a slow flare breath → reduced-motion safe. One
    // instance → unique ids.
    const cx = n.x, cy = n.y, R = TRI_CIRCUM;
    const tri = (r) => {
      const dx = (r * Math.sqrt(3)) / 2;
      return `${f1(cx)},${f1(cy - r)} ${f1(cx + dx)},${f1(cy + r / 2)} ${f1(cx - dx)},${f1(cy + r / 2)}`;
    };
    const topY = f1(cy - R), botY = f1(cy + R / 2);
    const sx = cx - 2, sy = cy + 4; // point of incidence
    return `<g>
    <defs>
      <linearGradient id="przGlass" x1="0" y1="${topY}" x2="0" y2="${botY}" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stop-color="#4c4370"/><stop offset="45%" stop-color="#262047"/><stop offset="100%" stop-color="#120e26"/>
      </linearGradient>
      <radialGradient id="przCore" gradientUnits="userSpaceOnUse" cx="${f1(sx)}" cy="${f1(sy)}" r="34">
        <stop offset="0%" stop-color="#c4b5fd" stop-opacity="0.3"/><stop offset="55%" stop-color="#a78bfa" stop-opacity="0.1"/><stop offset="100%" stop-color="#a78bfa" stop-opacity="0"/>
      </radialGradient>
      <linearGradient id="przSheen" x1="${f1(cx - 46)}" y1="${topY}" x2="${f1(cx + 46)}" y2="${botY}" gradientUnits="userSpaceOnUse">
        <stop offset="0.3" stop-color="#ffffff" stop-opacity="0"/><stop offset="0.42" stop-color="#ffffff" stop-opacity="0.2"/><stop offset="0.52" stop-color="#ffffff" stop-opacity="0.03"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
      </linearGradient>
      <linearGradient id="przSilver" x1="0" y1="${topY}" x2="0" y2="${botY}" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stop-color="#f8fafc"/><stop offset="40%" stop-color="#c7d0da"/><stop offset="72%" stop-color="#8b96a3"/><stop offset="100%" stop-color="#525c66"/>
      </linearGradient>
      <linearGradient id="przFan" x1="0" y1="${f1(cy - 20)}" x2="0" y2="${f1(cy + 24)}" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stop-color="#34d399" stop-opacity="0.16"/><stop offset="50%" stop-color="#fbbf24" stop-opacity="0.1"/><stop offset="100%" stop-color="#ef4444" stop-opacity="0.16"/>
      </linearGradient>
      <radialGradient id="przFlare" gradientUnits="userSpaceOnUse" cx="${f1(sx)}" cy="${f1(sy)}" r="9">
        <stop offset="0%" stop-color="#ffffff" stop-opacity="0.95"/><stop offset="45%" stop-color="#e9d5ff" stop-opacity="0.5"/><stop offset="100%" stop-color="#e9d5ff" stop-opacity="0"/>
      </radialGradient>
      <clipPath id="przClip"><polygon points="${tri(R)}"/></clipPath>
    </defs>
    <g filter="url(#nodeShadow)"><polygon points="${tri(R)}" class="prz-body"/></g>
    <g clip-path="url(#przClip)">
      <polygon points="${tri(R)}" fill="url(#przCore)"/>
      <polygon points="${tri(R)}" fill="url(#przSheen)"/>
      <line class="prz-inseg" x1="${f1(cx - 27.5)}" y1="${f1(cy - 5.4)}" x2="${f1(sx)}" y2="${f1(sy)}"/>
    </g>
    <line class="prz-in" x1="${f1(cx - 56)}" y1="${f1(cy - 16)}" x2="${f1(cx - 27)}" y2="${f1(cy - 5.2)}"/>
    <polygon points="${tri(R)}" class="prz-edge" stroke-linejoin="round"/>
    <polygon points="${tri(R - 4.8)}" class="prz-groove" stroke-linejoin="round"/>
    <polygon points="${tri(R + 2.8)}" class="prz-hairline" stroke-linejoin="round"/>
    <path class="prz-glint" d="M${cx} ${f1(cy - R - 4.5)} V${f1(cy - R + 4.5)} M${f1(cx - 4.5)} ${f1(cy - R)} H${f1(cx + 4.5)}"/>
    <polygon points="${f1(sx)},${f1(sy)} ${f1(cx + 50)},${f1(cy - 20)} ${f1(cx + 48)},${f1(cy + 24)}" fill="url(#przFan)"/>
    <g filter="url(#edgeGlow)">
      <line class="pz-beam" x1="${f1(sx)}" y1="${f1(sy)}" x2="${f1(cx + 50)}" y2="${f1(cy - 20)}" stroke="#34d399"/>
      <line class="pz-beam" x1="${f1(sx)}" y1="${f1(sy)}" x2="${f1(cx + 55)}" y2="${f1(cy + 4)}" stroke="#fbbf24"/>
      <line class="pz-beam" x1="${f1(sx)}" y1="${f1(sy)}" x2="${f1(cx + 48)}" y2="${f1(cy + 24)}" stroke="#ef4444"/>
      <circle cx="${f1(cx + 50)}" cy="${f1(cy - 20)}" r="1.8" fill="#34d399"/>
      <circle cx="${f1(cx + 55)}" cy="${f1(cy + 4)}" r="1.8" fill="#fbbf24"/>
      <circle cx="${f1(cx + 48)}" cy="${f1(cy + 24)}" r="1.8" fill="#ef4444"/>
    </g>
    <circle cx="${f1(sx)}" cy="${f1(sy)}" r="8" fill="url(#przFlare)">
      <animate attributeName="opacity" values="0.8;1;0.8" dur="3.4s" repeatCount="indefinite"/>
    </circle>
    ${n.private ? `<g opacity="0.85">${lock(n.x, n.y - 28, 0.7, "#c7d0da")}</g>` : ""}
    <text x="${n.x}" y="${f1(n.y + R / 2 + 16)}" text-anchor="middle" class="tri-label">${escapeXML(n.label)}</text>
  </g>`;
  }
  if (n.kind === "gate") {
    // NCP, TWO LANES, ONE GATE: an upper PERCEPTION lane (body→brain, packets
    // right→left, dashed best-effort) + a lower ACTION lane (brain→body, left→
    // right, solid express, SAFETY-GATED; its packet dwells to be verify-
    // stamped then releases). Counter-flowing packets = two-way at a glance;
    // dashed-vs-solid = the QoS asymmetry. The lanes fan straight into the live
    // edges (prisoma=perception/top, crebain=action/bottom, engram=centre trunk).
    return `<g>
    ${seat(n.x, n.y, "gate")}
    <g filter="url(#soft)">
      <path d="M224 222 H243 M257 222 H276" class="gate-wire-perc"/>
      <path d="M224 238 H243 M257 238 H276" class="gate-wire"/>
      <circle cx="224" cy="222" r="2.2" class="gate-port"/>
      <circle cx="276" cy="222" r="2.2" class="gate-port"/>
      <circle cx="224" cy="238" r="2.2" class="gate-port"/>
      <circle cx="276" cy="238" r="2.2" class="gate-port"/>
      <rect x="247.5" y="214" width="5" height="32" rx="2.5" class="gate-bar">
        <animate attributeName="fill-opacity" values="0.16;0.32;0.16" dur="2.8s" repeatCount="indefinite"/>
      </rect>
      <polyline points="246.6,238.6 249.4,241.2 253.2,235.6" class="gate-tick">
        <animate attributeName="stroke-opacity" values="0.75;0.75;1;0.75;0.75" keyTimes="0;0.5;0.58;0.72;1" dur="2.6s" repeatCount="indefinite"/>
        <animate attributeName="stroke-width" values="1.6;1.6;2.4;1.6;1.6" keyTimes="0;0.52;0.6;0.74;1" dur="2.6s" repeatCount="indefinite"/>
      </polyline>
      <circle cx="250" cy="222" r="2.6" class="gate-packet-perc">
        <animate attributeName="cx" values="276;224" dur="1.9s" repeatCount="indefinite"/>
        <animate attributeName="opacity" values="0.7;0.35;0.7;0.5;0.7" dur="1.9s" repeatCount="indefinite"/>
      </circle>
      <circle cx="240" cy="238" r="3" class="gate-packet">
        <animate attributeName="cx" values="224;248;248;254;276" keyTimes="0;0.34;0.56;0.62;1" dur="2.6s" repeatCount="indefinite"/>
        <animate attributeName="opacity" values="1;1;0.3;1;1" keyTimes="0;0.34;0.56;0.62;1" dur="2.6s" repeatCount="indefinite"/>
      </circle>
    </g>
    <text x="${n.x}" y="276" text-anchor="middle" class="gate-label">${escapeXML(n.label)}</text>
  </g>`;
  }
  if (n.kind === "voxel") {
    // cortexel: a VOXEL NEURAL NETWORK as a genuine 3-D cluster: three isometric
    // voxel-neurons both SIZED and dimmed by depth (the front-right neuron is
    // larger + fully opaque, the apex recedes, smaller + fainter), wired by
    // CALLIGRAPHIC connections: static, tapered pen-strokes that bow and fade into
    // the distance (no moving packets), echoing the script wordmark below and
    // distinct from the SVG's other live wired edges.
    const vw = 9, vbh = 8, rh = vw / 2;
    const T = { x: n.x,      y: n.y - 25, depth: 1.0 }; // farthest, up/back
    const L = { x: n.x - 20, y: n.y + 13, depth: 0.5 }; // mid
    const R = { x: n.x + 20, y: n.y + 13, depth: 0.0 }; // nearest, front
    // Perspective: depth 0 (near)..1 (far) → opacity 1.0..0.45 AND scale 1.2..0.8.
    const dop = (d) => Number((1 - d * 0.55).toFixed(3));
    const dsc = (d) => 1.2 - d * 0.4;
    const cube = (c, s) => {
      const cw = vw * s, cbh = vbh * s, crh = rh * s, cyt = c.y - cbh / 2;
      const bt = `${f1(c.x)},${f1(cyt - crh)}`;
      const rr = `${f1(c.x + cw)},${f1(cyt)}`;
      const ft = `${f1(c.x)},${f1(cyt + crh)}`;
      const lf = `${f1(c.x - cw)},${f1(cyt)}`;
      const rb = `${f1(c.x + cw)},${f1(cyt + cbh)}`;
      const fb = `${f1(c.x)},${f1(cyt + crh + cbh)}`;
      const lb = `${f1(c.x - cw)},${f1(cyt + cbh)}`;
      return `<polygon points="${lf} ${ft} ${fb} ${lb}" class="vox-left" stroke-linejoin="round"/>` +
        `<polygon points="${rr} ${ft} ${fb} ${rb}" class="vox-right" stroke-linejoin="round"/>` +
        `<polygon points="${bt} ${rr} ${ft} ${lf}" class="vox-top" stroke-linejoin="round"/>`;
    };
    // Each cube scaled + dimmed as a unit by its depth, painted far → near.
    const cubeAt = (c) => `<g opacity="${dop(c.depth)}">${cube(c, dsc(c.depth))}</g>`;
    // Calligraphic connection: a tapered, bowed pen-stroke (a filled lens, pointed
    // at both neurons, swelling at the middle) whose fill fades with the depth of
    // its endpoints. currentColor resolves to .vox-net's theme-adaptive colour.
    const grads = [];
    let gi = 0;
    const calli = (a, b, bow) => {
      const id = `voxCalli${gi++}`;
      grads.push(
        `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${f1(a.x)}" y1="${f1(a.y)}" x2="${f1(b.x)}" y2="${f1(b.y)}">` +
          `<stop offset="0" stop-color="currentColor" stop-opacity="${dop(a.depth)}"/>` +
          `<stop offset="1" stop-color="currentColor" stop-opacity="${dop(b.depth)}"/>` +
          `</linearGradient>`
      );
      const ax = b.x - a.x, ay = b.y - a.y, ln = Math.hypot(ax, ay) || 1;
      const nx = -ay / ln, ny = ax / ln;
      const mx = (a.x + b.x) / 2 + nx * bow, my = (a.y + b.y) / 2 + ny * bow, hh = 2.2;
      const up = `${f1(mx + nx * hh)} ${f1(my + ny * hh)}`;
      const dn = `${f1(mx - nx * hh)} ${f1(my - ny * hh)}`;
      return `<path d="M${f1(a.x)} ${f1(a.y)} Q${up} ${f1(b.x)} ${f1(b.y)} Q${dn} ${f1(a.x)} ${f1(a.y)} Z" fill="url(#${id})"/>`;
    };
    const conns = `${calli(T, L, 6)} ${calli(T, R, -6)} ${calli(L, R, 6)}`;
    return `<g class="vox-net">
    ${seat(n.x, n.y, "vox")}
    <defs>${grads.join("")}</defs>
    <g filter="url(#soft)">
      ${conns}
      ${cubeAt(T)} ${cubeAt(L)} ${cubeAt(R)}
    </g>
    <text x="${n.x}" y="${f1(n.y + 48)}" text-anchor="middle" class="vox-label">${escapeXML(n.label)}</text>
  </g>`;
  }
  if (n.kind === "raven") {
    // crebain: its real brand mark (raven head + red eye in a crosshair reticle)
    // over a faint field-green seat. Below it the wordmark is TYPED OUT by a block
    // cursor, holds ~10 s with a German flag fading in beneath it, then the line is
    // "entered" (fades + drops away) and the cycle retypes. The static attribute
    // values hold the fully-typed state, so reduced-motion shows it complete.
    const cx = n.x, cy = n.y, S = 90;
    const word = n.label;                          // CSS upper-cases it
    const NN = word.length, CH = 9.7;              // 12px mono: 0.6em glyph + 2.5 track
    const Wt = NN * CH, leftX = cx - Wt / 2;        // ~centred typed line
    const baseY = cy + S / 2 + 8, curY = cy + S / 2 - 1, flagTop = cy + S / 2 + 16;
    const pause = 0.5, step = 0.13, hold = 10, enterDur = 0.4, tail = 0.1;
    const typeDone = pause + NN * step, holdEnd = typeDone + hold, enterEnd = holdEnd + enterDur;
    const CYCLE = Number((enterEnd + tail).toFixed(2));
    const kt = (ts) => ts.map((t) => Number((t / CYCLE).toFixed(4))).join(";");
    const wt = [0, pause], wv = [0, 0];
    for (let i = 1; i <= NN; i++) { wt.push(Number((pause + i * step).toFixed(3))); wv.push(Number((i * CH).toFixed(2))); }
    wt.push(enterEnd, CYCLE); wv.push(0, 0);
    const xv = wv.map((v) => f1(leftX + v));
    const ot = [0, holdEnd, enterEnd, CYCLE], dur = `${CYCLE}s`;
    return `<g>
    <circle cx="${cx}" cy="${cy}" r="34" class="raven-seat"/>
    <image href="${CREBAIN_LOGO}" x="${f1(cx - S / 2)}" y="${f1(cy - S / 2)}" width="${S}" height="${S}" preserveAspectRatio="xMidYMid meet"/>
    <defs>
      <clipPath id="crebainType" clipPathUnits="userSpaceOnUse">
        <rect x="${f1(leftX)}" y="${f1(baseY - 12)}" width="${f1(Wt)}" height="16">
          <animate attributeName="width" values="${wv.join(";")}" keyTimes="${kt(wt)}" dur="${dur}" calcMode="discrete" repeatCount="indefinite"/>
        </rect>
      </clipPath>
    </defs>
    <g class="raven-typeline">
      <text x="${f1(leftX)}" y="${f1(baseY)}" text-anchor="start" class="raven-label" clip-path="url(#crebainType)">${escapeXML(word)}</text>
      <rect x="${f1(leftX + Wt)}" y="${f1(curY)}" width="5" height="10" rx="1" class="raven-cursor">
        <animate attributeName="x" values="${xv.join(";")}" keyTimes="${kt(wt)}" dur="${dur}" calcMode="discrete" repeatCount="indefinite"/>
        <animate attributeName="opacity" values="1;0" dur="1.06s" calcMode="discrete" repeatCount="indefinite"/>
      </rect>
      <g class="deflag">
        ${germanFlag(cx, flagTop, 26)}
        <animate attributeName="opacity" values="0;0;1;1" keyTimes="${kt([0, typeDone, Number((typeDone + 0.4).toFixed(2)), CYCLE])}" dur="${dur}" repeatCount="indefinite"/>
      </g>
      <animate attributeName="opacity" values="1;1;0;0" keyTimes="${kt(ot)}" dur="${dur}" repeatCount="indefinite"/>
      <animateTransform attributeName="transform" type="translate" values="0 0;0 0;0 3;0 3" keyTimes="${kt(ot)}" dur="${dur}" repeatCount="indefinite"/>
    </g>
  </g>`;
  }
  if (n.kind === "radar") {
    // manwe: the WATCHING OPTIC — a machined lens barrel in cold sky-steel
    // (chrome-blue bezel + dark groove + outer hairline over a drop shadow), a
    // six-blade mechanical iris nearly closed, and, silhouetted against the
    // bright aperture, a quadcopter caught mid-frame inside lock-on brackets:
    // a camera feed become airspace awareness. Barrel + iris are theme-FIXED
    // (a real object, like engram's medallion); only the label ink adapts.
    // The aperture breathes; reduced-motion holds it lit. One instance →
    // unique ids.
    const cx = n.x, cy = n.y;
    const IR = 28, TR = 11; // iris-plate radius · aperture (tangent) radius
    const rad = (deg) => (deg * Math.PI) / 180;
    // Six blade edges as HALF-chords: each runs from an aperture-hexagon
    // vertex tangentially out to the rim (the camera-iris pinwheel — full
    // chords read as a hexagram, not an iris). Each lit edge is paired with a
    // radially-outward shadow line for machined depth. Offset 15° so no edge
    // sits axis-aligned.
    const blades = Array.from({ length: 6 }, (_, i) => {
      const A = rad(15 + i * 60), ca = Math.cos(A), sa = Math.sin(A);
      const dxb = -sa, dyb = ca; // chord (tangent) direction
      const mk = (nOff) => {
        const tx = cx + (TR + nOff) * ca, ty = cy + (TR + nOff) * sa;
        const t0 = 6.35, t1 = Math.sqrt(IR * IR - (TR + nOff) * (TR + nOff)) - 0.6;
        return `M${f1(tx + t0 * dxb)} ${f1(ty + t0 * dyb)} L${f1(tx + t1 * dxb)} ${f1(ty + t1 * dyb)}`;
      };
      return `<path class="mw-blade-sh" d="${mk(1.5)}"/><path class="mw-blade" d="${mk(0)}"/>`;
    }).join("");
    // Aperture: the hexagon the six tangents leave open.
    const hexAp = Array.from({ length: 6 }, (_, i) => {
      const A = rad(45 + i * 60);
      return `${f1(cx + 12.7 * Math.cos(A))},${f1(cy + 12.7 * Math.sin(A))}`;
    }).join(" ");
    const ticks = Array.from({ length: 12 }, (_, i) => {
      const A = rad(i * 30), ca = Math.cos(A), sa = Math.sin(A);
      return `<line class="mw-tick" x1="${f1(cx + 29 * ca)}" y1="${f1(cy + 29 * sa)}" x2="${f1(cx + 31.2 * ca)}" y2="${f1(cy + 31.2 * sa)}"/>`;
    }).join("");
    const bk = 5, b1 = 17;
    const brackets =
      `<path class="mw-bracket" d="M${f1(cx - b1)} ${f1(cy - b1 + bk)} V${f1(cy - b1)} H${f1(cx - b1 + bk)}"/>` +
      `<path class="mw-bracket" d="M${f1(cx + b1 - bk)} ${f1(cy - b1)} H${f1(cx + b1)} V${f1(cy - b1 + bk)}"/>` +
      `<path class="mw-bracket" d="M${f1(cx + b1)} ${f1(cy + b1 - bk)} V${f1(cy + b1)} H${f1(cx + b1 - bk)}"/>` +
      `<path class="mw-bracket" d="M${f1(cx - b1 + bk)} ${f1(cy + b1)} H${f1(cx - b1)} V${f1(cy + b1 - bk)}"/>`;
    const a = 5.2; // drone silhouette half-span, caught in the aperture
    const drone =
      `<path class="mw-sil" d="M${f1(cx - a)} ${f1(cy - a)} L${f1(cx + a)} ${f1(cy + a)} M${f1(cx + a)} ${f1(cy - a)} L${f1(cx - a)} ${f1(cy + a)}"/>` +
      [[-a, -a], [a, -a], [-a, a], [a, a]]
        .map(([rx, ry]) => `<circle class="mw-sil-rotor" cx="${f1(cx + rx)}" cy="${f1(cy + ry)}" r="2"/>`)
        .join("") +
      `<circle class="mw-sil-hub" cx="${cx}" cy="${cy}" r="1.4"/>`;
    return `<g>
    <defs>
      <radialGradient id="mwBarrel" gradientUnits="userSpaceOnUse" cx="${cx}" cy="${f1(cy - 6)}" r="40">
        <stop offset="0%" stop-color="#22384e"/><stop offset="60%" stop-color="#131f2e"/><stop offset="100%" stop-color="#0a1119"/>
      </radialGradient>
      <linearGradient id="mwBezel" x1="0" y1="${f1(cy - 34)}" x2="0" y2="${f1(cy + 34)}" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stop-color="#bae6fd"/><stop offset="45%" stop-color="#38bdf8"/><stop offset="100%" stop-color="#0c4a6e"/>
      </linearGradient>
      <radialGradient id="mwAperture" gradientUnits="userSpaceOnUse" cx="${cx}" cy="${cy}" r="13">
        <stop offset="0%" stop-color="#f0f9ff"/><stop offset="55%" stop-color="#7dd3fc" stop-opacity="0.9"/><stop offset="100%" stop-color="#0ea5e9" stop-opacity="0.15"/>
      </radialGradient>
    </defs>
    <g filter="url(#nodeShadow)"><circle cx="${cx}" cy="${cy}" r="${SEAT_R}" fill="url(#mwBarrel)"/></g>
    <circle cx="${cx}" cy="${cy}" r="${IR}" class="mw-iris"/>
    <circle cx="${cx}" cy="${cy}" r="13.4" class="mw-apglow" filter="url(#soft)">
      <animate attributeName="opacity" values="0.65;1;0.65" dur="3s" repeatCount="indefinite"/>
    </circle>
    <polygon points="${hexAp}" fill="url(#mwAperture)"/>
    <polygon points="${hexAp}" class="mw-aphex"/>
    ${drone}
    ${blades}
    ${brackets}
    ${ticks}
    <circle cx="${cx}" cy="${cy}" r="${SEAT_R}" class="mw-ring"/>
    <circle cx="${cx}" cy="${cy}" r="31.8" class="mw-groove"/>
    <circle cx="${cx}" cy="${cy}" r="35.4" class="mw-hairline"/>
    <text x="${cx}" y="${f1(cy - 46)}" text-anchor="middle" class="radar-label">${escapeXML(n.label)}</text>
  </g>`;
  }
  if (n.kind === "sentinel") {
    // galadriel: its real brand mark in miniature — the SENTINEL SHIELD. An
    // angular chamfered crest whose visor slit carries a red scanning eye that
    // sweeps side to side (the watcher that looks for the channel that lies),
    // with three sensor-channel traces feeding the visor from below. A bespoke
    // SEATED mark (faint disc + label above, like manwe/engram) so galadriel
    // reads at the project tier. Echoes assets/galadriel-logo.svg in the
    // galadriel repo. Reduced-motion parks the eye centred (static attribute
    // values hold it). One instance -> unique ids.
    const cx = n.x, cy = n.y, s = 0.26;
    const m = (px, py) => `${f1(cx + (px - 120) * s)} ${f1(cy + (py - 122) * s)}`;
    const poly = (pts) => `M${pts.map(([px, py]) => m(px, py)).join(" L")} Z`;
    const shield = poly([[36, 44], [68, 18], [172, 18], [204, 44], [204, 122], [188, 164], [120, 226], [52, 164], [36, 122]]);
    const slit = poly([[46, 89], [60, 76], [180, 76], [194, 89], [180, 102], [60, 102]]);
    const traces =
      `<path d="M${m(120, 204)} L${m(120, 104)}" class="gal-chan"/>` +
      `<path d="M${m(84, 168)} L${m(84, 142)} L${m(104, 122)} L${m(136, 122)} L${m(156, 142)} L${m(156, 168)}" class="gal-chan" fill="none"/>`;
    const roots = [[120, 204], [84, 168], [156, 168]]
      .map(([px, py]) => `<circle cx="${f1(cx + (px - 120) * s)}" cy="${f1(cy + (py - 122) * s)}" r="1.5" class="gal-node"/>`)
      .join("");
    const [ex, ey] = [cx + (120 - 120) * s, cy + (89 - 122) * s];
    const amp = f1(42 * s);
    const ticks = [[1, 1], [1, -1], [-1, 1], [-1, -1]]
      .map(([tx, ty]) => `<line x1="${f1(cx + tx * 23.3)}" y1="${f1(cy + ty * 23.3)}" x2="${f1(cx + tx * 29)}" y2="${f1(cy + ty * 29)}" class="gal-tick"/>`)
      .join("");
    return `<g class="gal">
    <circle cx="${cx}" cy="${cy}" r="34" class="gal-seat"/>
    <circle cx="${cx}" cy="${cy}" r="36.5" class="gal-orbit"/>
    ${ticks}
    <defs>
      <radialGradient id="galEye" gradientUnits="userSpaceOnUse" cx="${f1(ex)}" cy="${f1(ey)}" r="8">
        <stop offset="0%" stop-color="#ff6b5e" stop-opacity="0.9"/>
        <stop offset="55%" stop-color="#ef4444" stop-opacity="0.45"/>
        <stop offset="100%" stop-color="#ef4444" stop-opacity="0"/>
      </radialGradient>
      <clipPath id="galSlit" clipPathUnits="userSpaceOnUse"><path d="${slit}"/></clipPath>
    </defs>
    <path d="${shield}" class="gal-plate"/>
    ${traces}${roots}
    <path d="${slit}" class="gal-slit"/>
    <g clip-path="url(#galSlit)">
      <g>
        <ellipse cx="${f1(ex)}" cy="${f1(ey)}" rx="8" ry="3" fill="url(#galEye)"/>
        <rect x="${f1(ex - 3.6)}" y="${f1(ey - 1.2)}" width="7.2" height="2.4" rx="1.2" class="gal-hotf"/>
        <animateTransform attributeName="transform" type="translate" values="0 0;${amp} 0;-${amp} 0;0 0" keyTimes="0;0.25;0.75;1" calcMode="spline" keySplines="0.45 0 0.55 1;0.45 0 0.55 1;0.45 0 0.55 1" dur="3.6s" repeatCount="indefinite"/>
      </g>
    </g>
    <text x="${cx}" y="${f1(cy - 46)}" text-anchor="middle" class="gal-label">${escapeXML(n.label)}</text>
  </g>`;
  }
  // small "chip" nodes
  const w = nodeWidth(n);
  const x = n.x - w / 2;
  const y = n.y - CHIP_H / 2;
  const glyph = n.private
    ? lock(x + 15, n.y, 0.62, n.color)
    : n.dataset
    ? datasetPlates(x + 15, n.y, n.color)
    : `<circle cx="${f1(x + 15)}" cy="${n.y}" r="4" fill="${n.color}"/>`;
  return `<g>
    <rect x="${f1(x)}" y="${y}" width="${w}" height="${CHIP_H}" rx="8" class="chip" stroke="${n.color}"/>
    ${glyph}
    <text x="${f1(x + 27)}" y="${n.y + 5}" class="chip-label">${escapeXML(n.label)}</text>
  </g>`;
});

// ---------------------------------------------------------------------------
// Frame: a "provenance instrument": four amber corner brackets, all in NCP's
// amber (the connective protocol literally framing the work it connects).
// ---------------------------------------------------------------------------
const frame = `<g class="frame">
    <line x1="27" y1="11" x2="833" y2="11" class="wg-rule"/>
    <path d="M 37 11 H 27 A 16 16 0 0 0 11 27 V 37" class="wg-bracket"/>
    <path d="M 823 11 H 833 A 16 16 0 0 1 849 27 V 37" class="wg-bracket"/>
    <path d="M 849 423 V 433 A 16 16 0 0 1 833 449 H 823" class="wg-bracket"/>
    <path d="M 37 449 H 27 A 16 16 0 0 1 11 433 V 423" class="wg-bracket"/>
  </g>`;

// ---------------------------------------------------------------------------
// Assemble.
// ---------------------------------------------------------------------------
const aria =
  "Project graph: engram, the neural-modeling hub, and crebain, the multi-UAV simulation and airspace-awareness testbed, connect through the always-on, two-way NCP protocol to prisoma, a private hub; pid-rs, cobot-atlas, melkor and relief-atlas connect to prisoma; cobot-atlas, melkor and relief-atlas also connect to crebain, as does manwe, the drone-detection eye feeding crebain; cortexel connects to engram; galadriel, a private cross-sensor spoof detector, connects to crebain and pid-rs.";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${escapeXML(aria)}">
  <defs>
    <radialGradient id="hubGrad" cx="50%" cy="42%" r="65%">
      <stop offset="0%" stop-color="#06281d"/>
      <stop offset="100%" stop-color="#0a1117"/>
    </radialGradient>
    <radialGradient id="melSplat" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#fdba74" stop-opacity="0.95"/>
      <stop offset="55%" stop-color="#fb923c" stop-opacity="0.55"/>
      <stop offset="100%" stop-color="#fb923c" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="gateGrad" cx="50%" cy="40%" r="68%">
      <stop offset="0%" stop-color="#332408"/>
      <stop offset="100%" stop-color="#10131a"/>
    </radialGradient>
    <radialGradient id="voxGrad" cx="50%" cy="40%" r="68%">
      <stop offset="0%" stop-color="#2a0a2e"/>
      <stop offset="100%" stop-color="#10131a"/>
    </radialGradient>
    <filter id="nodeShadow" x="-40%" y="-40%" width="180%" height="180%">
      <feDropShadow dx="0" dy="1.5" stdDeviation="2.4" flood-color="#000000" flood-opacity="0.38"/>
    </filter>
    <filter id="soft" x="-60%" y="-60%" width="220%" height="220%">
      <feGaussianBlur stdDeviation="4" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <filter id="edgeGlow" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="2.4" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    ${gradDefs.join("\n    ")}
  </defs>
  <style>
    :root { --hub-accent: #34d399; --cube-accent: #fb923c; --tri-accent: #a78bfa; color-scheme: light dark; }
    .cap        { font: 400 11px ui-monospace, SFMono-Regular, Menlo, monospace; fill: #6e7681; }
    .edge       { opacity: 0.55; }
    .edge-live  { filter: url(#edgeGlow); }
    .flow       { fill: none; stroke: #e2faff; stroke-width: 2.4; stroke-dasharray: 1.5 9; stroke-linecap: round; opacity: 0.9; }
    .flow-rev   { stroke-width: 2; opacity: 0.78; }
    .chip       { fill: #0d1117; stroke-width: 1.5; }
    .chip-label { font: 400 12px ui-monospace, SFMono-Regular, Menlo, monospace; fill: #c9d1d9; }
    .hub-fill   { fill: url(#hubGrad); }
    .hub-ring   { fill: none; stroke: #34d399; stroke-width: 2; }
    .hub-glow   { fill: none; stroke: #34d399; stroke-width: 6; stroke-opacity: 0.22; filter: url(#soft); }
    .hub-label  { font: 400 12px ui-monospace, SFMono-Regular, Menlo, monospace; fill: #6ee7b7; }
    .seat-ring   { fill: none; stroke-width: 1.8; }
    .seat-groove { fill: none; stroke: #05070b; stroke-opacity: 0.45; stroke-width: 1; }
    .seat-gate   { fill: url(#gateGrad); }
    .ring-gate   { stroke: #fbbf24; }
    .seat-vox    { fill: url(#voxGrad); }
    .ring-vox    { stroke: #e879f9; }
    .mel-plate    { fill: url(#melPlate); }
    .mel-scan     { fill: none; stroke: #fb923c; stroke-opacity: 0.09; stroke-width: 1; }
    .mel-rock     { fill: #050302; }
    .mel-ridge    { fill: none; stroke: #fdba74; stroke-opacity: 0.7; stroke-width: 1.3; stroke-linejoin: round; stroke-linecap: round; }
    .mel-facet    { fill: #211008; }
    .mel-spark    { fill: #fde68a; }
    .mel-edge     { fill: none; stroke: url(#melBezel); stroke-width: 2.4; stroke-linejoin: miter; }
    .mel-groove   { fill: none; stroke: #05070b; stroke-opacity: 0.5; stroke-width: 1; }
    .mel-hairline { fill: none; stroke: #2b333d; stroke-opacity: 0.55; stroke-width: 1; }
    .pz-beam    { stroke-width: 1.8; stroke-linecap: round; }
    .cube-label { font: 400 12px ui-monospace, SFMono-Regular, Menlo, monospace; fill: #fdba74; stroke: #2b1a10; }
    .logo-label     { font: 400 12px ui-monospace, SFMono-Regular, Menlo, monospace; fill: #cdd6e0; }
    .prz-body     { fill: url(#przGlass); }
    .prz-in       { stroke: #f4f7fa; stroke-width: 2; stroke-linecap: round; }
    .prz-inseg    { stroke: #f4f7fa; stroke-opacity: 0.35; stroke-width: 2; stroke-linecap: round; }
    .prz-edge     { fill: none; stroke: url(#przSilver); stroke-width: 2.4; }
    .prz-groove   { fill: none; stroke: #05070b; stroke-opacity: 0.5; stroke-width: 1; }
    .prz-hairline { fill: none; stroke: #2b333d; stroke-opacity: 0.55; stroke-width: 1; }
    .prz-glint    { fill: none; stroke: #ffffff; stroke-width: 0.9; stroke-opacity: 0.7; stroke-linecap: round; }
    .tri-label  { font: 400 12px ui-monospace, SFMono-Regular, Menlo, monospace; fill: #c4b5fd; }
    .gate-wire      { fill: none; stroke: #fbbf24; stroke-width: 2.6; stroke-linecap: round; opacity: 0.92; }
    .gate-wire-perc { fill: none; stroke: #fbbf24; stroke-width: 2; stroke-linecap: round; stroke-dasharray: 5 4; opacity: 0.6; }
    .gate-bar       { fill: #fbbf24; fill-opacity: 0.16; stroke: #fbbf24; stroke-width: 2; }
    .gate-port      { fill: #fbbf24; }
    .gate-tick      { fill: none; stroke: #fde68a; stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; }
    .gate-packet    { fill: #fde68a; }
    .gate-packet-perc { fill: #fde68a; opacity: 0.7; }
    .gate-label     { font: 400 12px ui-monospace, SFMono-Regular, Menlo, monospace; fill: #fbbf24; text-anchor: middle; }
    .vox-top    { fill: #e879f9; fill-opacity: 0.6; stroke: #e879f9; stroke-width: 1.3; }
    .vox-left   { fill: #e879f9; fill-opacity: 0.32; stroke: #e879f9; stroke-width: 1.3; }
    .vox-right  { fill: #e879f9; fill-opacity: 0.15; stroke: #e879f9; stroke-width: 1.3; }
    .flag-k     { fill: #181818; }
    .flag-r     { fill: #d8001d; }
    .flag-g     { fill: #ffcc00; }
    .flag-edge  { fill: none; stroke: #ffffff; stroke-opacity: 0.16; stroke-width: 0.6; }
    .vox-label  { font: 400 12px ui-monospace, SFMono-Regular, Menlo, monospace; fill: #f0abfc; }
    .vox-net    { color: #e879f9; }
    .raven-seat  { fill: #9caf88; fill-opacity: 0.08; filter: url(#soft); }
    .raven-label { font: 400 12px ui-monospace, SFMono-Regular, Menlo, monospace; fill: #9caf88; }
    .raven-cursor { fill: #9caf88; }
    .radar-label  { font: 400 12px ui-monospace, SFMono-Regular, Menlo, monospace; fill: #38bdf8; }
    .mw-iris      { fill: #101a26; stroke: #38bdf8; stroke-opacity: 0.25; stroke-width: 1; }
    .mw-apglow    { fill: #38bdf8; opacity: 0.85; }
    .mw-aphex     { fill: none; stroke: #e0f2fe; stroke-opacity: 0.45; stroke-width: 0.8; stroke-linejoin: round; }
    .mw-blade     { fill: none; stroke: #7dd3fc; stroke-opacity: 0.55; stroke-width: 1.2; }
    .mw-blade-sh  { fill: none; stroke: #05070b; stroke-opacity: 0.7; stroke-width: 1.2; }
    .mw-bracket   { fill: none; stroke: #bae6fd; stroke-width: 1.5; stroke-linecap: round; }
    .mw-tick      { stroke: #38bdf8; stroke-opacity: 0.35; stroke-width: 1; }
    .mw-sil       { fill: none; stroke: #020617; stroke-width: 1.7; stroke-linecap: round; }
    .mw-sil-rotor { fill: none; stroke: #020617; stroke-width: 1.4; }
    .mw-sil-hub   { fill: #020617; }
    .mw-ring      { fill: none; stroke: url(#mwBezel); stroke-width: 2.2; }
    .mw-groove    { fill: none; stroke: #05070b; stroke-opacity: 0.5; stroke-width: 1; }
    .mw-hairline  { fill: none; stroke: #2b333d; stroke-opacity: 0.55; stroke-width: 1; }
    .gal-seat   { fill: #ef4444; fill-opacity: 0.05; filter: url(#soft); }
    .gal-orbit  { fill: none; stroke: #ef4444; stroke-opacity: 0.45; stroke-width: 1.2; }
    .gal-tick   { stroke: #ef4444; stroke-opacity: 0.6; stroke-width: 1.6; stroke-linecap: round; }
    .gal-plate  { fill: #131c28; stroke: #8b97a6; stroke-opacity: 0.6; stroke-width: 1.3; stroke-linejoin: miter; }
    .gal-slit   { fill: #05070b; stroke: #8b97a6; stroke-opacity: 0.5; stroke-width: 0.8; stroke-linejoin: miter; }
    .gal-chan   { fill: none; stroke: #b9c2cd; stroke-width: 1.2; stroke-linecap: round; stroke-opacity: 0.72; }
    .gal-node   { fill: #b9c2cd; }
    .gal-hotf   { fill: #ef4444; }
    .gal-label  { font: 400 12px ui-monospace, SFMono-Regular, Menlo, monospace; fill: #ef4444; }
    .wg-rule    { stroke: #30363d; stroke-width: 1; stroke-opacity: 0.55; }
    .wg-bracket { fill: none; stroke: #fbbf24; stroke-width: 1.5; stroke-linecap: round; stroke-opacity: 0.85; }
    .panel      { fill: #ffffff; fill-opacity: 0.022; stroke: #ffffff; stroke-opacity: 0.07; }
    text { paint-order: stroke; stroke: #0d1117; stroke-width: 2.6; stroke-linejoin: round; text-transform: uppercase; letter-spacing: 2.5px; }
    @media (prefers-color-scheme: light) {
      text { stroke: #ffffff; }
      :root { --hub-accent: #059669; --cube-accent: #c2410c; --tri-accent: #7c3aed; }
      .cap { fill: #57606a; }
      .flow { stroke: #22d3ee; }
      .chip { fill: #ffffff; }
      .chip-label { fill: #1f2328; }
      .hub-fill { fill: #ffffff; }
      .hub-ring { stroke: #059669; }
      .hub-glow { stroke: #059669; stroke-opacity: 0.12; }
      .hub-label { fill: #059669; }
      .prz-in { stroke: #475569; }
      .logo-label { fill: #57626f; }
      .tri-label { fill: #6d28d9; }
      .gate-wire { stroke: #b45309; }
      .gate-wire-perc { stroke: #b45309; }
      .gate-bar { fill: #b45309; stroke: #b45309; }
      .gate-port { fill: #b45309; }
      .gate-tick { stroke: #b45309; }
      .gate-packet { fill: #b45309; }
      .gate-packet-perc { fill: #b45309; }
      .gate-label { fill: #b45309; }
      .vox-top { fill: #c026d3; fill-opacity: 0.3; stroke: #c026d3; }
      .vox-left { fill: #c026d3; fill-opacity: 0.16; stroke: #c026d3; }
      .vox-right { fill: #c026d3; fill-opacity: 0.07; stroke: #c026d3; }
      .flag-edge { stroke: #000000; stroke-opacity: 0.25; }
      .vox-label { fill: #c026d3; }
      .vox-net { color: #c026d3; }
      .raven-seat { fill-opacity: 0.06; }
      .raven-label { fill: #4b5320; }
      .raven-cursor { fill: #4b5320; }
      .radar-label { fill: #0284c7; }
      .seat-gate, .seat-vox { fill: #ffffff; }
      .ring-gate { stroke: #b45309; }
      .ring-vox { stroke: #c026d3; }
      .seat-groove { stroke: #1f2328; stroke-opacity: 0.1; }
      .gal-seat { fill: #dc2626; fill-opacity: 0.04; }
      .gal-orbit { stroke: #dc2626; stroke-opacity: 0.5; }
      .gal-tick { stroke: #dc2626; }
      .gal-plate { fill: #ffffff; stroke: #6b7684; }
      .gal-slit { fill: #111827; stroke: #6b7684; }
      .gal-chan { stroke: #59636f; }
      .gal-node { fill: #59636f; }
      .gal-hotf { fill: #dc2626; }
      .gal-label { fill: #dc2626; }
      .wg-rule { stroke: #d0d7de; stroke-opacity: 0.9; }
      .wg-bracket { stroke: #b45309; }
      .panel { fill: #0b1f2a; fill-opacity: 0.025; stroke: #0b1f2a; stroke-opacity: 0.08; }
    }
    @media (prefers-reduced-motion: reduce) { animate, animateTransform { display: none; } }
  </style>

  <rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="16" class="panel"/>
  <text x="40" y="40" class="cap">THE&#160;SYSTEM&#160;//&#160;HOW&#160;THE&#160;WORK&#160;CONNECTS</text>

  <g class="edges">
    ${calmEdges.join("\n    ")}
    ${liveEdges.join("\n    ")}
  </g>
  <g class="flows">
    ${flows.join("\n    ")}
  </g>
  <g class="nodes">
    ${nodeEls.join("\n  ")}
  </g>
  ${frame}
</svg>
`;

mkdirSync(dirname(OUT_PATH), { recursive: true });
writeThemedPair(OUT_PATH, svg);
console.log(`[work-graph] wrote ${OUT_PATH} (${svg.length} bytes)`);
