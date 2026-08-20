#!/usr/bin/env python3
"""Generate the SepAhead animated mural system.

The generator is intentionally dependency-free. It emits self-contained SVG,
HTML galleries, GitHub picture snippets, and a machine-readable manifest.
Raster previews and PDFs are produced by the separate verification build.
"""

from __future__ import annotations

import argparse
import html
import json
import shutil
from dataclasses import dataclass
from pathlib import Path


W, H = 1600, 640
MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"


@dataclass(frozen=True)
class Family:
    slug: str
    title: str
    thesis: str
    timeline: tuple[str, ...]
    loop: int


@dataclass(frozen=True)
class Variant:
    slug: str
    title: str
    note: str
    colors: tuple[str, ...]


FAMILIES = (
    Family(
        "01_from_signal_to_frontier",
        "FROM SIGNAL TO FRONTIER",
        "Uncertain observations become bounded, inspectable machine action - then earn the right to move farther from supervision.",
        ("SIGNAL", "WORLD", "BODY", "AUTHORITY", "EVIDENCE", "FRONTIER"),
        84,
    ),
    Family(
        "02_one_mission_end_to_end",
        "ONE MISSION, END TO END",
        "One reference mission makes sensing, reconstruction, authorization, execution, and verification legible as a system.",
        ("DETECT", "RECONSTRUCT", "PROPOSE", "ADMIT", "EXECUTE", "VERIFY"),
        88,
    ),
    Family(
        "03_the_compounding_engine",
        "THE COMPOUNDING ENGINE",
        "Each auditable capability becomes a reusable instrument for the next reachable system.",
        ("MODEL", "MEASURE", "PROTOCOL", "PERCEIVE", "GOVERN", "EXPLORE"),
        92,
    ),
    Family(
        "04_the_evidence_observatory",
        "THE EVIDENCE OBSERVATORY",
        "Code, tests, releases, papers, datasets, demos, and field truth remain distinct while aligning into one inspectable beam.",
        ("CODE", "TEST", "RELEASE", "PAPER", "DEMO", "FIELD"),
        80,
    ),
    Family(
        "05_autonomy_for_harsh_worlds",
        "AUTONOMY FOR HARSH WORLDS",
        "An Earth-first wedge in remote inspection expands toward orbital and off-world systems where bounded autonomy matters more.",
        ("INFRA", "REMOTE", "AIR", "ORBIT", "MOON", "MARS"),
        96,
    ),
)


VARIANTS = (
    Variant(
        "01_obsidian_mission_glass",
        "Obsidian Mission Glass",
        "The cleanest fit with the existing terminal-and-systems language.",
        ("#d39a3a", "#31b9da", "#9f8ae8", "#48c79f", "#d45bc1", "#c4d0da"),
    ),
    Variant(
        "02_bioluminescent_deep_time",
        "Bioluminescent Deep-Time",
        "Organic cave life, neural growth, and exploration as one living ecology.",
        ("#a3e635", "#2dd4bf", "#67e8f9", "#c084fc", "#fb7185", "#f0abfc"),
    ),
    Variant(
        "03_celestial_cartographer",
        "Celestial Cartographer",
        "A scientific astrolabe, mission map, and cosmic stained-glass chart.",
        ("#f6c453", "#60a5fa", "#818cf8", "#2dd4bf", "#e879f9", "#e2e8f0"),
    ),
    Variant(
        "04_lapis_cybernetic_miniature",
        "Lapis Cybernetic Miniature",
        "Layered landscapes, ornamental architecture, and machine myth without fantasy cosplay.",
        ("#f59e0b", "#38bdf8", "#a78bfa", "#34d399", "#fb7185", "#dbeafe"),
    ),
    Variant(
        "05_holographic_basalt_relief",
        "Holographic Basalt Relief",
        "Monolithic terrain with luminous technical annotations and scan-cut depth.",
        ("#67e8f9", "#22d3ee", "#60a5fa", "#5eead4", "#c084fc", "#cbd5e1"),
    ),
)


THEMES = {
    "dark": {
        "bg": "#05080d",
        "panel": "#0a1017",
        "panel2": "#0e1721",
        "ink": "#eef6ff",
        "muted": "#8fa4b8",
        "line": "#2d4356",
        "line2": "#172735",
        "lead": "#020509",
        "glass_opacity": "0.60",
        "wash": "#07111b",
        "future": "#c8d4df",
        "shadow": "#000000",
    },
    "light": {
        "bg": "#f4f7fa",
        "panel": "#ffffff",
        "panel2": "#eef3f7",
        "ink": "#17212b",
        "muted": "#526577",
        "line": "#8295a7",
        "line2": "#c9d4de",
        "lead": "#263746",
        "glass_opacity": "0.34",
        "wash": "#e8eef3",
        "future": "#4f6476",
        "shadow": "#637688",
    },
}


MASTER_VARIANT = {
    "01_from_signal_to_frontier": "01_obsidian_mission_glass",
    "02_one_mission_end_to_end": "02_bioluminescent_deep_time",
    "03_the_compounding_engine": "03_celestial_cartographer",
    "04_the_evidence_observatory": "04_lapis_cybernetic_miniature",
    "05_autonomy_for_harsh_worlds": "05_holographic_basalt_relief",
}


PROJECTS = (
    "Engram", "pid-rs", "Manwe", "Melkor", "CREBAIN", "NCP",
    "Haldir", "Galadriel", "Prisoma", "Cortexel", "atlases",
)


def esc(value: str) -> str:
    return html.escape(str(value), quote=True)


def family_by_slug(slug: str) -> Family:
    return next(item for item in FAMILIES if item.slug == slug)


def variant_by_slug(slug: str) -> Variant:
    return next(item for item in VARIANTS if item.slug == slug)


def rgba(hex_color: str, alpha: float) -> str:
    value = hex_color.lstrip("#")
    return f"rgba({int(value[0:2], 16)},{int(value[2:4], 16)},{int(value[4:6], 16)},{alpha})"


def seeded_stars(count: int = 82) -> str:
    items = []
    for i in range(count):
        x = 42 + ((i * 137 + i * i * 17) % 1510)
        y = 94 + ((i * 73 + i * i * 11) % 390)
        r = (1, 1.2, 1.6, 2.1)[i % 4]
        opacity = (0.18, 0.28, 0.38, 0.52)[(i * 3) % 4]
        items.append(f'<circle cx="{x}" cy="{y}" r="{r}" opacity="{opacity}"/>')
    return "".join(items)


def motif_markup(variant: Variant, theme: dict[str, str], loop: int) -> str:
    c = variant.colors
    if variant.slug.startswith("01_"):
        return """
        <g class="motif lead-shards" opacity=".28">
          <path d="M38 182L236 86l141 94 164-88 178 95 196-107 174 94 190-79 173 86"/>
          <path d="M74 432l184-104 164 92 174-78 171 98 188-106 196 91 170-87 209 96"/>
        </g>"""
    if variant.slug.startswith("02_"):
        spores = []
        for i in range(34):
            x = 70 + ((i * 149) % 1460)
            y = 150 + ((i * 61) % 318)
            r = 2 + (i % 4)
            spores.append(
                f'<circle class="spore s{i % 7}" cx="{x}" cy="{y}" r="{r}" opacity="{0.18 + (i % 4) * .08:.2f}"/>'
            )
        return f"""
        <g class="motif roots" opacity=".33">
          <path d="M22 448C166 350 176 222 330 154S546 290 700 186 898 98 1028 202s262 38 552-92"/>
          <path d="M18 388c168-48 266 90 410 28s234-152 392-62 258 52 362-24 236-110 394-30"/>
        </g><g fill="{c[1]}">{''.join(spores)}</g>"""
    if variant.slug.startswith("03_"):
        return f"""
        <g class="motif chart" opacity=".34">
          <circle cx="800" cy="298" r="242"/><circle cx="800" cy="298" r="184"/>
          <circle cx="800" cy="298" r="126"/><path d="M548 298h504M800 46v504"/>
          <path d="M622 120l356 356M978 120L622 476"/>
        </g><g class="stars" fill="{c[0]}">{seeded_stars(64)}</g>"""
    if variant.slug.startswith("04_"):
        return f"""
        <g class="motif miniature" opacity=".28">
          <path d="M38 462V138h82v-38h82v38h82v-38h82v38h82v-38h82v38h82v-38h82v38h82v-38h82v38h82v-38h82v38h82v-38h82v38h82v324"/>
          <path d="M52 430Q150 280 248 430T444 430 640 430 836 430 1032 430 1228 430 1424 430 1580 430"/>
        </g>"""
    return f"""
        <g class="motif holo-grid" opacity=".25">
          <path d="M38 160h1524M38 210h1524M38 260h1524M38 310h1524M38 360h1524M38 410h1524M38 460h1524"/>
          <path d="M120 112v364M240 112v364M360 112v364M480 112v364M600 112v364M720 112v364M840 112v364M960 112v364M1080 112v364M1200 112v364M1320 112v364M1440 112v364"/>
        </g><rect class="holo-scan" x="38" y="118" width="1524" height="32" fill="url(#scanFade)"><animate attributeName="y" values="118;436;118" dur="{loop / 3:.1f}s" repeatCount="indefinite"/></rect>"""


