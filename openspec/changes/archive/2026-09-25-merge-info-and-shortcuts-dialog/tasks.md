The change is small and frontend only, so it ships as one pull request.

## 1. PR 1: merge shortcuts into the info dialog

- [x] 1.1 Extract the shortcut list from `ShortcutsComponent` into a `ShortcutListComponent`, two columns on wide screens and one below the small breakpoint
- [x] 1.2 Embed `ShortcutListComponent` in `DialogAboutComponent` below the info section, under a "Keyboard shortcuts" heading
- [x] 1.3 Make `DialogService.openAboutDialog` a no-op while the dialog is open, and clear the reference on `afterClosed`
- [x] 1.4 Pause map hotkeys while the info dialog is open and resume them on close
- [x] 1.5 Make `?` in `ShortcutsService` call `openAboutDialog` instead of navigating
- [x] 1.6 Remove the shortcuts button from the toolbar, the `shortcuts` route from `app.routes.ts`, and delete `ShortcutsComponent` with its styles and spec
- [x] 1.7 Move `PAGES.SHORTCUTS.TITLE` to `MODALS.INFO.SHORTCUTS_TITLE` and update `TOOLTIPS.INFO` in every locale
- [x] 1.8 Add an **info dialog** entry to `docs/glossary.md`
- [x] 1.9 Write unit tests: the list splits combos into keys as today, a second open is a no-op, hotkeys pause and resume
- [x] 1.10 Replace the shortcuts page e2e test: the info button and `?` open one dialog with the shortcut list, the URL stays on the map, a shortcut pressed inside the dialog changes nothing, Escape closes it
