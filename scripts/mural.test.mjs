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

test("visible profile and homepage omit the mural while direct archive access remains", () => {
  const markdown = read(join(ROOT, "README.md"));
  const homepage = read(join(ROOT, "docs", "index.html"));
  const llms = read(join(ROOT, "docs", "llms.txt"));
  const sitemap = read(join(ROOT, "docs", "sitemap.xml"));
  const archiveUrl = "https://sepahead.github.io/sepahead/mural/";

  assert.doesNotMatch(markdown, /title-frontier-(?:dark|light)\.svg|from-signal-to-frontier-(?:dark|light)\.svg/);
  assert.doesNotMatch(homepage, /class="story"|id="from-signal-to-frontier"|mural\/assets\//);
  assert.match(markdown, new RegExp(archiveUrl.replaceAll(".", "\\.")));
  assert.match(llms, /## Unlisted mural archive/);
  assert.ok(llms.includes(archiveUrl));
  assert.ok(sitemap.includes(`<loc>${archiveUrl}</loc>`));
  assert.ok(existsSync(join(DOCS, "index.html")));
  assert.ok(existsSync(join(DOCS, "atlas", "index.html")));
});

test("mural generator cannot reintroduce a visible profile embed", () => {
  const generator = read(join(ROOT, "scripts", "generate-mural-system.py"));
  const insert = generator.match(/def readme_insert\(\) -> str:\n([\s\S]*?)\n\ndef package_readme/);
  assert.ok(insert, "readme_insert generator is missing");
  assert.match(insert[1], /intentionally unlisted/i);
  assert.match(insert[1], /https:\/\/sepahead\.github\.io\/sepahead\/mural\//);
  assert.doesNotMatch(insert[1], /<h3|<picture|<img|title-frontier|from-signal-to-frontier-(?:dark|light)\.svg/);
});

test("visible section numbering starts at Pulse and stays contiguous", () => {
  const expected = [
    ["pulse", "01"],
    ["work", "02"],
    ["toolbox", "03"],
    ["agentic", "04"],
    ["elsewhere", "05"],
  ];
  for (const [slug, index] of expected) {
    for (const theme of ["dark", "light"]) {
      assert.match(read(join(ROOT, "assets", `title-${slug}-${theme}.svg`)), new RegExp(`>${index}<\\/text>`));
    }
  }
});

test("archived primary mural pair is accessible, self-contained, and reduced-motion safe", () => {
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
