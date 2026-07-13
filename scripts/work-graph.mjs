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
// into the three PID components; melkor an obsidian forge plate whose black
// massif wears an uneven tactical survey mesh; manwe a lens barrel whose six-blade
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
const H = 512;
const VSHIFT = 26; // push the graph body down so the taller canvas is balanced (frame/title stay put)

// ---------------------------------------------------------------------------
// Spec. Positions are node centres; colours are per-project accents.
//   large: cube · hub (circle) · triangle · logo (image)
//   bespoke logos: gate (NCP) · voxel-net (cortexel) · raven (crebain) | chip
// ---------------------------------------------------------------------------
const nodes = {
  engram:      { x: 110, y: 230, color: "#bcc6d1", kind: "logo" },
  pidrs:       { x: 172, y: 104, color: "#34d399", kind: "hub", label: "pid-rs", r: 36 },
  ncp:         { x: 250, y: 230, color: "#fbbf24", kind: "gate", label: "NCP" },
  prisoma:     { x: 460, y: 130, color: "#a78bfa", kind: "triangle", private: true },
  crebain:     { x: 458, y: 366, color: "#9caf88", kind: "raven" },
  cobotatlas:  { x: 690, y: 150, color: "#60a5fa", kind: "chip", label: "cobot-atlas", dataset: true },
  melkor:      { x: 690, y: 250, color: "#fb923c", kind: "cube" },
  reliefatlas: { x: 690, y: 350, color: "#fb7185", kind: "chip", label: "relief-atlas", dataset: true },
  cortexel:    { x: 110, y: 360, color: "#e879f9", kind: "voxel" },
  manwe:       { x: 298, y: 386, color: "#38bdf8", kind: "radar", label: "manwe" },
  galadriel:   { x: 434, y: 248, color: "#ef4444", kind: "sentinel", label: "galadriel" },
  haldir:      { x: 345, y: 181, color: "#2dd4bf", kind: "haldir", label: "haldir" },
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
  { a: "ncp",         b: "haldir" },
  { a: "haldir",      b: "galadriel" },
  { a: "haldir",      b: "prisoma" },
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
  if (n.kind === "raven") return { hw: 44, hh: 44, circle: true };
  if (n.kind === "radar") return { hw: SEAT_R, hh: SEAT_R, circle: true };
  if (n.kind === "sentinel") return { hw: 34, hh: 34, circle: true };
  if (n.kind === "haldir") return { hw: SEAT_R, hh: SEAT_R, circle: true };
  if (n.kind === "logo") return { hw: 46, hh: 46, circle: true };
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
// net): an accent-tinted machined disc at manwe's border grade — a chrome
// gradient bezel in the project hue (lit crown → accent → shadowed base), a
// dark inner groove, an outer hairline that keeps the edge crisp on white,
// and a soft drop shadow. `stops` are the bezel's [lit, accent, dark] colours;
// the gradient def is emitted per seat (unique id, userSpaceOnUse coords).
function seat(cx, cy, name, stops) {
  return `<defs>
      <linearGradient id="${name}Bezel" x1="0" y1="${f1(cy - SEAT_R)}" x2="0" y2="${f1(cy + SEAT_R)}" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stop-color="${stops[0]}"/><stop offset="45%" stop-color="${stops[1]}"/><stop offset="100%" stop-color="${stops[2]}"/>
      </linearGradient>
    </defs>
    <g filter="url(#nodeShadow)"><circle cx="${cx}" cy="${cy}" r="${SEAT_R}" class="seat-${name}"/></g>
    <circle cx="${cx}" cy="${cy}" r="${SEAT_R}" stroke="url(#${name}Bezel)" class="seat-ring"/>
    <circle cx="${cx}" cy="${cy}" r="${f1(SEAT_R - 2.2)}" class="seat-groove"/>
    <circle cx="${cx}" cy="${cy}" r="${f1(SEAT_R + 1.4)}" class="seat-hairline"/>`;
}

// Render one node's bespoke mark (the per-kind switch). Exported so the standalone
// per-project logos (scripts/logos.mjs) reuse the exact same marks + machining.
export function nodeMark(n) {
  if (n.kind === "hub") {
    // pid-rs: THE DECOMPOSITION CORE — a dark-emerald chronograph that has just
    // finished decomposing two SOURCES into the four PID atoms. Two waveguides
    // feed in diagonally (X1 upper-left, X2 upper-right) with diode ports +
    // square KSG sample chips; a faceted split-diamond FUSION core carries the
    // single white-hot pinpoint; and FOUR SUB-DIAL COMPLICATIONS sit recessed
    // at N/W/E/S on an etched index rail, each a machined cradle (chamfer,
    // dark well, chrome rim, raised lip) holding a cut atom jewel: REDUNDANT
    // (N, calm cabochon), UNIQUE-X1/X2 (W/E, mirrored baguette pair lit from
    // the core side), SYNERGY (S, the grand complication — larger well,
    // 8-facet brilliant with its own hot point). Hairline channels tie every
    // complication to the core. Browser motion runs one measurement: intake ->
    // compute flash -> the core lights REDUNDANT through the N channel -> TWO
    // commit-sparks (one per source) leave the redundancy sub-dial and run the
    // rail in opposite directions, committing each UNIQUE as they pass -> the
    // sparks COLLIDE at S and the collision commits SYNERGY brightest (the
    // atom that exists only jointly). librsvg/reduced-motion hold the finished
    // still: all four jewels lit, channels lit, sparks dark, chips parked.
    const r = n.r || HUB_R;
    const X = n.x, Y = n.y;
    const A = (dx, dy) => `${f1(X + dx)} ${f1(Y + dy)}`;   // "x y"
    const P = (dx, dy) => `${f1(X + dx)},${f1(Y + dy)}`;   // "x,y"
    const CYC = "5.6s";
    const CR = 23.5;   // complication-ring (index rail) radius
    // Etched index rail (dark groove + lower catch-light) with minute ticks
    // between the four complication seats — the chronograph's quiet craft.
    // The rail is an ARC, not a circle: it yields ONLY to the SYNERGY grand
    // complication at S, terminating in a machined relief gap wider than its
    // rim (round-capped ends), while N/W/E stay inscribed flush — a static,
    // legend-free cue that synergy exceeds what the rail (any single source's
    // reach) can hold.
    const SGAP = 28; // S relief half-angle (deg); S lip half-angle is ~21
    const railArc = (cls, yOff) => {
      const a1 = ((90 + SGAP) * Math.PI) / 180, a2 = ((90 - SGAP) * Math.PI) / 180;
      return `<path class="${cls}" d="M${f1(X + CR * Math.cos(a1))} ${f1(Y + yOff + CR * Math.sin(a1))} A${CR} ${CR} 0 1 1 ${f1(X + CR * Math.cos(a2))} ${f1(Y + yOff + CR * Math.sin(a2))}"/>`;
    };
    const rail =
      railArc("pidx-rail", 0) +
      railArc("pidx-rail-lt", 0.55) +
      `<circle class="pidx-inner" cx="${X}" cy="${Y}" r="13.2"/>` +
      [30, 60, 120, 150, 210, 240, 300, 330].map((a) => {
        const t = (a * Math.PI) / 180, c = Math.cos(t), s = Math.sin(t);
        return `<path class="pidx-tick" d="M${A(21.9 * c, 21.9 * s)} L${A(25.1 * c, 25.1 * s)}"/>`;
      }).join("");
    // Channels: machined grooves tying core to complications; the lit hairline
    // draws on at commit. N/W/E draw outward (core feeds the atoms); S is
    // authored jewel->core so the synergy, born at the collision, feeds BACK.
    // [x1,y1 (draw origin), x2,y2, dashLen, drawStart, drawEnd]
    const CHAN = [
      [0, -8.6, 0, -18.5, 10, 0.26, 0.3],   // core -> REDUNDANT
      [-7.6, 0, -18.5, 0, 11, 0.43, 0.47],  // core -> UNIQUE-X1
      [7.6, 0, 18.5, 0, 11, 0.43, 0.47],    // core -> UNIQUE-X2
      [0, 17.2, 0, 8.6, 8.6, 0.63, 0.67],   // SYNERGY -> core
    ];
    const chans = CHAN.map(([x1, y1, x2, y2, L, ds, de]) =>
      `<path class="pidx-chan" d="M${A(x1, y1)} L${A(x2, y2)}"/>` +
      `<path class="pidx-chan-lt" d="M${A(x1, y1)} L${A(x2, y2)}" stroke-dasharray="${L} 40" stroke-dashoffset="0">` +
        `<animate attributeName="stroke-dashoffset" values="0;0;${L};${L};0;0" keyTimes="0;0.02;0.06;${ds};${de};1" dur="${CYC}" repeatCount="indefinite"/></path>`
    ).join("");
    // One recessed cradle: chamfer shadow, dark well, vertical chrome rim
    // (lit at its lower lip, the way a real recess catches light), raised lip.
    const cradle = (dx, dy, wr) =>
      `<circle class="pidx-chamfer" cx="${f1(X + dx)}" cy="${f1(Y + dy)}" r="${f1(wr + 0.9)}"/>` +
      `<circle cx="${f1(X + dx)}" cy="${f1(Y + dy)}" r="${wr}" fill="url(#pidXWell)"/>` +
      `<circle class="pidx-rim" cx="${f1(X + dx)}" cy="${f1(Y + dy)}" r="${wr}"/>` +
      `<circle class="pidx-lip" cx="${f1(X + dx)}" cy="${f1(Y + dy)}" r="${f1(wr + 1.6)}"/>`;
    // Unlit shade (drops over each jewel while the pass recomputes, snaps off
    // at commit) and radial commit-flare. Static state: shade off, flare off.
    const shade = (dx, dy, sr, C) =>
      `<circle class="pidx-shade" cx="${f1(X + dx)}" cy="${f1(Y + dy)}" r="${sr}" opacity="0">` +
        `<animate attributeName="opacity" values="0;0;0.92;0.92;0;0" keyTimes="0;0.02;0.06;${(C - 0.03).toFixed(2)};${C};1" dur="${CYC}" repeatCount="indefinite"/></circle>`;
    const flare = (dx, dy, fr, cls, C, peak, out) =>
      `<circle class="${cls}" cx="${f1(X + dx)}" cy="${f1(Y + dy)}" r="${fr}" opacity="0" filter="url(#mwBloom)">` +
        `<animate attributeName="opacity" values="0;0;0.9;0;0" keyTimes="0;${C};${peak};${out};1" dur="${CYC}" repeatCount="indefinite"/></circle>`;
    // The four atom jewels. REDUNDANT: calm cabochon. UNIQUEs: mirrored
    // two-facet baguettes, bright facet toward the core that lights them.
    // SYNERGY: 8-facet brilliant with girdle + its own white-hot point.
    const jwR =
      `<circle cx="${X}" cy="${f1(Y - CR)}" r="3.1" fill="url(#pidXJwR)"/>` +
      `<circle class="pidx-girdle" cx="${X}" cy="${f1(Y - CR)}" r="3.1"/>` +
      `<circle class="pidx-glint" cx="${f1(X - 1)}" cy="${f1(Y - CR - 1.1)}" r="0.7"/>`;
    const jwU = (sx) => {
      const cu = sx * CR;
      return `<polygon class="${sx > 0 ? "pidx-fU-l" : "pidx-fU-d"}" points="${P(cu, -3.3)} ${P(cu - 3.3, 0)} ${P(cu, 3.3)}"/>` +
        `<polygon class="${sx > 0 ? "pidx-fU-d" : "pidx-fU-l"}" points="${P(cu, -3.3)} ${P(cu + 3.3, 0)} ${P(cu, 3.3)}"/>` +
        `<polygon class="pidx-jw-edge" points="${P(cu, -3.3)} ${P(cu + 3.3, 0)} ${P(cu, 3.3)} ${P(cu - 3.3, 0)}"/>`;
    };
    const SYN_RAMP = ["#ecfdf5", "#d1fae5", "#a7f3d0", "#6ee7b7", "#34d399", "#10b981", "#059669"];
    const jwS = Array.from({ length: 8 }, (_, i) => {
      const a1 = ((22.5 + 45 * i) * Math.PI) / 180, a2 = ((22.5 + 45 * (i + 1)) * Math.PI) / 180;
      // Directional cut: each facet shaded by its angle to a top-left key
      // light, so the stone reads as a machined brilliant, not a pinwheel.
      const am = (a1 + a2) / 2, lit = Math.cos(am - (-2.36));
      const tone = SYN_RAMP[Math.round((1 - lit) * 0.5 * (SYN_RAMP.length - 1))];
      return `<polygon fill="${tone}" stroke="#065f46" stroke-width="0.3" stroke-opacity="0.6" points="${P(0, CR)} ${P(4.6 * Math.cos(a1), CR + 4.6 * Math.sin(a1))} ${P(4.6 * Math.cos(a2), CR + 4.6 * Math.sin(a2))}"/>`;
    }).join("") +
      `<circle class="pidx-girdle-s" cx="${X}" cy="${f1(Y + CR)}" r="4.65"/>` +
      `<circle class="pidx-syn-hot" cx="${X}" cy="${f1(Y + CR)}" r="1.3" filter="url(#mwBloom)"/>`;
    const complications =
      cradle(0, -CR, 5.2) + cradle(-CR, 0, 5.2) + cradle(CR, 0, 5.2) + cradle(0, CR, 6.8) +
      jwR + jwU(-1) + jwU(1) + jwS +
      shade(0, -CR, 3.7, 0.3) + shade(-CR, 0, 3.9, 0.47) + shade(CR, 0, 3.9, 0.47) + shade(0, CR, 4.9, 0.64) +
      flare(0, -CR, 4.4, "pidx-flare", 0.3, 0.32, 0.4) +
      flare(-CR, 0, 4.4, "pidx-flare", 0.47, 0.49, 0.56) +
      flare(CR, 0, 4.4, "pidx-flare", 0.47, 0.49, 0.56) +
      flare(0, CR, 6, "pidx-flare-s", 0.62, 0.645, 0.76) +
      `<circle class="pidx-syn-ring" cx="${X}" cy="${f1(Y + CR)}" r="4.5" opacity="0">` +
        `<animate attributeName="r" values="4.5;4.5;9.5;4.5" keyTimes="0;0.62;0.76;1" dur="${CYC}" repeatCount="indefinite"/>` +
        `<animate attributeName="opacity" values="0;0;0.85;0;0" keyTimes="0;0.62;0.65;0.76;1" dur="${CYC}" repeatCount="indefinite"/></circle>`;
    // Two commit-sparks (one per source) born at REDUNDANT, running the rail
    // in opposite directions, dying in the collision that lights SYNERGY.
    const spark = (dir) => {
      const tx = -dir * CR * Math.sin((10 * Math.PI) / 180);
      const ty = -CR * Math.cos((10 * Math.PI) / 180);
      return `<g opacity="0">` +
        `<path class="pidx-spark-tail" d="M${A(tx, ty)} A${CR} ${CR} 0 0 ${dir > 0 ? 1 : 0} ${A(0, -CR)}"/>` +
        `<circle class="pidx-spark-head" cx="${X}" cy="${f1(Y - CR)}" r="1.4" filter="url(#mwBloom)"/>` +
        `<animateTransform attributeName="transform" type="rotate" values="0 ${X} ${Y};0 ${X} ${Y};${dir * 180} ${X} ${Y};${dir * 180} ${X} ${Y}" keyTimes="0;0.32;0.62;1" dur="${CYC}" repeatCount="indefinite"/>` +
        `<animate attributeName="opacity" values="0;0;1;1;0;0" keyTimes="0;0.32;0.345;0.61;0.635;1" dur="${CYC}" repeatCount="indefinite"/></g>`;
    };
    const sparks = spark(-1) + spark(1);
    // Two waveguides (dark body + lit centreline) + diode ports + square KSG chips
    // that stream from port into the core during intake, then reappear parked.
    const WG = [[-20.5,-20.5,-6.4,-6.4,-18.9,-18.9,"11.3 11.3"], [20.5,-20.5,6.4,-6.4,16.5,-18.9,"-11.3 11.3"]];
    const wgs = WG.map(([px,py,kx,ky,chx,chy,mv]) =>
      `<path class="pid-wg" d="M${A(px,py)} L${A(kx,ky)}"/><path class="pid-wg-lit" d="M${A(px,py)} L${A(kx,ky)}"/>` +
      `<circle class="pid-port" cx="${f1(X+px)}" cy="${f1(Y+py)}" r="1.6"/><circle class="pid-port-core" cx="${f1(X+px)}" cy="${f1(Y+py)}" r="0.7"/>` +
      `<rect class="pid-chip" x="${f1(X+chx)}" y="${f1(Y+chy)}" width="2.4" height="2.4">` +
        `<animateTransform attributeName="transform" type="translate" values="0 0;${mv};${mv};0 0;0 0" keyTimes="0;0.14;0.16;0.92;1" dur="${CYC}" repeatCount="indefinite"/>` +
        `<animate attributeName="opacity" values="1;1;0;0;1;1" keyTimes="0;0.13;0.16;0.9;0.94;1" dur="${CYC}" repeatCount="indefinite"/></rect>`
    ).join("");
    // Split-diamond fusion core.
    const core =
      `<polygon class="pid-core-crown" points="${P(0,-8)} ${P(-7,0)} ${P(0,0)}"/>` +
      `<polygon class="pid-core-crown" points="${P(0,-8)} ${P(7,0)} ${P(0,0)}"/>` +
      `<polygon class="pid-core-bl" points="${P(0,8)} ${P(-7,0)} ${P(0,0)}"/>` +
      `<polygon class="pid-core-br" points="${P(0,8)} ${P(7,0)} ${P(0,0)}"/>` +
      `<path class="pid-facet" d="M${A(-7,0)} L${A(7,0)}"/>` +
      `<path class="pid-core-edge" d="M${A(0,-8)} L${A(7,0)} L${A(0,8)} L${A(-7,0)} Z"/>` +
      `<path class="pid-seam" d="M${A(0,-8)} L${A(0,8)}"/>`;
    const compute = `<circle class="pid-compute" cx="${X}" cy="${Y}" r="0"><animate attributeName="r" values="0;0;8;8;0" keyTimes="0;0.16;0.24;0.26;1" dur="${CYC}" repeatCount="indefinite"/><animate attributeName="opacity" values="0;0;0.5;0;0" keyTimes="0;0.16;0.22;0.26;1" dur="${CYC}" repeatCount="indefinite"/></circle>`;
    const pinpoint = `<circle class="pid-hot" cx="${X}" cy="${Y}" r="1.4" filter="url(#mwBloom)"><animate attributeName="r" values="1.4;1.4;2.8;1.6;1.6;2.3;1.4;1.4" keyTimes="0;0.16;0.2;0.26;0.62;0.66;0.74;1" dur="${CYC}" repeatCount="indefinite"/></circle><circle class="pid-hot-in" cx="${X}" cy="${Y}" r="0.7"/>`;
    return `<g>
    <defs>
      <linearGradient id="hubBezel" x1="0" y1="${f1(Y - r)}" x2="0" y2="${f1(Y + r)}" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stop-color="#a7f3d0"/><stop offset="45%" stop-color="#34d399"/><stop offset="100%" stop-color="#065f46"/>
      </linearGradient>
      <radialGradient id="pidXWell">
        <stop offset="0%" stop-color="#06281d"/><stop offset="68%" stop-color="#041c14"/><stop offset="100%" stop-color="#02120c"/>
      </radialGradient>
      <linearGradient id="pidXRim" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#010e0a"/><stop offset="55%" stop-color="#065f46"/><stop offset="100%" stop-color="#34d399"/>
      </linearGradient>
      <radialGradient id="pidXJwR" cx="0.4" cy="0.35" r="0.75">
        <stop offset="0%" stop-color="#d1fae5"/><stop offset="50%" stop-color="#34d399"/><stop offset="100%" stop-color="#047857"/>
      </radialGradient>
    </defs>
    <circle cx="${X}" cy="${Y}" r="${r}" class="hub-glow"><animate attributeName="r" values="${r};${r + 2};${r}" dur="3.2s" repeatCount="indefinite"/></circle>
    <g filter="url(#nodeShadow)"><circle cx="${X}" cy="${Y}" r="${r}" class="hub-fill"/></g>
    <circle cx="${X}" cy="${Y}" r="${r}" class="hub-ring"/>
    <circle cx="${X}" cy="${Y}" r="${f1(r - 2.2)}" class="seat-groove"/>
    <circle cx="${X}" cy="${Y}" r="${f1(r + 1.4)}" class="seat-hairline"/>
    ${rail}
    ${chans}
    ${complications}
    ${wgs}
    ${core}
    ${compute}
    ${pinpoint}
    ${sparks}
    <text x="${X}" y="${f1(Y + 50)}" text-anchor="middle" class="hub-label">${escapeXML(n.label)}</text>
  </g>`;
  }
  if (n.kind === "cube") {
    // melkor: the OBSIDIAN FORGE PLATE — a machined dark hexagonal plate with a
    // heated-metal bezel (lit crown → cooled base), forge light rising from
    // below, and a black twin-peak massif being SURVEYED against it: the ridge
    // carries an ember rim light and the front face is a low-poly TIN of
    // irregular shaded facets with a hairline ember wireframe, while the
    // right flank stays solid. Plate + rock are theme-FIXED (a real object, like
    // engram's medallion); only the label ink adapts. The peak spark breathes;
    // reduced-motion holds it lit. One instance → unique ids.
    const cx = n.x, cy = n.y;
    const hex = (s) =>
      `M${f1(cx)} ${f1(cy - 48 * s)} L${f1(cx + 41.6 * s)} ${f1(cy - 24 * s)} L${f1(cx + 41.6 * s)} ${f1(cy + 24 * s)} L${f1(cx)} ${f1(cy + 48 * s)} L${f1(cx - 41.6 * s)} ${f1(cy + 24 * s)} L${f1(cx - 41.6 * s)} ${f1(cy - 24 * s)} Z`;
    // Massif: left foot → left peak → saddle → main peak → right foot. The
    // ember ridge light runs the FULL silhouette so the letterform reads as a
    // complete M, final downstroke included.
    const solid = `M${f1(cx - 30)} ${f1(cy + 24)} L${f1(cx - 12)} ${f1(cy - 22)} L${f1(cx)} ${f1(cy - 2)} L${f1(cx + 12)} ${f1(cy - 34)} L${f1(cx + 30)} ${f1(cy + 24)} Z`;
    const ridgeLine = `M${f1(cx - 30)} ${f1(cy + 24)} L${f1(cx - 12)} ${f1(cy - 22)} L${f1(cx)} ${f1(cy - 2)} L${f1(cx + 12)} ${f1(cy - 34)} L${f1(cx + 30)} ${f1(cy + 24)}`;
    // Low-poly FACETS over the front face — few and LARGE, no two alike, with
    // strong tonal steps from the forge underlight (facets nearer the heat
    // run warmer) and hairline dark seams; no drawn wireframe, the edges are
    // implied by tone like proper low-poly artwork. The right flank stays one
    // SOLID near-black facet — the split is what sells the volume.
    const V = {
      A: [-30, 24], B: [-12, -22], C: [0, -2], D: [12, -34],
      E: [12, 24], K: [-6, 24], L: [2, 24],
    };
    const TIN = [
      ["A", "B", "K", "#4a2712"], ["B", "C", "K", "#2a1509"], ["C", "L", "K", "#1c0e07"],
      ["C", "D", "L", "#5c3117"], ["D", "E", "L", "#331a0c"],
    ];
    const pt = (k) => `${f1(cx + V[k][0])},${f1(cy + V[k][1])}`;
    const facets = TIN.map(([a, b, c, tone]) =>
      `<polygon class="mel-tin" points="${pt(a)} ${pt(b)} ${pt(c)}" fill="${tone}"/>`).join("\n      ");
    // The full 3-D shaded surface (rock body + right flank + low-poly facets + the M ridge
    // LINE) — reused for both the fog ghost and the crisp construction reveal, so the ridge
    // is foggy while unfilled and DRAWS ON crisply as the shape fills from the base up.
    const surface = `<path d="${solid}" class="mel-rock"/>` +
      `<path d="M${f1(cx + 12)} ${f1(cy - 34)} L${f1(cx + 30)} ${f1(cy + 24)} L${f1(cx + 12)} ${f1(cy + 24)} Z" class="mel-facet"/>` +
      facets +
      `<path d="${ridgeLine}" class="mel-ridge"/>`;
    // BEING CONSTRUCTED (3D FULL FILL): the massif's 3-D-shaded surface is REVEALED from
    // the base UP behind a bright build-line — a solid low-poly fill materialising in one
    // sweep, not a scatter of dots. It clears top-down, holds bare on the ridge scaffold,
    // reconstructs bottom-up, and holds. The reveal is an animated clip; the ridge stays
    // the always-visible frame. Base (t=0) = the finished surface, so librsvg / reduced-
    // motion show the complete mountain. Seamless loop.
    const MEL = "6s";
    const KT = "0;0.12;0.2;0.32;0.72;1"; // hold-full · clear(top-down) · bare · construct(base-up) · hold
    // Bottom-up reveal rect (fixed bottom at cy+52; its top edge rises to construct).
    const buildRect = `<rect x="${f1(cx - 52)}" y="${f1(cy - 40)}" width="104" height="92">` +
      `<animate attributeName="y" values="${f1(cy - 40)};${f1(cy - 40)};${f1(cy + 26)};${f1(cy + 26)};${f1(cy - 40)};${f1(cy - 40)}" keyTimes="${KT}" dur="${MEL}" repeatCount="indefinite"/>` +
      `<animate attributeName="height" values="92;92;26;26;92;92" keyTimes="${KT}" dur="${MEL}" repeatCount="indefinite"/></rect>`;
    // The construction FRONT: a bright build-line riding the reveal edge (base -> peak),
    // clipped to the massif (invisible except while building; opacity 0 at rest).
    const front = `<g clip-path="url(#melMassif)"><rect class="mel-front" x="${f1(cx - 34)}" y="${f1(cy + 24)}" width="68" height="3.4" opacity="0">` +
      `<animate attributeName="y" values="${f1(cy + 24)};${f1(cy + 24)};${f1(cy - 35)};${f1(cy - 35)};${f1(cy + 24)}" keyTimes="0;0.32;0.72;0.74;1" dur="${MEL}" repeatCount="indefinite"/>` +
      `<animate attributeName="opacity" values="0;0;0.9;0.9;0;0" keyTimes="0;0.32;0.37;0.67;0.72;1" dur="${MEL}" repeatCount="indefinite"/></rect></g>`;
    return `<g>
    <defs>
      <linearGradient id="melPlate" x1="0" y1="${f1(cy - 48)}" x2="0" y2="${f1(cy + 48)}" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stop-color="#2b1a10"/><stop offset="55%" stop-color="#170d07"/><stop offset="100%" stop-color="#0b0604"/>
      </linearGradient>
      <linearGradient id="melRock" x1="0" y1="${f1(cy - 36)}" x2="0" y2="${f1(cy + 24)}" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stop-color="#241209"/><stop offset="55%" stop-color="#3a1e0e"/><stop offset="100%" stop-color="#582d15"/>
      </linearGradient>
      <radialGradient id="melHeat" gradientUnits="userSpaceOnUse" cx="${cx}" cy="${f1(cy + 22)}" r="62">
        <stop offset="0%" stop-color="#c2410c" stop-opacity="0.72"/><stop offset="45%" stop-color="#9a3412" stop-opacity="0.38"/><stop offset="100%" stop-color="#7c2d12" stop-opacity="0"/>
      </radialGradient>
      <linearGradient id="melBezel" x1="0" y1="${f1(cy - 48)}" x2="0" y2="${f1(cy + 48)}" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stop-color="#fed7aa"/><stop offset="45%" stop-color="#b45309"/><stop offset="100%" stop-color="#571c07"/>
      </linearGradient>
      <clipPath id="melClip"><path d="${hex(1)}"/></clipPath>
      <clipPath id="melMassif"><path d="${solid}"/></clipPath>
      <clipPath id="melBuild">${buildRect}</clipPath>
    </defs>
    <g filter="url(#nodeShadow)"><path d="${hex(1)}" class="mel-plate"/></g>
    <g clip-path="url(#melClip)">
      <path d="${hex(1)}" fill="url(#melHeat)"/>
      <g class="mel-fog-g" filter="url(#soft)">${surface}</g>
      <g clip-path="url(#melBuild)">${surface}</g>
      ${front}
    </g>
    <path d="${hex(1)}" class="mel-edge"/>
    <path d="${hex(0.9423)}" class="mel-groove"/>
    <path d="${hex(1.0337)}" class="mel-hairline"/>
    <text x="${cx}" y="${f1(cy + 62)}" text-anchor="middle" class="cube-label">${escapeXML(n.label)}</text>
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
    const Z = 46 / 34; // scale the medallion up to prisoma/melkor size (graph only)
    const top = f1(cy - r), bot = f1(cy + r);
    return `<g>
    <defs>
      <radialGradient id="engramFace" gradientUnits="userSpaceOnUse" cx="${f1(cx - 9)}" cy="${f1(cy - 11)}" r="${f1(r * 1.5)}">
        <stop offset="0%" stop-color="#fcfdff"/>
        <stop offset="26%" stop-color="#e2e9ef"/>
        <stop offset="58%" stop-color="#b4bfc9"/>
        <stop offset="82%" stop-color="#8a949f"/>
        <stop offset="100%" stop-color="#67717c"/>
      </radialGradient>
      <radialGradient id="engramRecess" gradientUnits="userSpaceOnUse" cx="${cx}" cy="${f1(cy + 8)}" r="${f1(r * 1.05)}">
        <stop offset="66%" stop-color="#2f353d" stop-opacity="0"/>
        <stop offset="100%" stop-color="#2f353d" stop-opacity="0.5"/>
      </radialGradient>
      <linearGradient id="engramSpec" gradientUnits="userSpaceOnUse" x1="${f1(cx - 24)}" y1="${f1(cy - 28)}" x2="${f1(cx + 4)}" y2="${f1(cy)}">
        <stop offset="0%" stop-color="#ffffff" stop-opacity="0.9"/>
        <stop offset="42%" stop-color="#ffffff" stop-opacity="0.16"/>
        <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
      </linearGradient>
      <linearGradient id="engramBezel" x1="0" y1="${top}" x2="0" y2="${bot}" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stop-color="#ffffff"/>
        <stop offset="42%" stop-color="#c2ccd6"/>
        <stop offset="72%" stop-color="#7c8792"/>
        <stop offset="100%" stop-color="#444d57"/>
      </linearGradient>
      <linearGradient id="engramBevel" x1="0" y1="${bot}" x2="0" y2="${top}" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stop-color="#ffffff" stop-opacity="0.72"/>
        <stop offset="46%" stop-color="#ffffff" stop-opacity="0"/>
        <stop offset="100%" stop-color="#2c333c" stop-opacity="0.5"/>
      </linearGradient>
      <clipPath id="engramClip"><circle cx="${cx}" cy="${cy}" r="${r}"/></clipPath>
      <filter id="engramShadow" x="-70%" y="-70%" width="240%" height="240%">
        <feDropShadow dx="0" dy="2" stdDeviation="2.8" flood-color="#000000" flood-opacity="0.45"/>
      </filter>
      <filter id="engramEmboss" x="-45%" y="-45%" width="190%" height="210%">
        <feDropShadow dx="0" dy="1.4" stdDeviation="1.3" flood-color="#39404a" flood-opacity="0.6"/>
      </filter>
    </defs>
    <g transform="translate(${cx} ${cy}) scale(${f1(Z)}) translate(${-cx} ${-cy})">
      <g filter="url(#engramShadow)"><circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#engramFace)"/></g>
      <g clip-path="url(#engramClip)">
        <circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#engramRecess)"/>
        <ellipse cx="${f1(cx - 8)}" cy="${f1(cy - 13)}" rx="25" ry="17" fill="url(#engramSpec)" transform="rotate(-30 ${f1(cx - 8)} ${f1(cy - 13)})"/>
      </g>
      <image href="${TORUS_LOGO}" x="${f1(cx - S / 2)}" y="${f1(cy - S / 2)}" width="${S}" height="${S}" preserveAspectRatio="xMidYMid meet" filter="url(#engramEmboss)"/>
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="url(#engramBezel)" stroke-width="3"/>
      <circle cx="${cx}" cy="${cy}" r="${f1(r - 1.6)}" fill="none" stroke="url(#engramBevel)" stroke-width="1.7"/>
      <circle cx="${cx}" cy="${cy}" r="${f1(r + 1.4)}" fill="none" stroke="#2b333d" stroke-width="1" stroke-opacity="0.55"/>
    </g>
    <text x="${cx}" y="${f1(cy - r * Z - 12)}" text-anchor="middle" class="logo-label">${escapeXML(n.label)}</text>
  </g>`;
  }
  if (n.kind === "triangle") {
    // prisoma: THE SUMMIT PRISM — the information prism recut as a HILL crowned by a
    // rising mirror BLADE (He-Man-on-the-summit). A stronger-violet 3-D hill fills the
    // lower triangle to its edges; from the hill crest a shining silver/glass sword
    // rises to the apex and SPLITS the prism in two. LEFT of the blade a couple of cool
    // input rays enter; RIGHT they disperse into many spectral rays (2-3 in -> many
    // out). Rays stream and the blade's mirror-glint sweeps up; glass + silver stay
    // theme-FIXED (a real object), only the label recolours. librsvg / reduced-motion
    // hold the complete summit still.
    const cx = n.x, cy = n.y, R = TRI_CIRCUM;
    const tri = (r) => {
      const dx = (r * Math.sqrt(3)) / 2;
      return `${f1(cx)},${f1(cy - r)} ${f1(cx + dx)},${f1(cy + r / 2)} ${f1(cx - dx)},${f1(cy + r / 2)}`;
    };
    const topY = f1(cy - R), botY = f1(cy + R / 2);
    // Offset-space geometry (origin = node centre). Edge param t: 0 = apex, 1 = base.
    const F = [0, -6];                                        // focal: blade foot / hill crest
    const lEdge = (t) => [f1(-45.9 * t), f1(-53 + 79.5 * t)]; // apex -> base-left
    const rEdge = (t) => [f1(45.9 * t), f1(-53 + 79.5 * t)];  // apex -> base-right
    // LEFT = few cool input rays (1-2 hues); RIGHT = many spectral output rays. Both
    // fans are held in the upper "sky" (t <= 0.58) so no ray dips below the hill crest.
    const LEFT = [[0.40, "#ddd6fe"], [0.49, "#c4b5fd"], [0.58, "#a5b4fc"]];
    const RIGHT = [[0.26, "#a5b4fc"], [0.31, "#818cf8"], [0.37, "#60a5fa"], [0.43, "#38bdf8"], [0.49, "#2dd4bf"], [0.54, "#c084fc"], [0.58, "#e879f9"]];
    // flow = dashoffset values: RIGHT rays stream OUTWARD (dispersing), LEFT rays
    // stream INWARD (incoming light converging on the prism) — opposite directions.
    const ray = (edgeFn, [t, color], i, dur, flow) => {
      const P = edgeFn(t);
      return `<line class="prz-ray" x1="${F[0]}" y1="${F[1]}" x2="${P[0]}" y2="${P[1]}" stroke="${color}"/>` +
        `<line class="prz-ray-flow" x1="${F[0]}" y1="${F[1]}" x2="${P[0]}" y2="${P[1]}" stroke="${color}" stroke-dashoffset="0"><animate attributeName="stroke-dashoffset" values="${flow}" dur="${dur}" begin="${f1(-i * 0.3)}s" repeatCount="indefinite"/></line>`;
    };
    const rightRays = RIGHT.map((r, i) => ray(rEdge, r, i, "2.6s", "0;-26")).join("\n        ");
    const leftRays = LEFT.map((r, i) => ray(lEdge, r, i, "3s", "0;26")).join("\n        ");
    // Hill: a 3-D mound whose crest is the strong "bended line"; clipped to the glass.
    const crest = "M -49,27 Q -24,-3 0,-4 Q 24,-3 49,27";
    const hill = "M -49,27 Q -24,-3 0,-4 Q 24,-3 49,27 L 56,62 L -56,62 Z";
    // Rising mirror blade (tapered, pointed at the apex; no crossguard rectangle).
    const blade = "M -2.3,-5 L -0.7,-45 L 0,-52 L 0.7,-45 L 2.3,-5 Z";
    return `<g>
    <defs>
      <linearGradient id="przGlass" x1="0" y1="${topY}" x2="0" y2="${botY}" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stop-color="#4c4370"/><stop offset="45%" stop-color="#262047"/><stop offset="100%" stop-color="#120e26"/>
      </linearGradient>
      <radialGradient id="przCore" gradientUnits="userSpaceOnUse" cx="${cx}" cy="${f1(cy - 26)}" r="32">
        <stop offset="0%" stop-color="#c4b5fd" stop-opacity="0.3"/><stop offset="55%" stop-color="#a78bfa" stop-opacity="0.1"/><stop offset="100%" stop-color="#a78bfa" stop-opacity="0"/>
      </radialGradient>
      <linearGradient id="przSheen" x1="${f1(cx - 46)}" y1="${topY}" x2="${f1(cx + 46)}" y2="${botY}" gradientUnits="userSpaceOnUse">
        <stop offset="0.3" stop-color="#ffffff" stop-opacity="0"/><stop offset="0.42" stop-color="#ffffff" stop-opacity="0.2"/><stop offset="0.52" stop-color="#ffffff" stop-opacity="0.03"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
      </linearGradient>
      <linearGradient id="przSilver" x1="0" y1="${topY}" x2="0" y2="${botY}" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stop-color="#f8fafc"/><stop offset="40%" stop-color="#c7d0da"/><stop offset="72%" stop-color="#8b96a3"/><stop offset="100%" stop-color="#525c66"/>
      </linearGradient>
      <linearGradient id="przHill" x1="0" y1="-6" x2="0" y2="27" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stop-color="#9f88e8"/><stop offset="42%" stop-color="#5f4ea8"/><stop offset="100%" stop-color="#211840"/>
      </linearGradient>
      <radialGradient id="przHillHi" cx="-7" cy="-1" r="27" gradientUnits="userSpaceOnUse">
        <animate attributeName="cx" values="-7;-23;16;-7" keyTimes="0;0.33;0.66;1" dur="8s" repeatCount="indefinite"/>
        <animate attributeName="cy" values="-1;-5;-4;-1" keyTimes="0;0.33;0.66;1" dur="8s" repeatCount="indefinite"/>
        <stop offset="0%" stop-color="#f1ecff" stop-opacity="0.85"/><stop offset="50%" stop-color="#a78bfa" stop-opacity="0.18"/><stop offset="100%" stop-color="#a78bfa" stop-opacity="0"/>
      </radialGradient>
      <radialGradient id="przHillAo" cx="0" cy="32" r="42" gradientUnits="userSpaceOnUse">
        <animate attributeName="cx" values="0;16;-11;0" keyTimes="0;0.33;0.66;1" dur="8s" repeatCount="indefinite"/>
        <stop offset="42%" stop-color="#120a24" stop-opacity="0"/><stop offset="100%" stop-color="#120a24" stop-opacity="0.92"/>
      </radialGradient>
      <radialGradient id="przSpill" cx="0" cy="-3" r="17" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stop-color="#f2ecff" stop-opacity="0.6"/><stop offset="55%" stop-color="#c4b5fd" stop-opacity="0.16"/><stop offset="100%" stop-color="#c4b5fd" stop-opacity="0"/>
      </radialGradient>
      <linearGradient id="przBlade" x1="-2.4" y1="0" x2="2.4" y2="0" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stop-color="#5a636d"/><stop offset="28%" stop-color="#e7ecf1"/><stop offset="50%" stop-color="#ffffff"/><stop offset="72%" stop-color="#c2ccd6"/><stop offset="100%" stop-color="#525c66"/>
      </linearGradient>
      <linearGradient id="przSky" x1="0" y1="${topY}" x2="0" y2="${f1(cy - 4)}" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stop-color="#0d0a20" stop-opacity="0.72"/><stop offset="42%" stop-color="#181233" stop-opacity="0.34"/><stop offset="100%" stop-color="#181233" stop-opacity="0"/>
      </linearGradient>
      <radialGradient id="przSkyGlow" gradientUnits="userSpaceOnUse" cx="${cx}" cy="${f1(cy - 10)}" r="30">
        <stop offset="0%" stop-color="#5b4c9e" stop-opacity="0.5"/><stop offset="60%" stop-color="#3a2f66" stop-opacity="0.14"/><stop offset="100%" stop-color="#3a2f66" stop-opacity="0"/>
      </radialGradient>
      <filter id="przShadow" x="-45%" y="-45%" width="190%" height="190%">
        <feDropShadow dx="0" dy="2.4" stdDeviation="4.2" flood-color="#000000" flood-opacity="0.5"/>
      </filter>
      <clipPath id="przClip"><polygon points="${tri(R)}"/></clipPath>
    </defs>
    <g filter="url(#przShadow)"><polygon points="${tri(R)}" class="prz-body"/></g>
    <g clip-path="url(#przClip)">
      <polygon points="${tri(R)}" fill="url(#przCore)"/>
      <polygon points="${tri(R)}" fill="url(#przSkyGlow)"/>
      <polygon points="${tri(R)}" fill="url(#przSky)"/>
      <polygon points="${tri(R)}" fill="url(#przSheen)"/>
      <g transform="translate(${cx},${cy})">
        <g filter="url(#edgeGlow)">
        ${leftRays}
        ${rightRays}
        </g>
        <path class="prz-hill" d="${hill}"/>
        <path class="prz-hill-hi" d="${hill}"/>
        <path class="prz-spill" d="${hill}"/>
        <path class="prz-hill-ao" d="${hill}"/>
        <g filter="url(#edgeGlow)"><path class="prz-crest" d="${crest}"/></g>
        <path class="prz-crest" d="${crest}"/>
        <path class="prz-blade" d="${blade}"/>
        <line class="prz-blade-core" x1="0" y1="-6" x2="0" y2="-51"/>
        <line class="prz-blade-glint" x1="0" y1="-6" x2="0" y2="-51" stroke-dashoffset="0"><animate attributeName="stroke-dashoffset" values="0;-49" dur="3.2s" repeatCount="indefinite"/></line>
        <circle class="prz-foot-hot" cx="0" cy="-6" r="2" filter="url(#mwBloom)"><animate attributeName="r" values="2;2;2.9;2.2;2" keyTimes="0;0.2;0.26;0.32;1" dur="3.2s" repeatCount="indefinite"/></circle>
      </g>
    </g>
    <polygon points="${tri(R)}" class="prz-edge" stroke-linejoin="round"/>
    <polygon points="${tri(R - 4.8)}" class="prz-groove" stroke-linejoin="round"/>
    <polygon points="${tri(R + 2.8)}" class="prz-hairline" stroke-linejoin="round"/>
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
    ${seat(n.x, n.y, "gate", ["#fde68a", "#fbbf24", "#92400e"])}
    <g filter="url(#soft)" transform="translate(${f1(n.x - 250)} ${f1(n.y - 230)})">
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
    <text x="${n.x}" y="${f1(n.y + 46)}" text-anchor="middle" class="gate-label">${escapeXML(n.label)}</text>
  </g>`;
  }
  if (n.kind === "voxel") {
    // cortexel: a VOXEL NEURAL NETWORK as a genuine 3-D cluster: three isometric
    // voxel-neurons both SIZED and dimmed by depth (the front-right neuron is
    // larger + fully opaque, the apex recedes, smaller + fainter), wired by
    // CALLIGRAPHIC connections: static, tapered pen-strokes that bow and fade into
    // the distance (no moving packets), echoing the script wordmark below and
    // distinct from the SVG's other live wired edges.
    const vw = 8, vbh = 7, rh = vw / 2;
    const T = { x: n.x,      y: n.y - 22, depth: 1.0 }; // farthest, up/back
    const L = { x: n.x - 17, y: n.y + 11, depth: 0.5 }; // mid
    const R = { x: n.x + 17, y: n.y + 11, depth: 0.0 }; // nearest, front
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
    // Civilian SIGNAL PROPAGATION: neurons fire in depth order (apex T -> L -> near R)
    // and a bright activation spark rides each connection between firings. Every
    // animated element rests at r0 / opacity0, so librsvg + reduced-motion hold the
    // clean static cluster. One 5s thought-pass, seamless loop. No red, no beams.
    const VOX = "5s";
    const fire = (c, p) => {
      const kt = `0;${f1(p - 0.08)};${f1(p)};${f1(p + 0.13)};1`;
      return `<circle cx="${f1(c.x)}" cy="${f1(c.y)}" r="0" fill="url(#voxFire)">` +
        `<animate attributeName="r" values="0;0;11;0;0" keyTimes="${kt}" dur="${VOX}" repeatCount="indefinite"/>` +
        `<animate attributeName="opacity" values="0;0;0.85;0;0" keyTimes="${kt}" dur="${VOX}" repeatCount="indefinite"/></circle>`;
    };
    const spark = (a, b, s, e) => {
      const m = f1((s + e) / 2);
      return `<circle r="1.8" fill="#fdf4ff" opacity="0">` +
        `<animate attributeName="opacity" values="0;0;1;1;0;0" keyTimes="0;${f1(s)};${f1(s + 0.02)};${f1(e - 0.02)};${f1(e)};1" dur="${VOX}" repeatCount="indefinite"/>` +
        `<animateMotion path="M${f1(a.x)} ${f1(a.y)} L${f1(b.x)} ${f1(b.y)}" keyPoints="0;0;1;1" keyTimes="0;${f1(s)};${f1(e)};1" calcMode="linear" dur="${VOX}" repeatCount="indefinite"/></circle>`;
    };
    const firing = `${fire(T, 0.12)}${fire(L, 0.42)}${fire(R, 0.7)}`;
    const sparks = `${spark(T, L, 0.16, 0.38)}${spark(T, R, 0.16, 0.38)}${spark(L, R, 0.46, 0.66)}`;
    return `<g class="vox-net">
    ${seat(n.x, n.y, "vox", ["#f5d0fe", "#e879f9", "#86198f"])}
    <defs>${grads.join("")}
      <radialGradient id="voxFire"><stop offset="0%" stop-color="#fbcfe8" stop-opacity="0.95"/><stop offset="45%" stop-color="#e879f9" stop-opacity="0.4"/><stop offset="100%" stop-color="#e879f9" stop-opacity="0"/></radialGradient>
    </defs>
    <g filter="url(#soft)">
      ${conns}
      ${cubeAt(T)} ${cubeAt(L)} ${cubeAt(R)}
    </g>
    <g class="vox-fire">${firing}${sparks}</g>
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
    const Z = 44 / 34; // scale the badge up to prisoma/melkor size (graph only)
    const word = n.label;                          // CSS upper-cases it
    const NN = word.length, CH = 9.7;              // 12px mono: 0.6em glyph + 2.5 track
    const Wt = NN * CH, leftX = cx - Wt / 2;        // ~centred typed line
    const SE = (S / 2) * Z;                          // scaled badge half-extent (wordmark sits below it)
    const baseY = cy + SE + 8, curY = cy + SE - 1, flagTop = cy + SE + 16;
    const pause = 0.5, step = 0.13, hold = 10, enterDur = 0.4, tail = 0.1;
    const typeDone = pause + NN * step, holdEnd = typeDone + hold, enterEnd = holdEnd + enterDur;
    const CYCLE = Number((enterEnd + tail).toFixed(2));
    const kt = (ts) => ts.map((t) => Number((t / CYCLE).toFixed(4))).join(";");
    const wt = [0, pause], wv = [0, 0];
    for (let i = 1; i <= NN; i++) { wt.push(Number((pause + i * step).toFixed(3))); wv.push(Number((i * CH).toFixed(2))); }
    wt.push(enterEnd, CYCLE); wv.push(0, 0);
    const xv = wv.map((v) => f1(leftX + v));
    const ot = [0, holdEnd, enterEnd, CYCLE], dur = `${CYCLE}s`;
    // The family machined GREEN seat, interleaved with the raster: disc → raven png
    // → a white-hot pinpoint drawn over the baked red eye (the family focal move) →
    // bezel/groove/signal-ring/hairline (they cross only the png's transparent gaps
    // and replace its muddy baked grey ring) → four green corner-bracket ticks (the
    // crosshair identity, kept). The r34 machining lands on the raven's own baked
    // reticle; the png (S=90) is byte-untouched, as is the typewriter wordmark.
    const ex = f1(cx - 1.9), ey = f1(cy - 12.1); // baked raven-eye centroid
    // crosshair reticle BAKED into the tactical-green border: four cardinal ticks
    // crossing the ring (a matte tactical scope).
    const sTick = (deg) => {
      const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
      return `<line class="creb-xhair" x1="${f1(cx + 30 * c)}" y1="${f1(cy + 30 * s)}" x2="${f1(cx + 38 * c)}" y2="${f1(cy + 38 * s)}"/>`;
    };
    return `<g>
    <defs>
      <linearGradient id="crebBezel" x1="0" y1="${f1(cy - 34)}" x2="0" y2="${f1(cy + 34)}" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stop-color="#8ba458"/><stop offset="50%" stop-color="#728a49"/><stop offset="100%" stop-color="#4f612e"/>
      </linearGradient>
      <clipPath id="crebainType" clipPathUnits="userSpaceOnUse">
        <rect x="${f1(leftX)}" y="${f1(baseY - 12)}" width="${f1(Wt)}" height="16">
          <animate attributeName="width" values="${wv.join(";")}" keyTimes="${kt(wt)}" dur="${dur}" calcMode="discrete" repeatCount="indefinite"/>
        </rect>
      </clipPath>
    </defs>
    <g transform="translate(${cx} ${cy}) scale(${f1(Z)}) translate(${-cx} ${-cy})">
      <g filter="url(#nodeShadow)"><circle cx="${cx}" cy="${cy}" r="34" class="seat-creb"/></g>
      <image href="${CREBAIN_LOGO}" x="${f1(cx - S / 2)}" y="${f1(cy - S / 2)}" width="${S}" height="${S}" preserveAspectRatio="xMidYMid meet"/>
      <g filter="url(#hdBloom)">
        <circle cx="${ex}" cy="${ey}" r="1.4" class="creb-eye-core"/>
        <circle cx="${ex}" cy="${ey}" r="0.55" class="creb-eye-hot"/>
      </g>
      ${sTick(0)}${sTick(90)}${sTick(180)}${sTick(270)}
      <circle cx="${cx}" cy="${cy}" r="34" class="seat-ring" stroke="url(#crebBezel)"/>
      <circle cx="${cx}" cy="${cy}" r="31.8" class="seat-groove"/>
      <circle cx="${cx}" cy="${cy}" r="32.5" class="creb-signal"/>
      <circle cx="${cx}" cy="${cy}" r="35.4" class="seat-hairline"/>
    </g>
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
    // The machined DOUBLE BORDER: a bright chrome inner ring concentric with the
    // outer bezel, broken at 12 o'clock by an index NOTCH (a lens-mount alignment
    // mark) — this replaces the old lock-on crosshair brackets.
    const NR = 30; // inner-ring radius — pulled close to the bezel (34) for a TIGHT
    // double border; the iris blades end near r27, safely inside it (no crossing).
    const gap = 8;   // notch half-angle (degrees) cut out of the inner ring at top
    const gA = rad(90 - gap), gB = rad(90 + gap); // top = -y, so 90deg is UP here via -sin
    const p = (ang, r) => `${f1(cx + r * Math.cos(ang))} ${f1(cy - r * Math.sin(ang))}`;
    const innerRing =
      `<path class="mw-inner" d="M${p(gA, NR)} A${NR} ${NR} 0 1 1 ${p(gB, NR)}"/>`;
    const notch =
      `<path class="mw-notch" d="M${p(gA, NR)} L${p(rad(90), NR - 3)} L${p(gB, NR)}"/>`;
    // Twelve fine index NOTCHES graduating the channel between the inner ring (30)
    // and the bezel (34) — a machined lens scale.
    const ticks = Array.from({ length: 12 }, (_, i) => {
      const A = rad(i * 30), ca = Math.cos(A), sa = Math.sin(A);
      return `<line class="mw-tick" x1="${f1(cx + 30.6 * ca)}" y1="${f1(cy + 30.6 * sa)}" x2="${f1(cx + 33.4 * ca)}" y2="${f1(cy + 33.4 * sa)}"/>`;
    }).join("");
    // Structured optic (galadriel/haldir grammar): a top-lit lens WELL, a controlled
    // blue core HALO (radial falloff, NO blur), a crisp quadcopter with an OPEN centre
    // gap, and a single WHITE-HOT hub pinpoint through a tight bloom — the sole
    // brightest point. No #soft wash. Amber caret = the one warm "locked" cue.
    const a = 4.9, gp = 1.2, rr = 2.2; // drone half-span · centre gap · rotor radius
    const drone =
      `<path class="mw-drone-arm" d="M${f1(cx-gp)} ${f1(cy-gp)} L${f1(cx-a)} ${f1(cy-a)}` +
        ` M${f1(cx+gp)} ${f1(cy-gp)} L${f1(cx+a)} ${f1(cy-a)}` +
        ` M${f1(cx-gp)} ${f1(cy+gp)} L${f1(cx-a)} ${f1(cy+a)}` +
        ` M${f1(cx+gp)} ${f1(cy+gp)} L${f1(cx+a)} ${f1(cy+a)}"/>` +
      [[-a,-a],[a,-a],[-a,a],[a,a]]
        .map(([rx,ry]) => `<circle class="mw-rotor" cx="${f1(cx+rx)}" cy="${f1(cy+ry)}" r="${rr}"/>`).join("");
    const lock =
      `<polyline class="mw-lock" points="${f1(cx-1.4)},${f1(cy-9.6)} ${cx},${f1(cy-8.2)} ${f1(cx+1.4)},${f1(cy-9.6)}"/>` +
      `<circle class="mw-lock-dot" cx="${cx}" cy="${f1(cy-9.9)}" r="0.6"/>`;
    // Browser-only REVEAL loop (10s): the drone APPEARS, then the red target caret
    // fades in, then the whole iris MECHANISM — blade partitions, dot disc, the
    // hexagonal aperture (well + rim) and the inner focus ring (its index notch
    // sweeping past the fixed tick scale) — spins one clockwise turn while the
    // drone, lock caret and core glow hold still; hold, reset, replay. Frozen /
    // reduced-motion base = the complete lit mark (opacity 1, 0deg rotation).
    const MWC = "10s";
    const droneFade = `<animate attributeName="opacity" values="0;0;1;1;0;0" keyTimes="0;0.04;0.13;0.9;0.98;1" dur="${MWC}" repeatCount="indefinite"/>`;
    const trigFade = `<animate attributeName="opacity" values="0;0;1;1;0;0" keyTimes="0;0.22;0.31;0.9;0.97;1" dur="${MWC}" repeatCount="indefinite"/>`;
    const bladeSpin = `<animateTransform attributeName="transform" type="rotate" values="0 ${cx} ${cy};0 ${cx} ${cy};360 ${cx} ${cy};360 ${cx} ${cy}" keyTimes="0;0.34;0.7;1" calcMode="spline" keySplines="0 0 1 1;0.45 0 0.55 1;0 0 1 1" dur="${MWC}" repeatCount="indefinite"/>`;
    return `<g>
    <defs>
      <radialGradient id="mwBarrel" gradientUnits="userSpaceOnUse" cx="${cx}" cy="${f1(cy - 6)}" r="40">
        <stop offset="0%" stop-color="#22384e"/><stop offset="60%" stop-color="#131f2e"/><stop offset="100%" stop-color="#0a1119"/>
      </radialGradient>
      <linearGradient id="mwBezel" x1="0" y1="${f1(cy - 34)}" x2="0" y2="${f1(cy + 34)}" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stop-color="#bae6fd"/><stop offset="45%" stop-color="#38bdf8"/><stop offset="100%" stop-color="#0c4a6e"/>
      </linearGradient>
      <radialGradient id="mwWell" gradientUnits="userSpaceOnUse" cx="${cx}" cy="${f1(cy - 4)}" r="13">
        <stop offset="0%" stop-color="#17324a"/><stop offset="60%" stop-color="#0b2035"/><stop offset="100%" stop-color="#050f1b"/>
      </radialGradient>
      <radialGradient id="mwCore" gradientUnits="userSpaceOnUse" cx="${cx}" cy="${cy}" r="6">
        <stop offset="0%" stop-color="#cfeafe" stop-opacity="0.7"/><stop offset="45%" stop-color="#38bdf8" stop-opacity="0.42"/><stop offset="100%" stop-color="#38bdf8" stop-opacity="0"/>
      </radialGradient>
      <pattern id="mwDots" width="5.5" height="5.5" patternUnits="userSpaceOnUse" patternTransform="translate(${f1(cx)} ${f1(cy)})">
        <circle cx="1.4" cy="1.4" r="0.5" class="mw-dot"/>
      </pattern>
    </defs>
    <g filter="url(#nodeShadow)"><circle cx="${cx}" cy="${cy}" r="${SEAT_R}" fill="url(#mwBarrel)"/></g>
    <circle cx="${cx}" cy="${cy}" r="${IR}" class="mw-iris"/>
    <g>${bladeSpin}<circle cx="${cx}" cy="${cy}" r="26.5" fill="url(#mwDots)"/></g>
    <g>${bladeSpin}<polygon points="${hexAp}" class="mw-well"/></g>
    <circle cx="${cx}" cy="${cy}" r="6" class="mw-core">
      <animate attributeName="opacity" values="1;0.82;1" dur="3.4s" repeatCount="indefinite"/>
    </circle>
    <g class="mw-drone" opacity="1">${droneFade}${drone}<circle cx="${cx}" cy="${cy}" r="1.4" class="mw-hub" filter="url(#mwBloom)"/></g>
    <g class="mw-trigger" opacity="1">${trigFade}${lock}</g>
    <g>${bladeSpin}<polygon points="${hexAp}" class="mw-aphex"/></g>
    <g class="mw-blades">${bladeSpin}${blades}</g>
    <g class="mw-focus">${bladeSpin}${innerRing}${notch}</g>${ticks}
    <circle cx="${cx}" cy="${cy}" r="${SEAT_R}" class="mw-ring"/>
    <circle cx="${cx}" cy="${cy}" r="31.8" class="mw-groove"/>
    <circle cx="${cx}" cy="${cy}" r="35.4" class="mw-hairline"/>
    <text x="${cx}" y="${f1(cy + 48)}" text-anchor="middle" class="radar-label">${escapeXML(n.label)}</text>
  </g>`;
  }
  if (n.kind === "sentinel") {
    // galadriel: its real brand mark in miniature — the SENTINEL SHIELD. An
    // angular chamfered crest whose visor slit carries a red scanning eye that
    // sweeps side to side (the watcher that looks for the channel that lies),
    // seated with clear air on a machined badge at manwe's border grade
    // (theme-FIXED): a GUNMETAL steel bezel matching the shield's armor — red
    // reads as plastic at bezel scale, so the project hue lives in a thin red
    // SIGNAL RING inlaid in the groove (grey armor, red light, like the eye).
    // FIBER-OPTIC sensor feeds below the visor: three light-guides in a
    // SYMMETRIC harness sweep up from connector ports at the shield's foot
    // and jack into the visor's underside, each carrying a cool light pulse
    // toward the eye — the sensor channels streaming into the watcher. Above
    // the visor, the ORIGINAL logo's top section (assets/galadriel-logo.svg
    // in the galadriel repo, same 240×240 coordinate space): the CROWN PANEL
    // and the crest ridge descending to the visor, on the original's TEAL-
    // rimmed navy plate. The light is cold white-blue so the red verdict
    // stays the eye's alone. Reduced-motion parks the eye centred and holds
    // a lit pulse at each port. One instance -> unique ids.
    const cx = n.x, cy = n.y, s = 0.23;
    const m = (px, py) => `${f1(cx + (px - 120) * s)} ${f1(cy + (py - 122) * s)}`;
    const poly = (pts) => `M${pts.map(([px, py]) => m(px, py)).join(" L")} Z`;
    const shield = poly([[36, 44], [68, 18], [172, 18], [204, 44], [204, 122], [188, 164], [120, 226], [52, 164], [36, 122]]);
    const slit = poly([[46, 89], [60, 76], [180, 76], [194, 89], [180, 102], [60, 102]]);
    // Fiber runs (real-px offsets from the node centre; visor slit bottom
    // sits at −4.6). Ports sit at the shield's LOWER CORNERS + bottom point
    // (echoing its taper); jacks SPREAD across the visor's width; each fibre
    // is one monotonic inward sweep that leaves its port and enters the
    // visor vertically — plugged in, no outward wander.
    const p = (x, y) => `${f1(cx + x)} ${f1(cy + y)}`;
    const FIBERS = [
      { d: `M${p(-10.5, 9.5)} C${p(-10.5, 4)} ${p(-7.5, 1)} ${p(-7.5, -4.2)}`, port: [-10.5, 9.5], jack: [-7.5, -4.2], beg: "0.9s" },
      { d: `M${p(0, 18.5)} C${p(0, 11)} ${p(0, 3)} ${p(0, -4.2)}`, port: [0, 18.5], jack: [0, -4.2], beg: "0s" },
      { d: `M${p(10.5, 9.5)} C${p(10.5, 4)} ${p(7.5, 1)} ${p(7.5, -4.2)}`, port: [10.5, 9.5], jack: [7.5, -4.2], beg: "0.9s" },
    ];
    const circuit = FIBERS.map(({ d, port, jack, beg }) =>
      `<path class="gal-fiber" d="${d}"/>` +
      `<path class="gal-pulse" d="${d}"><animate attributeName="stroke-dashoffset" from="43" to="0" dur="2.6s" begin="${beg}" repeatCount="indefinite"/></path>` +
      `<circle class="gal-port" cx="${f1(cx + port[0])}" cy="${f1(cy + port[1])}" r="1.4"/>` +
      `<circle class="gal-jack" cx="${f1(cx + jack[0])}" cy="${f1(cy + jack[1])}" r="0.9"/>`
    ).join("");
    const crown =
      `<path d="${poly([[44, 48], [71, 26], [169, 26], [196, 48], [196, 70], [44, 70]])}" fill="url(#galCrownG)" opacity="0.65"/>` +
      `<path d="${poly([[112, 18], [128, 18], [124, 74], [116, 74]])}" fill="url(#galCrownG)" opacity="0.9" class="gal-crest"/>`;
    const [ex, ey] = [cx + (120 - 120) * s, cy + (89 - 122) * s];
    const amp = f1(42 * s);
    return `<g class="gal">
    ${seat(cx, cy, "gal", ["#e8eef4", "#8d99a6", "#2b3542"])}
    <circle cx="${cx}" cy="${cy}" r="${f1(SEAT_R - 2.2)}" class="gal-signal"/>
    <defs>
      <radialGradient id="galEye" gradientUnits="userSpaceOnUse" cx="${f1(ex)}" cy="${f1(ey)}" r="8">
        <stop offset="0%" stop-color="#ff6b5e" stop-opacity="0.9"/>
        <stop offset="55%" stop-color="#ef4444" stop-opacity="0.45"/>
        <stop offset="100%" stop-color="#ef4444" stop-opacity="0"/>
      </radialGradient>
      <linearGradient id="galPlateG" x1="0" y1="${f1(cy - 23.9)}" x2="0" y2="${f1(cy + 23.9)}" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stop-color="#10202f"/><stop offset="45%" stop-color="#0a1420"/><stop offset="100%" stop-color="#050a11"/>
      </linearGradient>
      <linearGradient id="galCrownG" x1="0" y1="${f1(cy - 22.1)}" x2="0" y2="${f1(cy - 12)}" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stop-color="#2a3a4d"/><stop offset="100%" stop-color="#101a26"/>
      </linearGradient>
      <clipPath id="galSlit" clipPathUnits="userSpaceOnUse"><path d="${slit}"/></clipPath>
    </defs>
    <path d="${shield}" class="gal-plate"/>
    ${crown}
    ${circuit}
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
  if (n.kind === "haldir") {
    // haldir: THE METROPOLIS PORTAL — the fail-closed authorization reference
    // monitor as a NEO-DECO cyber GATE. A teal art-deco stepped-ziggurat skyscraper
    // portal (fluted pilaster jambs stepping inward through 3 setbacks to a stepped
    // keystone crown, a corbelled FLAT void ceiling — deliberately un-medieval)
    // seals its near-black void with a RED laser LATTICE: 4 horizontal ward beams
    // woven with 2 vertical ties, 8 lit emitter diodes marching up both jambs, and
    // a faceted red emitter CORE crowned by an art-deco sunburst. Default-DENY: the
    // lattice stands fully drawn and SHUT. Red like galadriel's visor, but distinct
    // by SHAPE (an OPEN portal + laser grid, not a solid shield + one eye) and by
    // TEAL frame; and un-NCP (a VERTICAL teal archway, not an amber horizontal
    // transport gate). Motion (browser-only) runs one authorization cycle — charge,
    // scan, admit ONE (the lattice unweaves bilaterally into its diodes, opening a
    // single corridor), stamp/re-originate, emit a re-minted command, then SNAP
    // SHUT: red light races from both jamb diodes to re-weave the lattice on a
    // shared contact keyTime (the wow beat). librsvg + reduced-motion hold the shut,
    // lit still — every beam dashoffset 0 and every token opacity 0. Unique hd- ids.
    const cx = n.x, cy = n.y;
    const A = (dx, dy) => `${f1(cx + dx)} ${f1(cy + dy)}`;   // "x y" for paths
    const P = (dx, dy) => `${f1(cx + dx)},${f1(cy + dy)}`;   // "x,y" for polygons
    // Browser-only motion (librsvg + reduced-motion freeze t=0). One 5s authorization
    // cycle. The dashoffset SPINE is the hero: each half-beam draws OFF into its diode
    // to open one corridor (admit-one), then races back ON — light originating from
    // both jambs — to re-weave the lattice on the shared contact keyTime 0.76 (slam),
    // with a -1.5 overshoot keyframe faking spring mass. Base dashoffset 0 (shut) IS
    // both the loop endpoint and the frozen still, so the loop is seamless.
    const CYC = "5s";
    const dashKT = "0;0.3;0.42;0.7;0.76;0.8;1";
    const dashKS = "0.4 0 0.2 1;0.3 0 0.2 1;0.5 0 1 1;0.2 0 0 1;0.3 0 0.4 1;0 0 1 1";
    const beamAnim = (h) =>
      `<animate attributeName="stroke-dashoffset" values="0;0;${h};${h};-1.5;0;0" keyTimes="${dashKT}" calcMode="spline" keySplines="${dashKS}" dur="${CYC}" repeatCount="indefinite"/>`;
    // L1 near-black void (corbelled stepped opening); L2 frame subtracts it (evenodd)
    const voidPath =
      `M${A(9.5,18)} L${A(9.5,6)} L${A(7,6)} L${A(7,-5)} L${A(5,-5)} L${A(5,-14)} L${A(3,-15.5)} L${A(0,-15.5)} ` +
      `L${A(-3,-15.5)} L${A(-5,-14)} L${A(-5,-5)} L${A(-7,-5)} L${A(-7,6)} L${A(-9.5,6)} L${A(-9.5,18)} Z`;
    const frameOuter =
      `M${A(18,22)} L${A(18,7)} L${A(14.5,7)} L${A(14.5,-4)} L${A(11,-4)} L${A(11,-14)} L${A(7,-14)} L${A(7,-19)} L${A(4.5,-19)} L${A(4.5,-24)} L${A(2.5,-24)} L${A(2.5,-27)} ` +
      `L${A(-2.5,-27)} L${A(-2.5,-24)} L${A(-4.5,-24)} L${A(-4.5,-19)} L${A(-7,-19)} L${A(-7,-14)} L${A(-11,-14)} L${A(-11,-4)} L${A(-14.5,-4)} L${A(-14.5,7)} L${A(-18,7)} L${A(-18,22)} Z`;
    // L3 deco reeding / fluting on the jambs
    const reeds = [13, 16].flatMap((x) => [
      `<path class="hd-reed" d="M${A(x,17)} L${A(x,-3)}"/>`,
      `<path class="hd-reed" d="M${A(-x,17)} L${A(-x,-3)}"/>`,
    ]).join("");
    // L4 sill plinth + streamline speed-reeds + threshold hairline
    const plinth = `<path class="hd-frame" d="M${A(-18,18)} L${A(18,18)} L${A(18,22)} L${A(-18,22)} Z"/>`;
    const speed = [19, 20.2, 21.4].map((y) => `<path class="hd-speed" d="M${A(-16,y)} H${f1(cx+16)}"/>`).join("");
    const thresh = `<path class="hd-thresh" d="M${A(-18,18)} H${f1(cx+18)}"/>`;
    // L5 RED laser lattice: 4 horizontal wards (split into 8 half-beams) woven with
    // 2 vertical ties (split into 4). Each half-beam authored FROM its emitter end so
    // stroke-dashoffset draws it OFF into the diode; dasharray = its own length.
    const HB = [[13, 9], [6, 8.5], [-2, 6.5], [-9, 4.5]]; // [dy, half-length]
    const hbeams = HB.flatMap(([y, h]) => [
      `<path class="hd-beam" d="M${A(h,y)} L${A(0,y)}" stroke-dasharray="${h} 40" stroke-dashoffset="0">${beamAnim(h)}</path>`,
      `<path class="hd-beam" d="M${A(-h,y)} L${A(0,y)}" stroke-dasharray="${h} 40" stroke-dashoffset="0">${beamAnim(h)}</path>`,
    ]).join("");
    const vbeams = [3.5, -3.5].flatMap((x) => [
      `<path class="hd-beam" d="M${A(x,-13)} L${A(x,2)}" stroke-dasharray="15 40" stroke-dashoffset="0">${beamAnim(15)}</path>`,
      `<path class="hd-beam" d="M${A(x,17)} L${A(x,2)}" stroke-dasharray="15 40" stroke-dashoffset="0">${beamAnim(15)}</path>`,
    ]).join("");
    // L6 emitter diodes (8, up both jambs)
    const DIO = [[9, 13], [8.5, 6], [6.5, -2], [4.5, -9]];
    const diodes = DIO.flatMap(([x, y]) => [x, -x].map((sx) =>
      `<circle class="hd-diode" cx="${f1(cx+sx)}" cy="${f1(cy+y)}" r="1.5"/><circle class="hd-diode-hot" cx="${f1(cx+sx)}" cy="${f1(cy+y)}" r="0.7"/>`)).join("");
    // L7 emitter CORE + art-deco sunburst up-fan (crown)
    const sun = [[0, -24], [-2.6, -23.4], [2.6, -23.4], [-4.4, -22], [4.4, -22]]
      .map(([x, y]) => `<path class="hd-sun" d="M${A(0,-19)} L${A(x,y)}"/>`).join("");
    const core =
      `<polygon class="hd-core" points="${P(0,-21)} ${P(2.6,-19.7)} ${P(2.6,-17.3)} ${P(0,-16)} ${P(-2.6,-17.3)} ${P(-2.6,-19.7)}"/>` +
      `<polygon class="hd-core-facet" points="${P(0,-21)} ${P(2.6,-19.7)} ${P(0,-18.5)} ${P(-2.6,-19.7)}"/>` +
      `<circle class="hd-core-hot" cx="${cx}" cy="${f1(cy-18.5)}" r="0.9">` +
        `<animate attributeName="r" values="0.9;0.9;2.6;0.9;0.9" keyTimes="0;0.52;0.56;0.62;1" dur="${CYC}" repeatCount="indefinite"/></circle>`;
    // idle+charge hum on the whole lit lattice; core-halo breathe then stamp-expand.
    const litHum = `<animate attributeName="opacity" values="0.9;0.9;1;0.92;0.92" keyTimes="0;0.06;0.16;0.3;1" dur="${CYC}" repeatCount="indefinite"/>`;
    const coreGlowAnim = `<animate attributeName="r" values="7;7;7;11;7;7" keyTimes="0;0.06;0.52;0.56;0.6;1" dur="${CYC}" repeatCount="indefinite"/>`;
    // Motion tokens — every one authored opacity/r 0 at t=0 so they are ABSENT from the
    // frozen frame: scan bar (challenge), intake chevron (the signed intent, consumed),
    // re-minted hex-seal (a visibly different, brighter command exiting the apex), and
    // the full-void discharge disc that fires on the snap-shut contact keyTime.
    const scan = `<rect class="hd-scan" x="${f1(cx-9)}" y="${f1(cy-14)}" width="18" height="1.3" opacity="0">` +
      `<animate attributeName="opacity" values="0;0;0.85;0;0" keyTimes="0;0.16;0.23;0.3;1" dur="${CYC}" repeatCount="indefinite"/>` +
      `<animateTransform attributeName="transform" type="translate" values="0 0;0 0;0 30;0 30" keyTimes="0;0.16;0.3;1" calcMode="spline" keySplines="0 0 1 1;0.4 0 0.6 1;0 0 1 1" dur="${CYC}" repeatCount="indefinite"/></rect>`;
    const tokIn = `<polygon class="hd-tok-in" opacity="0" points="${P(0,15)} ${P(2.6,17.4)} ${P(0,19.8)} ${P(-2.6,17.4)}">` +
      `<animate attributeName="opacity" values="0;0;1;1;0;0" keyTimes="0;0.16;0.24;0.48;0.52;1" dur="${CYC}" repeatCount="indefinite"/>` +
      `<animateTransform attributeName="transform" type="translate" values="0 0;0 0;0 -34;0 -34;0 -34" keyTimes="0;0.3;0.52;0.6;1" dur="${CYC}" repeatCount="indefinite"/></polygon>`;
    const tokOut = `<polygon class="hd-tok-out" opacity="0" points="${P(0,-20.5)} ${P(2,-19.3)} ${P(2,-17)} ${P(0,-15.8)} ${P(-2,-17)} ${P(-2,-19.3)}">` +
      `<animate attributeName="opacity" values="0;0;1;0;0" keyTimes="0;0.6;0.65;0.7;1" dur="${CYC}" repeatCount="indefinite"/>` +
      `<animateTransform attributeName="transform" type="translate" values="0 0;0 0;0 -9;0 -9" keyTimes="0;0.6;0.7;1" dur="${CYC}" repeatCount="indefinite"/></polygon>`;
    const flash = `<circle class="hd-flash" cx="${cx}" cy="${f1(cy+2)}" r="0" opacity="0">` +
      `<animate attributeName="r" values="0;0;7;0;0" keyTimes="0;0.72;0.76;0.8;1" dur="${CYC}" repeatCount="indefinite"/>` +
      `<animate attributeName="opacity" values="0;0;0.95;0;0" keyTimes="0;0.72;0.76;0.8;1" dur="${CYC}" repeatCount="indefinite"/></circle>`;
    return `<g>
    <defs>
      <linearGradient id="haldirArch" x1="0" y1="${f1(cy-27)}" x2="0" y2="${f1(cy+22)}" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stop-color="#99f6e4"/><stop offset="50%" stop-color="#2dd4bf"/><stop offset="100%" stop-color="#0f766e"/>
      </linearGradient>
      <radialGradient id="hdCoreGlow" gradientUnits="userSpaceOnUse" cx="${cx}" cy="${f1(cy-18.5)}" r="7">
        <stop offset="0%" stop-color="#ff6b5e" stop-opacity="0.9"/><stop offset="55%" stop-color="#ef4444" stop-opacity="0.4"/><stop offset="100%" stop-color="#ef4444" stop-opacity="0"/>
      </radialGradient>
    </defs>
    ${seat(cx, cy, "hd", ["#99f6e4", "#2dd4bf", "#0f766e"])}
    <path class="hd-void" d="${voidPath}"/>
    <path class="hd-frame" d="${frameOuter} ${voidPath}" fill-rule="evenodd"/>
    ${reeds}
    ${plinth}
    ${speed}
    ${thresh}
    <circle class="hd-coreglow" cx="${cx}" cy="${f1(cy-18.5)}" r="7">${coreGlowAnim}</circle>
    <g class="hd-lit" filter="url(#hdBloom)">
      ${litHum}${hbeams}${vbeams}${diodes}${sun}${core}
    </g>
    ${scan}${tokIn}${tokOut}${flash}
    <text x="${cx}" y="${f1(cy-46)}" text-anchor="middle" class="haldir-label">${escapeXML(n.label)}</text>
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
}
const nodeEls = Object.values(nodes).map(nodeMark);

// ---------------------------------------------------------------------------
// Frame: a "provenance instrument": four amber corner brackets, all in NCP's
// amber (the connective protocol literally framing the work it connects).
// ---------------------------------------------------------------------------
const frame = `<g class="frame">
    <line x1="27" y1="11" x2="833" y2="11" class="wg-rule"/>
    <path d="M 37 11 H 27 A 16 16 0 0 0 11 27 V 37" class="wg-bracket"/>
    <path d="M 823 11 H 833 A 16 16 0 0 1 849 27 V 37" class="wg-bracket"/>
    <path d="M 849 ${H - 37} V ${H - 27} A 16 16 0 0 1 833 ${H - 11} H 823" class="wg-bracket"/>
    <path d="M 37 ${H - 11} H 27 A 16 16 0 0 1 11 ${H - 27} V ${H - 37}" class="wg-bracket"/>
  </g>`;

// ---------------------------------------------------------------------------
// Assemble.
// ---------------------------------------------------------------------------
const aria =
  "Project graph: engram, the neural-modeling hub, and crebain, the multi-UAV simulation and airspace-awareness testbed, connect through the always-on, two-way NCP protocol to prisoma, a private hub; pid-rs, cobot-atlas, melkor and relief-atlas connect to prisoma; cobot-atlas, melkor and relief-atlas also connect to crebain, as does manwe, the drone-detection eye feeding crebain; cortexel connects to engram; galadriel, a public cross-sensor statistical-consistency monitor, connects to crebain and pid-rs; haldir, the fail-closed authorization gate that admits a signed controller intent and re-originates the plant command under its own key, connects to NCP, galadriel and prisoma.";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${escapeXML(aria)}">
  <defs>
    <radialGradient id="hubGrad" cx="50%" cy="42%" r="65%">
      <stop offset="0%" stop-color="#06281d"/>
      <stop offset="100%" stop-color="#0a1117"/>
    </radialGradient>
    <radialGradient id="gateGrad" cx="50%" cy="40%" r="68%">
      <stop offset="0%" stop-color="#332408"/>
      <stop offset="100%" stop-color="#10131a"/>
    </radialGradient>
    <radialGradient id="voxGrad" cx="50%" cy="40%" r="68%">
      <stop offset="0%" stop-color="#2a0a2e"/>
      <stop offset="100%" stop-color="#10131a"/>
    </radialGradient>
    <radialGradient id="galGrad" cx="50%" cy="40%" r="68%">
      <stop offset="0%" stop-color="#2a0a0a"/>
      <stop offset="100%" stop-color="#10131a"/>
    </radialGradient>
    <radialGradient id="hdGrad" cx="50%" cy="40%" r="68%">
      <stop offset="0%" stop-color="#042f2a"/>
      <stop offset="100%" stop-color="#10131a"/>
    </radialGradient>
    <radialGradient id="crebGrad" cx="50%" cy="40%" r="70%">
      <stop offset="0%" stop-color="#293716"/>
      <stop offset="62%" stop-color="#19230f"/>
      <stop offset="100%" stop-color="#0d1208"/>
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
    <filter id="hdBloom" x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur stdDeviation="1.5" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <filter id="mwBloom" x="-300%" y="-300%" width="700%" height="700%">
      <feGaussianBlur stdDeviation="1.4" result="b"/>
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
    .hub-ring   { fill: none; stroke: url(#hubBezel); stroke-width: 2.2; }
    .hub-glow   { fill: none; stroke: #34d399; stroke-width: 6; stroke-opacity: 0.18; filter: url(#soft); }
    .hub-label  { font: 400 12px ui-monospace, SFMono-Regular, Menlo, monospace; fill: #6ee7b7; }
    .pidx-rail   { fill: none; stroke: #021a12; stroke-opacity: 0.9; stroke-width: 1.3; stroke-linecap: round; }
    .pidx-rail-lt{ fill: none; stroke: #34d399; stroke-opacity: 0.18; stroke-width: 1.3; stroke-linecap: round; }
    .pidx-tick   { fill: none; stroke: #047857; stroke-opacity: 0.9; stroke-width: 0.9; stroke-linecap: round; }
    .pidx-inner  { fill: none; stroke: #10b981; stroke-opacity: 0.14; stroke-width: 0.6; }
    .pidx-chan   { fill: none; stroke: #032018; stroke-width: 2.2; stroke-linecap: round; }
    .pidx-chan-lt{ fill: none; stroke: #6ee7b7; stroke-width: 0.8; stroke-linecap: round; }
    .pidx-chamfer{ fill: none; stroke: #05070b; stroke-opacity: 0.55; stroke-width: 1; }
    .pidx-rim    { fill: none; stroke: url(#pidXRim); stroke-width: 1.1; }
    .pidx-lip    { fill: none; stroke: #6ee7b7; stroke-opacity: 0.16; stroke-width: 0.5; }
    .pidx-shade  { fill: #031710; }
    .pidx-flare  { fill: #d1fae5; }
    .pidx-flare-s{ fill: #ecfdf5; }
    .pidx-syn-ring { fill: none; stroke: #a7f3d0; stroke-width: 1; }
    .pidx-girdle { fill: none; stroke: #a7f3d0; stroke-opacity: 0.55; stroke-width: 0.4; }
    .pidx-girdle-s { fill: none; stroke: #d1fae5; stroke-opacity: 0.7; stroke-width: 0.5; }
    .pidx-glint  { fill: #ecfdf5; fill-opacity: 0.7; }
    .pidx-fU-l   { fill: #6ee7b7; }
    .pidx-fU-d   { fill: #10b981; }
    .pidx-jw-edge{ fill: none; stroke: #a7f3d0; stroke-width: 0.4; stroke-opacity: 0.85; stroke-linejoin: round; }
    .pidx-syn-hot{ fill: #ecfdf5; }
    .pidx-spark-head { fill: #ecfdf5; }
    .pidx-spark-tail { fill: none; stroke: #a7f3d0; stroke-width: 1.1; stroke-linecap: round; stroke-opacity: 0.85; }
    .pid-wg      { fill: none; stroke: #043a2e; stroke-width: 2.4; stroke-linecap: round; }
    .pid-wg-lit  { fill: none; stroke: #6ee7b7; stroke-width: 0.9; stroke-linecap: round; }
    .pid-port    { fill: #34d399; }
    .pid-port-core { fill: #06281d; }
    .pid-chip    { fill: #d1fae5; }
    .pid-core-crown { fill: #6ee7b7; }
    .pid-core-bl { fill: #065f46; }
    .pid-core-br { fill: #047857; }
    .pid-core-edge { fill: none; stroke: #a7f3d0; stroke-width: 0.8; stroke-linejoin: round; }
    .pid-seam    { fill: none; stroke: #d1fae5; stroke-width: 0.7; stroke-opacity: 0.9; stroke-linecap: round; }
    .pid-facet   { fill: none; stroke: #a7f3d0; stroke-width: 0.5; stroke-opacity: 0.35; }
    .pid-hot     { fill: #ecfdf5; }
    .pid-hot-in  { fill: #f0fdf4; }
    .pid-compute { fill: none; stroke: #6ee7b7; stroke-width: 1; opacity: 0; }
    .seat-ring     { fill: none; stroke-width: 2.2; }
    .seat-groove   { fill: none; stroke: #05070b; stroke-opacity: 0.5; stroke-width: 1; }
    .seat-hairline { fill: none; stroke: #2b333d; stroke-opacity: 0.55; stroke-width: 1; }
    .seat-gate     { fill: url(#gateGrad); }
    .seat-vox      { fill: url(#voxGrad); }
    .mel-plate    { fill: url(#melPlate); }
    .mel-rock     { fill: url(#melRock); }
    .mel-fog-g    { opacity: 0.42; }
    .mel-ridge    { fill: none; stroke: #fdba74; stroke-opacity: 0.7; stroke-width: 1.3; stroke-linejoin: round; stroke-linecap: round; }
    .mel-facet    { fill: #1a0e08; }
    .mel-tin      { stroke: #000000; stroke-opacity: 0.35; stroke-width: 0.6; stroke-linejoin: round; }
    .mel-front    { fill: #ffedd5; filter: url(#edgeGlow); }
    .mel-edge     { fill: none; stroke: url(#melBezel); stroke-width: 2.4; stroke-linejoin: miter; }
    .mel-groove   { fill: none; stroke: #05070b; stroke-opacity: 0.5; stroke-width: 1; }
    .mel-hairline { fill: none; stroke: #2b333d; stroke-opacity: 0.55; stroke-width: 1; }
    .cube-label { font: 400 12px ui-monospace, SFMono-Regular, Menlo, monospace; fill: #fdba74; }
    .logo-label     { font: 400 12px ui-monospace, SFMono-Regular, Menlo, monospace; fill: #cdd6e0; }
    .prz-body     { fill: url(#przGlass); }
    .prz-edge     { fill: none; stroke: url(#przSilver); stroke-width: 2.4; }
    .prz-groove   { fill: none; stroke: #05070b; stroke-opacity: 0.5; stroke-width: 1; }
    .prz-hairline { fill: none; stroke: #2b333d; stroke-opacity: 0.55; stroke-width: 1; }
    .prz-hill     { fill: url(#przHill); }
    .prz-hill-hi  { fill: url(#przHillHi); }
    .prz-hill-ao  { fill: url(#przHillAo); }
    .prz-spill    { fill: url(#przSpill); }
    .prz-crest    { fill: none; stroke: #d8ccff; stroke-width: 1.8; stroke-linecap: round; stroke-opacity: 0.95; }
    .prz-ray      { fill: none; stroke-width: 1.4; stroke-linecap: round; stroke-opacity: 0.5; }
    .prz-ray-flow { fill: none; stroke-width: 1.9; stroke-linecap: round; stroke-dasharray: 4 22; stroke-opacity: 0.92; }
    .prz-blade    { fill: url(#przBlade); stroke: #cbd3db; stroke-width: 0.4; stroke-linejoin: round; }
    .prz-blade-core { stroke: #f8fafc; stroke-width: 0.8; stroke-linecap: round; stroke-opacity: 0.85; }
    .prz-blade-glint { stroke: #ffffff; stroke-width: 1.3; stroke-linecap: round; stroke-dasharray: 5 44; stroke-opacity: 0.95; }
    .prz-foot-hot { fill: #ffffff; }
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
    .seat-creb     { fill: url(#crebGrad); }
    .creb-signal   { fill: none; stroke: #b6cf86; stroke-opacity: 0.7; stroke-width: 1.2; }
    .creb-xhair    { fill: none; stroke: #a8c07a; stroke-opacity: 0.7; stroke-width: 1.3; stroke-linecap: round; }
    .creb-eye-core { fill: #ff6b5e; }
    .creb-eye-hot  { fill: #fff1f0; }
    .raven-label { font: 400 12px ui-monospace, SFMono-Regular, Menlo, monospace; fill: #9caf88; }
    .raven-cursor { fill: #9caf88; }
    .radar-label  { font: 400 12px ui-monospace, SFMono-Regular, Menlo, monospace; fill: #38bdf8; }
    .mw-iris      { fill: #101a26; stroke: #38bdf8; stroke-opacity: 0.25; stroke-width: 1; }
    .mw-well      { fill: url(#mwWell); }
    .mw-core      { fill: url(#mwCore); }
    .mw-aphex     { fill: none; stroke: #e0f2fe; stroke-opacity: 0.45; stroke-width: 0.8; stroke-linejoin: round; }
    .mw-blade     { fill: none; stroke: #7dd3fc; stroke-opacity: 0.55; stroke-width: 1.2; }
    .mw-blade-sh  { fill: none; stroke: #05070b; stroke-opacity: 0.7; stroke-width: 1.2; }
    .mw-inner     { fill: none; stroke: url(#mwBezel); stroke-width: 1.6; stroke-opacity: 0.9; stroke-linecap: round; }
    .mw-notch     { fill: none; stroke: #bae6fd; stroke-width: 1.4; stroke-linejoin: round; stroke-linecap: round; }
    .mw-tick      { stroke: #38bdf8; stroke-opacity: 0.4; stroke-width: 1; }
    .mw-dot       { fill: #7dd3fc; fill-opacity: 0.16; }
    .mw-lock      { fill: none; stroke: #ef4444; stroke-width: 1.2; stroke-linecap: round; stroke-linejoin: round; }
    .mw-lock-dot  { fill: #ff6b5e; }
    .mw-drone-arm { fill: none; stroke: #7dd3fc; stroke-width: 1.4; stroke-linecap: round; }
    .mw-rotor     { fill: #12283b; stroke: #7dd3fc; stroke-width: 1.2; }
    .mw-hub       { fill: #f0f9ff; }
    .mw-ring      { fill: none; stroke: url(#mwBezel); stroke-width: 2.2; }
    .mw-groove    { fill: none; stroke: #05070b; stroke-opacity: 0.5; stroke-width: 1; }
    .mw-hairline  { fill: none; stroke: #2b333d; stroke-opacity: 0.55; stroke-width: 1; }
    .seat-gal   { fill: url(#galGrad); }
    .gal-signal { fill: none; stroke: #ef4444; stroke-opacity: 0.7; stroke-width: 1.1; }
    .gal-fiber  { fill: none; stroke: #22d3ee; stroke-opacity: 0.75; stroke-width: 1.4; stroke-linecap: round; }
    .gal-pulse  { fill: none; stroke: #a5f3fc; stroke-opacity: 0.95; stroke-width: 1.4; stroke-linecap: round; stroke-dasharray: 3 40; }
    .gal-port   { fill: #0a121c; stroke: #22d3ee; stroke-opacity: 0.9; stroke-width: 1; }
    .gal-jack   { fill: #a5f3fc; fill-opacity: 0.85; }
    .gal-plate  { fill: url(#galPlateG); stroke: #22d3ee; stroke-opacity: 0.9; stroke-width: 1.2; stroke-linejoin: miter; }
    .gal-crest  { stroke: #22d3ee; stroke-opacity: 0.28; stroke-width: 0.6; stroke-linejoin: miter; }
    .gal-slit   { fill: #05070b; stroke: #22d3ee; stroke-opacity: 0.55; stroke-width: 0.8; stroke-linejoin: miter; }
    .gal-hotf   { fill: #ef4444; }
    .gal-label  { font: 400 12px ui-monospace, SFMono-Regular, Menlo, monospace; fill: #ef4444; }
    .seat-hd         { fill: url(#hdGrad); }
    .hd-void         { fill: #03211d; }
    .hd-frame        { fill: url(#haldirArch); stroke: #0f766e; stroke-width: 0.5; stroke-opacity: 0.7; }
    .hd-reed         { fill: none; stroke: #0f766e; stroke-width: 0.6; stroke-opacity: 0.5; stroke-linecap: round; }
    .hd-speed        { fill: none; stroke: #5eead4; stroke-width: 0.6; stroke-opacity: 0.4; stroke-linecap: round; }
    .hd-thresh       { fill: none; stroke: #2dd4bf; stroke-width: 1.6; stroke-linecap: round; stroke-opacity: 0.85; }
    .hd-beam         { fill: none; stroke: #ef4444; stroke-width: 1.4; stroke-linecap: round; stroke-opacity: 0.92; }
    .hd-diode        { fill: #ff3b47; }
    .hd-diode-hot    { fill: #ffe1dd; }
    .hd-core         { fill: #ef4444; }
    .hd-core-facet   { fill: #ff9d94; fill-opacity: 0.95; }
    .hd-core-hot     { fill: #fff1f0; }
    .hd-coreglow     { fill: url(#hdCoreGlow); }
    .hd-sun          { fill: none; stroke: #ff6b5e; stroke-width: 0.8; stroke-opacity: 0.85; stroke-linecap: round; }
    .hd-scan         { fill: #ffd9d4; }
    .hd-tok-in       { fill: #ff6b5e; }
    .hd-tok-out      { fill: #fff1f0; }
    .hd-flash        { fill: #fff1f0; }
    .haldir-label    { font: 400 12px ui-monospace, SFMono-Regular, Menlo, monospace; fill: #2dd4bf; }
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
      .hub-glow { stroke: #059669; stroke-opacity: 0.12; }
      .hub-label { fill: #059669; }
      .logo-label { fill: #57626f; }
      .tri-label { fill: #6d28d9; }
      .gate-label { fill: #b45309; }
      .cube-label { fill: #c2410c; }
      .flag-edge { stroke: #000000; stroke-opacity: 0.25; }
      .vox-label { fill: #c026d3; }
      .raven-label { fill: #4b5320; }
      .raven-cursor { fill: #4b5320; }
      .radar-label { fill: #0284c7; }
      .gal-label { fill: #dc2626; }
      .haldir-label { fill: #0d9488; }
      .wg-rule { stroke: #d0d7de; stroke-opacity: 0.9; }
      .wg-bracket { stroke: #b45309; }
      .panel { fill: #0b1f2a; fill-opacity: 0.025; stroke: #0b1f2a; stroke-opacity: 0.08; }
    }
    @media (prefers-reduced-motion: reduce) { animate, animateTransform { display: none; } }
  </style>

  <rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="16" class="panel"/>
  <text x="40" y="40" class="cap">THE&#160;SYSTEM&#160;//&#160;HOW&#160;THE&#160;WORK&#160;CONNECTS</text>

  <g transform="translate(0 ${VSHIFT})">
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
  </g>
  ${frame}
</svg>
`;

// Shared <defs> (gradients + filters + per-edge gradients) and <style> inner text,
// sliced from the assembled graph so scripts/logos.mjs renders each mark on a
// standalone canvas with byte-identical machining. Non-greedy → the first (main)
// defs block, not a mark's inline defs.
export const SHARED_DEFS = (svg.match(/<defs>([\s\S]*?)<\/defs>/) || [])[1] || "";
export const SHARED_STYLE = (svg.match(/<style>([\s\S]*?)<\/style>/) || [])[1] || "";
export { nodes };

// Only write the graph when run directly (`node scripts/work-graph.mjs`); importing
// this module (e.g. from logos.mjs) reuses the exports without rewriting the graph.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeThemedPair(OUT_PATH, svg);
  console.log(`[work-graph] wrote ${OUT_PATH} (${svg.length} bytes)`);
}
