import * as THREE from "three";
import { type Pose, cheerPose, createFigure, idlePose, walkPose } from "../figure";
import { DOOR, GATE, PLOT, STATIONS, type StationDef, type Tell } from "./house";

/**
 * The 13 tasks on every resident's board. A fixed demo for the lock screen: it never shows the
 * signed-in user's own routine, so nothing private is visible on a locked screen.
 */
const BOARD_TASKS: { id: string; title: string }[] = [
  { id: "brush-am", title: "Brush your teeth" },
  { id: "cook", title: "Cook food as per diet" },
  { id: "bath-am", title: "Take a bath" },
  { id: "breakfast", title: "Breakfast" },
  { id: "work", title: "Head to work" },
  { id: "study", title: "Start studying" },
  { id: "jobs", title: "Apply to jobs" },
  { id: "dishes", title: "Clean the dishes" },
  { id: "bath-pm", title: "Take a bath" },
  { id: "dinner", title: "Have dinner" },
  { id: "tech", title: "Work on something technical" },
  { id: "brush-pm", title: "Brush before sleep" },
  { id: "sleep", title: "Lights out" },
];

/*
 * The six residents. Everyone has the same 13 demo tasks (BOARD_TASKS);
 * Rocky does them all, the neighbours show the ways people slip. Each resident runs a
 * looping script of steps; Rocky can also be steered by the player.
 */

export type ActionPose =
  | "idle"
  | "brush"
  | "cook"
  | "bath"
  | "eat"
  | "wait"
  | "type"
  | "mail"
  | "dishes"
  | "sleep"
  | "snooze"
  | "lounge"
  | "phone"
  | "sitphone"
  | "straighten"
  | "wave"
  | "shrug";

export type Step = {
  at: string;
  pose: ActionPose;
  duration: number;
  caption: string;
  /** Mark a task done (or undone, or half-done) when the step finishes. */
  tick?: string;
  untick?: string;
  half?: string;
  /** Walking speed multiplier for this step (rushing, or running around). */
  speed?: number;
  /** Clear the checklist when this step starts: a new day. */
  reset?: boolean;
};

export type ResidentDef = {
  tell: Tell;
  name: string;
  title: string;
  level: number;
  tone: "white" | "grey";
  script: Step[];
};

const s = (at: string, pose: ActionPose, duration: number, caption: string, extra: Partial<Step> = {}): Step => ({
  at,
  pose,
  duration,
  caption,
  ...extra,
});