def defs_markup(variant: Variant, theme: dict[str, str]) -> str:
    c = variant.colors
    stops = "".join(
        f'<stop offset="{i * 20}%" stop-color="{color}"/>' for i, color in enumerate(c)
    )
    return f"""
  <defs>
    <linearGradient id="frameGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="{theme['panel2']}"/><stop offset=".55" stop-color="{theme['panel']}"/><stop offset="1" stop-color="{theme['bg']}"/>
    </linearGradient>
    <linearGradient id="spectrum" x1="0" y1="0" x2="1" y2="0">{stops}</linearGradient>
    <linearGradient id="scanFade" x1="0" y1="0" x2="0" y2="1"><stop stop-color="{c[1]}" stop-opacity="0"/><stop offset=".5" stop-color="{c[1]}" stop-opacity=".35"/><stop offset="1" stop-color="{c[1]}" stop-opacity="0"/></linearGradient>
    <radialGradient id="moon" cx="34%" cy="30%"><stop stop-color="#ffffff"/><stop offset=".68" stop-color="{c[5]}"/><stop offset="1" stop-color="{theme['future']}"/></radialGradient>
    <filter id="glow" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    <filter id="softGlow" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="2.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    <filter id="shadow" x="-25%" y="-25%" width="150%" height="160%"><feDropShadow dx="0" dy="7" stdDeviation="7" flood-color="{theme['shadow']}" flood-opacity=".42"/></filter>
    <pattern id="grain" width="48" height="48" patternUnits="userSpaceOnUse"><circle cx="7" cy="9" r="1" fill="{theme['ink']}" opacity=".08"/><circle cx="33" cy="24" r=".8" fill="{theme['ink']}" opacity=".06"/><path d="M0 42L48 6" stroke="{theme['ink']}" stroke-opacity=".025"/></pattern>
    <marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto"><path d="M0 1l8 4-8 4z" fill="{c[1]}"/></marker>
  </defs>"""


def style_markup(family: Family, variant: Variant, theme: dict[str, str]) -> str:
    c = variant.colors
    return f"""
  <style>
    .bg {{ fill:{theme['bg']}; }}
    .frame {{ fill:url(#frameGrad); stroke:{theme['line']}; stroke-width:2; }}
    .inner {{ fill:none; stroke:{theme['line2']}; stroke-width:1.4; }}
    .rule {{ stroke:{theme['line']}; stroke-width:1.5; }}
    .hairline {{ stroke:{theme['line2']}; stroke-width:1; }}
    .title {{ font:700 30px {MONO}; letter-spacing:5px; fill:{theme['ink']}; }}
    .subtitle {{ font:500 15px {MONO}; fill:{theme['muted']}; }}
    .cap {{ font:600 11px {MONO}; letter-spacing:2px; fill:{theme['muted']}; }}
    .stage-label {{ font:700 16px {MONO}; letter-spacing:2px; fill:{theme['ink']}; }}
    .small {{ font:600 12px {MONO}; letter-spacing:1px; fill:{theme['muted']}; }}
    .micro {{ font:600 9px {MONO}; letter-spacing:1.4px; fill:{theme['muted']}; }}
    .claim {{ font:500 13px {MONO}; fill:{theme['muted']}; }}
    .lead {{ fill:{theme['lead']}; stroke:{theme['lead']}; stroke-width:7; stroke-linejoin:round; }}
    .glass {{ stroke:{theme['lead']}; stroke-width:7; stroke-linejoin:round; }}
    .glass-1 {{ fill:{c[0]}; fill-opacity:{theme['glass_opacity']}; }}
    .glass-2 {{ fill:{c[1]}; fill-opacity:{theme['glass_opacity']}; }}
    .glass-3 {{ fill:{c[2]}; fill-opacity:{theme['glass_opacity']}; }}
    .glass-4 {{ fill:{c[3]}; fill-opacity:{theme['glass_opacity']}; }}
    .glass-5 {{ fill:{c[4]}; fill-opacity:{theme['glass_opacity']}; }}
    .glass-6 {{ fill:{c[5]}; fill-opacity:{theme['glass_opacity']}; }}
    .scene-line {{ fill:none; stroke:{theme['ink']}; stroke-width:3; stroke-linecap:round; stroke-linejoin:round; }}
    .scene-muted {{ fill:none; stroke:{theme['muted']}; stroke-width:2; stroke-linecap:round; stroke-linejoin:round; }}
    .evidence {{ fill:none; stroke:{c[1]}; stroke-width:3; stroke-linecap:round; stroke-linejoin:round; filter:url(#softGlow); }}
    .concept {{ fill:none; stroke:{c[2]}; stroke-width:2.3; stroke-dasharray:10 10; stroke-linecap:round; opacity:.78; }}
    .future {{ fill:none; stroke:{c[5]}; stroke-width:2; stroke-dasharray:3 12; stroke-linecap:round; opacity:.55; }}
    .packet {{ fill:{theme['ink']}; stroke:{c[1]}; stroke-width:2; filter:url(#glow); }}
    .hot {{ fill:{c[1]}; filter:url(#glow); }}
    .warm {{ fill:{c[0]}; filter:url(#softGlow); }}
    .ok {{ fill:{c[3]}; filter:url(#softGlow); }}
    .deny {{ fill:{c[4]}; filter:url(#softGlow); }}
    .person {{ fill:{c[4]}; stroke:{theme['lead']}; stroke-width:3; }}
    .skin {{ fill:{c[5]}; stroke:{theme['lead']}; stroke-width:3; }}
    .motif {{ fill:none; stroke:{theme['line']}; stroke-width:2; }}
    .roots {{ stroke:{c[1]}; stroke-width:2.5; }}
    .chart {{ stroke:{c[0]}; stroke-width:1.5; }}
    .miniature {{ stroke:{c[0]}; stroke-width:2; }}
    .holo-grid {{ stroke:{c[1]}; stroke-width:1; }}
    .holo-scan {{ opacity:.32; }}
    .grain {{ fill:url(#grain); opacity:.8; }}
    .timeline {{ fill:{theme['panel2']}; stroke:{theme['line']}; stroke-width:2; }}
    .timeline-done {{ fill:url(#spectrum); filter:url(#softGlow); }}
    .timeline-node {{ fill:{theme['panel']}; stroke:{theme['line']}; stroke-width:3; }}
    .timeline-core {{ fill:{c[1]}; filter:url(#softGlow); }}
    .timeline-label {{ font:700 10px {MONO}; letter-spacing:1.4px; fill:{theme['muted']}; }}
    .tag {{ fill:{theme['panel']}; stroke:{theme['line']}; stroke-width:1.4; }}
    .tag-dot {{ fill:{c[1]}; }}
    .tag-text {{ font:600 9px {MONO}; letter-spacing:1px; fill:{theme['ink']}; }}
    .scan {{ animation:scan {family.loop / 4:.2f}s ease-in-out infinite; }}
    .breathe {{ transform-box:fill-box; transform-origin:center; animation:breathe 8s ease-in-out infinite; }}
    .orbit {{ transform-box:fill-box; transform-origin:center; animation:orbit 24s linear infinite; }}
    .twinkle {{ animation:twinkle 6s ease-in-out infinite; }}
    .spore {{ transform-box:fill-box; transform-origin:center; animation:spore 13s ease-in-out infinite; }}
    .s1 {{ animation-delay:-2s }} .s2 {{ animation-delay:-4s }} .s3 {{ animation-delay:-6s }}
    .s4 {{ animation-delay:-8s }} .s5 {{ animation-delay:-10s }} .s6 {{ animation-delay:-12s }}
    .story-beam {{ stroke-dasharray:20 18; animation:flow 8s linear infinite; }}
    .reveal-1 {{ animation:reveal {family.loop}s ease-in-out infinite; animation-delay:0s; }}
    .reveal-2 {{ animation:reveal {family.loop}s ease-in-out infinite; animation-delay:-{family.loop * 5 / 6:.2f}s; }}
    .reveal-3 {{ animation:reveal {family.loop}s ease-in-out infinite; animation-delay:-{family.loop * 4 / 6:.2f}s; }}
    .reveal-4 {{ animation:reveal {family.loop}s ease-in-out infinite; animation-delay:-{family.loop * 3 / 6:.2f}s; }}
    .reveal-5 {{ animation:reveal {family.loop}s ease-in-out infinite; animation-delay:-{family.loop * 2 / 6:.2f}s; }}
    .reveal-6 {{ animation:reveal {family.loop}s ease-in-out infinite; animation-delay:-{family.loop * 1 / 6:.2f}s; }}
    @keyframes scan {{ 0%,100%{{transform:translateX(-38px);opacity:.18}}50%{{transform:translateX(66px);opacity:.9}} }}
    @keyframes breathe {{ 0%,100%{{opacity:.72;transform:scale(.98)}}50%{{opacity:1;transform:scale(1.035)}} }}
    @keyframes orbit {{ to{{transform:rotate(360deg)}} }}
    @keyframes twinkle {{ 0%,100%{{opacity:.15}}50%{{opacity:.72}} }}
    @keyframes spore {{ 0%,100%{{transform:translateY(18px);opacity:.12}}50%{{transform:translateY(-28px);opacity:.65}} }}
    @keyframes flow {{ to{{stroke-dashoffset:-76}} }}
    @keyframes reveal {{ 0%,8%,100%{{opacity:.42}}12%,26%{{opacity:1}}31%,95%{{opacity:.42}} }}
    @media (prefers-reduced-motion: reduce) {{
      animate, animateTransform, animateMotion {{ display:none; }}
      .scan,.breathe,.orbit,.twinkle,.spore,.story-beam,.reveal-1,.reveal-2,.reveal-3,.reveal-4,.reveal-5,.reveal-6 {{ animation:none; }}
    }}
  </style>"""


