# Contributing to Task Zero

This guide is written **LLM-first, human-second**. The style is imperative
("DO X / DO NOT Y / WHY: …") so an agent can follow it without re-deriving
intent. Humans should read it the same way — the rules apply equally.

If a rule here conflicts with the code, the **code is authoritative** —
verify before relying on this document, and update the doc when you find
drift.

---

## 1. What Task Zero is

Task Zero is a keyboard-first GTD plugin for Obsidian. It scans markdown
task lines (`- [ ] do the thing`), assigns each one a block ID
(`^tzab1`), and keeps a parallel in-memory database with the structured
fields (due date, scheduled, type, parent, etc.). The markdown stays
visually clean; the structured state lives in JSON files inside the
vault.

Stack: **TypeScript + Svelte 5 (runes)**, bundled with **esbuild**. No
test suite. Linted with eslint + `eslint-plugin-obsidianmd` + neostandard
(no semicolons, no JSX).

---

## 2. Repo layout

```
src/
  main.ts                       Plugin entry; commands, events, deviceId
  settings.ts                   Settings tab + DEFAULT_SETTINGS
  functions.ts                  Shared helpers (moment, debug, assignExisting, getOrCreateFile)
  classes/
    tasks.ts                    Tasks orchestrator — markdown ↔ db sync
    task.svelte.ts              Task class + TaskRow interface + enums
    table.ts                    Database — per-device sync files, LWW merge
    markdown-task-parser.ts     Parses a single task line into MarkdownTaskElements
    update-queue.ts             Debounced queue of paths to re-scan
    database-events.ts          Global pub/sub (singleton, see DatabaseEvent enum)
    detect-user.ts              Tracks whether THIS device is actively in use
    keymap-scope.ts             Obsidian keymap scope wrapper
  views/
    task-view.ts                ItemView host that mounts the Svelte tree
    hotkeys.ts                  Hotkey actions + modal
    task-input-modal.ts         Quick-capture / edit modal
    move-file-modal.ts          Move-task-to-file modal
    move-to-project-modal.ts    Move-task-to-project modal
    view-types.ts               Tab + State types, DefaultTabs
    components/                 Svelte 5 components (TaskTable, Sidebar, Tabs, Tab, NoteLink, Checkbox, Icon)
    suggest/                    Obsidian EditorSuggest implementations
manifest.json / versions.json   Obsidian plugin metadata; bumped by `npm version`
esbuild.config.mjs              Build (dev = watch, production = minified)
```

Everything ships as a single `main.js` bundle at the repo root.

---

## 3. Data flow (read this before changing anything)

```
                    user types in a note
                            │
            metadataCache 'changed' event (main.ts:86)
                            │
                  UpdateQueue.add(path)
                            │
              every 2s, if user is active
                            │
              Tasks.processTasksFromCacheUpdate
                            │
   ┌────────────────────────┴────────────────────────┐
   │                                                 │
   ▼                                                 ▼
write block ID `^tzXY` back to markdown      Database.insertOrUpdate(row)
(via vault.process)                          (in-memory + debounced write)
                                                     │
                                                     ▼
                                  _taskzero/db-<deviceId>.json
                                  (debounced 3s save in table.ts)
                                                     │
                                  vault 'modify'/'create' on a PEER file
                                                     │
                                  Tasks.#onPeerFileChanged → db.mergeFile (LWW)
                                                     │
                                  emits DatabaseEvent.TasksExternalChange
                                                     │
                                  TaskTable.svelte re-renders
```

Canonical state per task lives in **`_taskzero/db-<deviceId>.json`**.
Markdown is the user-facing surface; the JSON is the source of truth.

---

## 4. Hard rules

### 4.1 Clean markdown is sacred

DO keep task markdown lines visually clean.
DO put structured fields (due, scheduled, type, parent, etc.) in the
in-memory DB / per-device JSON, never in the markdown line.
DO write **only** the block ID (`^tzXY`) back to the markdown line.
DO NOT propose "just store it in the markdown" solutions for any new
field — that path is permanently closed.
WHY: clean markdown is the entire reason this plugin exists vs Tasks /
Dataview. The user plans to add many more fields; inlining them would
be unreadable and a parser nightmare.

### 4.2 Block ID format — coexistence, never migration

DO use `^tz<deviceId><taskId>` for new tasks (e.g. `^tzab1`).
DO leave legacy `^tz<digits>` IDs (e.g. `^tz123`) alone — they coexist
forever.
DO use `Tasks.taskLineRegex(id)` / `tasks.blockPrefix` rather than
hard-coding `^tz`.
DO NOT write a "migrate legacy IDs to new format" script.
DO NOT change the deviceId length (currently 2 lowercase letters,
676-name space, ~0.15% collision at 2 devices).
WHY: rewriting block IDs in markdown would break wikilinks like
`[[note#^tz12]]` in user notes. The parser distinguishes the two
formats at read time; both round-trip correctly.

`TaskRow.id` is a **string**. Anything that takes an id should accept
a string. Numeric ids from very old databases get stringified by
`Database.#migrateLegacyIds` on load.

### 4.3 Per-device DB files — the rules that matter most

Each device owns exactly one file: `_taskzero/db-<deviceId>.json`.
The file contains `{ appId, deviceId, rows: TaskRow[] }`.

