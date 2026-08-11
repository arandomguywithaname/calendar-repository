# Sushi Go: Teriyaki Edition

A browser version of the card-drafting game — pick one card, pass the rest —
with three cards swapped off the standard menu and a fourth added. Play the
bots, pass the device around a table, or play people online.

Everything ships in a single self-contained `index.html` — no build step and no
CDN. **Double-click it, or drop the folder on any static host.**

```
sushi-go-teriyaki/
  index.html      the whole game — markup, styles, engine, UI, PeerJS
  test-engine.js  node test-engine.js   (50 checks, no dependencies)
  README.md
```

Three ways to play:

- **Solo** against bots
- **Pass and play** — 2–5 people sharing one device
- **Online** — 2–5 people on separate devices, by quick match or table code

## The new cards

| Replaces | New card | What it does |
|---|---|---|
| Sashimi | **Teriyaki** 照り焼き | Scores nothing itself. **The next card you plate counts twice.** |
| Chopsticks | **Noodles** 麺 | At the end of the round, your **maki count goes up by half**. |
| Wasabi | **Joker** 化札 | **Becomes any other card** you name when you plate it. |
| *(new card)* | **Plate** 皿 | **Combines up to 3 of your nigiri into one card** worth their total. |

### Teriyaki

Plate it, and **the next card you plate counts as two copies of itself**:

- a gyoza counts as **two gyoza** (so 1 gyoza scores 3, not 1)
- a Maki x3 counts as **6 maki icons**
- a squid nigiri scores **6** instead of 3
- a lone tempura becomes **a complete pair** — 5 points from one card

The double is always your own — it never lands on another player. A Teriyaki
is never doubled by another Teriyaki, so plating two in a row simply queues two
doubles for your next two scoring cards.

**A waiting double keeps waiting**, across the end of a round and into the
next, until you plate a card it can land on. So spending your last card of a
round on a Teriyaki isn't wasted — it doubles your first card of the next
round. Only the end of the whole game strands one.

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
counts toward your gyoza run. A Joker can't copy another Joker, and a waiting
Teriyaki double will happily double it.

### Plate

Plate it and choose up to **three nigiri you have already plated**. They come
off the table and sit on the plate as a single card worth their total — three
squid become one 9-point card, drawn as wide as the three cards it replaced.

The total doesn't change by combining. What changes is that it is now **one
card**, and that is the whole point: a Teriyaki double lands on a single card,
so a doubled plate of three squid is **18** rather than the 6 you'd get from
doubling one loose squid. Arm a Teriyaki, then plate the Plate.

The details:

- it only takes **loose** nigiri — once they are on a plate they stay there,
  and a second Plate can't scoop them up again
- each nigiri keeps whatever it was worth, so a squid already doubled by an
  earlier Teriyaki brings 6 onto the plate, not 3
- plating one with no nigiri on the table is allowed; it just sits there
  empty and scores nothing
- a Joker can't copy a Plate — a Plate scores nothing by itself, so copying
  one would be a card that does nothing

There are 6 Plates in the deck, which is now 114 cards.

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

2–5 players, three rounds, **seven cards a hand** whatever the player count —
so seven turns a round, and 21 cards plated over a game. Every turn all players
plate one card at the same time, then hands pass to the left. Highest score
after three rounds and the pudding contest wins.

Opponents come in Easy, Normal and Hard — the difficulty sets how much noise is
added to their card evaluation, and all three know to save a big card for a
waiting Teriyaki double.

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

## Playing online, on separate devices

Open **Online**, type a name, and either:

- **Quick match** — you're dropped into the first table with room, with
  whoever else is looking right now. If nobody is, you hold a table until
  someone arrives, or start against bots.
- **Start a private table** — you get a four-letter code (like `NIGI`) to send
  your friends, who type it into **Join**.

Up to five at a table. The host can start whenever a second player arrives;
any seats still empty are simply not dealt in, or filled with bots.

### How it connects

Peer-to-peer, with no server of ours anywhere. Players are introduced by the
free public [PeerJS](https://peerjs.com) signalling service, then the game
data flows directly between browsers over WebRTC. That means the whole thing
is still a static site — this folder on any static host is the entire
deployment.

The player who opens the table hosts it: their browser runs the rules and is
the single source of truth, and sends every other player a personalised view
of the table. **A view only ever contains that player's own hand** — nobody's
cards are broadcast, so another player's browser cannot show what you are
holding even if they went looking.

What happens when things go wrong:

- **Someone takes too long** — after 45 seconds the host plates a card for
  them so the table isn't held up. Three misses in a row and a bot takes the
  seat.
- **Someone leaves** — a bot finishes the game in their seat.
- **The host leaves** — the table closes and everyone is told. There is no
  handover to a new host.

Because it leans on a free public signalling service, this is built for
playing with friends rather than as a service with uptime promises. If the
service is unreachable the game says so plainly, and everything on your own
device still works.

### Testing it on one machine

Add `?net=local` to the URL and the game swaps the peer connection for a
`BroadcastChannel`, so several tabs in the same browser can share a table with
no network at all. `?turnlimit=<seconds>` shortens the slow-player timeout.

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
