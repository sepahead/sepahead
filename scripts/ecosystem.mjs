// Shared meaning for the research map, local ownership view, and public captions.
// Runtime-role edges do not turn research or library links into runtime routes.
export const LOCAL_NCP = {
  title: "Four-owner local v1 reference",
  profile: "ncp.local-lockstep.v1",
  status: "Local sensor and neural loops passed their declared checks. Broader qualification and final v1 release gates remain open.",
  overview: "Engram runs neural models. CREBAIN runs a standalone 3D environment and sensor fusion. Galadriel optionally checks sensors for possible tampering. Prisoma organizes experiments and evidence for embodied agents. NCP defines their shared messages.",
  example: "The four-owner reference routes CREBAIN observations to Engram and returns its action proposals. Galadriel records diagnostics, and Prisoma captures complete exchanges. Applications can select smaller compositions through the modular interface.",
  summary: "Engram coordinates one local experiment and privately owns neural state. CREBAIN owns body and fusion state. Prisoma captures exact step pairs. Galadriel records actual detector output with explicit abstention.",
  transport: "Each owner exchanges bounded requests and results through its own private process channel. NCP defines the shared contract.",
  boundary: "This candidate targets local Darwin simulation. Haldir gating, remote endpoints, physical actuation, and real-time guarantees are excluded. Gated requests must be rejected before endpoint preparation. Capture and monitor results grant no command authority.",
  availability: "The tested Engram implementation is private Paper2Brain source. The public Engram repository is a placeholder, not an executable release.",
  research: "The map shows protocol interfaces, libraries, tools, and assets. Applications select the components they need.",
  composition: "CREBAIN runs standalone. Applications can add Engram neural models, Prisoma recording, or Galadriel monitoring. One endpoint can expose several identified sensors.",
  target: "Engram ran a real NEST network through NCP with CREBAIN. The loop ran 8 neural steps and 24 body ticks. All 64 readouts matched direct NEST execution. The test used explicit network and scene inputs. Paper-derived model reproduction remains a separate task.",
  sensors: "Each camera and microphone retains its identity and timing. Prisoma defines features, source groups, targets, and statistical assumptions. PID-rs estimates the declared quantities. The initial PID study selects two through four source variables; NCP imposes no such limit.",
  monitor: "Galadriel's current detector requires two sensor modalities. Two RGB cameras supply one Visual modality. Missing evidence produces abstention, never a nominal report.",
  environment: "Prisoma records commands before CREBAIN executes them. Installed body-only and canonical runs matched all 44 payloads, totaling 4,326,400 bytes. A 192-run timing study missed every 120-Hz deadline. The native pressure study completed 112 episodes with restored labels. Forecast improvement missed the declared useful threshold.",
  assets: "Melkor converts splat assets. The atlas projects provide mesh assets. These are intended CREBAIN inputs; the full import path remains unqualified.",
  guide: "https://github.com/sepahead/NCP",
  roles: [
    { id: "engram", name: "Engram", role: "Neural owner", lines: ["Persistent network", "Private neural state", "Exact readout interval"] },
    { id: "crebain", name: "CREBAIN", role: "Body owner", lines: ["Simulation + fusion", "Position + velocity", "Applied acceleration"] },
    { id: "prisoma", name: "Prisoma", role: "Capture owner", lines: ["Reserve before steps", "Join exact step pairs", "Check terminal record"] },
    { id: "galadriel", name: "Galadriel", role: "Optional monitor", lines: ["Sensor consistency", "Advisory output", "Explicit insufficiency"] },
  ],
};

export const EDGE_TYPES = {
  protocol: { label: "Local NCP interface", pattern: "solid paired arrows" },
  environment: { label: "Environment integration", pattern: "long dashed line, open arrow", status: "sensor path tested" },
  library: { label: "Library dependency", pattern: "dashed arrow" },
  research: { label: "Assets / exports", pattern: "dotted line, no arrow" },
  tool: { label: "Perception tools", pattern: "moving dashes on a continuous line" },
  contract: { label: "Pinned NCP v0.8 interface", pattern: "dash-dot line, square end" },
};

export const ECOSYSTEM_EDGES = [
  { a: "ncp", b: "engram", kind: "protocol", role: "neural", label: "Neural", labelAt: [240, 303], bow: 0 },
  { a: "ncp", b: "galadriel", kind: "protocol", role: "monitor", label: "Monitor", labelAt: [323, 239], bow: 0 },
  { a: "ncp", b: "prisoma", kind: "protocol", role: "capture", label: "Capture", labelAt: [488, 326], bow: 0 },
  { a: "ncp", b: "crebain", kind: "protocol", role: "body", label: "Body", labelAt: [447, 435], bow: 0 },
  { a: "ncp", b: "haldir", kind: "contract", label: "Pinned Haldir interface", bow: 0 },
  { a: "galadriel", b: "pidrs", kind: "library", label: "PID library dependency", bow: -8 },
  { a: "prisoma", b: "pidrs", kind: "library", label: "PID and runlog dependency", bow: 8 },
  { a: "crebain", b: "prisoma", kind: "environment", label: "Environment + sensors", status: "sensor path tested", labelAt: [548, 458], labelAngle: -52, route: [[528, 400]] },
  { a: "crebain", b: "cobotatlas", kind: "research", label: "Simulation assets", route: [[693, 534], [693, 274]] },
  { a: "crebain", b: "melkor", kind: "research", label: "Simulation scenarios", bow: 12 },
  { a: "crebain", b: "reliefatlas", kind: "research", label: "Simulation assets", bow: 8 },
  { a: "cortexel", b: "engram", kind: "research", label: "Figure export", labelAt: [109, 448], labelAngle: -82, bow: 24 },
  { a: "manwe", b: "crebain", kind: "tool", label: "Perception tools", labelAt: [335, 590], labelAngle: -33, bow: 8 },
];

export function validateEcosystemEdges(nodes, edges) {
  const key = (a, b) => [a, b].sort().join("--");
  const seen = new Set();
  const runtimeRoles = new Map(LOCAL_NCP.roles.map(({ id }) => [id, ({ engram: "neural", prisoma: "capture", galadriel: "monitor", crebain: "body" })[id]]));
  const required = new Set([...runtimeRoles.keys(), "haldir"].map((id) => key("ncp", id)));
  required.add(key("crebain", "prisoma"));
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
    } else if (edge.kind === "environment") {
      if (edge.a !== "crebain" || edge.b !== "prisoma" || edge.status !== EDGE_TYPES.environment.status) {
        throw new Error(`Invalid environment integration: ${identity}`);
      }
    } else {
      if (edge.a === "ncp" || edge.b === "ncp") throw new Error(`Unclassified NCP route: ${identity}`);
      if ([edge.a, edge.b].every((id) => LOCAL_NCP.roles.some((role) => role.id === id))) {
        throw new Error(`Cross-project runtime bypass: ${identity}`);
      }
      if (edge.kind === "library" && (!new Set(["prisoma", "galadriel"]).has(edge.a) || edge.b !== "pidrs")) {
        throw new Error(`Unverified library dependency: ${identity}`);
      }
      const sceneProviders = new Set(["cobotatlas", "reliefatlas", "melkor"]);
      if ([edge.a, edge.b].some((id) => sceneProviders.has(id)) && !(edge.a === "crebain" && sceneProviders.has(edge.b) && edge.kind === "research")) {
        throw new Error(`Scene assets require the environment owner: ${identity}`);
      }
    }
  }
  for (const identity of required) {
    if (!seen.has(identity)) throw new Error(`Missing local NCP role or contract: ${identity}`);
  }
}
