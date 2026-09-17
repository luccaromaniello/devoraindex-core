# Authentication flow

- The frontend sends `POST /oauth/login` with the user's AT Protocol handle.
- The backend uses `@atproto/oauth-client-node` for discovery, PKCE, PAR, and DPoP.
- The backend stores temporary OAuth state in encrypted Redis with a short TTL.
- The frontend opens the returned `redirectUrl` at the user's identity provider.
- The provider redirects to `GET /oauth/callback` with the authorization result.
- The backend verifies the callback, stores the encrypted AT Protocol session in Redis, and creates an application session in PostgreSQL.
- The backend sends an opaque `httpOnly` `session` cookie to the browser.
- The browser calls `GET /oauth/session` when it needs the current user's DID.

# Usual review query

- The frontend requests a review endpoint and automatically sends the `session` cookie.
- The backend hashes the opaque cookie and checks the application session cache in Redis first.
- On a Redis cache miss, the backend reads the durable application session from PostgreSQL and repopulates Redis for five minutes.
- If the session is missing or expired, the backend returns `401 Unauthorized`.
- The backend uses the session's DID as the authenticated user identity.
- The backend queries the user's reviews with Prisma, filtering by the authenticated DID or local user ID.
- PostgreSQL returns the review data to the backend.
- The backend returns the JSON response to the frontend; Redis stores OAuth state, AT Protocol session data, and the short-lived application-session cache.

# Logout

- The frontend sends `POST /oauth/logout`.
- The backend revokes the AT Protocol session, deletes the application session from Redis and PostgreSQL, and clears the cookie.
