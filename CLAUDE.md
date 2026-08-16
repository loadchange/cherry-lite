## Guiding Principles (MUST FOLLOW)

### Mindset

How to approach any coding task in this repo.

#### Think Before Coding

- State assumptions explicitly. If uncertain, ask before implementing.
- When multiple interpretations exist, surface them — do not pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what is confusing. Ask.

#### Simplicity First

- Write the minimum code that solves the problem. Nothing speculative.
- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that was not requested.
- No error handling for impossible scenarios.
- If you wrote 200 lines and it could be 50, rewrite it.

#### Surgical Changes

- Touch only what the task requires. Do not "improve" adjacent code, comments, or formatting.
- Do not refactor things that are not broken.
- Match existing style even if you would do it differently.
- If you notice unrelated dead code, mention it — do not delete it.
- Remove imports / variables / functions that **your** changes orphaned. Leave pre-existing dead code alone unless asked.
- **v1 residue is a standing exception:** during the v2 refactor you may delete (not just flag) v1 dead code in an area you're already editing — see [v2 Refactoring → Coexistence Mindset](#coexistence-mindset). Unrelated v1 code and *fixing* v1 remain out of scope.
- Every changed line must trace directly to the user's request.

#### Goal-Driven Execution

- Convert tasks into verifiable goals before coding:
  - "Add validation" → "Write tests for invalid inputs, then make them pass."
  - "Fix the bug" → "Write a test that reproduces it, then make it pass."
  - "Refactor X" → "Ensure tests pass before and after."
- For multi-step tasks, state a brief plan with explicit verification per step:

```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
```

### Operational Rules

Project-specific tools, paths, and conventions.

