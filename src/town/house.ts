import * as THREE from "three";
import type { Kit } from "./kit";

/*
 * One house plot, built in local space: a cutaway home (bedroom, bathroom, kitchen, dining,
 * study, a sofa), a fenced front yard with a mailbox and a discipline sign facing the street.
 * The street runs along local z = 8.8; local +z faces it. Every house shares this layout, so
 * everyone has the same stations for the same daily tasks.
 */

export type Tell = "rocky" | "ferris" | "gollum" | "koushik" | "flash" | "nina";

export type StationDef = { stand: THREE.Vector3; facing: number; lie?: { pos: THREE.Vector3; facing: number } };

export const DOOR = { x0: 1.4, x1: 3.1, z: 2 };
export const GATE = { x0: 1.4, x1: 3.1, z: 6.45 };
export const PLOT = { x0: -6.6, x1: 6.6, z0: -4.1, z1: 7.15 };
export const STREET_Z = 8.8;

export const STATIONS: Record<string, StationDef> = {
  sink: { stand: new THREE.Vector3(1.4, 0, -3.1), facing: Math.PI },
  stove: { stand: new THREE.Vector3(4.55, 0, -0.5), facing: Math.PI / 2 },
  tub: { stand: new THREE.Vector3(4.5, 0.18, -3.3), facing: 0 },
  table: { stand: new THREE.Vector3(2.1, 0, 0.95), facing: Math.PI },
  desk: { stand: new THREE.Vector3(-4.1, 0, 0.35), facing: 0 },
  mailbox: { stand: new THREE.Vector3(4.7, 0, 3.0), facing: 0 },
  "kitchen-sink": { stand: new THREE.Vector3(4.55, 0, 1.05), facing: Math.PI / 2 },
  bed: {
    stand: new THREE.Vector3(-2.7, 0, -3.1),
    facing: -Math.PI / 2,
    lie: { pos: new THREE.Vector3(-4.15, 0.55, -3.25), facing: Math.PI / 2 },
  },
  sofa: { stand: new THREE.Vector3(-1.3, 0.14, 1.12), facing: Math.PI },
  gate: { stand: new THREE.Vector3(2.25, 0, 5.6), facing: 0 },
  bus: { stand: new THREE.Vector3(3.4, 0, 7.0), facing: 0 },
};

export type House = {
  group: THREE.Group;
  /** Furniture objects tagged with the station they belong to (clickable). */
  interactive: THREE.Object3D[];
  lampShade: THREE.Mesh;
  flag: THREE.Mesh;
};

