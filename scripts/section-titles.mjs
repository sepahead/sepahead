#!/usr/bin/env node
// scripts/section-titles.mjs
// Generates assets/title-<slug>.svg, one terminal-prompt "command line" banner
// per README section, so the whole profile reads as a single terminal session
// (the hero is line 00; each section is a numbered command 01..04). Each banner:
// an accent SPINE, a two-digit INDEX, a "~/sep ❯" prompt, the section LABEL
// (neutral ink, never the accent, so it passes contrast on both grounds), a
// right-aligned static "# …" comment, an animated swept hairline rule, and a
// blinking block cursor (staggered per section so they never strobe in unison).
// Theme-adaptive (prefers-color-scheme), reduced-motion safe, zero deps.
// Run: `node scripts/section-titles.mjs`.

import { writeFileSync, mkdirSync } from "node:fs";
import { writeThemedPair } from "./theme-split.mjs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PALETTE, MONO, escapeXML, charLen, sweepDefs, CURBLINK_KEYFRAMES } from "./tokens.mjs";
import { PROJECTS, REPOS, AGENTS, RAILS } from "./data.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ASSETS = resolve(__dirname, "..", "assets");

const W = 860;
const H = 52;
const BASE = 33; // text baseline
const LABEL_X = 132;

const SECTIONS = [
  { slug: "frontier",  index: "01", label: "FROM SIGNAL TO FRONTIER", comment: "# story before evidence", accent: "frontier", begin: "0s" },
  { slug: "pulse",     index: "02", label: "THE PULSE",     comment: "# active since 2014", accent: "pulse",     begin: "0.3s" },
  { slug: "work",      index: "03", label: "SELECTED WORK", comment: `# ${PROJECTS.length} projects`,    accent: "work",      begin: "0.6s" },
  { slug: "toolbox",   index: "04", label: "THE TOOLBOX",         comment: `# ${RAILS.length} stacks`,      accent: "toolbox",   begin: "0.9s" },
  { slug: "agentic",   index: "05", label: "AGENTIC ENGINEERING", comment: `# ${AGENTS.length} in the loop`, accent: "agentic",   begin: "1.2s" },
  { slug: "elsewhere", index: "06", label: "ELSEWHERE",           comment: "# always open",                    accent: "elsewhere", begin: "1.5s" },
];

const HEADING = {
  frontier: "From signal to frontier",
  pulse: "The pulse",
  work: "Selected work",
  toolbox: "The toolbox",
  agentic: "Agentic engineering",
  elsewhere: "Elsewhere",
  more: "More repositories",
};

