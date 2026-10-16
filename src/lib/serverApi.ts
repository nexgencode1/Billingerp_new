import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE } from "@/lib/jwt";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:5215";

// Server Components run on the Next.js server itself, so they can't use a relative fetch("/api/...")
// the way client components do — there's no browser "current origin" to resolve against. This talks
// to the .NET backend directly, forwarding the session cookie so authorize() there still applies.
async function serverApiFetch(path: string): Promise<Response> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  const headers: HeadersInit = token ? { Cookie: `${SESSION_COOKIE}=${token}` } : {};
  return fetch(`${BACKEND_URL}${path}`, { headers, cache: "no-store" });
}

/**
 * Returns the parsed JSON body, or null on a 404/401 (no session). A 403 (role lacks permission)
 * redirects to /no-access and a 402 (module not in the plan) to the subscription page, instead of
 * crashing the page. Throws on any other non-OK status.
 */
export async function serverApiGet<T>(path: string): Promise<T | null> {
  const res = await serverApiFetch(path);
  if (res.status === 404 || res.status === 401) return null;
  if (res.status === 403) redirect("/no-access");
  if (res.status === 402) redirect("/settings/subscription");
  if (!res.ok) throw new Error(`serverApiGet(${path}) failed: ${res.status}`);
  return res.json() as Promise<T>;
}
