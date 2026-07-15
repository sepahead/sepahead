#!/usr/bin/env node
// Keep every machine- and human-readable Selected Work surface in lockstep.
//
//   node scripts/sync-selected-work.mjs --write
//   node scripts/sync-selected-work.mjs --check
//
// The visual card copy remains in PROJECTS.desc. The longer PROJECTS.summary
// is rendered verbatim into visible HTML, JSON-LD and llms.txt so crawlers are
// never shown a claim that people cannot see. Zero dependencies; deterministic.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PROJECTS, REPOS, SOCIALS } from "./data.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const SITE_URL = "https://sepahead.github.io/sepahead/";
const PERSON_ID = `${SITE_URL}#person`;
const WEBSITE_ID = `${SITE_URL}#website`;
const PROFILE_ID = `${SITE_URL}#profilepage`;
const WORK_ID = `${SITE_URL}#selected-work`;
const AVATAR_URL = "https://github.com/sepahead.png";
const DATE_CREATED = "2026-06-21";
const DATE_MODIFIED = "2026-07-15";
const MODES = new Set(["--write", "--check"]);
const mode = process.argv[2];

if (!MODES.has(mode) || process.argv.length !== 3) {
  console.error("usage: node scripts/sync-selected-work.mjs --write|--check");
  process.exit(2);
}

const allowedSchemaTypes = new Set(["SoftwareSourceCode", "Dataset", "CreativeWork"]);
const allowedLicenses = new Set(["MIT", "Apache-2.0"]);
const allowedSchemaRelations = new Set(["sameAs", "isBasedOn"]);
const plainTextFields = ["name", "slug", "headline", "desc", "summary", "status"];
const seenSlugs = new Set();
const seenRepos = new Set();

for (const [index, project] of PROJECTS.entries()) {
  for (const field of plainTextFields) {
    if (typeof project[field] !== "string" || !project[field].trim()) {
      throw new Error(`PROJECTS[${index}].${field} must be non-empty text`);
    }
    if (/[<>\r\n]/.test(project[field])) {
      throw new Error(`PROJECTS[${index}].${field} must be plain single-line text`);
    }
  }
  if (project.alternateName && /[<>\r\n]/.test(project.alternateName)) {
    throw new Error(`PROJECTS[${index}].alternateName must be plain single-line text`);
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(project.slug)) {
    throw new Error(`invalid project slug: ${project.slug}`);
  }
  if (seenSlugs.has(project.slug)) throw new Error(`duplicate project slug: ${project.slug}`);
  seenSlugs.add(project.slug);
  if (!/^sepahead\/[A-Za-z0-9._-]+$/.test(project.repo)) {
    throw new Error(`invalid public repository: ${project.repo}`);
  }
  if (seenRepos.has(project.repo.toLowerCase())) throw new Error(`duplicate repository: ${project.repo}`);
  seenRepos.add(project.repo.toLowerCase());
  if (project.private) throw new Error(`${project.name} is public and must not carry a private flag`);
  if (!allowedSchemaTypes.has(project.schemaType)) {
    throw new Error(`unsupported schema type for ${project.name}: ${project.schemaType}`);
  }
  if (!Array.isArray(project.stack) || project.stack.length === 0) {
    throw new Error(`${project.name}.stack must be a non-empty array`);
  }
  if (!Array.isArray(project.languages) || !Array.isArray(project.licenses)) {
    throw new Error(`${project.name} languages/licenses must be arrays`);
  }
  for (const license of project.licenses) {
    if (!allowedLicenses.has(license)) throw new Error(`unsupported SPDX id for ${project.name}: ${license}`);
  }
  for (const link of project.externalLinks || []) {
    if (!link.label || !link.kind || !/^https:\/\//.test(link.url)) {
      throw new Error(`invalid external link for ${project.name}`);
    }
    if (link.kind === "doi" && !/^10\.\d{4,9}\/.+/.test(link.identifier || "")) {
      throw new Error(`invalid DOI identifier for ${project.name}`);
    }
    if (link.schemaRelation && !allowedSchemaRelations.has(link.schemaRelation)) {
      throw new Error(`invalid schema relation for ${project.name}: ${link.schemaRelation}`);
    }
  }
}

