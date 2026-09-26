## Why

The map editor explains itself in two places. The info button opens a dialog with the app description and the map's deletion date, and a separate shortcuts button, or `?`, leaves the map for a full shortcuts page at `/app/shortcuts`. Leaving the map to read one shortcut is a detour, and two buttons for help crowd the toolbar. Issue #955 asks to merge both into one dialog, as Excalidraw does with its help dialog.

## What Changes

- **Merge the shortcuts into the info dialog**: the info dialog keeps its current content at the top and lists every keyboard shortcut below it, in one scrolling dialog.
- **Stay on the map**: the dialog opens over the map. The URL, the selection and the zoom stay as they were, and closing the dialog returns to the map as the user left it.
- **One way in, two triggers**: the info button and the `?` shortcut both open the dialog. Pressing `?` while the dialog is open does not open a second one.
- **Shortcuts rest while the dialog is open**: no map shortcut acts on the map behind the dialog, and Escape closes it.
- **Retire the shortcuts page**: the shortcuts button leaves the toolbar, and the `/app/shortcuts` route goes away. An old link to it shows the not-found page.

## Non-goals

- Searching or filtering the shortcut list
- Changing, adding or removing any shortcut
- Letting users rebind shortcuts
- Moving the settings page into a dialog
- Changing the delete action or the content of the info section
- Linking to external documentation from the dialog

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `mind-map-core`: the info dialog gains the shortcut list, opens with `?`, and keeps map shortcuts from acting while open
- `navigation`: the shortcuts page and its button are removed

## Impact

- **Frontend only**: no backend, storage, sync or shared type changes.
- **Components**: `DialogAboutComponent` renders the shortcut list that `ShortcutsComponent` renders today, and `ShortcutsComponent` is deleted.
- **Routing and toolbar**: the `shortcuts` entry leaves `app.routes.ts`, the shortcuts button leaves the toolbar, and `ShortcutsService` opens the dialog on `?` instead of navigating.
- **Translations**: the shortcuts title moves from `PAGES.SHORTCUTS` to `MODALS.INFO` in every locale, and the info tooltip mentions shortcuts.
- **Tests**: the e2e test for the shortcuts page becomes a test for the merged dialog.
