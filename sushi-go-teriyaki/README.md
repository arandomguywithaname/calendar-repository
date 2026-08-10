# Sushi Go: Teriyaki Edition

A browser version of the card-drafting game — pick one card, pass the rest —
with three cards swapped off the standard menu.

Everything ships in a single self-contained `index.html`. No build step, no
dependencies, no network. **Double-click it, or open it in any browser.**

```
sushi-go-teriyaki/
  index.html      the whole game — markup, styles, engine, UI
  test-engine.js  node test-engine.js   (28 checks, no dependencies)
  README.md
```

## The three new cards

| Replaces | New card | What it does |
|---|---|---|
| Sashimi | **Teriyaki** 照り焼き | Scores nothing itself. The **next card you plate counts twice**. |
| Chopsticks | **Noodles** 麺 | At the end of the round, your **maki count goes up by half**. |
| Wasabi | **Joker** 化札 | **Becomes any other card** you name when you plate it. |

### Teriyaki

Plate it, pass your hand on as usual, and the next card you plate counts as two
copies of itself:

- a gyoza after Teriyaki counts as **two gyoza** (so 1 gyoza scores 3, not 1)
- a Maki x3 counts as **6 maki icons**
- a squid nigiri scores **6** instead of 3
- a lone tempura becomes **a complete pair** — 5 points from one card

A Teriyaki never doubles another Teriyaki. Plate two in a row and they simply
queue up, doubling your next two scoring cards. An unused Teriyaki is worth
nothing at the end of the round.

### Noodles

Noodles boost your maki count by half of itself, worked out at the end of the
round, before the maki contest is judged:

| Your maki | With 1 noodle | With 2 noodles |
|---|---|---|
| 6 | 9 | 12 |
| 7 | 10.5 | 14 |
| 10 | 15 | 20 |

Each bowl of noodles adds half of your **base** count, so two bowls double it.
Half-maki are real — 7 maki with one noodle is 10.5, and 10.5 beats 10.

Noodles with no maki behind them do nothing.

### Joker

Plate the Joker and name any other card in the game. It *is* that card for the
rest of the round — name Maki x3 and your noodles boost it, name gyoza and it
counts toward your gyoza run. A Joker can't copy another Joker, and a Teriyaki
will happily double it.

## The rest of the menu

Unchanged from the game you know:

- **Tempura** — 5 points per pair, a lone one is dead
- **Gyoza** — 1 / 3 / 6 / 10 / 15 points for 1–5 of them
- **Maki** — most icons at the end of a round scores 6, second most scores 3;
  ties split the points and drop the remainder, and a tie for first cancels
  second place entirely
- **Nigiri** — squid 3, salmon 2, egg 1
- **Pudding** — held back until the whole game ends: most puddings +6, fewest
  -6. Nobody loses points for pudding in a two-player game.

## How a game runs

2–5 players (you plus bots), three rounds, hands of 10 / 9 / 8 / 7 cards
depending on the count. Every turn all players plate one card at the same time,
then hands pass to the left. Highest score after three rounds and the pudding
contest wins.

Opponents come in Easy, Normal and Hard — the difficulty sets how much noise is
added to their card evaluation, and all three know to save a big card for a
pending Teriyaki.

## Tests

```bash
node test-engine.js
```

The engine is written as a pure, DOM-free section of `index.html` marked by
`ENGINE START` / `ENGINE END`. The test file extracts that section and runs it
in a bare VM, so the rules are covered without a browser: card doubling,
noodle arithmetic, joker substitution, the maki and pudding contests, hand
passing, and 300 complete simulated games across 2–5 players.
