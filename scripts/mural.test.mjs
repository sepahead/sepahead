import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import test from "node:test";

const ROOT = resolve(new URL("..", import.meta.url).pathname);
const DOCS = join(ROOT, "docs", "mural");

function filesUnder(root, extension) {
  const found = [];
  for (const name of readdirSync(root)) {
    const path = join(root, name);
    if (statSync(path).isDirectory()) found.push(...filesUnder(path, extension));
    else if (extname(path) === extension) found.push(path);
  }
  return found;
}

function read(path) {
  return readFileSync(path, "utf8");
}

test("profile places the narrative after the social strip and before activity", () => {
  const markdown = read(join(ROOT, "README.md"));
  const social = markdown.indexOf("social-x-light.svg");
  const mural = markdown.indexOf("from-signal-to-frontier-dark.svg");
  const pulse = markdown.indexOf("title-pulse-dark.svg");
  assert.ok(social >= 0 && mural > social && pulse > mural);
  assert.match(markdown, /Solid paths mean directly inspectable evidence/i);
  assert.match(markdown, /future thesis is translucent/i);
});

test("section numbering now starts with the founder story", () => {
  assert.match(read(join(ROOT, "assets", "title-frontier-dark.svg")), />01<\/text>/);
  assert.match(read(join(ROOT, "assets", "title-pulse-dark.svg")), />02<\/text>/);
  assert.match(read(join(ROOT, "assets", "title-work-dark.svg")), />03<\/text>/);
});

test("profile mural pair is accessible, self-contained, and reduced-motion safe", () => {
  for (const theme of ["dark", "light"]) {
    const svg = read(join(ROOT, "assets", `from-signal-to-frontier-${theme}.svg`));
    assert.match(svg, /^<svg[^>]+role="img"[^>]+aria-labelledby=/);
    assert.match(svg, /<title id=/);
    assert.match(svg, /<desc id=/);
    assert.match(svg, /prefers-reduced-motion:\s*reduce/);
    assert.match(svg, /84S LOOP/);
    assert.doesNotMatch(svg, /<script\b|javascript:|(?:href|src)=["']https?:|url\(\s*https?:/i);
    assert.doesNotMatch(svg, /<image\b/i);
  }
});

test("deeper gallery ships five master pairs and twenty-five concept pairs", () => {
  const masters = filesUnder(join(DOCS, "assets"), ".svg");
  const atlas = filesUnder(join(DOCS, "atlas", "murals"), ".svg");
  assert.equal(masters.length, 10);
  assert.equal(atlas.length, 50);

  for (const svgPath of [...masters, ...atlas]) {
    const svg = read(svgPath);
    assert.match(svg, /^<svg/);
    assert.match(svg, /<title id=/);
    assert.match(svg, /<desc id=/);
    assert.match(svg, /prefers-reduced-motion:\s*reduce/);
    assert.doesNotMatch(svg, /<script\b|javascript:|(?:href|src)=["']https?:|url\(\s*https?:/i);
  }
});

test("local mural gallery links resolve", () => {
  for (const htmlPath of [join(DOCS, "index.html"), join(DOCS, "atlas", "index.html")]) {
    const source = read(htmlPath);
    const base = dirname(htmlPath);
    const links = [...source.matchAll(/(?:href|src|data|data-dark|data-light)="([^"#]+)"/g)]
      .map((match) => match[1])
      .filter((value) => !/^(?:https?:|mailto:|data:)/.test(value))
      .filter((value) => !value.endsWith("/"));
    for (const link of links) {
      assert.ok(existsSync(resolve(base, link)), `${htmlPath}: missing ${link}`);
    }
  }
});
