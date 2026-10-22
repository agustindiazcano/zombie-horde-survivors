"""Generates data/maps/map-11.json: the texture lab. A flat 200 x 200 arena laid out in zones:

  * a row of eight floor slabs (cobble, metal, sci-fi, alien, dirt, sand, wet, road) and a long road
  * a row of eight parallax-mapped walls (brick, stone, plates, concrete, wood, corrugated, sci-fi, alien)
  * a glass gallery: six kinds of window in front of a dark wall
  * a police scene (patrol car, siren post, wet street) to see the red and blue lights
  * a small sci-fi / alien corner
  * a small castle south of the road: stone walls, a wooden floor, rooms with swing doors, glass windows and torches
  * two flights of stone steps (4 and 8 steps) for walking up and down
  * real CC0 photographed surfaces (7 walls, 7 floors) in the north, and the walls again along the east edge

The `timeControl` rule lets the player turn the time of day with the , and . keys.
All of these assets are drawn by src/render (pom.ts, glass.ts, sirens.ts); see src/sim/lab.ts.

Usage (from the repo root): python scripts/gen-map11.py ."""
import json
import sys

root = sys.argv[1]
N = 200

FLOORS = ["cobble", "metal", "scififloor", "alienfloor", "dirt", "sand", "wet", "road"]
WALLS = ["brick", "stone", "plates", "concrete", "wood", "corrugated", "scifiwall", "alienwall"]
GLASS = ["clear", "blue", "green", "smoke", "frosted", "cracked"]
# Real CC0 photographed surfaces (public/textures/real, see assets.toml).
REAL_WALLS = ["bricks", "sandstone", "planks", "concrete", "plaster", "darkrock", "darkmetal"]
REAL_FLOORS = ["paving", "roadreal", "gravel", "mossground", "clay", "marble", "tiles"]


def prop(asset, x, z, hw, hd, rotation=0):
    return {"asset": asset, "x": x, "z": z, "rotation": rotation, "scale": 1, "layer": "outdoor",
            "collider": {"halfW": hw, "halfD": hd}}


props = []
# Floors: eight 16 m slabs in a row you can walk along (they are 0.2 m high: you step onto them).
for i, kind in enumerate(FLOORS):
    props.append(prop(f"pom_{kind}", -56 + i * 16, 20, 8, 8))
# A long road along the south edge, where the squad starts.
props.append(prop("pom_road", 0, 62, 40, 6))
# Walls: one of each, 12 m wide, in a row north of the floors.
for i, kind in enumerate(WALLS):
    props.append(prop(f"pom_{kind}", -56 + i * 16, -10, 6, 0.6))
# The same walls turned the other way, further north, so the sun lights their other face.
for i, kind in enumerate(reversed(WALLS)):
    props.append(prop(f"pom_{kind}", -56 + i * 16, -30, 0.6, 6))
# Glass gallery: a dark wall and six panes in front of it, then two panes in a corridor.
props.append(prop("pom_plates", 0, -62, 60, 0.6))
for i, kind in enumerate(GLASS):
    props.append(prop(f"glass_{kind}", -50 + i * 20, -52, 4.5, 0.1))
props.append(prop("pom_concrete", -30, -42, 0.6, 3))
props.append(prop("pom_concrete", 30, -42, 0.6, 3))
# Police scene in the west: a patrol car, a siren post, a wet street and walls to light up.
props.append(prop("pom_wet", -58, 50, 16, 10))
props.append(prop("police_car", -60, 52, 2.3, 1.0))
props.append(prop("siren", -52, 44, 0.4, 0.4))
props.append(prop("pom_brick", -58, 36, 12, 0.6))
props.append(prop("pom_concrete", -74, 46, 0.6, 8))
# Sci-fi and alien corner in the east.
props.append(prop("pom_scififloor", 52, 50, 14, 10))
props.append(prop("pom_scifiwall", 52, 38, 14, 0.6))
props.append(prop("pom_alienfloor", 58, 72, 14, 6))
props.append(prop("pom_alienwall", 68, 52, 0.6, 8))
props.append(prop("pom_metal", 30, 44, 8, 8))
# The real surfaces in the north: a row of walls and, behind it, a row of floor slabs.
for i, kind in enumerate(REAL_WALLS):
    props.append(prop(f"pom_real_{kind}", -48 + i * 16, -76, 6, 0.6))
for i, kind in enumerate(REAL_FLOORS):
    props.append(prop(f"pom_real_{kind}", -48 + i * 16, -90, 8, 7))
# The same walls again along the east edge, turned the other way.
for i, kind in enumerate(REAL_WALLS):
    props.append(prop(f"pom_real_{kind}", 92, -60 + i * 20, 0.6, 8))
# Pillars to look at corners and edges.
for x in (-8, 8):
    props.append(prop("pom_stone", x, 40, 1.2, 1.2))

# --- The castle: 28 x 20 m, centred at (0, 84), the gate facing the road (north). ---
CX, CZ = 0, 84
X0, X1, Z0, Z1 = -14, 14, 74, 94
T = 0.6  # half thickness of a wall
structures = []