def person(x: int, y: int, scale: float = 1.0, facing: int = 1) -> str:
    sx = scale * facing
    return f"""
    <g transform="translate({x} {y}) scale({sx} {scale})">
      <circle class="skin" cx="0" cy="-40" r="11"/>
      <path class="person" d="M-12-28Q0-36 12-28L18 14 3 34-3 34-18 14Z"/>
      <path class="scene-line" d="M-9 31l-5 36M8 31l10 36M-12-12l-27 24M12-12l25 18"/>
    </g>"""


def drone(x: int, y: int, scale: float = 1.0) -> str:
    return f"""
    <g transform="translate({x} {y}) scale({scale})" class="breathe">
      <path class="scene-line" d="M-18 0H18M-7-7h14l5 14h-24Z"/>
      <circle class="hot" cx="0" cy="3" r="3"/>
      <path class="scene-muted" d="M-18 0l-13-7M18 0l13-7M-31-7h-16M31-7h16"/>
    </g>"""


def rover(x: int, y: int, scale: float = 1.0) -> str:
    return f"""
    <g transform="translate({x} {y}) scale({scale})">
      <path class="scene-line" d="M-45 6l11-26h48l18 26H-45Zm20-28l12-18 19 18M-2-40v-20M-2-60l18-8"/>
      <rect class="tag" x="-15" y="-2" width="20" height="13" rx="3"/>
      <circle class="hot" cx="-5" cy="4" r="3"/>
      <circle class="timeline-node" cx="-28" cy="13" r="14"/><circle class="timeline-node" cx="18" cy="13" r="14"/>
      <circle class="timeline-core" cx="-28" cy="13" r="4"/><circle class="timeline-core" cx="18" cy="13" r="4"/>
    </g>"""


def receipt(x: int, y: int, scale: float = 1.0) -> str:
    return f"""
    <g transform="translate({x} {y}) scale({scale})">
      <path class="tag" d="M-28-48h56v82l-9-6-9 6-10-6-10 6-9-6-9 6Z"/>
      <path class="scene-muted" d="M-17-31h34M-17-18h25M-17-5h31"/>
      <circle cx="12" cy="14" r="15" fill="none" stroke="currentColor" class="evidence"/>
      <path class="evidence" d="M4 14l7 7 14-17"/>
    </g>"""


def gate(x: int, y: int, scale: float = 1.0) -> str:
    return f"""
    <g transform="translate({x} {y}) scale({scale})">
      <path class="scene-line" d="M-46 46V-16Q0-70 46-16V46M-30 46V-8Q0-43 30-8V46"/>
      <rect class="tag" x="-25" y="-4" width="50" height="36" rx="6"/>
      <path class="evidence" d="M-13 14l10 10 19-25"/>
      <path class="deny" d="M-62-27l14 14M-48-27l-14 14" stroke="currentColor" stroke-width="6"/>
      <circle class="hot" cx="61" cy="-21" r="7"/>
    </g>"""


def project_tags(items: tuple[str, ...], y: int = 452) -> str:
    widths = [max(72, len(name) * 8 + 32) for name in items]
    total = sum(widths) + (len(items) - 1) * 10
    x = (W - total) / 2
    out = []
    for i, (name, width) in enumerate(zip(items, widths)):
        out.append(
            f'<g transform="translate({x:.1f} {y})"><rect class="tag" width="{width}" height="24" rx="12"/><circle class="tag-dot" cx="12" cy="12" r="3"/><text class="tag-text" x="23" y="16">{esc(name)}</text></g>'
        )
        x += width + 10
    return "".join(out)


def timeline_markup(family: Family) -> str:
    left, right, y = 94, 1506, 574
    step = (right - left) / 5
    parts = [
        f'<rect class="timeline" x="{left}" y="{y-4}" width="{right-left}" height="8" rx="4"/>',
        f'<rect class="timeline-done" x="{left}" y="{y-2}" width="{right-left}" height="4" rx="2"/>',
    ]
    for i, label in enumerate(family.timeline):
        x = left + i * step
        parts.append(
            f'<g class="reveal-{i+1}"><circle class="timeline-node" cx="{x:.1f}" cy="{y}" r="14"/><circle class="timeline-core" cx="{x:.1f}" cy="{y}" r="5"/><text class="timeline-label" x="{x:.1f}" y="{y+32}" text-anchor="middle">{esc(label)}</text></g>'
        )
    return "".join(parts)


