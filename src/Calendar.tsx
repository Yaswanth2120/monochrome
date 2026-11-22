import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  type DayRecord,
  type Routine,
  addDays,
  bestStreak,
  dateOf,
  dayScore,
  firstDay,
  isDone,
  keyOf,
  promisesOf,
  scoreLabel,
  scoreOf,
  streak,
} from "./routine";

type Props = {
  history: Record<string, DayRecord>;
  routine: Routine;
  today: string;
  onClose: () => void;
};

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];
const monthLabel = (year: number, month: number) =>
  new Date(year, month, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
const longDate = (key: string) =>
  dateOf(key).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

/** A day's mark: a ring that fills with the share of promises kept; a perfect day is a solid disc. */
function DayMark({ record, routine, size = 26 }: { record: DayRecord | undefined; routine: Routine; size?: number }) {
  const r = size / 2 - 2;
  const c = 2 * Math.PI * r;
  const score = dayScore(record, routine);
  if (!record) return <span className="cal-dot" aria-hidden="true" />;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" className="cal-mark">
      {record.complete ? (
        <circle cx={size / 2} cy={size / 2} r={r + 1} fill="#f2f2f2" />
      ) : (
        <>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#2c2c31" strokeWidth="2" />
          {score > 0 && (
            <circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke="#d8d8dc"
              strokeWidth="2"
              strokeDasharray={`${c * score} ${c}`}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
              strokeLinecap="round"
            />
          )}
        </>
      )}
      {record.slipped.length > 0 && (
        <line
          x1="4"
          y1={size - 4}
          x2={size - 4}
          y2="4"
          stroke={record.complete ? "#050506" : "#9a9aa0"}
          strokeWidth="1.6"
        />
      )}
    </svg>
  );
}

