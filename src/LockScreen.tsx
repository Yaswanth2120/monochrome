import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import LockRing from "./LockRing";
import { sfx } from "./sound";
import { MonoLogo } from "./Logo";
import {
  type Account,
  AccountContext,
  authErrorMessage,
  confirmWithGoogle,
  readLocalHouseName,
  savePasscode,
  signInWithGoogle,
  takeResetConfirmation,
  signOutAccount,
  useAccount,
} from "./lib/account";
import { PASSCODE_LENGTH, verifyPasscode } from "./lib/passcode";

/*
 * A lock screen in front of the whole site: a black and white neighbourhood where Rocky lives the
 * routine (and you can play with him) on top, and the passcode underneath. Mac-style entry on computers,
 * iOS-style keypad on tablets and phones.
 *
 * With Firebase configured, the panel walks through three steps: sign in with Google, create a
 * 4-digit passcode (first time only), then unlock with it. Without Firebase (a fresh clone, local-only
 * mode) it falls back to the original built-in passcode.
 *
 * Note: this is a privacy screen, not security. The check runs in the browser, so anyone who
 * can open developer tools can get past it. It keeps a glance at your routine private.
 */

/** Only used in local-only mode, when there are no accounts. */
const LOCAL_PASSCODE = "1005";
const SESSION_KEY = "stride.unlocked";
const MAX_TRIES = 5;
const LOCKOUT_SECONDS = 30;
/** Lock again after this long in the background. */
const AWAY_MS = 10 * 60 * 1000;
export const LOCK_EVENT = "monochrome:lock";

export type Device = "desktop" | "tablet" | "phone";

/** Best guess at the kind of device, from the user agent and touch support. Override with ?device=. */
export function detectDevice(): Device {
  const forced = new URLSearchParams(window.location.search).get("device");
  if (forced === "desktop" || forced === "tablet" || forced === "phone") return forced;
  const ua = navigator.userAgent;
  const touch = navigator.maxTouchPoints > 1;
  const shortSide = Math.min(window.screen.width, window.screen.height);
  if (/iPhone|iPod/.test(ua) || (/Android/.test(ua) && /Mobile/.test(ua))) return "phone";
  // iPadOS reports itself as a Mac, but Macs have no touch screen.
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && touch) || /Android/.test(ua) || /Tablet/.test(ua)) return "tablet";
  if (touch && /Mobi/.test(ua)) return "phone";
  if (touch && !/Windows|Macintosh|X11|Linux x86/.test(ua)) return shortSide < 600 ? "phone" : "tablet";
  return "desktop";
}

