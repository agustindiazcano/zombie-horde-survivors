"""Generates data/maps/map-17.json: every extra unit model in a row, plus a police car to drive.

Usage (from the repo root): python scripts/gen-map17.py .
Then run: npx prettier --write data/maps/map-17.json
The models live in public/models/test/ (not in git), so a unit whose file is missing is drawn as a placeholder."""
import json
import sys

root = sys.argv[1]

# (type, has a hand to hold a gun)
squad = [
    ("marine1", True),
    ("alien_monster", False),
    ("police", True),
    ("esquiva", True),
    ("breakdancer", True),
    ("facial_girl", True),
    ("nightgown", False),
    ("jessica", False),
    ("female_base", False),
    ("flipaclip_guide", False),
]
units = []
x = -(len(squad) - 1) * 1.5
for kind, hands in squad:
    unit = {"type": kind, "x": x, "z": 0, "owner": "p1", "rotation": 0}
    # Models with no hand bone cannot show a gun, so they fight bare.
    if kind != "marine1":
        unit["hold"] = True
    if not hands:
        unit["equipment"] = {"rightHand": None}
    units.append(unit)
    x += 3
units.append({"type": "police_car", "x": 0, "z": 7, "owner": "p1", "rotation": 0})

m = {
    "version": 1,
    "meta": {
        "id": "map-17",
        "name": "Map 17 - Unit models",
        "author": "Zombie Horde Survivors",
        "created": "2026-10-28",
        "updated": "2026-10-28",
        "size": {"width": 80, "depth": 80},
    },
    "terrain": {"heights": None, "water": None, "paint": None},
    "surfaces": [],
    "props": [],
    "players": [
        {"id": "p1", "name": "Player 1", "kind": "human", "team": 0, "color": "#4aa3ff"},
        {"id": "horde", "name": "The horde", "kind": "ai", "team": 1, "color": "#d94b3d"},
    ],
    "units": units,
    "logic": {"mode": "waves", "noWaves": True, "boss": {"enabled": False}},
}
with open(root + "/data/maps/map-17.json", "w", encoding="utf8") as f:
    json.dump(m, f, indent=2)