const html = (value) => String(value).replace(/[&<>"']/g, (char) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
})[char]);

const repoUrl = (project) => `https://github.com/${project.repo}`;
const markerStart = (key) => `<!-- BEGIN GENERATED:${key} -->`;
const markerEnd = (key) => `<!-- END GENERATED:${key} -->`;

function region(key, content) {
  return `${markerStart(key)}\n${content}\n${markerEnd(key)}`;
}

function replaceRegion(source, key, content, relativePath) {
  const start = markerStart(key);
  const end = markerEnd(key);
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end);
  if (startIndex < 0 || endIndex < 0 || endIndex < startIndex) {
    throw new Error(`${relativePath}: missing or reversed ${key} markers`);
  }
  if (source.indexOf(start, startIndex + start.length) >= 0 || source.indexOf(end, endIndex + end.length) >= 0) {
    throw new Error(`${relativePath}: duplicate ${key} markers`);
  }
  return source.slice(0, startIndex) + region(key, content) + source.slice(endIndex + end.length);
}

function renderReadmeCards() {
  const cells = PROJECTS.map((project) => {
    const imageBase = `https://raw.githubusercontent.com/sepahead/sepahead/main/assets/work-card-${project.slug}`;
    const title = project.alternateName
      ? `${project.name} — ${project.alternateName}: ${project.headline}`
      : `${project.name} — ${project.headline}`;
    const languageNote = project.languages.length ? ` Languages: ${project.languages.join(", ")}.` : "";
    const alt = `${project.name}: ${project.summary}${languageNote}`;
    return `    <td><a href="${repoUrl(project)}" title="${html(title)}"><picture><source media="(prefers-color-scheme: dark)" srcset="${imageBase}-dark.svg"><source media="(prefers-color-scheme: light)" srcset="${imageBase}-light.svg"><img src="${imageBase}-light.svg" width="400" alt="${html(alt)}" loading="lazy"></picture></a></td>`;
  });

  const rows = [];
  for (let index = 0; index < cells.length; index += 2) {
    rows.push(`  <tr>\n${cells.slice(index, index + 2).join("\n")}\n  </tr>`);
  }
  return `<table align="center" cellspacing="20" cellpadding="0" border="0">\n${rows.join("\n")}\n</table>`;
}

function renderVisibleWork() {
  const items = PROJECTS.map((project) => {
    const links = (project.externalLinks || [])
      .map((link) => `<a href="${html(link.url)}">${html(link.label)}</a>`)
      .join(" · ");
    const suffix = links ? ` <span aria-hidden="true">·</span> ${links}` : "";
    return `    <li class="proj" id="work-${project.slug}"><a href="${repoUrl(project)}"><b>${html(project.name)}</b></a> <span>: ${html(project.summary)}${suffix}</span></li>`;
  });
  return `<ul aria-label="Selected work">\n${items.join("\n")}\n  </ul>`;
}

function licenseUrls(project) {
  return project.licenses.map((license) => `https://spdx.org/licenses/${license}.html`);
}

