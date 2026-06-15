#!/usr/bin/env python3
# ═══════════════════════════════════════════════════════════════════════
#  GEEKLEARN GAMES — tools/gen-keyart.py
#  ───────────────────────────────────────────────────────────────────────
#  Génère des KEY-ART procéduraux (placeholders premium) pour chaque œuvre,
#  aux MÊMES chemins que les visuels actuels. Atmosphère cinématique
#  monochrome + couleur d'accent (tint) de l'œuvre. Aucun texte : les titres
#  restent affichés par le HTML par-dessus (cards, hero, buybox).
#
#  ▶ Lancer :  python tools/gen-keyart.py
#  ▶ Remplacer par du vrai art : dépose un .png/.jpg/.svg au même chemin
#    (ou change le chemin dans js/data.js).
#
#  Sortie : assets/img/works/<films|games>/<id>(.svg | -cover.svg | -ssN.svg)
# ═══════════════════════════════════════════════════════════════════════
import os, random

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

WORKS = [
    ("trick-or-treat",                 "film", "#ff6a00"),
    ("a-terrible-wonderful-christmas", "film", "#3a7bd5"),
    ("easter-my-bunny",                "film", "#56ab2f"),
    ("eid-of-light",                   "film", "#f7931e"),
    ("backrooms-liminal",              "game", "#f5e642"),
    ("soul-redemption",                "game", "#8b44ff"),
    ("soul-redemption-frenzy-fest",    "game", "#ff3a3a"),
    ("hush",                           "game", "#00d4ff"),
]


def hex_rgb(h):
    h = h.lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    return [int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)]


def rgba(c, a):
    return f"rgba({c[0]},{c[1]},{c[2]},{round(a,3)})"


def mix(a, b, t):
    return [round(a[i] + (b[i] - a[i]) * t) for i in range(3)]


def fnv(s):
    h = 2166136261
    for ch in s:
        h ^= ord(ch)
        h = (h * 16777619) & 0xFFFFFFFF
    return h


def r2(n):
    return round(n, 2)


WHITE = [255, 255, 255]


