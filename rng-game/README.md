# Aura Realms RNG

A static browser game: roll for auras, earn coins, buy potions, build an ability
loadout, and fight bots or a friend.

- **784 auras**, from Common (1 in 2) up to Fury of Darkness (1 in 1,000,000,000).
  Every aura has a multi-colour palette. Orbs get fancier with rarity: gloss, rims,
  swirling paint, orbiting rings, sparkles, light rays, colour shifting, and a red
  storm for Fury of Darkness.
- **A unique reveal for every aura.** Common and Uncommon rolls are quick and plain.
  Everything from Rare upward takes over the screen with its own animation: 24
  scene concepts (a rarity-over-time graph that climbs to the aura's odds, an
  odometer, slot reels, a terminal readout, shattering glass, an eclipse, a portal,
  a storm, meteors, falling code, an ECG heartbeat, a constellation, radar, an
  equalizer, a vortex, a black hole, a warp tunnel, pulse rings, fireworks, ash,
  a DNA helix, a waveform, a pixel dissolve, a racing clock) crossed with 8 title
  styles and 5 overlays, assigned so no two auras share a combination. Beyond Axiom
  always gets the graph. Cosmic Veil and Fury of Darkness keep their bespoke
  sequences. Rare reveals last about 3 seconds, Epic 4, Legendary and up 6, then
  the roll screen erupts with flash, sparks, rings, beams and a tier banner. Preview
  any aura's reveal from the Index tab.
- **Secret potion.** The shop has a "? ? ?" card under the counter. The Elixir of the
  Million (1,000,000 coins, x1,000,000 luck for one roll) reveals itself to anyone
  holding a million coins, anyone who clicks the ✦ logo seven times, or the admin
  word `secret`.
- **Turn-based battles with signature abilities.** Every aura has its own kit of 6
  abilities, named after the aura (Cosmic Veil brings Meteor Cascade and Supernova
  Unveiled; Fury of Darkness brings Darkness Rend and Fury Unleashed). Choose 4 per
  aura in the Abilities tab. 15 mechanics: strike, heavy blow, guard, heal,
  precision crit, drain, focus, poison, weaken, stun, mirror, burst, 3-hit barrage,
  execute, and absorbing shield. Rarer auras roll the nastier mechanics. Bots have
  their own named kits. Every mechanic has its own battle animation (slashes, a
  falling hammer, lightning, a nova, a hex shield, a life-drain stream, and so on),
  with the attacker lunging or casting, a floating ability name, and a matching
  sound. When the attacker's aura is Legendary or rarer, the ability takes over the
  whole screen: a cinematic full-screen version of the effect plus a callout with
  the ability's name.
- **PvP with 4-digit room codes**: one player creates a room and shares the code,
  the other joins. Peer-to-peer over WebRTC via the bundled PeerJS library (uses the
  free public PeerJS signalling server). The host runs the battle; both players
  choose abilities on their turn. Rematch supported.
- **Daily gift**: claim once every 20 hours. A 7-day streak ladder gives coins plus
  potions, always including a Daily Blessing (x50 luck for one roll). Day 7 pays a
  Godly Potion, a Mystery Potion and two Blessings, and coins grow every completed
  week. Miss two days and the streak restarts.
- **23 potions** in three groups. Luck from x2 up to the Infinity Serum (x25,000 for
  one roll) and a Rarity Magnet that forbids Common and Uncommon rolls. Coins and
  speed: x2, x5 and x10 coin potions, Haste and Blitz, and a Mystery Potion that
  turns into a random potion. Battle: healing, Greater Healing, Strength, Titan's
  Brew (double damage), Iron Skin (start with a shield) and Second Wind (survive a
  killing blow once).
- **Login by ID**: a new player enters a name (2 to 50 characters) and gets a random
  7-digit ID, shown at the top of the page (click it to copy). Returning players log
  in with that ID. Each ID has its own save slot. IDs are stored in the browser, so
  there is no server and no password; the Export / Import save codes move progress
  between devices. A Save button sits in the header.
- **Admin console** (Stats tab, or press `` ` ``): `luck 1000 10`, `coins 5000`,
  `give Cosmic Veil`, `roll Fury of Darkness`, `potion zenith 3`, `ability all`,
  `training 20`, `unlockauto`, `daily reset`, `clearluck`, `reset`, `help`.

## Deploy to Netlify

No build step. Drag the zip (or this folder) onto https://app.netlify.com/drop, or
connect the repo and set the publish directory to `rng-game`.

## Files

- `index.html` – markup
- `style.css` – styling and CSS animations
- `auras.js` – deterministic generator for the 784 auras
- `abilities.js` – ability mechanics and the per-aura signature kit generator
- `reveals.js` – the 24 reveal scenes, title styles and the unique per-aura assignment
- `game.js` – game logic, battle engine, PvP, accounts, cutscene engine
- `peerjs.min.js` – PeerJS 1.5.4 (MIT) for PvP connections
