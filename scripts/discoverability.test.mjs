import assert from "node:assert/strict";
import { lstatSync, readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import { inflateSync } from "node:zlib";

import { PROJECTS } from "./data.mjs";

const SITE_URL = "https://sepahead.github.io/sepahead/";
const CV_URL = `${SITE_URL}cv/`;
const MURAL_URL = `${SITE_URL}mural/`;
const MURAL_ATLAS_URL = `${MURAL_URL}atlas/`;
const CV_EN_URL = `${CV_URL}Sepehr_Mahmoudian_CV_EN.pdf`;
const CV_DE_URL = `${CV_URL}Sepehr_Mahmoudian_CV_DE.pdf`;
const PERSON_ID = `${SITE_URL}#person`;
const ROOT_TITLE = "Sepehr Mahmoudian — Senior AI Engineer in Berlin";
const CV_TITLE = "Sepehr Mahmoudian CV / Lebenslauf — Senior AI Engineer, Berlin";
const CV_FILES = [
  "Sepehr_Mahmoudian_CV_DE.pdf",
  "Sepehr_Mahmoudian_CV_EN.pdf",
];
const HERO_LINES = [
  "Domain-specific AI Agents · Custom Harnesses · LLM/VLM Evaluation",
  "Knowledge Graphs · Graph RAG · Data Provenance · Model Validation",
  "PID · Computational Neuroscience · Robotics · Multimodal 3D Perception",
];
const HERO_CURSOR_X = [792, 792, 848];

const read = (relativePath) => readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
const homeHtml = read("docs/index.html");
const cvHtml = read("docs/cv/index.html");
const llms = read("docs/llms.txt");
const sitemap = read("docs/sitemap.xml");
const readme = read("README.md");
const syncWorkflow = read(".github/workflows/sync-private-cv.yml");

function jsonLdDocuments(html) {
  return [...html.matchAll(/<script\s+type="application\/ld\+json">([\s\S]*?)<\/script>/gi)]
    .map((match) => JSON.parse(match[1]));
}

function metaContent(html, key, value) {
  const tag = [...html.matchAll(/<meta\b[^>]*>/gi)]
    .map((match) => match[0])
    .find((candidate) => candidate.includes(`${key}="${value}"`));
  assert.ok(tag, `missing meta ${key}=${value}`);
  const content = tag.match(/\bcontent="([^"]*)"/i);
  assert.ok(content, `meta ${key}=${value} has no content`);
  return content[1];
}

function elementText(html, tagName) {
  const match = html.match(new RegExp(`<${tagName}[^>]*>([^<]*)<\\/${tagName}>`, "i"));
  assert.ok(match, `missing ${tagName}`);
  return match[1];
}

function decodeTextEntities(value) {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, digits) => String.fromCodePoint(Number.parseInt(digits, 16)))
    .replace(/&#([0-9]+);/g, (_, digits) => String.fromCodePoint(Number.parseInt(digits, 10)))
    .replace(/&(?:nbsp|thinsp|ensp|emsp);/gi, " ")
    .replace(/%2b/gi, "+")
    .replace(/%20/gi, " ");
}

function containsGermanMobile(value) {
  const germanMobile = /(?:tel\s*:\s*)?(?<!\d)(?:(?:(?:\+|00)?49[\s()./-]*(?:0[\s()./-]*)?)|0[\s()./-]*)?1(?:5[0-25-9]|6[023]|7\d)(?:[\s()./-]*\d){7,8}(?!\d)/i;
  const decoded = decodeTextEntities(String(value));
  const views = [
    decoded,
    decoded.replace(/<[^>]*>/g, " "),
    decoded.replace(/\\(?:\r?\n|[()\\])/g, " "),
  ];
  return views.some((candidate) => germanMobile.test(candidate));
}

function decodePdfBytes(buffer) {
  const views = [buffer.toString("latin1")];
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    views.push(buffer.subarray(2).toString("utf16le"));
  }
  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    const swapped = Buffer.allocUnsafe(buffer.length - 2);
    for (let index = 2; index + 1 < buffer.length; index += 2) {
      swapped[index - 2] = buffer[index + 1];
      swapped[index - 1] = buffer[index];
    }
    views.push(swapped.toString("utf16le"));
  }
  return views;
}

function isLikelyText(value) {
  if (!value.length) return false;
  const readable = [...value].filter((character) =>
    /[\t\r\n\x20-\x7e\u00a0-\u024f]/u.test(character)
  ).length;
  return readable / [...value].length >= 0.85;
}

