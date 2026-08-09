# OPERATION: DUNE

A tactical 5v5 bomb-defusal shooter that runs in the browser. No engine, no
build step, no assets on disk — the renderer, the map, the audio and every
texture are generated at runtime from about 6k lines of plain JavaScript.

```bash
npm run game          # then open http://localhost:8080/game/
PORT=9000 npm run game
```

The only requirement is a browser with WebGL2 (every current desktop browser).

## Playing

| Input | Action |
| --- | --- |
| `W A S D` | Move (full Quake-style accel — counter-strafing and air-strafing work) |
| `Shift` | Walk silently · `Ctrl` crouch · `Space` jump |
| `Mouse 1` | Fire · `Mouse 2` scope / burst mode / knife stab |
| `R` | Reload · `G` drop weapon · `Q` last weapon |
| `1 2 3 4 5` | Primary · secondary · knife · grenades · C4 |
| `B` | Buy menu (during freeze time and the first seconds of a round) |
| `E` | Plant the bomb, defuse it, or pick up a dropped weapon |
| `Tab` | Scoreboard · `Esc` pause |

### Modes

- **Find Match** — matchmaking that fills a 5v5 lobby, then drops you into a
  competitive match: MR12, first to 13, sides swap at the half.
- **Play with Friends** — real PvP. Everyone points at the same server and
  enters the same room code; see below.
- **Practice** — free roam, unlimited money, instant respawns.

## Player versus player

`npm run game` serves the game *and* runs the PvP relay on the same port, with
no dependencies — the WebSocket handshake and framing are implemented directly
on node's `http`/`net`.

1. One person runs `npm run game`. It prints a LAN address.
2. Everyone opens `http://<that address>:8080/game/` and presses
   **PLAY WITH FRIENDS** — that's it. The lobby connects to the server the
   page came from and drops everyone into the same party automatically.
3. The first player in is the host and presses **START MATCH**. Empty
   slots fill with bots, and friends who arrive late are pulled straight
   into the running match.

The **Advanced** panel (different server address, private room codes,
forced teams) is only needed for copies on static hosts like itch.io,
where the relay lives at another address.

The room host's browser simulates the authoritative match — health, kills,
rounds, economy, the bomb and every bot — and broadcasts events for all of
it; other clients predict locally and then follow the host's word. Each
client owns its own movement and interpolates everyone else 100 ms in the
past, bots stream from the host at 10 Hz, and the bot roster is derived
deterministically from the room code so every screen shows the same match.
If the host leaves, the server promotes another player.

To publish a copy people can play, run `npm run game:zip` and deploy the
`dist/operation-dune.zip` contents anywhere Node runs (`node server.js`).

## What is simulated

**Combat** — per-weapon recoil patterns you can learn and counter-pull,
movement/air/crouch inaccuracy, range falloff, hitgroups (head ×4, stomach
×1.25, legs ×0.75), CS-style armour mitigation with per-weapon armour
penetration, wall penetration that loses damage by material thickness, and
one-in-a-few over-penetration through bodies for high-power rounds.

**The whole CS2 arsenal** — 10 pistols, 7 SMGs, 6 heavy, 11 rifles and
snipers, the Zeus, five grenades and the gear, each with its own stats, model
and shop entry. Grenades are all real: HE with line-of-sight falloff,
flashbangs that blind by facing angle, smokes that actually block bot vision
and radar, molotovs/incendiaries that deny ground with damage over time, and
decoys that fake gunfire.

**Economy** — $800 pistol rounds, escalating loss bonuses, kill rewards per
weapon, plant and defuse bonuses, and you lose your kit when you die.

**Skins** — nine finishes (Desert Storm, Woodland Ops, Crimson Web, Asiimov,
Vulcan, Dragon Fire, Gold Plated, Midnight) selectable per weapon in the buy
menu with the ◀ ▶ arrows under the preview. One colour table drives the
viewmodel and the rotating shop preview, and your choices persist between
sessions. Cosmetic only.

**Bots** — perception with a real FOV cone, line-of-sight and smoke occlusion;
a reaction delay before they react to a new target; aim error that converges
while they track you; recoil compensation and burst discipline scaled by
difficulty; A* over a nav grid built from the level geometry; and per-round
plans (T's pick a site and push it together, CT's split between sites and
rotate when they hear the bomb).

## Layout

```
index.html          markup for the HUD, shop, menus and match screens
css/game.css        the whole interface
js/math.js          vectors, matrices, ray/AABB tests, seeded RNG
js/textures.js      every material and sprite, painted on a 2D canvas
js/renderer.js      WebGL2: array textures, shadow map, billboards, decals
js/audio.js         all sound, synthesised with the Web Audio API
js/weapons.js       the arsenal, spray patterns, damage maths, gun geometry
js/map.js           de_dune: geometry, collision, ray casts, nav grid
js/player.js        movement, hitboxes, the character model
js/bots.js          bot perception, aiming and decision making
js/net.js           PvP client: rooms, snapshots, interpolation
js/hud.js           HUD, radar, kill feed, scoreboard, shop
js/game.js          match flow, combat, grenades, the bomb, the loop
```

Gun geometry lives in one table (`GUN_PARTS`) that drives three things: the
world model, the first-person viewmodel, and the rotating 3D preview in the
shop — so the shop art can never drift from what you actually hold.
