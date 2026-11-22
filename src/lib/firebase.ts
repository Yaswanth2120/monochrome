import type { FirebaseApp, FirebaseOptions } from "firebase/app";
import type { Auth } from "firebase/auth";
import type { Firestore } from "firebase/firestore";

/*
 * The one place MonoChrome talks to Firebase.
 *
 * The config comes from VITE_FIREBASE_* environment variables (.env.local locally, GitHub
 * repository variables in CI and deploys). Without them the app runs in local-only mode, so a
 * fresh clone still works. The SDK is loaded on first use with a dynamic import, which keeps
 * it out of the initial bundle until sign-in is actually needed.
 */

const env = import.meta.env;

const config: FirebaseOptions | null =
  env.VITE_FIREBASE_API_KEY && env.VITE_FIREBASE_PROJECT_ID && env.VITE_FIREBASE_APP_ID
    ? {
        apiKey: env.VITE_FIREBASE_API_KEY,
        authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
        projectId: env.VITE_FIREBASE_PROJECT_ID,
        storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
        messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
        appId: env.VITE_FIREBASE_APP_ID,
      }
    : null;

/** True when this build has a Firebase config; false means local-only mode. */
export const isFirebaseConfigured = config !== null;

export type FirebaseServices = { app: FirebaseApp; auth: Auth; db: Firestore };

let services: Promise<FirebaseServices> | null = null;

/** Initialise Firebase once and return the app, Auth and Firestore. */
export function getFirebase(): Promise<FirebaseServices> {
  if (!config) return Promise.reject(new Error("Firebase is not configured. Copy .env.example to .env.local."));
  services ??= (async () => {
    const [
      { initializeApp },
      { getAuth },
      { initializeFirestore, persistentLocalCache, persistentMultipleTabManager },
    ] = await Promise.all([import("firebase/app"), import("firebase/auth"), import("firebase/firestore")]);
    const app = initializeApp(config);
    const auth = getAuth(app);
    const useEmulators = env.VITE_USE_FIREBASE_EMULATORS === "true";
    // Cache data on the device so the app opens instantly and keeps working offline;
    // changes sync when the connection comes back. The tab manager shares the cache across tabs.
    const db = initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });
    // Local development and tests: talk to `firebase emulators:start` instead of the real project.
    if (useEmulators) {
      const [{ connectAuthEmulator }, { connectFirestoreEmulator }] = await Promise.all([
        import("firebase/auth"),
        import("firebase/firestore"),
      ]);
      connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
      connectFirestoreEmulator(db, "127.0.0.1", 8080);
    }
    return { app, auth, db };
  })();
  return services;
}
