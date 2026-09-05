// Focused ownership view. The larger work graph retains the research context.
import { LOCAL_NCP } from "./ecosystem.mjs";

const xml = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;",
})[character]);

export function localOwnershipSvg() {
  const text = (x, y, value, css = "body", anchor = "start") =>
    `<text x="${x}" y="${y}" class="${css}" text-anchor="${anchor}">${xml(value)}</text>`;
  const owners = LOCAL_NCP.roles.map((owner, index) => {
    const x = 24 + index * 244;
    const center = x + 110;
    return `<g data-owner="${owner.id}">
      <path d="M ${center - 9} 161 V 332" class="request"/>
      <path d="M ${center + 9} 339 V 170" class="result"/>
      <polygon points="${center - 15},328 ${center - 3},328 ${center - 9},339" class="request-head"/>
      <polygon points="${center + 3},174 ${center + 15},174 ${center + 9},163" class="result-head"/>
      <rect x="${x}" y="344" width="220" height="150" rx="12" class="owner"/>
      ${text(x + 16, 377, owner.name, "name")}
      ${text(x + 16, 403, owner.role, "role")}
      ${owner.lines.map((line, row) => text(x + 16, 433 + row * 23, line)).join("\n")}
    </g>`;
  }).join("\n");
  const description = [LOCAL_NCP.summary, LOCAL_NCP.transport, LOCAL_NCP.monitor, LOCAL_NCP.boundary, LOCAL_NCP.availability, LOCAL_NCP.status].join(" ");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 690" width="1000" height="690" role="img" aria-labelledby="local-title local-desc">
  <title id="local-title">${xml(LOCAL_NCP.title)}</title>
  <desc id="local-desc">${xml(description)}</desc>
  <style>
    .panel { fill: #0d1117; stroke: #30363d; }
    .coordinator { fill: #172333; stroke: #536071; }
    .owner { fill: #131c27; stroke: #536071; }
    .contract { fill: #302409; stroke: #b68a2c; }
    .boundary { fill: #172023; stroke: #467370; }
    text { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
    .caption { fill: #9da7b3; font-size: 14px; letter-spacing: 1.4px; }
    .heading { fill: #e6edf3; font-size: 25px; font-weight: 600; }
    .name { fill: #e6edf3; font-size: 23px; font-weight: 600; }
    .body { fill: #b9c3cf; font-size: 14px; }
    .role { fill: #5eead4; font-size: 17px; font-weight: 600; }
    .contract-title { fill: #fbbf24; font-size: 22px; font-weight: 600; }
    .contract-body { fill: #f4d48d; font-size: 15px; }
    .request, .result { fill: none; stroke-width: 2.5px; }
    .request { stroke: #fbbf24; } .request-head { fill: #fbbf24; }
    .result { stroke: #5eead4; } .result-head { fill: #5eead4; }
    @media (prefers-color-scheme: light) {
      .panel { fill: #ffffff; stroke: #d0d7de; }
      .coordinator { fill: #f0f4f8; stroke: #8a9bab; }
      .owner { fill: #f5f8fa; stroke: #a8b8c7; }
      .contract { fill: #fff7e5; stroke: #b68a2c; }
      .boundary { fill: #eff8f6; stroke: #8aafaa; }
      .caption { fill: #57606a; }
      .heading, .name { fill: #17324d; }
      .body { fill: #435365; }
      .role { fill: #0f766e; }
      .contract-title { fill: #8a4b08; }
      .contract-body { fill: #795015; }
      .request { stroke: #9a5a00; } .request-head { fill: #9a5a00; }
      .result { stroke: #0f766e; } .result-head { fill: #0f766e; }
    }
    @media (prefers-reduced-motion: reduce) { animate { display: none; } }
  </style>
  <rect x=".5" y=".5" width="999" height="689" rx="18" class="panel"/>
  ${text(28, 37, "LOCAL V1 CANDIDATE // FOUR OWNERS", "caption")}
  ${text(972, 37, "PRIVATE PIPES // EXACT OUTCOMES", "caption", "end")}
  <rect x="24" y="64" width="952" height="98" rx="12" class="coordinator"/>
  ${text(46, 101, "Engram experiment coordinator", "heading")}
  ${text(46, 135, "Freeze the plan. Order one step. Retain outcomes. Close evidence.")}
  ${owners}
  <rect x="24" y="219" width="952" height="73" rx="10" class="contract"/>
  ${text(500, 249, "NCP is the contract on each separate channel.", "contract-title", "middle")}
  ${text(500, 278, "Request / exact result / digest-bound acknowledgement", "contract-body", "middle")}
  ${text(500, 518, "Results return evidence. Capture and monitoring cannot command.", "body", "middle")}
  <rect x="24" y="540" width="952" height="124" rx="12" class="boundary"/>
  ${text(46, 569, "One Visual modality: Galadriel's unchanged evidence floor requires abstention.")}
  ${text(46, 596, "Haldir gating is excluded. Gated requests are rejected before preparation.")}
  ${text(46, 623, "Darwin simulation only; no remote, physical-actuation, or real-time guarantee.")}
  ${text(46, 649, "Candidate status: installed qualification and final release gates remain open.")}
  </svg>\n`;
}
