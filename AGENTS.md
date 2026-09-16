# AGENTS.md

Guidance for AI coding agents (and humans) working on this repository.

## Runtime

This repository contains the DevoraIndex backend. It is a TypeScript Hono
application designed to run on Node.js 22 or later.

Use the following commands during development:

```sh
npm run dev
npm run check
npm run build
```

The local server listens on `http://127.0.0.1:3000` so it matches the AT
Protocol loopback OAuth redirect.

## Code quality

Biome owns formatting and linting. Keep the existing `biome.json` configuration
as the source of truth and use the package scripts rather than introducing a
second formatter or linter.

## Hono and validation

- Build HTTP routes with Hono.
- Validate request input with Zod before business logic runs.
- Keep route handlers thin; put OAuth, database, and domain logic in `src/` modules.
- Return consistent JSON errors and do not expose stack traces or secrets.

## Code Style

- Use TypeScript strict mode when applicable
- In Astro frontend code, use the `~/*` alias for imports rooted in `src/`,
  such as `~/components/Header.astro`; do not use relative paths to reach another `src/` directory.
- Keep Hono core imports relative with explicit `.js` extensions because the
  compiled Node ESM server does not resolve TypeScript `paths` aliases.
- Follow consistent naming conventions
- Document data schemas clearly
- Keep JSON datasets well-formatted and validated
- **All code must be written in English** (variable names, function names, comments, documentation)
- Prioritize readability over cleverness
- Run `npm run lint` after code changes; no test, build, or typecheck scripts are currently defined

## AT Protocol OAuth

Use the official [AT Protocol OAuth specification](https://atproto.com/specs/oauth)
and [OAuth tutorial](https://atproto.com/guides/oauth-tutorial) as the authority.

- Use `@atproto/oauth-client-node` for AT Protocol discovery, PKCE, PAR, DPoP,
  callback handling, token refresh, and session restoration.
- Keep OAuth state and AT Protocol sessions on the server. The browser should
  receive only an opaque, `httpOnly` application session cookie.
- Use the DID as the stable external identity. Treat handles as mutable display
  data and verify the returned DID during the callback.
- Request only the `atproto` scope for identity login. Add narrowly scoped
  permission scopes only when a feature must act on a user's PDS data.
- The current loopback metadata is for local development. A deployed client
  needs HTTPS metadata, a private signing key, and a public JWKS endpoint.

## Storage

The development app uses in-memory stores. Production implementations must use
Postgres or another shared durable store for:

- OAuth state records, with expiration and one-time deletion.
- AT Protocol saved sessions, including refresh and DPoP material, encrypted at rest.
- Application sessions, keyed by a random opaque token and linked to the user's DID.

Keep the storage interfaces framework agnostic so the Astro frontend and other
Hono consumers can share the same core implementation.

## API documentation

OpenAPI JSON and Scalar are development-only routes. Keep them disabled in
production and do not make production behavior depend on development packages.

When adding a route, update its Zod/OpenAPI schema at the same time.