def signal_to_frontier_scene(family: Family, variant: Variant, theme: dict[str, str], master: bool) -> str:
    c = variant.colors
    extra = "" if not master else f"""
      <g opacity=".65" class="twinkle">
        <circle class="warm" cx="200" cy="176" r="4"/><circle class="hot" cx="476" cy="203" r="4"/>
        <circle class="ok" cx="817" cy="174" r="4"/><circle class="deny" cx="1097" cy="202" r="4"/>
        <circle class="hot" cx="1424" cy="188" r="4"/>
      </g>"""
    return f"""
    <g id="scene-signal-frontier">
      <path class="glass glass-1" d="M56 430Q91 207 243 124h104q68 81 68 306Z"/>
      <path class="glass glass-2" d="M338 430q61-217 210-296h95q98 99 77 296Z"/>
      <path class="glass glass-3" d="M646 430q48-208 177-289h76q88 99 85 289Z"/>
      <path class="glass glass-4" d="M910 430q52-201 194-285h87q92 98 76 285Z"/>
      <path class="glass glass-5" d="M1191 430q44-183 138-269h87q84 86 70 269Z"/>
      <path class="glass glass-6" d="M1410 430q25-147 114-230h47v230Z"/>
      <path d="M56 430Q395 392 647 430t551-8q216-35 373 8v45H56Z" fill="{theme['lead']}" opacity=".9"/>

      <g class="reveal-1">
        {person(132, 347, .72, 1)}
        <path class="scene-line" d="M218 229c14-25 33-25 47 0v38M230 264v-54M242 263v-68M254 264v-59M266 267v-47"/>
        <path class="evidence story-beam" d="M206 188c23-31 69-46 109-22s55 64 31 101"/>
        <g fill="{c[1]}"><circle cx="205" cy="188" r="4"/><circle cx="228" cy="169" r="4"/><circle cx="258" cy="161" r="4"/><circle cx="287" cy="168" r="4"/><circle cx="313" cy="188" r="4"/><circle cx="330" cy="216" r="4"/><circle cx="341" cy="246" r="4"/></g>
        <text class="stage-label" x="91" y="159">DEEP MEMORY</text><text class="small" x="91" y="181">signal / model / meaning</text>
      </g>

      <g class="reveal-2">
        <path d="M405 362l74-107 42 50 53-76 104 133Z" fill="{c[5]}" fill-opacity=".55" stroke="{theme['lead']}" stroke-width="6"/>
        <path class="scene-muted" d="M405 362l74-107 42 50 53-76 104 133"/>
        {drone(594, 210, .78)}
        <path class="evidence scan" d="M594 218L455 317M594 218l19 133M594 218l70 109" opacity=".55"/>
        <g fill="{c[1]}" opacity=".66">{''.join(f'<circle cx="{420 + (i * 31) % 238}" cy="{278 + (i * 47) % 86}" r="{2 + i % 3}"/>' for i in range(18))}</g>
        <text class="stage-label" x="403" y="159">PERCEIVE</text><text class="small" x="403" y="181">Manwe / Melkor / sensor maps</text>
      </g>

      <g class="reveal-3">
        {rover(813, 344, 1.18)}
        <path class="concept" d="M691 381l48-67 33 27 43-62 45 56 36-31 49 77"/>
        <path class="evidence" d="M812 242v48"/><circle class="hot" cx="812" cy="240" r="5"/>
        <text class="stage-label" x="690" y="159">EMBODY</text><text class="small" x="690" y="181">CREBAIN / atlases / body state</text>
      </g>

      <g class="reveal-4">
        {gate(1083, 342, 1.05)}
        <path class="concept story-beam" d="M958 266c42-24 82-24 119-1"/>
        <rect class="packet" x="982" y="258" width="12" height="12" rx="3"><animateMotion path="M0 0 C35 -20 65 -20 94 0" dur="11s" repeatCount="indefinite"/></rect>
        <text class="stage-label" x="970" y="159">GOVERN</text><text class="small" x="970" y="181">NCP / Haldir / Galadriel</text>
      </g>

      <g class="reveal-5">
        {person(1280, 345, .62, 1)}
        <path class="tag" d="M1265 280h86l18 38h-119Z"/>
        <path class="evidence" d="M1281 294h20l9-11 12 18 10-8h18"/>
        {receipt(1412, 324, .78)}
        <text class="stage-label" x="1227" y="159">VERIFY</text><text class="small" x="1227" y="181">Prisoma / Cortexel / receipts</text>
      </g>

      <g class="reveal-6">
        <circle cx="1532" cy="178" r="41" fill="url(#moon)" stroke="{theme['ink']}" stroke-opacity=".45" stroke-width="2"/>
        <circle cx="1517" cy="163" r="5" fill="{theme['muted']}"/><circle cx="1544" cy="184" r="7" fill="{theme['muted']}" opacity=".6"/>
        {person(1463, 366, .48, 1)}
        {rover(1542, 383, .48)}
        <path class="future" d="M1429 363q86-82 164 5"/>
        <text class="micro" x="1513" y="421" text-anchor="middle">FUTURE THESIS</text>
      </g>
      {extra}
      {project_tags(PROJECTS, 444)}
    </g>"""


def one_mission_scene(family: Family, variant: Variant, theme: dict[str, str], master: bool) -> str:
    c = variant.colors
    chamber_x = (62, 314, 566, 818, 1070, 1322)
    chambers = []
    for i, x in enumerate(chamber_x):
        chambers.append(
            f'<path class="glass glass-{i+1}" d="M{x} 410V220q0-68 76-96h96q76 28 76 96v190Z"/>'
        )
    return f"""
    <g id="scene-one-mission">
      {''.join(chambers)}
      <path d="M56 411h1488v56H56Z" fill="{theme['lead']}"/>
      <path class="evidence story-beam" marker-end="url(#arrow)" d="M118 368C290 296 352 364 485 319s191-24 308 30 230-70 355-14 211 31 334-22"/>
      <g class="reveal-1">
        <path class="scene-line" d="M101 334l41-66 49 66M118 304h55"/><circle class="deny breathe" cx="149" cy="250" r="13"/>
        <path class="evidence scan" d="M149 250l-63 116M149 250l63 116" opacity=".55"/>
        <text class="stage-label" x="88" y="173">01 / DETECT</text><text class="small" x="88" y="195">multimodal alert</text>
      </g>
      <g class="reveal-2">
        <path class="concept" d="M340 366l39-82 42 28 42-65 65 119"/>
        <g fill="{c[1]}">{''.join(f'<circle cx="{345 + (i * 29) % 170}" cy="{265 + (i * 43) % 94}" r="{2 + i % 3}"/>' for i in range(16))}</g>
        {drone(453, 245, .65)}
        <text class="stage-label" x="340" y="173">02 / RECONSTRUCT</text><text class="small" x="340" y="195">world model + confidence</text>
      </g>
      <g class="reveal-3">
        <path class="tag" d="M609 250h148v102H609Z"/><path class="scene-muted" d="M631 278h102M631 299h76M631 320h90"/>
        <polygon class="packet" points="739,333 751,345 739,357 727,345"/>
        <path class="concept" d="M633 370h99"/><text class="micro" x="682" y="388" text-anchor="middle">SIGNED INTENT</text>
        <text class="stage-label" x="592" y="173">03 / PROPOSE</text><text class="small" x="592" y="195">controller intent - no authority</text>
      </g>
      <g class="reveal-4">
        {gate(945, 335, 1.0)}
        <path class="evidence" d="M871 244h144"/><circle class="packet" cx="881" cy="244" r="7"><animateMotion path="M0 0 H120" dur="9s" repeatCount="indefinite"/></circle>
        <text class="stage-label" x="844" y="173">04 / ADMIT</text><text class="small" x="844" y="195">policy + lease + receipt</text>
      </g>
      <g class="reveal-5">
        {rover(1197, 348, 1.05)}
        <path class="concept" d="M1109 373q91-49 177 0"/><path class="evidence" d="M1197 257v40"/>
        <text class="stage-label" x="1096" y="173">05 / EXECUTE</text><text class="small" x="1096" y="195">bounded body action</text>
      </g>
      <g class="reveal-6">
        {receipt(1437, 321, 1.05)}
        <path class="evidence" d="M1361 383h145"/><circle class="ok breathe" cx="1510" cy="383" r="10"/>
        <text class="stage-label" x="1348" y="173">06 / VERIFY</text><text class="small" x="1348" y="195">replay + evidence ladder</text>
      </g>
      <g opacity=".65">{project_tags(("Manwe", "Melkor", "NCP", "Haldir", "CREBAIN", "Prisoma"), 435)}</g>
    </g>"""


