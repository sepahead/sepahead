import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { ECOSYSTEM_EDGES, EDGE_TYPES, LOCAL_NCP, validateEcosystemEdges } from "./ecosystem.mjs";
import { nodes } from "./work-graph.mjs";

const copy = () => ECOSYSTEM_EDGES.map((edge) => ({ ...edge }));

test("project map centers NCP interfaces and keeps library dependencies distinct", () => {
  assert.doesNotThrow(() => validateEcosystemEdges(nodes, copy()));
  const runtime = ECOSYSTEM_EDGES.filter((edge) => edge.kind === "protocol");
  assert.equal(runtime.length, 4);
  assert.ok(runtime.every((edge) => edge.a === "ncp"));
  assert.deepEqual(runtime.map((edge) => edge.role).sort(), ["body", "capture", "monitor", "neural"]);
  assert.deepEqual(ECOSYSTEM_EDGES.filter((edge) => edge.kind === "contract").map((edge) => [edge.a, edge.b]), [["ncp", "haldir"]]);
  assert.deepEqual(ECOSYSTEM_EDGES.filter((edge) => edge.kind === "library").map((edge) => [edge.a, edge.b]), [["galadriel", "pidrs"], ["prisoma", "pidrs"]]);
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
      assert.match(svg, /qualification.*open/);
      assert.match(svg, /[Gg]ated requests (?:must be rejected|are rejected) before (?:endpoint )?preparation/);
      assert.doesNotMatch(svg, /\bNEST\b/);
      assert.doesNotMatch(svg, /Haldir-local signed intent|deny-only assessment|out-of-band CREBAIN telemetry/);
      assert.doesNotMatch(svg, /<script\b|javascript:|(?:href|src)=["']https?:/i);
    }
  }
});

test("visible and plain-text profile surfaces preserve scope, abstention, and private-source limits", () => {
  for (const file of ["README.md", "docs/index.html", "docs/llms.txt"]) {
    const source = readFileSync(new URL(`../${file}`, import.meta.url), "utf8")
      .replaceAll("&#39;", "'").replaceAll("&quot;", '"').replaceAll("&amp;", "&");
    for (const field of ["status", "boundary", "availability", "monitor", "overview", "example"]) {
      assert.ok(source.includes(LOCAL_NCP[field]), `${file} omits ${field}`);
    }
    if (file.endsWith(".txt")) continue;
    for (const view of ["work-graph", "work-graph-local"]) {
      for (const theme of ["light", "dark"]) assert.ok(source.includes(`href="https://raw.githubusercontent.com/sepahead/sepahead/main/assets/${view}-${theme}.svg"`));
    }
  }
});


test("connection meaning survives without color or motion", () => {
  for (const theme of ["light", "dark"]) {
    const svg = readFileSync(new URL(`../assets/work-graph-${theme}.svg`, import.meta.url), "utf8");
    for (const { label } of Object.values(EDGE_TYPES)) assert.ok(svg.includes(label));
    assert.match(svg, /\.edge-library\s*\{[^}]*stroke-dasharray: 8 5/);
    assert.match(svg, /\.edge-research\s*\{[^}]*stroke-dasharray: 1 6/);
    assert.match(svg, /\.edge-contract\s*\{[^}]*stroke-dasharray: 10 4 2 4/);
    assert.equal((svg.match(/data-edge-kind="protocol"/g) || []).length, 4);
    assert.equal((svg.match(/data-edge-kind="protocol" data-from="ncp"/g) || []).length, 4);
    assert.match(svg, /not a required all-project deployment/);
    assert.match(svg, /\.edge-tool\s*\{[^}]*stroke-dasharray: 7 13/);
    assert.match(svg, /\.edge-tool\s*\{[^}]*animation: none/);
    assert.doesNotMatch(svg, /<text[^>]*>(?:v0\.8|Optional PID library|PID \/ runlog)<\/text>/i);
    assert.doesNotMatch(svg, /<text[^>]*>[^<]*research/i);
  }
});
