"""Generates data/maps/map-13.json: the ocean test. A beach in the south, open sea to the north with
a sandbar and a small island. The map has the `ocean` rule (animated wave surface; balls, boxes and
ragdolls of the physics lab float on it), `swim` (water is swum, not a wall), `physicsLab` (the
panel that drops things) and `timeControl` (, and . turn the time of day). The look of the water
is in `environment.water`.

Usage (from the repo root): python scripts/gen-map13.py ."""
import json
import math
import sys

root = sys.argv[1]
N = 160
HALF = N // 2
ISLE = (0.0, -44.0, 11.0)


def smooth(t):
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)


def height(x, z):
    # Beach: z = 30 is the waterline; dry sand and dunes to the south, a gentle shelf to the north.
    shore = (z - 30.0)
    if shore > 0:
        h = min(shore * 0.18, 3.2) + math.sin(x * 0.12) * math.cos(z * 0.1) * 0.35 * smooth(shore / 8)
    else:
        h = max(-0.2 + shore * 0.11, -9.0)
    # A sandbar across the middle: shallow, so waves fade over it.
    bar = math.exp(-((z + 8.0) ** 2) / 40.0) * (1.0 + 0.2 * math.sin(x * 0.07))
    h = max(h, -1.4 + bar * 1.6) if abs(z + 8.0) < 14 else h
    # The island.
    ix, iz, ir = ISLE
    r = math.hypot(x - ix, z - iz)
    if r < ir + 8:
        isle = 3.4 * (1 - (r / ir) ** 2) - 0.2 if r < ir else -0.2 - (r - ir) * 0.3
        h = max(h, isle)
    return round(max(h, -9.0), 1)


heights = [[height(c - HALF, r - HALF) for c in range(N + 1)] for r in range(N + 1)]
paint = [
    ["grass" if height(c - HALF + 0.5, r - HALF + 0.5) > 2.6 else "sand" for c in range(N)]
    for r in range(N)
]


def prop(asset, x, z, hw, hd, rotation=0):
    return {"asset": asset, "x": round(x, 1), "z": round(z, 1), "rotation": rotation, "scale": 1,
            "layer": "outdoor", "collider": {"halfW": hw, "halfD": hd}}


props = [prop("house", 22, 46, 4, 3.5)]
for i in range(14):
    a = i * 2.399
    x, z = -50 + (i * 17) % 100, 40 + (i * 7) % 28
    if height(x, z) > 0.8 and all(abs(x - p["x"]) > 5 or abs(z - p["z"]) > 5 for p in props):
        props.append(prop("tree", x, z, 0.6, 0.6))
for i in range(6):
    a = i * 2.399
    x, z = ISLE[0] + math.cos(a) * 5, ISLE[1] + math.sin(a) * 5
    props.append(prop("tree", x, z, 0.6, 0.6))

units = [
    {"type": f"marine{i + 1}", "x": -3 + i * 2, "z": 38 + (i % 2), "owner": "p1", "rotation": 3.14}
    for i in range(4)
]

data = {
    "version": 1,
    "meta": {
        "id": "map-13",
        "name": "Map 13 - Ocean test",
        "author": "Zombie Horde Survivors",
        "created": "2026-10-23",
        "updated": "2026-10-23",
        "size": {"width": N, "depth": N},
    },
    "terrain": {"heights": heights, "water": 0.0, "paint": paint},
    "surfaces": [],
    "props": props,
    "players": [
        {"id": "p1", "name": "Player 1", "kind": "human", "team": 0, "color": "#4aa3ff"},
        {"id": "horde", "name": "The horde", "kind": "ai", "team": 1, "color": "#d94b3d"},
    ],
    "units": units,
    "environment": {"sky": True, "timeOfDay": 17.7, "sun": True, "moon": True, "clouds": 0.35,
                    "water": {"neonOrbs": 4}},
    "logic": {"mode": "waves", "noWaves": True, "swim": True, "physicsLab": True, "timeControl": True,
              "ocean": {}, "startGold": 0, "boss": {"enabled": False}},
}
json.dump(data, open(root + "/data/maps/map-13.json", "w"), separators=(",", ":"))
print("props", len(props), "units", len(units), "min", min(min(r) for r in heights), "max", max(max(r) for r in heights))