export const RESIDENTS: ResidentDef[] = [
  {
    tell: "rocky",
    name: "Rocky",
    title: "DISCIPLINED",
    level: 10,
    tone: "white",
    script: [
      s("sink", "brush", 4.5, "Brushing his teeth", { tick: "brush-am", reset: true }),
      s("stove", "cook", 5, "Cooking to his diet", { tick: "cook" }),
      s("tub", "bath", 4.5, "Morning bath", { tick: "bath-am" }),
      s("table", "eat", 4.5, "Breakfast: eggs, shake, multivitamin", { tick: "breakfast" }),
      s("bus", "wait", 6, "Heading to work", { tick: "work" }),
      s("desk", "type", 5, "Studying", { tick: "study" }),
      s("mailbox", "mail", 5.5, "Sending job applications", { tick: "jobs" }),
      s("kitchen-sink", "dishes", 4.5, "Washing the dishes", { tick: "dishes" }),
      s("tub", "bath", 4, "Evening bath", { tick: "bath-pm" }),
      s("table", "eat", 4.5, "Dinner", { tick: "dinner" }),
      s("desk", "type", 5, "Building something technical", { tick: "tech" }),
      s("sink", "brush", 4, "Brushing before bed", { tick: "brush-pm" }),
      s("bed", "sleep", 8, "Lights out. Every promise kept.", { tick: "sleep" }),
    ],
  },
  {
    tell: "ferris",
    name: "Ferris",
    title: "PROCRASTINATOR",
    level: 3,
    tone: "grey",
    script: [
      s("sofa", "lounge", 7, "Five more minutes on the sofa…", { reset: true }),
      s("kitchen-sink", "idle", 1.6, "Looks at the dishes…"),
      s("sofa", "lounge", 6, "…they can wait."),
      s("desk", "idle", 1.6, "Opens the laptop…"),
      s("sofa", "lounge", 6, "…later."),
      s("mailbox", "idle", 1.4, "Thinks about applying…"),
      s("sofa", "lounge", 7, "…next week, maybe."),
      s("sink", "brush", 2, "Panics. Rushes his teeth.", { tick: "brush-am", speed: 2.2 }),
      s("stove", "cook", 2, "Rushes a meal, badly.", { tick: "cook", speed: 2.2 }),
      s("bed", "sleep", 7, "“Tomorrow will be different.”"),
    ],
  },
  {
    tell: "gollum",
    name: "Gollum",
    title: "DISTRACTED",
    level: 2,
    tone: "grey",
    script: [
      s("table", "phone", 8, "Scrolling… my precious.", { reset: true }),
      s("sink", "brush", 1.6, "Starts brushing—", { tick: "brush-am" }),
      s("sink", "phone", 6, "*buzz* …back to the phone."),
      s("stove", "cook", 1.4, "Starts cooking—"),
      s("stove", "phone", 7, "*buzz* …scrolling again."),
      s("desk", "type", 1.2, "Opens his notes—"),
      s("desk", "phone", 8, "*buzz* …gone for an hour."),
      s("sofa", "sitphone", 9, "Still scrolling at midnight."),
    ],
  },
  {
    tell: "koushik",
    name: "Koushik",
    title: "LAZY",
    level: 1,
    tone: "grey",
    script: [
      s("bed", "sleep", 9, "Asleep.", { reset: true }),
      s("bed", "snooze", 1.8, "Alarm. Snooze."),
      s("bed", "sleep", 8, "Asleep again."),
      s("bed", "snooze", 1.8, "Snooze. Again."),
      s("stove", "idle", 2.5, "Shuffles to the fridge."),
      s("sofa", "lounge", 10, "The couch. Snacks. Nothing else."),
      s("bed", "sleep", 10, "Back to bed. The mail can wait."),
    ],
  },
  {
    tell: "flash",
    name: "Flash",
    title: "SCATTERED",
    level: 4,
    tone: "grey",
    script: [
      ["sink", "brush", "brush-am", "brushing"],
      ["desk", "type", "study", "studying"],
      ["kitchen-sink", "dishes", "dishes", "the dishes"],
      ["tub", "bath", "bath-am", "a bath"],
      ["stove", "cook", "cook", "cooking"],
      ["mailbox", "mail", "jobs", "applying"],
      ["table", "eat", "breakfast", "breakfast"],
      ["desk", "type", "tech", "a side project"],
    ].map(([at, pose, task, label], i): Step =>
      s(at, pose as ActionPose, 1.1, `Starts ${label}— switches.`, { half: task, speed: 2.8, reset: i === 0 }),
    ),
  },
  {
    tell: "nina",
    name: "Nina",
    title: "PERFECTIONIST",
    level: 5,
    tone: "grey",
    script: [
      s("sink", "brush", 4.5, "Brushing. Carefully.", { tick: "brush-am", reset: true }),
      s("sink", "straighten", 2.4, "Not perfect. Again.", { untick: "brush-am" }),
      s("sink", "brush", 4.5, "Brushing. Precisely.", { tick: "brush-am" }),
      s("sink", "straighten", 2.4, "Still not perfect.", { untick: "brush-am" }),
      s("tub", "idle", 1.4, "Considers moving on…"),
      s("sink", "brush", 4.5, "…brushes again instead.", { tick: "brush-am" }),
      s("sink", "straighten", 2.4, "Redo.", { untick: "brush-am" }),
    ],
  },
];

