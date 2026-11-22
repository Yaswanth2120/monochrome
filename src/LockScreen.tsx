import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import LockScene from "./LockScene";
import { sfx } from "./sound";
import { MonoLogo } from "./Logo";

/*
 * A lock screen in front of the whole site: a black and white neighbourhood where Rocky lives the
 * routine (and you can play with him) on top, and the passcode underneath. Mac-style entry on computers,
 * iOS-style keypad on tablets and phones.
 *
 * Note: this is a privacy screen, not security. The check runs in the browser, so anyone who
 * can open developer tools can get past it. It keeps a glance at your routine private.
 */

const PASSCODE = "1005";
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

function readUnlocked() {
  try {
    return sessionStorage.getItem(SESSION_KEY) === "1";
  } catch {
    return false;
  }
}
function writeUnlocked(value: boolean) {
  try {
    if (value) sessionStorage.setItem(SESSION_KEY, "1");
    else sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // Without storage the site simply asks again on reload.
  }
}

/** Shows the lock screen until unlocked; the app only mounts after the first unlock. */
export function Gate({ children }: { children: ReactNode }) {
  const [locked, setLocked] = useState(() => !readUnlocked());
  const [everUnlocked, setEverUnlocked] = useState(() => readUnlocked());

  useEffect(() => {
    const lock = () => {
      writeUnlocked(false);
      setLocked(true);
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
    writeUnlocked(true);
    setEverUnlocked(true);
    setLocked(false);
  }, []);

  return (
    <>
      {everUnlocked && (
        <div inert={locked} aria-hidden={locked}>
          {children}
        </div>
      )}
      {locked && <LockScreen onUnlock={unlock} />}
    </>
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

function LockScreen({ onUnlock }: { onUnlock: () => void }) {
  const [device] = useState(detectDevice);
  const [now, setNow] = useState(() => Date.now());
  const [code, setCode] = useState("");
  const [wrong, setWrong] = useState(0);
  const [shaking, setShaking] = useState(false);
  const [lockedUntil, setLockedUntil] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [pulse, setPulse] = useState(0);
  const [error, setError] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const waiting = lockedUntil > now;
  const secondsLeft = Math.ceil((lockedUntil - now) / 1000);

  useEffect(() => {
    if (!lockedUntil) return;
    const id = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, [lockedUntil]);
  useEffect(() => {
    if (device === "desktop" && !leaving && !waiting) inputRef.current?.focus();
  }, [device, leaving, waiting]);

  const check = useCallback(
    (attempt: string) => {
      if (attempt === PASSCODE) {
        // He cheers first, then the screen opens.
        sfx.unlocked();
        setSuccess(true);
        window.setTimeout(() => setLeaving(true), 1100);
        window.setTimeout(onUnlock, 1800);
        return;
      }
      sfx.denied();
      navigator.vibrate?.([60, 40, 60]);
      setError((value) => value + 1);
      setShaking(false);
      requestAnimationFrame(() => setShaking(true));
      window.setTimeout(() => setShaking(false), 450);
      const tries = wrong + 1;
      setWrong(tries);
      if (tries >= MAX_TRIES) {
        setLockedUntil(Date.now() + LOCKOUT_SECONDS * 1000);
        setNow(Date.now());
        setWrong(0);
      }
      window.setTimeout(() => {
        setCode("");
        inputRef.current?.focus();
      }, 380);
    },
    [onUnlock, wrong],
  );

  const press = useCallback(
    (digit: string) => {
      if (waiting || success || code.length >= 4) return;
      sfx.key();
      setPulse((value) => value + 1);
      const next = code + digit;
      setCode(next);
      if (next.length === 4) window.setTimeout(() => check(next), 150);
    },
    [check, code, success, waiting],
  );
  const erase = useCallback(() => setCode((value) => value.slice(0, -1)), []);

  // Hardware keyboards: digits enter the code on every layout (letters and arrows drive him).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (success || waiting) return;
      if (device === "desktop") {
        if (document.activeElement !== inputRef.current && /^\d$/.test(e.key)) {
          e.preventDefault();
          inputRef.current?.focus();
          sfx.key();
          setPulse((value) => value + 1);
          setCode((value) => (value + e.key).slice(0, 8));
        }
        return;
      }
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === "Backspace") erase();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [device, erase, press, success, waiting]);

  return (
    <div className={`lock home-lock home-lock--${device} ${leaving ? "lock--leaving" : ""}`} role="dialog" aria-modal="true" aria-label="Locked. Enter your passcode.">
      <LockScene signals={{ pulse, error, success }} lowDetail={device === "phone"} />

      <div className="home-panel">
        {device === "desktop" ? (
          <form
            className="home-login"
            onSubmit={(e) => {
              e.preventDefault();
              if (code.length && !waiting) check(code);
            }}
          >
            <div className="lock-avatar">
              <MonoLogo className="mono-logo" />
            </div>
            <div className="home-login-main">
              <span className="lock-name">MonoChrome</span>
              <span className="lock-tagline">Black-and-white world where discipline is the only colour.</span>
              <div className="lock-field" data-shake={shaking}>
                <input
                  ref={inputRef}
                  type="password"
                  inputMode="numeric"
                  autoComplete="current-password"
                  maxLength={8}
                  placeholder={waiting ? `Try again in ${secondsLeft}s` : "Enter Passcode"}
                  aria-label="Passcode"
                  value={code}
                  disabled={waiting || success}
                  onChange={(e) => {
                    const value = e.target.value.replace(/\D/g, "");
                    if (value.length > code.length) {
                      sfx.key();
                      setPulse((p) => p + 1);
                    }
                    setCode(value);
                  }}
                />
                <button type="submit" aria-label="Unlock" disabled={!code.length || waiting} className={code.length ? "ready" : ""}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M5 12h14m-6-6 6 6-6 6" />
                  </svg>
                </button>
              </div>
              <span className="lock-hint">
                {waiting ? `Too many attempts. Wait ${secondsLeft} seconds.` : wrong ? "Incorrect passcode." : "Type your passcode and press return."}
              </span>
            </div>
            <ul className="home-controls" aria-label="How to play">
              <li>
                <kbd>Click</kbd> a house or building to visit · <kbd>W A S D</kbd> walk Rocky · <kbd>Space</kbd> jump
              </li>
              <li>
                <kbd>Drag</kbd> orbit · <kbd>Scroll</kbd> zoom · <kbd>Right-drag</kbd> pan
              </li>
              <li>
                <kbd>Q</kbd>
                <kbd>E</kbd> rotate · <kbd>F</kbd> follow · <kbd>R</kbd> back to Rocky
              </li>
            </ul>
          </form>
        ) : (
          <div className="home-pad">
            <span className="lock-title" aria-live="polite">
              {waiting ? `Try again in ${secondsLeft} ${secondsLeft === 1 ? "second" : "seconds"}` : "Enter Passcode"}
            </span>
            <div className="lock-dots" data-shake={shaking} aria-label={`${code.length} of 4 digits entered`}>
              {[0, 1, 2, 3].map((i) => (
                <i key={i} className={i < code.length ? "on" : ""} />
              ))}
            </div>
            <div className="lock-keys">
              {KEYS.map(([digit, letters]) => (
                <button key={digit} onClick={() => press(digit)} disabled={waiting} aria-label={digit}>
                  <b>{digit}</b>
                  {letters && <small>{letters}</small>}
                </button>
              ))}
              <span />
              <button onClick={() => press("0")} disabled={waiting} aria-label="0">
                <b>0</b>
              </button>
              <button className="lock-delete" onClick={erase} disabled={!code.length} aria-label="Delete">
                <svg width="26" height="20" viewBox="0 0 26 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true">
                  <path d="M8 1h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H8l-7-9 7-9z" />
                  <path d="m12 6 8 8m0-8-8 8" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
