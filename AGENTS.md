# Project agent memory

This file is the project's committed home for project-intrinsic agent knowledge: build, test, release, architecture, and sharp-edge notes that should travel with the code.

- Add durable project-specific notes here as they are discovered through real work.

- Market-band sources are maintained in `SOURCES.md` and published through `src/data/sources.ts`; each `marketBand.sourceKey` names its registry row exactly, and `null` keeps a citation unlinked until its source is confirmed.
- Page metadata is configured in `src/site.config.ts` and applied through `src/site-metadata.ts`; `TODO_` values intentionally produce no metadata tag.
- Tracker code lives in `src/tracker/`; money is integer cents. The `events` dependency is for PouchDB (nothing imports it directly): a hand-written shim without `newListener` leaves the sync status stuck.
- Every tracker edit goes through `saveDoc` (`src/tracker/db.ts`), which stamps `updatedAt`; deletes (`removeDoc`) and the conflict merge (`mergeConflicts`) write directly, the merge on purpose so devices resolving the same conflict produce the same data. `src/tracker/merge.ts` uses `updatedAt` to merge offline edits from two devices field by field, so a form must save only the fields the user changed.

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file or command instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar for all agents and keep entries concise.