export default function Calendar({ history, routine, today, onClose }: Props) {
  const todayDate = dateOf(today);
  const [view, setView] = useState({ year: todayDate.getFullYear(), month: todayDate.getMonth() });
  const [selected, setSelected] = useState(today);
  const closeRef = useRef<HTMLButtonElement>(null);
  const start = firstDay(history, today);

  // Keep the latest close handler without re-running the effect (which would steal focus).
  const closeHandler = useRef(onClose);
  useLayoutEffect(() => {
    closeHandler.current = onClose;
  });
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeHandler.current();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      previous?.focus();
    };
  }, []);

  // ---------- Headline numbers ----------
  const stats = useMemo(() => {
    const perfect = Object.values(history).filter((record) => record.complete).length;
    let kept = 0;
    let possible = 0;
    for (let i = 0; i < 30; i++) {
      const key = addDays(today, -i);
      if (key < start) break;
      const record = history[key];
      const day = record?.total
        ? { kept: record.kept ?? 0, total: record.total }
        : record
          ? scoreOf(record, routine)
          : { kept: 0, total: promisesOf(routine) };
      kept += day.kept;
      possible += day.total;
    }
    return {
      current: streak(history, today),
      best: bestStreak(history),
      perfect,
      rate: possible ? Math.round((kept / possible) * 100) : 0,
    };
  }, [history, routine, today, start]);

  // ---------- Month grid, weeks starting Monday ----------
  const cells = useMemo(() => {
    const first = new Date(view.year, view.month, 1, 12);
    const lead = (first.getDay() + 6) % 7;
    const days = new Date(view.year, view.month + 1, 0).getDate();
    return [
      ...Array.from({ length: lead }, () => null),
      ...Array.from({ length: days }, (_, i) => keyOf(new Date(view.year, view.month, i + 1, 12))),
    ];
  }, [view]);
  const shiftMonth = (delta: number) =>
    setView(({ year, month }) => {
      const next = new Date(year, month + delta, 1);
      return { year: next.getFullYear(), month: next.getMonth() };
    });
  const atCurrentMonth = view.year === todayDate.getFullYear() && view.month === todayDate.getMonth();

  // ---------- A year at a glance: 53 weeks, oldest on the left ----------
  const year = useMemo(() => {
    const end = dateOf(today);
    const endKey = addDays(today, 6 - ((end.getDay() + 6) % 7));
    const startKey = addDays(endKey, -53 * 7 + 1);
    return Array.from({ length: 53 }, (_, w) =>
      Array.from({ length: 7 }, (_, d) => {
        const key = addDays(startKey, w * 7 + d);
        return { key, record: history[key], future: key > today };
      }),
    );
  }, [history, today]);
  const shade = (record: DayRecord | undefined, future: boolean) => {
    if (future) return "transparent";
    if (!record) return "#111113";
    if (record.complete) return "#f2f2f2";
    const score = dayScore(record, routine);
    return score === 0
      ? "#18181b"
      : `rgb(${Math.round(40 + score * 140)} ${Math.round(40 + score * 140)} ${Math.round(44 + score * 140)})`;
  };

  // ---------- Habit consistency over the last 30 days ----------
  const habits = useMemo(() => {
    const days: string[] = [];
    for (let i = 0; i < 30; i++) {
      const key = addDays(today, -i);
      if (key < start) break;
      days.push(key);
    }
    const items = [
      ...routine.tasks.map((task) => ({
        id: task.id,
        label: task.title.replace(/\.$/, ""),
        optional: !!task.optional,
      })),
      ...routine.vows.map((vow) => ({ id: vow.id, label: vow.label, optional: false })),
    ].map((item) => {
      const hits = days.filter((key) => history[key] && isDone(history[key], item.id)).length;
      return { ...item, hits, rate: days.length ? hits / days.length : 0 };
    });
    const required = items.filter((item) => !item.optional);
    const weakest = required.length && days.length > 1 ? required.reduce((a, b) => (b.rate < a.rate ? b : a)) : null;
    return { items, days: days.length, weakest: weakest && weakest.rate < 1 ? weakest.id : null };
  }, [history, routine, today, start]);

  // ---------- The selected day ----------
  const record = history[selected];
  const isFuture = selected > today;

  return (
    <div className="cal-page" role="dialog" aria-modal="true" aria-labelledby="cal-title">
      <header className="cal-header">
        <div>
          <span className="cal-eyebrow">THE RECORD DOESN’T LIE</span>
          <h1 id="cal-title">Your streak.</h1>
        </div>
        <button className="cal-close" ref={closeRef} onClick={onClose}>
          Back to the ring <kbd>Esc</kbd>
        </button>
      </header>

      <section className="cal-year" aria-label="The last year">
        <div className="cal-section-head">
          <h2>A year of days</h2>
          <span>Brighter means more promises kept. White is perfect.</span>
        </div>
        <div className="cal-year-grid" role="img" aria-label="Heatmap of the last 53 weeks">
          {year.map((week, w) => (
            <div key={w} className="cal-week">
              {week.map(({ key, record: day, future }) => (
                <span
                  key={key}
                  title={
                    future
                      ? undefined
                      : `${longDate(key)}: ${day ? (day.complete ? "perfect" : scoreLabel(day, routine)) : "nothing recorded"}`
                  }
                  style={{ background: shade(day, future) }}
                  className={key === today ? "today" : ""}
                />
              ))}
            </div>
          ))}
        </div>
      </section>

      <div className="cal-body">
        <section className="cal-month" aria-label={monthLabel(view.year, view.month)}>
          <div className="cal-month-head">
            <h2>{monthLabel(view.year, view.month)}</h2>
            <div className="cal-month-nav">
              <button onClick={() => shiftMonth(-1)} aria-label="Previous month">
                ←
              </button>
              <button
                onClick={() => {
                  setView({ year: todayDate.getFullYear(), month: todayDate.getMonth() });
                  setSelected(today);
                }}
                disabled={atCurrentMonth && selected === today}
              >
                Today
              </button>
              <button onClick={() => shiftMonth(1)} aria-label="Next month" disabled={atCurrentMonth}>
                →
              </button>
            </div>
          </div>
          <div className="cal-grid">
            {WEEKDAYS.map((day, i) => (
              <span key={i} className="cal-weekday">
                {day}
              </span>
            ))}
            {cells.map((key, i) => {
              if (!key) return <span key={`blank-${i}`} />;
              const day = history[key];
              const future = key > today;
              const before = key < start;
              const label = `${longDate(key)}${
                future
                  ? ", upcoming"
                  : day
                    ? day.complete
                      ? ", perfect day"
                      : `, ${scoreLabel(day, routine).replace("/", " of ")} kept${day.slipped.length ? ", vow slipped" : ""}`
                    : ", nothing recorded"
              }`;
              return (
                <button
                  key={key}
                  className={`cal-day ${key === today ? "today" : ""} ${key === selected ? "selected" : ""} ${future ? "future" : ""} ${before ? "before" : ""} ${day?.complete ? "perfect" : ""}`}
                  onClick={() => setSelected(key)}
                  aria-label={label}
                  aria-pressed={key === selected}
                >
                  <span className="cal-num">{Number(key.slice(8))}</span>
                  {!future && !before && <DayMark record={day} routine={routine} />}
                </button>
              );
            })}
          </div>
          <div className="cal-legend" aria-hidden="true">
            <span>
              <svg width="14" height="14">
                <circle cx="7" cy="7" r="6" fill="#f2f2f2" />
              </svg>
              Perfect
            </span>
            <span>
              <svg width="14" height="14">
                <circle cx="7" cy="7" r="5" fill="none" stroke="#2c2c31" strokeWidth="2" />
                <circle
                  cx="7"
                  cy="7"
                  r="5"
                  fill="none"
                  stroke="#d8d8dc"
                  strokeWidth="2"
                  strokeDasharray="18 40"
                  transform="rotate(-90 7 7)"
                />
              </svg>
              Partly kept
            </span>
            <span>
              <svg width="14" height="14">
                <line x1="2" y1="12" x2="12" y2="2" stroke="#9a9aa0" strokeWidth="1.6" />
              </svg>
              Vow slipped
            </span>
            <span>
              <span className="cal-dot" />
              Nothing recorded
            </span>
          </div>
        </section>

        <aside className="cal-detail" aria-live="polite">
          <span className="cal-eyebrow">{selected === today ? "TODAY" : isFuture ? "UPCOMING" : "LOOKING BACK"}</span>
          <h2>{longDate(selected)}</h2>
          {isFuture ? (
            <p className="cal-note">Not here yet. Win today first.</p>
          ) : !record ? (
            <p className="cal-note">{selected < start ? "Before you started." : "Nothing was recorded this day."}</p>
          ) : (
            <>
              <div className="cal-detail-score">
                <DayMark record={record} routine={routine} size={44} />
                <div>
                  <b>{scoreLabel(record, routine)}</b>
                  <span>
                    {record.complete
                      ? "Perfect day. Every promise kept."
                      : record.slipped.length
                        ? "A vow slipped. Logged honestly."
                        : selected === today
                          ? "Still in progress."
                          : "Not every promise was kept."}
                  </span>
                </div>
              </div>
              <ul className="cal-tasks">
                {routine.tasks.map((task) => {
                  const done = isDone(record, task.id);
                  return (
                    <li key={task.id} className={`${done ? "done" : ""} ${task.optional ? "bonus" : ""}`}>
                      <span className="cal-tick" aria-hidden="true">
                        {done ? "●" : "○"}
                      </span>
                      {task.title.replace(/\.$/, "")}
                      {task.kind === "count" && <em>{record.counts[task.id] ?? 0} sent</em>}
                      {task.optional && <em>bonus</em>}
                      <span className="sr-only">{done ? "done" : "not done"}</span>
                    </li>
                  );
                })}
                {routine.vows.map((vow) => {
                  const slipped = record.slipped.includes(vow.id);
                  const kept = isDone(record, vow.id);
                  return (
                    <li key={vow.id} className={`${kept ? "done" : ""} ${slipped ? "slipped" : ""}`}>
                      <span className="cal-tick" aria-hidden="true">
                        {slipped ? "×" : kept ? "●" : "○"}
                      </span>
                      {vow.label}
                      <em>{slipped ? "slipped" : kept ? "kept" : "not sealed"}</em>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </aside>
      </div>

      <section className="cal-dashboard" aria-label="Dashboard">
        <div className="cal-section-head">
          <h2>The numbers</h2>
          <span>Streaks, perfect days, and how much you kept.</span>
        </div>
        <div className="cal-stats">
          <div className="cal-stat hero">
            <b>{stats.current}</b>
            <span>{stats.current === 1 ? "DAY" : "DAYS"} CURRENT STREAK</span>
          </div>
          <div className="cal-stat">
            <b>{stats.best}</b>
            <span>BEST STREAK</span>
          </div>
          <div className="cal-stat">
            <b>{stats.perfect}</b>
            <span>PERFECT DAYS</span>
          </div>
          <div className="cal-stat">
            <b>
              {stats.rate}
              <small>%</small>
            </b>
            <span>PROMISES KEPT, 30 DAYS</span>
          </div>
        </div>
      </section>

      <section className="cal-habits" aria-label="Habit consistency">
        <div className="cal-section-head">
          <h2>
            Consistency, last {habits.days} {habits.days === 1 ? "day" : "days"}
          </h2>
          <span>Where the discipline holds, and where it leaks.</span>
        </div>
        <ul>
          {habits.items.map((item) => (
            <li
              key={item.id}
              className={`${item.id === habits.weakest ? "weakest" : ""} ${item.optional ? "bonus" : ""}`}
            >
              <span className="cal-habit-label">
                {item.label}
                {item.optional && <em>bonus</em>}
                {item.id === habits.weakest && <em className="flag">weakest</em>}
              </span>
              <span className="cal-bar" aria-hidden="true">
                <i style={{ width: `${Math.round(item.rate * 100)}%` }} />
              </span>
              <span className="cal-rate">
                {Math.round(item.rate * 100)}%
                <small>
                  {item.hits}/{habits.days}
                </small>
              </span>
            </li>
          ))}
        </ul>
        {habits.days <= 1 && <p className="cal-note">This fills in as the days add up. Come back tomorrow.</p>}
      </section>
    </div>
  );
}
