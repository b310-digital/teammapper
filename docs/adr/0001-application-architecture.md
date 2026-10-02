# One self-hosted app: Angular client, NestJS server, shared packages, Yjs sync

## Context and Problem Statement

TeamMapper lets a team edit a mind map together in real time, without user
accounts, on infrastructure the operator hosts. The app needs a structure that
keeps the frontend, the backend and the wire format in agreement, syncs
concurrent edits without conflicts, and deploys as a single container next to
PostgreSQL. This record covers the top-level split into workspaces and the
connectors between them.

## Considered Options

- pnpm monorepo: Angular frontend, NestJS backend, shared workspace packages, Yjs over WebSocket
- Separate repositories for frontend and backend, payload types copied into each
- Server-authoritative edit messages (socket.io events) instead of a CRDT

## Decision Outcome

Chosen option: "pnpm monorepo: Angular frontend, NestJS backend, shared
workspace packages, Yjs over WebSocket", because it is the only option that
gives one source of truth for every type that crosses the wire and merges
concurrent edits without custom conflict handling.

The structure:

- `teammapper-frontend`: Angular app. Renders the mind map with
  `@teammapper/mmp` and holds the map as a Yjs document.
- `teammapper-backend`: NestJS app. Serves the built frontend, exposes REST
  endpoints (maps, images, Mermaid, AI generate) and a WebSocket gateway that
  speaks the Yjs sync and awareness protocols. Awareness carries presence.
- `packages/shared`: domain models, validation schemas and algorithms used by
  both apps.
- `packages/mmp`: the d3 renderer, browser-only, consumed by the frontend alone.
- `packages/mermaid-mindmap-parser`: vendored Mermaid parser for import.
- PostgreSQL via TypeORM: the backend converts the Yjs document into map and
  node rows on a debounce, so the database stays queryable and the Yjs document
  is never the stored format.
- Access rests on two secrets per map (modification secret, admin id) instead
  of accounts. A scheduled job deletes maps after `DELETE_AFTER_DAYS`.

### Consequences

- Good, because a payload change in `packages/shared` fails typecheck in both
  apps at once.
- Good, because Yjs merges concurrent edits, and presence travels apart from
  content.
- Good, because one Docker image plus PostgreSQL is the whole deployment.
- Bad, because the packages must be built before the apps compile, and the
  shared package ships both a CommonJS and an ESM build.
- Bad, because the backend keeps live Yjs documents in memory, which ties a map
  to one server instance and limits horizontal scaling.
- Bad, because converting between the Yjs document and relational rows is code
  that must track every change to the node model.
