# Aura Realms RNG

A static browser game: roll for auras, earn coins, buy potions, build an ability
loadout, and fight bots or a friend.

- **784 auras**, from Common (1 in 2) up to Fury of Darkness (1 in 1,000,000,000).
  Every aura has a multi-colour palette. Orbs get fancier with rarity: gloss, rims,
  swirling paint, orbiting rings, sparkles, light rays, colour shifting, and a red
  storm for Fury of Darkness.
- **Its own cutscene for every Epic+ aura.** Common, Uncommon and Rare rolls stay on
  the roll screen (Rare still gets the slot-machine slowdown, flash and banner). Each
  of the 641 auras from Epic upward takes over the screen with a cutscene no other
  aura shares: one of 54 scenes paired with one of 14 effect layers (shooting stars,
  snow, embers, rain, bubbles, searchlights, lightning, petals, orbiting motes,
  glitch bars, god rays, drifting dust, bokeh, ribbons, halo rings, floating gems),
  and every scene + effect pairing is used at most once, plus one of 8 title styles
  and 5 overlays. Scenes
  include a rarity-over-time graph, an odometer, slot reels, a terminal readout,
  shattering glass, an eclipse, a portal, a storm, meteors, falling code, an ECG
  heartbeat, a constellation, radar, a black hole, a warp tunnel, fireworks, a DNA
  helix, a racing clock, northern lights, a summoning circle, a VHS glitch, a growing
  tree, an hourglass, fortune cards, cherry blossoms, a ringed planet, a lighthouse,
  a volcano, dice, crystals, a stained-glass window, a circuit board, a neon sign, an
  underwater scene, fireflies, a solar flare, a comet, a spirograph, a pendulum wave,
  a lava lamp, jellyfish, a maze, a prism, a rocket launch, sky lanterns and a
  spinning globe. Beyond Axiom always gets the graph; Cosmic Veil and Fury of
  Darkness keep bespoke sequences.
- **Shiny forms.** 615 of the 784 auras (78.4%, the closest whole number to 78.5%)
  have a shiny form fixed at ×2, ×3, ×4 or ×5, spread evenly, except Fury of
  Darkness, whose shiny is ×10. Rolling one of them has a 1-in-that-number chance of
  coming out shiny, so a shiny Fury of Darkness is 1 in 10,000,000,000. Shinies are separate collectibles: their own inventory
  card, a rainbow ring and sparkles on the orb, a rainbow name, more power (worked
  out from the shiny odds), coins multiplied by the same number, and a rainbow sheen
  plus chime over the cutscene. Every shiny gets a cutscene: Epic+ shinies play
  their aura's cutscene with the rainbow treatment, and the 110 shinies of Common,
  Uncommon and Rare auras each get their own short cutscene (a scene + effect
  pairing no other aura or shiny uses), so all 751 cutscenes are different. The
  Index tags each aura's multiplier, counts shinies found and has a ✨ button to
  preview the shiny cutscene. Shinies are common enough (a shiny Common is 1 in 6)
  that about 1 roll in 3 is shiny; the Skip cutscenes setting turns them all off.
- **Reveals always finish.** The timeline is worked out per aura so rarer tiers
  build longer and the name and odds always finish before anything fades. Taps
  can't skip a reveal until the name and odds are fully shown, so quick taps on
  Roll can't eat a rare roll. Cosmic and rarer reveals stay on screen until you
  tap (they close on their own after 30 seconds so Auto Roll never stalls).
  Names wrap between words and numbers shrink to fit on phones.
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
  their own named kits (Titan Bot has no healing move). Every mechanic has its own battle animation (slashes, a
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
- **Login on any device**: a new player enters a name (2 to 50 characters) and gets a
  random 7-digit ID, shown at the top of the page (click it to copy). Entering that ID
  on another phone or computer loads the same progress. Saves upload a few seconds
  after each change and whenever the tab is hidden; an idle device quietly picks up
  progress made elsewhere. A badge next to the ID shows ☁️ Online, Saving…, ⚠️ Offline
  (keep playing; it syncs when the connection is back) or 💻 This device (the site has
  no account server, see Deploy). Accounts made before this version go online
  automatically and keep their ID (a new one is issued only if someone online already
  has it). There is no password: anyone with an ID can open that account. Export /
  Import save codes still work as a backup. A Save button sits in the header.
- **One device rolls at a time**: rolling takes a 20-second "turn" on the account from
  the server, renewed while you keep rolling, auto-rolling or watching a reveal. If
  another device (or browser tab) tries to roll meanwhile, both devices get a red
  **Error 145** warning: "You are rolling on two devices simultaneously!", and that
  rolling on both might crash your account. The second device can roll about 20
  seconds after the first one stops (straight away if it closes the tab), and it
  first loads the first device's newest progress.
- **Error codes**, shown in red: **145** two devices rolling at once, **404** network
  or account-server problem, **435** buying a potion (not enough coins), **102** using
  a potion (none left, a stronger one already active, healing outside a fight, not your
  turn), **98** account problems (bad name or ID, no player with that ID, a bad save
  code, or progress replaced by a newer save from another device).
- **Admin console**: scroll to the bottom of the Stats tab, or press `` ` `` (backtick)
  anywhere on a keyboard. No password. Commands: `luck 1000 10`, `coins 5000`,
  `give Cosmic Veil`, `roll Fury of Darkness`, `give Cosmic Veil shiny`,
  `roll Beyond Axiom shiny`, `potion zenith 3`, `ability all`,
  `training 20`, `unlockauto`, `daily reset`, `clearluck`, `reset`, `help`.

## Deploy to Netlify

No build step and no npm install.

- **With online accounts (log in on any device, one device rolls at a time):** connect
  the GitHub repo in Netlify (Add new site → Import an existing project) and set the
  **base directory** to `rng-game`. `netlify.toml` publishes the folder, and Netlify
  deploys the account function in `netlify/functions/account.mjs`, which stores
  accounts in Netlify Blobs (built into Netlify, nothing to configure). The Netlify CLI
  works too: `netlify deploy --prod` from the `rng-game` folder.
- **Drag and drop** (the zip or this folder onto https://app.netlify.com/drop) publishes
  the game. Functions are meant to be deployed from Git or the CLI, so if the account
  function isn't running, IDs only work on the device that made them and logged-in
  players see a one-time Error 404 note saying online accounts aren't set up.
  Everything else plays normally.

## Files

- `index.html` – markup
- `style.css` – styling and CSS animations
- `auras.js` – deterministic generator for the 784 auras
- `abilities.js` – ability mechanics and the per-aura signature kit generator
- `reveals.js` – the 54 reveal scenes, 16 effect layers, the shiny sheen, title styles
  and the unique per-aura assignment
- `game.js` – game logic, battle engine, PvP, accounts, cutscene engine
- `peerjs.min.js` – PeerJS 1.5.4 (MIT) for PvP connections
- `netlify/functions/account.mjs` – the online account server: create / load accounts,
  upload saves (with revision checks so one device can't silently overwrite another),
  and the one-device roll lease
- `netlify/vendor/netlify-blobs.mjs` – @netlify/blobs 10.7.13 (MIT) bundled into one
  file, so the function needs no npm install
