import { MonoLogo } from "./Logo";
import { useEffect, useRef, useState } from "react";
import Calendar from "./Calendar";
import { LOCK_EVENT } from "./LockScreen";
import { isMuted, onMuteChange, setMuted, sfx } from "./sound";
import World, { type VowState, type WorldTask, type ZoomControls } from "./World";
import {
  type DayRecord,
  type Task,
  type Vow,
  LIGHTS_OUT,
  REQUIRED,
  TASKS,
  VOWS,
  dayComplete,
  dayKey,
  dayMinutes,
  emptyDay,
  formatMinutes,
  isDone,
  loadHistory,
  saveHistory,
  streak,
  timing,
  unlockedIndex,
} from "./routine";

const HOLD_MS = 650;
const LAST = TASKS.length - 1;
const cheers = [
  "Small step. Real progress.",
  "Another promise to yourself, kept.",
  "That one counts. Keep moving.",
  "Discipline is just this, repeated.",
  "Done. Not perfect, done.",
];
const pad = (n: number) => String(n).padStart(2, "0");

type Toast = { label: string; message: string; tone: "win" | "nudge" | "slip" };

function Arrow({ direction = "right", size = 18 }: { direction?: "right" | "left"; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ transform: direction === "left" ? "rotate(180deg)" : undefined }}
      aria-hidden="true"
    >
      <path d="M5 12h14m-6-6 6 6-6 6" />
    </svg>
  );
}
function Check({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m5 12 4 4L19 6" />
    </svg>
  );
}
function Close() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path d="m6 6 12 12M6 18 18 6" />
    </svg>
  );
}

