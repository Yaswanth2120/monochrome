/**
 * The daily routine and its rules. Each task is its own island on the ring, in this order.
 * A routine is data: every user edits their own in Settings, and the world, the dock, the
 * calendar and the streak all follow from it. DEFAULT_ROUTINE is what a new account starts with.
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

export type Routine = { tasks: Task[]; vows: Vow[] };

export const TASK_ICONS: TaskIcon[] = [
  "brush",
  "pan",
  "book",
  "drop",
  "egg",
  "case",
  "plane",
  "cube",
  "plate",
  "bowl",
  "chip",
  "moon",
];
export const LIMITS = {
  tasks: 24,
  vows: 6,
  parts: 8,
  title: 60,
  name: 14,
  detail: 120,
  part: 40,
  label: 40,
  count: 99,
};

/**
 * The sample routine every new account starts with. It's meant to be edited in Settings, and it
 * shows off each kind of task: plain holds, steps, a counter, bonus tasks and a timed lights-out.
 */
const DEFAULT_TASKS: Task[] = [
  {
    id: "brush-am",
    name: "brush",
    title: "Brush your teeth.",
    detail: "Start the day clean.",
    kind: "check",
    icon: "brush",
  },
  {
    id: "water",
    name: "water",
    title: "Drink a glass of water.",
    detail: "Before coffee, before the phone.",
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
    parts: ["Something with protein", "A piece of fruit", "Vitamins"],
  },
  {
    id: "plan",
    name: "plan",
    title: "Plan the day.",
    detail: "Write down the one thing that matters most today.",
    kind: "check",
    icon: "book",
  },
  {
    id: "deep-work",
    name: "work",
    title: "Do the most important thing.",
    detail: "The task you wrote down, before anything else.",
    kind: "check",
    icon: "case",
  },
  {
    id: "outreach",
    name: "reach",
    title: "Reach out.",
    detail: "Messages, applications, follow-ups. 3 is the line, 5 is the stretch.",
    kind: "count",
    icon: "plane",
    target: 3,
    max: 5,
  },
  {
    id: "learn",
    name: "learn",
    title: "Learn something new.",
    detail: "If there's time. Twenty minutes on a skill you're building.",
    kind: "check",
    icon: "chip",
    optional: true,
  },
  {
    id: "cook",
    name: "cook",
    title: "Cook a proper meal.",
    detail: "Food you planned, not food you grabbed.",
    kind: "check",
    icon: "pan",
  },
  {
    id: "move",
    name: "move",
    title: "Move for 30 minutes.",
    detail: "A walk, a run, the gym. Anything that gets the heart going.",
    kind: "check",
    icon: "cube",
  },
  {
    id: "dishes",
    name: "dishes",
    title: "Clean up the kitchen.",
    detail: "Leave nothing for tomorrow-you.",
    kind: "check",
    icon: "plate",
  },
  { id: "dinner", name: "dinner", title: "Have dinner.", detail: "Eat to the plan.", kind: "check", icon: "bowl" },
  {
    id: "read",
    name: "read",
    title: "Read 10 pages.",
    detail: "A real book, not a feed.",
    kind: "check",
    icon: "book",
    optional: true,
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
    detail: "Aim for 10:30. Never past 11:30.",
    kind: "check",
    icon: "moon",
    opensAt: 21 * 60,
    closesAt: 23 * 60 + 30,
  },
];

/** Held all day, sealed at night. A slip is logged honestly and breaks the streak. */
const DEFAULT_VOWS: Vow[] = [
  { id: "no-phone-in-bed", label: "No phone in bed", opensAt: 20 * 60 },
  { id: "no-junk-food", label: "No junk food", opensAt: 20 * 60 },
];

export const DEFAULT_ROUTINE: Routine = { tasks: DEFAULT_TASKS, vows: DEFAULT_VOWS };

export type DayRecord = {
  done: string[];
  counts: Record<string, number>;
  parts: Record<string, number[]>;
  slipped: string[];
  complete?: boolean;
  /** Promises kept and promised that day, frozen when saved so editing the routine later
   *  never rewrites old scores. Older records without them are scored against today's routine. */
  kept?: number;
  total?: number;
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
export const requiredOf = (routine: Routine) => routine.tasks.filter((task) => !task.optional);
/** Every promise counted for a day: required tasks plus the vows. */
export const promisesOf = (routine: Routine) => requiredOf(routine).length + routine.vows.length;

/** The furthest island you may walk to: the first required task not yet done. */
export function unlockedIndex(record: DayRecord, tasks: Task[]) {
  const open = tasks.findIndex((task) => !task.optional && !isDone(record, task.id));
  return open < 0 ? Math.max(0, tasks.length - 1) : open;
}

export function dayComplete(record: DayRecord, routine: Routine) {
  return (
    record.slipped.length === 0 &&
    requiredOf(routine).every((task) => isDone(record, task.id)) &&
    routine.vows.every((vow) => isDone(record, vow.id))
  );
}

/** Promises kept and promised for a record under a routine. */
export function scoreOf(record: DayRecord, routine: Routine) {
  const kept =
    requiredOf(routine).filter((task) => isDone(record, task.id)).length +
    routine.vows.filter((vow) => isDone(record, vow.id)).length;
  return { kept, total: promisesOf(routine) };
}

/** True once anything at all has been done today; editing the routine then waits until tomorrow. */
export const hasProgress = (record: DayRecord | undefined) =>
  !!record &&
  (record.done.length > 0 ||
    record.slipped.length > 0 ||
    Object.values(record.counts).some((n) => n > 0) ||
    Object.values(record.parts).some((list) => list.length > 0));

const STORAGE_KEY = "stride.days.v3";

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;
export const isDayKey = (key: string) => DAY_KEY.test(key);

/** A clean DayRecord from untrusted data (localStorage or Firestore), or null if it isn't one. */
export function sanitizeDay(value: unknown): DayRecord | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Partial<DayRecord>;
  return {
    done: Array.isArray(v.done) ? v.done.filter((id) => typeof id === "string") : [],
    counts: v.counts && typeof v.counts === "object" ? v.counts : {},
    parts: v.parts && typeof v.parts === "object" ? v.parts : {},
    slipped: Array.isArray(v.slipped) ? v.slipped.filter((id) => typeof id === "string") : [],
    complete: v.complete === true,
    ...(typeof v.kept === "number" && typeof v.total === "number" && v.total > 0
      ? { kept: Math.max(0, Math.min(v.kept, v.total)), total: v.total }
      : {}),
  };
}

