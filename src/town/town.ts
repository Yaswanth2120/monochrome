import * as THREE from "three";
import type { Kit } from "./kit";
import { STREET_Z } from "./house";
import { type Route, along, blockLoop, distanceAt, route } from "./routes";
import { createCrowd } from "./crowd";

/*
 * The city around the six houses. The original neighbourhood (residential street, loop
 * road, civic buildings, park) now sits inside an outer ring road, with a downtown grid
 * of towers to the east, a suburb and a stadium to the west, busy traffic on every block
 * and pedestrians on the pavements.
 */

export type BuildingInfo = { name: string; blurb: string; center: THREE.Vector3; size: number };

/** House slots: three on each side of the street, Rocky in the middle of the north row. */
export const HOUSE_SLOTS = [
  { x: 0, z: 0, rotY: 0 }, // Rocky
  { x: -16, z: 0, rotY: 0 }, // Ferris
  { x: 16, z: 0, rotY: 0 }, // Gollum
  { x: -16, z: STREET_Z * 2, rotY: Math.PI }, // Lebowski
  { x: 0, z: STREET_Z * 2, rotY: Math.PI }, // Flash
  { x: 16, z: STREET_Z * 2, rotY: Math.PI }, // Nina
];

const LOOP = { x: 44, north: -14, south: 34 };
const ROAD_W = 3;
export const BUS_STOP_X = 3.4;

/** The road grid. Every rectangle between neighbouring lines is a block with roads on all sides. */
const OUTER = { west: -84, east: 132, north: -40, south: 60 };
const X_LINES = [OUTER.west, -LOOP.x, LOOP.x, 72, 92, 112, OUTER.east];
const Z_FULL = [OUTER.north, LOOP.north, LOOP.south, OUTER.south];
const Z_DOWNTOWN = [OUTER.north, LOOP.north, 2, 18, LOOP.south, OUTER.south];
type Block = { x0: number; z0: number; x1: number; z1: number; zone: "west" | "middle" | "east" };
const BLOCKS: Block[] = [];
for (let i = 0; i < 3; i++)
  BLOCKS.push({ x0: OUTER.west, x1: -LOOP.x, z0: Z_FULL[i], z1: Z_FULL[i + 1], zone: "west" });
for (const [z0, z1] of [
  [OUTER.north, LOOP.north],
  [LOOP.north, STREET_Z],
  [STREET_Z, LOOP.south],
  [LOOP.south, OUTER.south],
])
  BLOCKS.push({ x0: -LOOP.x, x1: LOOP.x, z0, z1, zone: "middle" });
for (let c = 2; c < X_LINES.length - 1; c++)
  for (let r = 0; r < Z_DOWNTOWN.length - 1; r++)
    BLOCKS.push({ x0: X_LINES[c], x1: X_LINES[c + 1], z0: Z_DOWNTOWN[r], z1: Z_DOWNTOWN[r + 1], zone: "east" });

