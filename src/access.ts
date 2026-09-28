import { createRemoteJWKSet, jwtVerify } from "jose";

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
let jwksTeam = "";

function teamDomain(env: Env): string {
  return (env.CF_ACCESS_TEAM_DOMAIN || "").replace(/\/$/, "");
}

function jwksFor(env: Env): ReturnType<typeof createRemoteJWKSet> | null {
  const team = teamDomain(env);
  if (!team || !env.CF_ACCESS_AUD) return null;
  if (!jwks || jwksTeam !== team) {
    jwks = createRemoteJWKSet(new URL(`${team}/cdn-cgi/access/certs`));
    jwksTeam = team;
  }
  return jwks;
}

/** True when Access JWT verification is configured (production). */
export function accessConfigured(env: Env): boolean {
  return Boolean(env.CF_ACCESS_AUD && env.CF_ACCESS_TEAM_DOMAIN);
}

/**
 * When Access is configured, require + verify Cf-Access-Jwt-Assertion.
 * Local / unset Access env → allow (wrangler dev).
 * Production without Access env yet → require JWT header presence (edge Access still needed).
 */
export async function requireAccess(
  request: Request,
  env: Env,
): Promise<Response | null> {
  const host = new URL(request.url).hostname;
  const local =
    host === "127.0.0.1" ||
    host === "localhost" ||
    env.CF_ACCOUNT_ID === "REPLACE";

  if (!accessConfigured(env)) {
    if (local) return null;
    if (!request.headers.get("Cf-Access-Jwt-Assertion")) {
      return new Response(JSON.stringify({ error: "unauthorised" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      });
    }
    return null;
  }

  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!token) {
    return new Response(JSON.stringify({ error: "unauthorised" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  const keys = jwksFor(env);
  if (!keys) {
    return new Response(JSON.stringify({ error: "unauthorised" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  try {
    await jwtVerify(token, keys, {
      issuer: teamDomain(env),
      audience: env.CF_ACCESS_AUD,
    });
    return null;
  } catch (err) {
    console.log("access jwt invalid", err);
    return new Response(JSON.stringify({ error: "unauthorised" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }
}

/** Path prefixes gated by Access (admin SPA + admin API). */
export function isAdminPath(pathname: string): boolean {
  return (
    pathname === "/admin" ||
    pathname === "/admin/" ||
    pathname.startsWith("/admin/") ||
    pathname === "/admin.html" ||
    pathname.startsWith("/api/")
  );
}
