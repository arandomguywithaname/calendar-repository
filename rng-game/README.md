# Aura Realms RNG

A static browser game: roll for auras, earn coins, buy potions, build an ability
loadout, and fight bots or a friend.

- **784 auras**, from Common (1 in 2) up to Fury of Darkness (1 in 1,000,000,000).
  Every aura has a multi-colour palette. Orbs get fancier with rarity: gloss, rims,
  swirling paint, orbiting rings, sparkles, light rays, colour shifting, and a red
  storm for Fury of Darkness.
- **Reveals that scale with rarity.** Common and Uncommon rolls are quick and plain.
  Rare rolls slow down like a slot machine and land with a flash and a spark burst.
  Epic adds screen shake, a tier banner and a glowing stage. Legendary and above get
  a suspense build-up, a full-screen cutscene (name fades in, then the odds, gone by
  itself after 6 seconds), then light beams, orbiting sparkles and shockwaves on the
  roll screen. Cutscenes escalate too: star warp for Cosmic, god rays for Divine,
  lightning and colour cycling for Transcendent, and unique sequences for Cosmic
  Veil and Fury of Darkness. Preview any of them from the Index tab.
- **Turn-based battles with signature abilities.** Every aura has its own kit of 6
  abilities, named after the aura (Cosmic Veil brings Meteor Cascade and Supernova
  Unveiled; Fury of Darkness brings Darkness Rend and Fury Unleashed). Choose 4 per
  aura in the Abilities tab. 15 mechanics: strike, heavy blow, guard, heal,
  precision crit, drain, focus, poison, weaken, stun, mirror, burst, 3-hit barrage,
  execute, and absorbing shield. Rarer auras roll the nastier mechanics. Bots have
  their own named kits.
- **PvP with 4-digit room codes**: one player creates a room and shares the code,
  the other joins. Peer-to-peer over WebRTC via the bundled PeerJS library (uses the
  free public PeerJS signalling server). The host runs the battle; both players
  choose abilities on their turn. Rematch supported.
- **Potions**: luck boosts, double coins, haste, healing, strength.
- **Login and save**: local accounts (username + password) stored in the browser,
  one save slot each, a Save button, and Export / Import save codes to move progress
  between devices. There is no server, so accounts only exist on the device where
  they were created.
- **Admin console** (Stats tab, or press `` ` ``): `luck 1000 10`, `coins 5000`,
  `give Cosmic Veil`, `roll Fury of Darkness`, `potion zenith 3`, `ability all`,
  `training 20`, `unlockauto`, `clearluck`, `reset`, `help`.

## Deploy to Netlify

No build step. Drag the zip (or this folder) onto https://app.netlify.com/drop, or
connect the repo and set the publish directory to `rng-game`.

## Files

- `index.html` – markup
- `style.css` – styling and CSS animations
- `auras.js` – deterministic generator for the 784 auras
- `abilities.js` – ability mechanics and the per-aura signature kit generator
- `game.js` – game logic, battle engine, PvP, accounts, cutscene engine
- `peerjs.min.js` – PeerJS 1.5.4 (MIT) for PvP connections
