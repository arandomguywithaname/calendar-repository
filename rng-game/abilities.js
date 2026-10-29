/* abilities.js — ability archetypes and the per-aura signature kits.
   Every aura gets 6 abilities whose names are themed on the aura itself; the kit is
   deterministic (seeded by aura id) so every player and both PvP sides agree on it. */
(function (global) {
  "use strict";

  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* Mechanics. mult = damage as a fraction of power, cd = turns unavailable after use. */
  var ARCH = {
    strike:    { icon: "⚔️", mult: 1.0,  cd: 0, names: ["{T} Strike", "{T} Lash", "{T} Slash", "{T} Fang", "{T} Cut"],
                 desc: "Lashes out with raw {T} energy for {P}% power. No cooldown." },
    heavy:     { icon: "🔨", mult: 1.7,  cd: 2, names: ["{T} Crusher", "{T} Hammer", "Wrath of {T}", "{T} Breaker", "{T} Smash"],
                 desc: "A crushing blow for {P}% power." },
    guard:     { icon: "🛡️", mult: 0,    cd: 1, effect: "guard", names: ["{T} Ward", "{T} Bulwark", "Shell of {T}", "{T} Aegis", "{T} Stance"],
                 desc: "Wraps you in {T}, blocking 60% of the next hit you take." },
    heal:      { icon: "💚", mult: 0,    cd: 3, effect: "heal", pct: 0.3, names: ["{T} Renewal", "Blessing of {T}", "{T} Mending", "{T} Rebirth", "Grace of {T}"],
                 desc: "Channels {T} to restore 30% of your max HP." },
    precision: { icon: "🎯", mult: 0.9,  cd: 1, alwaysCrit: true, names: ["{T} Pierce", "Eye of {T}", "{T} Needle", "{T} Arrow", "{T} Sting"],
                 desc: "A pinpoint {P}% power strike that always lands a critical hit (x2)." },
    drain:     { icon: "🩸", mult: 0.75, cd: 2, lifesteal: 0.5, names: ["{T} Siphon", "{T} Leech", "Hunger of {T}", "{T} Drain", "{T} Harvest"],
                 desc: "Tears {P}% power from the enemy and heals you for half of it." },
    focus:     { icon: "🔮", mult: 0,    cd: 2, effect: "focus", names: ["{T} Trance", "{T} Charge", "Will of {T}", "{T} Focus", "{T} Awakening"],
                 desc: "Gathers {T}: your next attack deals +80% damage." },
    poison:    { icon: "☠️", mult: 0.5,  cd: 3, poison: { turns: 3, mult: 0.3 }, names: ["{T} Venom", "{T} Rot", "{T} Plague", "Curse of {T}", "{T} Blight"],
                 desc: "{P}% power, then {T} eats away 30% power each turn for 3 turns." },
    weaken:    { icon: "🌀", mult: 0.6,  cd: 3, weaken: 2, names: ["{T} Hex", "{T} Shroud", "Dread of {T}", "{T} Malaise", "{T} Chains"],
                 desc: "{P}% power and smothers the enemy, cutting their damage by 30% for 2 turns." },
    stun:      { icon: "⚡", mult: 0.7,  cd: 3, stunChance: 0.4, names: ["{T} Shock", "{T} Thunderclap", "{T} Daze", "Roar of {T}", "{T} Concussion"],
                 desc: "{P}% power with a 40% chance to stun the enemy so they skip a turn." },
    reflect:   { icon: "🪞", mult: 0,    cd: 4, effect: "reflect", names: ["{T} Mirror", "{T} Reflection", "Echo of {T}", "{T} Prism", "{T} Rebuke"],
                 desc: "A mirror of {T} throws 60% of the next hit back at the attacker." },
    burst:     { icon: "💥", mult: 2.6,  cd: 4, names: ["{T} Nova", "{T} Cataclysm", "Fury of {T}", "{T} Apocalypse", "{T} Overdrive"],
                 desc: "Unleashes everything in a {P}% power blast." },
    barrage:   { icon: "🌠", mult: 0.45, cd: 2, hits: 3, names: ["{T} Barrage", "{T} Flurry", "Storm of {T}", "{T} Volley", "{T} Rain"],
                 desc: "Three rapid strikes of {P}% power each. Every hit can crit." },
    execute:   { icon: "🗡️", mult: 1.2,  cd: 3, executeBelow: 0.35, names: ["{T} Execution", "{T} Guillotine", "End of {T}", "{T} Finale", "{T} Reckoning"],
                 desc: "{P}% power, doubled against an enemy below 35% HP." },
    shield:    { icon: "🔰", mult: 0,    cd: 3, effect: "shield", shieldPct: 0.25, names: ["{T} Barrier", "{T} Veil", "Shield of {T}", "{T} Sanctuary", "{T} Bastion"],
                 desc: "Raises a barrier of {T} that absorbs damage equal to 25% of your max HP." },
    snap:      { icon: "🫰", mult: 0,    cd: 7, flat: 100000, names: ["Snap"],
                 desc: "Snaps reality for exactly 100,000 damage. Nothing can block, shield, reflect or boost it." },
    destiny:   { icon: "🌟", mult: 0,    cd: 4, flat: 1000000, names: ["Destiny Unbound"],
                 desc: "Unleashes destiny for exactly 1,000,000 damage. Nothing can block, shield, reflect or boost it." }
  };

  /* Which mechanics each tier can roll. Later tiers unlock the nastier ones. */
  var TIER_POOLS = {
    common:       ["heavy", "guard", "heal", "focus", "drain", "precision"],
    uncommon:     ["heavy", "guard", "heal", "focus", "drain", "precision", "stun"],
    rare:         ["heavy", "guard", "heal", "focus", "drain", "precision", "poison", "weaken", "stun", "barrage"],
    epic:         ["heavy", "guard", "heal", "focus", "drain", "precision", "poison", "weaken", "stun", "barrage", "shield"],
    legendary:    ["heavy", "guard", "heal", "focus", "drain", "precision", "poison", "weaken", "stun", "barrage", "shield", "reflect", "execute"],
    cosmic:       ["heavy", "guard", "heal", "focus", "drain", "precision", "poison", "weaken", "stun", "barrage", "shield", "reflect", "execute", "burst"],
    divine:       ["heavy", "guard", "heal", "focus", "drain", "precision", "poison", "weaken", "stun", "barrage", "shield", "reflect", "execute", "burst"],
    transcendent: ["heavy", "guard", "heal", "focus", "drain", "precision", "poison", "weaken", "stun", "barrage", "shield", "reflect", "execute", "burst"],
    forbidden:    ["heavy", "guard", "heal", "focus", "drain", "precision", "poison", "weaken", "stun", "barrage", "shield", "reflect", "execute", "burst"],
    administrative: ["heavy", "guard", "heal", "focus", "drain", "precision", "poison", "weaken", "stun", "barrage", "shield", "reflect", "execute", "burst"],
    chosen:       ["heavy", "guard", "heal", "focus", "drain", "precision", "poison", "weaken", "stun", "barrage", "shield", "reflect", "execute", "burst"]
  };
  var FINISHERS = ["burst", "execute", "barrage"];
  /* Extra signature moves some auras get on top of their usual six. */
  var EXTRA_MOVES = {
    "Absolute Authority": [["snap", "Snap"]]
  };

  /* Hand-written kits for the headline auras. [archetype, name, optional mult override] */
  var SPECIAL_KITS = {
    "The Chosen One": [
      ["strike", "Chosen Strike"], ["barrage", "Prophecy Storm"], ["shield", "Fated Aegis"],
      ["heal", "Second Coming"], ["execute", "Final Judgement"], ["destiny", "Destiny Unbound"]
    ],
    "Cosmic Veil": [
      ["strike", "Starlight Lash"], ["barrage", "Meteor Cascade"], ["shield", "The Veil"],
      ["focus", "Gaze of the Cosmos"], ["reflect", "Nebula Mirror"], ["burst", "Supernova Unveiled", 2.8]
    ],
    "Fury of Darkness": [
      ["strike", "Darkness Rend"], ["execute", "Eclipse of Hope", 1.3], ["drain", "Abyssal Hunger"],
      ["stun", "Dread Howl"], ["reflect", "Black Mirror"], ["burst", "Fury Unleashed", 3.0]
    ],
    "Overseer": [
      ["strike", "Judgement Stroke"], ["precision", "All-Seeing Eye"], ["weaken", "Decree of Silence"],
      ["heal", "Absolution"], ["shield", "Overseer's Mandate"], ["burst", "Final Verdict", 2.7]
    ],
    "Genesis Bloom": [
      ["strike", "Petal Edge"], ["heal", "Bloom of Life"], ["poison", "Thorn Spores"],
      ["barrage", "Pollen Storm"], ["shield", "Bark of Genesis"], ["execute", "Last Blossom"]
    ],
    "Jackpot": [
      ["strike", "Lucky Strike"], ["precision", "Seven Seven Seven"], ["heavy", "Jackpot Slam"],
      ["focus", "All In"], ["stun", "Coin Flip"], ["drain", "House Edge"]
    ]
  };

  var BASE_THEMES = { Common: "Dust", Uncommon: "Moss", Good: "Spark", Natural: "Root", Breeze: "Wind", Stone: "Stone", "The Chosen One": "Destiny" };

  function themeWords(aura) {
    if (BASE_THEMES[aura.name]) return [BASE_THEMES[aura.name]];
    var words = aura.name.split(" ");
    var ofIdx = words.indexOf("of");
    if (ofIdx > 0) {
      var tail = words.slice(ofIdx + 1).filter(function (w) { return w.toLowerCase() !== "the"; });
      return [tail.join(" "), words.slice(0, ofIdx).join(" ")];
    }
    return words.length > 1 ? [words[0], words[words.length - 1]] : [words[0]];
  }

  function fillTemplate(text, theme, arch) {
    return text.replace(/\{T\}/g, theme).replace(/\{P\}/g, String(Math.round((arch.mult || 0) * 100)));
  }

  function makeAbility(id, archKey, name, theme, multOverride) {
    var arch = ARCH[archKey];
    var ab = { id: id, arch: archKey, name: name, icon: arch.icon, mult: multOverride !== undefined ? multOverride : arch.mult, cd: arch.cd };
    ["effect", "pct", "alwaysCrit", "lifesteal", "poison", "weaken", "stunChance", "hits", "executeBelow", "shieldPct", "flat"].forEach(function (k) {
      if (arch[k] !== undefined) ab[k] = arch[k];
    });
    ab.desc = fillTemplate(arch.desc, theme, ab);
    return ab;
  }

  var cache = {};

  /* The 6 signature abilities of an aura (plus any EXTRA_MOVES). */
  function kitFor(aura) {
    if (cache[aura.id]) return cache[aura.id];
    var kit = [];
    var themes = themeWords(aura);
    var rng = mulberry32(1000 + aura.id * 7919);
    var special = SPECIAL_KITS[aura.name];
    if (special) {
      special.forEach(function (s, i) {
        kit.push(makeAbility("k" + aura.id + "-" + i, s[0], s[1], themes[0], s[2]));
      });
    } else {
      var pool = (TIER_POOLS[aura.tier] || TIER_POOLS.common).slice();
      var picks = ["strike"];
      var tierIdx = ["common", "uncommon", "rare", "epic", "legendary", "cosmic", "divine", "transcendent", "forbidden", "administrative", "chosen"].indexOf(aura.tier);
      if (tierIdx >= 4) {
        var fin = FINISHERS[Math.floor(rng() * FINISHERS.length)];
        picks.push(fin);
        pool.splice(pool.indexOf(fin), 1);
      }
      while (picks.length < 6 && pool.length) {
        var idx = Math.floor(rng() * pool.length);
        picks.push(pool.splice(idx, 1)[0]);
      }
      var usedNames = {};
      picks.forEach(function (archKey, i) {
        var arch = ARCH[archKey];
        var theme = themes[Math.floor(rng() * themes.length)];
        var name, tries = 0;
        do {
          name = fillTemplate(arch.names[Math.floor(rng() * arch.names.length)], theme, arch);
          tries++;
        } while (usedNames[name] && tries < 20);
        usedNames[name] = true;
        kit.push(makeAbility("k" + aura.id + "-" + i, archKey, name, theme));
      });
    }
    (EXTRA_MOVES[aura.name] || []).forEach(function (s, i) {
      kit.push(makeAbility("k" + aura.id + "-x" + i, s[0], s[1], themes[0], s[2]));
    });
    /* Frozen so the browser console can't power up an ability in the shared cache. */
    kit.forEach(Object.freeze);
    cache[aura.id] = Object.freeze(kit);
    return kit;
  }

  /* Bot kits: [archetype, name, optional mult]. */
  var BOT_KITS = {
    dummy:     [["strike", "Splinter Jab"]],
    rookie:    [["strike", "Servo Punch"], ["guard", "Scrap Plating"]],
    guard:     [["strike", "Riot Baton"], ["guard", "Tower Shield"], ["heal", "Repair Protocol"]],
    knight:    [["strike", "Lance Thrust"], ["heavy", "Mace Overhead"], ["guard", "Kite Shield"], ["heal", "Squire's Aid"]],
    warlord:   [["strike", "Cleave"], ["heavy", "Skullsplitter"], ["focus", "Bloodlust"], ["drain", "Vampiric Axe"]],
    titan:     [["heavy", "Boulder Fist"], ["shield", "Stone Skin"], ["strike", "Rock Throw"], ["burst", "Tectonic Slam"]], /* no healing */
    celestial: [["precision", "Judgement Ray"], ["heal", "Divine Light"], ["reflect", "Halo Mirror"], ["focus", "Silent Prayer"]],
    void:      [["poison", "Void Rot"], ["weaken", "Entropy Field"], ["drain", "Soul Siphon"], ["stun", "Null Pulse"]],
    omega:     [["burst", "Omega Beam"], ["stun", "System Shock"], ["heal", "Reboot"], ["reflect", "Deflector Array"], ["barrage", "Gatling Protocol"]],
    inferno:   [["strike", "Flame Lash"], ["heavy", "Magma Fist"], ["poison", "Searing Brand"], ["focus", "Stoke the Forge"]],
    glacier:   [["strike", "Ice Shard"], ["stun", "Deep Freeze"], ["guard", "Ice Wall"], ["weaken", "Frostbite"], ["heavy", "Avalanche"]],
    tempest:   [["strike", "Gale Slash"], ["precision", "Thunderbolt"], ["barrage", "Chain Lightning"], ["stun", "Static Shock"], ["focus", "Eye of the Storm"]],
    phantom:   [["strike", "Spectral Claw"], ["drain", "Soul Rend"], ["reflect", "Ghost Veil"], ["weaken", "Haunting Wail"], ["execute", "Final Whisper"]],
    dragon:    [["strike", "Claw Swipe"], ["burst", "Dragon's Breath"], ["heavy", "Tail Crash"], ["shield", "Scale Armor"], ["barrage", "Wing Storm"]],
    eternity:  [["strike", "Endless Strike"], ["burst", "Big Bang"], ["execute", "Heat Death"], ["drain", "Entropy Drain"], ["stun", "Time Stop"], ["heal", "Rebirth of Stars"]],
    nova:      [["strike", "Star Spark"], ["burst", "Supernova"], ["focus", "Fusion Core"], ["barrage", "Solar Flare"]],
    kraken:    [["strike", "Tentacle Lash"], ["drain", "Ink Siphon"], ["stun", "Crushing Grip"], ["guard", "Shell Curl"], ["heavy", "Tidal Slam"]],
    sentinel:  [["precision", "Orbital Laser"], ["strike", "Rail Shot"], ["shield", "Force Field"], ["stun", "EMP Burst"], ["barrage", "Missile Swarm"]],
    hydra:     [["strike", "Venom Fang"], ["poison", "Toxic Breath"], ["barrage", "Nine Heads"], ["heal", "Regrow Head"], ["heavy", "Coil Crush"]],
    grim:      [["strike", "Scythe Swing"], ["execute", "Soul Harvest"], ["drain", "Life Steal"], ["weaken", "Grave Chill"], ["reflect", "Death Mirror"]],
    colossus:  [["strike", "Boulder Toss"], ["heavy", "Earthshaker"], ["guard", "Granite Hide"], ["stun", "Tremor"], ["burst", "Landslide"]],
    stormtitan:[["strike", "Gale Fist"], ["barrage", "Thunder Rain"], ["stun", "Lightning Lock"], ["focus", "Eye of the Cyclone"], ["burst", "Hurricane"]],
    abyss:     [["strike", "Shadow Claw"], ["drain", "Blood Moon"], ["weaken", "Dread Aura"], ["execute", "Abyssal Doom"], ["reflect", "Void Mirror"], ["heal", "Dark Pact"]],
    solar:     [["precision", "Sunbeam"], ["strike", "Corona Lash"], ["burst", "Solar Storm"], ["shield", "Photon Shield"], ["focus", "Sunrise"]],
    lunar:     [["strike", "Moon Blade"], ["weaken", "Eclipse Shroud"], ["barrage", "Meteor Shower"], ["reflect", "Lunar Mirror"], ["heal", "Moonlight"], ["stun", "Tidal Pull"]],
    galaxy:    [["strike", "Star Cluster"], ["burst", "Galactic Core"], ["barrage", "Nebula Storm"], ["shield", "Dark Matter"], ["drain", "Gravity Well"], ["focus", "Cosmic Sight"]],
    chrono:    [["strike", "Time Slice"], ["stun", "Time Freeze"], ["focus", "Rewind"], ["execute", "End of Time"], ["heal", "Second Chance"], ["barrage", "Time Loop"]],
    quantum:   [["precision", "Particle Beam"], ["strike", "Wave Function"], ["reflect", "Superposition"], ["burst", "Quantum Collapse"], ["shield", "Entanglement"], ["stun", "Uncertainty"]],
    overlord:  [["strike", "Overlord Strike"], ["burst", "Dominion Blast"], ["execute", "Final Order"], ["shield", "Iron Will"], ["heal", "Restore Order"], ["weaken", "Crushing Gaze"]],
    creator:   [["strike", "Creation Spark"], ["burst", "Big Crunch"], ["execute", "Unmaking"], ["heal", "Genesis"], ["shield", "World Shell"], ["drain", "Life Thread"], ["stun", "Stop Time"]]
  };

  function botKit(botId) {
    return (BOT_KITS[botId] || BOT_KITS.dummy).map(function (s, i) {
      return makeAbility("bot-" + botId + "-" + i, s[0], s[1], "Machine", s[2]);
    });
  }

  Object.keys(ARCH).forEach(function (k) { Object.freeze(ARCH[k]); });
  global.KITS = Object.freeze({ ARCH: Object.freeze(ARCH), kitFor: kitFor, botKit: botKit, KIT_SIZE: 6 });
  if (typeof module !== "undefined" && module.exports) module.exports = global.KITS;
})(typeof window !== "undefined" ? window : globalThis);