def compounding_engine_scene(family: Family, variant: Variant, theme: dict[str, str], master: bool) -> str:
    c = variant.colors
    nodes = (
        (325, 270, "MODEL", "Engram"),
        (500, 376, "MEASURE", "pid-rs"),
        (700, 236, "PROTOCOL", "NCP"),
        (902, 370, "PERCEIVE", "Manwe / Melkor"),
        (1100, 232, "GOVERN", "Haldir / Galadriel"),
        (1280, 350, "EXPLORE", "CREBAIN / atlases"),
    )
    node_markup = []
    for i, (x, y, label, project) in enumerate(nodes):
        node_markup.append(f"""
        <g class="reveal-{i+1}">
          <circle class="glass glass-{i+1}" cx="{x}" cy="{y}" r="76"/>
          <circle class="timeline-node" cx="{x}" cy="{y}" r="50"/>
          <circle class="timeline-core breathe" cx="{x}" cy="{y}" r="13"/>
          <text class="stage-label" x="{x}" y="{y+5}" text-anchor="middle">{label}</text>
          <text class="small" x="{x}" y="{y+104}" text-anchor="middle">{project}</text>
        </g>""")
    return f"""
    <g id="scene-compounding-engine">
      <ellipse class="glass glass-2" cx="800" cy="301" rx="704" ry="180" opacity=".38"/>
      <ellipse class="concept orbit" cx="800" cy="301" rx="630" ry="135"/>
      <ellipse class="future orbit" cx="800" cy="301" rx="500" ry="208"/>
      <path class="evidence story-beam" marker-end="url(#arrow)" d="M325 270C414 190 470 290 500 376s123 22 200-140 137 36 202 134 135-88 198-138 122 40 180 118"/>
      {''.join(node_markup)}
      <g transform="translate(800 302)" class="orbit">
        <circle class="warm" cx="0" cy="0" r="29"/>
        <circle class="hot" cx="0" cy="0" r="11"/>
        <path class="scene-muted" d="M-116 0h232M0-116v232"/>
        <circle class="packet" cx="116" cy="0" r="8"/>
        <circle class="packet" cx="-116" cy="0" r="8"/>
        <circle class="packet" cx="0" cy="116" r="8"/>
        <circle class="packet" cx="0" cy="-116" r="8"/>
      </g>
      <g transform="translate(800 302)">
        <circle class="timeline-node" r="78"/><circle class="timeline-core breathe" r="25"/>
        <path class="evidence" d="M-20 8l15 15 31-40"/>
        <text class="micro" x="0" y="57" text-anchor="middle">EVIDENCE -> NEXT REACH</text>
      </g>
      <path class="concept" d="M185 430Q800 490 1415 430"/>
      <text class="cap" x="800" y="456" text-anchor="middle">REUSABLE CAPABILITIES / EXPLICIT BOUNDARIES / COMPOUNDING PROOF</text>
    </g>"""


def evidence_observatory_scene(family: Family, variant: Variant, theme: dict[str, str], master: bool) -> str:
    c = variant.colors
    steps = (
        (86, 397, "CODE", "inspectable"),
        (284, 358, "TEST", "repeatable"),
        (482, 319, "RELEASE", "immutable"),
        (680, 280, "PAPER", "reviewable"),
        (878, 241, "DEMO", "observable"),
        (1076, 202, "FIELD", "validated"),
    )
    ladder = []
    for i, (x, y, label, state) in enumerate(steps):
        ladder.append(f"""
        <g class="reveal-{i+1}">
          <path class="glass glass-{i+1}" d="M{x} {y+44}h164v-86H{x}Z"/>
          <circle class="timeline-core" cx="{x+24}" cy="{y}" r="7"/>
          <text class="stage-label" x="{x+44}" y="{y+5}">{label}</text>
          <text class="micro" x="{x+44}" y="{y+26}">{state}</text>
        </g>""")
    return f"""
    <g id="scene-evidence-observatory">
      <path d="M56 444L56 398 1236 166l60 278Z" fill="{theme['lead']}" opacity=".78"/>
      {''.join(ladder)}
      <g transform="translate(1288 282)">
        <path class="glass glass-5" d="M-64 132V-84h128v216Z"/>
        <path class="scene-line" d="M-28-84v-42h56v42M-18-126l18-26 18 26"/>
        <circle class="timeline-node" cx="0" cy="-30" r="40"/>
        <circle class="hot breathe" cx="0" cy="-30" r="15"/>
        {person(-7, 94, .48, 1)}
        <text class="micro" x="0" y="123" text-anchor="middle">EVIDENCE OBSERVATORY</text>
      </g>
      <path class="evidence story-beam" d="M1288 252L1560 142"/>
      <path d="M1292 247L1560 112v98Z" fill="{c[1]}" opacity=".13" filter="url(#glow)"/>
      <g transform="translate(1482 263)">
        {receipt(0, 0, .9)}
        <circle class="ok breathe" cx="45" cy="40" r="10"/>
      </g>
      <path class="concept" d="M69 458h1459"/>
      <text class="cap" x="78" y="481">SOLID = DIRECT EVIDENCE</text>
      <text class="cap" x="800" y="481" text-anchor="middle">DASHED = CONCEPTUAL OR CONDITIONAL</text>
      <text class="cap" x="1522" y="481" text-anchor="end">TRANSLUCENT = FUTURE THESIS</text>
    </g>"""


def harsh_worlds_scene(family: Family, variant: Variant, theme: dict[str, str], master: bool) -> str:
    c = variant.colors
    return f"""
    <g id="scene-harsh-worlds">
      <path class="glass glass-1" d="M56 432V285l222-112 142 110v149Z"/>
      <path class="glass glass-2" d="M345 432V232l230-105 133 133v172Z"/>
      <path class="glass glass-3" d="M635 432V292l172-97 126 45 100 192Z"/>
      <path class="glass glass-4" d="M952 432V220l175-116 167 94v234Z"/>
      <path class="glass glass-5" d="M1212 432V246l173-127 159 99v214Z"/>
      <path d="M56 432q201-106 378-22t360-15q185-101 366 1t384 36v48H56Z" fill="{theme['lead']}"/>
      <g class="reveal-1">
        <path class="scene-line" d="M90 376V267h96v109M111 267v-48h54v48M215 376V301h112v75M241 301v-54h60v54"/>
        <path class="evidence scan" d="M100 333h210"/><circle class="warm breathe" cx="150" cy="209" r="9"/>
        <text class="stage-label" x="83" y="154">EARTH INFRA</text><text class="small" x="83" y="176">inspection / maintenance</text>
      </g>
      <g class="reveal-2">
        {rover(518, 357, 1.0)}{drone(590, 234, .7)}
        <path class="concept" d="M380 379l82-121 52 54 61-83 101 150"/>
        <text class="stage-label" x="387" y="154">REMOTE SYSTEMS</text><text class="small" x="387" y="176">local perception / bounded action</text>
      </g>
      <g class="reveal-3">
        <path class="scene-line" d="M704 357q109-147 235 0"/>
        {drone(811, 263, 1.15)}
        <path class="evidence" d="M811 268l-96 92M811 268l111 92"/>
        <text class="stage-label" x="681" y="154">AIR + OCEAN</text><text class="small" x="681" y="176">sparse comms / uncertainty</text>
      </g>
      <g class="reveal-4">
        <circle class="concept orbit" cx="1119" cy="291" r="91"/>
        <circle class="glass glass-4" cx="1119" cy="291" r="52"/>
        <g transform="translate(1205 245) rotate(-18)"><rect class="tag" x="-26" y="-12" width="52" height="24"/><path class="scene-line" d="M-26 0h-36M26 0h36M-47-17v34M47-17v34"/></g>
        <path class="evidence story-beam" d="M1009 384q105-105 212-1"/>
        <text class="stage-label" x="1000" y="154">ORBIT</text><text class="small" x="1000" y="176">delay / relay / autonomy</text>
      </g>
      <g class="reveal-5">
        <circle cx="1390" cy="237" r="68" fill="url(#moon)" stroke="{theme['ink']}" stroke-width="2"/>
        <circle cx="1365" cy="215" r="7" fill="{theme['muted']}"/><circle cx="1414" cy="251" r="10" fill="{theme['muted']}" opacity=".62"/>
        {person(1321, 370, .55, 1)}{rover(1461, 372, .62)}
        <path class="future" d="M1245 389q132-88 284 1"/>
        <text class="stage-label" x="1268" y="154">MOON -> MARS</text><text class="small" x="1268" y="176">future thesis / no deployment claim</text>
      </g>
      <path class="evidence story-beam" marker-end="url(#arrow)" d="M111 413C356 351 488 411 710 358s378 38 555-31 181 9 262 61"/>
      <rect class="packet" x="105" y="405" width="14" height="14" rx="4"><animateMotion path="M0 0 C245 -62 377 -2 599 -55 S977 -17 1154 -86 1335 -77 1416 -25" dur="24s" repeatCount="indefinite"/></rect>
      <text class="cap" x="800" y="466" text-anchor="middle">EARTH-FIRST WEDGE -> REMOTE OPERATIONS -> ORBITAL RELAY -> OFF-WORLD FRONTIER</text>
    </g>"""