function render(s) {
  const [accentD, accentL] = PALETTE.accents[s.accent];
  const [inkD, inkL] = PALETTE.ink;
  const [mutedD, mutedL] = PALETTE.muted;
  const [ruleD, ruleL] = PALETTE.rule;

  const labelW = charLen(s.label, 14, 4);
  const ruleX1 = LABEL_X;
  const ruleX2 = 856; // hairline + "# …" count reach the right edge (4px margin, matching the left spine)
  const cursorX = LABEL_X + labelW + 10;

  const aria = HEADING[s.slug];

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${escapeXML(aria)}">
  <title>${escapeXML(aria)}</title>
  <style>
    :root { color-scheme: light dark; }
    .idx    { font: 700 13px ${MONO}; fill: ${accentD}; letter-spacing: 1px; }
    .prompt { font: 600 14px ${MONO}; fill: ${mutedD}; }
    .caret  { fill: ${accentD}; }
    .label  { font: 700 14px ${MONO}; fill: ${inkD}; letter-spacing: 4px; }
    .cap    { font: 600 11px ${MONO}; fill: ${mutedD}; letter-spacing: 2px; }
    .spine  { stroke: ${accentD}; stroke-width: 4; stroke-linecap: round; }
    .rule   { stroke: ${ruleD}; stroke-width: 1; }
    .cursor { fill: ${accentD}; animation: curblink 1s steps(1) ${s.begin} infinite; }
    ${CURBLINK_KEYFRAMES}
    text { paint-order: stroke; stroke: #0d1117; stroke-width: 2.6; stroke-linejoin: round; }
    @media (prefers-color-scheme: light) {
      text { stroke: #ffffff; }
      .idx { fill: ${accentL}; }
      .prompt { fill: ${mutedL}; }
      .caret { fill: ${accentL}; }
      .label { fill: ${inkL}; }
      .cap { fill: ${mutedL}; }
      .spine { stroke: ${accentL}; }
      .rule { stroke: ${ruleL}; }
      .cursor { fill: ${accentL}; }
    }
    @media (prefers-reduced-motion: reduce) {
      animate { display: none; }
      .cursor { animation: none; visibility: hidden; }
    }
  </style>
  <path d="M4 13 V39" class="spine"/>
  <text x="22" y="${BASE}" class="idx">${s.index}</text>
  <text x="50" y="${BASE}" class="prompt">~/sep <tspan class="caret">&#10095;</tspan></text>
  <text x="${LABEL_X}" y="${BASE}" class="label" textLength="${labelW}" lengthAdjust="spacingAndGlyphs">${escapeXML(s.label)}</text>
  <text x="${ruleX2}" y="${BASE}" text-anchor="end" class="cap">${escapeXML(s.comment)}</text>
  <line x1="${ruleX1}" y1="42.5" x2="${ruleX2}" y2="42.5" class="rule"/>
  <rect x="${cursorX}" y="22" width="9" height="14" rx="1" class="cursor"/>
</svg>
`;
}

// ---------------------------------------------------------------------------
// "More repositories" heading. Same terminal grammar as the numbered section
// banners and at the SAME prominence: full-weight accent spine, bright-ink
// label, full size, so it reads as a real heading, NOT a dim subtitle. The one
// difference: no two-digit index (it isn't one of the numbered top-level
// commands), so the prompt sits where the index would be.
// ---------------------------------------------------------------------------
function renderHeading({ label, comment, accent, begin = "0.6s" }) {
  const [accentD, accentL] = PALETTE.accents[accent];
  const [inkD, inkL] = PALETTE.ink;
  const [mutedD, mutedL] = PALETTE.muted;
  const [ruleD, ruleL] = PALETTE.rule;

  const labelW = charLen(label, 14, 4);
  const PROMPT_X = 22; // where the index sits on the numbered banners
  const HLABEL_X = LABEL_X; // 132, aligned with the section labels
  const RULE_X2 = 856; // reaches the right edge, like the numbered section banners
  const cursorX = HLABEL_X + labelW + 10;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${escapeXML(label.toLowerCase())}">
  <title>${escapeXML(label.toLowerCase())}</title>
  <style>
    :root { color-scheme: light dark; }
    .prompt { font: 600 14px ${MONO}; fill: ${mutedD}; }
    .caret  { fill: ${accentD}; }
    .label  { font: 700 14px ${MONO}; fill: ${inkD}; letter-spacing: 4px; }
    .cap    { font: 600 11px ${MONO}; fill: ${mutedD}; letter-spacing: 2px; }
    .spine  { stroke: ${accentD}; stroke-width: 4; stroke-linecap: round; }
    .rule   { stroke: ${ruleD}; stroke-width: 1; }
    .cursor { fill: ${accentD}; animation: curblink 1s steps(1) ${begin} infinite; }
    ${CURBLINK_KEYFRAMES}
    text { paint-order: stroke; stroke: #0d1117; stroke-width: 2.6; stroke-linejoin: round; }
    @media (prefers-color-scheme: light) {
      text { stroke: #ffffff; }
      .prompt { fill: ${mutedL}; }
      .caret  { fill: ${accentL}; }
      .label  { fill: ${inkL}; }
      .cap    { fill: ${mutedL}; }
      .spine  { stroke: ${accentL}; }
      .rule   { stroke: ${ruleL}; }
      .cursor { fill: ${accentL}; }
    }
    @media (prefers-reduced-motion: reduce) {
      animate { display: none; }
      .cursor { animation: none; visibility: hidden; }
    }
  </style>
  <path d="M4 13 V39" class="spine"/>
  <text x="${PROMPT_X}" y="${BASE}" class="prompt">~/sep <tspan class="caret">&#10095;</tspan></text>
  <text x="${HLABEL_X}" y="${BASE}" class="label" textLength="${labelW}" lengthAdjust="spacingAndGlyphs">${escapeXML(label)}</text>
  <text x="${RULE_X2}" y="${BASE}" text-anchor="end" class="cap">${escapeXML(comment)}</text>
  <line x1="${HLABEL_X}" y1="42.5" x2="${RULE_X2}" y2="42.5" class="rule"/>
  <rect x="${cursorX}" y="22" width="9" height="14" rx="1" class="cursor"/>
</svg>
`;
}

mkdirSync(ASSETS, { recursive: true });
for (const s of SECTIONS) {
  const out = resolve(ASSETS, `title-${s.slug}.svg`);
  writeThemedPair(out, render(s));
  console.log(`[section-titles] wrote ${out}`);
}

const moreOut = resolve(ASSETS, "title-more.svg");
writeThemedPair(moreOut, renderHeading({ label: "MORE REPOSITORIES", comment: `# ${REPOS.length} repos`, accent: "work" }));
console.log(`[section-titles] wrote ${moreOut}`);
