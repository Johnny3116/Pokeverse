# PokeVerse — MVP spec

> Personal, single-user web app for playing Gen 3 Pokémon games in the browser, with guides and checklists on the same screen. Files and saves live on NexusBody; access is tailnet-only.

---

## 1. Goals

- Pick a game from a library and be playing within a few seconds.
- Play in normal, theater, or fullscreen mode.
- See guides and checklists next to the game without switching tabs.
- Pick up the same save on any device on the tailnet.

## 2. Non-goals (MVP)

- Multiple users, accounts, or login (Tailscale is the auth layer)
- Public internet exposure
- Netplay / link-cable trading
- Non-GBA systems
- ROM hacks with custom checklists (supported later)

## 3. Constraints & Assumptions

| Item | Decision |
|---|---|
| Users | One (John) |
| Access | Tailscale only, served over HTTPS via Tailscale Serve (MagicDNS name) |
| Storage | ROMs, BIOS, saves, guides, checklist templates on NexusBody |
| Stack | React + TypeScript front end; Bun backend |
| Emulator core | EmulatorJS (mGBA core) **or** a direct mGBA WASM build — evaluate in spike (see §9) |
| ROMs | Dumps of carts John owns |

---

## 4. Screens

### 4.1 Library (`/`)

- **Continue card** at top: last played game + save, one click to resume.
- **Game grid:** box art, title, last played, total playtime, checklist progress (e.g. `Dex 142/386`).
- Click a game → save picker (existing saves + "New save") → Play page.

### 4.2 Play (`/play/:gameId/:saveId`)

**Layout**

```
┌───────────────────────────────┬──────────────────┐
│                               │ [Guide][Check][Notes]
│        Emulator canvas        │                  │
│      (integer-scaled)         │   Side panel     │
│                               │   (collapsible)  │
├───────────────────────────────┤                  │
│ Toolbar                       │                  │
└───────────────────────────────┴──────────────────┘
```

**View modes**

| Mode | Behavior |
|---|---|
| Normal | Emulator + side panel |
| Theater | Emulator enlarged, panel collapsed to an icon rail |
| Fullscreen | Fullscreen API on emulator container; side panel available as a slide-out drawer (hotkey) |

**Toolbar**

- Save state (slots 1–4) / load state
- Fast-forward toggle
- Screenshot
- Mute / volume
- Integer scaling toggle
- View mode switch
- Controls config

**Side panel tabs**

- **Guide** — rendered Markdown walkthrough for the current game
- **Checklist** — progress for the current save
- **Notes** — free-text notes per save (team plans, reminders)

### 4.3 Settings (`/settings`)

- Keyboard bindings (remap UI)
- Gamepad bindings
- Default view mode, volume, scaling
- Stored server-side so they follow you across devices

---

## 5. Feature Detail

### 5.1 Saves

- **In-game saves (SRAM):** autosave to NexusBody on change (debounced) and on page unload.
- **Save states:** manual slots with thumbnail + timestamp.
- **Save lock:** opening a save takes a lock; another device opening it sees "Open on another device — take over?"

### 5.2 Checklists

- Per-game JSON templates, with categories: Pokédex, Badges, Gym Leaders / E4, Legendaries, TMs/HMs, Key Items, Version Exclusives.
- Progress is stored **per save file**, not per game.
- Search + filters: uncaught only, by category, by location.
- MVP progress is manual (click to check). Reading progress from SRAM is a stretch goal.

### 5.3 Guides

- Markdown files on NexusBody, one folder per game.
- Rendered in the side panel with a table of contents by route/town.
- "You are here" marker, set manually and saved per save file.
- Quick-reference widgets: type chart, nature chart.

### 5.4 Input

- Keyboard (remappable)
- Gamepad API (remappable)
- On-screen touch controls when a touch device is detected

---

## 6. Data Model

```
Game          { id, title, region, romPath, boxArtPath, guideDir, checklistTemplate }
SaveFile      { id, gameId, name, sramPath, createdAt, lastPlayedAt, playtimeSec, lock? }
SaveState     { id, saveId, slot, statePath, thumbnailPath, createdAt }
ChecklistProg { saveId, itemId, checked, checkedAt }
Note          { saveId, body, updatedAt }
GuideMarker   { saveId, sectionId }
Settings      { keyBindings, padBindings, viewMode, volume, integerScale }
```

## 7. API (Bun backend, front-end contract)

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/games` | Library list |
| GET | `/api/games/:id/rom` | ROM bytes (streamed) |
| GET | `/api/bios` | BIOS bytes |
| GET/POST | `/api/games/:id/saves` | List / create save files |
| GET/PUT | `/api/saves/:id/sram` | Load / write SRAM |
| POST | `/api/saves/:id/lock` | Acquire / take over lock |
| GET/PUT | `/api/saves/:id/states/:slot` | Load / write save state |
| GET/PATCH | `/api/saves/:id/checklist` | Checklist progress |
| GET/PUT | `/api/saves/:id/notes` | Notes |
| GET | `/api/games/:id/guide` | Guide index + Markdown |
| GET/PUT | `/api/settings` | User settings |

All write routes validate input (schema validation on body and params). Path params are mapped to IDs, never to raw filesystem paths.

---

## 8. Security

- Bind the backend to localhost; expose it only through Tailscale Serve.
- No ROM, BIOS, or save path is ever built from user input.
- Set cross-origin isolation headers (COOP/COEP) only if the chosen emulator build requires them.
- Back up the saves directory on NexusBody on a schedule; SRAM loss is the worst-case failure.

---

## 9. Open Questions / Spikes

1. **Emulator choice:** EmulatorJS vs direct mGBA WASM. Check current versions, license, threading/COOP-COEP needs, save-state API, and how easily SRAM can be extracted.
2. **Audio on mobile Safari:** confirm autoplay/unlock behavior.
3. **Checklist data source:** hand-written JSON vs generated from a public dataset. Check licensing before generating.
4. **Lock timeout:** how long before an abandoned lock expires?

---

## 10. Milestones

| # | Milestone | Done when |
|---|---|---|
| 1 | Emulator spike | One ROM boots in the browser from NexusBody over Tailscale Serve |
| 2 | Library + Play page | Pick a game → play; view modes work |
| 3 | Saves | SRAM autosave + save state slots persist across devices |
| 4 | Side panel | Guide rendering + checklist with per-save progress |
| 5 | Input + Settings | Remap keys/gamepad; settings sync |
| 6 | Polish | Touch controls, save lock, backups |

## 11. Stretch Goals

- Auto-detect checklist progress by parsing SRAM
- Playtime stats per save
- ROM hack support with custom checklists
- Screenshot gallery per save