SCENE_RENDERERS = {
    "01_from_signal_to_frontier": signal_to_frontier_scene,
    "02_one_mission_end_to_end": one_mission_scene,
    "03_the_compounding_engine": compounding_engine_scene,
    "04_the_evidence_observatory": evidence_observatory_scene,
    "05_autonomy_for_harsh_worlds": harsh_worlds_scene,
}


def render_svg(family: Family, variant: Variant, theme_name: str, *, master: bool = False) -> str:
    theme = THEMES[theme_name]
    scene = SCENE_RENDERERS[family.slug](family, variant, theme, master)
    title_id = f"title-{family.slug}-{variant.slug}-{theme_name}"
    desc_id = f"desc-{family.slug}-{variant.slug}-{theme_name}"
    descriptor = "CINEMATIC MASTER" if master else variant.title.upper()
    master_note = " / HIGH-DENSITY CUT" if master else ""
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" role="img" aria-labelledby="{title_id} {desc_id}">
  <title id="{title_id}">{esc(family.title)} - {esc(variant.title)}</title>
  <desc id="{desc_id}">{esc(family.thesis)} The composition reads left to right through {esc(', '.join(family.timeline).lower())}. Solid luminous lines indicate direct evidence, dashed lines indicate conceptual or conditional relationships, and translucent elements indicate a future thesis. The {family.loop}-second animation explains sensing, routing, authorization, verification, or exploration and stops when reduced motion is requested.</desc>
  {defs_markup(variant, theme)}
  {style_markup(family, variant, theme)}
  <rect class="bg" width="{W}" height="{H}"/>
  <rect class="frame" x="18" y="18" width="1564" height="604" rx="34"/>
  <rect class="inner" x="34" y="34" width="1532" height="572" rx="27"/>
  <rect class="grain" x="35" y="35" width="1530" height="570" rx="26"/>
  {motif_markup(variant, theme, family.loop)}
  <g id="header">
    <path d="M58 54v44" stroke="{variant.colors[1]}" stroke-width="5" stroke-linecap="round"/>
    <text class="title" x="78" y="75">{esc(family.title)}</text>
    <text class="subtitle" x="78" y="99">{esc(family.thesis)}</text>
    <text class="cap" x="1535" y="61" text-anchor="end">{esc(descriptor)} / {family.loop}S LOOP{master_note}</text>
    <text class="cap" x="1535" y="83" text-anchor="end">SELF-CONTAINED SVG / {theme_name.upper()} / REDUCED-MOTION SAFE</text>
    <line class="rule" x1="58" y1="113" x2="1542" y2="113"/>
  </g>
  {scene}
  <g id="claim">
    <line class="hairline" x1="58" y1="500" x2="1542" y2="500"/>
    <text class="cap" x="58" y="522">CORE CLAIM</text>
    <text class="claim" x="170" y="522">{esc(family.thesis)}</text>
    <text class="micro" x="1542" y="541" text-anchor="end">SOLID = EVIDENCE  /  DASHED = CONDITIONAL  /  TRANSLUCENT = FUTURE</text>
  </g>
  <g id="timeline">
    <text class="cap" x="58" y="553">STORY TIMELINE</text>
    {timeline_markup(family)}
  </g>
</svg>
"""


def file_stem(family: Family, variant: Variant, theme: str) -> str:
    return f"{family.slug}__{variant.slug}__{theme}.svg"


def master_stem(family: Family, theme: str) -> str:
    short = {
        "01_from_signal_to_frontier": "01_from_signal_to_frontier_master",
        "02_one_mission_end_to_end": "02_one_mission_end_to_end_master",
        "03_the_compounding_engine": "03_compounding_engine_master",
        "04_the_evidence_observatory": "04_evidence_observatory_master",
        "05_autonomy_for_harsh_worlds": "05_autonomy_for_harsh_worlds_master",
    }[family.slug]
    return f"{short}__{theme}.svg"


def write_text(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    normalized = "\n".join(line.rstrip() for line in content.splitlines())
    if content.endswith("\n"):
        normalized += "\n"
    path.write_text(normalized, encoding="utf-8", newline="\n")


def gallery_css() -> str:
    return """
