"""Generates data/maps/map-8.json: the helicopter test, two helicopters on pads and things to fly over.

Usage (from the repo root): python scripts/gen-map8.py .
Then run: npx prettier --write data/maps/map-8.json"""
import json
import sys

root = sys.argv[1]


def prop(asset, x, z, hw, hd, rotation=0):
    return {"asset": asset, "x": x, "z": z, "rotation": rotation, "scale": 1, "layer": "outdoor",
            "collider": {"halfW": hw, "halfD": hd}}


props = []
# Low blocks (2 m): a helicopter lifts over them within a second or two of climbing.
for i in range(5):
    props.append(prop("block", -30 + i * 15, 0, 2, 2))
# Houses (6 m): need real height. A tower of them at the north end for an obstacle course.
for i in range(4):
    props.append(prop("house", -33 + i * 22, 26, 4, 4))
# A wall of blocks that must be flown over, not round.
for i in range(9):
    props.append(prop("block", -16 + i * 4, 14, 2, 2))
# Trees (6 m).
for x, z in [(-40, -10), (-36, -4), (38, -12), (42, -6), (30, 38), (-28, 40)]:
    props.append(prop("tree", x, z, 0.6, 0.6))

units = [
    {"type": "marine1", "x": 0, "z": -34, "owner": "p1", "rotation": 0},
    {"type": "marine2", "x": 2, "z": -35, "owner": "p1", "rotation": 0},
    {"type": "marine3", "x": -2, "z": -35, "owner": "p1", "rotation": 0},
    {"type": "marine4", "x": 4, "z": -34, "owner": "p1", "rotation": 0},
    # Helicopter 1 for flying yourself, helicopter 2 for ordering around in RTS.
    {"type": "helicopter", "x": 0, "z": -26, "owner": "p1", "rotation": 0},
    {"type": "helicopter", "x": -22, "z": -26, "owner": "p1", "rotation": 0},
    # One of each of the other aircraft, parked in a row.
    {"type": "huey", "x": 22, "z": -26, "owner": "p1", "rotation": 0},
    {"type": "chinook", "x": 44, "z": -26, "owner": "p1", "rotation": 0},
    {"type": "v22", "x": -44, "z": -26, "owner": "p1", "rotation": 0},
]
# Wanderers far to the north and east: they are there to show that an airborne helicopter is safe.
for k in range(8):
    units.append({"type": "marine_wanderer", "x": -35 + k * 10, "z": 44, "owner": "horde", "rotation": 0})

data = {
    "version": 1,
    "meta": {
        "id": "map-8",
        "name": "Map 8 - Helicopter test",
        "author": "Zombie Horde Survivors",
        "created": "2026-10-21",
        "updated": "2026-10-21",
        "size": {"width": 110, "depth": 110},
    },
    "terrain": {"heights": None, "water": None, "paint": None},
    "surfaces": [],
    "props": props,
    "players": [
        {"id": "p1", "name": "Player 1", "kind": "human", "team": 0, "color": "#4aa3ff"},
        {"id": "horde", "name": "The horde", "kind": "ai", "team": 1, "color": "#d94b3d"},
    ],
    "units": units,
    "logic": {
        "mode": "waves",
        "noWaves": True,
        "startGold": 600,
        "boss": {"enabled": False},
    },
}
json.dump(data, open(root + "/data/maps/map-8.json", "w"), indent=2)
print("ok", len(props), "props", len(units), "units")
