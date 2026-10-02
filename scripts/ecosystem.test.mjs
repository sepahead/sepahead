import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { ECOSYSTEM_EDGES, EDGE_TYPES, HALDIR_NCP, LOCAL_NCP, validateEcosystemEdges } from "./ecosystem.mjs";
import { nodes } from "./work-graph.mjs";

const copy = () => ECOSYSTEM_EDGES.map((edge) => ({ ...edge }));

test("project map centers NCP interfaces and keeps library dependencies distinct", () => {
  assert.doesNotThrow(() => validateEcosystemEdges(nodes, copy()));
  const runtime = ECOSYSTEM_EDGES.filter((edge) => edge.kind === "protocol");
  assert.equal(runtime.length, 4);
  assert.ok(runtime.every((edge) => edge.a === "ncp"));
  assert.deepEqual(runtime.map((edge) => edge.role).sort(), ["body", "capture", "monitor", "neural"]);
  assert.deepEqual(ECOSYSTEM_EDGES.filter((edge) => edge.kind === "contract").map((edge) => [edge.a, edge.b]), [["ncp", "haldir"]]);
  assert.deepEqual(ECOSYSTEM_EDGES.filter((edge) => edge.kind === "library").map((edge) => [edge.a, edge.b]), [["galadriel", "pidrs"], ["prisoma", "pidrs"], ["engram", "cortexel"]]);
});

test("every edge names its evidence and Haldir's interface follows its declared wire", () => {
  for (const edge of ECOSYSTEM_EDGES) assert.ok(edge.evidence && edge.evidence.length > 10, `${edge.a}-${edge.b} lacks evidence`);
  assert.throws(() => validateEcosystemEdges(nodes, copy().map((edge) => ({ ...edge, evidence: undefined }))), /without evidence/);
  const haldir = ECOSYSTEM_EDGES.find((edge) => edge.b === "haldir");
  assert.ok(haldir.label.includes(HALDIR_NCP.wire) && haldir.evidence.includes(HALDIR_NCP.crate));
  assert.ok(EDGE_TYPES.contract.label.includes(HALDIR_NCP.wire));
});

test("environment relation is directional, qualified, and separate from runtime channels", () => {
  assert.doesNotThrow(() => validateEcosystemEdges(nodes, copy()));
  const without = copy().filter((edge) => edge.kind !== "environment");
  const environment = copy().find((edge) => edge.kind === "environment");
  assert.deepEqual([environment.a, environment.b], ["crebain", "prisoma"]);
  assert.throws(() => validateEcosystemEdges(nodes, without), /Missing/);
  for (const change of [
    { a: "prisoma", b: "crebain" },
    { a: "engram" },
    { b: "galadriel" },
    { kind: "protocol" },
    { kind: "dataset" },
  ]) assert.throws(() => validateEcosystemEdges(nodes, [...without, { ...environment, ...change }]));
  for (const theme of ["light", "dark"]) {
    const svg = readFileSync(new URL(`../assets/work-graph-${theme}.svg`, import.meta.url), "utf8");
    assert.equal((svg.match(/data-edge-kind="environment"/g) || []).length, 1);
    assert.match(svg, /data-edge-kind="environment" data-from="crebain" data-to="prisoma"/);
    assert.match(svg, />Sensor data</);
    assert.doesNotMatch(svg, /sensor path tested/);
    assert.doesNotMatch(svg, /class="edge-label[^"]*">[^<]*[Cc]andidate/);
    assert.match(svg, /\.edge-environment\s*\{[^}]*stroke-dasharray: 16 7/);
  }
});

test("policy, direct telemetry, and observer command routes fail graph admission", () => {
  for (const edge of [
    { a: "ncp", b: "haldir", kind: "protocol", label: "NCP" },
    { a: "engram", b: "haldir", kind: "research", label: "Unsupported" },
    { a: "haldir", b: "galadriel", kind: "research", label: "Unsupported" },
    { a: "crebain", b: "galadriel", kind: "research", label: "Unsupported" },
    { a: "ncp", b: "pidrs", kind: "protocol", label: "NCP" },
    { a: "crebain", b: "pidrs", kind: "library", label: "Unverified library" },
  ]) assert.throws(() => validateEcosystemEdges(nodes, [...copy(), edge]));
  const promoted = copy();
  promoted.find((edge) => edge.b === "galadriel" && edge.kind === "protocol").role = "body";
  assert.throws(() => validateEcosystemEdges(nodes, promoted), /Wrong runtime role/);
});

test("missing, duplicate, unknown, and unclassified graph paths fail admission", () => {
  assert.throws(() => validateEcosystemEdges(nodes, copy().slice(1)), /Missing/);
  assert.throws(() => validateEcosystemEdges(nodes, [...copy(), copy()[0]]), /Duplicate/);
  assert.throws(() => validateEcosystemEdges(nodes, [...copy(), { a: "pidrs", b: "unknown", kind: "library" }]), /Unknown/);
  assert.throws(() => validateEcosystemEdges(nodes, [...copy(), { a: "cortexel", b: "pidrs" }]), /Unclassified/);
});