/** Small deterministic random numbers, so the skyline is the same every visit. */
function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildTown(kit: Kit, scene: THREE.Scene) {
  const { m, box, lowDetail } = kit;
  const buildings: { mesh: THREE.Object3D; info: BuildingInfo }[] = [];

  // A floating diorama slab under the whole city.
  const SLAB = { x0: OUTER.west - 12, x1: OUTER.east + 12, z0: OUTER.north - 12, z1: OUTER.south + 12 };
  const slabW = SLAB.x1 - SLAB.x0;
  const slabD = SLAB.z1 - SLAB.z0;
  const slabX = (SLAB.x0 + SLAB.x1) / 2;
  const slabZ = (SLAB.z0 + SLAB.z1) / 2;
  const base = box(slabW, 1.2, slabD, m.base, slabX, -1.2, slabZ, scene, m.edgeBright, false);
  base.userData.ground = true;
  // A four-sided pyramid under the slab; radius 1 and four segments make a square with half-side 1/√2.
  const underGeometry = new THREE.ConeGeometry(1, 1, 4, 1);
  underGeometry.rotateY(Math.PI / 4);
  underGeometry.rotateX(Math.PI);
  const under = new THREE.Mesh(underGeometry, m.base);
  under.scale.set(slabW * 0.47 * Math.SQRT2, 40, slabD * 0.47 * Math.SQRT2);
  under.position.set(slabX, -1.2 - 20, slabZ);
  under.add(new THREE.LineSegments(new THREE.EdgesGeometry(underGeometry), m.edgeFaint));
  scene.add(under);

  // ---------- Roads ----------
  const roadLines: THREE.Vector3[] = [];
  const dashed = (x0: number, z0: number, x1: number, z1: number) => {
    const length = Math.hypot(x1 - x0, z1 - z0);
    const steps = Math.floor(length / 1.6);
    for (let i = 0; i < steps; i++) {
      const a = i / steps;
      const b = (i + 0.5) / steps;
      roadLines.push(
        new THREE.Vector3(x0 + (x1 - x0) * a, 0.05, z0 + (z1 - z0) * a),
        new THREE.Vector3(x0 + (x1 - x0) * b, 0.05, z0 + (z1 - z0) * b),
      );
    }
  };
  const road = (x0: number, z0: number, x1: number, z1: number) => {
    const horizontal = z0 === z1;
    const length = horizontal ? Math.abs(x1 - x0) : Math.abs(z1 - z0);
    box(
      horizontal ? length + ROAD_W : ROAD_W,
      0.03,
      horizontal ? ROAD_W : length + ROAD_W,
      m.road,
      (x0 + x1) / 2,
      0,
      (z0 + z1) / 2,
      scene,
      null,
      false,
    );
    dashed(x0, z0, x1, z1);
  };
  // The residential street, the full-width roads, the downtown cross streets and every avenue.
  road(-LOOP.x, STREET_Z, LOOP.x, STREET_Z);
  Z_FULL.forEach((z) => road(OUTER.west, z, OUTER.east, z));
  [2, 18].forEach((z) => road(LOOP.x, z, OUTER.east, z));
  X_LINES.forEach((x) => road(x, OUTER.north, x, OUTER.south));
  scene.add(
    new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints(roadLines),
      new THREE.LineBasicMaterial({ color: 0xbdbdc2 }),
    ),
  );

  // Pavements: a ring just inside every block, so they never cross a road.
  const pave = 0.8;
  const paveIn = ROAD_W / 2;
  for (const b of BLOCKS) {
    const w = b.x1 - b.x0 - paveIn * 2;
    const d = b.z1 - b.z0 - paveIn * 2;
    box(w, 0.05, pave, m.sidewalk, (b.x0 + b.x1) / 2, 0, b.z0 + paveIn + pave / 2, scene, m.edgeFaint, false);
    box(w, 0.05, pave, m.sidewalk, (b.x0 + b.x1) / 2, 0, b.z1 - paveIn - pave / 2, scene, m.edgeFaint, false);
    box(
      pave,
      0.05,
      d - pave * 2,
      m.sidewalk,
      b.x0 + paveIn + pave / 2,
      0,
      (b.z0 + b.z1) / 2,
      scene,
      m.edgeFaint,
      false,
    );
    box(
      pave,
      0.05,
      d - pave * 2,
      m.sidewalk,
      b.x1 - paveIn - pave / 2,
      0,
      (b.z0 + b.z1) / 2,
      scene,
      m.edgeFaint,
      false,
    );
    // A lamp on each corner, except in the original neighbourhood which has its own.
    if (b.zone !== "middle" && (!lowDetail || b.zone === "west")) {
      for (const [x, z] of [
        [b.x0, b.z0],
        [b.x1, b.z0],
        [b.x1, b.z1],
        [b.x0, b.z1],
      ])
        kit.lamp(scene, x + Math.sign((b.x0 + b.x1) / 2 - x) * 2.3, z + Math.sign((b.z0 + b.z1) / 2 - z) * 2.3);
    }
  }
  // Zebra crossings where the street meets the loop, outside the school, and at downtown junctions.
  const zebra = (x: number, z: number, alongX: boolean) => {
    for (let i = -2; i <= 2; i++)
      box(
        alongX ? 0.35 : 2.6,
        0.02,
        alongX ? 2.6 : 0.35,
        m.white,
        x + (alongX ? i * 0.6 : 0),
        0.03,
        z + (alongX ? 0 : i * 0.6),
        scene,
        null,
        false,
      );
  };
  zebra(-LOOP.x + 3, STREET_Z, true);
  zebra(LOOP.x - 3, STREET_Z, true);
  zebra(-22, LOOP.north, true);
  zebra(-26, LOOP.south, true);
  if (!lowDetail) {
    for (const x of X_LINES.slice(3, -1))
      for (const z of [LOOP.north, 2, 18, LOOP.south]) {
        zebra(x - 3.4, z, true);
        zebra(x, z + 3.4, false);
      }
  }
  // Street lamps along both pavements of the residential street.
  for (let x = -36; x <= 36; x += lowDetail ? 16 : 8) {
    kit.lamp(scene, x + 4, STREET_Z - ROAD_W / 2 - 0.55);
    kit.lamp(scene, x, STREET_Z + ROAD_W / 2 + 0.55);
  }

  // ---------- Civic buildings ----------
  /** A building whose front faces `facing` (radians, 0 = +z). */
  const building = (
    name: string,
    blurb: string,
    x: number,
    z: number,
    w: number,
    d: number,
    h: number,
    facing: number,
    options: { floors?: number; dark?: boolean } = {},
  ) => {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.rotation.y = facing;
    const body = box(w, h, d, options.dark ? m.dark : m.building, 0, 0, 0, group, m.edgeBright);
    box(w + 0.3, 0.3, d + 0.3, m.dark, 0, h, 0, group, m.edge);
    // Windows: outlines on every floor of the front and sides.
    if (!lowDetail) {
      const floors = options.floors ?? Math.max(1, Math.floor(h / 2.4));
      const windows: THREE.Vector3[] = [];
      const rect = (cx: number, cy: number, cz: number, ww: number, wh: number, nx: number, nz: number) => {
        const ox = nz !== 0 ? ww / 2 : 0;
        const oz = nx !== 0 ? ww / 2 : 0;
        const corners = [
          new THREE.Vector3(cx - ox, cy - wh / 2, cz - oz),
          new THREE.Vector3(cx + ox, cy - wh / 2, cz + oz),
          new THREE.Vector3(cx + ox, cy + wh / 2, cz + oz),
          new THREE.Vector3(cx - ox, cy + wh / 2, cz - oz),
        ];
        for (let i = 0; i < 4; i++) windows.push(corners[i], corners[(i + 1) % 4]);
      };
      for (let f = 0; f < floors; f++) {
        const cy = (h / floors) * (f + 0.55);
        if (f === 0 && h < 7) continue; // ground floor keeps the door and sign clear on low buildings
        for (let wx = -w / 2 + 1.2; wx <= w / 2 - 1.2; wx += 1.6) rect(wx, cy, d / 2 + 0.02, 0.9, 0.9, 0, 1);
        for (let wz = -d / 2 + 1.2; wz <= d / 2 - 1.2; wz += 1.6) {
          rect(w / 2 + 0.02, cy, wz, 0.9, 0.9, 1, 0);
          rect(-w / 2 - 0.02, cy, wz, 0.9, 0.9, -1, 0);
        }
      }
      group.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(windows), m.edge));
    }
    box(1.8, 2.2, 0.1, m.black, 0, 0, d / 2 + 0.02, group, m.edgeBright, false);
    kit.sign(
      [{ text: name, size: 44, weight: 800 }],
      Math.min(w - 1, name.length * 0.62 + 1.4),
      1.1,
      group,
      0,
      Math.min(h - 0.9, 3.2),
      d / 2 + 0.04,
    );
    scene.add(group);
    const info = { name, blurb, center: new THREE.Vector3(x, h / 2, z), size: Math.max(w, d, h) };
    group.traverse((child) => (child.userData.building = info));
    buildings.push({ mesh: group, info });
    return group;
  };

  // North side, facing the north loop road.
  building("SCHOOL", "Where the habits start young.", -26, -24, 18, 9, 5.2, 0);
  building("LIBRARY", "Free books. Fewer excuses.", -4, -23, 11, 8, 5.6, 0);
  building("OFFICE", "Everyone’s bus comes here. Only some of them get on it.", 14, -25, 10, 10, 22, 0, { floors: 8 });
  building("CAFÉ", "Where Gollum goes to scroll in public.", 30, -20.5, 8, 6, 3.6, 0);
  // South side, facing the south loop road.
  building("HOSPITAL", "Sleep, food and movement keep you out of here.", -26, 44, 18, 10, 9, Math.PI, { floors: 3 });
  building("POLICE", "Keeping the neighbourhood honest.", -4, 43, 11, 8, 5.6, Math.PI);
  building("FIRE STATION", "Ready at all hours. Discipline in uniform.", 14, 43, 13, 8, 6, Math.PI, { dark: true });
  building("GROCERY", "Rocky shops the list. Lebowski shops the snacks.", 32, 43, 12, 8, 4.6, Math.PI);
  // East, between the loop and downtown: the gym.
  building("GYM", "Open 24/7. Rarely full.", 58, -6, 8, 10, 5.2, -Math.PI / 2);

  // Details on the civic buildings.
  if (!lowDetail) {
    // Library columns and steps.
    for (let i = -2; i <= 2; i++) if (i !== 0) kit.cylinder(0.28, 4.2, m.white, -4 + i * 2, 0, -18.4, scene, 14);
    box(9, 0.3, 1.2, m.grey, -4, 0, -18.2, scene);
    // School flagpole and playground.
    kit.cylinder(0.06, 6, m.grey, -15.5, 0, -17.6, scene, 8);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.8), m.white);
    flag.position.set(-14.8, 5.5, -17.6);
    scene.add(flag);
    const swing = new THREE.Group();
    swing.position.set(-34, 0, -17.2);
    [-1.2, 1.2].forEach((dx) => box(0.08, 2.2, 0.08, m.grey, dx, 0, 0, swing, null));
    box(2.6, 0.08, 0.08, m.grey, 0, 2.2, 0, swing, null);
    [-0.5, 0.5].forEach((dx) => box(0.5, 0.06, 0.25, m.white, dx, 0.6, 0, swing));
    scene.add(swing);
    const slide = box(0.6, 0.06, 3, m.white, -29.5, 0.8, -17.2, scene);
    slide.rotation.x = 0.45;
    // Hospital cross on the front and a helipad on the roof.
    const cross = new THREE.Group();
    box(2.2, 0.6, 0.1, m.white, 0, 0, 0, cross, null, false);
    box(0.6, 2.2, 0.1, m.white, 0, -0.8, 0, cross, null, false);
    cross.position.set(-26, 6.4, 38.9);
    scene.add(cross);
    const pad = new THREE.Mesh(new THREE.CircleGeometry(2.4, 32), m.black);
    pad.rotation.x = -Math.PI / 2;
    pad.position.set(-26, 9.32, 44);
    scene.add(pad);
    const padRing = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(
        Array.from({ length: 40 }, (_, i) =>
          new THREE.Vector3(
            Math.cos((i / 40) * Math.PI * 2) * 2.4,
            9.34,
            44 + Math.sin((i / 40) * Math.PI * 2) * 2.4,
          ).add(new THREE.Vector3(-26, 0, 0)),
        ),
      ),
      m.edgeBright,
    );
    scene.add(padRing);
    // Fire station bay doors.
    [-4, 0, 4].forEach((dx) => box(3, 3.6, 0.1, m.black, 14 + dx, 0, 38.95, scene, m.edgeBright, false));
    // Grocery awning.
    for (let i = 0; i < 8; i++)
      box(1.4, 0.1, 1.2, i % 2 ? m.white : m.black, 32 - 5.25 + i * 1.5, 3.0, 38.4, scene, null);
    // Café umbrellas.
    [27, 33].forEach((x) => {
      kit.cylinder(0.5, 0.06, m.white, x, 0.75, -16.4, scene, 14);
      kit.cylinder(0.04, 1.9, m.grey, x, 0, -16.4, scene, 6, null);
      const umbrella = new THREE.Mesh(new THREE.ConeGeometry(1.1, 0.5, 8), m.white);
      umbrella.position.set(x, 2.1, -16.4);
      umbrella.add(new THREE.LineSegments(new THREE.EdgesGeometry(umbrella.geometry, 30), m.edge));
      scene.add(umbrella);
    });
    // Office antenna.
    kit.cylinder(0.08, 4, m.grey, 14, 22.3, -25, scene, 6);
    // Gym dumbbell sign.
    const dumbbell = new THREE.Group();
    kit.cylinder(0.08, 1.6, m.white, 0, 0, 0, dumbbell, 8, null).rotation.z = Math.PI / 2;
    [-0.8, 0.8].forEach(
      (dx) => (kit.cylinder(0.35, 0.3, m.white, dx, -0.15, 0, dumbbell, 14).rotation.z = Math.PI / 2),
    );
    dumbbell.position.set(52.9, 4.0, -6);
    dumbbell.rotation.y = Math.PI / 2;
    scene.add(dumbbell);
  }

  // ---------- The park, west of the loop ----------
  const park = new THREE.Group();
  park.position.set(-62, 0, 10);
  box(22, 0.05, 40, m.lawn, 0, 0, 0, park, m.edgeFaint, false);
  const pond = new THREE.Mesh(new THREE.CircleGeometry(4.5, 40), m.black);
  pond.rotation.x = -Math.PI / 2;
  pond.scale.set(1.3, 1, 1);
  pond.position.set(0, 0.07, -4);
  park.add(pond);
  park.add(
    new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(
        Array.from(
          { length: 48 },
          (_, i) =>
            new THREE.Vector3(
              Math.cos((i / 48) * Math.PI * 2) * 5.85,
              0.08,
              -4 + Math.sin((i / 48) * Math.PI * 2) * 4.5,
            ),
        ),
      ),
      m.edgeBright,
    ),
  );
  park.add(
    new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(
        Array.from(
          { length: 64 },
          (_, i) =>
            new THREE.Vector3(Math.cos((i / 64) * Math.PI * 2) * 8.5, 0.07, 2 + Math.sin((i / 64) * Math.PI * 2) * 14),
        ),
      ),
      new THREE.LineBasicMaterial({ color: 0x55555c }),
    ),
  );
  const parkTrees = lowDetail ? 8 : 18;
  for (let i = 0; i < parkTrees; i++) {
    const a = (i / parkTrees) * Math.PI * 2;
    (i % 2 ? kit.roundTree : kit.tree)(park, Math.cos(a) * (9.5 + (i % 3)), 2 + Math.sin(a) * 16, 0.9 + (i % 3) * 0.2);
  }
  [-6, 6].forEach((z) => kit.bench(park, 6.5, z, -Math.PI / 2));
  kit.bench(park, -6.5, 8, Math.PI / 2);
  kit.sign([{ text: "PARK", size: 44, weight: 800 }], 3, 1.1, park, 9, 1.3, -18, Math.PI / 2);
  scene.add(park);
  const parkInfo = {
    name: "PARK",
    blurb: "Fresh air, free of charge. Rocky walks here. Nobody else does.",
    center: new THREE.Vector3(-62, 1, 10),
    size: 30,
  };
  park.traverse((child) => (child.userData.building = parkInfo));
  buildings.push({ mesh: park, info: parkInfo });

  // Trees behind the houses and along the loop.
  const treeSpots: [number, number][] = [];
  for (let x = -38; x <= 38; x += lowDetail ? 10 : 5) {
    treeSpots.push([x, -9 + (Math.abs(x) % 3)], [x + 2.5, 27 + (Math.abs(x) % 2)]);
  }
  treeSpots.forEach(([x, z], i) => (i % 3 ? kit.tree : kit.roundTree)(scene, x, z, 0.8 + (i % 4) * 0.12));

  // ---------- Downtown, east of the loop ----------
  const rand = seeded(1005);
  const skyline: THREE.Vector3[] = [];
  /** A plain tower: floor bands and mullions drawn as lines, sometimes a tank or mast on the roof. */
  const tower = (x: number, z: number, w: number, d: number, h: number) => {
    box(w, h, d, rand() < 0.4 ? m.dark : m.building, x, 0, z, scene, m.edgeBright);
    box(w + 0.25, 0.25, d + 0.25, m.dark, x, h, z, scene, m.edge);
    const roof = rand();
    if (roof < 0.25) kit.cylinder(Math.min(w, d) * 0.18, 1.4, m.grey, x + w * 0.2, h + 0.25, z - d * 0.2, scene, 10);
    else if (roof < 0.4) kit.cylinder(0.06, 3 + rand() * 3, m.grey, x, h + 0.25, z, scene, 6, null);
    else if (roof < 0.55) box(w * 0.5, 1.2, d * 0.5, m.dark, x, h + 0.25, z, scene, m.edge);
    if (lowDetail) return;
    const corners: [number, number][] = [
      [x - w / 2 - 0.02, z - d / 2 - 0.02],
      [x + w / 2 + 0.02, z - d / 2 - 0.02],
      [x + w / 2 + 0.02, z + d / 2 + 0.02],
      [x - w / 2 - 0.02, z + d / 2 + 0.02],
    ];
    for (let y = 2.6; y < h - 0.6; y += 2.6)
      for (let i = 0; i < 4; i++) {
        const [ax, az] = corners[i];
        const [bx, bz] = corners[(i + 1) % 4];
        skyline.push(new THREE.Vector3(ax, y, az), new THREE.Vector3(bx, y, bz));
      }
    for (let i = 0; i < 4; i++) {
      const [ax, az] = corners[i];
      const [bx, bz] = corners[(i + 1) % 4];
      const length = Math.hypot(bx - ax, bz - az);
      const count = Math.floor(length / 1.6);
      for (let k = 1; k < count; k++) {
        const f = k / count;
        skyline.push(
          new THREE.Vector3(ax + (bx - ax) * f, 2.6, az + (bz - az) * f),
          new THREE.Vector3(ax + (bx - ax) * f, h - 0.6, az + (bz - az) * f),
        );
      }
    }
  };

  // Landmarks, each in its own block and facing the road on the block's south side.
  type Landmark = {
    block: [number, number];
    name: string;
    blurb: string;
    w: number;
    d: number;
    h: number;
    floors?: number;
    dark?: boolean;
    dx?: number;
  };
  const LANDMARKS: Landmark[] = [
    {
      block: [72, OUTER.north],
      name: "CITY HALL",
      blurb: "Rules for the city. Rocky keeps his own.",
      w: 14,
      d: 9,
      h: 8,
      floors: 2,
    },
    {
      block: [112, OUTER.north],
      name: "BANK",
      blurb: "Compound interest works on habits too.",
      w: 12,
      d: 10,
      h: 16,
      floors: 5,
      dark: true,
    },
    { block: [LOOP.x, 2], name: "MALL", blurb: "Lebowski’s favourite cardio.", w: 20, d: 9, h: 7, floors: 2 },
    {
      block: [92, 2],
      name: "SKYLINE TOWER",
      blurb: "Fifty floors, one step at a time.",
      w: 8,
      d: 8,
      h: 46,
      floors: 16,
      dark: true,
    },
    {
      block: [112, 18],
      name: "HOTEL",
      blurb: "Room service at 2 AM. Ferris has the number.",
      w: 12,
      d: 9,
      h: 26,
      floors: 9,
    },
    {
      block: [72, LOOP.south],
      name: "CINEMA",
      blurb: "Gollum watches the trailers on his phone.",
      w: 14,
      d: 10,
      h: 8,
      floors: 2,
      dark: true,
    },
  ];
  const reserved: { x0: number; z0: number; x1: number; z1: number }[] = [{ x0: 52, z0: -11, x1: 64, z1: -1 }]; // the gym
  for (const lm of LANDMARKS) {
    const b = BLOCKS.find((blk) => blk.x0 === lm.block[0] && blk.z0 === lm.block[1])!;
    const x = (b.x0 + b.x1) / 2 + (lm.dx ?? 0);
    const z = b.z1 - 3 - lm.d / 2;
    building(lm.name, lm.blurb, x, z, lm.w, lm.d, lm.h, 0, { floors: lm.floors, dark: lm.dark });
    reserved.push({ x0: x - lm.w / 2 - 0.8, x1: x + lm.w / 2 + 0.8, z0: z - lm.d / 2 - 0.8, z1: z + lm.d / 2 + 0.8 });
    if (lm.name === "SKYLINE TOWER") kit.cylinder(0.12, 7, m.white, x, lm.h + 0.3, z, scene, 8);
    if (lm.name === "CITY HALL" && !lowDetail)
      for (let i = -3; i <= 3; i++)
        if (i !== 0) kit.cylinder(0.3, 6, m.white, x + i * 1.9, 0, z + lm.d / 2 + 0.45, scene, 14);
    if (lm.name === "CINEMA")
      kit.sign(
        [{ text: "NOW SHOWING · TOMORROW", size: 30, weight: 800, mono: true }],
        9,
        0.9,
        scene,
        x,
        6.2,
        z + lm.d / 2 + 0.06,
      );
  }
  // Fill every other downtown lot with a tower; the odd empty lot becomes a little plaza with a tree.
  const centre = new THREE.Vector2(102, 10);
  for (const b of BLOCKS.filter((blk) => blk.zone === "east")) {
    const ix0 = b.x0 + 3;
    const iz0 = b.z0 + 3;
    const W = b.x1 - b.x0 - 6;
    const D = b.z1 - b.z0 - 6;
    const nx = Math.max(1, Math.round(W / 8.5));
    const nz = Math.max(1, Math.round(D / 8.5));
    for (let i = 0; i < nx; i++)
      for (let j = 0; j < nz; j++) {
        const lx = ix0 + (W / nx) * (i + 0.5);
        const lz = iz0 + (D / nz) * (j + 0.5);
        const lw = W / nx - 1.4 - rand() * 1.2;
        const ld = D / nz - 1.4 - rand() * 1.2;
        const hit = reserved.some(
          (r) => lx + lw / 2 > r.x0 && lx - lw / 2 < r.x1 && lz + ld / 2 > r.z0 && lz - ld / 2 < r.z1,
        );
        if (hit) continue;
        if (rand() < 0.12) {
          kit.roundTree(scene, lx, lz, 1.1);
          continue;
        }
        const near = Math.max(0, 1 - centre.distanceTo(new THREE.Vector2(lx, lz)) / 55);
        tower(lx, lz, lw, ld, 5 + rand() * 10 + near * near * 26);
      }
  }
  if (skyline.length) scene.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(skyline), m.edge));

  // ---------- West of the loop: a suburb and the stadium ----------
  const suburb = new THREE.Group();
  const miniHouse = (x: number, z: number, rotY: number, i: number) => {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.rotation.y = rotY;
    box(4.4, 2.6, 4, i % 3 === 1 ? m.dark : m.building, 0, 0, 0, group, m.edgeBright);
    const roofGeometry = new THREE.ConeGeometry(1, 1, 4);
    roofGeometry.rotateY(Math.PI / 4);
    const roof = new THREE.Mesh(roofGeometry, i % 2 ? m.white : m.grey);
    roof.scale.set(3.3, 1.6, 3.0);
    roof.position.y = 2.6 + 0.8;
    roof.castShadow = true;
    roof.add(new THREE.LineSegments(new THREE.EdgesGeometry(roofGeometry), m.edge));
    group.add(roof);
    box(0.9, 1.6, 0.08, m.black, 0.8, 0, 2.02, group, m.edgeBright, false);
    box(1, 0.8, 0.06, m.white, -1.1, 1.2, 2.02, group, null, false);
    if (!lowDetail) kit.roundTree(group, 2.9, 1.2, 0.7);
    suburb.add(group);
  };
  for (let i = 0; i < 5; i++) {
    const x = OUTER.west + 6.8 + i * 6.8;
    miniHouse(x, OUTER.north + 5.6, Math.PI, i);
    miniHouse(x, LOOP.north - 5.6, 0, i + 1);
  }
  kit.sign([{ text: "MAPLE ROW", size: 44, weight: 800 }], 4, 1.1, suburb, -64, 1.2, LOOP.north - 2.6);
  scene.add(suburb);
  const suburbInfo = {
    name: "MAPLE ROW",
    blurb: "Ten more houses, ten more routines. Most of them start on Monday.",
    center: new THREE.Vector3(-64, 1, -27),
    size: 22,
  };
  suburb.traverse((child) => (child.userData.building = suburbInfo));
  buildings.push({ mesh: suburb, info: suburbInfo });

  const stadium = new THREE.Group();
  stadium.position.set(-64, 0, (LOOP.south + OUTER.south) / 2);
  box(16, 0.06, 9, m.lawn, 0, 0, 0, stadium, m.edgeBright, false);
  const ellipse = (rx: number, rz: number, y: number) =>
    new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(
        Array.from(
          { length: 64 },
          (_, i) => new THREE.Vector3(Math.cos((i / 64) * Math.PI * 2) * rx, y, Math.sin((i / 64) * Math.PI * 2) * rz),
        ),
      ),
      m.edgeBright,
    );
  stadium.add(ellipse(12.4, 7.2, 0.08), ellipse(13.2, 7.9, 0.08), ellipse(1.6, 1.6, 0.08));
  stadium.add(
    new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0.08, -4.5), new THREE.Vector3(0, 0.08, 4.5)]),
      m.edgeBright,
    ),
  );
  [-1, 1].forEach((side) => {
    box(24, 0.8, 1.4, m.building, 0, 0, side * 8.8, stadium, m.edge);
    box(24, 1.6, 1.2, m.dark, 0, 0, side * 9.9, stadium, m.edge);
    box(1.4, 0.8, 12, m.building, side * 14.2, 0, 0, stadium, m.edge);
    box(1.2, 1.6, 12, m.dark, side * 15.4, 0, 0, stadium, m.edge);
    [-1, 1].forEach((end) => {
      kit.cylinder(0.1, 8, m.grey, side * 15.4, 0, end * 9.9, stadium, 6, null);
      const light = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.5, 0.3), m.glow);
      light.position.set(side * 15.4, 8.2, end * 9.9);
      stadium.add(light);
    });
  });
  kit.sign([{ text: "STADIUM", size: 44, weight: 800 }], 3.6, 1.1, stadium, 0, 2.3, 10.55);
  scene.add(stadium);
  const stadiumInfo = {
    name: "STADIUM",
    blurb: "Champions are made in the mornings nobody watches.",
    center: stadium.position.clone().setY(2),
    size: 26,
  };
  stadium.traverse((child) => (child.userData.building = stadiumInfo));
  buildings.push({ mesh: stadium, info: stadiumInfo });

  // A row of trees just inside the outer ring, north and south.
  if (!lowDetail)
    for (let x = OUTER.west + 4; x <= OUTER.east - 4; x += 7) {
      kit.tree(scene, x, OUTER.north - 6, 0.9 + (Math.abs(x) % 3) * 0.1);
      kit.roundTree(scene, x + 3.5, OUTER.south + 6, 0.9);
    }

  // Parked service vehicles.
  kit.vehicle("schoolbus", scene, -38, -18.5, Math.PI / 2);
  const ambulance = kit.vehicle("ambulance", scene, -15, 37.6, Math.PI);
  const engine = kit.vehicle("firetruck", scene, 14, 37.4, Math.PI);
  kit.vehicle("car", scene, -1, 37.6, Math.PI / 2);
  kit.vehicle("car", scene, 36, 37.8, -Math.PI / 2);

  // ---------- Traffic ----------
  // Each block has its own clockwise loop in the right-hand lane of the roads around it, so
  // loops never share a lane; the outer ring carries a counter-clockwise loop in its outer lane.
  type Moving = { v: ReturnType<typeof kit.vehicle>; route: Route; distance: number; speed: number };
  const traffic: Moving[] = [];
  const busBlock = BLOCKS.find((b) => b.zone === "middle" && b.z1 === STREET_Z)!;
  const busRoute = blockLoop(busBlock.x0, busBlock.z0, busBlock.x1, busBlock.z1, 0.75);
  const bus = kit.vehicle("bus", scene);
  const kinds = ["car", "car", "car", "car", "police", "car", "car", "bus", "car", "car", "ambulance", "car"] as const;
  let kindIndex = 0;
  BLOCKS.forEach((b, i) => {
    const loop = blockLoop(b.x0, b.z0, b.x1, b.z1, 0.75);
    const count = b === busBlock ? 1 : b.zone === "east" ? (lowDetail ? 1 : 2) : lowDetail ? 1 : 2;
    const speed = 5.5 + (i % 5) * 0.6;
    for (let k = 0; k < count; k++) {
      const kind = b.zone === "middle" ? "car" : kinds[kindIndex++ % kinds.length];
      traffic.push({ v: kit.vehicle(kind, scene), route: loop, distance: (loop.total * k) / count + i * 7, speed });
    }
  });
  const ring = route([
    [OUTER.west - 0.75, OUTER.north - 0.75],
    [OUTER.west - 0.75, OUTER.south + 0.75],
    [OUTER.east + 0.75, OUTER.south + 0.75],
    [OUTER.east + 0.75, OUTER.north - 0.75],
  ]);
  const ringCount = lowDetail ? 3 : 7;
  for (let k = 0; k < ringCount; k++)
    traffic.push({
      v: kit.vehicle(k === 2 ? "police" : k === 5 ? "bus" : "car", scene),
      route: ring,
      distance: (ring.total * k) / ringCount,
      speed: 8.5,
    });
  const flashing = [...traffic.map((c) => c.v), ambulance, engine].filter((v) => v.beacon.length);

  // Rocky's stop is on the street leg of the bus loop, at x = BUS_STOP_X.
  const stopDistance = distanceAt(busRoute, BUS_STOP_X, STREET_Z - 0.75);
  let busDistance = stopDistance - 30;
  let busWait = 0;

  // ---------- Pedestrians ----------
  const reverse = (r: Route) =>
    route(
      r.points
        .slice()
        .reverse()
        .map((p) => [p.x, p.z] as [number, number]),
    );
  const southStreet = BLOCKS.find((b) => b.zone === "middle" && b.z0 === STREET_Z)!;
  const walkBlocks = [southStreet, ...BLOCKS.filter((b) => b.zone === "east"), BLOCKS[0], BLOCKS[2]];
  const paths: Route[] = [];
  const parkPath = route(
    Array.from(
      { length: 40 },
      (_, i) =>
        [-62 + Math.cos((i / 40) * Math.PI * 2) * 8.5, 12 + Math.sin((i / 40) * Math.PI * 2) * 14] as [number, number],
    ),
  );
  walkBlocks.forEach((b, i) => {
    const loop = blockLoop(b.x0, b.z0, b.x1, b.z1, 1.9);
    paths.push(i % 2 ? reverse(loop) : loop);
    if (i === 0) paths.push(parkPath, reverse(loop));
  });
  const crowd = createCrowd(scene, paths, lowDetail ? 16 : 52);

  function update(dt: number, t: number, rockyWaiting: boolean) {
    // The bus stops at Rocky's stop every lap, and waits longer when he's there.
    if (busWait > 0) busWait -= dt;
    else {
      const before = busDistance % busRoute.total;
      busDistance += dt * 7;
      const after = busDistance % busRoute.total;
      if (before < stopDistance && after >= stopDistance) busWait = rockyWaiting ? 3.5 : 1.5;
    }
    const b = along(busRoute, busDistance);
    bus.group.position.copy(b.position);
    bus.group.rotation.y = b.heading;
    for (const car of traffic) {
      car.distance += dt * car.speed;
      const p = along(car.route, car.distance);
      car.v.group.position.copy(p.position);
      car.v.group.rotation.y = p.heading;
    }
    crowd.update(dt);
    // Emergency lights blink in black and white.
    const blink = Math.floor(t * 4) % 2 === 0;
    for (const v of flashing) v.beacon.forEach((light, i) => (light.visible = (i % 2 === 0) === blink));
  }

  return { buildings, update, bus };
}