export default function App() {
  const [history, setHistory] = useState(loadHistory);
  const [clock, setClock] = useState(() => new Date());
  const today = dayKey(clock);
  const minutes = dayMinutes(clock);
  const record: DayRecord = history[today] ?? emptyDay();
  const unlocked = unlockedIndex(record);
  const complete = dayComplete(record);
  const currentStreak = streak(history, today);
  const requiredDone = REQUIRED.filter((task) => isDone(record, task.id)).length;

  const [current, setCurrent] = useState(() => unlockedIndex(loadHistory()[dayKey(new Date())] ?? emptyDay()));
  const [panel, setPanel] = useState<"today" | "help" | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [toastKey, setToastKey] = useState(0);
  const [focus, setFocus] = useState(false);
  const [dockHidden, setDockHidden] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [muted, setMutedState] = useState(isMuted);
  useEffect(() => {
    const unsubscribe = onMuteChange(setMutedState);
    return () => {
      unsubscribe();
    };
  }, []);
  const [holding, setHolding] = useState<string | null>(null);
  const holdTimer = useRef<number | undefined>(undefined);
  const modalRef = useRef<HTMLElement>(null);
  const zoom = useRef<ZoomControls | null>(null);
  const task = TASKS[current];

  // ---------- Clock and day rollover ----------
  useEffect(() => {
    const id = window.setInterval(() => setClock(new Date()), 20_000);
    return () => window.clearInterval(id);
  }, []);
  const lastDay = useRef(today);
  useEffect(() => {
    if (lastDay.current === today) return;
    lastDay.current = today;
    setCurrent(unlockedIndex(history[today] ?? emptyDay()));
  }, [today, history]);
  useEffect(() => saveHistory(history), [history]);

  function show(next: Toast) {
    setToast(next);
    setToastKey((value) => value + 1);
  }
  function nudge(message: string, label = "ONE THING AT A TIME") {
    sfx.nudge();
    show({ label, message, tone: "nudge" });
  }
  function save(next: DayRecord) {
    next.complete = dayComplete(next);
    setHistory((all) => ({ ...all, [today]: next }));
    return next;
  }

  /** Celebrates a finished task (or vow), and walks on to the next island when there is one. */
  function celebrate(previous: DayRecord, next: DayRecord, index: number | null, optional = false) {
    // Sound: the core's ignition chord is played by the world, in sync with the light.
    if (optional) sfx.bonus();
    else if (index === null) sfx.vow();
    else sfx.commit();
    if (dayComplete(next) && !dayComplete(previous)) {
      const days = streak({ ...history, [today]: { ...next, complete: true } }, today);
      show({ label: "DAY SEALED", message: `Every promise kept. Streak: ${days} ${days === 1 ? "day" : "days"}.`, tone: "win" });
    } else {
      show({
        label: optional ? "BONUS" : index === null ? "VOW SEALED" : "COMMITTED",
        message: optional
          ? "Beyond the line. That’s how it compounds."
          : index === null
            ? "Held all day. That’s character."
            : cheers[next.done.length % cheers.length],
        tone: "win",
      });
    }
    if (index === null || index >= LAST) return;
    const stretch = TASKS[index].kind === "count" && (next.counts[TASKS[index].id] ?? 0) < (TASKS[index].max ?? 0);
    if (!stretch) setCurrent(index + 1);
  }

  /** Why something can't be committed right now, if it can't. */
  function blocker(index: number) {
    if (index > unlocked) return `Finish “${TASKS[unlocked].title.replace(/\.$/, "")}” first. The bridge isn’t built yet.`;
    const item = TASKS[index];
    const when = timing(item, minutes);
    if (when === "early" && item.opensAt !== undefined) return `${item.title.replace(/\.$/, "")} opens at ${formatMinutes(item.opensAt)}.`;
    if (when === "missed") return "Lights out was 11 PM. Tonight is gone; tomorrow, earlier.";
    return null;
  }
  const blockerLabel = (index: number) => (timing(TASKS[index], minutes) === "missed" ? "MISSED" : index > unlocked ? "ONE THING AT A TIME" : "NOT YET");

  function commit(index: number) {
    const item = TASKS[index];
    if (isDone(record, item.id)) return;
    const reason = blocker(index);
    if (reason) return nudge(reason, blockerLabel(index));
    const next = save({ ...record, done: [...record.done, item.id] });
    celebrate(record, next, index, item.optional);
  }
  function undo(index: number) {
    const item = TASKS[index];
    const parts = { ...record.parts };
    if (item.kind === "parts") delete parts[item.id];
    const counts = { ...record.counts };
    if (item.kind === "count") counts[item.id] = Math.min(counts[item.id] ?? 0, (item.target ?? 1) - 1);
    save({ ...record, done: record.done.filter((id) => id !== item.id), parts, counts });
  }
  function togglePart(index: number, part: number) {
    const item = TASKS[index];
    const reason = blocker(index);
    if (reason) return nudge(reason, blockerLabel(index));
    const ticked = record.parts[item.id] ?? [];
    const nextParts = ticked.includes(part) ? ticked.filter((p) => p !== part) : [...ticked, part];
    const finished = nextParts.length === (item.parts?.length ?? 0);
    if (!ticked.includes(part) && !finished) sfx.pluck(nextParts.length);
    const done = record.done.filter((id) => id !== item.id);
    const next = save({ ...record, parts: { ...record.parts, [item.id]: nextParts }, done: finished ? [...done, item.id] : done });
    if (finished && !isDone(record, item.id)) celebrate(record, next, index);
  }
  function changeCount(index: number, delta: number) {
    const item = TASKS[index];
    const reason = blocker(index);
    if (reason) return nudge(reason, blockerLabel(index));
    const value = Math.max(0, Math.min(item.max ?? 99, (record.counts[item.id] ?? 0) + delta));
    const reached = value >= (item.target ?? 1);
    if (delta > 0 && !(reached && !isDone(record, item.id))) sfx.pluck(value);
    const done = record.done.filter((id) => id !== item.id);
    const next = save({ ...record, counts: { ...record.counts, [item.id]: value }, done: reached ? [...done, item.id] : done });
    if (reached && !isDone(record, item.id)) {
      celebrate(record, next, index);
      show({ label: "LINE CROSSED", message: `${value} sent. Everything past ${item.target} is the stretch. Stay, or walk on →`, tone: "win" });
    } else if (delta > 0 && value === item.max) {
      show({ label: "STRETCH HIT", message: `${value} applications. Relentless.`, tone: "win" });
      setCurrent(Math.min(LAST, index + 1));
    } else if (delta > 0) {
      show({
        label: "APPLICATION SENT",
        message: reached ? `${value} sent today.` : `${value} of ${item.target}. Keep going.`,
        tone: "win",
      });
    }
  }
  function sealVow(vow: Vow) {
    if (isDone(record, vow.id)) return;
    if (record.slipped.includes(vow.id))
      return nudge("You logged a slip today. Honest counts. Tomorrow starts clean.", "NOT TODAY");
    if (timing(vow, minutes) === "early")
      return nudge(`Vows are sealed at night, from ${formatMinutes(vow.opensAt)}. Hold the line until then.`, "NOT YET");
    const next = save({ ...record, done: [...record.done, vow.id] });
    celebrate(record, next, null);
  }
  function toggleSlip(vow: Vow) {
    if (record.slipped.includes(vow.id)) {
      save({ ...record, slipped: record.slipped.filter((id) => id !== vow.id) });
      return;
    }
    save({ ...record, slipped: [...record.slipped, vow.id], done: record.done.filter((id) => id !== vow.id) });
    sfx.slip();
    show({ label: "LOGGED, HONESTLY", message: "The streak resets. The work doesn’t. Finish the rest of today anyway.", tone: "slip" });
  }

  // ---------- Hold to commit ----------
  const latest = useRef({ commit, changeCount, togglePart, sealVow, record });
  latest.current = { commit, changeCount, togglePart, sealVow, record };
  function startHold(key: string, action: () => void) {
    if (holdTimer.current !== undefined) return;
    setHolding(key);
    sfx.holdStart(HOLD_MS / 1000);
    holdTimer.current = window.setTimeout(() => {
      holdTimer.current = undefined;
      setHolding(null);
      sfx.holdStop();
      action();
    }, HOLD_MS);
  }
  function cancelHold() {
    sfx.holdStop();
    if (holdTimer.current !== undefined) window.clearTimeout(holdTimer.current);
    holdTimer.current = undefined;
    setHolding(null);
  }
  /** Holding E (or the button) does the natural next thing for the current task. */
  function holdCurrent() {
    const index = current;
    const item = TASKS[index];
    if (isDone(record, item.id) && item.kind !== "count") return;
    const reason = blocker(index);
    if (reason) return nudge(reason, blockerLabel(index));
    startHold(item.id, () => {
      const { commit, changeCount, togglePart, record: now } = latest.current;
      if (item.kind === "count") changeCount(index, 1);
      else if (item.kind === "parts") {
        const ticked = now.parts[item.id] ?? [];
        const next = item.parts?.findIndex((_, i) => !ticked.includes(i)) ?? -1;
        if (next >= 0) togglePart(index, next);
      } else commit(index);
    });
  }
  function holdVow(vow: Vow) {
    if (isDone(record, vow.id)) return;
    if (record.slipped.includes(vow.id) || timing(vow, minutes) === "early") return sealVow(vow);
    startHold(vow.id, () => latest.current.sealVow(vow));
  }

  // ---------- Navigation ----------
  const stateRef = useRef({ current, unlocked });
  stateRef.current = { current, unlocked };
  function goTo(index: number) {
    const { current: now, unlocked: open } = stateRef.current;
    if (index > open && index > now) {
      nudge(`Finish “${TASKS[open].title.replace(/\.$/, "")}” first. The bridge isn’t built yet.`);
      return false;
    }
    setCurrent(index);
    return true;
  }
  const navigate = (direction: number) => goTo(Math.max(0, Math.min(LAST, stateRef.current.current + direction)));

  const keysRef = useRef<(e: KeyboardEvent, down: boolean) => void>(() => {});
  keysRef.current = (e, down) => {
    const key = e.key.toLowerCase();
    // While the lock screen is up, the app ignores the keyboard entirely.
    if (document.querySelector(".lock")) {
      cancelHold();
      return;
    }
    if (!down) {
      if (key === "e") cancelHold();
      return;
    }
    // The calendar page handles its own keys (Esc closes it).
    if (calendarOpen) return;
    if (e.key === "Escape") {
      setPanel(null);
      setFocus(false);
      return;
    }
    const onControl = e.target instanceof HTMLButtonElement || e.target instanceof HTMLAnchorElement;
    if (e.key === "Enter" && !panel && !onControl) {
      e.preventDefault();
      setFocus(true);
      return;
    }
    if (panel || e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (key === "l" && !e.repeat) {
      cancelHold();
      window.dispatchEvent(new Event(LOCK_EVENT));
      return;
    }
    if (key === "m" && !e.repeat) {
      setMuted(!isMuted());
      return;
    }
    if (key === "c" && !e.repeat) {
      cancelHold();
      setCalendarOpen(true);
      return;
    }
    if (key === "h" && !e.repeat) {
      setDockHidden((value) => !value);
      return;
    }
    if (["arrowright", "arrowup", "d", "w"].includes(key)) {
      e.preventDefault();
      if (!e.repeat) navigate(1);
    } else if (["arrowleft", "arrowdown", "a", "s"].includes(key)) {
      e.preventDefault();
      if (!e.repeat) navigate(-1);
    } else if (key === "e" && !e.repeat) {
      e.preventDefault();
      holdCurrent();
    }
  };
  useEffect(() => {
    const down = (e: KeyboardEvent) => keysRef.current(e, true);
    const up = (e: KeyboardEvent) => keysRef.current(e, false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4200);
    return () => window.clearTimeout(timer);
  }, [toast, toastKey]);

  // Focus trap for the side panels.
  useEffect(() => {
    if (!panel) return;
    const previous = document.activeElement as HTMLElement | null;
    const node = modalRef.current;
    const controls = () => [...(node?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") || [])];
    controls()[0]?.focus();
    const trap = (e: KeyboardEvent) => {
      const items = controls();
      if (e.key !== "Tab") return;
      if (e.shiftKey && document.activeElement === items[0]) {
        e.preventDefault();
        items[items.length - 1]?.focus();
      }
      if (!e.shiftKey && document.activeElement === items[items.length - 1]) {
        e.preventDefault();
        items[0]?.focus();
      }
    };
    window.addEventListener("keydown", trap);
    return () => {
      window.removeEventListener("keydown", trap);
      previous?.focus();
    };
  }, [panel]);

  // ---------- Status line: what matters right now ----------
  const asleep = isDone(record, "sleep");
  let status = `ON DECK: ${TASKS[unlocked].title.toUpperCase()}`;
  if (complete) status = "DAY SEALED. REST WELL.";
  else if (!asleep && minutes >= LIGHTS_OUT) status = "PAST LIGHTS OUT. GO TO BED.";
  else if (!asleep && minutes >= 20 * 60) {
    const left = LIGHTS_OUT - minutes;
    status = `LIGHTS OUT IN ${Math.floor(left / 60)}H ${pad(left % 60)}M`;
  }

  // ---------- World ----------
  const worldTasks: WorldTask[] = TASKS.map((item) => ({
    done: isDone(record, item.id),
    optional: !!item.optional,
    icon: item.icon,
  }));
  const vows: VowState[] = VOWS.map((vow) =>
    record.slipped.includes(vow.id) ? "slipped" : isDone(record, vow.id) ? "kept" : "holding",
  );
  const counterIndex = TASKS.findIndex((item) => item.kind === "count");
  const launches = counterIndex >= 0 ? (record.counts[TASKS[counterIndex].id] ?? 0) : 0;

  // ---------- Current task, as shown in the dock ----------
  const done = isDone(record, task.id);
  const when = timing(task, minutes);
  const locked = current > unlocked;
  const value = record.counts[task.id] ?? 0;
  const ticked = record.parts[task.id] ?? [];
  let state = task.optional ? "BONUS" : "REQUIRED";
  if (done) state = "DONE";
  else if (locked) state = "LOCKED";
  else if (when === "early" && task.opensAt !== undefined) state = `OPENS ${formatMinutes(task.opensAt)}`;
  else if (when === "missed") state = "MISSED TONIGHT";
  const actionLabel =
    task.kind === "count"
      ? value >= (task.max ?? 0)
        ? "Stretch hit"
        : "Hold to log one application"
      : task.kind === "parts"
        ? done
          ? "Done. Tap to undo"
          : "Hold to tick the next one"
        : done
          ? "Done. Tap to undo"
          : "Hold to commit";

  return (
    <div className={`game ${focus ? "immersive" : ""} ${dockHidden ? "dock-hidden" : ""}`}>
      <World
        current={current}
        tasks={worldTasks}
        unlocked={unlocked}
        vows={vows}
        launches={launches}
        launchFrom={counterIndex}
        complete={complete}
        immersive={focus}
        dockHidden={dockHidden}
        onSelect={goTo}
        onNavigate={navigate}
        onZoomReady={(controls) => (zoom.current = controls)}
      />
      <header className="game-header">
        <a
          className="wordmark"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setFocus(false);
          }}
        >
          <MonoLogo className="mono-logo" />
          Mono<span className="wordmark-dot">Chrome</span>
        </a>
        <div className="world-tag" role="status">
          <span className={`live-point ${!asleep && minutes >= 20 * 60 && !complete ? "urgent" : ""}`} /> {status}
        </div>
        <div className="header-actions">
          <button
            className={`streak-chip ${currentStreak ? "on" : ""}`}
            title="Open your streak calendar (C)"
            onClick={() => setCalendarOpen(true)}
          >
            STREAK <b>{pad(currentStreak)}</b>
          </button>
          <button className="quests-link" onClick={() => setPanel("today")}>
            Today{" "}
            <span>
              {requiredDone}/{REQUIRED.length}
            </span>
          </button>
          <button
            className="help-button lock-button"
            aria-label="Lock (L)"
            title="Lock (L)"
            onClick={() => window.dispatchEvent(new Event(LOCK_EVENT))}
          >
            <svg width="11" height="13" viewBox="0 0 18 22" fill="none" aria-hidden="true">
              <path d="M4.5 9V6a4.5 4.5 0 0 1 9 0v3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              <rect x="1.5" y="9" width="15" height="11.5" rx="3" fill="currentColor" />
            </svg>
          </button>
          <button className="help-button" aria-label="How it works" onClick={() => setPanel("help")}>
            ?
          </button>
        </div>
      </header>
      <div className="editorial-overlay">
        <div className="world-eyebrow">
          <span className="tiny-cross">+</span> SAME RING EVERY DAY. STRONGER EVERY LAP.
        </div>
        <h1>
          Your day.
          <br /> Built one
          <br />
          <span>promise at a time.</span>
        </h1>
        <p>
          {TASKS.length} islands. One circle.
          <br />
          No skipping ahead.
        </p>
        <button className="explore-link" onClick={() => setFocus(true)}>
          <span className="explore-icon">
            <Arrow size={14} />
          </span>
          Step into your day <span className="small-key">↵</span>
        </button>
        <div className="edition-label">
          CHAPTER 01 <span /> DISCIPLINE OVER MOTIVATION
        </div>
      </div>
      <aside className="journey-hud" aria-label="Today's tasks">
        <span className="hud-heading">YOUR DAY</span>
        {TASKS.map((item, i) => (
          <button
            key={item.id}
            className={`hud-step ${i === current ? "current" : ""} ${isDone(record, item.id) ? "done" : ""} ${i > unlocked ? "locked" : ""} ${item.optional ? "bonus" : ""}`}
            onClick={() => goTo(i)}
            aria-label={`${item.title}${isDone(record, item.id) ? " Done." : i > unlocked ? " Locked." : ""}`}
            aria-current={i === current ? "step" : undefined}
          >
            <span className="hud-node">{isDone(record, item.id) ? <Check size={9} /> : <span />}</span>
            <span className="hud-label">{item.name}</span>
          </button>
        ))}
        <span className="hud-bottom">
          {pad(requiredDone)}
          <span>/{pad(REQUIRED.length)}</span>
        </span>
      </aside>
      {toast && (
        <div className={`achievement-toast ${toast.tone}`} key={toastKey} role="status">
          <span className="achievement-icon">{toast.tone === "win" ? <Check size={12} /> : toast.tone === "slip" ? "·" : "1"}</span>
          <span>
            <small>{toast.label}</small>
            {toast.message}
          </span>
        </div>
      )}
      <section
        className={`quest-dock ${done ? "dock-complete" : ""}`}
        aria-label="Current task"
        aria-hidden={dockHidden}
        inert={dockHidden}
      >
        <div className="quest-number">
          <span>{pad(current + 1)}</span>
          <small>OF {pad(TASKS.length)}</small>
        </div>
        <div className="phase-body" key={current}>
          <div className="quest-meta">
            <span className={done ? "quest-done-dot" : ""} />
            {state}
            {task.optional && !done && <span className="completed-label">YOU CAN WALK PAST</span>}
          </div>
          <h2>{task.title}</h2>
          <p className="task-detail">{task.detail}</p>
          <div className="task-controls">
            {task.kind === "parts" && (
              <div className="task-parts">
                {task.parts?.map((part, p) => (
                  <button
                    key={part}
                    className={ticked.includes(p) ? "on" : ""}
                    aria-pressed={ticked.includes(p)}
                    onClick={() => togglePart(current, p)}
                  >
                    {ticked.includes(p) && <Check size={11} />} {part}
                  </button>
                ))}
              </div>
            )}
            {task.kind === "count" && (
              <div className="task-count">
                <button aria-label="One fewer" onClick={() => changeCount(current, -1)} disabled={value === 0}>
                  −
                </button>
                <span>
                  {value}
                  <small>/{task.target}</small>
                </span>
                <button aria-label="One more application" onClick={() => changeCount(current, 1)} disabled={value >= (task.max ?? 99)}>
                  +
                </button>
                <div className="count-track" aria-hidden="true">
                  {Array.from({ length: task.max ?? 0 }, (_, n) => (
                    <i key={n} className={`${n < value ? "on" : ""} ${n === (task.target ?? 0) - 1 ? "line" : ""}`} />
                  ))}
                </div>
              </div>
            )}
            <button
              className={`hold-button ${holding === task.id ? "holding" : ""} ${done && task.kind !== "count" ? "done" : ""}`}
              onPointerDown={(e) => {
                if (e.button !== 0 || (done && task.kind !== "count")) return;
                e.preventDefault();
                holdCurrent();
              }}
              onPointerUp={cancelHold}
              onPointerLeave={cancelHold}
              onClick={() => done && task.kind !== "count" && undo(current)}
              onKeyDown={(e) => {
                if ((e.key === " " || e.key === "Enter") && !e.repeat && !(done && task.kind !== "count")) {
                  e.preventDefault();
                  e.stopPropagation();
                  holdCurrent();
                }
              }}
              onKeyUp={(e) => (e.key === " " || e.key === "Enter") && cancelHold()}
              disabled={task.kind === "count" && value >= (task.max ?? 99)}
            >
              <span>{actionLabel}</span>
              {done && task.kind !== "count" ? <Check size={14} /> : <kbd>E</kbd>}
            </button>
          </div>
          <div className="vow-strip" aria-label="Today's vows">
            <span className="vow-heading">VOWS</span>
            {VOWS.map((vow, i) => {
              const kept = isDone(record, vow.id);
              const slipped = record.slipped.includes(vow.id);
              const early = timing(vow, minutes) === "early";
              return (
                <div key={vow.id} className={`vow ${vows[i]}`}>
                  <button
                    className={`task-commit ${holding === vow.id ? "holding" : ""}`}
                    aria-label={kept ? `${vow.label}: kept` : `Hold to seal: ${vow.label}`}
                    onPointerDown={(e) => {
                      if (e.button !== 0 || kept) return;
                      e.preventDefault();
                      holdVow(vow);
                    }}
                    onPointerUp={cancelHold}
                    onPointerLeave={cancelHold}
                    onKeyDown={(e) => {
                      if ((e.key === " " || e.key === "Enter") && !e.repeat && !kept) {
                        e.preventDefault();
                        e.stopPropagation();
                        holdVow(vow);
                      }
                    }}
                    onKeyUp={(e) => (e.key === " " || e.key === "Enter") && cancelHold()}
                  >
                    {kept && <Check size={11} />}
                  </button>
                  <span>
                    {vow.label}
                    <small>{slipped ? "Slipped" : kept ? "Kept" : early ? `Holding · seal after ${formatMinutes(vow.opensAt)}` : "Holding · seal it now"}</small>
                  </span>
                  {!kept && (
                    <button className="task-slip" onClick={() => toggleSlip(vow)}>
                      {slipped ? "Undo" : "I slipped"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        <div className="dock-actions">
          <div className="step-navigation">
            <button onClick={() => navigate(-1)} disabled={current === 0} aria-label="Previous task">
              <Arrow direction="left" size={13} />
            </button>
            <span>
              {pad(current + 1)}
              <span>/{pad(TASKS.length)}</span>
            </span>
            <button onClick={() => navigate(1)} disabled={current === LAST} aria-label="Next task">
              <Arrow size={13} />
            </button>
          </div>
        </div>
      </section>
      <footer className="game-footer">
        <div className="movement-help">
          <span className="touch-only">SWIPE TO WALK · PINCH TO ZOOM</span>
          <span className="arrow-keys pointer-only">
            <kbd>←</kbd>
            <kbd>→</kbd>
          </span>
          <span className="pointer-only">WALK</span>
          <span className="footer-divider pointer-only" />
          <span className="scroll-mouse pointer-only">
            <i />
          </span>
          <span className="pointer-only">SCROLL TO ZOOM</span>
          <span className="footer-divider pointer-only" />
          <span className="arrow-keys pointer-only">
            <kbd>E</kbd>
          </span>
          <span className="pointer-only">HOLD TO COMMIT</span>
        </div>
        <div className="drag-help">
          <span className="drag-symbol">↔</span>
          <span className="pointer-only">DRAG TO LOOK AROUND</span>
          <span className="touch-only">TWO FINGERS TO LOOK AROUND</span>
        </div>
        <div className="footer-right">
          <button
            className="dock-toggle"
            aria-pressed={dockHidden}
            title="Hide or show the task panel (H)"
            onClick={() => setDockHidden((value) => !value)}
          >
            {dockHidden ? "Show tasks" : "Hide tasks"} <kbd>H</kbd>
          </button>
          <button
            className="sound-toggle"
            aria-pressed={!muted}
            aria-label={muted ? "Turn sound on (M)" : "Mute sound (M)"}
            title={muted ? "Sound off (M)" : "Sound on (M)"}
            onClick={() => setMuted(!muted)}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 9v6h4l5 4V5L8 9H4z" />
              {muted ? <path d="m17 9 5 6m0-6-5 6" /> : <path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" />}
            </svg>
          </button>
          <div className="zoom-controls" role="group" aria-label="Zoom">
            <button aria-label="Zoom out" onClick={() => zoom.current?.zoomBy(1.35)}>
              −
            </button>
            <button aria-label="Reset camera" title="Reset camera (0)" onClick={() => zoom.current?.reset()}>
              ◎
            </button>
            <button aria-label="Zoom in" onClick={() => zoom.current?.zoomBy(0.74)}>
              +
            </button>
          </div>
          <span>
            {clock.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).toUpperCase()}{" "}
            <span className="footer-slash">/</span>{" "}
            {clock.toLocaleDateString("en-US", { month: "short", day: "numeric" }).toUpperCase()}
          </span>
          <button
            className="immersive-toggle"
            aria-label={focus ? "Show introduction" : "Hide introduction"}
            aria-pressed={focus}
            onClick={() => setFocus(!focus)}
          >
            <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden="true">
              <path d={focus ? "M2 7h5V2m6 0v5h5M2 13h5v5m6 0v-5h5" : "M7 2H2v5m11-5h5v5M2 13v5h5m11-5v5h-5"} />
            </svg>
          </button>
        </div>
      </footer>
      {panel && (
        <div className="panel-backdrop" onClick={() => setPanel(null)}>
          <section
            className="game-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="panel-title"
            ref={modalRef}
            onClick={(e) => e.stopPropagation()}
          >
            <button className="panel-close" aria-label="Close" onClick={() => setPanel(null)}>
              <Close />
            </button>
            <span className="panel-eyebrow">{panel === "today" ? "ONE ISLAND AT A TIME. NO SHORTCUTS." : "HOW THE RING WORKS"}</span>
            <h2 id="panel-title">{panel === "today" ? "Today, honestly." : "Discipline, made visible."}</h2>
            <p>
              {panel === "today"
                ? "Everything you promised yourself today, and where you stand."
                : `Your day is a ring of ${TASKS.length} islands around a dark core, one per task. You light it by doing the work, in order.`}
            </p>
            {panel === "today" ? (
              <>
                <div className="panel-quest-list">
                  {TASKS.map((item, i) => {
                    const itemDone = isDone(record, item.id);
                    return (
                      <div key={item.id} className={`panel-quest ${itemDone ? "done" : ""} ${i > unlocked ? "locked" : ""}`}>
                        <button
                          disabled={i > unlocked && i > current}
                          onClick={() => {
                            if (goTo(i)) setPanel(null);
                          }}
                        >
                          <span className="panel-index">{pad(i + 1)}</span>
                          <span>
                            <strong>{item.title}</strong>
                            <small>
                              {item.optional ? "BONUS" : "REQUIRED"}
                              {item.kind === "count" && ` · ${record.counts[item.id] ?? 0}/${item.target}`}
                              {itemDone ? " · DONE" : i > unlocked ? " · LOCKED" : ""}
                            </small>
                          </span>
                          {itemDone ? <Check size={14} /> : <Arrow size={16} />}
                        </button>
                      </div>
                    );
                  })}
                  {VOWS.map((vow, i) => (
                    <div key={vow.id} className={`panel-quest ${vows[i] === "kept" ? "done" : ""}`}>
                      <button disabled>
                        <span className="panel-index">◦</span>
                        <span>
                          <strong>{vow.label}</strong>
                          <small>VOW · {vows[i].toUpperCase()}</small>
                        </span>
                        {vows[i] === "kept" && <Check size={14} />}
                      </button>
                    </div>
                  ))}
                </div>
                <div className="panel-summary">
                  <span>
                    Streak: {currentStreak} {currentStreak === 1 ? "day" : "days"}
                  </span>
                  <span>{complete ? "DAY SEALED." : `${requiredDone}/${REQUIRED.length} DONE`}</span>
                </div>
              </>
            ) : (
              <>
                <div className="help-row">
                  <span className="help-keys">
                    <kbd>E</kbd>
                  </span>
                  <div>
                    <strong>Hold to commit</strong>
                    <p>Do it in real life first. Then hold E, or the button, until it fills. A promise deserves more than a click.</p>
                  </div>
                </div>
                <div className="help-row">
                  <span className="help-keys">
                    <kbd>←</kbd>
                    <kbd>→</kbd>
                  </span>
                  <div>
                    <strong>Walk and look around</strong>
                    <p>
                      Arrow keys, A/D, swipe, or click an island to walk. Scroll, pinch or +/− to zoom from right next to
                      the figure out to the whole system. Drag to orbit. 0 resets the camera, H hides the task panel, M mutes sound, L locks the screen.
                    </p>
                  </div>
                </div>
                <div className="help-row">
                  <span className="help-keys">⌇</span>
                  <div>
                    <strong>Earn the next island</strong>
                    <p>
                      Each task pushes its stone home and raises the bridge to the next. Bonus islands can be walked past, but
                      doing them shines brighter. No skipping ahead.
                    </p>
                  </div>
                </div>
                <div className="help-row">
                  <span className="help-keys">☾</span>
                  <div>
                    <strong>Vows and lights out</strong>
                    <p>
                      No porn and no alcohol are held all day and sealed after 8 PM. Slips are logged honestly. Lights out can
                      only be sealed between 8:30 and 11 PM.
                    </p>
                  </div>
                </div>
                <div className="help-row">
                  <span className="help-keys">◉</span>
                  <div>
                    <strong>Light the core</strong>
                    <p>Every task sends a spoke of light to the core. Finish them all, keep both vows, and it ignites. That’s a perfect day, and it adds to your streak.</p>
                  </div>
                </div>
                <button
                  className="panel-start"
                  onClick={() => {
                    setPanel(null);
                    setFocus(true);
                  }}
                >
                  Got it. Let’s work. <Arrow size={17} />
                </button>
              </>
            )}
            <span className="session-note">Every day is saved on this device and turns over at 4 AM. Press C, or the streak, for your calendar.</span>
          </section>
        </div>
      )}
      {calendarOpen && <Calendar history={history} today={today} onClose={() => setCalendarOpen(false)} />}
    </div>
  );
}
