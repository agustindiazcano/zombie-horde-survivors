"""Generates data/maps/map-7.json: the door gallery, one of every door kind in a row of walls.

Usage (from the repo root): python scripts/gen-map7.py .
Then run: npx prettier --write data/maps/map-7.json"""
import json
import sys

root = sys.argv[1]
WALL = 4.0  # width of one `wall` structure

# (type, half width, extra fields)
doors = [
    ("door", 1.0, {}),
    ("glassDoor", 1.0, {}),
    ("slidingDoor", 1.1, {}),
    ("scifiDoor", 1.2, {}),
    ("gate", 2.6, {}),
    ("shutter", 2.0, {}),
    ("door", 1.0, {"lock": "keycard_red"}),
    ("blastDoor", 1.6, {"link": 1}),
]

structures = []
x = -30.0
structures.append({"type": "wall", "x": x + WALL / 2, "z": 0, "turns": 0, "level": 1})
x += WALL
placed = {}
for i, (kind, half, extra) in enumerate(doors):
    cx = x + half
    entry = {"type": kind, "x": round(cx, 2), "z": 0, "turns": 0, "level": 1}
    entry.update(extra)
    structures.append(entry)
    placed[i] = cx
    x = cx + half
    structures.append({"type": "wall", "x": x + WALL / 2, "z": 0, "turns": 0, "level": 1})
    x += WALL

locked_x = placed[6]
blast_x = placed[7]
structures.append({"type": "switch", "x": round(blast_x + 3.0, 2), "z": -2.5, "turns": 0, "level": 1, "link": 1})

units = [
    {"type": "marine1", "x": 0, "z": -14, "owner": "p1", "rotation": 0},
    {"type": "marine2", "x": 2, "z": -15, "owner": "p1", "rotation": 0},
    {"type": "marine3", "x": -2, "z": -15, "owner": "p1", "rotation": 0},
]
for k in range(6):
    units.append({"type": "marine_wanderer", "x": -24 + k * 10, "z": 14, "owner": "horde", "rotation": 0})

data = {
    "version": 1,
    "meta": {
        "id": "map-7",
        "name": "Map 7 - Door gallery",
        "author": "Zombie Horde Survivors",
        "created": "2026-10-20",
        "updated": "2026-10-20",
        "size": {"width": 90, "depth": 90},
    },
    "terrain": {"heights": None, "water": None, "paint": None},
    "surfaces": [],
    "props": [],
    "players": [
        {"id": "p1", "name": "Player 1", "kind": "human", "team": 0, "color": "#4aa3ff"},
        {"id": "horde", "name": "The horde", "kind": "ai", "team": 1, "color": "#d94b3d"},
    ],
    "units": units,
    "logic": {
        "mode": "waves",
        "noWaves": True,
        "build": True,
        "startGold": 600,
        "boss": {"enabled": False},
        "structures": structures,
        "items": [{"item": "keycard_red", "x": round(locked_x, 2), "z": -6, "count": 1}],
    },
}
json.dump(data, open(root + "/data/maps/map-7.json", "w"), indent=2)
print("doors at", {i: round(v, 1) for i, v in placed.items()})
