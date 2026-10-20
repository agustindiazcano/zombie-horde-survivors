"""Generates data/maps/map-6.json: the night suburb, the crowd, the orbs and the subtitles of the
Celestial Event III scene. Seeded, so the same run gives the same map.

Usage (from the repo root): python scripts/gen-map6.py .
Then run: npx prettier --write data/maps/map-6.json
The times of the script (subtitles, orb wake times) match the numbers in data/game.json
(skyShow, orbs, greys); change both together."""
import json
import math
import random
import sys

root = sys.argv[1]
rng = random.Random(6)
N = 160
HALF = N // 2

props = []
boxes = []  # (x, z, halfW, halfD) of everything solid, for overlap checks


def overlaps(x, z, hw, hd, margin):
    return any(abs(x - bx) < hw + bw + margin and abs(z - bz) < hd + bd + margin for bx, bz, bw, bd in boxes)


def add(asset, x, z, hw, hd, rotation=0.0, margin=1.0):
    if overlaps(x, z, hw, hd, margin):
        return False
    props.append({
        "asset": asset, "x": round(x, 2), "z": round(z, 2), "rotation": round(rotation, 3),
        "scale": 1, "layer": "outdoor", "collider": {"halfW": round(hw, 2), "halfD": round(hd, 2)},
    })
    # A quarter turn swaps the sides of the stored collider, like the sim does.
    turned = round(rotation / (math.pi / 2)) % 2 != 0
    boxes.append((x, z, hd if turned else hw, hw if turned else hd))
    return True


# ---- ground: grass lawns, stone sidewalks, concrete driveways, a few dirt garden beds
paint = [["grass"] * N for _ in range(N)]


def cell(x, z):
    return int(math.floor(z + HALF)), int(math.floor(x + HALF))


def paint_rect(x0, x1, z0, z1, tex):
    for xi in range(int(math.floor(x0)), int(math.ceil(x1))):
        for zi in range(int(math.floor(z0)), int(math.ceil(z1))):
            r, c = cell(xi + 0.5, zi + 0.5)
            if 0 <= r < N and 0 <= c < N:
                paint[r][c] = tex


ROAD = 9.0
SIDEWALK = 2.0
edge = ROAD / 2
paint_rect(-HALF, HALF, -edge - SIDEWALK, -edge, "stone")
paint_rect(-HALF, HALF, edge, edge + SIDEWALK, "stone")
paint_rect(-edge - SIDEWALK, -edge, -HALF, HALF, "stone")
paint_rect(edge, edge + SIDEWALK, -HALF, HALF, "stone")
paint_rect(-edge, edge, -HALF, HALF, "concrete")  # under the asphalt strips
paint_rect(-HALF, HALF, -edge, edge, "concrete")

# ---- houses: along street A (z = 0) and street B (x = 0), doors toward their street
FRONT = 15.0  # distance from the street axis to the front wall
house_boxes = []
x = -70.0
while x < 70.0:
    hw = rng.uniform(5.0, 6.5)
    hd = rng.uniform(4.2, 5.2)
    cx = x + hw
    if abs(cx) - hw > 8:
        for side in (-1, 1):
            cz = side * (FRONT + hd)
            rot = 0.0 if side < 0 else math.pi
            if add("house", cx, cz, hw, hd, rot, margin=2.0):
                house_boxes.append((cx, cz, hw, hd, side, "A"))
                # driveway from the road to the front door
                paint_rect(cx - 1.5, cx + 1.5, min(side * edge, side * FRONT), max(side * edge, side * FRONT), "concrete")
    x += 2 * hw + rng.uniform(5.0, 9.0)

z = -70.0
while z < 70.0:
    hw = rng.uniform(4.2, 5.2)  # depth along the street... (local halfD)
    hd = rng.uniform(5.0, 6.5)  # extent along z
    cz = z + hd
    if abs(cz) - hd > 8:
        for side in (-1, 1):
            cx = side * (FRONT + hw)
            rot = math.pi / 2 if side < 0 else -math.pi / 2
            # The collider is stored in the house's own frame; the quarter turn swaps it.
            if add("house", cx, cz, hd, hw, rot, margin=2.0):
                house_boxes.append((cx, cz, hw, hd, side, "B"))
                paint_rect(min(side * edge, side * FRONT), max(side * edge, side * FRONT), cz - 1.5, cz + 1.5, "concrete")
    z += 2 * hd + rng.uniform(5.0, 9.0)

# ---- street lamps on the sidewalks, every ~20 m, alternating sides
lamp_x = -66.0
flip = 1
while lamp_x < 68:
    z0 = flip * (edge + 1.0)
    add("lamp", lamp_x, z0, 0.15, 0.15, 0.0 if z0 < 0 else math.pi, margin=0.5)
    flip = -flip
    lamp_x += 20
