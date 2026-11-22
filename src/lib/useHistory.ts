import { useCallback, useEffect, useRef, useState } from "react";
import { type DayRecord, isDayKey, loadHistory, sanitizeDay, saveHistory } from "../routine";
import { getFirebase } from "./firebase";

/*
 * The day history behind the app.
 *
 * Local-only mode (uid null): the original localStorage store.
 * Signed in: users/{uid}/days/{yyyy-mm-dd} in Firestore, kept live with a snapshot listener, so a
 * task ticked on the phone shows up on the laptop within a second. Firestore's offline cache makes
 * it open instantly and keep working without a connection.
 *
 * The first time an account with no history signs in on a device that has local history, that
 * history is copied up. The local copy is left in place as a backup.
 */

type History = Record<string, DayRecord>;
const IMPORTED_KEY = "monochrome.history.importedTo";

function readImportedTo() {
  try {
    return localStorage.getItem(IMPORTED_KEY);
  } catch {
    return null;
  }
}
function writeImportedTo(uid: string) {
  try {
    localStorage.setItem(IMPORTED_KEY, uid);
  } catch {
    // Without storage the import may be offered again; it only ever fills an empty account.
  }
}

export function useHistory(uid: string | null) {
  const [history, setHistory] = useState<History>(() => (uid ? {} : loadHistory()));
  const [ready, setReady] = useState(!uid);
  const uidRef = useRef(uid);

  // Local-only mode keeps writing to localStorage, exactly as before.
  useEffect(() => {
    if (!uid) saveHistory(history);
  }, [uid, history]);

  useEffect(() => {
    uidRef.current = uid;
    if (!uid) return;
    let cancelled = false;
    let stop = () => {};
    (async () => {
      const { db } = await getFirebase();
      const { collection, doc, onSnapshot, serverTimestamp, writeBatch } = await import("firebase/firestore");
      if (cancelled) return;
      const days = collection(db, "users", uid, "days");
      stop = onSnapshot(days, (snap) => {
        // First answer from the server and the account is empty: bring this device's history along.
        if (snap.empty && !snap.metadata.fromCache && !readImportedTo()) {
          const local = Object.entries(loadHistory());
          writeImportedTo(uid);
          if (local.length) {
            const batch = writeBatch(db);
            for (const [key, day] of local.slice(0, 450))
              batch.set(doc(days, key), { ...day, updatedAt: serverTimestamp() });
            batch.commit().catch((error) => console.error("History import failed", error));
          }
        }
        const next: History = {};
        snap.forEach((d) => {
          const day = isDayKey(d.id) ? sanitizeDay(d.data()) : null;
          if (day) next[d.id] = day;
        });
        setHistory(next);
        setReady(true);
      });
    })().catch((error) => console.error("History sync failed to start", error));
    return () => {
      cancelled = true;
      stop();
    };
  }, [uid]);

  /** Saves one day: on screen straight away, then to Firestore (which syncs it everywhere). */
  const saveDay = useCallback((key: string, record: DayRecord) => {
    setHistory((all) => ({ ...all, [key]: record }));
    const owner = uidRef.current;
    if (!owner) return;
    (async () => {
      const { db } = await getFirebase();
      const { doc, setDoc, serverTimestamp } = await import("firebase/firestore");
      await setDoc(doc(db, "users", owner, "days", key), { ...record, updatedAt: serverTimestamp() });
    })().catch((error) => console.error("Couldn't save the day", error));
  }, []);

  return { history, saveDay, ready };
}
