# PokeVerse

A private, self-hosted Game Boy Advance player for Gen 3 Pokémon, with guides, checklists and notes next to the game. ROMs and saves live on NexusBody; access is tailnet-only through Tailscale Serve. One user, no accounts. Tailscale is the auth layer.

The product spec is in [`docs/MVP.md`](docs/MVP.md).

## What it does

- **Library:** your games from `games.json`, a "continue" card for the last save, and playtime per game.
- **Saves that follow you:** in-game saves (SRAM) upload automatically a few seconds after you save in the game. They are gzipped, written atomically, and the last 20 versions of each save are kept. Pick the save up on any device on the tailnet.
- **Save lock:** one device plays a save at a time. Opening it elsewhere asks before taking over, and the old device stops writing.
- **Save states:** 4 slots per save, with thumbnails.
- **Play page:** fast-forward, screenshot, volume, integer scaling, and normal, theater or fullscreen view (the side panel becomes a drawer in fullscreen; toggle it with <kbd>`</kbd>).
- **Side panel:**
  - Guide: your Markdown files, with a per-save "you are here" marker, or an external walkthrough link.
  - Checklist: badges, Elite Four, legendaries, HMs and the National Dex, with progress stored per save.
  - Notes.
  - Type and nature charts.
  - A Nuzlocke Tracker link.
- **Controls:** remappable keyboard and gamepad (stored server-side), plus on-screen touch controls on phones and tablets.

## How it works

```
Browser (tailnet)
  │  https://<nexusbody>.<tailnet>.ts.net  (Tailscale Serve → 127.0.0.1:8080)
  ▼
Bun server  (server/)           one process, one container
  ├─ /api/*        JSON + binary API, zod-validated, SQLite (bun:sqlite)
  ├─ /             React SPA (Vite build, TanStack Router + Query)
  ├─ /emulator.html  same-origin iframe running EmulatorJS + mGBA (WASM)
  └─ /vendor/ejs/  EmulatorJS files, served locally (never from a CDN)
        │
        ▼
  /data  (volume on NexusBody)
```

- The emulator runs in its own iframe and talks to the Play page over `postMessage` ([`shared/emulator-protocol.ts`](shared/emulator-protocol.ts)). It loads the ROM and SRAM from the API, polls SRAM every 2 s, and uploads once two polls agree, so a save that's still mid-write in the game never gets uploaded.
- **Security:**
  - Path params are validated ids that get looked up in SQLite or `games.json`; file names never come from requests. ([`server/files.ts`](server/files.ts) `safeJoin` is the backstop.)
  - Every HTML response carries a strict CSP. The emulator page's `connect-src 'self'` stops EmulatorJS from contacting anything off the box.
  - The server binds to `127.0.0.1` unless `HOST` says otherwise.
- **Why EmulatorJS:** its mGBA core runs without threads, so the page needs no cross-origin isolation (COOP/COEP). That keeps external guide embeds working and avoids threading problems on iOS Safari.

## Data folder

Everything lives under one folder (`DATA_DIR`, mounted at `/data` in Docker). Start by copying [`data.example/`](data.example):

```
data/
├── library/
│   ├── games.json        ← your games (see below)
│   ├── roms/             ← ROM dumps (.gba, .zip, .7z)
│   ├── boxart/           ← optional cover images
│   └── bios/gba_bios.bin ← optional; mGBA has a built-in BIOS replacement
├── guides/<game-id>/*.md ← optional Markdown walkthroughs, one file per town/route
├── checklists/<id>.json  ← optional overrides for the built-in checklists
├── saves/                ← written by the app: SRAM, SRAM history, save states
└── pokeverse.db          ← written by the app: saves, progress, notes, settings
```

### `games.json`

```json
{
  "games": [
    {
      "id": "radical-red",
      "title": "Radical Red",
      "region": "Kanto",
      "rom": "radical-red.gba",
      "boxArt": "radical-red.jpg",
      "mechanics": "modern",
      "guideUrl": "https://example.com/walkthrough",
      "checklist": "radical-red"
    }
  ]
}
```

| Field | Required | Notes |
|---|---|---|
| `id` | yes | lowercase letters, digits and dashes; used in URLs and to pick the checklist |
| `title` | yes | |
| `rom` | yes | file name in `library/roms/` |
| `region` | no | shown on the library card |
| `boxArt` | no | file name in `library/boxart/`; without it you get a generated title tile |
| `mechanics` | no | `gen3` (default) or `modern` for hacks with the Gen 6+ type chart and Fairy |
| `guideUrl` | no | `https://` walkthrough, shown when there's no Markdown guide |
| `checklist` | no | checklist template id; defaults to `id` |

Built-in checklists exist for `ruby`, `sapphire`, `emerald`, `firered`, `leafgreen`, `radical-red` and `emerald-imperium` (the two hacks cover progression only). Drop `data/checklists/<id>.json` to replace one; the format is the files in [`checklists/`](checklists).

**Save types:** mGBA picks the save type from the cartridge's game code. Retail Gen 3 Pokémon carts, and hacks that keep the base game's code, get 128 KB flash, and the end-to-end test checks this.

## Install on NexusBody (Docker)

```sh
git clone https://github.com/Johnny3116/Pokeverse.git && cd Pokeverse
cp -r data.example data          # then add ROMs and edit data/library/games.json
docker compose up -d --build
curl http://127.0.0.1:8080/api/health

# Expose it on the tailnet over HTTPS (MagicDNS name):
tailscale serve --bg --https=443 http://127.0.0.1:8080
```

- **Permissions:** the container runs as `PUID:PGID` (default `1000:1000`). On Linux, either `chown -R 1000:1000 data backups` or set `PUID`/`PGID` to the folders' owner (`id -u` / `id -g`). If the data folder isn't writable, the container exits with a message saying exactly that.
- To keep the data somewhere else: `POKEVERSE_DATA=/path/to/data POKEVERSE_BACKUPS=/path/to/backups docker compose up -d`.
- The compose file binds `127.0.0.1:8080` only. Nothing listens on the LAN.
- **Update:** `git pull && docker compose up -d --build`.

### Backups

SRAM loss is the worst case, so back up daily:

```sh
docker exec pokeverse /app/backup.sh /data /backups 30   # keep 30 archives
```

This writes `backups/pokeverse-YYYYMMDD-HHMMSS.tar.gz`, containing a consistent database snapshot plus saves, guides, checklists and `games.json`. ROMs aren't included. Schedule it with cron or Task Scheduler. Each save also keeps its last 20 SRAM versions in `saves/<id>/sram-history/`.

To restore, stop the container, extract the archive over the data folder, and start it again.

## Development

Requires [Bun](https://bun.sh) 1.4+ (Node 22 for the e2e script).

```sh
bun install
cp -r data.example data   # add a ROM to try it
bun run dev               # API on :3001 + Vite on :5173 (proxying /api)
```

| Command | What it does |
|---|---|
| `bun run dev` | API server with watch + Vite dev server |
| `bun run build` | vendor EmulatorJS into `public/vendor/ejs` and build the SPA into `dist/` |
| `bun run start` | serve `dist/` + API in production mode |
| `bun run lint` / `typecheck` | ESLint + Prettier / TypeScript (client and server) |
| `bun run test` | Vitest (frontend) + `bun test` (server) |
| `bun run e2e` | Playwright end-to-end run on homebrew test ROMs (needs `bun run build`) |

Environment variables: `PORT` (3001), `HOST` (127.0.0.1), `DATA_DIR` (`./data`), `LIBRARY_DIR` (`$DATA_DIR/library`), `STATIC_DIR` (`./dist`).

The e2e test ([`scripts/e2e.mjs`](scripts/e2e.mjs)) uses MIT-licensed homebrew ROMs from [jsmolka/gba-tests](https://github.com/jsmolka/gba-tests) in `tests/fixtures/`. Commercial ROMs never go in this repository.

### Layout

```
server/      Bun API + static server (app.ts routes, store.ts saves/locks/SRAM, library.ts)
shared/      API types/schemas and the emulator postMessage protocol
src/         React app (routes/, components/play/, emulator/host.ts for the iframe)
checklists/  built-in checklist templates (generated by scripts/gen-checklists.ts)
scripts/     dev runner, EmulatorJS vendoring, e2e, backup, checklist generator
```

## Credits and licenses

- [EmulatorJS](https://github.com/EmulatorJS/EmulatorJS) (GPL-3.0) and the [mGBA](https://mgba.io) libretro core, vendored from npm at build time. Their license ships in `dist/vendor/ejs/`.
- Pokédex names are from [PokéAPI](https://github.com/PokeAPI/pokeapi) (BSD-3-Clause). Pokémon and character names are trademarks of Nintendo / Game Freak / The Pokémon Company.
- This is a personal project for playing dumps of cartridges you own.
