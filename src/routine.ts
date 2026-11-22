/**
 * The daily routine and its rules. Each task is its own island on the ring, in this order.
 * Edit TASKS to change the day; the world, the dock and the streak all follow from it.
 */

export type TaskKind = "check" | "parts" | "count";
export type TaskIcon =
  | "brush"
  | "pan"
  | "book"
  | "drop"
  | "egg"
  | "case"
  | "plane"
  | "cube"
  | "plate"
  | "bowl"
  | "chip"
  | "moon";

export type Task = {
  id: string;
  /** Short name for the path list. */
  name: string;
  /** Headline in the dock. */
  title: string;
  detail: string;
  kind: TaskKind;
  icon: TaskIcon;
  /** Bonus work: you can walk past it, but doing it shines brighter. */
  optional?: boolean;
  parts?: string[];
  /** For counters: the number that completes the task, and the stretch goal. */
  target?: number;
  max?: number;
  /** Time window in minutes after midnight (values past 24:00 reach into the night). */
  opensAt?: number;
  closesAt?: number;
};

export type Vow = { id: string; label: string; opensAt: number };

export const TASKS: Task[] = [
  {
    id: "brush-am",
    name: "brush",
    title: "Brush your teeth.",
    detail: "Start the day clean.",
    kind: "check",
    icon: "brush",
  },
  {
    id: "cook",
    name: "cook",
    title: "Cook food as per diet.",
    detail: "Make the food your plan says, not the food you feel like.",
    kind: "check",
    icon: "pan",
  },
  {
    id: "study-am",
    name: "revise",
    title: "Study or revise.",
    detail: "Only if time remains. A bonus, not a blocker.",
    kind: "check",
    icon: "book",
    optional: true,
  },
  {
    id: "bath-am",
    name: "bath",
    title: "Take a bath.",
    detail: "Reset the body before the day starts.",
    kind: "check",
    icon: "drop",
  },
  {
    id: "breakfast",
    name: "breakfast",
    title: "Breakfast.",
    detail: "Tick each one as it goes down.",
    kind: "parts",
    icon: "egg",
    parts: ["2 eggs", "Protein shake", "Multivitamin"],
  },
  {
    id: "work",
    name: "work",
    title: "Head to work.",
    detail: "Show up. That’s half of it.",
    kind: "check",
    icon: "case",
  },
  {
    id: "study",
    name: "study",
    title: "Start studying.",
    detail: "Sit down and open the material. Begin.",
    kind: "check",
    icon: "book",
  },
  {
    id: "jobs",
    name: "apply",
    title: "Apply to jobs.",
    detail: "5 is the line. 10 is the stretch.",
    kind: "count",
    icon: "plane",
    target: 5,
    max: 10,
  },
  {
    id: "build",
    name: "build",
    title: "Build something you learnt.",
    detail: "If there’s time. Turn today’s learning into something real.",
    kind: "check",
    icon: "cube",
    optional: true,
  },
  {
    id: "dishes",
    name: "dishes",
    title: "Clean the dishes.",
    detail: "Leave nothing for tomorrow-you.",
    kind: "check",
    icon: "plate",
  },
  { id: "bath-pm", name: "bath", title: "Take a bath.", detail: "Wash the day off.", kind: "check", icon: "drop" },
  { id: "dinner", name: "dinner", title: "Have dinner.", detail: "Eat to the plan.", kind: "check", icon: "bowl" },
  {
    id: "tech",
    name: "tech",
    title: "Work on something technical.",
    detail: "Even 30 focused minutes counts.",
    kind: "check",
    icon: "chip",
  },
  {
    id: "brush-pm",
    name: "brush",
    title: "Brush before sleep.",
    detail: "Close the day clean.",
    kind: "check",
    icon: "brush",
  },
  {
    id: "sleep",
    name: "sleep",
    title: "Lights out.",
    detail: "Aim for 10. Never past 11.",
    kind: "check",
    icon: "moon",
    opensAt: 20 * 60 + 30,
    closesAt: 23 * 60,
  },
];

/** Held all day, sealed at night. A slip is logged honestly and breaks the streak. */
export const VOWS: Vow[] = [
  { id: "no-porn", label: "No porn", opensAt: 20 * 60 },
  { id: "no-alcohol", label: "No alcohol", opensAt: 20 * 60 },
];

export const LIGHTS_OUT = 23 * 60;

export type DayRecord = {
  done: string[];
  counts: Record<string, number>;
  parts: Record<string, number[]>;
  slipped: string[];
  complete?: boolean;
};

export const emptyDay = (): DayRecord => ({ done: [], counts: {}, parts: {}, slipped: [] });

/** The day turns over at 4 AM, so a late night still belongs to the day it started in. */
const DAY_START_HOUR = 4;

