"""Generates data/maps/map-12.json: the physics lab. A flat 120 m square with a ramp and a plateau
(east), a round bowl (west) and a three-walled pit (north) for ragdolls. The map has the
`physicsLab` rule: a panel drops balls, a ball pyramid and zombie ragdolls, sets off blasts and
turns the solver's numbers live (see src/sim/physics and docs/PLAN-physics-lab.md).

Usage (from the repo root): python scripts/gen-map12.py ."""
import json
import math
import sys

root = sys.argv[1]
N = 120
HALF = N // 2


def smooth(t):
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)


def height(x, z):
    h = 0.0
    # Ramp up along +x (x 20..32), plateau to x 42, soft sides over 4 m in z.
    ramp = smooth((x - 20) / 12) * (1 - smooth((x - 42) / 3))
    side = 1 - smooth((abs(z) - 8) / 4)
    h += 5.0 * ramp * side
    # A bowl at (-35, -30): 2 m deep, 12 m radius.
    r = math.hypot(x + 35, z + 30)
    if r < 12:
        h -= 2.0 * (1 - (r / 12) ** 2)
    return round(h, 1)


heights = [[height(c - HALF, r - HALF) for c in range(N + 1)] for r in range(N + 1)]


def wall(x, z, hw, hd):
    return {"asset": "pom_concrete", "x": x, "z": z, "rotation": 0, "scale": 1, "layer": "outdoor",
            "collider": {"halfW": hw, "halfD": hd}}


# The pit for ragdolls: three concrete walls open to the south, centred at (0, -38).
props = [
    wall(0, -46, 9, 0.6),
    wall(-9, -41, 0.6, 5),
    wall(9, -41, 0.6, 5),
]

units = [
    {
        "type": f"marine{i + 1}",
        "x": -3 + i * 2,
        "z": 44,
        "owner": "p1",
        "rotation": 3.14,
        # Two stacks of frag grenades (Q throws, G aims) to blow up the piles.
        "backpack": [{"item": "frag_grenade", "count": 4}, {"item": "frag_grenade", "count": 4}],
    }
    for i in range(4)
]

data = {
    "version": 1,
    "meta": {
        "id": "map-12",
        "name": "Map 12 - Physics lab",
        "author": "Zombie Horde Survivors",
        "created": "2026-10-21",
        "updated": "2026-10-21",
        "size": {"width": N, "depth": N},
    },
    "terrain": {"heights": heights, "water": None, "paint": None},
    "surfaces": [],
    "props": props,
    "players": [
        {"id": "p1", "name": "Player 1", "kind": "human", "team": 0, "color": "#4aa3ff"},
        {"id": "horde", "name": "The horde", "kind": "ai", "team": 1, "color": "#d94b3d"},
    ],
    "units": units,
    "environment": {"sky": True, "timeOfDay": 13, "sun": True, "moon": False, "clouds": 0.15, "fog": 0},
    "logic": {"mode": "waves", "noWaves": True, "physicsLab": True, "startGold": 0,
              "boss": {"enabled": False}},
}
json.dump(data, open(root + "/data/maps/map-12.json", "w"), separators=(",", ":"))
print("props", len(props), "units", len(units), "max height", max(max(r) for r in heights))
