import { type NodeOAuthClient } from "@atproto/oauth-client-node";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { z } from "zod";
import { type AppSessionStore, AT_PROTO_SCOPE } from "./atproto-oauth.js";

const loginSchema = z.object({
  handle: z.string().trim().min(1).max(253),
});

const sessionCookie = "session";
const sessionTtlSeconds = 60 * 60 * 24 * 7;

export interface AuthRouteOptions {
  oauthClient: NodeOAuthClient;
  appSessionStore: AppSessionStore;
  publicUrl: string;
  scope?: string;
}

/**
 * Hono routes around the AT Protocol OAuth client.
 *
 * These routes intentionally only establish the protocol session. A later
 * application layer should map the authenticated DID to a local Postgres user.
 */
export function createAuthRoutes({
  oauthClient,
  appSessionStore,
  publicUrl,
  scope = AT_PROTO_SCOPE,
}: AuthRouteOptions): Hono {
  const routes = new Hono();

  routes.post("/login", zValidator("json", loginSchema), async (c) => {
    try {
      const { handle } = c.req.valid("json");
      const authUrl = await oauthClient.authorize(handle, { scope });
      return c.json({ redirectUrl: authUrl.toString() });
    } catch (error) {
      console.error(
        "OAuth login failed",
        error instanceof Error ? error.message : "unknown error",
      );
      return c.json({ error: "login_failed" }, 502);
    }
  });

  routes.get("/callback", async (c) => {
    try {
      const { session } = await oauthClient.callback(
        new URL(c.req.url).searchParams,
      );

      const appSession = await appSessionStore.create(
        session.did,
        sessionTtlSeconds,
      );
      setCookie(c, sessionCookie, appSession.id, {
        httpOnly: true,
        secure: new URL(publicUrl).protocol === "https:",
        sameSite: "Lax",
        maxAge: sessionTtlSeconds,
        path: "/",
      });
      return c.redirect(new URL("/", publicUrl).toString());
    } catch (error) {
      console.error("OAuth callback error:", error);
      return c.redirect(new URL("/?error=login_failed", publicUrl).toString());
    }
  });

  routes.post("/logout", async (c) => {
    const id = getCookie(c, sessionCookie);
    const appSession = id ? await appSessionStore.get(id) : undefined;
    if (appSession) {
      try {
        await oauthClient.revoke(appSession.did);
      } catch (error) {
        console.error("OAuth revoke error:", error);
      }
      await appSessionStore.del(appSession.id);
    }

    deleteCookie(c, sessionCookie, { path: "/" });
    return c.json({ success: true });
  });

  routes.get("/session", async (c) => {
    const id = getCookie(c, sessionCookie);
    const appSession = id ? await appSessionStore.get(id) : undefined;
    if (!appSession) return c.json({ user: null });

    try {
      const session = await oauthClient.restore(appSession.did);
      return c.json({ user: { did: session.did } });
    } catch {
      await appSessionStore.del(appSession.id);
      deleteCookie(c, sessionCookie, { path: "/" });
      return c.json({ user: null });
    }
  });

  return routes;
}