export function loadHistory(): Record<string, DayRecord> {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
    if (!saved || typeof saved !== "object" || Array.isArray(saved)) return {};
    const history: Record<string, DayRecord> = {};
    for (const [key, value] of Object.entries(saved as Record<string, unknown>)) {
      const day = isDayKey(key) ? sanitizeDay(value) : null;
      if (day) history[key] = day;
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

/** Share of the day's promises kept, 0..1, using the score frozen into the record when there is one. */
export function dayScore(record: DayRecord | undefined, routine: Routine) {
  if (!record) return 0;
  const { kept, total } = record.total ? { kept: record.kept ?? 0, total: record.total } : scoreOf(record, routine);
  return total ? kept / total : 0;
}

/** "kept/total" for a record, frozen or computed. */
export function scoreLabel(record: DayRecord, routine: Routine) {
  const { kept, total } = record.total ? { kept: record.kept ?? 0, total: record.total } : scoreOf(record, routine);
  return `${kept}/${total}`;
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

// ---------- Routine validation and editing ----------

const ID = /^[a-z0-9-]{1,40}$/;
const str = (value: unknown, max: number) => (typeof value === "string" ? value.trim().slice(0, max) : "");
const int = (value: unknown, min: number, max: number) =>
  typeof value === "number" && Number.isInteger(value) && value >= min && value <= max ? value : undefined;
/** Minutes after midnight, up to 4 AM the next morning (the day turns over at 4). */
const MINUTES_MAX = 28 * 60;

/** A clean Routine from untrusted data (localStorage or Firestore), or null if it isn't one. */
export function sanitizeRoutine(value: unknown): Routine | null {
  if (!value || typeof value !== "object") return null;
  const v = value as { tasks?: unknown; vows?: unknown };
  if (!Array.isArray(v.tasks) || !Array.isArray(v.vows)) return null;
  const seen = new Set<string>();
  const tasks: Task[] = [];
  for (const raw of v.tasks.slice(0, LIMITS.tasks)) {
    const t = raw as Partial<Task>;
    const id = typeof t?.id === "string" && ID.test(t.id) && !seen.has(t.id) ? t.id : null;
    const title = str(t?.title, LIMITS.title);
    if (!id || !title) continue;
    seen.add(id);
    const kind: TaskKind = t.kind === "parts" || t.kind === "count" ? t.kind : "check";
    const task: Task = {
      id,
      name: str(t.name, LIMITS.name) || shortName(title),
      title,
      detail: str(t.detail, LIMITS.detail),
      kind,
      icon: TASK_ICONS.includes(t.icon as TaskIcon) ? (t.icon as TaskIcon) : "cube",
    };
    if (t.optional === true) task.optional = true;
    if (kind === "parts") {
      const parts = Array.isArray(t.parts)
        ? t.parts
            .map((part) => str(part, LIMITS.part))
            .filter(Boolean)
            .slice(0, LIMITS.parts)
        : [];
      if (!parts.length) task.kind = "check";
      else task.parts = parts;
    }
    if (kind === "count") {
      const target = int(t.target, 1, LIMITS.count) ?? 1;
      task.target = target;
      task.max = Math.max(target, int(t.max, 1, LIMITS.count) ?? target);
    }
    const opensAt = int(t.opensAt, 0, MINUTES_MAX);
    const closesAt = int(t.closesAt, 0, MINUTES_MAX);
    if (opensAt !== undefined) task.opensAt = opensAt;
    if (closesAt !== undefined && (opensAt === undefined || closesAt > opensAt)) task.closesAt = closesAt;
    tasks.push(task);
  }
  const vows: Vow[] = [];
  for (const raw of v.vows.slice(0, LIMITS.vows)) {
    const w = raw as Partial<Vow>;
    const id = typeof w?.id === "string" && ID.test(w.id) && !seen.has(w.id) ? w.id : null;
    const label = str(w?.label, LIMITS.label);
    if (!id || !label) continue;
    seen.add(id);
    vows.push({ id, label, opensAt: int(w.opensAt, 0, MINUTES_MAX) ?? 20 * 60 });
  }
  return tasks.length ? { tasks, vows } : null;
}

/** First word of a title, lower-case, for the short label on the path list. */
export function shortName(title: string) {
  return (
    title
      .trim()
      .split(/\s+/)[0]
      ?.replace(/[^\p{L}\p{N}-]/gu, "")
      .toLowerCase()
      .slice(0, LIMITS.name) || "task"
  );
}

/** A stable, unused id from a title ("Read a book" → "read-a-book", "read-a-book-2", …). */
export function makeId(title: string, taken: Iterable<string>) {
  const used = new Set(taken);
  const base =
    title
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 32) || "item";
  let id = base;
  for (let n = 2; used.has(id); n++) id = `${base}-${n}`;
  return id;
}

/** Same tasks and vows, in the same order, with the same settings? */
export const sameRoutine = (a: Routine, b: Routine) => JSON.stringify(a) === JSON.stringify(b);