export function dayKey(date: Date) {
  const shifted = new Date(date.getTime() - DAY_START_HOUR * 3600_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${shifted.getFullYear()}-${pad(shifted.getMonth() + 1)}-${pad(shifted.getDate())}`;
}

/** Minutes since midnight, with the small hours counted as past 24:00. */
export function dayMinutes(date: Date) {
  const minutes = date.getHours() * 60 + date.getMinutes();
  return date.getHours() < DAY_START_HOUR ? minutes + 24 * 60 : minutes;
}

export function formatMinutes(minutes: number) {
  const h24 = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  const suffix = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 || 12;
  return m ? `${h12}:${String(m).padStart(2, "0")} ${suffix}` : `${h12} ${suffix}`;
}

export type Timing = "open" | "early" | "missed";
export function timing(item: { opensAt?: number; closesAt?: number }, minutes: number): Timing {
  if (item.opensAt !== undefined && minutes < item.opensAt) return "early";
  if (item.closesAt !== undefined && minutes > item.closesAt) return "missed";
  return "open";
}

export const isDone = (record: DayRecord, id: string) => record.done.includes(id);
export const REQUIRED = TASKS.filter((task) => !task.optional);

/** The furthest island you may walk to: the first required task not yet done. */
export function unlockedIndex(record: DayRecord) {
  const open = TASKS.findIndex((task) => !task.optional && !isDone(record, task.id));
  return open < 0 ? TASKS.length - 1 : open;
}

export function dayComplete(record: DayRecord) {
  return (
    record.slipped.length === 0 &&
    REQUIRED.every((task) => isDone(record, task.id)) &&
    VOWS.every((vow) => isDone(record, vow.id))
  );
}

const STORAGE_KEY = "stride.days.v3";

export function loadHistory(): Record<string, DayRecord> {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
    if (!saved || typeof saved !== "object" || Array.isArray(saved)) return {};
    const history: Record<string, DayRecord> = {};
    for (const [key, value] of Object.entries(saved as Record<string, Partial<DayRecord>>)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(key) || !value || typeof value !== "object") continue;
      history[key] = {
        done: Array.isArray(value.done) ? value.done.filter((id) => typeof id === "string") : [],
        counts: value.counts && typeof value.counts === "object" ? value.counts : {},
        parts: value.parts && typeof value.parts === "object" ? value.parts : {},
        slipped: Array.isArray(value.slipped) ? value.slipped.filter((id) => typeof id === "string") : [],
        complete: value.complete === true,
      };
    }
    return history;
  } catch {
    return {};
  }
}

export function saveHistory(history: Record<string, DayRecord>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  } catch {
    // Storage can be unavailable (private mode, blocked site data); progress then lasts the visit.
  }
}

/** Consecutive complete days, ending today if today is complete, otherwise yesterday. */
export function streak(history: Record<string, DayRecord>, today: string) {
  const cursor = new Date(`${today}T12:00:00`);
  if (!history[today]?.complete) cursor.setDate(cursor.getDate() - 1);
  let count = 0;
  for (;;) {
    const pad = (n: number) => String(n).padStart(2, "0");
    const key = `${cursor.getFullYear()}-${pad(cursor.getMonth() + 1)}-${pad(cursor.getDate())}`;
    if (!history[key]?.complete) return count;
    count++;
    cursor.setDate(cursor.getDate() - 1);
  }
}

// ---------- History helpers for the streak calendar ----------

const pad2 = (n: number) => String(n).padStart(2, "0");
export const keyOf = (date: Date) => `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
/** Noon on that day, so adding days never trips over daylight-saving changes. */
export const dateOf = (key: string) => new Date(`${key}T12:00:00`);
export function addDays(key: string, days: number) {
  const date = dateOf(key);
  date.setDate(date.getDate() + days);
  return keyOf(date);
}

/** Every promise counted for a day: required tasks plus the vows. */
export const PROMISES = REQUIRED.length + VOWS.length;

/** Share of the day's promises kept, 0..1. */
export function dayScore(record: DayRecord | undefined) {
  if (!record) return 0;
  const kept =
    REQUIRED.filter((task) => isDone(record, task.id)).length + VOWS.filter((vow) => isDone(record, vow.id)).length;
  return kept / PROMISES;
}

/** Longest run of consecutive complete days anywhere in the history. */
export function bestStreak(history: Record<string, DayRecord>) {
  const complete = Object.keys(history)
    .filter((key) => history[key].complete)
    .sort();
  let best = 0;
  let run = 0;
  let previous = "";
  for (const key of complete) {
    run = previous && addDays(previous, 1) === key ? run + 1 : 1;
    best = Math.max(best, run);
    previous = key;
  }
  return best;
}

/** The first day anything was recorded, so stats never count days before you started. */
export function firstDay(history: Record<string, DayRecord>, today: string) {
  const keys = Object.keys(history).sort();
  return keys[0] && keys[0] < today ? keys[0] : today;
}