def art(w, h, tint, seed):
    rnd = random.Random(seed)
    T = hex_rgb(tint)
    portrait = h >= w

    def R(a, b):
        return a + (b - a) * rnd.random()

    gx, gy = R(0.22, 0.78) * w, R(0.16, 0.46) * h
    gr = max(w, h) * R(0.62, 0.92)
    sx, sy = R(0.1, 0.9) * w, R(0.5, 0.9) * h
    sr = max(w, h) * R(0.4, 0.6)
    beam = -22 + R(-8, 8)
    arche = int(R(0, 3))

    # god rays
    rays = ""
    for _ in range(5 + int(R(0, 4))):
        rx, rw, op = R(0.1, 0.95) * w, R(0.6, 2.6), R(0.04, 0.14)
        col = rgba(T, op * 1.3) if rnd.random() > 0.55 else rgba(WHITE, op)
        rays += f'<rect x="{r2(rx)}" y="{-h*0.3}" width="{r2(rw)}" height="{r2(h*1.6)}" fill="{col}"/>'

    # particles
    parts = ""
    for _ in range(14 + int(R(0, 14))):
        px, py, pr, op = R(0, 1) * w, R(0, 1) * h, R(0.6, 2.6), R(0.08, 0.5)
        col = rgba(T, op) if rnd.random() > 0.6 else rgba(WHITE, op)
        parts += f'<circle cx="{r2(px)}" cy="{r2(py)}" r="{r2(pr)}" fill="{col}"/>'

    # focal element
    if arche == 0:  # concentric rings
        cx, cy = R(0.3, 0.7) * w, R(0.28, 0.6) * h
        rad = max(w, h) * R(0.28, 0.46)
        focal = (f'<circle cx="{r2(cx)}" cy="{r2(cy)}" r="{r2(rad)}" fill="none" stroke="{rgba(T,0.22)}" stroke-width="1.5"/>'
                 f'<circle cx="{r2(cx)}" cy="{r2(cy)}" r="{r2(rad*0.62)}" fill="none" stroke="{rgba(WHITE,0.06)}" stroke-width="1"/>')
    elif arche == 1:  # luminous monolith
        bx, bw = R(0.32, 0.62) * w, R(0.012, 0.03) * w
        focal = f'<rect x="{r2(bx)}" y="{r2(h*0.12)}" width="{r2(bw)}" height="{r2(h*0.66)}" fill="url(#mono)"/>'
    else:  # portal arch
        cx, cy = R(0.34, 0.66) * w, h * R(0.46, 0.66)
        rad = max(w, h) * R(0.22, 0.34)
        focal = (f'<path d="M {r2(cx-rad)} {r2(cy)} A {r2(rad)} {r2(rad)} 0 0 1 {r2(cx+rad)} {r2(cy)}" fill="none" stroke="{rgba(T,0.26)}" stroke-width="2"/>'
                 f'<path d="M {r2(cx-rad*0.6)} {r2(cy)} A {r2(rad*0.6)} {r2(rad*0.6)} 0 0 1 {r2(cx+rad*0.6)} {r2(cy)}" fill="none" stroke="{rgba(WHITE,0.07)}" stroke-width="1"/>')

    # horizon (landscape only)
    horizon = ""
    if not portrait:
        hy = h * R(0.6, 0.78)
        horizon = (f'<rect x="0" y="{r2(hy)}" width="{w}" height="1" fill="{rgba(WHITE,0.1)}"/>'
                   f'<rect x="0" y="{r2(hy)}" width="{w}" height="{r2(h-hy)}" fill="url(#floor)"/>')

    # viewfinder brackets (brand motif)
    m = 26 if portrait else 34
    L = 20 if portrait else 28
    bc = rgba(WHITE, 0.14)
    brackets = (f'<path d="M{m} {m+L} V{m} H{m+L}" stroke="{bc}" stroke-width="1" fill="none"/>'
                f'<path d="M{w-m-L} {m} H{w-m} V{m+L}" stroke="{bc}" stroke-width="1" fill="none"/>'
                f'<path d="M{m} {h-m-L} V{h-m} H{m+L}" stroke="{bc}" stroke-width="1" fill="none"/>'
                f'<path d="M{w-m-L} {h-m} H{w-m} V{h-m-L}" stroke="{bc}" stroke-width="1" fill="none"/>')

    top = mix([10, 10, 13], T, 0.05)
    bot = [6, 6, 8]
    scrim = f'<rect width="{w}" height="{h}" fill="url(#scrim)"/>' if portrait else ""

    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}">
  <defs>
    <linearGradient id="base" x1="0" y1="0" x2="0.25" y2="1">
      <stop offset="0" stop-color="rgb({top[0]},{top[1]},{top[2]})"/>
      <stop offset="1" stop-color="rgb({bot[0]},{bot[1]},{bot[2]})"/>
    </linearGradient>
    <radialGradient id="glowA" cx="{r2(gx/w)}" cy="{r2(gy/h)}" r="{r2(gr/max(w,h))}">
      <stop offset="0" stop-color="{rgba(T,0.30)}"/>
      <stop offset="0.42" stop-color="{rgba(T,0.10)}"/>
      <stop offset="1" stop-color="{rgba(T,0)}"/>
    </radialGradient>
    <radialGradient id="glowB" cx="{r2(sx/w)}" cy="{r2(sy/h)}" r="{r2(sr/max(w,h))}">
      <stop offset="0" stop-color="{rgba(mix(T,WHITE,0.3),0.10)}"/>
      <stop offset="1" stop-color="{rgba(T,0)}"/>
    </radialGradient>
    <radialGradient id="vig" cx="0.5" cy="0.46" r="0.75">
      <stop offset="0.45" stop-color="rgba(0,0,0,0)"/>
      <stop offset="1" stop-color="rgba(0,0,0,0.62)"/>
    </radialGradient>
    <linearGradient id="scrim" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0.5" stop-color="rgba(7,7,8,0)"/>
      <stop offset="1" stop-color="rgba(7,7,8,0.78)"/>
    </linearGradient>
    <linearGradient id="mono" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="{rgba(T,0)}"/>
      <stop offset="0.5" stop-color="{rgba(T,0.5)}"/>
      <stop offset="1" stop-color="{rgba(T,0)}"/>
    </linearGradient>
    <linearGradient id="floor" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="{rgba(T,0.06)}"/>
      <stop offset="1" stop-color="rgba(0,0,0,0)"/>
    </linearGradient>
    <filter id="grain"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/></filter>
  </defs>
  <rect width="{w}" height="{h}" fill="url(#base)"/>
  <rect width="{w}" height="{h}" fill="url(#glowB)"/>
  <g transform="rotate({r2(beam)} {w/2} {h/2})">{rays}</g>
  {horizon}
  {focal}
  <rect width="{w}" height="{h}" fill="url(#glowA)"/>
  {parts}
  {scrim}
  <rect width="{w}" height="{h}" fill="url(#vig)"/>
  <rect width="{w}" height="{h}" filter="url(#grain)" opacity="0.06"/>
  {brackets}
  <rect x="0.5" y="0.5" width="{w-1}" height="{h-1}" fill="none" stroke="rgba(255,255,255,0.06)"/>
</svg>'''


def write(rel, svg):
    p = os.path.join(ROOT, rel)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, "w", encoding="utf-8") as f:
        f.write(svg)


count = 0
for wid, wtype, tint in WORKS:
    d = "assets/img/works/" + ("films" if wtype == "film" else "games")
    write(f"{d}/{wid}.svg",       art(600, 900, tint, fnv(f"{wid}|cover|0")));  count += 1
    write(f"{d}/{wid}-cover.svg", art(600, 900, tint, fnv(f"{wid}|cover|1")));  count += 1
    for i in range(1, 6):
        write(f"{d}/{wid}-ss{i}.svg", art(1280, 720, tint, fnv(f"{wid}|ss|{i}")));  count += 1

print(f"OK - {count} key-art SVG generes.")
