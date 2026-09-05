// Shared meaning for the research map, local ownership view, and public captions.
// Runtime-role edges do not turn research or library links into runtime routes.
export const LOCAL_NCP = {
  title: "NCP local simulation v1 candidate",
  profile: "ncp.local-lockstep.v1",
  status: "Installed-artifact qualification and final release gates remain open.",
  summary: "Engram coordinates one local experiment and privately owns NEST. CREBAIN owns body and fusion state. Prisoma captures exact step pairs. Galadriel records actual detector output with explicit abstention.",
  transport: "Each owner exchanges bounded NCP requests and exact retained results through its own private process pipes. NCP is the shared contract, not another simulation engine.",
  boundary: "This candidate targets local Darwin simulation. Haldir gating, remote endpoints, physical actuation, and real-time guarantees are excluded. Gated requests must be rejected before endpoint preparation. Capture and monitor results grant no command authority.",
  availability: "The tested Engram implementation is private Paper2Brain source. The public Engram repository is a placeholder, not an executable release.",
  research: "Solid paired arrows show private NCP requests and results routed by Engram. Dashed arrows show research library dependencies. Dotted lines show research or export context, not a qualified runtime path. The dash-dot reference identifies the shared NCP contract. PID research retains its own validity gates.",
  monitor: "One Visual modality remains insufficient for Galadriel's unchanged two-modality minimum. An unavailable observation never becomes a zero residual or a nominal report.",
  guide: "https://github.com/sepahead/NCP",
  roles: [
    { id: "engram", name: "Engram", role: "Neural owner", lines: ["Persistent NEST", "Private neural state", "Exact readout interval"] },
    { id: "crebain", name: "CREBAIN", role: "Body owner", lines: ["Simulation + fusion", "Position + velocity", "Applied acceleration"] },
    { id: "prisoma", name: "Prisoma", role: "Capture owner", lines: ["Reserve before steps", "Join exact step pairs", "Check terminal record"] },
    { id: "galadriel", name: "Galadriel", role: "Monitor owner", lines: ["Actual NIS detector", "Record-only output", "Explicit insufficiency"] },
  ],
};

export const EDGE_TYPES = {
  runtime: { label: "NCP private request / result", pattern: "solid paired arrows" },
  library: { label: "Research library dependency", pattern: "dashed arrow" },
  research: { label: "Research / export context", pattern: "dotted line, no arrow" },
  contract: { label: "Shared contract reference", pattern: "dash-dot line, square end" },
};

export const ECOSYSTEM_EDGES = [
  { a: "engram", b: "prisoma", kind: "runtime", role: "capture", label: "NCP · capture", labelAt: [280, 191], bow: -26 },
  { a: "engram", b: "galadriel", kind: "runtime", role: "monitor", label: "NCP · record-only monitor", labelAt: [280, 280], bow: 8 },
  { a: "engram", b: "crebain", kind: "runtime", role: "body", label: "NCP · body", labelAt: [284, 413], bow: 32 },
  { a: "ncp", b: "engram", kind: "contract", label: "Shared contract", labelAt: [110, 181], bow: 0 },
  { a: "galadriel", b: "pidrs", kind: "library", label: "Optional research library", labelAt: [278, 154], via: [342, 226] },
  { a: "prisoma", b: "pidrs", kind: "library", label: "Research / runlog", labelAt: [542, 112], bow: 26 },
  { a: "cobotatlas", b: "prisoma", kind: "research", label: "Research", labelAt: [577, 189] },
  { a: "melkor", b: "prisoma", kind: "research", label: "Research", labelAt: [590, 260] },
  { a: "reliefatlas", b: "prisoma", kind: "research", label: "Research", labelAt: [779, 405], route: [[804, 420], [804, 247]] },
  { a: "crebain", b: "cobotatlas", kind: "research", label: "Research", labelAt: [617, 290], via: [607, 319] },
  { a: "crebain", b: "melkor", kind: "research", label: "Research", labelAt: [582, 388] },
  { a: "crebain", b: "reliefatlas", kind: "research", label: "Research", labelAt: [577, 480] },
  { a: "cortexel", b: "engram", kind: "research", label: "Figure export", labelAt: [219, 394], bow: 100 },
  { a: "manwe", b: "crebain", kind: "research", label: "Research tools", labelAt: [378, 574] },
];

export function validateEcosystemEdges(nodes, edges) {
  const key = (a, b) => [a, b].sort().join("--");
  const seen = new Set();
  const runtimeRoles = new Map([["prisoma", "capture"], ["galadriel", "monitor"], ["crebain", "body"]]);
  const required = new Set([...runtimeRoles.keys()].map((id) => key("engram", id)));
  required.add(key("ncp", "engram"));
  for (const edge of edges) {
    const identity = key(edge.a, edge.b);
    if (!nodes[edge.a] || !nodes[edge.b]) throw new Error(`Unknown graph endpoint: ${identity}`);
    if (seen.has(identity)) throw new Error(`Duplicate graph edge: ${identity}`);
    seen.add(identity);
    if (edge.a === "haldir" || edge.b === "haldir") throw new Error("Haldir is outside the local profile");
    if (!EDGE_TYPES[edge.kind] || !edge.label) throw new Error(`Unclassified graph edge: ${identity}`);
    if (edge.kind === "runtime") {
      if (edge.a !== "engram" || !runtimeRoles.has(edge.b)) throw new Error(`Runtime bypasses the Engram owner: ${identity}`);
      if (edge.role !== runtimeRoles.get(edge.b)) throw new Error(`Wrong runtime role: ${identity}`);
    } else if (edge.kind === "contract") {
      if (edge.a !== "ncp" || edge.b !== "engram") throw new Error(`Invalid contract reference: ${identity}`);
    } else {
      if (edge.a === "ncp" || edge.b === "ncp") throw new Error(`Unclassified NCP route: ${identity}`);
      if ([edge.a, edge.b].every((id) => LOCAL_NCP.roles.some((role) => role.id === id))) {
        throw new Error(`Cross-project runtime bypass: ${identity}`);
      }
      if (edge.kind === "library" && (!new Set(["prisoma", "galadriel"]).has(edge.a) || edge.b !== "pidrs")) {
        throw new Error(`Unverified library dependency: ${identity}`);
      }
    }
  }
  for (const identity of required) {
    if (!seen.has(identity)) throw new Error(`Missing local NCP role or contract: ${identity}`);
  }
}