DO write only to **your own** device file
(`Database.ownFilePath()` → `_taskzero/db-<myDeviceId>.json`).
DO read all matching peer files
(`/^_taskzero\/db-[a-z]{2}\.json$/`) and merge them in-memory with
per-task LWW on `updatedAt`, tiebreak by `updatedBy`.
DO call `db.#stampWrite(row)` on every mutating path so `updatedAt` /
`updatedBy` are updated. The existing `insert` / `update` / `upsert`
methods already do this — go through them.
DO check `db.isDeviceFile(path)` AND `!db.isOwnFile(path)` before
treating a vault event as a peer change (see `Tasks` constructor).
DO understand "ownership transfer": `writeOwnFile()` filters
`rows.filter(r => r.updatedBy === myDeviceId)`. Editing a task moves
it into the editing device's file. **Every task lives in exactly one
device file at a time.**
DO NOT write to another device's file. Ever. There is no shared file.
DO NOT bypass LWW. Don't merge by "newest file mtime" or "biggest row
count" — always per-task `updatedAt`, tiebreak by lexicographic
`updatedBy`.
DO NOT make the `_taskzero` folder path user-configurable. Two devices
with different paths would silently desync. The folder name is a
constant in `table.ts`.
DO NOT rely on collision-free deviceIds. If our file already exists
and contains a different `appId`, we collided — `regenerateDeviceId()`
re-rolls and the old rows merge in as a peer device's rows. Don't
remove or "fix" this path.

### 4.4 No premature optimization

DO measure (or honestly estimate) before adding a cache, memo, or
dedup. User-paced events (refresh every few seconds, renders of ~30
short markdown strings) are already cheap.
DO optimize render-hot paths (per-row work called many times per
refresh) when a real cost exists — see commits like
`Use cheap hasActiveDescendants boolean in render hot path`.
DO NOT add caches that introduce invalidation surface for sub-ms wins.
A `Map` that grows with task count and gets stale when a wikilink
target moves is a net loss.
WHY: the user has previously rolled back exactly this pattern (a
`renderedMarkdownCache`). Don't re-add it.

### 4.5 Obsidian API discipline

DO use `vault.process(file, fn)` for write-modify-write of file
contents (atomic, conflict-safe).
DO use `vault.adapter.read` / `.write` for files **outside** Obsidian's
markdown model (i.e. `_taskzero/db-*.json`) — see `table.ts`.
DO route async work through `void (async () => { … })()` or `void
promise` to satisfy eslint's `no-misused-promises` rule.
DO NOT use `any`. The eslint rule is `error`. If an Obsidian type
genuinely leaks `any`, narrow with a local interface or `as unknown
as X` — explicitly, not implicitly.

### 4.6 Svelte 5

Components are Svelte 5 with **runes** (`$state`, `$derived`,
`$effect`). Reactive logic in `.ts` files lives in `.svelte.ts`
files (e.g. `task.svelte.ts`).

DO use runes. DO NOT introduce Svelte 4 idioms (`$:` reactive
statements, writable stores, `export let`). Existing `TaskTable.svelte`
has a leading comment apologising for non-idiomatic Svelte — cleaning
those patterns up is in scope, regressing further is not.

---

## 5. Code style

- No semicolons (neostandard).
- Two-space indent.
- Single quotes.
- Private class fields use `#name` (real private, not `_name`).
- Prefer `readonly` on injected dependencies.
- Don't add docstrings or comments that just restate the code. Add a
  comment only when the **why** is non-obvious (a sync invariant, a
  race-condition workaround, an Obsidian quirk). Existing comments in
  `tasks.ts` / `table.ts` are good examples.

ESLint config: `eslint.config.mjs`. Run `npm run lint` before
committing. Notable rules: `@typescript-eslint/no-explicit-any: error`,
`@typescript-eslint/no-misused-promises: error`,
`no-void: ['error', { allowAsStatement: true }]`.

---

## 6. Build & dev loop

```
npm install
npm run dev       # esbuild watch — rebuilds main.js on save
npm run build     # tsc --noEmit (type check) + production bundle
npm run lint      # eslint src
```

This repo lives **inside an Obsidian vault** at
`<vault>/.obsidian/plugins/task-zero/`. `npm run dev` overwrites
`main.js` in place; reload the plugin in Obsidian (or restart Obsidian)
to pick up changes. There is no hot module reload.

There is no test suite. Verification = build, lint, then load the
plugin in Obsidian and exercise the affected flow by hand.

---

## 7. Versioning

Don't bump the version manually as part of a feature commit. The
`npm version` script runs `version-bump.mjs`, which updates
`manifest.json` and `versions.json` and stages them. Releases are a
separate commit (see git log: `0.2.6`, `0.2.5`, …).

---

## 8. Glossary

- **block ID** — `^tzXY` anchor appended to a markdown task line; the
  primary key tying markdown to a `TaskRow`.
- **device file** — `_taskzero/db-<deviceId>.json`, one per device,
  contains the rows this device currently owns.
- **deviceId** — 2 lowercase letters, per-device, persisted in
  settings. Different from `app.appId` (which is per Obsidian install
  and used only for collision detection inside the device file).
- **LWW** — Last-Writer-Wins. Per-task, on `updatedAt`, tiebreak by
  `updatedBy`.
- **orphan** — a task whose source markdown line no longer exists.
  Cleaned up after a grace window by `Tasks.cleanOrphans()`.
- **plugin folder** — `_taskzero/` in the vault root. Synced by
  Obsidian Sync (unlike the plugin's own `.obsidian/plugins/…/`
  directory). Hidden in the file tree by default via the
  `task-zero-hide-plugin-folder` body class.
