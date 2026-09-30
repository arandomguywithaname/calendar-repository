/* ==========================================================================
   OPERATION: DUNE — server setting

   EDIT THE ONE LINE AT THE BOTTOM to play with friends anywhere using only
   a room code.

   1. Deploy this game's server.js to Render (see DEPLOY.md — it is free).
   2. Render gives you an address like:  https://dune-relay.onrender.com
   3. Paste that address between the quotes exactly as Render shows it:

        window.DUNE_RELAY = 'https://dune-relay.onrender.com';

   That is the whole setup. The game converts the address to a socket URL
   itself; you never have to type one.

   Leave it empty and the game talks to whatever server served the page,
   which is what `npm run game` gives you on your own network.
   ========================================================================== */

window.DUNE_RELAY = '';