export function buildHouse(
  kit: Kit,
  options: { index: number; tell: Tell; title: string; level: number; name: string; x: number; z: number; rotY: number },
): House {
  const { m, box, cylinder } = kit;
  const group = new THREE.Group();
  group.position.set(options.x, 0, options.z);
  group.rotation.y = options.rotY;
  const interactive: THREE.Object3D[] = [];
  const station = (object: THREE.Object3D, id: string) => {
    object.traverse((child) => (child.userData.station = id));
    interactive.push(object);
  };
  const rocky = options.tell === "rocky";

  // Lawn for the whole plot, then the house floor and planks.
  const lawn = box(14, 0.04, 11.3, m.lawn, 0, 0, 1.5, group, m.edgeFaint, false);
  lawn.userData.ground = true;
  const houseFloor = box(12.4, 0.06, 6.6, m.floor, -0.2, 0, -1.25, group);
  houseFloor.userData.ground = true;
  const planks: THREE.Vector3[] = [];
  for (let x = -6.2; x <= 6; x += 0.62) planks.push(new THREE.Vector3(x, 0.065, -4.5), new THREE.Vector3(x, 0.065, 2));
  group.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(planks), new THREE.LineBasicMaterial({ color: 0x34343a })));
  // Low cutaway walls, so you can see inside.
  box(12.4, 1.3, 0.16, m.dark, -0.2, 0.06, -4.55, group);
  box(0.16, 1.3, 6.6, m.dark, -6.4, 0.06, -1.25, group);
  box(0.16, 1.3, 2.4, m.dark, 0, 0.06, -3.3, group);
  box(DOOR.x0 + 6.4, 0.7, 0.16, m.dark, (DOOR.x0 - 6.4) / 2, 0.06, DOOR.z, group);
  box(6 - DOOR.x1, 0.7, 0.16, m.dark, (6 + DOOR.x1) / 2, 0.06, DOOR.z, group);
  box(0.16, 1.3, 3.4, m.dark, 6.1, 0.06, 0.35, group);
  [2.6, 3.3, 4.0, 4.7, 5.4].forEach((z, i) => box(0.7, 0.05, 0.45, m.floor, 2.25 + (i % 2 ? 0.15 : -0.1), 0, z, group, m.edgeFaint, false));

  // Bedroom.
  const bed = new THREE.Group();
  box(2.6, 0.45, 1.6, m.white, -4.6, 0.06, -3.25, bed);
  box(0.5, 0.18, 1.2, m.grey, -5.6, 0.51, -3.25, bed);
  box(1.6, 0.06, 1.62, m.grey, -3.9, 0.51, -3.25, bed);
  group.add(bed);
  station(bed, "bed");
  box(0.6, 0.55, 0.6, m.dark, -5.8, 0.06, -1.9, group);
  cylinder(0.05, 0.5, m.white, -5.8, 0.61, -1.9, group, 8);
  const lampShade = cylinder(0.24, 0.26, m.white, -5.8, 1.08, -1.9, group, 16);
  // Bathroom.
  const sink = new THREE.Group();
  box(1.3, 0.9, 0.6, m.white, 1.4, 0.06, -4.15, sink);
  box(0.9, 0.7, 0.04, m.grey, 1.4, 1.35, -4.45, sink);
  group.add(sink);
  station(sink, "sink");
  const tub = new THREE.Group();
  box(2.4, 0.55, 1.4, m.white, 4.5, 0.06, -3.35, tub);
  box(2.1, 0.06, 1.1, m.black, 4.5, 0.58, -3.35, tub);
  group.add(tub);
  station(tub, "tub");
  // Kitchen.
  const counter = new THREE.Group();
  box(0.9, 0.95, 3.2, m.white, 5.55, 0.06, 0.25, counter);
  group.add(counter);
  station(counter, "stove");
  const pan = cylinder(0.26, 0.08, m.black, 5.45, 1.01, -0.5, group, 20);
  station(pan, "stove");
  const basin = box(0.6, 0.04, 0.7, m.black, 5.5, 0.99, 1.05, group);
  station(basin, "kitchen-sink");
  // Dining table.
  const table = new THREE.Group();
  cylinder(0.75, 0.08, m.white, 2.1, 0.74, 0.05, table, 32);
  cylinder(0.1, 0.74, m.grey, 2.1, 0.0, 0.05, table, 10, null);
  cylinder(0.2, 0.03, m.black, 2.1, 0.82, 0.35, table, 20, null);
  group.add(table);
  station(table, "table");
  // Study.
  const desk = new THREE.Group();
  box(1.9, 0.08, 0.9, m.white, -4.1, 0.78, 1.25, desk);
  [-0.85, 0.85].forEach((dx) => box(0.08, 0.78, 0.8, m.grey, -4.1 + dx, 0.06, 1.25, desk));
  box(0.7, 0.04, 0.45, m.black, -4.1, 0.86, 1.15, desk);
  const screen = box(0.7, 0.45, 0.03, m.black, -4.1, 0.88, 1.38, desk, m.edgeBright);
  screen.rotation.x = -0.25;
  [0, 1, 2].forEach((i) => box(0.42, 0.07, 0.3, i % 2 ? m.grey : m.white, -4.8, 0.86 + i * 0.075, 1.35, desk));
  group.add(desk);
  station(desk, "desk");
  const shelf = box(0.45, 1.9, 1.8, m.dark, -6.05, 0.06, -0.35, group);
  [0.5, 1.0, 1.5].forEach((y) => box(0.47, 0.04, 1.82, m.grey, -6.05, y, -0.35, group));
  station(shelf, "desk");
  // Sofa facing into the room.
  const sofa = new THREE.Group();
  box(2.0, 0.4, 0.8, m.grey, -1.3, 0.06, 1.35, sofa);
  box(2.0, 0.55, 0.22, m.grey, -1.3, 0.46, 1.68, sofa);
  [-1, 1].forEach((side) => box(0.22, 0.32, 0.8, m.grey, -1.3 + side * 0.98, 0.46, 1.35, sofa));
  group.add(sofa);
  station(sofa, "sofa");

  // Front yard: fence with a gate, mailbox, a tree, a discipline sign.
  const fence: THREE.Vector3[] = [];
  const rail = (x0: number, z0: number, x1: number, z1: number) => {
    const steps = Math.max(1, Math.round(Math.hypot(x1 - x0, z1 - z0) / 0.5));
    for (let i = 0; i <= steps; i++) {
      const x = x0 + ((x1 - x0) * i) / steps;
      const z = z0 + ((z1 - z0) * i) / steps;
      fence.push(new THREE.Vector3(x, 0, z), new THREE.Vector3(x, 0.55, z));
    }
    fence.push(new THREE.Vector3(x0, 0.45, z0), new THREE.Vector3(x1, 0.45, z1));
    fence.push(new THREE.Vector3(x0, 0.2, z0), new THREE.Vector3(x1, 0.2, z1));
  };
  rail(-6.85, 2.2, -6.85, GATE.z);
  rail(6.85, 2.2, 6.85, GATE.z);
  rail(-6.85, GATE.z, GATE.x0, GATE.z);
  rail(GATE.x1, GATE.z, 6.85, GATE.z);
  group.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(fence), new THREE.LineBasicMaterial({ color: 0x9a9aa0 })));
  const mailbox = new THREE.Group();
  box(0.1, 1.0, 0.1, m.grey, 4.7, 0, 3.75, mailbox);
  box(0.5, 0.4, 0.7, m.white, 4.7, 1.0, 3.75, mailbox);
  const flag = box(0.04, 0.3, 0.12, m.black, 4.98, 1.2, 3.6, mailbox);
  group.add(mailbox);
  station(mailbox, "mailbox");
  kit.tree(group, -4.6, 3.6, 1);
  if (!kit.lowDetail) kit.roundTree(group, 5.6, 5.4, 0.8);

  // The sign at the front: discipline level and the resident's name.
  const signGroup = new THREE.Group();
  signGroup.position.set(-2.6, 0, 6.1);
  [-0.85, 0.85].forEach((dx) => box(0.07, 1.3, 0.07, m.grey, dx, 0, 0, signGroup, null));
  kit.sign(
    [
      { text: options.title, size: 30, weight: 800 },
      { text: `DISCIPLINE · LVL ${options.level}`, size: 16, mono: true, weight: 500 },
      { text: options.name.toUpperCase(), size: 16, mono: true, weight: 500, color: "#9a9aa0" },
    ],
    2.2,
    0.95,
    signGroup,
    0,
    1.55,
    0.05,
    0,
    { background: rocky ? "#f2f2f2" : "#050506", border: rocky ? null : "#f2f2f2" },
  );
  if (rocky) {
    // Rocky's sign is inverted: white panel, dark text.
    const mesh = signGroup.children[signGroup.children.length - 1] as THREE.Mesh;
    const material = mesh.material as THREE.MeshBasicMaterial;
    material.map = kit.textTexture(
      [
        { text: options.title, size: 30, weight: 800, color: "#050506" },
        { text: `DISCIPLINE · LVL ${options.level}`, size: 16, mono: true, weight: 500, color: "#050506" },
        { text: options.name.toUpperCase(), size: 16, mono: true, weight: 500, color: "#55555c" },
      ],
      282,
      122,
      { background: "#f2f2f2", border: null },
    );
  }
  group.add(signGroup);

  // Each resident's tell.
  if (options.tell === "rocky") {
    // The bus stop on the pavement outside Rocky's gate.
    const shelter = new THREE.Group();
    box(2.4, 0.08, 0.9, m.white, 3.4, 1.9, 6.95, shelter);
    box(0.08, 1.9, 0.08, m.grey, 2.3, 0, 6.6, shelter);
    box(0.08, 1.9, 0.08, m.grey, 4.5, 0, 6.6, shelter);
    box(2.2, 1.5, 0.05, m.dark, 3.4, 0.35, 6.58, shelter, m.edgeBright);
    box(1.6, 0.1, 0.35, m.white, 3.4, 0.45, 6.8, shelter);
    box(0.06, 2.3, 0.06, m.grey, 5.2, 0, 7.15, shelter);
    const busSign = new THREE.Mesh(new THREE.CircleGeometry(0.3, 24), m.white);
    busSign.position.set(5.2, 2.35, 7.18);
    shelter.add(busSign);
    group.add(shelter);
    station(shelter, "bus");
  } else if (options.tell === "ferris") {
    // A "TOMORROW" note by the door and dishes piling up.
    kit.sign([{ text: "TOMORROW", size: 22, weight: 800, color: "#050506" }], 0.9, 0.4, group, 3.6, 0.95, 2.1, 0, { background: "#f2f2f2", border: null });
    for (let i = 0; i < 6; i++) cylinder(0.22, 0.04, i % 2 ? m.white : m.grey, 5.45 + Math.sin(i) * 0.03, 1.0 + i * 0.05, 1.05, group, 14, null);
  } else if (options.tell === "koushik") {
    // Letters overflowing from the mailbox, pizza boxes by the bed.
    for (let i = 0; i < 9; i++) {
      const letter = box(0.35, 0.02, 0.22, m.white, 4.4 + Math.sin(i * 2.3) * 0.5, 0.04 + (i % 3) * 0.02, 4.1 + Math.cos(i * 1.7) * 0.5, group, null, false);
      letter.rotation.y = i * 0.7;
    }
    [0, 1, 2].forEach((i) => {
      const pizza = box(0.6, 0.06, 0.6, m.grey, -2.4 + i * 0.12, 0.06 + i * 0.065, -2.0 - i * 0.05, group);
      pizza.rotation.y = i * 0.4;
    });
  } else if (options.tell === "flash") {
    // Half-finished things everywhere.
    [
      [-3.0, -1.0],
      [0.8, -1.6],
      [3.6, 1.6],
      [-5.0, -0.4],
    ].forEach(([x, z], i) => {
      const thing = box(0.4, 0.3, 0.4, i % 2 ? m.white : m.grey, x, 0.06, z, group);
      thing.rotation.set(0.2 * i, i, 0.15);
    });
  } else if (options.tell === "nina") {
    // Perfectly aligned bottles on the bathroom counter.
    for (let i = 0; i < 5; i++) cylinder(0.05, 0.22, m.white, 0.95 + i * 0.22, 0.96, -4.3, group, 10, null);
  } else if (options.tell === "gollum") {
    // A charging cable and a second phone left on the table.
    box(0.14, 0.02, 0.26, m.black, 2.4, 0.83, -0.2, group, m.edgeBright, false);
  }

  // Tag everything with the house index so clicking anywhere on the plot can visit it.
  group.traverse((child) => (child.userData.house = options.index));
  return { group, interactive, lampShade, flag };
}
