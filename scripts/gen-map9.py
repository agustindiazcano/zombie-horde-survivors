"""Generates data/maps/map-9.json: the sea test. A big map with a carrier you can walk on, a frigate,
an island with a beach and houses, helicopters on the deck and speedboats you can drive.

The carrier and the frigate are `fixed` vehicles drawn by the renderer; their walkable deck is a
raised plateau in the height grid, so the outline here must match `vehicles.carrier.ship` in
data/game.json (read from there) and the landing rings in src/render/ships.ts (CARRIER_PAD_*).

Usage (from the repo root): python scripts/gen-map9.py .
The file is excluded from Prettier (.prettierignore): it is one big height grid."""
import json
import math
import sys

root = sys.argv[1]
game = json.load(open(root + "/data/game.json", encoding="utf-8"))
ship = game["vehicles"]["carrier"]["ship"]
L, W, BOW, DECK = ship["length"], ship["width"], ship["bow"], ship["deck"]

N = 256
HALF = N // 2
SEA = -3.5  # sea floor
CX, CZ = -72.0, 20.0  # the carrier's middle; its bow points to +z
ISLE_X, ISLE_Z = 55.0, -30.0
# Must match src/render/ships.ts
PAD_Z, PAD_X = [24, 42, 60], -5.0
TOWER_INSET, TOWER_Z = 4.0, 12.0


def half_width(z):
    """Half the hull width at z metres from the middle of the carrier (see shipHalfWidth)."""
    if abs(z) > L / 2:
        return 0.0
    into = z - (L / 2 - BOW)
    if into <= 0:
        return W / 2
    t = into / BOW
    return W / 2 * (1 - t * t)


def on_deck(x, z, inset=1.5):
    lz = z - CZ
    return abs(lz) <= L / 2 - inset and abs(x - CX) <= half_width(lz) - inset


def isle_radius(theta):
    return 44 + 6 * math.sin(3 * theta + 0.5) + 4 * math.sin(5 * theta + 2)


def isle_height(x, z):
    dx, dz = x - ISLE_X, z - ISLE_Z
    r = math.hypot(dx, dz)
    R = isle_radius(math.atan2(dz, dx))
    if r < R:
        u = r / R
        hills = 1.3 * math.sin(x * 0.12) * math.sin(z * 0.1) * (1 - u)
        return 5.2 * (1 - u * u) - 0.6 + hills
    return -0.6 - 0.14 * (r - R)


def height(x, z):
    if on_deck(x, z):
        return DECK
    swell = 0.25 * math.sin(x * 0.07) * math.cos(z * 0.05)
    return round(max(SEA + swell, isle_height(x, z)), 1)


heights = [[height(c - HALF, r - HALF) for c in range(N + 1)] for r in range(N + 1)]

paint = []
for r in range(N):
    row = []
    for c in range(N):
        x, z = c - HALF + 0.5, r - HALF + 0.5
        h = height(x, z)
        if on_deck(x, z, 0.5):
            row.append("concrete")
        elif h > 1.3:
            row.append("grass")
        else:
            row.append("sand")
    paint.append(row)


def prop(asset, x, z, hw, hd, rotation=0):
    return {"asset": asset, "x": round(x, 1), "z": round(z, 1), "rotation": rotation, "scale": 1,
            "layer": "outdoor", "collider": {"halfW": hw, "halfD": hd}}


props = []
# The carrier's island tower blocks walking (the model is drawn by the renderer).
props.append(prop("block", CX + W / 2 - TOWER_INSET, CZ + TOWER_Z, 4, 7))
# Houses inland on the island.
for dx, dz in [(-8, -6), (10, -12), (22, 4), (-18, 8), (4, 14), (-4, -22), (24, -18), (-26, -8), (14, 24)]:
    x, z = ISLE_X + dx, ISLE_Z + dz
    if height(x, z) > 1.5:
        props.append(prop("house", x, z, 4, 3.5, 0 if (dx + dz) % 2 else math.pi / 2))
# Trees scattered inland.
for i in range(16):
    a = i * 2.399
    d = 10 + (i * 7) % 28
    x, z = ISLE_X + math.cos(a) * d, ISLE_Z + math.sin(a) * d
    if height(x, z) > 1.8 and all(abs(x - p["x"]) > 6 or abs(z - p["z"]) > 6 for p in props):
        props.append(prop("tree", x, z, 0.6, 0.6))


def beach_spot(theta):
    """A point just off the island's shore in the direction theta, in water deep enough for a boat."""
    r = isle_radius(theta)
    while height(ISLE_X + math.cos(theta) * r, ISLE_Z + math.sin(theta) * r) > -2.2:
        r += 0.5
    return ISLE_X + math.cos(theta) * r, ISLE_Z + math.sin(theta) * r


units = []
pad_x = CX + PAD_X
pad_zs = [CZ - L / 2 + k for k in PAD_Z]
# The squad on the deck, near the helicopters.
for i, (dx, dz) in enumerate([(9, -5), (11, -3), (9, -1), (11, 1)]):
    units.append({"type": f"marine{i + 1}", "x": pad_x + dx, "z": pad_zs[0] + dz, "owner": "p1", "rotation": 0})
units.append({"type": "helicopter", "x": pad_x, "z": pad_zs[0], "owner": "p1", "rotation": 0})
units.append({"type": "huey", "x": pad_x, "z": pad_zs[1], "owner": "p1", "rotation": 0})
# The ships (the carrier's origin is the middle of the hull).
units.append({"type": "carrier", "x": CX, "z": CZ, "owner": "p1", "rotation": 0})
units.append({"type": "frigate", "x": -5, "z": 78, "owner": "p1", "rotation": 1.2})
# Two speedboats alongside the carrier's port side, in reach of the deck edge.
for z in (-20, 10):
    units.append({"type": "speedboat", "x": CX - W / 2 - 3.0, "z": z, "owner": "p1", "rotation": 0})
# Two more off the island's western beach.
for theta in (math.pi - 0.35, math.pi + 0.45):
    bx, bz = beach_spot(theta)
    units.append({"type": "speedboat", "x": round(bx, 1), "z": round(bz, 1), "owner": "p1", "rotation": theta - math.pi / 2})
# The horde: sleepers among the houses.
for k in range(8):
    a = k * 0.8
    x, z = ISLE_X + math.cos(a) * (8 + k * 2.5), ISLE_Z + math.sin(a) * (8 + k * 2.5)
    if height(x, z) > 1.5:
        units.append({"type": "marine_wanderer", "x": round(x, 1), "z": round(z, 1), "owner": "horde", "rotation": 0})

data = {
    "version": 1,
    "meta": {
        "id": "map-9",
        "name": "Map 9 - Sea test",
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
    "logic": {"mode": "waves", "noWaves": True, "startGold": 600, "boss": {"enabled": False}},
}
json.dump(data, open(root + "/data/maps/map-9.json", "w"), separators=(",", ":"))
print("props", len(props), "units", len(units), "pads z", pad_zs, "carrier x", pad_x)
