import { createContext, useContext, useEffect, useState } from "react";
import { getFirebase, isFirebaseConfigured } from "./firebase";
import { type StoredPasscode, hashPasscode, isStoredPasscode } from "./passcode";

/*
 * Who is using MonoChrome on this device.
 *
 * - "local":     no Firebase config in this build; data stays in this browser (the original mode).
 * - "signedOut": Firebase is available but nobody has signed in yet.
 * - "signedIn":  a Google account. `passcode` is undefined while the profile loads, null when the
 *                account has no passcode yet, and the stored hash otherwise.
 */

export type AccountUser = { uid: string; name: string; email: string | null };
export type Account =
  | { status: "loading" }
  | { status: "local" }
  | { status: "signedOut" }
  | { status: "error"; message: string }
  | { status: "signedIn"; user: AccountUser; passcode: StoredPasscode | null | undefined };

export function useAccount(): Account {
  const [account, setAccount] = useState<Account>(() =>
    isFirebaseConfigured ? { status: "loading" } : { status: "local" },
  );

  useEffect(() => {
    if (!isFirebaseConfigured) return;
    let cancelled = false;
    let stopAuth = () => {};
    let stopProfile = () => {};

    (async () => {
      const { auth, db } = await getFirebase();
      const [{ onAuthStateChanged, getRedirectResult }, { doc, onSnapshot }] = await Promise.all([
        import("firebase/auth"),
        import("firebase/firestore"),
      ]);
      if (cancelled) return;
      // Finishes a sign-in that fell back to a full-page redirect (popup blocked).
      getRedirectResult(auth).catch(() => {});
      stopAuth = onAuthStateChanged(auth, (user) => {
        stopProfile();
        stopProfile = () => {};
        if (!user) {
          setAccount({ status: "signedOut" });
          return;
        }
        const profile: AccountUser = { uid: user.uid, name: user.displayName ?? "You", email: user.email };
        setAccount({ status: "signedIn", user: profile, passcode: undefined });
        stopProfile = onSnapshot(
          doc(db, "users", user.uid),
          { includeMetadataChanges: true },
          (snap) => {
            // An empty answer from the offline cache doesn't mean "no passcode": wait for the server,
            // or a returning user would be asked to create a new one.
            if (!snap.exists() && snap.metadata.fromCache) return;
            const stored = snap.data()?.passcode;
            setAccount({ status: "signedIn", user: profile, passcode: isStoredPasscode(stored) ? stored : null });
          },
          () => setAccount({ status: "error", message: "Couldn't load your account. Check your connection." }),
        );
      });
    })().catch(() => setAccount({ status: "error", message: "Couldn't reach MonoChrome's servers." }));

    return () => {
      cancelled = true;
      stopAuth();
      stopProfile();
    };
  }, []);

  return account;
}

async function googleProvider() {
  const { GoogleAuthProvider } = await import("firebase/auth");
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  return provider;
}

export async function signInWithGoogle() {
  const { auth } = await getFirebase();
  const { signInWithPopup, signInWithRedirect } = await import("firebase/auth");
  const provider = await googleProvider();
  try {
    await signInWithPopup(auth, provider);
  } catch (error) {
    const code = (error as { code?: string }).code;
    // Some browsers block popups; a full-page redirect always works.
    if (code === "auth/popup-blocked" || code === "auth/operation-not-supported-in-this-environment") {
      await signInWithRedirect(auth, provider);
      return;
    }
    throw error;
  }
}

/** Confirms it's really the account owner (used before resetting a forgotten passcode). */
export async function confirmWithGoogle() {
  const { auth } = await getFirebase();
  const { reauthenticateWithPopup } = await import("firebase/auth");
  if (!auth.currentUser) throw new Error("Not signed in.");
  await reauthenticateWithPopup(auth.currentUser, await googleProvider());
}

export async function signOutAccount() {
  const { auth } = await getFirebase();
  const { signOut } = await import("firebase/auth");
  await signOut(auth);
}

export async function savePasscode(user: AccountUser, code: string) {
  const { db } = await getFirebase();
  const { doc, setDoc, serverTimestamp } = await import("firebase/firestore");
  await setDoc(
    doc(db, "users", user.uid),
    { name: user.name, passcode: await hashPasscode(code), updatedAt: serverTimestamp() },
    { merge: true },
  );
}

/** A short, human message for a failed sign-in, or null when the user simply closed the popup. */
export function authErrorMessage(error: unknown): string | null {
  const code = (error as { code?: string }).code ?? "";
  if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") return null;
  if (code === "auth/operation-not-allowed") return "Google sign-in isn't switched on for this project yet.";
  if (code === "auth/unauthorized-domain") return "This address isn't allowed to sign in. Use the main site.";
  if (code === "auth/network-request-failed") return "No connection. Check your internet and try again.";
  if (code === "auth/user-mismatch") return "That's a different Google account. Use the one you signed in with.";
  return "Sign-in didn't work. Try again.";
}

/** The signed-in user for the app behind the lock screen; uid is null in local-only mode. */
export type AccountInfo = {
  uid: string | null;
  name: string | null;
  user: AccountUser | null;
  passcode: StoredPasscode | null;
};
export const AccountContext = createContext<AccountInfo>({ uid: null, name: null, user: null, passcode: null });
export const useAccountContext = () => useContext(AccountContext);