function pdfTextViews(buffer) {
  const segments = [{ kind: "serialized", buffer }];
  const serialized = buffer.toString("latin1");
  const streamStart = /\bstream\r?\n/g;
  let streamIndex = 0;
  for (const match of serialized.matchAll(streamStart)) {
    const start = match.index + match[0].length;
    const end = serialized.indexOf("endstream", start);
    if (end < 0) continue;
    let stream = buffer.subarray(start, end);
    while (stream.length && (stream.at(-1) === 0x0a || stream.at(-1) === 0x0d)) {
      stream = stream.subarray(0, -1);
    }
    try {
      segments.push({ kind: `flate-stream-${streamIndex}`, buffer: inflateSync(stream) });
    } catch {
      // Not every PDF stream uses FlateDecode. The serialized bytes still get scanned.
    }
    streamIndex += 1;
  }

  const views = [];
  for (const segment of segments) {
    const decoded = decodePdfBytes(segment.buffer);
    decoded.forEach((text, index) => views.push({ kind: `${segment.kind}-bytes-${index}`, text }));
    for (const [decodedIndex, text] of decoded.entries()) {
      let hexIndex = 0;
      for (const match of text.matchAll(/<([0-9a-f\s]{8,})>/gi)) {
        const compact = match[1].replace(/\s/g, "");
        if (compact.length % 2 !== 0) continue;
        for (const decodedHex of decodePdfBytes(Buffer.from(compact, "hex")).filter(isLikelyText)) {
          views.push({ kind: `${segment.kind}-hex-${decodedIndex}-${hexIndex}`, text: decodedHex });
        }
        hexIndex += 1;
      }
      let literalIndex = 0;
      for (const match of text.matchAll(/\(((?:\\.|[^\\)])*)\)/g)) {
        views.push({
          kind: `${segment.kind}-literal-${decodedIndex}-${literalIndex}`,
          text: match[1]
            .replace(/\\([0-7]{1,3})/g, (_, octal) => String.fromCharCode(Number.parseInt(octal, 8)))
            .replace(/\\([()\\])/g, "$1"),
        });
        literalIndex += 1;
      }
    }
  }
  return views;
}

test("sitemap lists the canonical profile, mural galleries, chooser and reciprocal PDF editions", () => {
  assert.match(sitemap, /xmlns:xhtml="http:\/\/www\.w3\.org\/1999\/xhtml"/);

  const blocks = [...sitemap.matchAll(/<url>\s*([\s\S]*?)\s*<\/url>/g)]
    .map((match) => match[1]);
  const locations = blocks.map((block) => {
    const match = block.match(/<loc>([^<]+)<\/loc>/);
    assert.ok(match, "sitemap URL is missing loc");
    return match[1];
  });

  assert.deepEqual(locations, [SITE_URL, CV_URL, MURAL_URL, MURAL_ATLAS_URL, CV_EN_URL, CV_DE_URL]);

  for (const block of blocks) {
    const location = block.match(/<loc>([^<]+)<\/loc>/)[1];
    const alternatives = [...block.matchAll(/<xhtml:link\s+([^>]*?)\s*\/>/g)]
      .map((match) => {
        const language = match[1].match(/\bhreflang="([^"]+)"/);
        const href = match[1].match(/\bhref="([^"]+)"/);
        const relation = match[1].match(/\brel="([^"]+)"/);
        assert.ok(language && href && relation, `malformed alternate for ${location}`);
        return { language: language[1], href: href[1], relation: relation[1] };
      });

    if (location === CV_EN_URL || location === CV_DE_URL) {
      assert.deepEqual(alternatives, [
        { language: "en", href: CV_EN_URL, relation: "alternate" },
        { language: "de", href: CV_DE_URL, relation: "alternate" },
      ]);
    } else {
      assert.deepEqual(alternatives, []);
    }
  }
});

test("CV chooser exposes a CollectionPage and exactly two linked DigitalDocuments", () => {
  const documents = jsonLdDocuments(cvHtml);
  assert.equal(documents.length, 1);
  const graph = documents[0]["@graph"];
  assert.ok(Array.isArray(graph));

  const collection = graph.find((entity) => entity["@type"] === "CollectionPage");
  assert.ok(collection);
  assert.equal(collection.url, CV_URL);
  assert.deepEqual(collection.inLanguage, ["en", "de"]);
  assert.equal(collection.about["@id"], PERSON_ID);

  const digitalDocuments = graph.filter((entity) => entity["@type"] === "DigitalDocument");
  assert.equal(digitalDocuments.length, 2);
  const expected = new Map([
    [CV_EN_URL, "en"],
    [CV_DE_URL, "de"],
  ]);

  for (const document of digitalDocuments) {
    assert.equal(document.inLanguage, expected.get(document.url));
    assert.equal(document.encodingFormat, "application/pdf");
    assert.equal(document.author["@id"], PERSON_ID);
    assert.equal(document.about["@id"], PERSON_ID);
    assert.equal(document.isPartOf["@id"], collection["@id"]);
    expected.delete(document.url);
  }
  assert.equal(expected.size, 0);
  assert.deepEqual(
    collection.hasPart.map((item) => item["@id"]).sort(),
    digitalDocuments.map((document) => document["@id"]).sort()
  );
});

