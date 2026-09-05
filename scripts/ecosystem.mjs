// Shared meaning for the research map, local ownership view, and public captions.
// Runtime-role edges do not turn research or library links into runtime routes.
export const LOCAL_NCP = {
  title: "NCP local simulation v1 candidate",
  profile: "ncp.local-lockstep.v1",
  status: "Installed-artifact qualification and final release gates remain open.",
  overview: "Engram runs neural models. CREBAIN runs a standalone 3D environment and sensor fusion. Galadriel monitors possible sensor tampering. Prisoma organizes experiments and evidence for embodied agents. NCP defines their shared messages.",
  example: "In the current integrated test, CREBAIN sends observations to Engram, which returns action proposals. Engram also sends sensor diagnostics to Galadriel and complete exchanges to Prisoma. NCP carries these messages. Independent adapter qualification remains open.",
  summary: "Engram coordinates one local experiment and privately owns neural state. CREBAIN owns body and fusion state. Prisoma captures exact step pairs. Galadriel records actual detector output with explicit abstention.",
  transport: "Each owner exchanges bounded NCP requests and exact retained results through its own private process pipes. NCP is the shared contract, not another simulation engine.",
  boundary: "This candidate targets local Darwin simulation. Haldir gating, remote endpoints, physical actuation, and real-time guarantees are excluded. Gated requests must be rejected before endpoint preparation. Capture and monitor results grant no command authority.",
  availability: "The tested Engram implementation is private Paper2Brain source. The public Engram repository is a placeholder, not an executable release.",
  research: "NCP sits at the center as a shared interface. Solid connections identify local v1 adapters; the dash-dot connection identifies Haldir's pinned v0.8 adapter. Dashed arrows show library dependencies. Dotted lines show asset, tool, or export relationships. These connections do not require every project to run together or depict a runtime broker.",
  monitor: "One Visual modality remains insufficient for Galadriel's unchanged two-modality minimum. An unavailable observation never becomes a zero residual or a nominal report.",
  guide: "https://github.com/sepahead/NCP",
  roles: [
    { id: "engram", name: "Engram", role: "Neural owner", lines: ["Persistent network", "Private neural state", "Exact readout interval"] },
    { id: "crebain", name: "CREBAIN", role: "Body owner", lines: ["Simulation + fusion", "Position + velocity", "Applied acceleration"] },
    { id: "prisoma", name: "Prisoma", role: "Capture owner", lines: ["Reserve before steps", "Join exact step pairs", "Check terminal record"] },
    { id: "galadriel", name: "Galadriel", role: "Tampering monitor", lines: ["Sensor consistency", "Record-only output", "Explicit insufficiency"] },
  ],
};

export const EDGE_TYPES = {
  protocol: { label: "Local NCP interface", pattern: "solid paired arrows" },
  library: { label: "Library dependency", pattern: "dashed arrow" },
  research: { label: "Assets / tools / exports", pattern: "dotted line, no arrow" },
  contract: { label: "Pinned NCP v0.8 interface", pattern: "dash-dot line, square end" },
};

export const ECOSYSTEM_EDGES = [
  { a: "ncp", b: "engram", kind: "protocol", role: "neural", label: "Neural", labelAt: [240, 303], bow: 0 },
  { a: "ncp", b: "galadriel", kind: "protocol", role: "monitor", label: "Monitor", labelAt: [323, 239], bow: 0 },
  { a: "ncp", b: "prisoma", kind: "protocol", role: "capture", label: "Capture", labelAt: [488, 326], bow: 0 },
  { a: "ncp", b: "crebain", kind: "protocol", role: "body", label: "Body", labelAt: [447, 435], bow: 0 },
  { a: "ncp", b: "haldir", kind: "contract", label: "v0.8", labelAt: [242, 211], bow: 0 },
  { a: "galadriel", b: "pidrs", kind: "library", label: "Optional PID library", labelAt: [457, 100], bow: -8 },
  { a: "prisoma", b: "pidrs", kind: "library", label: "PID / runlog", labelAt: [623, 228], bow: 8 },
  { a: "cobotatlas", b: "prisoma", kind: "research", label: "Dataset context" },
  { a: "melkor", b: "prisoma", kind: "research", label: "Scenario context" },
  { a: "reliefatlas", b: "prisoma", kind: "research", label: "Dataset context", route: [[816, 596], [816, 340], [661, 340]] },
  { a: "crebain", b: "cobotatlas", kind: "research", label: "Simulation assets", route: [[693, 534], [693, 274]] },
  { a: "crebain", b: "melkor", kind: "research", label: "Simulation scenarios", bow: 12 },
  { a: "crebain", b: "reliefatlas", kind: "research", label: "Simulation assets", bow: 8 },
  { a: "cortexel", b: "engram", kind: "research", label: "Figure export", labelAt: [90, 435], bow: 24 },
  { a: "manwe", b: "crebain", kind: "research", label: "Perception tools", labelAt: [297, 600], bow: 8 },
];

export function validateEcosystemEdges(nodes, edges) {
  const key = (a, b) => [a, b].sort().join("--");
  const seen = new Set();
  const runtimeRoles = new Map(LOCAL_NCP.roles.map(({ id }) => [id, ({ engram: "neural", prisoma: "capture", galadriel: "monitor", crebain: "body" })[id]]));
  const required = new Set([...runtimeRoles.keys(), "haldir"].map((id) => key("ncp", id)));
  for (const edge of edges) {
    const identity = key(edge.a, edge.b);
    if (!nodes[edge.a] || !nodes[edge.b]) throw new Error(`Unknown graph endpoint: ${identity}`);
    if (seen.has(identity)) throw new Error(`Duplicate graph edge: ${identity}`);
    seen.add(identity);
    if ((edge.a === "haldir" || edge.b === "haldir") && !(edge.a === "ncp" && edge.b === "haldir" && edge.kind === "contract")) throw new Error("Haldir has only a pinned v0.8 interface");
    if (!EDGE_TYPES[edge.kind] || !edge.label) throw new Error(`Unclassified graph edge: ${identity}`);
    if (edge.kind === "protocol") {
      if (edge.a !== "ncp" || !runtimeRoles.has(edge.b)) throw new Error(`Invalid local interface: ${identity}`);
      if (edge.role !== runtimeRoles.get(edge.b)) throw new Error(`Wrong runtime role: ${identity}`);
    } else if (edge.kind === "contract") {
      if (edge.a !== "ncp" || edge.b !== "haldir") throw new Error(`Invalid pinned interface: ${identity}`);
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