/** Task poses: small loops layered on the idle pose. */
export function actionPose(action: ActionPose, t: number): Pose {
  const p = idlePose(t);
  const sin = Math.sin;
  const sitting: Pose = {
    ...p,
    pelvisY: 0.42,
    spine: -0.3,
    head: 0.05,
    hipL: -1.45,
    hipR: -1.45,
    liftL: 0,
    liftR: 0,
    shL: -0.3,
    elL: -0.6,
    zL: -0.35,
    shR: -0.3,
    elR: -0.6,
    zR: 0.35,
  };
  switch (action) {
    case "brush":
      return { ...p, shR: -2.05, elR: -2.05, zR: 0.28 + sin(t * 15) * 0.12, head: -0.08 };
    case "cook":
      return {
        ...p,
        spine: 0.15,
        shR: -1.0 + sin(t * 4) * 0.15,
        elR: -0.9,
        zR: 0.12 + Math.cos(t * 4) * 0.28,
        shL: -0.7,
        elL: -1.2,
        zL: -0.05,
      };
    case "bath":
      return {
        ...p,
        shL: -1.6 + sin(t * 6) * 0.45,
        elL: -1.6,
        zL: 0.35,
        shR: -1.6 + Math.cos(t * 6) * 0.45,
        elR: -1.6,
        zR: -0.35,
      };
    case "eat": {
      const k = (sin(t * 2.2) + 1) / 2;
      return { ...p, shR: -0.6 - k * 1.55, elR: -0.5 - k * 1.6, zR: 0.1, shL: -0.5, elL: -1.0 };
    }
    case "wait":
      return { ...p, shL: -1.25, elL: -1.55, zL: 0.35, head: 0.28 + sin(t * 0.8) * 0.05, shR: -0.05, elR: -0.25 };
    case "type":
      return {
        ...p,
        spine: 0.22,
        head: 0.18,
        shL: -1.05 + sin(t * 12) * 0.06,
        shR: -1.05 + Math.cos(t * 13) * 0.06,
        elL: -0.55,
        elR: -0.55,
        zL: 0.12,
        zR: -0.12,
      };
    case "mail":
      return {
        ...p,
        spine: 0.08,
        shR: -1.45 + sin(t * 3.1) * 0.12,
        elR: -0.25 + sin(t * 3.1) * 0.3,
        zR: 0.05,
        shL: -0.2,
        elL: -0.4,
      };
    case "dishes":
      return {
        ...p,
        spine: 0.2,
        shL: -0.9 + sin(t * 8) * 0.15,
        elL: -0.85,
        zL: 0.15,
        shR: -0.9 + Math.cos(t * 8) * 0.15,
        elR: -0.85,
        zR: -0.15,
      };
    case "snooze":
      return { ...p, shR: -2.4 + Math.abs(sin(t * 6)) * 0.6, elR: -0.3, zR: 0.2 };
    case "lounge":
      return { ...sitting, head: 0.05 + sin(t * 0.6) * 0.04 };
    case "phone":
      return { ...p, spine: 0.14, head: 0.5, shL: -1.25, elL: -1.75, zL: 0.28, shR: -1.25, elR: -1.75, zR: -0.28 };
    case "sitphone":
      return {
        ...sitting,
        spine: -0.1,
        head: 0.5,
        shL: -1.15,
        elL: -1.75,
        zL: 0.28,
        shR: -1.15,
        elR: -1.75,
        zR: -0.28,
      };
    case "straighten":
      return {
        ...p,
        spine: 0.25,
        head: 0.35 + sin(t * 1.5) * 0.05,
        shR: -0.95 + sin(t * 2.4) * 0.05,
        elR: -1.1,
        zR: -0.1,
        shL: -0.7,
        elL: -1.0,
      };
    case "wave":
      return { ...p, shR: -2.8, elR: -0.3, zR: 0.45 + sin(t * 11) * 0.4, head: -0.1 };
    case "shrug":
      return {
        ...p,
        pelvisY: p.pelvisY - 0.02,
        shL: -0.25,
        elL: -1.4,
        zL: -0.7,
        shR: -0.25,
        elR: -1.4,
        zR: 0.7,
        head: 0.25,
      };
    default:
      return p;
  }
}

const turn = (current: number, target: number, amount: number) =>
  current + Math.atan2(Math.sin(target - current), Math.cos(target - current)) * amount;

type Goal = { path: THREE.Vector3[]; station: string | null; step: Step | null; speed: number };
type Activity = { station: string; pose: ActionPose; time: number; duration: number; step: Step | null };

