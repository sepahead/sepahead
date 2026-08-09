// scripts/data.mjs
// Single source of truth for the profile's canonical lists. Each list lives here
// once; the generators render it AND scripts/section-titles.mjs derives the
// per-section "# N …" banner counts from these lengths, so adding/removing a
// project, repo, agent, stack or channel updates the count automatically (no second
// place to edit). Pure data: zero deps, no side effects (safe to import
// anywhere). CHANNELS is a plain count because the Elsewhere icons are hand-
// authored clickable markdown, not generated from here.

// Selected work is the canonical source for every public-facing surface:
// work-cards.mjs consumes the visual fields, while sync-selected-work.mjs uses
// the evidence-backed semantic fields for README accessibility text, the
// portfolio page, structured data, llms.txt and the sitemap. Keep `desc` short
// enough for a three-line card; `summary` is the complete public claim.
export const PROJECTS = [
  {
    name: "engram", slug: "engram",
    alternateName: "Engram Neural Modeling Labs",
    headline: "Computational-neuroscience research",
    accent: "#aeb8c4", light: "#5b6672", grad: "#1c2530",
    hint: "#dfe7ee", hintLight: "#5b6672",
    stars: 14, repo: "sepahead/engram",
    desc: "Computational-neuroscience, spiking-network and neural-modeling research. Source release is planned after publication.",
    stack: ["Neuroscience", "SNN"],
    summary: "Engram Neural Modeling Labs is a public placeholder for computational-neuroscience, spiking-network and neural-modeling experiments; its repository says the code will be open-sourced after publication.",
    status: "Public research placeholder; source code is not yet published.",
    schemaType: "CreativeWork",
    languages: [],
    licenses: [],
  },
  {
    name: "NCP", slug: "ncp",
    alternateName: "Neuro-Cybernetic Protocol",
    headline: "Canonical-JSON neural-control protocol",
    accent: "#fbbf24", light: "#b45309", grad: "#332408",
    stars: 15, repo: "sepahead/NCP",
    desc: "Canonical-JSON neural-control contract for robots, UAVs, simulators and clients over Zenoh. HEAD: unreleased 1.0 RC; v0.8.0 latest release.",
    stack: ["Rust", "TS", "Python", "C++"],
    summary: "NCP is a versioned, project-agnostic canonical-JSON contract connecting neural simulators or neuromorphic controllers to robots, UAVs, simulators and read-only analysis clients. It has a Rust reference, an independent TypeScript validator/client and Python/C/C++ bindings; HEAD is an unreleased, release-blocked 1.0 candidate, while v0.8.0 remains the latest immutable release.",
    status: "Repository HEAD is an unreleased, release-blocked 1.0 release candidate; v0.8.0 is the latest immutable release.",
    schemaType: "SoftwareSourceCode",
    languages: ["Rust", "TypeScript", "Python", "C", "C++"],
    licenses: ["MIT", "Apache-2.0"],
  },
  {
    name: "prisoma", slug: "prisoma",
    headline: "Auditable VLA-policy diagnosis",
    accent: "#a78bfa", light: "#7c3aed", grad: "#241a44",
    phase: "research", repo: "sepahead/prisoma",
    desc: "Auditable VLA run-log and replay groundwork for intervention-based diagnosis; capture and PID remain behind explicit validity gates.",
    stack: ["Rust", "Python"],
    summary: "Prisoma is a public Rust/Python research toolkit implementing canonical experiment run logs and replay groundwork while working toward provenance-complete capture-intervention-replay for intervention-grounded VLA-policy diagnosis. Real VLA capture and complete replay acceptance remain blocked; PID is a conditional diagnostic behind preregistered validity gates. The public 0.9.0 GitHub source prerelease is a research-software preview, not a scientific-results or production release.",
    status: "Public 0.9.0 GitHub source prerelease; research-software preview, not a scientific-results or production release.",
    schemaType: "SoftwareSourceCode",
    languages: ["Rust", "Python"],
    licenses: ["MIT", "Apache-2.0"],
  },
  {
    name: "crebain", slug: "crebain",
    alternateName: "Adaptive Response & Awareness System (ARAS)",
    headline: "Spatial awareness and sensor-fusion prototype",
    accent: "#9caf88", light: "#4b5320", grad: "#1f2913",
    stars: 20, repo: "sepahead/crebain",
    desc: "Spatial-awareness prototype combining Gaussian-splat scenes, simulated cameras, ML detection and persistent multimodal 3D tracking.",
    stack: ["TS", "Rust", "Nix"],
    summary: "CREBAIN (Adaptive Response & Awareness System) is a research-only spatial-awareness prototype that combines Gaussian-splat visualization and simulated cameras with ML detection, persistent multimodal 3D tracking and ROS/Gazebo drone simulation. Drone-physics and ROS capabilities remain in progress.",
    status: "Research prototype, not a product; drone-physics and ROS integration remain in progress.",
    schemaType: "SoftwareSourceCode",
    languages: ["Rust", "TypeScript"],
    licenses: ["MIT", "Apache-2.0"],
  },
  {
    name: "melkor", slug: "melkor",
    headline: "Auditable Gaussian-splat conversion",
    accent: "#fb923c", light: "#c2410c", grad: "#2a1608",
    stars: 13, repo: "sepahead/melkor",
    desc: "GPU-free 3DGS inspection and deterministic PLY/SPZ/glTF conversion, reporting field provenance and numeric hazards.",
    stack: ["PLY/SPZ", "Inspection", "Provenance"],
    summary: "Melkor inspects 3D Gaussian-splat assets without initializing a GPU and deterministically converts PLY, SPZ and glTF inputs. Its versioned inspection report surfaces bounds, field provenance and numeric hazards without modifying the source. v2 hardening is in progress; v2.0.0-rc.1 is a source-only candidate, and no production binary release is currently supported.",
    status: "v2 hardening in progress; v2.0.0-rc.1 is source-only; no production binary release is currently supported.",
    schemaType: "SoftwareSourceCode",
    languages: ["C++", "Python", "JavaScript"],
    licenses: ["MIT"],
  },
  {
    name: "galadriel", slug: "galadriel",
    alternateName: "Galadriel's Mirror",
    headline: "Cross-sensor consistency monitor",
    accent: "#ef4444", light: "#dc2626", grad: "#2a0a0a",
    stars: 3, repo: "sepahead/galadriel",
    desc: "Fail-closed cross-sensor consistency monitor: NIS/CUSUM, sign-preserving correlation and optional PID diagnostics. Research only.",
    stack: ["Rust"],
    summary: "Galadriel is an experimental safe-Rust research prototype for cross-sensor consistency monitoring, combining NIS/CUSUM, sign-preserving correlation over producer-attested projections and optional PID diagnostics. The 0.9.0 research-source target remains unpublished; evidence is synthetic/component-level, not field validation.",
    status: "Unpublished 0.9.0 research-source candidate; synthetic/component evidence only.",
    schemaType: "SoftwareSourceCode",
    languages: ["Rust"],
    licenses: ["MIT", "Apache-2.0"],
  },
  {
    name: "pid-rs", slug: "pid-rs",
    headline: "Partial Information Decomposition in safe Rust",
    accent: "#34d399", light: "#047857", grad: "#06281d",
    stars: 11, repo: "sepahead/pid-rs",
    desc: "Shared-exclusions PID and MI estimation in safe Rust: categorical SxPID, KSG MI and default-off experimental continuous PID.",
    stack: ["Rust", "Python"],
    summary: "pid-rs is a safe-Rust library for shared-exclusions Partial Information Decomposition and mutual-information estimation: categorical SxPID, KSG MI and default-off experimental continuous shared-exclusions/PID surfaces. v0.9.0 is a GitHub-only source-review prerelease.",
    status: "v0.9.0 GitHub-only source-review prerelease; continuous shared-exclusions/PID remains experimental.",
    schemaType: "SoftwareSourceCode",
    languages: ["Rust", "Python"],
    licenses: ["MIT", "Apache-2.0"],
  },
  {
    name: "haldir", slug: "haldir",
    alternateName: "Haldir Gate",
    headline: "Mission-authorization reference monitor",
    accent: "#2dd4bf", light: "#0f766e", grad: "#042f2a",
    stars: 2, repo: "sepahead/haldir",
    desc: "Fail-closed NCP mission-authorization monitor: signed intents, admission and lease checks, deterministic policy, signed receipts.",
    stack: ["Rust"],
    summary: "Haldir Gate is an experimental Rust mission-authorization reference monitor for NCP: it validates signed controller intents, deployment and mission admission, and deterministic policy, then prepares Gate-owned plant commands and signed decision receipts. Its 0.9 review remains NO_GO; it is not production-ready or airworthy.",
    status: "Experimental 0.9 review remains NO_GO; not production-ready, certified or airworthy.",
    schemaType: "SoftwareSourceCode",
    languages: ["Rust"],
    licenses: ["MIT", "Apache-2.0"],
  },
  {
    name: "manwe", slug: "manwe",
    headline: "Airspace-perception research workbench",
    accent: "#38bdf8", light: "#0369a1", grad: "#08283a",
    stars: 2, repo: "sepahead/manwe",
    desc: "Alpha airspace-perception workbench: vision, audio, multi-camera geometry and multi-target tracking; Python core, Rust/Candle benchmarks.",
    stack: ["Python", "Rust"],
    summary: "Manwe is an alpha airspace-perception research and validation workbench spanning vision, audio, multi-camera geometry and multi-target tracking, with a Python numerical/training package and Rust/Candle inference benchmarks. It targets candidate outputs for systems such as Crebain but currently ships no drop-in Crebain adapter.",
    status: "Targets v0.2.0-alpha.1; no validated downstream deployment adapter.",
    schemaType: "SoftwareSourceCode",
    languages: ["Python", "Rust"],
    licenses: ["MIT"],
  },
  {
    name: "cortexel", slug: "cortexel",
    headline: "Deterministic scientific-figure contracts",
    accent: "#e879f9", light: "#c026d3", grad: "#2a0a2e",
    stars: 3, repo: "sepahead/cortexel",
    desc: "Strict JSON contracts yield deterministic neural-simulation SVGs and complete value tables, failing closed on ambiguous provenance.",
    stack: ["TS", "SVG", "JSON"],
    summary: "Cortexel is an unreleased TypeScript library and CLI for neural-simulation figures: it validates and canonicalizes strict declarative JSON requests with fail-closed provenance, then returns deterministic SVG plus a complete exact-value table. main is 0.10.0-dev.0; v0.9.0 is the last tagged preview.",
    status: "Unreleased 0.10.0-dev.0; v0.9.0 is the last tagged preview; no registry package or DOI.",
    schemaType: "SoftwareSourceCode",
    languages: ["TypeScript"],
    licenses: ["MIT"],
  },
  // Datasets (the two atlas repos, shown last with a `dataset` badge rather than a
  // star count — they are the same repos rendered as dataset chips in the graph).
  {
    name: "relief-atlas", slug: "relief-atlas",
    headline: "Disaster-relief 3D asset pipeline",
    accent: "#fb7185", light: "#e11d48", grad: "#2a0a12",
    dataset: true, repo: "sepahead/relief-atlas",
    desc: "Python pipeline and 10,079-item prompt catalog for disaster-relief 3D assets; 125 GLBs are currently public.",
    stack: ["Python"],
    summary: "relief-atlas is a Python generation pipeline and 10,079-item manifest and prompt catalog for disaster-relief, humanitarian-aid and civil-protection meshes. The repository currently contains 125 GLBs, not a complete 10,079-mesh corpus.",
    status: "Public generation pipeline and prompt catalog; 125 GLBs currently present; asset-level licensing is not recorded in metadata.",
    schemaType: "Dataset",
    languages: ["Python"],
    licenses: [],
  },
  {
    name: "cobot-atlas", slug: "cobot-atlas",
    headline: "Robot-simulation 3D mesh dataset",
    accent: "#60a5fa", light: "#2563eb", grad: "#0b1a33",
    dataset: true, repo: "sepahead/cobot-atlas",
    // Published Hugging Face dataset id; work-cards.mjs refreshes `downloads`
    // (ALL-TIME, not 30-day) from the public HF API on each run, `downloads`
    // here is the offline fallback (same pattern as `stars`). relief-atlas
    // gets its own `hf` once it is published on the Hub.
    hf: "torusprime/cobot-atlas", downloads: 1775,
    desc: "Generation pipeline for 2,023 unique robot/cobot simulation meshes; 2,024 GLBs, 33.5 GB on Hugging Face with dataset and pipeline DOIs.",
    stack: ["Python"],
    summary: "cobot-atlas is a Python generation pipeline for a public MIT dataset of 2,023 unique glTF 2.0 Binary meshes (2,024 GLB files, 33.5 GB) for robot/cobot simulation, manipulation research, VLA training and benchmarking.",
    status: "Public MIT dataset on Hugging Face with dataset and pipeline DOIs.",
    schemaType: "Dataset",
    languages: ["Python"],
    licenses: ["MIT"],
    externalLinks: [
      { label: "Hugging Face dataset", url: "https://huggingface.co/datasets/torusprime/cobot-atlas", kind: "dataset", schemaRelation: "sameAs" },
      { label: "Dataset DOI", url: "https://doi.org/10.57967/hf/9199", kind: "doi", identifier: "10.57967/hf/9199", schemaRelation: "sameAs" },
      { label: "Pipeline DOI", url: "https://doi.org/10.5281/zenodo.20697491", kind: "doi", identifier: "10.5281/zenodo.20697491", schemaRelation: "isBasedOn" },
    ],
  },
];

