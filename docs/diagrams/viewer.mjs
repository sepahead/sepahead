// Native scrolling keeps touch panning, browser pinch, and keyboard access intact.
const views = {
  ecosystem: { stem: "work-graph", width: 820, height: 977,
    alt: "NCP connects Engram, CREBAIN, Prisoma, and Galadriel through separate local interfaces. Haldir has a separate pinned interface. Libraries, assets, and perception tools use distinct line patterns. The projects are not a required bundle." },
  local: { stem: "work-graph-local", width: 820, height: 566,
    alt: "One local experiment: Engram coordinates neural state, CREBAIN owns body and fusion state, Galadriel monitors sensor diagnostics, and Prisoma captures exact exchanges. Each owner uses private NCP process channels. Monitor and capture results grant no command authority." },
};
const params = new URLSearchParams(location.search);
const key = params.get("view") === "local" ? "local" : "ecosystem";
const view = views[key];
const viewport = document.querySelector("#viewport");
const picture = document.querySelector("#diagram-picture");
const diagram = document.querySelector("#diagram");
const source = document.querySelector("#dark-source");
const theme = document.querySelector("#theme");
const systemTheme = matchMedia("(prefers-color-scheme: dark)");
const zoomIn = document.querySelector("#zoom-in");
const zoomOut = document.querySelector("#zoom-out");
const fit = document.querySelector("#fit");
const motion = document.querySelector("#motion");
const motionPreference = matchMedia("(prefers-reduced-motion: reduce)");
let paused = motionPreference.matches;
let motionChosen = false;
const levels = [1, 1.5, 2, 3, 4, 6, 8];
let level = 0;
let loaded = false;
let dimensions = [viewport.clientWidth, viewport.clientHeight];
let center = [0.5, dimensions[1] / (2 * dimensions[0])];

for (const link of document.querySelectorAll("[data-view]")) {
  if (link.dataset.view === key) link.setAttribute("aria-current", "page");
  else link.removeAttribute("aria-current");
}
diagram.width = view.width;
diagram.height = view.height;
diagram.alt = view.alt;
theme.value = ["light", "dark"].includes(params.get("theme")) ? params.get("theme") : "auto";
theme.disabled = false;
motion.disabled = false;

function applyTheme() {
  const selected = theme.value === "auto" ? (systemTheme.matches ? "dark" : "light") : theme.value;
  const asset = `${view.stem}${paused ? "-still" : ""}-${selected}.svg`;
  document.documentElement.dataset.theme = selected;
  document.querySelector("#still-dark-source").srcset = asset;
  document.querySelector("#still-source").srcset = asset;
  source.srcset = asset;
  diagram.src = asset;
  document.querySelector("#open-svg").href = asset;
  document.querySelector("#download-svg").href = asset;
  document.querySelector("#raw-fallback").href = `https://raw.githubusercontent.com/sepahead/sepahead/main/assets/${asset}`;
  motion.textContent = paused ? "Resume motion" : "Pause motion";
  motion.setAttribute("aria-pressed", String(paused));
}

function zoom(next) {
  const previous = levels[level];
  level = Math.max(0, Math.min(levels.length - 1, next));
  const ratio = levels[level] / previous;
  const x = (viewport.scrollLeft + viewport.clientWidth / 2) * ratio - viewport.clientWidth / 2;
  const y = (viewport.scrollTop + viewport.clientHeight / 2) * ratio - viewport.clientHeight / 2;
  picture.style.width = `${levels[level] * 100}%`;
  viewport.scrollLeft = level === 0 ? 0 : x;
  viewport.scrollTop = level === 0 ? 0 : y;
  document.querySelector("#zoom-value").value = `${Math.round(levels[level] * 100)}%`;
  updateControls();
  rememberCenter();
}

function rememberCenter() {
  if (viewport.clientWidth !== dimensions[0] || viewport.clientHeight !== dimensions[1]) return;
  const width = dimensions[0] * levels[level];
  center = [(viewport.scrollLeft + dimensions[0] / 2) / width, (viewport.scrollTop + dimensions[1] / 2) / width];
}

viewport.addEventListener("scroll", rememberCenter, { passive: true });
new ResizeObserver(() => {
  dimensions = [viewport.clientWidth, viewport.clientHeight];
  const width = dimensions[0] * levels[level];
  viewport.scrollLeft = level === 0 ? 0 : center[0] * width - dimensions[0] / 2;
  viewport.scrollTop = level === 0 ? 0 : center[1] * width - dimensions[1] / 2;
  rememberCenter();
}).observe(viewport);

function updateControls() {
  zoomOut.disabled = !loaded || level === 0;
  zoomIn.disabled = !loaded || level === levels.length - 1;
  fit.disabled = !loaded || level === 0;
}

function imageStatus() {
  loaded = diagram.complete && diagram.naturalWidth > 0;
  document.querySelector("#load-error").hidden = loaded;
  updateControls();
}

zoomIn.addEventListener("click", () => zoom(level + 1));
zoomOut.addEventListener("click", () => zoom(level - 1));
fit.addEventListener("click", () => zoom(0));
viewport.addEventListener("keydown", (event) => {
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  if (!loaded) return;
  if (["+", "=", "-", "0"].includes(event.key)) {
    event.preventDefault();
    zoom(event.key === "0" ? 0 : level + (event.key === "-" ? -1 : 1));
  }
});
theme.addEventListener("change", applyTheme);
motion.addEventListener("click", () => { motionChosen = true; paused = !paused; applyTheme(); });
motionPreference.addEventListener("change", (event) => {
  if (!motionChosen) { paused = event.matches; applyTheme(); }
});
systemTheme.addEventListener("change", applyTheme);
diagram.addEventListener("load", imageStatus);
diagram.addEventListener("error", imageStatus);
applyTheme();
zoom(0);
if (diagram.complete) imageStatus();
