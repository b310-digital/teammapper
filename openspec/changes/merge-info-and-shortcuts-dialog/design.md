## Context

`DialogAboutComponent` is a `MatDialog` that `DialogService.openAboutDialog` opens with `maxHeight: '90vh'`. It shows the app name and version, the description, the deletion policy and date, the GitHub link, and a delete button for a client that holds the map's admin id.

`ShortcutsComponent` is a routed page at `/app/shortcuts`. It reads `ShortcutsService.getHotKeys()`, splits each combo into keys, and lists them in two columns. Navigating there unmounts the map component, and its close button calls `Location.back()`, which loads the map again. `ShortcutsService` registers `?` to navigate to that route, and the toolbar has a shortcuts button with `routerLink="/app/shortcuts"`.

## Goals / Non-Goals

**Goals:**

- One dialog holds the info and the shortcut list
- Reading the shortcuts never leaves or reloads the map

**Non-Goals:**

- Any change to which shortcuts exist or what they do
- Turning the settings page into a dialog

## Decisions

### 1. One scrolling dialog, info first

The dialog stacks two sections in one `mat-dialog-content`:

```
+-------------------------------------------+
| TeamMapper 1.2.3                          |
|-------------------------------------------|
| [logo] description                        |
| deletion policy and date, GitHub link     |
|                                           |
| Keyboard shortcuts                        |
|  Ctrl + Z   Undo      |  Tab   Add node   |
|  Ctrl + Y   Redo      |  ...              |
|-------------------------------------------|
| [Close]                  [Delete mindmap] |
+-------------------------------------------+
```

The shortcut list shows two columns on a wide screen and one column below the Material small breakpoint. The dialog keeps `maxHeight: '90vh'` and scrolls its content, so the actions stay reachable on a phone.

**Alternative rejected:** two tabs. A tab hides half the content behind a click, and the info section is short enough to sit above the list.

### 2. Extract the shortcut list into its own component

The key splitting and the list markup move from `ShortcutsComponent` into a presentational `ShortcutListComponent` that the dialog embeds. It reads `ShortcutsService.getHotKeys()` once on init. `ShortcutsComponent`, its route, its styles and its spec are deleted.

This keeps `DialogAboutComponent` small and lets the list be tested without the dialog's map and storage dependencies.

### 3. `?` opens the dialog through `DialogService`

The `?` callback calls `DialogService.openAboutDialog()` instead of `router.navigate`. `openAboutDialog` returns early while `aboutModalRef` refers to an open dialog, so a second `?` or a click on the info button does nothing. The reference is cleared on `afterClosed`.

### 4. Map shortcuts pause while the dialog is open

`angular2-hotkeys` listens on the document, so a shortcut pressed inside the dialog would act on the map. `DialogService` pauses the map hotkeys while the info dialog is open and resumes them on `afterClosed`. `MatDialog` already closes on Escape.

### 5. The route goes away without a redirect

The `shortcuts` entry leaves `app.routes.ts`. `/app/shortcuts` then matches the `**` route and shows the not-found page. The route was only ever reached from inside the app, so a redirect would keep code alive for bookmarks few users hold.

### 6. Translations

`PAGES.SHORTCUTS.TITLE` moves to `MODALS.INFO.SHORTCUTS_TITLE` in every locale, and `PAGES.SHORTCUTS` is removed. `TOOLTIPS.INFO` changes to "Opens info and shortcuts". `TOOLTIPS.SHORTCUTS` stays, because it describes the `?` entry in the list.

## Risks / Trade-offs

- **Longer dialog**: the info dialog grows from a few lines to a long list. The info stays on top, so a user who opened it for the deletion date sees that first.
- **Lost bookmarks**: a saved `/app/shortcuts` link shows the not-found page. The not-found page links back to the start page.