lamp_z = -66.0
flip = 1
while lamp_z < 68:
    x0 = flip * (edge + 1.0)
    add("lamp", x0, lamp_z, 0.15, 0.15, math.pi / 2 if x0 < 0 else -math.pi / 2, margin=0.5)
    flip = -flip
    lamp_z += 20

# ---- parked cars at the curb and a couple in driveways
for _ in range(60):
    if sum(1 for p in props if p["asset"] == "car") >= 7:
        break
    along_a = rng.random() < 0.6
    if along_a:
        cx = rng.uniform(-60, 60)
        cz = rng.choice([-1, 1]) * (edge - 1.4)
        add("car", cx, cz, 2.3, 1.0, margin=1.5)
    else:
        cz = rng.uniform(-60, 60)
        cx = rng.choice([-1, 1]) * (edge - 1.4)
        add("car", cx, cz, 1.0, 2.3, margin=1.5)

# ---- trees: street trees on the lawn edge, then yard trees
for _ in range(400):
    if sum(1 for p in props if p["asset"] == "tree") >= 70:
        break
    if rng.random() < 0.35:
        # next to a street
        if rng.random() < 0.5:
            tx = rng.uniform(-72, 72)
            tz = rng.choice([-1, 1]) * (edge + SIDEWALK + 1.4)
        else:
            tz = rng.uniform(-72, 72)
            tx = rng.choice([-1, 1]) * (edge + SIDEWALK + 1.4)
    else:
        tx = rng.uniform(-75, 75)
        tz = rng.uniform(-75, 75)
    if abs(tx) < edge + SIDEWALK + 1 and abs(tz) < edge + SIDEWALK + 1:
        continue
    add("tree", tx, tz, 0.35, 0.35, margin=1.8)

# dirt garden beds beside some houses
for hx, hz, hw, hd, side, street in house_boxes:
    if rng.random() < 0.5:
        if street == "A":
            paint_rect(hx + hw + 0.5, hx + hw + 2.5, hz - 2, hz + 2, "dirt")
        else:
            paint_rect(hx - 2, hx + 2, hz + hd + 0.5, hz + hd + 2.5, "dirt")

# ---- civilians: a knot around the player and the rest spread along the streets
TYPES = ["civilian_m", "civilian_f", "civilian_m2", "civilian_f2"]
units = [{"type": "marine1", "x": 7.5, "z": 5.6, "owner": "p1", "rotation": -1.57,
          "name": "You", "equipment": {"rightHand": None, "leftHand": None, "chest": None}}]
civilians = []


def free(x, z):
    return not overlaps(x, z, 0.4, 0.4, 0.9) and abs(x) < 74 and abs(z) < 74


def place_civilian(cx, cz, spread, tries=40):
    for _ in range(tries):
        a = rng.random() * math.tau
        r = rng.uniform(1.5, spread)
        x, z = cx + math.cos(a) * r, cz + math.sin(a) * r
        if free(x, z) and all(math.hypot(x - ux, z - uz) > 1.4 for ux, uz in civilians + [(7.5, 5.6)]):
            civilians.append((x, z))
            units.append({"type": TYPES[len(civilians) % 4], "x": round(x, 2), "z": round(z, 2),
                          "owner": "p1", "rotation": round(rng.random() * math.tau, 2)})
            return


for _ in range(36):
    place_civilian(5.0, 3.0, 14)
for _ in range(80):
    place_civilian(rng.uniform(-62, 62), rng.uniform(-62, 62), 10)