test("both SVG views retain accessible candidate and exclusion boundaries in both themes", () => {
  for (const view of ["work-graph", "work-graph-local"]) {
    for (const theme of ["light", "dark"]) {
      const svg = readFileSync(new URL(`../assets/${view}-${theme}.svg`, import.meta.url), "utf8");
      assert.match(svg, /role="img"/);
      assert.match(svg, /<title(?:\s|>)/);
      assert.match(svg, /<desc(?:\s|>)/);
      assert.match(svg, /prefers-reduced-motion:\s*reduce/);
      assert.match(svg, /Haldir authorizes commands through its own NCP 1\.0 interface/);
      assert.match(svg, /never send commands/);
      assert.doesNotMatch(svg, /\bNEST\b/);
      assert.doesNotMatch(svg, /Haldir-local signed intent|deny-only assessment|out-of-band CREBAIN telemetry/);
      assert.doesNotMatch(svg, /<script\b|javascript:|(?:href|src)=["']https?:/i);
    }
  }
});

test("visible and plain-text profile surfaces describe the projects and their connections", () => {
  for (const file of ["README.md", "docs/index.html", "docs/llms.txt"]) {
    const source = readFileSync(new URL(`../${file}`, import.meta.url), "utf8")
      .replaceAll("&#39;", "'").replaceAll("&quot;", '"').replaceAll("&amp;", "&");
    for (const field of ["status", "boundary", "availability", "monitor", "overview", "composition", "target", "sensors", "example", "assets", "environment", "reading", "pidPaths"]) {
      assert.ok(source.includes(LOCAL_NCP[field]), `${file} omits ${field}`);
    }
    if (file.endsWith(".txt")) continue;
    assert.ok(source.includes('href="https://sepahead.github.io/sepahead/diagrams/"'));
    assert.ok(source.includes('href="https://sepahead.github.io/sepahead/diagrams/?view=local"'));
    for (const view of ["work-graph", "work-graph-local"]) {
      for (const theme of ["light", "dark"]) assert.ok(source.includes(`href="https://raw.githubusercontent.com/sepahead/sepahead/main/assets/${view}-${theme}.svg"`));
    }
  }
});

test("asset and model suppliers flow into the simulator with their own kind", () => {
  for (const [provider, kind] of [["cobotatlas", "dataset"], ["reliefatlas", "dataset"], ["melkor", "tool"], ["manwe", "tool"]]) {
    assert.ok(ECOSYSTEM_EDGES.some((edge) => edge.a === provider && edge.b === "crebain" && edge.kind === kind));
    assert.throws(() => validateEcosystemEdges(nodes, [...copy(), { a: provider, b: "prisoma", kind, label: "Scene inputs", evidence: "none in code" }]), /environment owner/);
  }
  const flipped = copy().map((edge) => (edge.a === "melkor" ? { ...edge, kind: "dataset" } : edge));
  assert.throws(() => validateEcosystemEdges(nodes, flipped), /environment owner/);
});

test("arrowheads carry one meaning: filled for flow, open for library use", () => {
  for (const theme of ["light", "dark"]) {
    const svg = readFileSync(new URL(`../assets/work-graph-${theme}.svg`, import.meta.url), "utf8");
    assert.equal((svg.match(/<path class="edge-library-head"/g) || []).length, 3);
    assert.equal((svg.match(/<polygon class="edge-supply-head"/g) || []).length, 4);
    assert.equal((svg.match(/<polygon class="edge-environment-head"/g) || []).length, 1);
    assert.match(svg, /\.edge-library-head\s*\{[^}]*stroke:/);
    assert.match(svg, /CREBAIN has no pid-rs dependency/);
  }
});

test("viewer SVG copies preserve the exact generated diagrams", () => {
  for (const stem of ["work-graph", "work-graph-local", "work-graph-still", "work-graph-local-still"]) {
    for (const theme of ["light", "dark"]) {
      const filename = `${stem}-${theme}.svg`;
      assert.deepEqual(readFileSync(new URL(`../docs/diagrams/${filename}`, import.meta.url)),
        readFileSync(new URL(`../assets/${filename}`, import.meta.url)));
    }
  }
});

test("static diagrams remove SMIL instructions and suppress CSS motion", () => {
  for (const stem of ["work-graph", "work-graph-local"]) {
    for (const theme of ["light", "dark"]) {
      const svg = readFileSync(new URL(`../assets/${stem}-still-${theme}.svg`, import.meta.url), "utf8");
      assert.doesNotMatch(svg, /<(?:animate|animateMotion|animateTransform|set)\b/);
      assert.match(svg, /\* \{ animation: none !important; transition: none !important; \}/);
    }
  }
});


test("connection meaning survives without color or motion", () => {
  for (const theme of ["light", "dark"]) {
    const svg = readFileSync(new URL(`../assets/work-graph-${theme}.svg`, import.meta.url), "utf8");
    for (const { label } of Object.values(EDGE_TYPES)) assert.ok(svg.includes(label));
    assert.match(svg, /\.edge-library\s*\{[^}]*stroke-dasharray: 8 5/);
    assert.match(svg, /\.edge-dataset\s*\{[^}]*stroke-dasharray: 1 6/);
    assert.match(svg, /\.edge-contract\s*\{[^}]*stroke-dasharray: 10 4 2 4/);
    assert.equal((svg.match(/data-edge-kind="protocol"/g) || []).length, 4);
    assert.equal((svg.match(/data-edge-kind="protocol" data-from="ncp"/g) || []).length, 4);
    assert.match(svg, /not a required all-project deployment/);
    assert.match(svg, /\.edge-tool\s*\{[^}]*stroke-dasharray: 6 5/);
    assert.doesNotMatch(svg, /\.edge-tool\s*\{[^}]*animation:/);
    assert.doesNotMatch(svg, /<text[^>]*>(?:v0\.8|Optional PID library|PID \/ runlog)<\/text>/i);
    assert.doesNotMatch(svg, /<text[^>]*>[^<]*research/i);
  }
});