:root{color-scheme:dark;--bg:#05080d;--surface:#0a1119;--surface2:#101b26;--line:#2d4356;--ink:#eef6ff;--muted:#91a5b8;--cyan:#58dcff;--gold:#f6c453}
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:radial-gradient(circle at 48% -15%,#183148 0,#05080d 43%);color:var(--ink);font:14px/1.55 ui-monospace,SFMono-Regular,Menlo,monospace}
a{color:var(--cyan);text-decoration:none}a:hover{text-decoration:underline;text-underline-offset:.2em}a:focus-visible,button:focus-visible{outline:3px solid var(--gold);outline-offset:3px}
.hero{padding:54px max(22px,5vw) 30px;border-bottom:1px solid var(--line);background:linear-gradient(180deg,#0a1420f2,#05080df2);position:sticky;top:0;z-index:4;backdrop-filter:blur(18px)}
.kicker{color:var(--cyan);letter-spacing:.22em;font-size:11px}.hero h1{margin:8px 0 10px;font-size:clamp(23px,3vw,42px);letter-spacing:.08em}.hero p{color:var(--muted);max-width:980px;margin:0}.controls{display:flex;gap:9px;flex-wrap:wrap;margin-top:20px}.controls+ .controls{margin-top:9px}
button,.pill{border:1px solid var(--line);background:#101b26;color:var(--muted);border-radius:999px;padding:8px 12px;font:inherit;cursor:pointer}.active{background:var(--cyan);border-color:var(--cyan);color:#031018}.theme{margin-left:auto}
main{padding:30px max(18px,4vw) 90px;display:grid;gap:28px}.card{background:linear-gradient(180deg,#0e1822,#080e14);border:1px solid var(--line);border-radius:22px;padding:18px;box-shadow:0 28px 80px #0008}.meta{display:flex;justify-content:space-between;gap:20px;align-items:start;margin-bottom:13px}.meta h2{margin:0 0 5px;font-size:17px;letter-spacing:.08em}.meta p{margin:0;color:var(--muted)}.loop{white-space:nowrap;color:var(--muted);font-size:11px;letter-spacing:.1em}
object,.fallback{display:block;width:100%;aspect-ratio:2.5/1;border:1px solid #344b5f;border-radius:15px;background:#030508}.links{display:flex;gap:9px;flex-wrap:wrap;margin-top:13px}.links a{border:1px solid var(--line);border-radius:999px;padding:7px 11px}.hidden{display:none}
.note{max-width:1000px;margin:0 auto 28px;padding:17px 20px;border:1px solid var(--line);border-radius:16px;background:#0b151f;color:var(--muted)}
footer{padding:26px max(18px,4vw) 60px;color:var(--muted);border-top:1px solid var(--line)}
@media(min-width:1480px){main.grid{grid-template-columns:1fr 1fr}.hero{position:relative}}
@media(max-width:760px){.hero{position:relative;padding-top:34px}.theme{margin-left:0}.meta{display:block}.loop{display:block;margin-top:8px}main{padding-inline:12px}.card{padding:10px;border-radius:15px}.links{padding:0 4px 5px}}
@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}}
"""


def gallery_script() -> str:
    return """
const cards=[...document.querySelectorAll('.card')];let family='all',variant='all',theme='dark';
function apply(){cards.forEach(c=>c.classList.toggle('hidden',!((family==='all'||c.dataset.family===family)&&(variant==='all'||c.dataset.variant===variant))));}
function activate(group,target){document.querySelectorAll(group).forEach(b=>b.classList.remove('active'));target.classList.add('active');}
document.querySelectorAll('[data-family-filter]').forEach(b=>b.onclick=()=>{family=b.dataset.familyFilter;activate('[data-family-filter]',b);apply()});
document.querySelectorAll('[data-variant-filter]').forEach(b=>b.onclick=()=>{variant=b.dataset.variantFilter;activate('[data-variant-filter]',b);apply()});
const themeButton=document.querySelector('[data-theme]');if(themeButton)themeButton.onclick=()=>{theme=theme==='dark'?'light':'dark';themeButton.textContent=theme==='dark'?'view light SVGs':'view dark SVGs';document.querySelectorAll('object[data-dark]').forEach(o=>{o.data=o.dataset[theme]});};
"""


def atlas_gallery_html() -> str:
    family_buttons = ['<button class="active" data-family-filter="all">all stories</button>'] + [
        f'<button data-family-filter="{f.slug}">{esc(f.title)}</button>' for f in FAMILIES
    ]
    variant_buttons = ['<button class="active" data-variant-filter="all">all art directions</button>'] + [
        f'<button data-variant-filter="{v.slug}">{esc(v.title)}</button>' for v in VARIANTS
    ]
    cards = []
    for family in FAMILIES:
        for variant in VARIANTS:
            base = f"murals/{family.slug}/{variant.slug}/{family.slug}__{variant.slug}"
            preview = f"previews/{family.slug}__{variant.slug}.png"
            cards.append(f"""
<article class="card" data-family="{family.slug}" data-variant="{variant.slug}">
 <div class="meta"><div><h2>{esc(family.title)}</h2><p>{esc(variant.title)} - {esc(variant.note)}</p></div><span class="loop">{family.loop}s loop</span></div>
 <object data="{base}__dark.svg" data-dark="{base}__dark.svg" data-light="{base}__light.svg" type="image/svg+xml" aria-label="{esc(family.title)} - {esc(variant.title)}"><img class="fallback" src="{preview}" alt="Static preview of {esc(family.title)} in {esc(variant.title)} style"></object>
 <div class="links"><a href="{base}__dark.svg">dark SVG</a><a href="{base}__light.svg">light SVG</a><a href="{preview}">PNG preview</a></div>
</article>""")
    return f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SepAhead Animated Mural Atlas</title><meta name="description" content="Twenty-five animated SVG mural directions across five story families and five art systems."><style>{gallery_css()}</style></head><body>
<header class="hero"><div class="kicker">SEPAHEAD / ANIMATED MURAL SYSTEM / FINAL</div><h1>25 stories-in-motion</h1><p>Five narrative families x five art directions, each in dark and light, with 80-96 second semantic motion. Start with the cinematic masters; use this atlas to compare the full design space.</p><div class="controls"><a class="pill" href="cinematic_masters/CINEMATIC_MASTERS.html">open 5 cinematic masters</a><button class="theme" data-theme>view light SVGs</button></div><div class="controls">{''.join(family_buttons)}</div><div class="controls">{''.join(variant_buttons)}</div></header>
<main class="grid">{''.join(cards)}</main><footer>Solid luminous paths = directly inspectable evidence. Dashed paths = conceptual, optional, or conditional relationships. Translucent paths = future thesis.</footer><script>{gallery_script()}</script></body></html>"""


def masters_gallery_html(asset_prefix: str = "svg", atlas_href: str = "../START_HERE.html") -> str:
    cards = []
    for family in FAMILIES:
        variant = variant_by_slug(MASTER_VARIANT[family.slug])
        dark = f"{asset_prefix}/{master_stem(family, 'dark')}"
        light = f"{asset_prefix}/{master_stem(family, 'light')}"
        preview = f"previews/{master_stem(family, 'dark').replace('__dark.svg', '.png')}"
        cards.append(f"""
<article class="card">
 <div class="meta"><div><h2>{esc(family.title)}</h2><p>{esc(family.thesis)}</p></div><span class="loop">{family.loop}s master loop</span></div>
 <object data="{dark}" data-dark="{dark}" data-light="{light}" type="image/svg+xml" aria-label="{esc(family.title)} cinematic master"><img class="fallback" src="{preview}" alt="Static preview of {esc(family.title)}"></object>
 <div class="links"><a href="{dark}">dark SVG</a><a href="{light}">light SVG</a></div>
</article>""")
    return f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SepAhead Cinematic Mural Masters</title><meta name="description" content="Five flagship animated SVG murals explaining a research systems portfolio from signal to frontier."><style>{gallery_css()}</style></head><body>
<header class="hero"><div class="kicker">SEPAHEAD / CINEMATIC MASTER CUTS</div><h1>Use one. Link to the rest.</h1><p>The profile uses From Signal to Frontier as its single founder-story mural. The other master cuts live here as deeper explanations of mission flow, compounding capability, evidence maturity, and venture-scale frontier.</p><div class="controls"><a class="pill" href="{atlas_href}">open all 25 directions</a><button class="theme" data-theme>view light SVGs</button></div></header>
<div class="note"><strong>Reading grammar:</strong> cave art supplies deep-time narrative; stained glass supplies material structure; cybernetics supplies motion semantics; space appears only as the terminal frontier.</div><main>{''.join(cards)}</main><footer>The mural explains the work; it does not replace the evidence. Every label preserves the profile's released, conditional, and future-state boundaries.</footer><script>{gallery_script()}</script></body></html>"""


def readme_insert() -> str:
    alt = (
        "From Signal to Frontier: an animated stained-glass story moving left to right from deep memory and signal modeling, "
        "through multimodal perception, embodied systems, authorization gates, and inspectable evidence, to a clearly labeled "
        "future lunar frontier. Solid paths mean directly inspectable evidence; dashed paths are conceptual or conditional; "
        "translucent paths are future thesis."
    )
    return f"""<!-- BEGIN:from-signal-to-frontier -->
<h3 align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/sepahead/sepahead/main/assets/title-frontier-dark.svg"><source media="(prefers-color-scheme: light)" srcset="https://raw.githubusercontent.com/sepahead/sepahead/main/assets/title-frontier-light.svg"><img src="https://raw.githubusercontent.com/sepahead/sepahead/main/assets/title-frontier-light.svg" width="820" height="50" decoding="async" alt="From signal to frontier - the portfolio story in one animated mural"/></picture></h3>

<p align="center">
<a href="https://sepahead.github.io/sepahead/mural/" title="Explore all five cinematic mural stories"><picture><source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/sepahead/sepahead/main/assets/from-signal-to-frontier-dark.svg"><source media="(prefers-color-scheme: light)" srcset="https://raw.githubusercontent.com/sepahead/sepahead/main/assets/from-signal-to-frontier-light.svg"><img src="https://raw.githubusercontent.com/sepahead/sepahead/main/assets/from-signal-to-frontier-light.svg" width="820" height="328" decoding="async" alt="{esc(alt)}"/></picture></a>
</p>

<p align="center"><sub><b>Story grammar:</b> evidence is solid, optional or conditional seams are dashed, and future thesis is translucent. <a href="https://sepahead.github.io/sepahead/mural/">Explore the five cinematic master cuts &#8599;</a></sub></p>
<!-- END:from-signal-to-frontier -->
"""


def package_readme() -> str:
    return """# SepAhead Animated Mural System - Final

This is the complete production package for the portfolio narrative system.

Start here:

1. Open `START_HERE.html` to compare all 25 concepts live.
2. Open `cinematic_masters/CINEMATIC_MASTERS.html` to review the five flagship cuts.
3. Use `profile_integration/README_INSERT.md` and the two lead SVGs for the GitHub profile.
4. Read `docs/IMPLEMENTATION_GUIDE.md` for deployment, accessibility, and maintenance.

## What is included

- 5 story families x 5 art directions = 25 concepts.
- Dark and light versions of every concept = 50 animated SVGs.
- 5 high-density cinematic masters in dark and light = 10 master SVGs.
- Static PNG previews for every concept and every master.
- A GitHub-ready primary mural pair: From Signal to Frontier / Obsidian Mission Glass.
- A ready-to-paste README section, selection matrix, manifest, checksums, and source generator.
- A visual PDF field guide and 20-lens quality review.

## Primary recommendation

Use **From Signal to Frontier / Obsidian Mission Glass** once, directly after the social/CV strip and before activity. Link it to the deeper five-master gallery. Do not stack five large murals in the README.

## Truthfulness grammar

- Solid and bright: public, released, reproducible, or directly inspectable evidence.
- Dashed: conceptual seam, optional protocol role, or conditional research relationship.
- Translucent: future thesis or frontier implication that is not yet proven.

All SVGs are self-contained, include `title` and `desc`, contain a reduced-motion fallback, and have no scripts, remote fonts, or external image dependencies.
"""


def implementation_guide() -> str:
    return """# Implementation guide

## Recommended GitHub order

1. Hero
2. Social and CV strip
3. From Signal to Frontier mural
4. The Pulse / contribution evidence
5. Selected Work
6. Ecosystem map, toolbox, agentic stack, and contact

This order establishes the thesis before presenting proof. The mural is an explanatory bridge, not a decorative header.

## File placement

Copy these files into the profile repository:

- `profile_integration/assets/from-signal-to-frontier-dark.svg`
- `profile_integration/assets/from-signal-to-frontier-light.svg`
- `profile_integration/assets/title-frontier-dark.svg`
- `profile_integration/assets/title-frontier-light.svg`

Paste `profile_integration/README_INSERT.md` after the CV links and before the current Pulse heading.

The complete deeper gallery is in `site/mural/`. It is suitable for GitHub Pages at `/mural/`.

## Animation and accessibility

The primary loop is 84 seconds. Movement maps to sensing, routing, admission, evidence, orbit, or exploration. It intentionally includes long quiet holds. Every file honors `prefers-reduced-motion: reduce`; the static composition remains complete without movement.

GitHub receives separate dark and light files through a `<picture>` element because relying on theme media queries inside a raw SVG is less predictable. The fallback `<img>` points to the light asset and has a complete narrative alt description.

## Maintenance

Run the dependency-free Python generator to rebuild the SVG and HTML layer. The verification build then parses every SVG as XML, renders previews with Inkscape, screenshots both galleries in Chromium, validates link targets, and writes checksums.

## Content boundaries

Do not replace dashed or translucent paths with solid evidence styling unless the corresponding integration, release, or deployment is directly inspectable. Do not remove phrases such as future thesis, research-stage, or conditional where they prevent overclaiming.
"""


def selection_matrix() -> str:
    rows = [
        "| Story family | Best role | Recommended art direction | Profile use |",
        "| --- | --- | --- | --- |",
        "| From Signal to Frontier | Founder narrative | Obsidian Mission Glass | Primary README mural |",
        "| One Mission, End to End | Concrete demo companion | Bioluminescent Deep-Time | Deep gallery / demo |",
        "| The Compounding Engine | Founder-market fit | Celestial Cartographer | Portfolio / pitch |",
        "| The Evidence Observatory | Credibility and maturity | Lapis Cybernetic Miniature | Technical diligence |",
        "| Autonomy for Harsh Worlds | Venture-scale implication | Holographic Basalt Relief | Vision / pitch close |",
    ]
    return "\n".join(rows) + "\n"


def generate_package(out: Path) -> dict[str, object]:
    out.mkdir(parents=True, exist_ok=True)
    manifest: dict[str, object] = {
        "name": "SepAhead Animated Mural System - Final",
        "canvas": [W, H],
        "concept_count": len(FAMILIES) * len(VARIANTS),
        "theme_svg_count": len(FAMILIES) * len(VARIANTS) * 2,
        "master_svg_count": len(FAMILIES) * 2,
        "families": [],
    }

    for family in FAMILIES:
        family_entry = {
            "slug": family.slug,
            "title": family.title,
            "thesis": family.thesis,
            "loop_seconds": family.loop,
            "timeline": list(family.timeline),
            "variants": [],
        }
        for variant in VARIANTS:
            variant_dir = out / "murals" / family.slug / variant.slug
            for theme_name in ("dark", "light"):
                write_text(
                    variant_dir / file_stem(family, variant, theme_name),
                    render_svg(family, variant, theme_name),
                )
            family_entry["variants"].append({"slug": variant.slug, "title": variant.title, "note": variant.note})
        manifest["families"].append(family_entry)

        master_variant = variant_by_slug(MASTER_VARIANT[family.slug])
        for theme_name in ("dark", "light"):
            master_path = out / "cinematic_masters" / "svg" / master_stem(family, theme_name)
            write_text(master_path, render_svg(family, master_variant, theme_name, master=True))

        best_variant = variant_by_slug(MASTER_VARIANT[family.slug])
        for theme_name in ("dark", "light"):
            src = out / "murals" / family.slug / best_variant.slug / file_stem(family, best_variant, theme_name)
            dst = out / "best_of" / src.name
            dst.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(src, dst)

    primary_family = family_by_slug("01_from_signal_to_frontier")
    primary_variant = variant_by_slug(MASTER_VARIANT[primary_family.slug])
    for theme_name in ("dark", "light"):
        master_source = out / "cinematic_masters" / "svg" / master_stem(primary_family, theme_name)
        profile_asset = out / "profile_integration" / "assets" / f"from-signal-to-frontier-{theme_name}.svg"
        profile_asset.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(master_source, profile_asset)

    write_text(out / "START_HERE.html", atlas_gallery_html())
    write_text(out / "cinematic_masters" / "CINEMATIC_MASTERS.html", masters_gallery_html())
    write_text(out / "README.md", package_readme())
    write_text(out / "docs" / "IMPLEMENTATION_GUIDE.md", implementation_guide())
    write_text(out / "docs" / "SELECTION_MATRIX.md", selection_matrix())
    write_text(out / "profile_integration" / "README_INSERT.md", readme_insert())
    write_text(out / "manifest.json", json.dumps(manifest, indent=2) + "\n")

    generator_copy = out / "generator" / "generate_mural_system.py"
    generator_copy.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(Path(__file__).resolve(), generator_copy)
    return manifest


def install_repo(package: Path, repo: Path) -> None:
    assets = repo / "assets"
    docs = repo / "docs" / "mural"
    assets.mkdir(parents=True, exist_ok=True)
    docs.mkdir(parents=True, exist_ok=True)

    for theme_name in ("dark", "light"):
        shutil.copy2(
            package / "profile_integration" / "assets" / f"from-signal-to-frontier-{theme_name}.svg",
            assets / f"from-signal-to-frontier-{theme_name}.svg",
        )

    for family in FAMILIES:
        for theme_name in ("dark", "light"):
            source = package / "cinematic_masters" / "svg" / master_stem(family, theme_name)
            target = docs / "assets" / source.name
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, target)
        for variant in VARIANTS:
            for theme_name in ("dark", "light"):
                source = package / "murals" / family.slug / variant.slug / file_stem(family, variant, theme_name)
                target = docs / "atlas" / "murals" / family.slug / variant.slug / source.name
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(source, target)

    write_text(docs / "index.html", masters_gallery_html("assets", "atlas/"))
    atlas_html = atlas_gallery_html().replace(
        'href="cinematic_masters/CINEMATIC_MASTERS.html"', 'href="../"'
    )
    write_text(docs / "atlas" / "index.html", atlas_html)
    shutil.copy2(Path(__file__).resolve(), repo / "scripts" / "generate-mural-system.py")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, required=True, help="Package output directory")
    parser.add_argument("--repo", type=Path, help="Optional profile repository to install generated assets into")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    package = args.out.resolve()
    manifest = generate_package(package)
    if args.repo:
        install_repo(package, args.repo.resolve())
    print(json.dumps({
        "package": str(package),
        "repo": str(args.repo.resolve()) if args.repo else None,
        "concepts": manifest["concept_count"],
        "theme_svgs": manifest["theme_svg_count"],
        "master_svgs": manifest["master_svg_count"],
    }, indent=2))


if __name__ == "__main__":
    main()
