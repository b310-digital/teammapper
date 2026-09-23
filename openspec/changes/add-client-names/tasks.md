Each section is one pull request and leaves `main` releasable. PR 1 stores and announces the display name with no way to set it outside the settings page and nothing that shows it, so the app looks as today. PR 2 shows it and adds the dialog. No feature flag is needed.

## 1. PR 1: setting and presence

- [ ] 1.1 Add `displayName: string` to `UserGeneralSettings` and `AwarenessUser` (`color`, `selectedNodeId`, `displayName`) to `packages/shared`
- [ ] 1.2 Add `normalizeDisplayName` and `displayNameInitials` to `packages/shared`, using `Intl.Segmenter` for graphemes
- [ ] 1.3 Return `displayName: ''` in the backend default user settings
- [ ] 1.4 Fill a missing `displayName` with `''` in `SettingsService.resolveUserSettings` and in the fallback path
- [ ] 1.5 Add the display name field with its hint to the "General" tab of the settings page, saving the normalized value
- [ ] 1.6 Write `displayName` in `setupAwareness` and `updateAwarenessSelection`, typed as `AwarenessUser`
- [ ] 1.7 Subscribe `YjsSyncService` to `SettingsService.userSettings` while a map is open, update awareness when the normalized name changes, and unsubscribe in teardown
- [ ] 1.8 Add the translation keys to every file in `teammapper-frontend/src/assets/i18n`
- [ ] 1.9 Add the **Display name** entry to `docs/glossary.md` and qualify "Presence is anonymous" in **Client list, client color**
- [ ] 1.10 Write shared unit tests: non-string input, control and format characters, whitespace, 30-grapheme cut with emoji, initials for one word, several words, emoji, empty name
- [ ] 1.11 Write frontend tests: settings migration without `displayName`, the settings field saves the normalized value, awareness carries the name on connect, on selection and after a rename with the selection kept

## 2. PR 2: client list and dialog

- [ ] 2.1 Add `displayName` to `ClientColorMappingValue` and read it through `normalizeDisplayName` in `buildColorMappingFromAwareness`
- [ ] 2.2 Emit `ClientListEntry[]` (`clientId`, `color`, `displayName`, `isSelf`) from `getClientListObservable` and track by `clientId` in the component
- [ ] 2.3 Render initials in a circle of the client color with black or white text by relative luminance, the generic icon without a name, and `aria-label` with the name or "Anonymous"
- [ ] 2.4 Make the own entry a button that opens `DialogDisplayNameComponent`, with "Save", "Cancel" and Escape
- [ ] 2.5 Update `src/test/mocks/yjs-sync.mock.ts` and other consumers of the client list type
- [ ] 2.6 Write unit tests: initials and fallback icon, accessible label, contrast of at least 4.5:1 for every `COLORS` entry, two clients with one color give two entries, a remote rename updates the entry, markup renders as text
- [ ] 2.7 Write e2e tests: set a name from the own icon and see initials in a second browser context, cancel keeps the name, the dialog opens on a view link, a name set in settings shows in the client list