test("stable PDF URLs are discoverable from every canonical public text surface", () => {
  for (const [name, content] of [
    ["home", homeHtml],
    ["CV chooser", cvHtml],
    ["sitemap", sitemap],
    ["llms.txt", llms],
    ["README", readme],
  ]) {
    assert.ok(content.includes(CV_EN_URL), `${name} omits the English PDF URL`);
    assert.ok(content.includes(CV_DE_URL), `${name} omits the German PDF URL`);
  }

  const head = cvHtml.match(/<head>([\s\S]*?)<\/head>/i)?.[1] ?? "";
  assert.doesNotMatch(head, /<link\b[^>]*\bhreflang=/i);
  assert.match(cvHtml, new RegExp(`<a\\b[^>]*href="${CV_EN_URL.replaceAll(".", "\\.")}"[^>]*hreflang="en"`));
  assert.match(cvHtml, new RegExp(`<a\\b[^>]*href="${CV_DE_URL.replaceAll(".", "\\.")}"[^>]*hreflang="de"`));
});

test("public CV directory is a closed set of regular files with no private artifacts", () => {
  const cvDirectory = new URL("../docs/cv/", import.meta.url);
  const entries = readdirSync(cvDirectory, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name));

  assert.deepEqual(entries.map((entry) => entry.name), ["index.html", ...CV_FILES]);
  for (const entry of entries) {
    const details = lstatSync(new URL(entry.name, cvDirectory));
    assert.ok(entry.isFile(), `${entry.name} is not a regular directory entry`);
    assert.ok(details.isFile(), `${entry.name} is not a regular file`);
    assert.ok(!entry.isSymbolicLink() && !details.isSymbolicLink(), `${entry.name} must not be a symlink`);
  }
});

test("phone detector covers tel links, metadata and common German representations", () => {
  const mobilePrefix = ["15", "1"].join("");
  const subscriber = ["234", "56", "789"].join("");
  for (const fixture of [
    `<a href="tel:+49 ${mobilePrefix} ${subscriber}">Call</a>`,
    `<meta name="contact" content="+49 (0) ${mobilePrefix} / 234 56 789">`,
    `<meta property="contact:phone_number" content="0049 ${mobilePrefix} ${subscriber}">`,
    `Telefon: 0${mobilePrefix} ${subscriber}`,
    `Mobile: ${mobilePrefix}-2345-6789`,
    `<a href="tel:%2B49%20${mobilePrefix}%20${subscriber}">Call</a>`,
  ]) {
    assert.ok(containsGermanMobile(fixture), `detector missed ${fixture}`);
  }
  assert.ok(!containsGermanMobile("NCP v0.8.0; 2,023 meshes; DOI 10.5281/zenodo.20697491"));
});

test("published PDF bytes are phone-free and originate from the hardened web gate", () => {
  assert.match(syncWorkflow, /working-directory:\s*source\/final_generic[\s\S]*?run:\s*make -B verify-web/);
  assert.match(syncWorkflow, /cp main_en_web\.pdf release-web\/Sepehr_Mahmoudian_CV_EN\.pdf/);
  assert.match(syncWorkflow, /cp main_de_web\.pdf release-web\/Sepehr_Mahmoudian_CV_DE\.pdf/);
  assert.doesNotMatch(syncWorkflow, /cp\s+main_(?:en|de)\.pdf\s/);

  for (const filename of CV_FILES) {
    const buffer = readFileSync(new URL(`../docs/cv/${filename}`, import.meta.url));
    assert.equal(buffer.subarray(0, 5).toString("ascii"), "%PDF-", `${filename} is not a PDF`);
    assert.match(buffer.subarray(-1024).toString("latin1"), /%%EOF\s*$/, `${filename} has no terminal EOF marker`);
    for (const view of pdfTextViews(buffer)) {
      assert.doesNotMatch(view.text, /\b(?:tel|phone|telephone)\s*:/i, `${filename} carries a phone annotation in ${view.kind}`);
      const textOperand = /-(?:hex|literal)-/.test(view.kind);
      const labeledField = /\b(?:tel|phone|telephone|contact)\b/i.test(view.text);
      if (textOperand || labeledField) {
        assert.ok(!containsGermanMobile(view.text), `${filename} exposes a German mobile number in ${view.kind}`);
      }
    }
  }
});

