"""Generates data/maps/map-16.json: the gear test map (new pistol and SMG, four helmets, the playable alien).

Usage (from the repo root): python scripts/gen-map16.py .
Then run: npx prettier --write data/maps/map-16.json"""
import json
import sys

root = sys.argv[1]

# One marine per helmet, each carrying its helmet in the backpack to put on and take off.
squad = [
    ("marine1", -3, "pistol", "helmet_generic"),
    ("marine2", -1, "pistol", "helmet_esmad"),
    ("marine3", 1, "pistol", "helmet_security"),
    ("marine4", 3, "smg", "helmet_tactical"),
]
units = []
for kind, x, gun, helmet in squad:
    units.append(
        {
            "type": kind,
            "x": x,
            "z": 0,
            "owner": "p1",
            "rotation": 0,
            "equipment": {"rightHand": gun},
            "backpack": [{"item": helmet, "count": 1}],
        }
    )
# The alien has no hands: it fights bare.
units.append(
    {
        "type": "alien_monster",
        "x": 0,
        "z": -5,
        "owner": "p1",
        "rotation": 0,
        "name": "Alien monster",
        "equipment": {"rightHand": None},
    }
)

m = {
    "version": 1,
    "meta": {
        "id": "map-16",
        "name": "Map 16 - Gear test",
        "author": "Zombie Horde Survivors",
        "created": "2026-10-28",
        "updated": "2026-10-28",
        "size": {"width": 60, "depth": 60},
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
with open(root + "/data/maps/map-16.json", "w", encoding="utf8") as f:
    json.dump(m, f, indent=2)
