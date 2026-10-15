import { jwtVerify } from "jose";

// Customer-portal session check for the Next.js middleware. The backend signs portal tokens with
// a key derived from the shared secret ("<JWT_SECRET>|portal" — see Auth/PortalTokenService.cs),
// so a portal token can never pass as a staff session and vice versa.
export const PORTAL_COOKIE = "portal_session";

export async function verifyPortalToken(token: string): Promise<{ customerId: number; name: string } | null> {
  const secret = process.env.JWT_SECRET;
  if (!secret) return null;
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(`${secret}|portal`));
    if (payload.kind !== "portal") return null;
    return { customerId: Number(payload.customerId), name: String(payload.name ?? "") };
  } catch {
    return null;
  }
}