- **Keep it clear**: Write code that is easy to read, maintain, and explain.
- **Read local READMEs first**: Before editing code in a directory, check for a `README.md` in that directory (and its parents) and read it — these files capture local conventions, invariants, and entry points that aren't obvious from the code alone.
- **Fix upstream, don't hack downstream**: When a new feature hits an existing module's limitation, flag the upstream improvement for the user's decision before proposing a downstream workaround.
- **Library-first, custom-last**: Before writing custom code, check library/framework docs for built-in options or existing solutions. Write custom code only when no adequate alternative exists.
- **Build with Tailwind CSS & Shadcn UI**: Use components from `@cherrystudio/ui` (located in `packages/ui`, Shadcn UI + Tailwind CSS) for every new UI component.
- **Log centrally**: Route all logging through `loggerService` with the right context—no `console.log`.
- **Access paths centrally**: Use `application.getPath('namespace.key', filename?)` for all main-process filesystem paths—never call `app.getPath()`, `os.homedir()`, or construct paths ad-hoc. Import the singleton via `import { application } from '@application'`.
- **Lint, test, and format before completion**: Coding tasks are only complete after running `pnpm lint`, `pnpm test`, and `pnpm format` successfully.
- **Write conventional commits**: Commit small, focused changes using Conventional Commit messages (e.g., `feat(data-api):`, `fix(lifecycle):`, `refactor(quick-assistant):`, `docs(testing):`, `chore(deps):`, `test(window-manager):`). Scope must be a specific kebab-case module, never generic like `main` — when `git log` conflicts with this rule, this rule wins.
- **Keep history linear**: On shared branches, never use plain `git pull` — it creates merge commits. Always `git pull --rebase` (or `git fetch && git rebase origin/<branch>`). Before `git push`, run `git fetch`; if `origin/<branch>` has advanced, rebase your local commits onto it first. If you notice a merge commit in local history that hasn't been pushed yet, rebase it away — cleaning one up after it's public requires a risky force-push on a shared branch.
- **Sign commits and sign off**: Every commit must be both cryptographically signed and DCO-signed off. Use `git commit -S --signoff` (not `--signoff` alone), verify the commit object contains a `gpgsig` header with `git cat-file commit HEAD`, and verify the pushed PR commits show `Verified` on GitHub.
- **Target the right branch**: `main` is the default branch for active development — submit features, refactors, optimizations, and fixes for the current codebase here. v1 maintenance fixes (hotfixes and subsequent v1 releases) must branch from and target the `v1` branch (never `main`); a v1 fix does not auto-carry to `main`, so forward-port it with a separate PR if the bug also exists on `main`. See [v2 Refactoring](#v2-refactoring-in-progress).

## Development

### Commands

Run `pnpm install` first (Node and pnpm versions are pinned in `package.json` — let it enforce them). For every other script, read `package.json` — the ones you must know:

- `pnpm lint` — oxlint + eslint fix + typecheck + i18n check + format (writes files)
- `pnpm test` — run all Vitest tests
- `pnpm format` — Biome format + lint (write mode)
- `pnpm build:check` — **REQUIRED before commits**. If it fails on i18n sort, run `pnpm i18n:sync` first; on formatting, run `pnpm format` first.
- `pnpm test:lint` — the CI-equivalent lint gate: it denies oxlint warnings that `pnpm lint` / `pnpm build:check` silently tolerate; run it when CI must pass.

### Testing

- Tests run with Vitest 3 (see `vitest.config.*` for project setup).
- **Test Mocking**: Use the unified mock system — do NOT create ad-hoc mocks for `application`, services, or data layers. See [tests/__mocks__/README.md](tests/__mocks__/README.md) for available mocks, usage patterns, and best practices.
- **Database Tests**: For any service/handler/seeder that reads or writes SQLite, use `setupTestDatabase()` from `@test-helpers/db` — it provides a real file-backed DB with production migrations. Do NOT hand-write `CREATE TABLE` SQL, override `@application`, or stub Drizzle chains.

### Patched Dependencies

Before upgrading any dependency, check `patches/` for custom patches.

## GitHub

### Pull Requests

When opening a PR, fill `.github/pull_request_template.md` completely.

### Code Review

When reviewing a GitHub PR, do NOT run `pnpm lint` / `pnpm test` / `pnpm format` locally — its CI already ran them; inspect via `gh` instead.

## Conventions

### TypeScript

- Cross-process types belong in `src/shared/`; renderer-only shared types in `src/renderer/types/`.

### Logging

```typescript
import { loggerService } from "@logger";
const logger = loggerService.withContext("moduleName");
// Renderer only: loggerService.initWindowSource('windowName') first
logger.info("message", CONTEXT);
logger.warn("message");
logger.error("message", error);
```

### Paths

**MUST READ**: [src/main/core/paths/README.md](src/main/core/paths/README.md) — namespaces, naming, adding new keys, testing patterns. (Rule stated in Guiding Principle "Access paths centrally".)

### i18n

- All user-visible strings must use `i18next` — never hardcode UI strings
- Run `pnpm i18n:check` to validate; `pnpm i18n:sync` to add missing keys
- Locale files in `src/renderer/i18n/`

### UI Design

For any UI component or page style work, use `@cherrystudio/ui` and follow existing colors, fonts, spacing, and component specs.

## Architecture

### Code Organization

Where each file and directory belongs — read the local `README.md` for the process you're touching before adding code or opening a directory. Each process root's top level is a **closed set**: route new code into an existing category, never a new top-level directory.

A directory's `index.ts` is a **barrel** — an enforced encapsulation boundary re-exporting one cohesive public API (internals private, outsiders import through it): re-export only (no logic / `export *`), no nesting, and it exists only if lint can seal off deep imports — else no barrel. `index.tsx` is always banned.

- Main process — `src/main/` directories (`core`/`ipc`/`data`/`ai`/`features`/`services`/`utils`/`i18n`) and dependency direction.
- Renderer — `src/renderer/` two-axis (type × domain) layout and downward-only layering.
- Shared — what belongs in `@shared` (cross-process + no mutable runtime state) and its closed top-level set.

### Data

| System     | Use Case                            | APIs                                                       |
| ---------- | ----------------------------------- | ---------------------------------------------------------- |
| BootConfig | Early boot settings (pre-lifecycle) | `bootConfigService.get()`, `usePreference('BootConfig.*')` |
| Cache      | Temp data (can lose)                | `useCache`, `useSharedCache`, `useSharedCacheValue`, `usePersistCache` |
| Preference | User settings                       | `usePreference`                                            |
| DataApi    | Business data (**critical**)        | `useQuery`, `useMutation`                                  |

Scope:

- **BootConfig**: sync file-based; direct in main (pre-lifecycle), via `usePreference('BootConfig.*')` otherwise
- **Cache**: memory / shared (cross-window) / persist tiers; memory + shared on both main and renderer; persist on both too but as **independent** stores (renderer = localStorage, main = JSON file at `{userData}/cache.json`), never shared — main additionally relays renderer persist sync between windows
- **Preference**: cross-process (main + renderer); auto-syncs across windows
- **DataApi**: SQLite-backed; no auto-sync, fetch on demand from renderer

Database: SQLite via **better-sqlite3** + Drizzle ORM — the driver is **synchronous** (queries and transactions run inline with no `await`, unlike the app's otherwise-async data layers), so `getDb()` queries and `withWriteTx(fn)` callbacks must be written synchronously. Schemas in `src/main/data/db/schemas/`, migrations via `pnpm db:migrations:generate`

**Write atomicity**: use `application.get('DbService').withWriteTx(fn)` to commit multiple writes (or a read-then-write) all-or-nothing in one synchronous `BEGIN IMMEDIATE` transaction; `fn` must be synchronous. A single write doesn't need it — better-sqlite3 runs each statement atomically on its one connection.

**DataApi boundary rule**: DataApi is for SQLite-backed business data only. No database table → no DataApi endpoint; use IPC instead.

### IPC (IpcApi)

Non-data command IPC (window/system/shell/notification/external/file) goes through **IpcApi** — the fifth subsystem alongside BootConfig/Cache/Preference/DataApi, RPC-over-IPC with single-point schemas (`schema + handler` to add a route; `ipcApi.request('namespace.action', input)` to call; `IpcApiService.broadcast`/`send` + `useIpcOn` for events). Legacy command IPC still coexists, so you'll encounter both. Decision: SQLite data → DataApi; user setting → Preference; losable/shared → Cache; everything else imperative → IpcApi.

### Window Manager

All `BrowserWindow` goes through `WindowManager` with one of three modes (`default` / `singleton` / `pooled`), declared per type in `src/main/core/window/windowRegistry.ts`.

- **Consumer API**: use only `open()` / `close()` — never `create()` / `destroy()` in business code.
- **Attach listeners in `onWindowCreated`**, not after `open()` — reused windows skip the latter.
- **Renderer reads init data via `useWindowInitData`**.

### Main Process Services (Lifecycle)

All main-process services that own long-lived resources or register persistent side effects **must** use the lifecycle system:

- **Extend `BaseService`**, apply `@Injectable`, `@ServicePhase`, `@DependsOn` decorators
- **Register in `serviceRegistry.ts`** (`src/main/core/application/serviceRegistry.ts`) — one line per service
- **Use `@DependsOn` for same-phase dependencies only** — do NOT declare dependencies on BeforeReady services (`PreferenceService`, `DbService`, `CacheService`, `DataApiService`) from WhenReady services; phase ordering is auto-enforced by the container
- **Access via `application.get('Name')`** (or `getOptional()` for `@Conditional` services)
- **Use `this.ipcHandle()` / `this.ipcOn()`** for IPC — auto-cleaned on stop/destroy, returns `Disposable`
- **Use `this.registerInterval()`** for recurring timers — auto-unref'd, exception-isolated, auto-cleaned on stop/destroy, returns `Disposable`
- **Use `this.registerDisposable()`** for cleanup tracking — accepts `Disposable` objects or `() => void` cleanup functions
- **Use `Emitter<T>` / `Event<T>`** for inter-service events, **`Signal<T>`** for one-shot completion
- **Implement `Activatable`** for services with heavy on-demand resources (IPC stays registered, resources load/release via `onActivate()`/`onDeactivate()`)
- **Do NOT** use `new` or manual singleton patterns — the container manages instantiation, ordering, and shutdown

### Non-Lifecycle Services (Direct-Import Singleton)

Services without long-lived resources or persistent side effects: use **named export singleton** (`export const x = new X()`). No `getInstance()` patterns.

## v2 Refactoring (In Progress)

> **Current state — read before contributing.** v1 and v2 code **coexist** on `main` while the refactor works through its cleanup stage — code you touch may still be deleted or reshaped. Heed `@deprecated` annotations in the code — they mark call sites slated for removal. (For where v1 fixes land, see **Target the right branch** in Operational Rules.)

### Coexistence Mindset

**v1 residue is throwaway.** v1 data reaches v2 only through the migrators in `src/main/data/migration/v2/` — never add fallbacks, dual-writes, or guards for v1 save / read / loss. When you're already editing an area, delete the v1 residue you touch (dead legacy-stack call sites, disabled v1 code blocks, now-unused modules) instead of leaving it in place. Don't go hunting for v1 code to delete in unrelated PRs, never delete code still wired into live v2 behavior (flag it instead), and don't fix v1 bugs on `main` — they go to the `v1` branch.

**The migration chain is no longer throwaway.** It was consolidated into a single clean initial migration and shipped with `v2.0.0-rc.1`, so `migrations/sqlite-drizzle/` now runs against databases holding real user rows. Never wipe or rewrite an already-shipped migration, and never tell a user to delete their database: schema changes go in as new appended migrations generated by `pnpm db:migrations:generate`. `src/main/data/db/schemas/` still changes freely — but every change must survive a migrate-forward on a populated database.

**Resolving migration merge conflicts: regenerate, never rename.** When an upstream migration conflicts with your local one, delete your local `.sql` + its `meta/*_snapshot.json` and re-run `pnpm db:migrations:generate`. Renaming/renumbering instead silently reuses the snapshot's random `id`, forking the chain for everyone — and `drizzle-kit generate` still exits `0`; only `pnpm db:migrations:check` catches it. CI enforces both the chain check and a schema↔migration generate-and-diff step.

### Preference and BootConfig schemas

Edit these files directly: `src/shared/data/preference/preferenceSchemas.ts`, `src/shared/data/bootConfig/bootConfigSchemas.ts`, and the v1→v2 mappings in `src/main/data/migration/v2/migrators/mappings/`.

### User-facing changes

用户能感知的变化写进 GitHub Release 说明即可。

## Local Instructions

If `CLAUDE.local.md` exists in the repository root (gitignored, may be absent), read it in full before acting on anything in this file — it holds the developer's private instructions and **OVERRIDES this file wherever they conflict**. Tools that auto-load it (e.g. Claude Code) need not re-read it.
