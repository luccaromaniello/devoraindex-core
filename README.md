# devoraindex-core

Hono backend foundation for DevoraIndex.

## Development

```sh
npm install
npm run dev
```

The development server listens on `http://127.0.0.1:3000`.

Development routes:

- Check `GET /docs` for Scalar API documentation

The OAuth client uses in-memory stores during development. `createApp()` accepts
store implementations through `AppOptions`, so the state, AT Protocol session,
and application session stores can be backed by Postgres without changing the
Hono routes.

The `atproto` scope currently authenticates an AT Protocol identity. Add more
specific permission scopes only when the application needs to act on a user's
PDS data.

## Docker development

Copy the environment template and generate the encryption key:

```sh
cp .env.example .env
openssl rand -hex 32
```

Put the generated value in `OAUTH_ENCRYPTION_KEY`, then start the application:

```sh
docker compose up --build
```

The app listens on `http://127.0.0.1:3000`. Docker starts PostgreSQL and Redis,
runs the Prisma migration, and starts the Hono server. PostgreSQL stores
application sessions. Redis stores encrypted OAuth state and AT Protocol
sessions, including refresh and DPoP material.

Useful routes:

- `POST /oauth/login` with `{ "handle": "user.example.com" }`
- `GET /oauth/callback`
- `GET /oauth/session`
- `POST /oauth/logout`
- `GET /oauth/client-metadata.json`
- `GET /oauth/jwks.json`

## Local development without Docker

```sh
npm install
npm run dev
```

Without `DATABASE_URL` and `REDIS_URL`, the app uses in-memory stores and the
loopback OAuth client. Run `npm run check` and `npm run build` before committing.

## Production configuration

Production requires `PUBLIC_URL` to be an HTTPS origin, `DATABASE_URL`,
`REDIS_URL`, `OAUTH_ENCRYPTION_KEY`, and an ES256 private JWK in
`OAUTH_CLIENT_PRIVATE_JWK`. Generate a key with:

```sh
npm run oauth:generate-key
```

The production client metadata is published at
`/oauth/client-metadata.json`, and its public signing key is published at
`/oauth/jwks.json`. The Node OAuth SDK handles discovery, PKCE, PAR, DPoP,
callback verification, refresh, and session restoration.
