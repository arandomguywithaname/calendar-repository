# Put the game online with Render (free)

This gives you one address that hosts the game **and** the multiplayer
relay, so friends anywhere can play together by typing a room code.

Render's free tier sleeps a service after ~15 minutes of no traffic and
takes roughly a minute to wake. The first person to connect may wait;
after that it is instant until it idles again.

## 1. Put these files in a GitHub repo

Unzip this folder and push the whole thing to a new GitHub repository.
The important pieces are `server.js`, `index.html`, `js/`, `css/` and
`render.yaml`.

## 2. Create the service

1. Sign in at <https://render.com> (the free tier needs no card).
2. **New +** → **Blueprint**.
3. Pick your repository and press **Apply**.

`render.yaml` already sets everything: Node runtime, no build step
(the game has zero dependencies), `node server.js` to start, and a
health check at `/healthz`.

Prefer doing it by hand? **New +** → **Web Service**, pick the repo, then:

| Field | Value |
| --- | --- |
| Runtime | Node |
| Build command | *(leave empty)* |
| Start command | `node server.js` |
| Instance type | Free |

## 3. Point the game at it

Render gives you an address like `https://dune-relay.onrender.com`.
Open `config.js` and paste it in, changing `https` to `wss`:

```js
window.DUNE_RELAY = 'wss://dune-relay.onrender.com';
```

Commit that change. Anyone opening your Render address — or your
itch.io upload of the same files — now reaches the same relay, and
players only ever type a room code.

## Checks

- `https://your-address.onrender.com/healthz` should return
  `{"ok":true,...}`.
- `https://your-address.onrender.com/` should load the game.
- In the game, **Settings → Graphics** shows the renderer; the PvP lobby
  shows "Connected" once the relay answers.

## Without editing files

To try a relay on one device only, open the game with the address in the
URL — it is remembered on that device:

```
https://your-itch-page/?relay=wss://dune-relay.onrender.com
```

The PvP lobby's **Advanced** panel accepts the same address, and you can
paste the `https://` form — it is converted for you.
