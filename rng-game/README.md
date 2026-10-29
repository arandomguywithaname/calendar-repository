# Aura Realms RNG

A static browser game: roll for auras, earn coins, buy potions, build an ability
loadout, and fight bots or a friend.

- **806 auras in 10 ranks**, from Common (1 in 2) up to Fury of Darkness (1 in
  1,000,000,000), then twenty more Forbidden auras beyond it (Abyssal Crown, Void Sovereign,
  Shattered Infinity, Crimson Apocalypse, Nightmare Engine, Bleeding Cosmos, Forsaken Genesis,
  Wrath of the Unmade, Eternal Damnation, Final Silence, Obsidian Requiem, Hellfire Monarch,
  Ruined Eternity, Doomsday Pulse, Cursed Singularity, Phantom Armageddon, Drowned Leviathan,
  Endless Torment, Chaos Incarnate and Null Dominion: 1 in 1.25 billion up to 1 in 80
  billion). The last rank, **Administrative**, has only two auras: Root Access (1 in
  500,000,000,000, 10,000 power) and Absolute Authority (1 in 1,000,000,000,000, 12,000
  power), with their own cyan orb style and the longest reveal.
  Every aura has a multi-colour palette. Orbs get fancier with rarity: gloss, rims,
  swirling paint, orbiting rings, sparkles, light rays, colour shifting, a red storm for
  Fury of Darkness and the Forbidden rank, and a cyan system glow for Administrative.
- **Its own cutscene for every Epic+ aura.** Common, Uncommon and Rare rolls stay on
  the roll screen (Rare still gets the slot-machine slowdown, flash and banner). Each
  of the 663 auras from Epic upward takes over the screen with a cutscene no other
  aura shares: one of 54 scenes paired with one of 14 effect layers (shooting stars,
  snow, embers, rain, bubbles, searchlights, lightning, petals, orbiting motes,
  glitch bars, god rays, drifting dust, bokeh, ribbons), and every scene + effect
  pairing is used at most once, plus one of 8 title styles and 5 overlays. Scenes
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
- **Shiny forms.** 633 of the 806 auras (78.5%: 615 of the 784 generated ones and 18 of
  the 20 extra Forbidden ones; the two Administrative auras have none) have a shiny form
  fixed at ×2, ×3, ×4 or ×5, spread evenly, except Fury of Darkness, whose shiny is ×10.
  Rolling one of them has a 1-in-that-number chance of coming out shiny, so a shiny
  Fury of Darkness is 1 in 10,000,000,000 and a ×4 shiny Null Dominion is 1 in
  320,000,000,000. Shinies are separate collectibles: their own inventory
  card, a rainbow ring and sparkles on the orb, a rainbow name, more power (worked
  out from the shiny odds), coins multiplied by the same number, and a rainbow sheen
  plus chime over the cutscene. Only Epic and rarer shinies get a cutscene (their
  aura's own, with the rainbow treatment); a Common, Uncommon or Rare shiny stays on
  the roll screen with a shiny banner, rainbow burst and chime. The Index tags each
  aura's multiplier, counts shinies found and, for Epic and rarer, has a ✨ button to
  preview the shiny cutscene.
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
  their own named kits (Titan Bot has no healing move). 15 bots run from the Training
  Dummy (power 15) to Eternity Bot (power 13,000, +250,000 coins); the top six (Inferno,
  Glacier, Tempest, Phantom, Dragon and Eternity) need a Fury-class aura, and the last
  ones also Titan's Brew and healing potions. Every mechanic has its own battle animation (slashes, a
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
  Import save codes still work as a backup; each code carries a fingerprint, so a
  hand-edited code is refused (Error 98), and codes from before fingerprints can only be
  imported with admin unlocked. A Save button sits in the header.
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
- **Admin** (bottom of the Stats tab, or press `` ` `` (backtick) anywhere on a keyboard):
  locked with the admin password. Unlock opens the console and the player panel below;
  Lock closes both, and admin also locks itself when you leave the page or after 5
  minutes without using it. The password is checked against a hash in `game.js`
  (PBKDF2) and in the account function (scrypt), so it isn't written anywhere in the
  code, and the password box tells browsers not to fill in a saved password. While
  admin is locked, the browser console can't change the game either: the debug hooks
  hand out copies, and aura and ability data is frozen.
- **Admin console** (your own account, after unlocking). Commands: `luck 1000 10`, `coins 5000`,
  `give Cosmic Veil`, `roll Fury of Darkness`, `give Cosmic Veil shiny`,
  `roll Beyond Axiom shiny`, `potion zenith 3`, `ability all`,
  `training 20`, `unlockauto`, `daily reset`, `clearluck`, `reset`, `help`.
  It only changes the account on the device you're using.
- **Player panel** (Stats tab, under the console, after unlocking): lists every online
  player account (auras, coins, luck, rolls). Click a player,
  then **Add coins** (a minus number takes coins away), **Add luck** (a multiplier for a
  number of rolls) or **Delete auras** (type an aura name to delete just that one, both
  forms, or leave it empty to delete all). **Delete auras on every account except this
  player** wipes everyone else's auras. **Reset everyone's luck to x1** ends every
  player's active luck boosts (and Rarity Magnet rolls) at once; anyone rolling right now
  switches within a few seconds without losing a roll, and everyone else's next roll is
  at x1. **💥 Detonate** resets every other player's
  account to a brand new save (all auras, coins, potions and stats) and keeps the account
  you're logged into; you have to type DETONATE to confirm. Reset players see "An admin
  reset this account" the next time their game syncs. Players who are online get the change within
  about 20 seconds, with an "An admin updated your account" message. To change the
  password, update both hashes (`ADMIN_PW` in `game.js`, `ADMIN_SALT`/`ADMIN_HASH` in
  `netlify/functions/account.mjs`; each file shows the command). An `ADMIN_KEY`
  environment variable in Netlify, if you add one, replaces the built-in password for
  the server. A wrong password gets Error 98.

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
- `auras.js` – deterministic generator for the 784 generated auras plus the 10 extra
  Forbidden ones
- `abilities.js` – ability mechanics and the per-aura signature kit generator
- `reveals.js` – the 54 reveal scenes, 14 effect layers, the shiny sheen, title styles
  and the unique per-aura assignment
- `game.js` – game logic, battle engine, PvP, accounts, cutscene engine
- `peerjs.min.js` – PeerJS 1.5.4 (MIT) for PvP connections
- `netlify/functions/account.mjs` – the online account server: create / load accounts,
  upload saves (with revision checks so one device can't silently overwrite another),
  the one-device roll lease, and the password-locked admin tools
- `netlify/vendor/netlify-blobs.mjs` – @netlify/blobs 10.7.13 (MIT) bundled into one
  file, so the function needs no npm install
