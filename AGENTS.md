# Agent notes

This repository is no longer connected to Lovable. GitHub is the source of truth.

- Stack: Bun server (`server/`) + React SPA (`src/`, Vite, TanStack Router/Query); shared types in `shared/`.
- Before pushing, run: `bun run lint && bun run typecheck && bun run test && bun run build`, and `bun run e2e` for anything touching the Play page, saves or the emulator.
- Never commit ROMs other than the MIT homebrew fixtures in `tests/fixtures/roms/`, or anything from a `data/` folder.
- Saves are the user's most valuable data: changes to `server/store.ts` (SRAM, locks) need tests in `server/app.test.ts`.
- Don't rewrite pushed history.