// "More repositories" public repos (repo-tree.mjs --sort activity order); the
// number of REPOS is the sub-header banner's "# N repos". `area` is the short
// note, `full` the long aria copy. `metric`/`count`/`repo` drive the live star/
// fork badge (refreshed on the 4h cron; `count` is the no-token fallback).
export const REPOS = [
  { name: "brojapid-activationfunctions", area: "PID analysis of activation functions",      full: "PID analysis of activation functions",                  repo: "sepahead/brojapid-activationfunctions", metric: "stars", count: 4 },
  { name: "mahmoudian-2020-rescience",    area: "ReScience C: info-theoretic transfer fn",  full: "ReScience C info-theoretic transfer-function analysis", repo: "sepahead/mahmoudian-2020-rescience",    metric: "forks", count: 3 },
  { name: "nest-simulator",               area: "NEST simulator fork: orig. contributions", full: "NEST simulator fork with original contributions" },
  { name: "relief-atlas",                 area: "10,079 prompts · 125 public relief GLBs",      full: "10,079-item prompt catalog and 125 public disaster-relief GLBs" },
  { name: "silmaril-vision-studio",       area: "computer-vision studio & testbed",            full: "computer-vision studio and testbed" },
];

// Agentic-stack roster (agents.mjs).
export const AGENTS = [
  { name: "Ghostty", role: "terminal",     note: "GPU-native" },
  { name: "herdr",   role: "multiplexer",  note: "agent herd" },
  { name: "OMP",     role: "lead harness", note: "turbocharged Pi · batteries-included", lead: true },
  { name: "Devin",   role: "harness",      note: "long-horizon" },
  { name: "Zed",     role: "editor",       note: "collaborative · IDE" },
];

