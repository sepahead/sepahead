// Shared meaning for the research map, local ownership view, and public captions.
// Runtime-role edges do not turn research or library links into runtime routes.
export const LOCAL_NCP = {
  title: "Local four-program composition",
  profile: "ncp.local-lockstep.v1",
  status: "Engram, CREBAIN, Prisoma, and Galadriel can run together as one local experiment. Each program owns its state.",
  overview: "Engram runs neural models. CREBAIN runs a standalone 3D environment and sensor fusion. Galadriel optionally checks sensors for possible tampering. Prisoma organizes experiments and evidence for embodied agents. NCP defines their shared messages.",
  example: "The four-owner reference routes CREBAIN observations to Engram and returns its action proposals. Galadriel records diagnostics, and Prisoma captures complete exchanges. Applications can select smaller compositions through the modular interface.",
  summary: "Engram coordinates one local experiment and owns the neural state. CREBAIN owns the body and fusion state. Prisoma records the step pairs. Galadriel records the detector output.",
  transport: "Each owner exchanges bounded requests and results through its own private process channel. NCP defines the shared contract.",
  boundary: "The composition runs in local simulation. Haldir authorizes commands through its own NCP 1.0 interface, outside this composition. Capture and monitor results never send commands.",
  availability: "The Engram source is in the private Paper2Brain repository. The public Engram repository is a placeholder.",
  research: "The map shows protocol interfaces, libraries, tools, and assets. Applications select the components they need.",
  composition: "CREBAIN runs standalone. Applications can add Engram neural models, Prisoma recording, or Galadriel monitoring. One endpoint can expose several identified sensors.",
  target: "Engram runs NEST networks. It sends action proposals to the CREBAIN body simulation and receives sensor data through NCP.",
  sensors: "Each camera and microphone keeps its identity and timing. Prisoma defines features, source groups, targets, and statistical assumptions. pid-rs estimates the declared quantities for two to four source variables. NCP does not limit the number of sensors.",
  monitor: "Galadriel compares at least two sensor modalities. It reports when the evidence is not sufficient.",
  environment: "Prisoma records each command before CREBAIN executes it. It joins the related sensor and neural steps into one experiment record.",
  assets: "cobot-atlas supplies robotics meshes, and relief-atlas supplies disaster-relief and defense meshes for CREBAIN scenes. Melkor converts Gaussian-splat scenes for CREBAIN and wraps external reconstruction programs. Manwe makes perception models for CREBAIN sensors.",
  reading: "Filled arrowheads show where data, assets or messages go. Open arrowheads point to a library that a project uses.",
  pidPaths: "CREBAIN has no pid-rs dependency. Its recordings reach pid-rs through Prisoma's optional information analysis. Engram renders its figures through Cortexel's figure contracts.",
  guide: "https://github.com/sepahead/NCP",
  roles: [
    { id: "engram", name: "Engram", role: "Neural owner", lines: ["Persistent network", "Private neural state", "Exact readout interval"] },
    { id: "crebain", name: "CREBAIN", role: "Body owner", lines: ["Simulation + fusion", "Position + velocity", "Applied acceleration"] },
    { id: "prisoma", name: "Prisoma", role: "Capture owner", lines: ["Reserve before steps", "Join exact step pairs", "Check terminal record"] },
    { id: "galadriel", name: "Galadriel", role: "Optional monitor", lines: ["Sensor consistency", "Advisory output", "Explicit insufficiency"] },
  ],
};

// Haldir's NCP interface: the wire its main branch speaks and the crate that owns it.
export const HALDIR_NCP = { wire: "1.0", crate: "haldir-ncp10" };

// One meaning per visual channel: line pattern = kind of relation; filled arrowhead = direction
// of data, assets or messages; open arrowhead = "uses this library".
export const EDGE_TYPES = {
  protocol: { label: "Local NCP interface", pattern: "solid paired arrows for requests and results on each owner's own process channel" },
  library: { label: "Uses a library", pattern: "dashed line with an open arrowhead at the library" },
  environment: { label: "Sensor data path", pattern: "long dashed line with a filled arrowhead toward the recorder" },
  contract: { label: `Haldir: NCP ${HALDIR_NCP.wire} interface`, pattern: "dash-dot line with a square end, outside the local v1 profile" },
  dataset: { label: "Mesh dataset", pattern: "dotted line with a filled arrowhead toward the simulator" },
  tool: { label: "Asset or model tool", pattern: "dashed line with a filled arrowhead toward the simulator" },
};

