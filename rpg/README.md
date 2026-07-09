# Vivarium RPG — the first-person fork

A fork of Vivarium One that turns the god-view life-sim into a **choose-your-own-adventure
role-playing game**: you create and embody ONE character; the storyteller narrates what
*you* experience, paces time itself, and **stops to ask you** whenever your character faces
a significant decision.

## How it differs from the main game
- **World creation** (World Wizard) builds *your* character first — deep backstory (epoch,
  upbringing, dreams, fears, personality, plans) — then walks you through the important
  people of their life as full NPCs (with bonds among themselves and toward you), then the
  places. `plan.player_character` marks who you are; `worlds.player_character_id` stores it.
- **The stage is locked to your character**: you see only your current location and the
  people in it. To go somewhere or do something, type/dictate it into the **action bar**
  under the storybook — the storyteller (`timeDelta:'auto'`) decides how much time passes
  and ends the beat early at any **decision stop** (`ticks.decision`, shown as a 🎭 card).
  The ⏱ button requests longer skips, which play as scene films (planner stops early at
  significant choices via `stop_question`).
- **Off-screen economy**: characters away from you still live (location, activity, mood,
  one-line thought, intentions, persistent patches — enforced server-side) but generate no
  dialogue/perception detail → faster, cheaper ticks with a complete background world.
- **🛠 Admin mode** (Account settings): OFF = you are only your character — other minds are
  closed, the GM chat keeps secrets and only grants sprite refreshes & new places; ON = the
  simulation's admin seat — read any mind (even off-scene), talk to any inner voice, ask
  the GM anything, change anything (server-enforced allowlist in `gmApplyActions`).

Everything else (voices, sprite generation, cast/outfit/location suggestions, music,
time travel, exports) is inherited unchanged.

## Run
```bash
PORT=8891 VIV_DATA_DIR=./data-rpg node server/index.js
```
`node_modules` and `assets` are symlinks into the parent game.

Demo: the seeded "Alice & Bob — as Bob" world (set `worlds.player_character_id` to Bob's id).
