import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { env } from "@/lib/env";

const STATE_COOKIE = "gh_install_state";
const STATE_TTL_SEC = 10 * 60;

interface InstallStatePayload {
  userId: string;
  nonce: string;
  exp: number;
}

export interface VerifiedInstallState {
  userId: string;
}

function base64url(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input) : input;
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromBase64url(input: string): Buffer {
  return Buffer.from(input.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

function sign(value: string): string {
  return base64url(
    createHmac("sha256", env.ENCRYPTION_KEY_BYTES).update(value).digest(),
  );
}

export function generateState(userId: string): string {
  const payload: InstallStatePayload = {
    userId,
    nonce: randomBytes(32).toString("hex"),
    exp: Math.floor(Date.now() / 1000) + STATE_TTL_SEC,
  };
  const encoded = base64url(JSON.stringify(payload));
  return `${encoded}.${sign(encoded)}`;
}

export async function setStateCookie(state: string): Promise<void> {
  const store = await cookies();
  store.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: STATE_TTL_SEC,
  });
}

export async function readStateCookie(): Promise<string | null> {
  const store = await cookies();
  return store.get(STATE_COOKIE)?.value ?? null;
}

export async function clearStateCookie(): Promise<void> {
  const store = await cookies();
  store.delete(STATE_COOKIE);
}

export function verifyState(
  fromQuery: string | null,
  fromCookie: string | null,
): boolean {
  if (!fromQuery || !fromCookie) return false;
  if (fromQuery.length !== fromCookie.length) return false;

  const a = Buffer.from(fromQuery, "utf8");
  const b = Buffer.from(fromCookie, "utf8");
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function verifyInstallState(
  fromQuery: string | null,
): VerifiedInstallState | null {
  if (!fromQuery) return null;

  const [encoded, signature] = fromQuery.split(".");
  if (!encoded || !signature) return null;

  const expected = sign(encoded);
  const a = Buffer.from(signature, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return null;

  try {
    if (!timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }

  let payload: InstallStatePayload;
  try {
    payload = JSON.parse(fromBase64url(encoded).toString("utf8"));
  } catch {
    return null;
  }

  if (
    !payload ||
    typeof payload.userId !== "string" ||
    typeof payload.exp !== "number" ||
    payload.exp < Math.floor(Date.now() / 1000)
  ) {
    return null;
  }

  return { userId: payload.userId };
}
