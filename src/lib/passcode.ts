/*
 * Passcodes are never stored as digits. We keep a PBKDF2-SHA-256 hash with a random salt in the
 * user's private Firestore document, which only they can read (see firestore.rules).
 *
 * A 4-digit code is a privacy lock for a glance at the screen, not strong security: anyone who
 * could read the hash could try all 10,000 codes. Firestore rules are what keep the data private.
 */

export type StoredPasscode = { salt: string; hash: string; iterations: number };

const ITERATIONS = 150_000;
export const PASSCODE_LENGTH = 4;

const toHex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
const fromHex = (hex: string) => new Uint8Array(hex.match(/../g)?.map((pair) => parseInt(pair, 16)) ?? []);

async function derive(code: string, salt: Uint8Array, iterations: number) {
  if (!crypto?.subtle) throw new Error("Passcodes need a secure (https) connection.");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(code), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations },
    key,
    256,
  );
  return toHex(new Uint8Array(bits));
}

export async function hashPasscode(code: string): Promise<StoredPasscode> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return { salt: toHex(salt), hash: await derive(code, salt, ITERATIONS), iterations: ITERATIONS };
}

export async function verifyPasscode(code: string, stored: StoredPasscode) {
  const hash = await derive(code, fromHex(stored.salt), stored.iterations);
  // Compare every character so the check takes the same time whether it fails early or late.
  let diff = hash.length ^ stored.hash.length;
  for (let i = 0; i < hash.length; i++) diff |= hash.charCodeAt(i) ^ (stored.hash.charCodeAt(i) || 0);
  return diff === 0;
}

export function isStoredPasscode(value: unknown): value is StoredPasscode {
  const v = value as StoredPasscode | null;
  return (
    !!v &&
    typeof v.salt === "string" &&
    typeof v.hash === "string" &&
    typeof v.iterations === "number" &&
    v.iterations > 0
  );
}
