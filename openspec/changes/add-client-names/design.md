## Context

TeamMapper has no user accounts. A **client** is one open connection to a map, and two tabs are two clients. Each client announces itself through Yjs awareness in `YjsSyncService.setupAwareness`, which sets the local field `user` to `{ color, selectedNodeId }`. `updateAwarenessSelection` rewrites the whole field on every selection change. The backend's Yjs gateway keeps one `Awareness` instance per map and relays awareness updates without reading their content.

`buildColorMappingFromAwareness` turns the awareness states into a `ClientColorMapping` keyed by client id. `MapSyncService.extractClientListForSubscriber` flattens it into `string[]`, a list of colors, and `ClientColorPanelsComponent` renders one `account_circle` icon per color, tracked by color.

User settings live in the browser. `SettingsService.init` loads the defaults from the backend settings endpoint, merges the stored `UserSettings` over them in `resolveUserSettings`, and writes the result back to storage. `UserGeneralSettings` holds `language` and `darkMode`, and the "General" tab of the settings page edits them.

## Goals / Non-Goals

**Goals:**

- A display name per browser that every client of that browser announces on every map
- Other clients see initials in the client list, in the client color
- A name change reaches every other client without a reconnect
- A client that never sets a name behaves exactly as today

**Non-Goals:**

- Accounts, server-side storage, or a stable user id
- Names next to remote selections
- A tooltip on the client list

## Decisions

### 1. The name is a user setting

`UserGeneralSettings` gains `displayName: string`, and the empty string means no name. The backend default is `''`. `resolveUserSettings` fills the field with `''` when the stored settings lack it, the same way it handles a missing `darkMode`.

Keeping it in user settings means one name per browser, shared by all its tabs and maps, with no new storage key and no server change beyond the default.

**Alternative rejected:** a name per map. It asks the user again on every map for no gain while names carry no permissions.

**Alternative rejected:** `null` for no name. Every other general setting is a plain value, and an empty string needs no extra narrowing in templates.

### 2. The glossary calls it a display name

"Username" suggests an account and a login, which TeamMapper does not have. **Display name** says what the value does: it is what others see. The glossary gains the entry, and code uses `displayName`.

### 3. One normalization, applied on write and on read

`packages/shared` adds `normalizeDisplayName(value: unknown): string`:

1. Return `''` for a value that is not a string.
2. Remove control and format characters (Unicode categories `Cc` and `Cf`).
3. Collapse every run of whitespace to one space and trim.
4. Cut to 30 graphemes, counted with `Intl.Segmenter`, and trim again.

The settings field and the avatar dialog normalize before they save. `YjsSyncService` normalizes every name it reads from awareness, including its own, because awareness is relayed without validation and any client can send anything. Angular interpolation renders the result as text, and no template binds it to `innerHTML`.

30 graphemes fit a first and last name and keep a malicious name from bloating the presence payload of every client.

### 4. The name rides in the existing awareness field

The local field `user` becomes `{ color, selectedNodeId, displayName }`. `setupAwareness` reads the name from `SettingsService`, and `updateAwarenessSelection` keeps it when it rewrites the field. `YjsSyncService` subscribes to `SettingsService.userSettings` while a map is open and calls `setLocalStateField('user', …)` when the normalized name changes, and unsubscribes in its teardown.

A client of an older version omits the field, and reading it through `normalizeDisplayName` makes that client anonymous. An older client ignores the unknown field.

**Alternative rejected:** a separate awareness field `name`. Two fields would change in separate updates, and the selection write already owns the whole `user` object.

### 5. The client list becomes a list of clients

`ClientColorMappingValue` gains `displayName`. `getClientListObservable` emits `ClientListEntry[]`, each `{ clientId, color, displayName, isSelf }`, and the component tracks by `clientId`. Tracking by color broke already when two clients shared a color through the fallback, and names make each entry more than its color.

`ClientListEntry` and `ClientColorMappingValue` stay frontend types: they never cross the wire. The awareness payload type `AwarenessUser` goes to `packages/shared`, because the backend relays it and a future comments feature will read it.

### 6. Initials

`displayNameInitials(name: string): string` in `packages/shared` splits the normalized name on spaces, takes the first grapheme of the first word and, when there are two or more words, the first grapheme of the last word, and upper-cases them with `toLocaleUpperCase`. An empty name returns `''`.

The component shows the initials in a circle filled with the client color, with a text color chosen for contrast against it. An empty result shows the existing `account_circle` icon. The element carries `aria-label` with the full name, or the translated "Anonymous".

### 7. Editing from the own icon

The own entry in the client list is a button. It opens `DialogDisplayNameComponent` with one text field prefilled with the current name, "Save" and "Cancel". Save writes the normalized value through `SettingsService.updateCachedSettings`, and an empty value clears the name. The dialog works in read-only maps too, since a name is not a map edit.

The settings field on the "General" tab writes the same setting on change, like the existing general settings.

## Risks / Trade-offs

- **Impersonation**: anyone can type anyone's name. Names carry no permissions, and the proposal leaves moderation out. → Accept; a later comments feature must not treat a name as proof of identity.
- **Same initials**: two clients named "Anna Schmidt" and "Alex Stein" both show "AS". The client color still tells them apart. → Accept.
- **Privacy**: a name is visible to everyone holding the map link. → The field's hint text says so.
- **Contrast**: a light client color with white initials is unreadable. → Pick black or white per color by relative luminance, tested against the whole `COLORS` palette.

## Migration Plan

No data migration. Stored settings without `displayName` resolve to `''` on the next start. Mixed versions interoperate as described in decision 4.

## Open Questions

None.