// Toolbox category rails (toolbox-rails.mjs). `count` is the icon count for that
// row (kept in sync with the README icon row); the number of RAILS is the
// toolbox banner's "# N stacks".
export const RAILS = [
  { slug: "aiml",     label: "AI / ML",            count: 8, begin: "0s" },
  { slug: "backend",  label: "BACKEND &amp; SYSTEMS", count: 8, begin: "0.3s" },
  { slug: "cloud",    label: "CLOUD &amp; DEVOPS",     count: 8, begin: "0.6s" },
  { slug: "frontend", label: "FRONTEND &amp; WEB",     count: 7, begin: "0.9s" },
];

// Social channels, rendered as the self-hosted badge strip at the top of the
// profile (socials.mjs → assets/social-<slug>.svg, one clickable pill each).
// Single source of truth: `name` is the platform (used for aria + tooltip),
// `label` the username shown on the pill (neutral ink), `handle` the tooltip/aria
// detail, `accent` the platform's [dark, light] brand colour (drives the icon
// seat, glyph and hover glow), `glyph` the authentic monochrome brand mark as a
// 24×24 path (fill-rule evenodd punches the counters). `iconOnly` renders a
// compact icon-only pill for channels with no clean username (LinkedIn's handle
// carries a numeric suffix; Google Scholar is keyed by an opaque id). CHANNELS
// derives from the list so the count stays in sync everywhere it is referenced.
export const SOCIALS = [
  {
    slug: "linkedin",
    name: "LinkedIn",
    href: "https://www.linkedin.com/in/sepehr-mahmoudian-99367516/",
    handle: "Sepehr Mahmoudian",
    iconOnly: true,
    accent: ["#4ba3e3", "#0a66c2"],
    glyph:
      "M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.225 0z",
  },
  {
    slug: "scholar",
    name: "Google Scholar",
    href: "https://scholar.google.com/citations?user=t3PSg8kAAAAJ",
    handle: "Sepehr Mahmoudian",
    iconOnly: true,
    accent: ["#6c9bf0", "#3367d6"],
    glyph:
      "M5.242 13.769L0 9.5 12 0l12 9.5-5.242 4.269C17.548 11.249 14.978 9.5 12 9.5c-2.977 0-5.548 1.748-6.758 4.269zM12 10a7 7 0 1 0 0 14 7 7 0 0 0 0-14z",
  },
  {
    slug: "substack",
    name: "Substack",
    href: "https://substack.com/@torusprime",
    label: "@torusprime",
    handle: "@torusprime",
    accent: ["#ff7a45", "#e0561a"],
    glyph:
      "M22.539 8.242H1.46V5.406h21.08v2.836zM1.46 10.812V24L12 18.11 22.54 24V10.812H1.46zM22.54 0H1.46v2.836h21.08V0z",
  },
  {
    slug: "huggingface",
    name: "Hugging Face",
    href: "https://huggingface.co/torusprime",
    label: "@torusprime",
    handle: "@torusprime",
    accent: ["#ffd21e", "#c98a00"],
    glyph:
      "M12.025 1.13c-5.77 0-10.449 4.647-10.449 10.378 0 1.112.178 2.181.503 3.185.064-.222.203-.444.416-.577a.96.96 0 0 1 .524-.15c.293 0 .584.124.84.284.278.173.48.408.71.694.226.282.458.611.684.951v-.014c.017-.324.106-.622.264-.874s.403-.487.762-.543c.3-.047.596.06.787.203s.31.313.4.467c.15.257.212.468.233.542.01.026.653 1.552 1.657 2.54.616.605 1.01 1.223 1.082 1.912.055.537-.096 1.059-.38 1.572.637.121 1.294.187 1.967.187.657 0 1.298-.063 1.921-.178-.287-.517-.44-1.041-.384-1.581.07-.69.465-1.307 1.081-1.913 1.004-.987 1.647-2.513 1.657-2.539.021-.074.083-.285.233-.542.09-.154.208-.323.4-.467a1.08 1.08 0 0 1 .787-.203c.359.056.604.29.762.543s.247.55.265.874v.015c.225-.34.457-.67.683-.952.23-.286.432-.52.71-.694.257-.16.547-.284.84-.285a.97.97 0 0 1 .524.151c.228.143.373.388.43.625l.006.04a10.3 10.3 0 0 0 .534-3.273c0-5.731-4.678-10.378-10.449-10.378M8.327 6.583a1.5 1.5 0 0 1 .713.174 1.487 1.487 0 0 1 .617 2.013c-.183.343-.762-.214-1.102-.094-.38.134-.532.914-.917.71a1.487 1.487 0 0 1 .69-2.803m7.486 0a1.487 1.487 0 0 1 .689 2.803c-.385.204-.536-.576-.916-.71-.34-.12-.92.437-1.103.094a1.487 1.487 0 0 1 .617-2.013 1.5 1.5 0 0 1 .713-.174m-10.68 1.55a.96.96 0 1 1 0 1.921.96.96 0 0 1 0-1.92m13.838 0a.96.96 0 1 1 0 1.92.96.96 0 0 1 0-1.92M8.489 11.458c.588.01 1.965 1.157 3.572 1.164 1.607-.007 2.984-1.155 3.572-1.164.196-.003.305.12.305.454 0 .886-.424 2.328-1.563 3.202-.22-.756-1.396-1.366-1.63-1.32q-.011.001-.02.006l-.044.026-.01.008-.03.024q-.018.017-.035.036l-.032.04a1 1 0 0 0-.058.09l-.014.025q-.049.088-.11.19a1 1 0 0 1-.083.116 1.2 1.2 0 0 1-.173.18q-.035.029-.075.058a1.3 1.3 0 0 1-.251-.243 1 1 0 0 1-.076-.107c-.124-.193-.177-.363-.337-.444-.034-.016-.104-.008-.2.022q-.094.03-.216.087-.06.028-.125.063l-.13.074q-.067.04-.136.086a3 3 0 0 0-.135.096 3 3 0 0 0-.26.219 2 2 0 0 0-.12.121 2 2 0 0 0-.106.128l-.002.002a2 2 0 0 0-.09.132l-.001.001a1.2 1.2 0 0 0-.105.212q-.013.036-.024.073c-1.139-.875-1.563-2.317-1.563-3.203 0-.334.109-.457.305-.454m.836 10.354c.824-1.19.766-2.082-.365-3.194-1.13-1.112-1.789-2.738-1.789-2.738s-.246-.945-.806-.858-.97 1.499.202 2.362c1.173.864-.233 1.45-.685.64-.45-.812-1.683-2.896-2.322-3.295s-1.089-.175-.938.647 2.822 2.813 2.562 3.244-1.176-.506-1.176-.506-2.866-2.567-3.49-1.898.473 1.23 2.037 2.16c1.564.932 1.686 1.178 1.464 1.53s-3.675-2.511-4-1.297c-.323 1.214 3.524 1.567 3.287 2.405-.238.839-2.71-1.587-3.216-.642-.506.946 3.49 2.056 3.522 2.064 1.29.33 4.568 1.028 5.713-.624m5.349 0c-.824-1.19-.766-2.082.365-3.194 1.13-1.112 1.789-2.738 1.789-2.738s.246-.945.806-.858.97 1.499-.202 2.362c-1.173.864.233 1.45.685.64.451-.812 1.683-2.896 2.322-3.295s1.089-.175.938.647-2.822 2.813-2.562 3.244 1.176-.506 1.176-.506 2.866-2.567 3.49-1.898-.473 1.23-2.037 2.16c-1.564.932-1.686 1.178-1.464 1.53s3.675-2.511 4-1.297c.323 1.214-3.524 1.567-3.287 2.405.238.839 2.71-1.587 3.216-.642.506.946-3.49 2.056-3.522 2.064-1.29.33-4.568 1.028-5.713-.624",
  },
  {
    slug: "x",
    name: "X",
    href: "https://x.com/SepAhead",
    label: "@SepAhead",
    handle: "@SepAhead",
    accent: ["#e7e9ea", "#0f1419"],
    glyph:
      "M14.234 10.162 22.977 0h-2.072l-7.591 8.824L7.251 0H.258l9.168 13.343L.258 24H2.33l8.016-9.318L16.749 24h6.993zm-2.837 3.299-.929-1.329L3.076 1.56h3.182l5.965 8.532.929 1.329 7.754 11.09h-3.182z",
  },
];

// Count of social channels, derived from SOCIALS so it never drifts.
export const CHANNELS = SOCIALS.length;
