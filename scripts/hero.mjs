// Self-contained character-step typing. SVG remains readable without animation.
import { writeFileSync } from "node:fs";
import { escapeXML, MONO } from "./tokens.mjs";

const lines = [
  "Domain-specific AI Agents · Custom Harnesses · LLM/VLM Evaluation",
  "Knowledge Graphs · Graph RAG · Data Provenance · Model Validation",
  "PID · Computational Neuroscience · Robotics · Multimodal 3D Perception",
];
const description = "Sepehr Mahmoudian is a Senior AI Engineer in Berlin, Germany, building domain-specific AI agents and custom harnesses, with work spanning LLM/VLM evaluation and AI traceability, knowledge graphs, Graph RAG, data provenance, model validation, Partial Information Decomposition, computational neuroscience, robotics and multimodal 3D perception. Primary languages: Rust and Python. Building on GitHub since 2014.";
const advance = 11;

function render(theme) {
  const dark = theme === "dark";
  const ink = dark ? "#c9d1d9" : "#1f2328";
  const muted = dark ? "#8b949e" : "#57606a";
  const accent = dark ? "#22d3ee" : "#0891b2";
  const rule = dark ? "#30363d" : "#d0d7de";
  const pct = (seconds) => `${Number((seconds / 15 * 100).toFixed(4))}%`;
  const animations = lines.map((line, index) => {
    const n = index + 1;
    const start = index * 5;
    const width = line.length * advance;
    return `
    .seq${n} { animation: seq${n} 15s linear infinite; }
    .type${n} { animation: type${n} 15s steps(${line.length}, end) infinite; }
    .cur${n} { animation: cursor${n} 15s steps(${line.length}, end) infinite, blink 1s steps(1) infinite; }
    @keyframes seq${n} {
      0%, ${pct(start)} { opacity: 0; }
      ${pct(start + .01)}, ${pct(start + 4.6)} { opacity: 1; }
      ${pct(start + 4.9)}, 100% { opacity: 0; }
    }
    @keyframes type${n} {
      0%, ${pct(start)} { width: 0; }
      ${pct(start + 1.8)}, ${pct(start + 4.9)} { width: ${width}px; }
      ${pct(start + 4.99)}, 100% { width: 0; }
    }
    @keyframes cursor${n} {
      0%, ${pct(start)} { visibility: hidden; transform: translateX(-${width}px); }
      ${pct(start + .01)} { visibility: visible; transform: translateX(-${width}px); }
      ${pct(start + 1.8)}, ${pct(start + 4.6)} { visibility: visible; transform: translateX(0); }
      ${pct(start + 4.9)}, 100% { visibility: hidden; transform: translateX(0); }
    }`;
  }).join("\n");
  const clips = lines.map((line, index) => `    <clipPath id="typing-${index + 1}" clipPathUnits="userSpaceOnUse"><rect x="40" y="96" width="${line.length * advance}" height="36" class="type-window type${index + 1}"/></clipPath>`).join("\n");
  const roles = lines.map((line, index) => {
    const n = index + 1;
    const width = line.length * advance;
    return `  <text x="40" y="124" textLength="${width}" lengthAdjust="spacingAndGlyphs" clip-path="url(#typing-${n})" class="role seq${n}" opacity="${index === 0 ? 1 : 0}">${escapeXML(line)}</text>
  <rect x="${40 + width}" y="108" width="9" height="20" rx="1" visibility="hidden" class="role-cur cur${n}"/>`;
  }).join("\n");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 860 176" width="860" height="176" role="img" aria-label="${escapeXML(description)}">
  <title>Sepehr Mahmoudian — Senior AI Engineer, Berlin</title>
  <desc>${escapeXML(description)}</desc>
  <style>
    .wordmark { font: 700 40px ${MONO}; fill: ${accent}; letter-spacing: -1px; }
    .role { font: 500 19px ${MONO}; fill: ${ink}; }
    .meta { font: 400 13px ${MONO}; fill: ${muted}; }
    .role-cur { visibility: hidden; fill: ${ink}; }
    .sweep { transform: translateX(0); animation: sweep 3.2s linear infinite; }
    @keyframes sweep { from { transform: translateX(-100px); } to { transform: translateX(620px); } }
    @keyframes blink { 0%, 50% { opacity: 1; } 50.01%, 100% { opacity: 0; } }
${animations}
    @media (prefers-reduced-motion: reduce) {
      .seq1, .seq2, .seq3, .cur1, .cur2, .cur3 { animation: none; }
      .type-window, .sweep { animation: none; }
      .cur1, .cur2, .cur3, .sweep { visibility: hidden; }
    }
  </style>
  <defs>
${clips}
    <clipPath id="underline"><rect x="40" y="83" width="500" height="6" rx="3"/></clipPath>
    <linearGradient id="sweep"><stop offset="0" stop-color="${accent}" stop-opacity="0"/><stop offset=".5" stop-color="${accent}"/><stop offset="1" stop-color="${accent}" stop-opacity="0"/></linearGradient>
  </defs>
  <text x="40" y="68" class="wordmark" textLength="500" lengthAdjust="spacingAndGlyphs">Sepehr Mahmoudian</text>
  <line x1="40" y1="86" x2="540" y2="86" stroke="${rule}" stroke-width="2"/>
  <g clip-path="url(#underline)"><rect x="0" y="83" width="120" height="6" fill="url(#sweep)" class="sweep"/></g>
${roles}
  <text x="40" y="158" class="meta">High Energy  ·  High Agency  ·  Takes Initiative  ·  Consistent</text>
</svg>
`;
}

for (const theme of ["light", "dark"]) {
  writeFileSync(new URL(`../assets/hero-${theme}.svg`, import.meta.url), render(theme));
}