export class Resident {
  readonly def: ResidentDef;
  readonly index: number;
  readonly house: THREE.Group;
  readonly figure: ReturnType<typeof createFigure>;
  readonly root: THREE.Group;
  checklist = new Map<string, number>();
  checklistDirty = true;
  caption = "";
  scripted = true;
  goal: Goal | null = null;
  activity: Activity | null = null;
  emote: { kind: "wave" | "shrug" | "cheer"; time: number; length: number } | null = null;
  moving = false;
  private scriptIndex = -1;
  private walkCycle = 0;
  private lying = 0;
  private jumpHeight = 0;
  private jumpVelocity = 0;
  private facing = 0;
  private offset: number;

  constructor(def: ResidentDef, index: number, house: THREE.Group, scene: THREE.Scene) {
    this.def = def;
    this.index = index;
    this.house = house;
    this.figure = createFigure({ tone: def.tone });
    this.root = this.figure.root;
    this.root.rotation.order = "YXZ";
    this.root.traverse((child) => (child.userData.resident = index));
    scene.add(this.root);
    this.offset = index * 1.7;
    // Start each resident at a different point in their loop so the street feels alive.
    const start = def.script[0];
    const st = this.station(start.at);
    this.root.position.copy(st.stand);
    this.facing = this.root.rotation.y = st.facing;
    this.scriptIndex = ((index * 3) % def.script.length) - 1;
  }

  /** A station's stand point and facing in world space. */
  station(id: string) {
    const def: StationDef = STATIONS[id] ?? STATIONS.gate;
    return {
      stand: this.house.localToWorld(def.stand.clone()),
      facing: def.facing + this.house.rotation.y,
      lie: def.lie
        ? { pos: this.house.localToWorld(def.lie.pos.clone()), facing: def.lie.facing + this.house.rotation.y }
        : null,
    };
  }

  /** Route through the front door (and the gate) when crossing between house, yard and pavement. */
  private route(to: THREE.Vector3) {
    const local = (v: THREE.Vector3) => this.house.worldToLocal(v.clone());
    const from = local(this.root.position);
    const target = local(to);
    const zone = (p: THREE.Vector3) => (p.z < DOOR.z ? 0 : p.z < GATE.z ? 1 : 2);
    const points: THREE.Vector3[] = [];
    const doorX = (DOOR.x0 + DOOR.x1) / 2;
    let z = zone(from);
    const end = zone(target);
    while (z !== end) {
      const line = z < end ? (z === 0 ? DOOR.z : GATE.z) : z === 1 ? DOOR.z : GATE.z;
      const dir = z < end ? 1 : -1;
      points.push(new THREE.Vector3(doorX, 0, line - dir * 0.6), new THREE.Vector3(doorX, 0, line + dir * 0.6));
      z += dir;
    }
    points.push(target);
    return points.map((p) => this.house.localToWorld(p));
  }

  goToStation(id: string, step: Step | null = null, speed = 1) {
    this.activity = null;
    this.goal = { path: this.route(this.station(id).stand), station: id, step, speed };
  }
  goToPoint(point: THREE.Vector3) {
    this.activity = null;
    this.goal = { path: this.route(point), station: null, step: null, speed: 1 };
  }
  jump(power = 5.2) {
    if (this.jumpHeight <= 0.001 && this.lying < 0.1) this.jumpVelocity = power;
  }
  setEmote(kind: "wave" | "shrug" | "cheer", length: number) {
    this.goal = null;
    this.activity = null;
    this.emote = { kind, time: 0, length };
  }

  /** Walk directly (player steering), kept inside the plot and through the door and gate. */
  steer(direction: THREE.Vector3, dt: number) {
    const next = this.root.position.clone().addScaledVector(direction, 2.6 * dt);
    const from = this.house.worldToLocal(this.root.position.clone());
    const to = this.house.worldToLocal(next.clone());
    for (const wall of [DOOR, GATE]) {
      const crossing = (from.z - wall.z) * (to.z - wall.z) <= 0;
      if (crossing && (to.x < wall.x0 + 0.2 || to.x > wall.x1 - 0.2)) to.z = from.z;
    }
    to.x = THREE.MathUtils.clamp(to.x, PLOT.x0, PLOT.x1);
    to.z = THREE.MathUtils.clamp(to.z, PLOT.z0, PLOT.z1);
    to.y = 0;
    this.root.position.copy(this.house.localToWorld(to));
    this.facing = Math.atan2(direction.x, direction.z);
    this.goal = null;
    this.activity = null;
    this.moving = true;
  }

