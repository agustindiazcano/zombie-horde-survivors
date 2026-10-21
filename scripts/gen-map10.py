"""Generates data/maps/map-10.json: the swim test. A small island in a deep sea with a shallow
reef, an underwater plateau and a trench to dive in. The map has the `swim` rule, so water is
not a wall: C dives, Space surfaces, Shift swims fast, and the oxygen bar runs while the head is under.

Usage (from the repo root): python scripts/gen-map10.py ."""
import json
import math
import sys

root = sys.argv[1]
N = 128
HALF = N // 2
ISLE_X, ISLE_Z, ISLE_R = 0.0, 0.0, 17.0
FLOOR = -9.0
# Underwater features: (x, z, radius, top). Slopes stay under the 1.2 m per metre cliff limit.
BUMPS = [(-34, 22, 11, -2.4), (30, -26, 9, -1.4), (24, 30, 6, -4.5), (-30, -28, 5, -1.1)]


def height(x, z):
    dx, dz = x - ISLE_X, z - ISLE_Z
    r = math.hypot(dx, dz)
    R = ISLE_R + 2.5 * math.sin(3 * math.atan2(dz, dx) + 0.4)
    if r < R:
        u = r / R
        return 3.6 * (1 - u * u) - 0.3
    h = max(FLOOR, -0.3 - 0.32 * (r - R))
    for bx, bz, br, top in BUMPS:
        d = math.hypot(x - bx, z - bz)
        if d < br + 8:
            h = max(h, top - max(0.0, d - br) * 0.6)
    # A trench along the east side, deeper than the divers can go.
    if x > 36:
        h = min(h, FLOOR - 2)
    return round(max(h, FLOOR - 2), 1)


heights = [[height(c - HALF, r - HALF) for c in range(N + 1)] for r in range(N + 1)]
paint = [
    ["grass" if height(c - HALF + 0.5, r - HALF + 0.5) > 1.4 else "sand" for c in range(N)]
    for r in range(N)
]


def prop(asset, x, z, hw, hd, rotation=0):
    return {"asset": asset, "x": round(x, 1), "z": round(z, 1), "rotation": rotation, "scale": 1,
            "layer": "outdoor", "collider": {"halfW": hw, "halfD": hd}}


props = [prop("house", 4, -6, 4, 3.5)]
for i in range(9):
    a = i * 2.399
    d = 5 + (i * 3) % 8
    x, z = ISLE_X + math.cos(a) * d, ISLE_Z + math.sin(a) * d
    if height(x, z) > 1.8 and all(abs(x - p["x"]) > 5 or abs(z - p["z"]) > 5 for p in props):
        props.append(prop("tree", x, z, 0.6, 0.6))

# The four soldiers on the south beach, facing the water.
units = [
    {"type": f"marine{i + 1}", "x": -3 + i * 2, "z": 12 + (i % 2), "owner": "p1", "rotation": 3.14}
    for i in range(4)
]

data = {
    "version": 1,
    "meta": {
        "id": "map-10",
        "name": "Map 10 - Swim test",
        "author": "Zombie Horde Survivors",
        "created": "2026-10-21",
        "updated": "2026-10-21",
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
    "logic": {"mode": "waves", "noWaves": True, "swim": True, "startGold": 0, "boss": {"enabled": False}},
}
json.dump(data, open(root + "/data/maps/map-10.json", "w"), separators=(",", ":"))
print("props", len(props), "units", len(units))
