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
