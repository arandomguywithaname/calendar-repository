# Sushi Go: Teriyaki Edition

A browser version of the card-drafting game — pick one card, pass the rest —
with three cards swapped off the standard menu. Play the bots, or pass the
device around a table.

Everything ships in a single self-contained `index.html`. No build step, no
dependencies, no network. **Double-click it, or open it in any browser.**

```
sushi-go-teriyaki/
  index.html      the whole game — markup, styles, engine, UI
  test-engine.js  node test-engine.js   (42 checks, no dependencies)
  README.md
```

## The three new cards

| Replaces | New card | What it does |
|---|---|---|
| Sashimi | **Teriyaki** 照り焼き | Scores nothing, and never works on yourself. It doubles a card for **the player you pass your hand to**. |
| Chopsticks | **Noodles** 麺 | At the end of the round, your **maki count goes up by half**. |
| Wasabi | **Joker** 化札 | **Becomes any other card** you name when you plate it. |

### Teriyaki

**Teriyaki never works on yourself.** Plate it and it travels with the hand you
pass, serving a double to the player on your left — the one who receives your
cards. The next card *they* plate counts as two copies of itself:

- a gyoza counts as **two gyoza** (so 1 gyoza scores 3, not 1)
- a Maki x3 counts as **6 maki icons**
- a squid nigiri scores **6** instead of 3
- a lone tempura becomes **a complete pair** — 5 points from one card

Because every plate is revealed at the same time, a Teriyaki can never double a
card played on the turn it was served — it waits for the receiving player's
next card. A Teriyaki card is never itself doubled, so a player holding a
waiting double who plates a Teriyaki keeps it for later; that is the only way
doubles stack up. A double nobody spent before the round ends is worth nothing.

It is a card you give away, so it is usually one you plate when nothing else in
your hand is worth taking — and worth thinking about, since it feeds the player
you are already handing your best leftovers to.

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
counts toward your gyoza run. A Joker can't copy another Joker, and a double
served to you by a Teriyaki will happily double it.

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

2–5 players, three rounds, hands of 10 / 9 / 8 / 7 cards depending on the
count. Every turn all players plate one card at the same time, then hands pass
to the left. Highest score after three rounds and the pudding contest wins.

Opponents come in Easy, Normal and Hard — the difficulty sets how much noise is
added to their card evaluation, and all three know to save a big card for a
pending Teriyaki.

## Playing against people

Set **Playing in person** to however many of you are sharing the device — up to
a full table with no bots at all. Name everyone, or leave the fields blank for
Player 1, Player 2 and so on.

Each turn the game asks every person in seat order, one at a time:

1. a hand-off screen says **"Pass the device to <name>"** and nothing else is
   on screen — the previous player's cards are already cleared
2. that player taps to reveal, and sees only their own hand and their own plate
3. once everyone has chosen, every plate is revealed at once and the hands pass

Because the whole point of drafting is not knowing what your neighbour holds,
the hand rail is emptied before each hand-off, and a player is only ever
rendered their own cards — never another seat's. Played cards are public and
stay on show throughout.

Mixing works too: three people and two bots at a five-player table, for
instance. The difficulty picker disappears when every seat is taken by a person.

## Tests

```bash
node test-engine.js
```

The engine is written as a pure, DOM-free section of `index.html` marked by
`ENGINE START` / `ENGINE END`. The test file extracts that section and runs it
in a bare VM, so the rules are covered without a browser: card doubling,
noodle arithmetic, joker substitution, the maki and pudding contests, hand
passing, seat composition for pass-and-play, and 300 complete simulated games
across 2–5 players.