// Every edge names the evidence that supports it. Library edges point from the user to the library;
// data, asset and model edges point from the provider to the consumer.
export const ECOSYSTEM_EDGES = [
  { a: "ncp", b: "engram", kind: "protocol", role: "neural", label: "Neural", labelAt: [240, 303], bow: 0, evidence: "NCP local v1 profile ncp.local-lockstep.v1; Paper2Brain neural owner (private source)" },
  { a: "ncp", b: "galadriel", kind: "protocol", role: "monitor", label: "Monitor", labelAt: [323, 239], bow: 0, evidence: "galadriel crates/galadriel-local-adapter on ncp-local 1.0.0" },
  { a: "ncp", b: "prisoma", kind: "protocol", role: "capture", label: "Capture", labelAt: [488, 326], bow: 0, evidence: "prisoma crates/ncp-local-capture" },
  { a: "ncp", b: "crebain", kind: "protocol", role: "body", label: "Body", labelAt: [447, 435], bow: 0, evidence: "crebain docs/NATIVE_NCP_SIMULATION.md, local NCP body" },
  { a: "ncp", b: "haldir", kind: "contract", label: `Haldir NCP ${HALDIR_NCP.wire}`, bow: 0, evidence: `haldir crates/${HALDIR_NCP.crate}` },
  { a: "galadriel", b: "pidrs", kind: "library", label: "PID library", bow: -8, evidence: "galadriel Cargo.toml: pid-core, optional dependence feature" },
  { a: "prisoma", b: "pidrs", kind: "library", label: "PID library", bow: 8, evidence: "prisoma pid-rs submodule; Cargo.lock pid-core" },
  { a: "engram", b: "cortexel", kind: "library", label: "Figure contracts", labelAt: [109, 448], labelAngle: -82, bow: -24, evidence: "Paper2Brain frontend, backend and scripts/cortexel-postimages use Cortexel" },
  { a: "crebain", b: "prisoma", kind: "environment", label: "Sensor data", labelAt: [488, 443], labelAngle: -61, route: [[528, 400]], evidence: "crebain integrations/ncp-force-ground-sensors: camera and microphone cases recorded by Prisoma" },
  { a: "cobotatlas", b: "crebain", kind: "dataset", label: "Robotics meshes", labelAt: [626, 430], labelAngle: -29, bow: 0, evidence: "cobot-atlas GLB meshes for robot simulation; crebain loads GLB scenes (src/lib/glbSceneBudget.ts)" },
  { a: "reliefatlas", b: "crebain", kind: "dataset", label: "Relief and defense meshes", labelAt: [614, 578], labelAngle: 18, bow: 0, evidence: "relief-atlas meshes for disaster relief and civil protection; crebain loads GLB scenes" },
  { a: "melkor", b: "crebain", kind: "tool", label: "Splat scenes", labelAt: [626, 505], labelAngle: -4, bow: 0, evidence: "melkor converts Gaussian-splat scenes (PLY, SPZ, glTF, GLB) and wraps reconstruction programs" },
  { a: "manwe", b: "crebain", kind: "tool", label: "Perception models", labelAt: [327, 596], labelAngle: -33, bow: -8, evidence: "manwe: vision, audio, camera geometry and multi-target tracking; no adapter merged yet" },
];

export function validateEcosystemEdges(nodes, edges) {
  const key = (a, b) => [a, b].sort().join("--");
  const seen = new Set();
  const runtimeRoles = new Map(LOCAL_NCP.roles.map(({ id }) => [id, ({ engram: "neural", prisoma: "capture", galadriel: "monitor", crebain: "body" })[id]]));
  const required = new Set([...runtimeRoles.keys(), "haldir"].map((id) => key("ncp", id)));
  required.add(key("crebain", "prisoma"));
  const libraries = new Set(["galadriel>pidrs", "prisoma>pidrs", "engram>cortexel"]);
  const datasets = new Set(["cobotatlas", "reliefatlas"]);
  const tools = new Set(["melkor", "manwe"]);
  for (const edge of edges) {
    const identity = key(edge.a, edge.b);
    if (!nodes[edge.a] || !nodes[edge.b]) throw new Error(`Unknown graph endpoint: ${identity}`);
    if (seen.has(identity)) throw new Error(`Duplicate graph edge: ${identity}`);
    seen.add(identity);
    if (!EDGE_TYPES[edge.kind] || !edge.label) throw new Error(`Unclassified graph edge: ${identity}`);
    if (!edge.evidence) throw new Error(`Graph edge without evidence: ${identity}`);
    if ((edge.a === "haldir" || edge.b === "haldir") && !(edge.a === "ncp" && edge.b === "haldir" && edge.kind === "contract")) throw new Error(`Haldir has only its NCP ${HALDIR_NCP.wire} interface`);
    if (edge.kind === "protocol") {
      if (edge.a !== "ncp" || !runtimeRoles.has(edge.b)) throw new Error(`Invalid local interface: ${identity}`);
      if (edge.role !== runtimeRoles.get(edge.b)) throw new Error(`Wrong runtime role: ${identity}`);
    } else if (edge.kind === "contract") {
      if (edge.a !== "ncp" || edge.b !== "haldir" || !edge.label.includes(HALDIR_NCP.wire)) throw new Error(`Invalid Haldir interface: ${identity}`);
    } else if (edge.kind === "environment") {
      if (edge.a !== "crebain" || edge.b !== "prisoma") {
        throw new Error(`Invalid environment integration: ${identity}`);
      }
    } else {
      if (edge.a === "ncp" || edge.b === "ncp") throw new Error(`Unclassified NCP route: ${identity}`);
      if ([edge.a, edge.b].every((id) => LOCAL_NCP.roles.some((role) => role.id === id))) {
        throw new Error(`Cross-project runtime bypass: ${identity}`);
      }
      if (edge.kind === "library" && !libraries.has(`${edge.a}>${edge.b}`)) throw new Error(`Unverified library dependency: ${identity}`);
      const provider = datasets.has(edge.a) || tools.has(edge.a) ? edge.a : datasets.has(edge.b) || tools.has(edge.b) ? edge.b : null;
      if (provider) {
        const kind = datasets.has(provider) ? "dataset" : "tool";
        if (edge.a !== provider || edge.b !== "crebain" || edge.kind !== kind) {
          throw new Error(`Assets and models flow into the environment owner as ${kind} edges: ${identity}`);
        }
      } else if (edge.kind === "dataset" || edge.kind === "tool") {
        throw new Error(`Unverified asset or model supplier: ${identity}`);
      }
    }
  }
  for (const identity of required) {
    if (!seen.has(identity)) throw new Error(`Missing local NCP role or contract: ${identity}`);
  }
}