  private setCheck(task: string, value: number) {
    if ((this.checklist.get(task) ?? 0) === value) return;
    this.checklist.set(task, value);
    this.checklistDirty = true;
  }

  private nextStep() {
    const script = this.def.script;
    this.scriptIndex = (this.scriptIndex + 1) % script.length;
    const step = script[this.scriptIndex];
    if (step.reset) {
      this.checklist.clear();
      this.checklistDirty = true;
    }
    this.goToStation(step.at, step, step.speed ?? 1);
  }

  /** Advance one frame. `steering` is true while the player is driving this resident. */
  update(dt: number, t: number, steering = false) {
    const time = t + this.offset;
    if (!steering) this.moving = false;
    if (this.scripted && !this.goal && !this.activity && !this.emote && !steering) this.nextStep();

    if (!steering && this.goal) {
      const target = this.goal.path[0];
      const flat = new THREE.Vector3(target.x - this.root.position.x, 0, target.z - this.root.position.z);
      const distance = flat.length();
      if (distance < 0.06) {
        this.goal.path.shift();
        if (!this.goal.path.length) {
          const { station, step } = this.goal;
          if (station) {
            const st = STATIONS[station];
            this.activity = {
              station,
              pose: step?.pose ?? (station === "bed" ? "sleep" : station === "sofa" ? "lounge" : "idle"),
              time: 0,
              duration: step?.duration ?? 5,
              step,
            };
            if (step) this.caption = step.caption;
            this.root.position.y = st.stand.y;
            if (step?.half) {
              for (const [task, value] of this.checklist) if (value === 0.5) this.setCheck(task, 0);
              this.setCheck(step.half, 0.5);
            }
          }
          this.goal = null;
        }
      } else {
        flat.normalize();
        this.root.position.addScaledVector(flat, Math.min(distance, 2.3 * this.goal.speed * dt));
        this.root.position.y += (0 - this.root.position.y) * Math.min(1, dt * 8);
        this.facing = Math.atan2(flat.x, flat.z);
        this.moving = true;
      }
    }

    if (this.jumpVelocity !== 0 || this.jumpHeight > 0) {
      this.jumpVelocity -= 14 * dt;
      this.jumpHeight = Math.max(0, this.jumpHeight + this.jumpVelocity * dt);
      if (this.jumpHeight === 0 && this.jumpVelocity < 0) this.jumpVelocity = 0;
    }

    let pose: Pose = idlePose(time);
    let lie: { pos: THREE.Vector3; facing: number } | null = null;
    if (this.emote) {
      this.emote.time += dt;
      pose =
        this.emote.kind === "cheer"
          ? cheerPose(Math.min(1, (this.emote.time % 1) / 0.9))
          : actionPose(this.emote.kind, time);
      if (this.emote.time > this.emote.length) this.emote = null;
    } else if (this.moving) {
      this.walkCycle += dt * 11 * Math.min(1.6, this.goal?.speed ?? 1);
      pose = walkPose(this.walkCycle, this.jumpHeight > 0.05 ? 0.6 : 0);
    } else if (this.activity) {
      const a = this.activity;
      a.time += dt;
      const st = this.station(a.station);
      this.facing = st.facing;
      if (a.pose === "sleep" || a.pose === "snooze") lie = st.lie;
      pose = actionPose(a.pose, time);
      if (a.time > a.duration) {
        const step = a.step;
        if (step?.tick) this.setCheck(step.tick, 1);
        if (step?.untick) this.setCheck(step.untick, 0);
        if (step?.half) this.setCheck(step.half, 0);
        this.activity = null;
      }
    }

    // Lying down on the bed and getting up again.
    this.lying += ((lie ? 1 : 0) - this.lying) * Math.min(1, dt * 3);
    if (lie) {
      this.facing = lie.facing;
      this.root.position.x += (lie.pos.x - this.root.position.x) * Math.min(1, dt * 3);
      this.root.position.z += (lie.pos.z - this.root.position.z) * Math.min(1, dt * 3);
    }
    const standY = this.activity ? this.station(this.activity.station).stand.y : this.moving ? this.root.position.y : 0;
    this.root.rotation.x = -this.lying * (Math.PI / 2);
    this.root.rotation.y = turn(this.root.rotation.y, this.facing, Math.min(1, dt * (this.moving ? 12 : 6)));
    this.root.position.y = THREE.MathUtils.lerp(standY, lie ? lie.pos.y : 0.55, this.lying) + this.jumpHeight;
    this.figure.apply(pose, 1 - Math.exp(-dt * 12));
  }

