import { type FormEvent, type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import TaskGlyph from "./TaskGlyph";
import { type AccountInfo, HOUSE_NAME_MAX, saveHouseName, savePasscode, signOutAccount } from "./lib/account";
import { PASSCODE_LENGTH, verifyPasscode } from "./lib/passcode";
import type { Pending } from "./lib/useRoutine";
import {
  type DayRecord,
  type Routine,
  type Task,
  type TaskKind,
  type Vow,
  LIMITS,
  TASK_ICONS,
  addDays,
  dateOf,
  formatMinutes,
  hasProgress,
  makeId,
  sanitizeRoutine,
  shortName,
} from "./routine";
import { isMuted, onMuteChange, setMuted } from "./sound";

/*
 * Settings: the routine editor (tasks and vows), the account and preferences.
 *
 * Edits are made on a draft and only saved with Save. A saved edit starts tomorrow at 4 AM, so a
 * skipped task can't be deleted to rescue today. "Apply now" is only offered before anything has
 * been done today.
 */

type Section = "routine" | "vows" | "account" | "preferences";
const SECTIONS: { id: Section; label: string }[] = [
  { id: "routine", label: "Routine" },
  { id: "vows", label: "Vows" },
  { id: "account", label: "Account" },
  { id: "preferences", label: "Preferences" },
];

type Props = {
  routine: Routine;
  pending: Pending | null;
  today: string;
  todayRecord: DayRecord | undefined;
  account: AccountInfo;
  saveRoutine: (next: Routine, when: "now" | "tomorrow") => Promise<void>;
  cancelPending: () => Promise<void>;
  onClose: () => void;
};

const pad = (n: number) => String(n).padStart(2, "0");
/** Minutes (which may run past midnight) to an <input type="time"> value, and back. */
const toInput = (minutes?: number) =>
  minutes === undefined ? "" : `${pad(Math.floor(minutes / 60) % 24)}:${pad(minutes % 60)}`;
function fromInput(value: string) {
  const [h, m] = value.split(":").map(Number);
  if (!value || Number.isNaN(h) || Number.isNaN(m)) return undefined;
  const minutes = h * 60 + m;
  // The day turns over at 4 AM: 1 AM belongs to the night before.
  return minutes < 4 * 60 ? minutes + 24 * 60 : minutes;
}
const niceDate = (key: string) =>
  dateOf(key).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
const canon = (routine: Routine) => JSON.stringify(sanitizeRoutine(routine));
const titleOf = (task: Task) => task.title.replace(/\.$/, "") || "Untitled task";

function describe(task: Task) {
  const bits: string[] = [];
  if (task.kind === "parts") bits.push(`${task.parts?.length ?? 0} steps`);
  else if (task.kind === "count") bits.push(`Counter ${task.target}${task.max !== task.target ? `–${task.max}` : ""}`);
  else bits.push("Hold");
  if (task.optional) bits.push("Bonus");
  if (task.opensAt !== undefined || task.closesAt !== undefined)
    bits.push(
      task.opensAt !== undefined && task.closesAt !== undefined
        ? `${formatMinutes(task.opensAt)}–${formatMinutes(task.closesAt)}`
        : task.opensAt !== undefined
          ? `from ${formatMinutes(task.opensAt)}`
          : `until ${formatMinutes(task.closesAt ?? 0)}`,
    );
  return bits;
}

/** The first problem that would stop a draft from being saved, if any. */
function validate(draft: Routine): string | null {
  if (!draft.tasks.length) return "Add at least one task.";
  if (!draft.tasks.some((task) => !task.optional)) return "Keep at least one required task (not a bonus).";
  for (const [i, task] of draft.tasks.entries()) {
    const name = `Task ${i + 1}`;
    if (!task.title.trim()) return `${name} needs a name.`;
    if (task.kind === "parts" && !(task.parts ?? []).some((part) => part.trim()))
      return `“${titleOf(task)}” needs at least one step.`;
    if (task.kind === "count" && (task.target ?? 1) > (task.max ?? 1))
      return `“${titleOf(task)}”: the goal can't be higher than the stretch.`;
    if (task.opensAt !== undefined && task.closesAt !== undefined && task.closesAt <= task.opensAt)
      return `“${titleOf(task)}” closes before it opens.`;
  }
  for (const [i, vow] of draft.vows.entries()) if (!vow.label.trim()) return `Vow ${i + 1} needs a name.`;
  return null;
}

function move<T>(list: T[], from: number, to: number) {
  const next = list.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export default function Settings(props: Props) {
  const { routine, pending, today, todayRecord, account, saveRoutine, cancelPending, onClose } = props;
  const base: Routine = pending ? { tasks: pending.tasks, vows: pending.vows } : routine;
  const [section, setSection] = useState<Section>("routine");
  const [draft, setDraft] = useState<Routine>(base);
  const [editing, setEditing] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [armed, setArmed] = useState<number | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [saving, setSaving] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const dirty = canon(draft) !== canon(base);
  const canApplyNow = !hasProgress(todayRecord);
  const tomorrow = niceDate(addDays(today, 1));

  // Esc closes (asking first when there are unsaved changes); focus returns where it came from.
  const requestClose = useRef(() => {});
  useLayoutEffect(() => {
    requestClose.current = () => {
      if (choosing) setChoosing(false);
      else if (dirty) setConfirmClose(true);
      else onClose();
    };
  });
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") requestClose.current();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      previous?.focus();
    };
  }, []);

  // ---------- Draft editing ----------
  const setTasks = (tasks: Task[]) => setDraft((d) => ({ ...d, tasks }));
  const setVows = (vows: Vow[]) => setDraft((d) => ({ ...d, vows }));
  const patchTask = (id: string, patch: Partial<Task>) =>
    setDraft((d) => ({ ...d, tasks: d.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)) }));
  const takenIds = () => [...draft.tasks.map((t) => t.id), ...draft.vows.map((v) => v.id)];

  function addTask() {
    if (draft.tasks.length >= LIMITS.tasks) return;
    const task: Task = {
      id: makeId(`task-${Date.now().toString(36)}`, takenIds()),
      name: "new",
      title: "New task",
      detail: "",
      kind: "check",
      icon: "cube",
    };
    setTasks([...draft.tasks, task]);
    setEditing(task.id);
    setProblem(null);
  }
  function setKind(task: Task, kind: TaskKind) {
    const patch: Partial<Task> = { kind };
    if (kind === "parts" && !task.parts?.length) patch.parts = ["Step 1", "Step 2"];
    if (kind === "count" && task.target === undefined) Object.assign(patch, { target: 1, max: 3 });
    patchTask(task.id, patch);
  }
  function setTitle(task: Task, title: string) {
    // Keep the short label in step with the name until it's been changed by hand.
    const autoName = task.name === shortName(task.title) || task.name === "new";
    patchTask(task.id, { title, ...(autoName ? { name: shortName(title) } : {}) });
  }

  // ---------- Saving ----------
  async function save(when: "now" | "tomorrow") {
    const clean = sanitizeRoutine(draft);
    if (!clean) return;
    setSaving(true);
    try {
      await saveRoutine(clean, when);
      setDraft(clean);
      setEditing(null);
      setNotice(
        when === "now" ? "Saved. Your new routine is live." : `Saved. Your new routine starts ${tomorrow} at 4 AM.`,
      );
    } catch {
      setProblem("Couldn't save. Check your connection and try again.");
    } finally {
      setSaving(false);
      setChoosing(false);
    }
  }
  function onSave() {
    const error = validate(draft);
    setProblem(error);
    setNotice(null);
    if (error) return;
    if (canApplyNow) setChoosing(true);
    else void save("tomorrow");
  }
  async function onCancelPending() {
    await cancelPending();
    setDraft(routine);
    setNotice("Scheduled changes cancelled. You're on your current routine.");
  }

  // ---------- Rendering helpers ----------
  const reorder = (list: "tasks" | "vows", from: number, to: number) => {
    if (to < 0) return;
    if (list === "tasks" && to < draft.tasks.length) setTasks(move(draft.tasks, from, to));
    if (list === "vows" && to < draft.vows.length) setVows(move(draft.vows, from, to));
  };

  function taskEditor(task: Task) {
    const field = (label: string, control: ReactNode, hint?: string) => (
      <label className="set-field">
        <span>{label}</span>
        {control}
        {hint && <small>{hint}</small>}
      </label>
    );
    return (
      <div className="set-editor" role="group" aria-label={`Edit ${titleOf(task)}`}>
        <div className="set-grid">
          {field(
            "Name",
            <input
              value={task.title}
              maxLength={LIMITS.title}
              onChange={(e) => setTitle(task, e.target.value)}
              autoFocus
            />,
          )}
          {field(
            "Short label",
            <input
              value={task.name}
              maxLength={LIMITS.name}
              onChange={(e) => patchTask(task.id, { name: e.target.value })}
            />,
            "Shown on the path list.",
          )}
          <label className="set-field set-span">
            <span>Description</span>
            <input
              value={task.detail}
              maxLength={LIMITS.detail}
              placeholder="Why it matters, in one line."
              onChange={(e) => patchTask(task.id, { detail: e.target.value })}
            />
          </label>
        </div>

        <fieldset className="set-field set-kind">
          <legend>Type</legend>
          <div className="set-segment">
            {(
              [
                ["check", "Hold to commit"],
                ["parts", "Steps"],
                ["count", "Counter"],
              ] as const
            ).map(([kind, label]) => (
              <button
                type="button"
                key={kind}
                className={task.kind === kind ? "on" : ""}
                aria-pressed={task.kind === kind}
                onClick={() => setKind(task, kind)}
              >
                {label}
              </button>
            ))}
          </div>
        </fieldset>

        {task.kind === "parts" && (
          <div className="set-steps">
            {(task.parts ?? []).map((part, i) => (
              <div key={i} className="set-step">
                <span>{i + 1}</span>
                <input
                  value={part}
                  maxLength={LIMITS.part}
                  aria-label={`Step ${i + 1}`}
                  onChange={(e) =>
                    patchTask(task.id, { parts: (task.parts ?? []).map((p, j) => (j === i ? e.target.value : p)) })
                  }
                />
                <button
                  type="button"
                  aria-label={`Remove step ${i + 1}`}
                  disabled={(task.parts ?? []).length <= 1}
                  onClick={() => patchTask(task.id, { parts: (task.parts ?? []).filter((_, j) => j !== i) })}
                >
                  ×
                </button>
              </div>
            ))}
            {(task.parts ?? []).length < LIMITS.parts && (
              <button
                type="button"
                className="set-add-small"
                onClick={() =>
                  patchTask(task.id, {
                    parts: [...(task.parts ?? []), `Step ${(task.parts ?? []).length + 1}`],
                  })
                }
              >
                + Add step
              </button>
            )}
          </div>
        )}

        {task.kind === "count" && (
          <div className="set-grid">
            {field(
              "Done at",
              <input
                type="number"
                min={1}
                max={LIMITS.count}
                value={task.target ?? 1}
                onChange={(e) => patchTask(task.id, { target: Math.max(1, Math.min(LIMITS.count, +e.target.value)) })}
              />,
              "The number that completes the task.",
            )}
            {field(
              "Stretch goal",
              <input
                type="number"
                min={1}
                max={LIMITS.count}
                value={task.max ?? 1}
                onChange={(e) => patchTask(task.id, { max: Math.max(1, Math.min(LIMITS.count, +e.target.value)) })}
              />,
              "Keep counting up to this.",
            )}
          </div>
        )}

        <div className="set-grid">
          {field(
            "Opens at",
            <input
              type="time"
              value={toInput(task.opensAt)}
              onChange={(e) => patchTask(task.id, { opensAt: fromInput(e.target.value) })}
            />,
            "Leave empty for any time.",
          )}
          {field(
            "Closes at",
            <input
              type="time"
              value={toInput(task.closesAt)}
              onChange={(e) => patchTask(task.id, { closesAt: fromInput(e.target.value) })}
            />,
            "After this it's missed for the day.",
          )}
        </div>

        <label className="set-check">
          <input
            type="checkbox"
            checked={!!task.optional}
            onChange={(e) => patchTask(task.id, { optional: e.target.checked || undefined })}
          />
          <span>
            <b>Bonus</b>
            <small>Optional. You can walk past it, and it doesn't count toward a perfect day.</small>
          </span>
        </label>

        <fieldset className="set-field">
          <legend>Icon</legend>
          <div className="set-icons">
            {TASK_ICONS.map((icon) => (
              <button
                type="button"
                key={icon}
                className={task.icon === icon ? "on" : ""}
                aria-pressed={task.icon === icon}
                aria-label={icon}
                title={icon}
                onClick={() => patchTask(task.id, { icon })}
              >
                <TaskGlyph icon={icon} size={20} />
              </button>
            ))}
          </div>
        </fieldset>

        <div className="set-editor-foot">
          <button type="button" className="set-button" onClick={() => setEditing(null)}>
            Done
          </button>
        </div>
      </div>
    );
  }

  function routineSection() {
    return (
      <section aria-labelledby="set-routine-title">
        <div className="set-head">
          <div>
            <h2 id="set-routine-title">Tasks</h2>
            <p>One island per task, walked in this order. Drag the handle or use the arrows to reorder.</p>
          </div>
          <span className="set-count">
            {draft.tasks.length}/{LIMITS.tasks}
          </span>
        </div>
        <ol className="set-list">
          {draft.tasks.map((task, i) => (
            <li
              key={task.id}
              className={`set-item ${dragFrom === i ? "dragging" : ""} ${editing === task.id ? "open" : ""}`}
              draggable={armed === i}
              onDragStart={(e) => {
                setDragFrom(i);
                e.dataTransfer.effectAllowed = "move";
              }}
              onDragOver={(e) => {
                e.preventDefault();
                if (dragFrom !== null && dragFrom !== i) {
                  setTasks(move(draft.tasks, dragFrom, i));
                  setDragFrom(i);
                }
              }}
              onDragEnd={() => {
                setDragFrom(null);
                setArmed(null);
              }}
            >
              <div className="set-row">
                <span
                  className="set-handle"
                  aria-hidden="true"
                  onPointerDown={() => setArmed(i)}
                  onPointerUp={() => setArmed(null)}
                >
                  ⠿
                </span>
                <span className="set-num">{pad(i + 1)}</span>
                <span className="set-icon">
                  <TaskGlyph icon={task.icon} />
                </span>
                <span className="set-title">
                  <b>{titleOf(task)}</b>
                  <small>{describe(task).join(" · ")}</small>
                </span>
                <span className="set-actions">
                  <button
                    type="button"
                    aria-label={`Move ${titleOf(task)} up`}
                    disabled={i === 0}
                    onClick={() => reorder("tasks", i, i - 1)}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    aria-label={`Move ${titleOf(task)} down`}
                    disabled={i === draft.tasks.length - 1}
                    onClick={() => reorder("tasks", i, i + 1)}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    aria-expanded={editing === task.id}
                    onClick={() => setEditing(editing === task.id ? null : task.id)}
                  >
                    {editing === task.id ? "Close" : "Edit"}
                  </button>
                  <button type="button" className="danger" onClick={() => setDeleting(task.id)}>
                    Delete
                  </button>
                </span>
              </div>
              {deleting === task.id && (
                <div className="set-confirm" role="alert">
                  <span>Delete “{titleOf(task)}”? Past days keep their record.</span>
                  <button
                    type="button"
                    className="set-button danger"
                    onClick={() => {
                      setTasks(draft.tasks.filter((t) => t.id !== task.id));
                      setDeleting(null);
                      if (editing === task.id) setEditing(null);
                    }}
                  >
                    Delete
                  </button>
                  <button type="button" className="set-button ghost" onClick={() => setDeleting(null)}>
                    Keep
                  </button>
                </div>
              )}
              {editing === task.id && taskEditor(task)}
            </li>
          ))}
        </ol>
        <button type="button" className="set-add" onClick={addTask} disabled={draft.tasks.length >= LIMITS.tasks}>
          + Add task
        </button>
      </section>
    );
  }

  function vowsSection() {
    return (
      <section aria-labelledby="set-vows-title">
        <div className="set-head">
          <div>
            <h2 id="set-vows-title">Vows</h2>
            <p>Held all day and sealed at night. An honest slip breaks the streak.</p>
          </div>
          <span className="set-count">
            {draft.vows.length}/{LIMITS.vows}
          </span>
        </div>
        <ol className="set-list">
          {draft.vows.map((vow, i) => (
            <li key={vow.id} className="set-item">
              <div className="set-row set-row--vow">
                <span className="set-num">◦</span>
                <input
                  className="set-inline"
                  value={vow.label}
                  maxLength={LIMITS.label}
                  aria-label={`Vow ${i + 1}`}
                  onChange={(e) =>
                    setVows(draft.vows.map((v) => (v.id === vow.id ? { ...v, label: e.target.value } : v)))
                  }
                />
                <label className="set-seal">
                  <span>Seal from</span>
                  <input
                    type="time"
                    value={toInput(vow.opensAt)}
                    onChange={(e) =>
                      setVows(
                        draft.vows.map((v) =>
                          v.id === vow.id ? { ...v, opensAt: fromInput(e.target.value) ?? 20 * 60 } : v,
                        ),
                      )
                    }
                  />
                </label>
                <span className="set-actions">
                  <button
                    type="button"
                    aria-label={`Move ${vow.label} up`}
                    disabled={i === 0}
                    onClick={() => reorder("vows", i, i - 1)}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    aria-label={`Move ${vow.label} down`}
                    disabled={i === draft.vows.length - 1}
                    onClick={() => reorder("vows", i, i + 1)}
                  >
                    ↓
                  </button>
                  <button type="button" className="danger" onClick={() => setDeleting(vow.id)}>
                    Delete
                  </button>
                </span>
              </div>
              {deleting === vow.id && (
                <div className="set-confirm" role="alert">
                  <span>Delete the vow “{vow.label || "Untitled"}”?</span>
                  <button
                    type="button"
                    className="set-button danger"
                    onClick={() => {
                      setVows(draft.vows.filter((v) => v.id !== vow.id));
                      setDeleting(null);
                    }}
                  >
                    Delete
                  </button>
                  <button type="button" className="set-button ghost" onClick={() => setDeleting(null)}>
                    Keep
                  </button>
                </div>
              )}
            </li>
          ))}
        </ol>
        <button
          type="button"
          className="set-add"
          disabled={draft.vows.length >= LIMITS.vows}
          onClick={() =>
            setVows([
              ...draft.vows,
              { id: makeId(`vow-${Date.now().toString(36)}`, takenIds()), label: "", opensAt: 20 * 60 },
            ])
          }
        >
          + Add vow
        </button>
      </section>
    );
  }

  return (
    <div className="cal-page set-page" role="dialog" aria-modal="true" aria-labelledby="set-title">
      <header className="cal-header">
        <div>
          <span className="cal-eyebrow">MAKE THE DAY YOURS</span>
          <h1 id="set-title">Settings.</h1>
        </div>
        <button className="cal-close" ref={closeRef} onClick={() => requestClose.current()}>
          Back to the ring <kbd>Esc</kbd>
        </button>
      </header>

      <div className="set-body">
        <nav className="set-nav" aria-label="Settings sections">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              className={section === s.id ? "on" : ""}
              aria-current={section === s.id ? "page" : undefined}
              onClick={() => setSection(s.id)}
            >
              {s.label}
            </button>
          ))}
        </nav>

        <div className="set-main">
          {(section === "routine" || section === "vows") && pending && (
            <div className="set-banner" role="status">
              <span>
                Saved changes start <b>{niceDate(pending.from)}</b> at 4 AM. Until then you're on your current routine.
              </span>
              <button type="button" className="set-button ghost" onClick={onCancelPending}>
                Cancel scheduled changes
              </button>
            </div>
          )}
          {(section === "routine" || section === "vows") && notice && (
            <div className="set-notice" role="status">
              {notice}
            </div>
          )}
          {section === "routine" && routineSection()}
          {section === "vows" && vowsSection()}
          {section === "account" && <AccountSection account={account} />}
          {section === "preferences" && <PreferencesSection />}
        </div>
      </div>

      {(section === "routine" || section === "vows") && (dirty || problem) && (
        <div className="set-savebar" role="region" aria-label="Unsaved changes">
          <span className={problem ? "set-problem" : ""}>
            {problem ??
              (canApplyNow
                ? "Unsaved changes."
                : `Unsaved changes. You've started today, so they'll begin ${tomorrow}.`)}
          </span>
          <button
            type="button"
            className="set-button ghost"
            onClick={() => {
              setDraft(base);
              setProblem(null);
              setEditing(null);
            }}
            disabled={!dirty || saving}
          >
            Discard
          </button>
          <button type="button" className="set-button" onClick={onSave} disabled={!dirty || saving}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      )}

      {choosing && (
        <div className="set-dialog" role="alertdialog" aria-modal="true" aria-labelledby="set-when">
          <div>
            <h3 id="set-when">When should this start?</h3>
            <p>You haven't done anything today yet, so you can switch now. Otherwise it starts tomorrow at 4 AM.</p>
            <div className="set-dialog-actions">
              <button type="button" className="set-button ghost" onClick={() => setChoosing(false)}>
                Back
              </button>
              <button type="button" className="set-button ghost" onClick={() => save("tomorrow")} disabled={saving}>
                Start tomorrow
              </button>
              <button type="button" className="set-button" onClick={() => save("now")} disabled={saving} autoFocus>
                Apply now
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmClose && (
        <div className="set-dialog" role="alertdialog" aria-modal="true" aria-labelledby="set-leave">
          <div>
            <h3 id="set-leave">Leave without saving?</h3>
            <p>Your changes to the routine will be lost.</p>
            <div className="set-dialog-actions">
              <button type="button" className="set-button ghost" onClick={() => setConfirmClose(false)} autoFocus>
                Keep editing
              </button>
              <button type="button" className="set-button danger" onClick={onClose}>
                Discard and leave
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** The name on your house in the city. Empty means your Google first name (or "You"). */
function HouseNameCard({ account }: { account: AccountInfo }) {
  const fallback = account.name?.split(/\s+/)[0] || "You";
  const [value, setValue] = useState(account.houseName ?? "");
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const changed = value.trim() !== (account.houseName ?? "");
  async function save(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      await saveHouseName(account.user, value);
      setMessage({ text: value.trim() ? "Saved. Your house sign is updated." : `Back to “${fallback}”.`, ok: true });
    } catch {
      setMessage({ text: "Couldn't save it. Check your connection.", ok: false });
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="set-card" onSubmit={save}>
      <h3>Name on your house</h3>
      <p>Shown on your sign and checklist board in the city. Leave it empty to use “{fallback}”.</p>
      <label className="set-field">
        <span>House name</span>
        <input
          value={value}
          maxLength={HOUSE_NAME_MAX}
          placeholder={fallback}
          onChange={(e) => {
            setValue(e.target.value);
            setMessage(null);
          }}
        />
      </label>
      <div className="set-card-foot">
        {message && (
          <span className={message.ok ? "set-ok" : "set-problem"} role="status">
            {message.text}
          </span>
        )}
        <button className="set-button" disabled={busy || !changed}>
          {busy ? "Saving…" : "Save name"}
        </button>
      </div>
    </form>
  );
}

function AccountSection({ account }: { account: AccountInfo }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const digits = (value: string) => value.replace(/\D/g, "").slice(0, PASSCODE_LENGTH);

  if (!account.user)
    return (
      <section aria-labelledby="set-account-title">
        <div className="set-head">
          <div>
            <h2 id="set-account-title">Account</h2>
            <p>Local mode: no accounts are set up in this build, so everything stays in this browser.</p>
          </div>
        </div>
        <HouseNameCard account={account} />
      </section>
    );

  async function change(e: FormEvent) {
    e.preventDefault();
    if (!account.user || busy) return;
    if (next.length !== PASSCODE_LENGTH)
      return setMessage({ text: `Use exactly ${PASSCODE_LENGTH} digits.`, ok: false });
    if (next !== confirm) return setMessage({ text: "The new passcodes don't match.", ok: false });
    setBusy(true);
    try {
      if (account.passcode && !(await verifyPasscode(current, account.passcode)))
        return setMessage({ text: "Your current passcode isn't right.", ok: false });
      await savePasscode(account.user, next);
      setCurrent("");
      setNext("");
      setConfirm("");
      setMessage({ text: "Passcode changed.", ok: true });
    } catch {
      setMessage({ text: "Couldn't change it. Check your connection.", ok: false });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="set-account-title">
      <div className="set-head">
        <div>
          <h2 id="set-account-title">Account</h2>
          <p>Your routine, vows and history are private to this account and sync to every device you sign in on.</p>
        </div>
      </div>
      <dl className="set-facts">
        <div>
          <dt>Name</dt>
          <dd>{account.user.name}</dd>
        </div>
        <div>
          <dt>Google account</dt>
          <dd>{account.user.email ?? "—"}</dd>
        </div>
      </dl>

      <HouseNameCard account={account} />

      <form className="set-card" onSubmit={change}>
        <h3>Change passcode</h3>
        <div className="set-grid set-grid--3">
          {(
            [
              ["Current", current, setCurrent, "current-password"],
              ["New", next, setNext, "new-password"],
              ["Confirm new", confirm, setConfirm, "new-password"],
            ] as const
          ).map(([label, value, set, auto]) => (
            <label className="set-field" key={label}>
              <span>{label}</span>
              <input
                type="password"
                inputMode="numeric"
                autoComplete={auto}
                maxLength={PASSCODE_LENGTH}
                value={value}
                onChange={(e) => set(digits(e.target.value))}
              />
            </label>
          ))}
        </div>
        <div className="set-card-foot">
          {message && (
            <span className={message.ok ? "set-ok" : "set-problem"} role="status">
              {message.text}
            </span>
          )}
          <button className="set-button" disabled={busy || !current || !next || !confirm}>
            {busy ? "Saving…" : "Change passcode"}
          </button>
        </div>
      </form>

      <div className="set-card">
        <h3>Sign out</h3>
        <p>Locks MonoChrome on this device and returns to the sign-in screen. Your data stays in your account.</p>
        <div className="set-card-foot">
          <button type="button" className="set-button ghost" onClick={() => void signOutAccount()}>
            Sign out
          </button>
        </div>
      </div>
    </section>
  );
}

function PreferencesSection() {
  const [muted, setMutedState] = useState(isMuted);
  useEffect(() => {
    const stop = onMuteChange(setMutedState);
    return () => {
      stop();
    };
  }, []);
  return (
    <section aria-labelledby="set-prefs-title">
      <div className="set-head">
        <div>
          <h2 id="set-prefs-title">Preferences</h2>
          <p>Saved on this device.</p>
        </div>
      </div>
      <label className="set-check set-card">
        <input type="checkbox" checked={!muted} onChange={(e) => setMuted(!e.target.checked)} />
        <span>
          <b>Sound effects</b>
          <small>Clicks while holding, a chime when a task is committed. Shortcut: M.</small>
        </span>
      </label>
      <div className="set-card">
        <h3>Keyboard</h3>
        <ul className="set-keys">
          <li>
            <kbd>E</kbd> hold to commit
          </li>
          <li>
            <kbd>←</kbd>
            <kbd>→</kbd> walk the ring
          </li>
          <li>
            <kbd>C</kbd> streak calendar
          </li>
          <li>
            <kbd>,</kbd> settings
          </li>
          <li>
            <kbd>H</kbd> hide the dock
          </li>
          <li>
            <kbd>M</kbd> sound
          </li>
          <li>
            <kbd>L</kbd> lock
          </li>
        </ul>
      </div>
    </section>
  );
}