function renderProjectSchema(project) {
  const sourceUrl = repoUrl(project);
  const entity = {
    "@type": project.schemaType,
    "@id": `${sourceUrl}#project`,
    name: project.name,
    url: sourceUrl,
    description: project.summary,
    creativeWorkStatus: project.status,
  };
  if (project.alternateName) entity.alternateName = project.alternateName;
  if (project.schemaType === "Dataset") {
    entity.creator = { "@id": PERSON_ID };
  } else {
    entity.author = { "@id": PERSON_ID };
  }
  if (project.schemaType === "SoftwareSourceCode") {
    entity.codeRepository = sourceUrl;
    entity.programmingLanguage = project.languages;
  }
  const licenses = licenseUrls(project);
  if (licenses.length === 1) entity.license = licenses[0];
  if (licenses.length > 1) entity.license = licenses;
  const sameAs = (project.externalLinks || [])
    .filter((link) => link.schemaRelation === "sameAs")
    .map((link) => link.url);
  if (sameAs.length) entity.sameAs = sameAs;
  const basedOn = (project.externalLinks || [])
    .filter((link) => link.schemaRelation === "isBasedOn")
    .map((link) => link.url);
  if (basedOn.length === 1) entity.isBasedOn = basedOn[0];
  if (basedOn.length > 1) entity.isBasedOn = basedOn;
  const identifiers = (project.externalLinks || [])
    .filter((link) => link.identifier && link.schemaRelation === "sameAs")
    .map((link) => `https://doi.org/${link.identifier}`);
  if (identifiers.length === 1) entity.identifier = identifiers[0];
  if (identifiers.length > 1) entity.identifier = identifiers;
  return entity;
}

function renderJsonLd() {
  const profileSameAs = ["https://github.com/sepahead", ...SOCIALS.map((social) => social.href)];
  const graph = [
    {
      "@type": "ProfilePage",
      "@id": PROFILE_ID,
      url: SITE_URL,
      name: "Sepehr Mahmoudian — AI/ML Engineer in Berlin",
      description: "Profile of Sepehr Mahmoudian, a Berlin-based AI/ML engineer working across agentic systems, computational neuroscience, robotics and 3D software in Rust and Python.",
      dateCreated: DATE_CREATED,
      dateModified: DATE_MODIFIED,
      inLanguage: "en",
      isPartOf: { "@id": WEBSITE_ID },
      mainEntity: { "@id": PERSON_ID },
      hasPart: PROJECTS.map((project) => ({ "@id": `${repoUrl(project)}#project` })),
    },
    {
      "@type": "Person",
      "@id": PERSON_ID,
      name: "Sepehr Mahmoudian",
      givenName: "Sepehr",
      familyName: "Mahmoudian",
      alternateName: "sepahead",
      url: SITE_URL,
      mainEntityOfPage: { "@id": PROFILE_ID },
      image: AVATAR_URL,
      email: "mailto:sepmhn@gmail.com",
      jobTitle: "AI/ML Engineer",
      description: "Berlin-based AI/ML engineer working across agentic systems, computational neuroscience, robotics and 3D software, primarily in Rust and Python.",
      address: { "@type": "PostalAddress", addressLocality: "Berlin", addressCountry: "DE" },
      knowsAbout: [
        "Agentic systems",
        "Computational neuroscience",
        "Information theory",
        "Neural networks",
        "Robotics",
        "Sensor fusion",
        "3D vision",
        "Gaussian splatting",
        "Rust",
        "Python",
      ],
      sameAs: profileSameAs,
    },
    {
      "@type": "WebSite",
      "@id": WEBSITE_ID,
      url: SITE_URL,
      name: "Sepehr Mahmoudian",
      dateCreated: DATE_CREATED,
      dateModified: DATE_MODIFIED,
      inLanguage: "en",
      about: { "@id": PERSON_ID },
    },
    {
      "@type": "ItemList",
      "@id": WORK_ID,
      name: "Selected work",
      numberOfItems: PROJECTS.length,
      itemListElement: PROJECTS.map((project, index) => ({
        "@type": "ListItem",
        position: index + 1,
        item: { "@id": `${repoUrl(project)}#project` },
      })),
    },
    ...PROJECTS.map(renderProjectSchema),
    {
      "@type": "ScholarlyArticle",
      "@id": "https://doi.org/10.5281/zenodo.3885793",
      name: "[Re] Measures for investigating the contextual modulation of information transmission",
      url: "https://doi.org/10.5281/zenodo.3885793",
      datePublished: "2020-06-09",
      identifier: "https://doi.org/10.5281/zenodo.3885793",
      author: { "@id": PERSON_ID },
      isPartOf: { "@type": "Periodical", name: "ReScience C" },
    },
  ];
  const json = JSON.stringify({ "@context": "https://schema.org", "@graph": graph }, null, 2)
    .replace(/</g, "\\u003c");
  return `<script type="application/ld+json">\n${json}\n</script>`;
}