def wall_x(x_a, x_b, z, asset="pom_stone"):
    """A wall running along x between x_a and x_b at depth z."""
    props.append(prop(asset, (x_a + x_b) / 2, z, abs(x_b - x_a) / 2, T))


def wall_z(z_a, z_b, x, asset="pom_stone"):
    """A wall running along z between z_a and z_b at x."""
    props.append(prop(asset, x, (z_a + z_b) / 2, T, abs(z_b - z_a) / 2))


def glass_x(x_a, x_b, z, kind):
    props.append(prop(f"glass_{kind}", (x_a + x_b) / 2, z, abs(x_b - x_a) / 2, 0.1))


def glass_z(z_a, z_b, x, kind):
    props.append(prop(f"glass_{kind}", x, (z_a + z_b) / 2, 0.1, abs(z_b - z_a) / 2))


def door(kind, x, z, turns):
    structures.append({"type": kind, "x": x, "z": z, "turns": turns, "level": 1})


# Wooden floor, and a stone keep on each corner.
props.append(prop("floor_wood", CX, CZ, 13.4, 9.4))
for x in (X0, X1):
    for z in (Z0, Z1):
        props.append(prop("keep_stone", x, z, 1.6, 1.6))

# Front (north) wall: the gate door in the middle and a window on each side.
wall_x(X0 + 1.6, -10, Z0)
glass_x(-10, -6, Z0, "clear")
wall_x(-6, -1, Z0)
door("door", 0, Z0, 0)
wall_x(1, 6, Z0)
glass_x(6, 10, Z0, "blue")
wall_x(10, X1 - 1.6, Z0)
# Back wall with one long green window.
wall_x(X0 + 1.6, -4, Z1)
glass_x(-4, 4, Z1, "green")
wall_x(4, X1 - 1.6, Z1)
# Side walls, each with a window.
wall_z(Z0 + 1.6, 80, X0)
glass_z(80, 84, X0, "clear")
wall_z(84, Z1 - 1.6, X0)
wall_z(Z0 + 1.6, 80, X1)
glass_z(80, 84, X1, "smoke")
wall_z(84, Z1 - 1.6, X1)

# Inside: a partition with two doors cuts off two side rooms, and the hall has four pillars and a dais.
PX = -6
wall_z(Z0 + T, 78, PX)
door("door", PX, 79, 1)
wall_z(80, 88, PX)
door("glassDoor", PX, 89, 1)
wall_z(90, Z1 - T, PX)
wall_x(X0 + 1.6, PX - T, 84)
for x in (3, 10):
    for z in (79, 89):
        props.append(prop("pom_stone", x, z, 0.8, 0.8))
props.append(prop("step_1", 6.5, 91.6, 4.5, 1.4))
props.append(prop("step_2", 6.5, 92.0, 2.5, 1.0))

# Torches: both sides of the gate, along the outer walls, and inside.
for x, z in [(-3, Z0 - 1.2), (3, Z0 - 1.2), (X0 - 1.4, 84), (X1 + 1.4, 84), (0, Z1 + 1.4),
             (X1 - 1.0, 78), (X1 - 1.0, 90), (PX + 1.2, 84), (-3, Z0 + 1.2), (3, Z0 + 1.2)]:
    props.append(prop("torch", x, z, 0.15, 0.15))


def stairs(x0, z, direction, n, depth, width_half):
    """n steps climbing away from x0: step k is k quarter metres tall and reaches the far end."""
    far = x0 + direction * n * depth
    for k in range(1, n + 1):
        near = x0 + direction * (k - 1) * depth
        props.append(prop(f"step_{k}", (near + far) / 2, z, abs(far - near) / 2, width_half - 0.01 * k))


# Two flights of steps east and west of the castle, to walk up and down.
stairs(20, CZ, 1, 4, 1.2, 2.5)
stairs(-20, CZ, -1, 8, 1.0, 2.5)

units = [
    {"type": f"marine{i + 1}", "x": -3 + i * 2, "z": 60, "owner": "p1", "rotation": 3.14}
    for i in range(4)
]

data = {
    "version": 1,
    "meta": {"id": "map-11", "name": "Map 11 - Texture lab", "author": "Zombie Horde Survivors",
             "created": "2026-10-21", "updated": "2026-10-21", "size": {"width": N, "depth": N}},
    "terrain": {"heights": None, "water": None, "paint": None},
    "surfaces": [],
    "props": props,
    "players": [
        {"id": "p1", "name": "Player 1", "kind": "human", "team": 0, "color": "#4aa3ff"},
        {"id": "horde", "name": "The horde", "kind": "ai", "team": 1, "color": "#d94b3d"},
    ],
    "units": units,
    "environment": {"sky": True, "timeOfDay": 19, "sun": True, "moon": True, "clouds": 0.1, "fog": 0},
    "logic": {"mode": "waves", "noWaves": True, "timeControl": True, "startView": "third",
              "startGold": 0, "boss": {"enabled": False}, "structures": structures},
}
json.dump(data, open(root + "/data/maps/map-11.json", "w"), indent=1)
print("props", len(props))
