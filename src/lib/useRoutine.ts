import { useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_ROUTINE, type Routine, addDays, sanitizeRoutine } from "../routine";
import { getFirebase } from "./firebase";

/*
 * The user's routine (tasks and vows), with edits that wait for tomorrow.
 *
 * Stored at users/{uid}/settings/routine as { tasks, vows, pending }, where pending is
 * { tasks, vows, from } for a saved edit that starts on day `from`. Local-only mode keeps the
 * same shape in localStorage. A brand-new account is seeded with DEFAULT_ROUTINE straight away,
 * so the routine it started with is saved in the account and never depends on the code again.
 */

export type Pending = Routine & { from: string };
type RoutineDoc = Routine & { pending: Pending | null };

const LOCAL_KEY = "monochrome.routine.v1";

function sanitizeDoc(value: unknown): RoutineDoc | null {
  const routine = sanitizeRoutine(value);
  if (!routine) return null;
  const raw = (value as { pending?: { from?: unknown } }).pending;
  const pendingRoutine = raw ? sanitizeRoutine(raw) : null;
  const from = typeof raw?.from === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.from) ? raw.from : null;
  return { ...routine, pending: pendingRoutine && from ? { ...pendingRoutine, from } : null };
}

function readLocal(): RoutineDoc {
  try {
    const doc = sanitizeDoc(JSON.parse(localStorage.getItem(LOCAL_KEY) ?? "null"));
    if (doc) return doc;
  } catch {
    // Fall through to the default.
  }
  return { ...DEFAULT_ROUTINE, pending: null };
}
function writeLocal(doc: RoutineDoc) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(doc));
  } catch {
    // Without storage, edits last for the visit.
  }
}

/** Plain JSON for Firestore (it rejects undefined fields). */
const plain = <T>(value: T): T => JSON.parse(JSON.stringify(value));

async function writeRemote(uid: string, doc: RoutineDoc) {
  const { db } = await getFirebase();
  const { doc: ref, setDoc, serverTimestamp } = await import("firebase/firestore");
  await setDoc(ref(db, "users", uid, "settings", "routine"), { ...plain(doc), updatedAt: serverTimestamp() });
}

export function useRoutine(uid: string | null, today: string) {
  const [doc, setDocState] = useState<RoutineDoc>(() => (uid ? { ...DEFAULT_ROUTINE, pending: null } : readLocal()));
  const [ready, setReady] = useState(!uid);
  const docRef = useRef(doc);

  const commit = useCallback(
    async (next: RoutineDoc) => {
      docRef.current = next;
      setDocState(next);
      if (uid) await writeRemote(uid, next);
      else writeLocal(next);
    },
    [uid],
  );

  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    let stop = () => {};
    (async () => {
      const { db } = await getFirebase();
      const { doc: ref, onSnapshot } = await import("firebase/firestore");
      if (cancelled) return;
      stop = onSnapshot(
        ref(db, "users", uid, "settings", "routine"),
        { includeMetadataChanges: true },
        (snap) => {
          if (!snap.exists()) {
            // Only the server can say there's no routine yet; then seed the account with the default.
            if (snap.metadata.fromCache) return;
            const seed: RoutineDoc = { ...DEFAULT_ROUTINE, pending: null };
            writeRemote(uid, seed).catch((error) => console.error("Couldn't save the starting routine", error));
            docRef.current = seed;
            setDocState(seed);
            setReady(true);
            return;
          }
          const clean = sanitizeDoc(snap.data());
          if (clean) {
            docRef.current = clean;
            setDocState(clean);
          }
          setReady(true);
        },
        (error) => {
          console.error("Routine sync failed", error);
          setReady(true);
        },
      );
    })().catch((error) => {
      console.error("Routine sync failed to start", error);
      setReady(true);
    });
    return () => {
      cancelled = true;
      stop();
    };
  }, [uid]);

  // A pending edit whose day has come becomes the routine.
  const due = doc.pending && doc.pending.from <= today ? doc.pending : null;
  // The screen already shows it (derived below); this only saves the promotion.
  useEffect(() => {
    if (!due || !ready) return;
    const next: RoutineDoc = { tasks: due.tasks, vows: due.vows, pending: null };
    docRef.current = next;
    if (uid) writeRemote(uid, next).catch((error) => console.error("Couldn't apply the new routine", error));
    else writeLocal(next);
  }, [due, ready, uid]);

  const routine: Routine = due ? { tasks: due.tasks, vows: due.vows } : { tasks: doc.tasks, vows: doc.vows };
  const pending = due ? null : doc.pending;

  /** Save an edit: now (only allowed before any progress today) or from tomorrow. */
  const save = useCallback(
    (next: Routine, when: "now" | "tomorrow") => {
      const current = docRef.current;
      return commit(
        when === "now"
          ? { ...next, pending: null }
          : { tasks: current.tasks, vows: current.vows, pending: { ...next, from: addDays(today, 1) } },
      );
    },
    [commit, today],
  );

  /** Drop an edit that hasn't started yet. */
  const cancelPending = useCallback(() => commit({ ...docRef.current, pending: null }), [commit]);

  return { routine, pending, ready, save, cancelPending };
}
