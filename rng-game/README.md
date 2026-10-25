# Aura Realms RNG

A static browser game: roll for auras, earn coins, buy potions, fight bots.

- **784 auras**, from Common (1 in 2) up to Fury of Darkness (1 in 1,000,000,000).
- **Cutscenes** for Legendary and above. Cosmic Veil (1 in 2,000,000) and Fury of
  Darkness have their own full-screen animations. Preview them from the Index tab.
- **Potions**: luck boosts, double coins, haste, healing, strength.
- **Battles**: fight nine bots with your equipped aura. Rarer auras hit harder.
- Progress is saved in `localStorage`.

## Deploy to Netlify

No build step. Drag the zip (or this folder) onto https://app.netlify.com/drop, or
connect the repo and set the publish directory to `rng-game`.

## Files

- `index.html` – markup
- `style.css` – styling and CSS animations
- `auras.js` – deterministic generator for the 784 auras
- `game.js` – game logic, battles, cutscene engine