test("professional title and answer-engine topics remain synchronized", () => {
  assert.equal(elementText(homeHtml, "title"), ROOT_TITLE);
  assert.equal(metaContent(homeHtml, "property", "og:title"), ROOT_TITLE);
  assert.equal(metaContent(homeHtml, "name", "twitter:title"), ROOT_TITLE);
  assert.match(homeHtml, /<span class="role">Senior AI Engineer<\/span>/);

  const rootGraph = jsonLdDocuments(homeHtml)[0]["@graph"];
  const profile = rootGraph.find((entity) => entity["@type"] === "ProfilePage");
  const person = rootGraph.find((entity) => entity["@type"] === "Person");
  assert.equal(profile.name, ROOT_TITLE);
  assert.equal(person.jobTitle, "Senior AI Engineer");

  const requiredTopics = [
    "Domain-specific AI agents and custom harnesses",
    "LLM and VLM evaluation",
    "AI traceability and observability",
    "Langfuse",
    "Knowledge graphs",
    "Graph RAG",
    "Partial Information Decomposition",
    "Information-theoretic representation analysis",
    "Computational neuroscience",
    "Multimodal 3D perception",
    "Data provenance",
    "Model validation",
  ];
  for (const topic of requiredTopics) assert.ok(person.knowsAbout.includes(topic), `missing ${topic}`);

  assert.equal(elementText(cvHtml, "title"), CV_TITLE);
  assert.equal(metaContent(cvHtml, "property", "og:title"), CV_TITLE);
  assert.equal(metaContent(cvHtml, "name", "twitter:title"), CV_TITLE);
  assert.match(llms, /Berlin-based Senior AI Engineer/);
  assert.match(llms, /## Current research/);

  for (const [name, content] of [
    ["home", homeHtml],
    ["CV chooser", cvHtml],
    ["llms.txt", llms],
    ["README", readme],
    ["dark hero", read("assets/hero-dark.svg")],
    ["light hero", read("assets/hero-light.svg")],
  ]) {
    assert.doesNotMatch(content, /AI\/ML Engineer/i, `${name} carries the retired job title`);
    assert.match(content, /domain-specific/i, `${name} omits the domain-specific scope`);
    assert.match(content, /harness/i, `${name} omits the agent-harness scope`);
  }
});

test("animated hero themes show only current, evidence-backed focus terms", () => {
  const homeText = homeHtml.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").toLowerCase();
  const staleTerms = [
    "Continual Learning",
    "AI / ML",
    "Neural Networks",
    "Neurorobotics",
    "Sensor Fusion",
    "Drone Detection",
    "Scene Reconstruction",
  ];

  for (const filename of ["assets/hero-dark.svg", "assets/hero-light.svg"]) {
    const hero = read(filename);
    const visibleLines = [...hero.matchAll(/<text\b[^>]*class="role seq[123]"[^>]*>([^<]+)<\/text>/g)]
      .map((match) => match[1]);
    assert.deepEqual(visibleLines, HERO_LINES, `${filename} has stale or divergent animated copy`);

    for (const term of HERO_LINES.join(" · ").split(" · ")) {
      assert.ok(homeText.includes(term.toLowerCase()), `${filename} term is absent from visible profile copy: ${term}`);
    }
    for (const stale of staleTerms) assert.ok(!hero.includes(stale), `${filename} retains ${stale}`);

    assert.match(hero, /<title>Sepehr Mahmoudian — Senior AI Engineer, Berlin<\/title>/);
    const description = hero.match(/<desc>([^<]+)<\/desc>/)?.[1] ?? "";
    for (const term of ["Partial Information Decomposition", "data provenance", "model validation"]) {
      assert.ok(description.toLowerCase().includes(term.toLowerCase()), `${filename} description omits ${term}`);
    }
    assert.match(hero, /\.seq1 \{ animation: seq1 15s linear infinite; \}/);
    assert.match(hero, /@media \(prefers-reduced-motion: reduce\)/);
    assert.match(hero, /\.seq1, \.seq2, \.seq3, \.cur1, \.cur2, \.cur3 \{ animation: none; \}/);
    assert.match(hero, /class="role seq1" opacity="1"/);
    assert.match(hero, /class="role seq2" opacity="0"/);
    assert.match(hero, /class="role seq3" opacity="0"/);

    const cursors = [...hero.matchAll(/<rect x="([0-9.]+)"[^>]*width="([0-9.]+)"[^>]*class="role-cur cur[123]"\/>/g)];
    assert.equal(cursors.length, 3);
    assert.deepEqual(cursors.map((cursor) => Number(cursor[1])), HERO_CURSOR_X);
    for (const cursor of cursors) {
      assert.ok(Number(cursor[1]) + Number(cursor[2]) <= 860, `${filename} cursor exceeds its viewBox`);
    }
  }
});

test("Engram card exposes research and pending-publication boundaries without stars", () => {
  const engram = PROJECTS.find((project) => project.slug === "engram");
  assert.ok(engram);
  assert.equal(engram.phase, "research");
  assert.equal(engram.stars, undefined);
  assert.match(engram.desc, /Public source pending\./);
  assert.match(engram.summary, /research-stage, domain-specific AI agent with a custom harness/i);
  assert.match(engram.summary, /biophysical and functional neural models/i);
  assert.match(engram.summary, /provenance-aware, closed-loop computational-neuroscience simulations/i);
  assert.match(engram.summary, /reproducible R&D/i);
  assert.match(engram.summary, /public repository remains a placeholder pending source publication/i);
  assert.match(engram.summary, /does not claim general paper reproduction or validated scientific results/i);

  for (const filename of ["assets/work-card-engram-dark.svg", "assets/work-card-engram-light.svg"]) {
    const card = read(filename);
    assert.match(card, /aria-label="engram \(research\):/);
    assert.match(card, /class="badge c0">research<\/text>/);
    assert.doesNotMatch(card, /class="badge c0">\d+<\/text>/);
    const descriptionLines = [...card.matchAll(/<text\b[^>]*class="desc">([\s\S]*?)<\/text>/g)]
      .map((match) => match[1].replace(/<[^>]+>/g, ""));
    assert.ok(descriptionLines.length <= 3);
    assert.ok(!descriptionLines.some((line) => line.includes("…")));
    assert.equal(descriptionLines.join(" "), engram.desc);
  }
});

test("Melkor copy is deterministic-conversion focused and carries release boundaries", () => {
  const melkor = PROJECTS.find((project) => project.slug === "melkor");
  assert.ok(melkor);
  for (const field of [melkor.headline, melkor.desc, melkor.summary, melkor.status]) {
    assert.doesNotMatch(field, /\b(?:CPU|GPU)\b/i);
  }
  assert.match(melkor.summary, /deterministic 3D Gaussian Splatting \(3DGS\) conversion across PLY, SPZ and glTF/i);
  assert.match(melkor.summary, /field provenance, bounds and numeric hazards/i);
  assert.match(melkor.summary, /release candidate is source-only; no production binary is currently supported/i);

  for (const filename of ["assets/work-card-melkor-dark.svg", "assets/work-card-melkor-light.svg"]) {
    const card = read(filename);
    assert.doesNotMatch(card, /\b(?:CPU|GPU)\b/i);
    const descriptionLines = [...card.matchAll(/<text\b[^>]*class="desc">([\s\S]*?)<\/text>/g)]
      .map((match) => match[1].replace(/<[^>]+>/g, ""));
    assert.ok(descriptionLines.length <= 3);
    assert.ok(!descriptionLines.some((line) => line.includes("…")));
    assert.equal(descriptionLines.join(" "), melkor.desc);
  }

  for (const [name, content] of [
    ["home", homeHtml],
    ["llms.txt", llms],
    ["README", readme],
  ]) {
    const mentions = content.match(/[^\n]*(?:melkor|Melkor)[^\n]*/g) ?? [];
    assert.ok(mentions.length, `${name} omits Melkor`);
    assert.doesNotMatch(mentions.join("\n"), /\b(?:CPU|GPU)\b/i, `${name} markets Melkor by processor class`);
  }
});

test("public raw textual and attribute surfaces contain no German mobile number", () => {
  for (const [name, content] of [
    ["home", homeHtml],
    ["CV chooser", cvHtml],
    ["llms.txt", llms],
    ["sitemap", sitemap],
    ["README", readme],
  ]) {
    assert.ok(!containsGermanMobile(content), `${name} contains a German mobile number`);
    assert.doesNotMatch(content, /\b(?:tel|phone|telephone)\s*:/i, `${name} carries a phone link or field`);
  }
});