function renderLlms() {
  const selected = PROJECTS.map((project) => {
    const links = (project.externalLinks || []).map((link) => `${link.label}: ${link.url}`);
    const extra = links.length ? ` ${links.join("; ")}.` : "";
    return `- [${project.name}](${repoUrl(project)}): ${project.summary}${extra}`;
  });
  const selectedNames = new Set(PROJECTS.map((project) => project.name.toLowerCase()));
  const more = REPOS
    .filter((repo) => !selectedNames.has(repo.name.toLowerCase()))
    .map((repo) => `- [${repo.name}](https://github.com/sepahead/${repo.name}): ${repo.full}.`);
  const socials = SOCIALS.map((social) => `- ${social.name}: ${social.href}`);
  return `<!-- Generated by scripts/sync-selected-work.mjs; edit scripts/data.mjs instead. -->
# Sepehr Mahmoudian

> Berlin-based AI/ML engineer working across agentic systems, computational
> neuroscience, robotics and 3D software, primarily in Rust and Python. GitHub member since 2014.

## Focus
Agentic systems, computational neuroscience, information theory, neural networks,
robotics, sensor fusion, 3D vision, Gaussian splatting, Rust and Python.

## Selected work
${selected.join("\n")}

## More repositories
${more.join("\n")}

## Research and writing
- [[Re] Measures for investigating the contextual modulation of information transmission](https://doi.org/10.5281/zenodo.3885793): ReScience C 6(3), 2020; reproducibility repository: https://github.com/sepahead/mahmoudian-2020-rescience.
- Google Scholar: https://scholar.google.com/citations?user=t3PSg8kAAAAJ
- Substack: https://substack.com/@torusprime

## Links
- Web: ${SITE_URL}
${socials.join("\n")}
- GitHub: https://github.com/sepahead
- Email: mailto:sepmhn@gmail.com
`;
}

function renderSitemap() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${SITE_URL}</loc>
    <lastmod>${DATE_MODIFIED}</lastmod>
  </url>
</urlset>
`;
}

const outputs = new Map();
const readmePath = resolve(ROOT, "README.md");
const readme = readFileSync(readmePath, "utf8");
outputs.set(readmePath, replaceRegion(readme, "selected-work:readme", renderReadmeCards(), "README.md"));

const indexPath = resolve(ROOT, "docs", "index.html");
let index = readFileSync(indexPath, "utf8");
index = replaceRegion(index, "selected-work:jsonld", renderJsonLd(), "docs/index.html");
index = replaceRegion(index, "selected-work:html", renderVisibleWork(), "docs/index.html");
outputs.set(indexPath, index);
outputs.set(resolve(ROOT, "docs", "llms.txt"), renderLlms());
outputs.set(resolve(ROOT, "docs", "sitemap.xml"), renderSitemap());

let drift = false;
for (const [path, expected] of outputs) {
  let current = "";
  try {
    current = readFileSync(path, "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (current === expected) continue;
  const relativePath = path.slice(ROOT.length + 1);
  if (mode === "--check") {
    console.error(`[content] out of date: ${relativePath}`);
    drift = true;
  } else {
    writeFileSync(path, expected);
    console.log(`[content] wrote ${relativePath}`);
  }
}

if (drift) {
  console.error("[content] run: node scripts/sync-selected-work.mjs --write");
  process.exit(1);
}

if (!drift && mode === "--check") console.log("[content] generated surfaces are in sync");
