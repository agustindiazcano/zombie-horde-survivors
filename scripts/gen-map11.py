"""Generates data/maps/map-11.json: the texture lab. A flat 200 x 200 arena laid out in zones:

  * a row of eight floor slabs (cobble, metal, sci-fi, alien, dirt, sand, wet, road) and a long road
  * a row of eight parallax-mapped walls (brick, stone, plates, concrete, wood, corrugated, sci-fi, alien)
  * a glass gallery: six kinds of window in front of a dark wall
  * a police scene (patrol car, siren post, wet street) to see the red and blue lights
  * a small sci-fi / alien corner
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
              "startGold": 0, "boss": {"enabled": False}},
}
json.dump(data, open(root + "/data/maps/map-11.json", "w"), indent=1)
print("props", len(props))
