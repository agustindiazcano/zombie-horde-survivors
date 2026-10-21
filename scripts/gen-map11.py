"""Generates data/maps/map-11.json: the texture lab. A flat 80 x 80 arena with walls in four
parallax-mapped materials (brick, stone, metal plates; a cobble floor slab), set in different
directions so the sun lights each differently. The `timeControl` rule lets the player turn the
time of day with the , and . keys.

Usage (from the repo root): python scripts/gen-map11.py ."""
import json
import sys

root = sys.argv[1]


def prop(asset, x, z, hw, hd):
    return {"asset": asset, "x": x, "z": z, "rotation": 0, "scale": 1, "layer": "outdoor",
            "collider": {"halfW": hw, "halfD": hd}}


props = [prop("pom_cobble", 0, 0, 14, 14)]
# The far wall: one of each material, facing the squad.
for i, asset in enumerate(["pom_brick", "pom_stone", "pom_plates"]):
    props.append(prop(asset, -22 + i * 22, -32, 9, 0.6))
# Side walls running north-south, lit from the other side of the day.
props.append(prop("pom_brick", -32, -8, 0.6, 9))
props.append(prop("pom_stone", 32, -8, 0.6, 9))
props.append(prop("pom_plates", -32, 14, 0.6, 9))
props.append(prop("pom_brick", 32, 14, 0.6, 9))
# A corridor of two parallel walls to walk between, and a short stub that turns the other way.
props.append(prop("pom_stone", -12, 26, 9, 0.6))
props.append(prop("pom_stone", 12, 26, 9, 0.6))
props.append(prop("pom_plates", 20, 8, 0.6, 5))
props.append(prop("pom_brick", -20, 8, 0.6, 5))
# Thick pillars to look at the edges and corners.
for x in (-8, 8):
    props.append(prop("pom_stone", x, -14, 1.2, 1.2))

units = [
    {"type": f"marine{i + 1}", "x": -3 + i * 2, "z": 18, "owner": "p1", "rotation": 3.14}
    for i in range(4)
]

data = {
    "version": 1,
    "meta": {"id": "map-11", "name": "Map 11 - Texture lab", "author": "Zombie Horde Survivors",
             "created": "2026-10-21", "updated": "2026-10-21", "size": {"width": 80, "depth": 80}},
    "terrain": {"heights": None, "water": None, "paint": None},
    "surfaces": [],
    "props": props,
    "players": [
        {"id": "p1", "name": "Player 1", "kind": "human", "team": 0, "color": "#4aa3ff"},
        {"id": "horde", "name": "The horde", "kind": "ai", "team": 1, "color": "#d94b3d"},
    ],
    "units": units,
    "environment": {"sky": True, "timeOfDay": 9, "sun": True, "moon": True, "clouds": 0.1, "fog": 0},
    "logic": {"mode": "waves", "noWaves": True, "timeControl": True, "startView": "third",
              "startGold": 0, "boss": {"enabled": False}},
}
json.dump(data, open(root + "/data/maps/map-11.json", "w"), indent=1)
print("props", len(props))