  get pose() {
    return this.emote?.kind ?? this.activity?.pose ?? (this.moving ? "walk" : "idle");
  }
  get isLying() {
    return this.lying > 0.5;
  }
  get score() {
    return BOARD_TASKS.filter((task) => this.checklist.get(task.id) === 1).length;
  }
}

/** Draw a resident's checklist board: name, discipline level, the 13 tasks and a score. */
export function drawBoard(canvas: HTMLCanvasElement, resident: Resident) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;
  const hero = resident.def.tell === "rocky";
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = hero ? "#f2f2f2" : "#0b0b0d";
  ctx.strokeStyle = hero ? "#f2f2f2" : "#6a6a72";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.roundRect(4, 4, w - 8, h - 8, 18);
  ctx.fill();
  ctx.stroke();
  const ink = hero ? "#050506" : "#f2f2f2";
  const soft = hero ? "#55555c" : "#8a8a92";
  ctx.fillStyle = ink;
  ctx.textAlign = "left";
  ctx.font = "800 34px Manrope, 'DM Sans', sans-serif";
  ctx.fillText(resident.def.name, 22, 52);
  ctx.font = "500 15px 'IBM Plex Mono', monospace";
  ctx.fillStyle = soft;
  ctx.fillText(`${resident.def.title} · LVL ${resident.def.level}`, 22, 78);
  ctx.fillRect(22, 92, w - 44, 2);
  BOARD_TASKS.forEach((task, i) => {
    const y = 112 + i * 29;
    const value = resident.checklist.get(task.id) ?? 0;
    ctx.strokeStyle = ink;
    ctx.lineWidth = 2;
    ctx.strokeRect(24, y, 18, 18);
    if (value === 1) {
      ctx.fillStyle = ink;
      ctx.fillRect(24, y, 18, 18);
      ctx.strokeStyle = hero ? "#f2f2f2" : "#0b0b0d";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(28, y + 9);
      ctx.lineTo(32, y + 14);
      ctx.lineTo(39, y + 4);
      ctx.stroke();
    } else if (value === 0.5) {
      ctx.fillStyle = ink;
      ctx.fillRect(24, y, 9, 18);
    }
    ctx.fillStyle = value === 1 ? ink : soft;
    ctx.font = `${value === 1 ? 600 : 400} 17px 'DM Sans', sans-serif`;
    ctx.fillText(task.title.replace(/\.$/, ""), 54, y + 15);
  });
  const done = resident.score;
  const y = 112 + BOARD_TASKS.length * 29 + 14;
  ctx.fillStyle = ink;
  ctx.fillRect(22, y - 6, w - 44, 2);
  ctx.font = "800 40px Manrope, 'DM Sans', sans-serif";
  ctx.fillText(`${done}/${BOARD_TASKS.length}`, 22, y + 40);
  ctx.font = "500 14px 'IBM Plex Mono', monospace";
  ctx.fillStyle = soft;
  ctx.textAlign = "right";
  ctx.fillText(
    done === BOARD_TASKS.length ? "EVERY PROMISE KEPT" : done === 0 ? "NOTHING DONE" : "PROMISES KEPT",
    w - 22,
    y + 34,
  );
}