subtitles = [
    (2, 4, "Look at the sky."),
    (7, 4, "Are those stars?"),
    (12, 5, "That doesn't look like a star..."),
    (18, 5, "Is it just me, or are they moving?"),
    (26, 5, "Wait. Are they coming this way?"),
    (34, 5, "They're getting closer!"),
    (44, 5, "Something is wrong. Look at them!"),
    (54, 5, "They're stopping over the houses..."),
    (61, 3.5, "What are those things?"),
    (65, 3.5, "Are those drones?"),
    (69, 3.5, "Is this real?!"),
    (73, 3.5, "Look, they're everywhere!"),
    (77, 3.5, "I have no signal on my phone."),
    (81, 3, "Me neither."),
    (85, 3.5, "What's going on?!"),
    (89, 3.5, "I can't see anything!"),
    (93, 3.5, "Does anyone have a flashlight?"),
    (97, 3.5, "Use your phones!"),
    (101, 3.5, "What is that?!"),
    (105, 3.5, "It's so low..."),
    (109, 4, "Don't get too close..."),
    (113, 3, "That thing is HUGE!"),
    (110, 3, "Everybody, step back..."),
    (172, 3.5, "The light! It's moving! RUN!"),
    (116, 4.5, "Oh my god, it's taking him!"),
    (121, 4.5, "Let him go!"),
    (126, 4.5, "This can't be happening..."),
    (131, 4.5, "It's taking another one!"),
    (136, 4.5, "Let them go! Please!"),
    (141, 4.5, "I can't move... I can't move!"),
    (146, 4.5, "No way... no way..."),
    (151, 3.5, "They're not going to get me!"),
    (176, 2.5, "RUN!!!"),
    (178.5, 2.5, "Who's got a gun?!"),
    (181, 3, "Help! Somebody help us!"),
    (191, 3, "They're killing everyone!"),
    (187, 3, "RUN!!"),
    (184, 3, "Aaaaah!"),
    (195, 4, "Please, no, no, no!"),
    (200, 4, "Somebody do something!"),
    (224, 4, "Another one... another one is coming!"),
    (229, 4, "It's lighting up everything!"),
    (234, 4, "Something is coming down in the light..."),
    (239, 4.5, "Those are... aliens. Real aliens."),
    (245, 4, "Don't go near them..."),
    (250, 4, "Hello? Can you understand me?"),
    (257, 3, "Why isn't he moving?! What did you do?!"),
    (261, 3, "Let him go! Let him go!"),
    (265, 2.5, "NO!"),
    (267.5, 3, "RUN! RUN!"),
    (271, 3, "They're killing us!"),
    (275, 3, "Run! Don't look back!"),
    (280, 3.5, "Help! Somebody help!"),
    (285, 4, "Please... please..."),
]

ORBS = []
GX, GZ = 6, 4
for i in range(4):  # fast scouts that dash about and later hang low over the crowd
    a = i / 4 * math.tau + 0.4
    ORBS.append({"type": "scout_sphere", "x": round(GX + math.cos(a) * 70, 1), "z": round(GZ + math.sin(a) * 70, 1),
                 "at": 74 + i * 1.5, "y": 30, "lowAt": 100 + i, "hx": GX, "hz": GZ})
# the first big sphere: takes four people, then sweeps a ray over the crowd and leaves
ORBS.append({"type": "abductor_sphere", "x": 80, "z": -60, "at": 110, "y": 90, "hx": GX, "hz": GZ})
for i in range(8):  # small hunters that vaporise people after the big one has gone
    a = i / 8 * math.tau
    ORBS.append({"type": "hunter_sphere", "x": round(GX + math.cos(a) * 45, 1), "z": round(GZ + math.sin(a) * 45, 1),
                 "at": 178 + i * 0.6, "y": 25})
# the second big sphere: lights up whoever stayed and brings the greys
ORBS.append({"type": "carrier_sphere", "x": -80, "z": 50, "at": 228, "y": 90, "hx": GX, "hz": GZ})

m = {
    "version": 1,
    "meta": {"id": "map-6", "name": "Map 6 - Celestial Event III", "author": "Zombie Horde Survivors",
             "created": "2026-10-20", "updated": "2026-10-20", "size": {"width": N, "depth": N}},
    "terrain": {"heights": None, "water": None, "paint": paint},
    "surfaces": [
        {"asset": "asphalt", "path": [{"x": -HALF, "z": 0}, {"x": HALF, "z": 0}], "width": ROAD},
        {"asset": "asphalt", "path": [{"x": 0, "z": -HALF}, {"x": 0, "z": HALF}], "width": ROAD},
    ],
    "props": props,
    "players": [
        {"id": "p1", "name": "Player 1", "kind": "human", "team": 0, "color": "#4aa3ff"},
        {"id": "horde", "name": "The visitors", "kind": "ai", "team": 1, "color": "#9fd8ff"},
    ],
    "units": units,
    "logic": {
        "mode": "waves", "noWaves": True, "boss": {"enabled": False},
        "skyShow": True, "startView": "first", "startPitch": 0.95,
        "orbs": ORBS,
        "subtitles": [{"at": a, "duration": d, "text": t} for a, d, t in subtitles],
    },
    "environment": {"sky": True, "timeOfDay": 0, "sun": False, "moon": True, "clouds": 0, "fog": 0.05},
}
with open(root + "/data/maps/map-6.json", "w", encoding="utf-8") as f:
    json.dump(m, f, indent=1)
counts = {}
for p in props:
    counts[p["asset"]] = counts.get(p["asset"], 0) + 1
print(counts, "civilians", len(civilians))
