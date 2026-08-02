import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { PROJECTS } from "./data.mjs";
import { PALETTE } from "./tokens.mjs";

function luminance(hex) {
  const channels = hex
    .slice(1)
    .match(/.{2}/g)
    .map((channel) => Number.parseInt(channel, 16) / 255)
    .map((channel) =>
      channel <= 0.04045
        ? channel / 12.92
        : ((channel + 0.055) / 1.055) ** 2.4
    );
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(a, b) {
  const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (lighter + 0.05) / (darker + 0.05);
}

const indexHtml = readFileSync(
  new URL("../docs/index.html", import.meta.url),
  "utf8"
);

test("shared muted text meets normal-text contrast in both themes", () => {
  assert.ok(contrast(PALETTE.muted[0], "#0d1117") >= 4.5);
  assert.ok(contrast(PALETTE.muted[1], "#ffffff") >= 4.5);
});

test("light card titles, badges, and chips meet normal-text contrast", () => {
  for (const project of PROJECTS) {
    const colors = new Set([project.light, project.hintLight].filter(Boolean));
    for (const color of colors) {
      assert.ok(
        contrast(color, "#ffffff") >= 4.5,
        `${project.name} ${color} is below 4.5:1 on white`
      );
    }
  }
});

test("site focus indicators meet non-text contrast in both themes", () => {
  const focusColors = [...indexHtml.matchAll(
    /outline(?:-color)?:\s*(?:2px solid\s*)?(#[0-9a-f]{6})/gi
  )].map((match) => match[1]);

  assert.deepEqual(focusColors, ["#fbbf24", "#8250df"]);
  assert.ok(contrast(focusColors[0], "#0d1117") >= 3);
  assert.ok(contrast(focusColors[1], "#ffffff") >= 3);
});
