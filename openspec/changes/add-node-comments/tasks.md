Each section is one pull request of roughly 500 changed lines, tests included, and leaves `main` releasable. PR 1 stands on its own. PR 2 and PR 3 are independent of each other. PR 4 needs both, PR 5 needs PR 4, PR 6 needs PR 5. No feature flag is needed, because no comment can be written until PR 6 ships. PR 5 uses translation keys that PR 6 fills in; the panel is unreachable until then.

## 1. PR 1: stale client guard (~250 lines)

- [ ] 1.1 Create a generation id per hydration in `YjsDocManager`, keep it in the doc entry and write it to `meta.generation`
- [ ] 1.2 Parse the `generation` parameter in the gateway and close with `WS_CLOSE_STALE_DOC = 4009` on a mismatch before `setupSync`
- [ ] 1.3 Set `provider.params.generation` after the first sync in `YjsSyncService` and reload the page on close code 4009
- [ ] 1.4 Tests: a mismatched generation is refused before any sync message and leaves the doc unchanged; a matching or missing one is accepted; a new hydration gets a new id; the client sets the parameter and reloads on 4009

## 2. PR 2: comments in storage and the server Y.Doc (~500 lines)

- [ ] 2.1 Add `MapComment` and its valibot schema to `packages/shared`, exported from the entry point
- [ ] 2.2 Add the `MmpComment` entity and the migration creating `mmp_comment` with its key and cascade
- [ ] 2.3 Hydrate the `comments` map from `mmp_comment` in `yjs-doc-manager.service.ts` and `yDocConversion.ts`
- [ ] 2.4 Persist valid comments whose node exists in the same transaction as the nodes in `yjs-persistence.service.ts`
- [ ] 2.5 Copy the comments in the duplicate endpoint
- [ ] 2.6 Tests: schema limits; hydrate and persist round trip; a comment of a missing node is not written and stays in the Y.Doc; an invalid comment is skipped; duplication copies; map deletion cascades

## 3. PR 3: comment badge in the renderer (~250 lines)

- [ ] 3.1 Add `setCommentCounts` and the `commentBadgeClick` event to `packages/mmp`, export them from the entry point and add them to the frontend mmp mock
- [ ] 3.2 Draw the badge left of the node, redraw it when a node moves, is renamed or is shown, and strip it from image export
- [ ] 3.3 mmp specs: badge drawn and removed by count; no badge on hidden nodes; click emits the node id; export contains no badge

## 4. PR 4: comments service in the frontend (~400 lines)

- [ ] 4.1 Add `CommentsService` observing `comments` and `nodes`, filtering by existing nodes, exposing comments per node and calling `setCommentCounts`
- [ ] 4.2 Add `add`, `edit` and `remove` writing with origin `'comment'`, validated against the schema and refused on read-only clients
- [ ] 4.3 Clear `comments` in the import transaction
- [ ] 4.4 Tests: removing a node hides its comments; undo and redo of the removal show and hide them; comment writes leave the undo stack unchanged; remote changes update the counts; import clears comments

## 5. PR 5: comment panel (~420 lines)

- [ ] 5.1 Add `CommentPanelComponent` with the node name, the list, the input, edit, delete and the collapse button, hidden until opened
- [ ] 5.2 Keep the open state in `CommentsService` and follow the selected node while open, with a hint when nothing is selected
- [ ] 5.3 Submit with the save button and Ctrl or Cmd+Enter, cancel an edit with Escape, and hide input and actions on read-only clients
- [ ] 5.4 Add the **Comment**, **Comment badge** and **Comment panel** entries to `docs/glossary.md`
- [ ] 5.5 Component tests: empty text not submittable; keys typed in the input reach no map shortcut; read-only shows no input; the list follows the selection

## 6. PR 6: entry points, texts and end-to-end (~430 lines)

- [ ] 6.1 Add the comment button to the toolbar, disabled without selection and on read-only clients, opening the panel with the input focused
- [ ] 6.2 Open the panel from `commentBadgeClick` after selecting the node
- [ ] 6.3 Add the texts of the panel, the button and the badge to every language file
- [ ] 6.4 Toolbar tests: disabled states and focus
- [ ] 6.5 E2E: client A comments on a node, client B sees the badge and the comment, edits it, A removes the node, the comment disappears on both, A undoes and both see it again
- [ ] 6.6 E2E: a read-only client sees the comment and has no input