/** Which identity ("local" or a uid) this tab is unlocked for, so a reload doesn't ask again. */
function readSession() {
  try {
    return sessionStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}
function writeSession(id: string | null) {
  try {
    if (id) sessionStorage.setItem(SESSION_KEY, id);
    else sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // Without storage the site simply asks again on reload.
  }
}

const identityOf = (account: Account) =>
  account.status === "signedIn" ? account.user.uid : account.status === "local" ? "local" : null;

/** Shows the lock screen until unlocked; the app only mounts after the first unlock for this account. */
export function Gate({ children }: { children: ReactNode }) {
  const account = useAccount();
  const identity = identityOf(account);
  const [unlockedFor, setUnlockedFor] = useState(readSession);
  const [mountedFor, setMountedFor] = useState<string | null>(null);
  const unlocked = identity !== null && unlockedFor === identity;
  // Signing out (identity null) or switching accounts unmounts the app and its data.
  const showApp = identity !== null && (unlocked || mountedFor === identity);

  useEffect(() => {
    const lock = () => {
      writeSession(null);
      setUnlockedFor(null);
    };
    let hiddenAt = 0;
    const onVisibility = () => {
      if (document.hidden) hiddenAt = Date.now();
      else if (hiddenAt && Date.now() - hiddenAt > AWAY_MS) lock();
    };
    window.addEventListener(LOCK_EVENT, lock);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener(LOCK_EVENT, lock);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  const unlock = useCallback(() => {
    if (!identity) return;
    writeSession(identity);
    setUnlockedFor(identity);
    setMountedFor(identity);
  }, [identity]);

  const signedIn = account.status === "signedIn" ? account : null;
  // Local-only mode keeps the house name in the browser.
  const [localHouseName, setLocalHouseName] = useState(readLocalHouseName);
  useEffect(() => {
    const update = () => setLocalHouseName(readLocalHouseName());
    window.addEventListener("monochrome:house-name", update);
    return () => window.removeEventListener("monochrome:house-name", update);
  }, []);
  const context = {
    uid: signedIn?.user.uid ?? null,
    name: signedIn?.user.name ?? null,
    user: signedIn?.user ?? null,
    passcode: signedIn?.passcode ?? null,
    houseName: signedIn ? signedIn.houseName : localHouseName,
  };

  return (
    <AccountContext.Provider value={context}>
      {showApp && (
        <div key={identity} inert={!unlocked} aria-hidden={!unlocked}>
          {children}
        </div>
      )}
      {!unlocked && <LockScreen account={account} onUnlock={unlock} />}
    </AccountContext.Provider>
  );
}

// ---------- The lock screen: his home on top, the passcode underneath ----------

const KEYS: [string, string][] = [
  ["1", ""],
  ["2", "A B C"],
  ["3", "D E F"],
  ["4", "G H I"],
  ["5", "J K L"],
  ["6", "M N O"],
  ["7", "P Q R S"],
  ["8", "T U V"],
  ["9", "W X Y Z"],
];

type Mode = "loading" | "error" | "signin" | "create" | "unlock";

function modeOf(account: Account, resetting: boolean): Mode {
  if (account.status === "local") return "unlock";
  if (account.status === "loading") return "loading";
  if (account.status === "error") return "error";
  if (account.status === "signedOut") return "signin";
  if (account.passcode === undefined) return "loading";
  return account.passcode === null || resetting ? "create" : "unlock";
}

const firstName = (name: string) => name.split(/\s+/)[0] || name;

function LockScreen({ account, onUnlock }: { account: Account; onUnlock: () => void }) {
  const [device] = useState(detectDevice);
  const [now, setNow] = useState(() => Date.now());
  const [code, setCode] = useState("");
  const [wrong, setWrong] = useState(0);
  const [shaking, setShaking] = useState(false);
  const [lockedUntil, setLockedUntil] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  /** Create mode: the first entry, waiting to be confirmed. */
  const [firstCode, setFirstCode] = useState<string | null>(null);
  /** "Forgot passcode?" after confirming with Google: set a new one. */
  const [resetting, setResetting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  /** Phones and tablets: the keypad stays tucked away so the city has the screen, and slides up on demand. */
  const [sheet, setSheet] = useState<"closed" | "open" | "closing">("closed");
  const [activity, setActivity] = useState(0);
  const swipeFrom = useRef<number | null>(null);
  const waiting = lockedUntil > now;
  const secondsLeft = Math.ceil((lockedUntil - now) / 1000);
  const mode = modeOf(account, resetting);
  const user = account.status === "signedIn" ? account.user : null;
  const typing = mode === "create" || mode === "unlock";

  useEffect(() => {
    if (!lockedUntil) return;
    const id = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, [lockedUntil]);
  useEffect(() => {
    if (device === "desktop" && typing && !leaving && !waiting) inputRef.current?.focus();
  }, [device, leaving, waiting, typing, firstCode]);

  const shake = useCallback(() => {
    sfx.denied();
    navigator.vibrate?.([60, 40, 60]);
    setShaking(false);
    requestAnimationFrame(() => setShaking(true));
    window.setTimeout(() => setShaking(false), 450);
    window.setTimeout(() => {
      setCode("");
      inputRef.current?.focus();
    }, 380);
  }, []);

  const succeed = useCallback(() => {
    // He cheers first, then the screen opens.
    sfx.unlocked();
    setSuccess(true);
    window.setTimeout(() => setLeaving(true), 1100);
    window.setTimeout(onUnlock, 1800);
  }, [onUnlock]);

  const submit = useCallback(
    async (attempt: string) => {
      if (busy || success) return;
      if (mode === "create" && user) {
        if (attempt.length !== PASSCODE_LENGTH) {
          setMessage(`Use exactly ${PASSCODE_LENGTH} digits.`);
          shake();
          return;
        }
        if (!firstCode) {
          setFirstCode(attempt);
          setMessage(null);
          setCode("");
          return;
        }
        if (attempt !== firstCode) {
          setFirstCode(null);
          setMessage("Those didn't match. Start again.");
          shake();
          return;
        }
        setBusy(true);
        try {
          await savePasscode(user, attempt);
          setResetting(false);
          succeed();
        } catch {
          setFirstCode(null);
          setMessage("Couldn't save your passcode. Check your connection.");
          shake();
        } finally {
          setBusy(false);
        }
        return;
      }
      if (mode !== "unlock") return;
      setBusy(true);
      let ok = false;
      try {
        ok =
          account.status === "signedIn" && account.passcode
            ? await verifyPasscode(attempt, account.passcode)
            : attempt === LOCAL_PASSCODE;
      } catch (e) {
        setMessage(e instanceof Error ? e.message : "Couldn't check the passcode.");
      } finally {
        setBusy(false);
      }
      if (ok) {
        setMessage(null);
        succeed();
        return;
      }
      shake();
      const tries = wrong + 1;
      setWrong(tries);
      if (tries >= MAX_TRIES) {
        setLockedUntil(Date.now() + LOCKOUT_SECONDS * 1000);
        setNow(Date.now());
        setWrong(0);
      }
    },
    [account, busy, firstCode, mode, shake, succeed, success, user, wrong],
  );

  const openSheet = useCallback(() => {
    setSheet("open");
    setActivity((n) => n + 1);
  }, []);
  const closeSheet = useCallback(() => {
    setSheet((state) => (state === "open" ? "closing" : state));
    window.setTimeout(() => {
      setSheet((state) => (state === "closing" ? "closed" : state));
      setCode("");
    }, 220);
  }, []);
  // Left open with nothing happening, the keypad slides away again.
  useEffect(() => {
    if (sheet !== "open" || success || busy) return;
    const id = window.setTimeout(closeSheet, 25_000);
    return () => window.clearTimeout(id);
  }, [sheet, activity, success, busy, closeSheet]);

  const press = useCallback(
    (digit: string) => {
      if (!typing || waiting || success || busy || code.length >= PASSCODE_LENGTH) return;
      sfx.key();
      setActivity((n) => n + 1);
      const next = code + digit;
      setCode(next);
      if (next.length === PASSCODE_LENGTH) window.setTimeout(() => submit(next), 150);
    },
    [busy, code, submit, success, typing, waiting],
  );
  const erase = useCallback(() => setCode((value) => value.slice(0, -1)), []);

  // Hardware keyboards: digits enter the code on every layout (letters and arrows drive him).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!typing || success || waiting) return;
      if (device === "desktop") {
        if (document.activeElement !== inputRef.current && /^\d$/.test(e.key)) {
          e.preventDefault();
          inputRef.current?.focus();
          sfx.key();
          setCode((value) => (value + e.key).slice(0, PASSCODE_LENGTH));
        }
        return;
      }
      if (/^\d$/.test(e.key)) {
        if (sheet === "closed") setSheet("open");
        press(e.key);
      } else if (e.key === "Backspace") erase();
      else if (e.key === "Escape") closeSheet();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [device, erase, press, success, typing, waiting, sheet, closeSheet]);

  async function signIn() {
    setBusy(true);
    setMessage(null);
    try {
      await signInWithGoogle();
    } catch (e) {
      setMessage(authErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function signOut() {
    setResetting(false);
    setFirstCode(null);
    setCode("");
    setMessage(null);
    await signOutAccount().catch(() => setMessage("Couldn't sign out. Try again."));
  }
  // Back from a Google redirect that confirmed "Forgot passcode?" (iPhone/iPad home-screen app).
  useEffect(() => {
    if (account.status !== "signedIn") return;
    let active = true;
    takeResetConfirmation().then((confirmed) => {
      if (!active || !confirmed) return;
      setResetting(true);
      setMessage("Confirmed. Choose a new passcode.");
    });
    return () => {
      active = false;
    };
  }, [account.status]);

  async function forgot() {
    setMessage(null);
    try {
      if ((await confirmWithGoogle()) === "redirecting") return;
      setResetting(true);
      setFirstCode(null);
      setCode("");
      setWrong(0);
      setLockedUntil(0);
      setMessage("Confirmed. Choose a new passcode.");
    } catch (e) {
      setMessage(authErrorMessage(e));
    }
  }

  const title =
    mode === "loading"
      ? "Loading your account…"
      : mode === "error"
        ? "Can't reach MonoChrome"
        : mode === "signin"
          ? "Sign in"
          : mode === "create"
            ? firstCode
              ? "Confirm Passcode"
              : resetting
                ? "New Passcode"
                : "Create a Passcode"
            : waiting
              ? `Try again in ${secondsLeft} ${secondsLeft === 1 ? "second" : "seconds"}`
              : "Enter Passcode";

  const hint = waiting
    ? `Too many attempts. Wait ${secondsLeft} seconds.`
    : message
      ? message
      : mode === "error" && account.status === "error"
        ? account.message
        : mode === "signin"
          ? "Your routine and streak, synced on every device."
          : mode === "create"
            ? firstCode
              ? "Type it once more to confirm."
              : `Choose ${PASSCODE_LENGTH} digits. You'll use them to unlock MonoChrome.`
            : mode === "unlock"
              ? wrong
                ? "Incorrect passcode."
                : device === "desktop"
                  ? "Type your passcode and press return."
                  : ""
              : "";

  const accountLinks = user && (
    <span className="lock-account">
      {firstName(user.name)} ·{" "}
      <button type="button" onClick={signOut}>
        Sign out
      </button>
      {mode === "unlock" && (
        <>
          {" · "}
          <button type="button" onClick={forgot}>
            Forgot passcode?
          </button>
        </>
      )}
    </span>
  );

  const googleButton = (
    <button type="button" className="lock-google" onClick={signIn} disabled={busy}>
      {busy ? "Opening Google…" : "Continue with Google"}
    </button>
  );

  return (
    <div
      className={`lock home-lock home-lock--${device} ${leaving ? "lock--leaving" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label={`Locked. ${title}.`}
    >
      <div className="home-scene">
        <LockRing success={success} />
      </div>
      {device !== "desktop" && sheet === "open" && !success && (
        <button type="button" className="home-backdrop" aria-label="Hide keypad" onClick={closeSheet} />
      )}

      <div className="home-panel">
        {device === "desktop" ? (
          <form
            className="home-login"
            onSubmit={(e) => {
              e.preventDefault();
              if (typing && code.length && !waiting) submit(code);
            }}
          >
            <div className="lock-avatar">
              <MonoLogo className="mono-logo" />
            </div>
            <div className="home-login-main">
              <span className="lock-name">MonoChrome</span>
              <span className="lock-tagline">
                {user && mode !== "create"
                  ? `Welcome back, ${firstName(user.name)}.`
                  : "Black-and-white world where discipline is the only colour."}
              </span>
              {typing ? (
                <div className="lock-field" data-shake={shaking}>
                  <input
                    ref={inputRef}
                    type="password"
                    inputMode="numeric"
                    autoComplete={mode === "create" ? "new-password" : "current-password"}
                    maxLength={PASSCODE_LENGTH}
                    placeholder={waiting ? `Try again in ${secondsLeft}s` : title}
                    aria-label={title}
                    value={code}
                    disabled={waiting || success || busy}
                    onChange={(e) => {
                      const value = e.target.value.replace(/\D/g, "").slice(0, PASSCODE_LENGTH);
                      if (value.length > code.length) {
                        sfx.key();
                      }
                      setCode(value);
                    }}
                  />
                  <button
                    type="submit"
                    aria-label={mode === "create" ? "Continue" : "Unlock"}
                    disabled={!code.length || waiting || busy}
                    className={code.length ? "ready" : ""}
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M5 12h14m-6-6 6 6-6 6" />
                    </svg>
                  </button>
                </div>
              ) : mode === "signin" ? (
                googleButton
              ) : (
                <span className="lock-status">{title}</span>
              )}
              <span className="lock-hint" aria-live="polite">
                {hint}
              </span>
              {accountLinks}
            </div>
            <ul className="home-controls" aria-label="Look around">
              <li>
                <kbd>Drag</kbd> look around · <kbd>Scroll</kbd> zoom · <kbd>0</kbd> reset view
              </li>
              <li>A demo day plays on the ring. Yours is behind the passcode.</li>
            </ul>
          </form>
        ) : (
          <>
            {sheet === "closed" ? (
              <div className="home-dock">
                {typing ? (
                  <button type="button" className="home-pill" onClick={openSheet} aria-expanded="false">
                    <svg width="12" height="14" viewBox="0 0 18 22" fill="none" aria-hidden="true">
                      <path
                        d="M4.5 9V6a4.5 4.5 0 0 1 9 0v3"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                      />
                      <rect x="1.5" y="9" width="15" height="11.5" rx="3" fill="currentColor" />
                    </svg>
                    {title}
                  </button>
                ) : mode === "signin" ? (
                  googleButton
                ) : (
                  <span className="home-pill home-pill--status">{title}</span>
                )}
                {hint && (!typing || message || waiting) && <span className="lock-hint lock-hint--pad">{hint}</span>}
              </div>
            ) : (
              <div className={`home-pad home-sheet ${sheet === "closing" ? "closing" : ""}`}>
                <button
                  type="button"
                  className="home-sheet-handle"
                  aria-label="Hide keypad"
                  onClick={closeSheet}
                  onPointerDown={(e) => (swipeFrom.current = e.clientY)}
                  onPointerUp={(e) => {
                    if (swipeFrom.current !== null && e.clientY - swipeFrom.current > 40) closeSheet();
                    swipeFrom.current = null;
                  }}
                >
                  <i />
                </button>
                <span className="lock-title" aria-live="polite">
                  {title}
                </span>
                <div
                  className="lock-dots"
                  data-shake={shaking}
                  aria-label={`${code.length} of ${PASSCODE_LENGTH} digits entered`}
                >
                  {Array.from({ length: PASSCODE_LENGTH }, (_, i) => (
                    <i key={i} className={i < code.length ? "on" : ""} />
                  ))}
                </div>
                {hint && <span className="lock-hint lock-hint--pad">{hint}</span>}
                <div className="lock-keys">
                  {KEYS.map(([digit, letters]) => (
                    <button key={digit} onClick={() => press(digit)} disabled={waiting || busy} aria-label={digit}>
                      <b>{digit}</b>
                      {letters && <small>{letters}</small>}
                    </button>
                  ))}
                  <span />
                  <button onClick={() => press("0")} disabled={waiting || busy} aria-label="0">
                    <b>0</b>
                  </button>
                  <button className="lock-delete" onClick={erase} disabled={!code.length} aria-label="Delete">
                    <svg
                      width="26"
                      height="20"
                      viewBox="0 0 26 20"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M8 1h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H8l-7-9 7-9z" />
                      <path d="m12 6 8 8m0-8-8 8" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>
                {accountLinks}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
