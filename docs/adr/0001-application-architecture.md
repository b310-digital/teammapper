---
status: accepted
date: 2026-10-02
---

# One self-hosted app: Angular client, NestJS server, shared packages, Yjs sync

## Context and Problem Statement

TeamMapper lets a team edit a mind map together in real time, without user
accounts, on infrastructure the operator hosts. Two choices shape the code
base: how the frontend, the backend and the wire format stay in agreement, and
how concurrent edits from several clients merge.

## Considered Options

Repository layout:

- One pnpm monorepo, with the wire types in a workspace package both apps import
- Separate repositories for frontend and backend, payload types copied into each

Edit sync:

- Yjs documents over a WebSocket, merged by the CRDT
- Typed edit messages over socket.io

## Decision Outcome

Chosen options: "one pnpm monorepo" and "Yjs documents over a WebSocket".

The monorepo gives every payload one type, in `@teammapper/shared`; copied
types drift until the copies disagree about what the server sends. Yjs merges
concurrent edits without conflict handling written for this app. TeamMapper
first synced through a socket.io gateway; #1221 made Yjs the default and #1300
deleted the gateway along with its message schemas and node validation.

The decision fixes these structures:

- The frontend holds each open map as a Yjs document. The backend's WebSocket
  gateway speaks the Yjs sync protocol for content and the awareness protocol
  for presence.
- The gateway checks every incoming update against the schemas in
  `@teammapper/shared`. An update that fails reaches no other client and no
  row. The gateway then discards the map's in-memory document and closes every
  connection to the map.
- The backend persists the Yjs document as map and node rows in PostgreSQL
  through TypeORM, on a debounce. The rows are the stored format, so the
  database stays queryable without decoding Yjs updates.
- The backend serves the built frontend, so one image plus PostgreSQL makes a
  complete deployment.
- Two secrets per map, the modification secret and the admin id, replace user
  accounts. A daily job deletes every map that no one has opened
  or edited for `DELETE_AFTER_DAYS`.

`packages/README.md` lists the workspace packages and their consumers.

### Consequences

- Good, because a payload change in `packages/shared` fails typecheck in both
  apps at once.
- Good, because presence travels apart from content, so losing presence loses
  no edits.
- Bad, because the packages must build before the apps compile, and
  `packages/shared` ships a CommonJS build for the backend and an ESM build for
  the frontend.
- Bad, because the backend keeps live Yjs documents in memory, which binds
  each map to one server instance and blocks horizontal scaling.
- Bad, because the conversion between the Yjs document and the rows must
  follow every change to the node model.
