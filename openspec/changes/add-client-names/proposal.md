## Why

Presence is anonymous: a client color is the only identity anyone has on a map. Issue #1358 asks for names, so that people on a map can tell each other apart and so that a later comments feature has a name to attach to a comment.

## What Changes

- **Add the display name**: an optional name a browser keeps in its user settings and uses on every map it opens. The server never stores it.
- **Set the name in two places**: from the own client's icon in the client list, and from a new field on the "General" tab of the settings page. Both edit the same setting.
- **Share the name through presence**: the awareness state of a client carries its display name next to its color and selection. A change applies live, without reconnecting.
- **Show initials in the client list**: a client with a display name shows its initials in its client color instead of the generic icon. The full name is its accessible label.
- **Stay anonymous by default**: a client without a display name looks and behaves as today and is labelled "Anonymous".
- **Treat remote names as untrusted**: every client normalizes a received name with the same rules it applies to its own, and renders it as text only.

## Non-goals

- User accounts, login, or any identity that survives clearing the browser storage
- Storing names on the server, in the database, or in the map
- A stable user id that ties clients across tabs, browsers or sessions
- Showing a name next to the node a remote client has selected
- A tooltip or hover card on the client list
- Generated or random names
- Uniqueness of names on a map
- Comments, and attaching a name to an edit
- Moderation of names

## Capabilities

### New Capabilities

- `client-names`: the display name, its normalization, where a user sets it, the anonymous default, and the initials in the client list

### Modified Capabilities

- `yjs-awareness`: the awareness state carries the display name, and the client list carries each client's name next to its color
- `settings`: the "General" tab gains the display name field

## Impact

- **Shared types**: `UserGeneralSettings` gains `displayName: string`, and `packages/shared` gains `normalizeDisplayName` and `displayNameInitials`.
- **Frontend**: `SettingsService` migrates stored settings without the field, `YjsSyncService` writes and reads the name in awareness, the client list component moves from a color list to a list of clients, and a small dialog edits the name.
- **Backend**: the default user settings return an empty `displayName`. The Yjs gateway relays awareness unchanged, so no server code reads the name.
- **Translations**: new keys in every locale file.
- **Glossary**: a new **Display name** entry, and the **Client list, client color** entry no longer calls presence anonymous without qualification.
- **No feature flag**: each PR leaves the app working, and a client without a name renders as today.
