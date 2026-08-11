// scripts/enlightenment.test.mjs
// Spectral fringing on all rays + interference bands on wing rays only (like Tyrael's wings).
import test from "node:test";
import assert from "node:assert/strict";

import { STACK_THROUGH_YEAR, buildModel, renderSVG } from "./cumulative.mjs";
import { splitThemes } from "./theme-split.mjs";
import { attrOf, styleBlocks, tagsWithClass } from "./chart-test-helpers.mjs";

function fixture(currentTotal = 4214) {
  const now = new Date().getUTCFullYear();
  const grouped = [1, 4, 32, 19, 0, 0, 234, 61, 188];
  const recent = [236, 1676, 2027, currentTotal];
  const firstGrouped = STACK_THROUGH_YEAR - (grouped.length - 1);
  const firstRecent = now - (recent.length - 1);
  return [
    ...grouped.map((total, i) => ({ year: firstGrouped + i, total, source: "h2" })),
    ...recent.map((total, i) => ({ year: firstRecent + i, total, source: "h2" })),
  ];
}

const svg = () => renderSVG(buildModel(fixture()));

test("winged design: 20 rays, 40 fringe edges, 15 interference lines (central 5 pure)", () => {
  const out = svg();
  assert.equal(tagsWithClass(out, "g", "narrative-enlightenment").length, 1);

  const rays = tagsWithClass(out, "polygon", "new-age-ray");
  assert.equal(rays.length, 20);

  const fringes = tagsWithClass(out, "polygon", "new-age-fringe");
  assert.equal(fringes.length, 40);

  // 15 interference lines (20 total - 5 central core angles 88-92)
  const lineBlocks = [...out.matchAll(/<line[^>]*class="[^"]*\bnew-age-interference\b[^"]*"[^>]*>/g)];
  assert.equal(lineBlocks.length, 15, "expected 15 interference lines on wings");

  const interferenceBlocks = [...out.matchAll(/<line[^>]*class="[^"]*\bnew-age-interference\b[^"]*"[^]*?<\/line>/g)];
  for (let i = 0; i < interferenceBlocks.length; i++) {
    assert.match(interferenceBlocks[i][0], /stroke-dashoffset/, "interference must animate");
  }

  const fringeBlocks = [...out.matchAll(/<polygon[^>]*class="[^"]*\bnew-age-fringe\b[^"]*"[^]*?<\/polygon>/g)];
  for (let i = 0; i < fringeBlocks.length; i++) {
    assert.match(fringeBlocks[i][0], /repeatCount="indefinite"/, "fringe must repeat indefinitely");
  }

  for (const [i, ray] of rays.entries()) {
    const pts = (attrOf(ray, "points") || "").trim().split(/\s+/);
    const ys = pts.filter((_, idx) => idx % 2 === 1).map(Number);
    assert.ok(Math.min(...ys.slice(0,2)) < Math.max(...ys.slice(2,4)), "ray must fan downward");
  }

  const aria = out.match(/aria-label="([^"]*)"/)?.[1] ?? "";
  assert.match(aria, /20 rays of light/);
});

test("new age uses dedicated ray gradient and glow filter", () => {
  const out = svg();
  assert.match(out, /id="newAgeRayGrad"/);
  assert.match(out, /id="newAgeGlow"/);
});

test("all new age parts share one phase opacity", () => {
  const out = svg();
  const shared = "1";
  const labelStart = out.indexOf('<g class="new-age-label"');
  const label = out.slice(labelStart, out.indexOf("</g>", labelStart) + 4);
  assert.match(label, new RegExp(`opacity="${shared}"`));

  const { dark, light } = splitThemes(out);
  for (const [name, out] of Object.entries({ dark, light })) {
    const css = styleBlocks(out)[0];
    assert.ok(css.includes(".new-age-ray"), `${name}: missing ray CSS`);
    assert.ok(css.includes(".new-age-fringe"), `${name}: missing fringe CSS`);
    assert.ok(css.includes(".new-age-interference"), `${name}: missing interference CSS`);
    assert.ok(css.includes(".new-age-text"), `${name}: missing label text CSS`);
  }
  for (const [name, css] of Object.entries({ dark, light })) {
    assert.match(css, new RegExp(`\\.narrative-enlightenment\\s*\\{[^}]*opacity:\\s*${shared}`));
  }
});
