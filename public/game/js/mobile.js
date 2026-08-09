'use strict';
/* ------------------------------------------------------------------
   mobile.js — touch controls. A floating movement stick on the left,
   drag-to-look everywhere else, and round action buttons. All input is
   translated into the same keys/mouse state the desktop path reads, so
   the game logic does not know the difference.
   ------------------------------------------------------------------ */

const IS_TOUCH_DEVICE = ('ontouchstart' in window) ||
  (window.matchMedia && matchMedia('(pointer: coarse)').matches);

class TouchControls {
  constructor(game) {
    this.game = game;
    this.moveVec = { x: 0, y: 0 };      // stick output, -1..1
    this.stickTouch = null;
    this.lookTouch = null;
    this.useHeld = false;

    this.ui = document.getElementById('touchUI');
    this.stickZone = document.getElementById('stickZone');
    this.stickBase = document.getElementById('stickBase');
    this.stickNub = document.getElementById('stickNub');
    this.useBtn = document.getElementById('btnUseT');
    if (!this.ui) return;

    this._bindStick();
    this._bindLook();
    this._bindButtons();

    // Stop the browser from scrolling, zooming or selecting mid-fight.
    document.addEventListener('gesturestart', e => e.preventDefault());
    document.addEventListener('touchmove', (e) => {
      if (game.mobile && game.running && !game.shopOpen && !game.paused) e.preventDefault();
    }, { passive: false });
  }

  /* --------------------------- movement stick --------------------------- */

  _bindStick() {
    const zone = this.stickZone;
    zone.addEventListener('touchstart', (e) => {
      e.preventDefault();
      if (this.stickTouch !== null) return;
      const t = e.changedTouches[0];
      this.stickTouch = t.identifier;
      this.stickOrigin = [t.clientX, t.clientY];
      this.stickBase.style.left = t.clientX + 'px';
      this.stickBase.style.top = t.clientY + 'px';
      this.stickBase.classList.add('on');
      this._moveNub(0, 0);
    }, { passive: false });

    zone.addEventListener('touchmove', (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (t.identifier !== this.stickTouch) continue;
        const R = 52;
        let dx = t.clientX - this.stickOrigin[0];
        let dy = t.clientY - this.stickOrigin[1];
        const len = Math.hypot(dx, dy);
        if (len > R) { dx *= R / len; dy *= R / len; }
        this._moveNub(dx, dy);
        this.moveVec.x = dx / R;
        this.moveVec.y = dy / R;
      }
    }, { passive: false });

    const end = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier !== this.stickTouch) continue;
        this.stickTouch = null;
        this.moveVec.x = 0; this.moveVec.y = 0;
        this.stickBase.classList.remove('on');
      }
    };
    zone.addEventListener('touchend', end);
    zone.addEventListener('touchcancel', end);
  }

  _moveNub(dx, dy) {
    this.stickNub.style.transform = `translate(${dx}px, ${dy}px)`;
  }

  /* ----------------------------- look drag ----------------------------- */

  _bindLook() {
    const zone = document.getElementById('touchLook');
    zone.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const g = this.game;
      if (!g.running) return;
      if (!g.localPlayer.alive && g.phase !== PHASE.MATCHEND && g.mode !== 'practice') {
        g.cycleSpectate();               // dead: tap flips to the next teammate
        return;
      }
      if (this.lookTouch !== null) return;
      const t = e.changedTouches[0];
      this.lookTouch = t.identifier;
      this.lookLast = [t.clientX, t.clientY];
    }, { passive: false });

    zone.addEventListener('touchmove', (e) => {
      e.preventDefault();
      const g = this.game;
      const p = g.localPlayer;
      for (const t of e.changedTouches) {
        if (t.identifier !== this.lookTouch) continue;
        const dx = t.clientX - this.lookLast[0];
        const dy = t.clientY - this.lookLast[1];
        this.lookLast = [t.clientX, t.clientY];
        if (!p.alive || g.paused || g.shopOpen) continue;
        const s = g.hud.settings;
        const zf = zoomFovOf(p);
        const sens = s.sens * 0.0028 * (zf ? zf / s.fov : 1);
        p.yaw -= dx * sens;
        p.pitch -= dy * sens * (s.invertY ? -1 : 1);
        p.pitch = clamp(p.pitch, -1.55, 1.55);
        p.yaw = ((p.yaw + Math.PI) % TAU + TAU) % TAU - Math.PI;
      }
    }, { passive: false });

    const end = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this.lookTouch) this.lookTouch = null;
      }
    };
    zone.addEventListener('touchend', end);
    zone.addEventListener('touchcancel', end);
  }

  /* ------------------------------ buttons ------------------------------ */

  _bindButtons() {
    const g = this.game;
    const bind = (id, down, up) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); down(); }, { passive: false });
      const release = (e) => { e.preventDefault(); if (up) up(); };
      el.addEventListener('touchend', release);
      el.addEventListener('touchcancel', release);
    };

    bind('btnFire', () => { g.sound.init(); g.mouse.left = true; }, () => { g.mouse.left = false; });
    bind('btnZoomT', () => g.altFire());
    bind('btnJumpT', () => g.keys.add('Space'), () => g.keys.delete('Space'));
    bind('btnCrouchT', () => {
      this.crouchOn = !this.crouchOn;
      document.getElementById('btnCrouchT').classList.toggle('latched', this.crouchOn);
      if (this.crouchOn) g.keys.add('ControlLeft'); else g.keys.delete('ControlLeft');
    });
    bind('btnReloadT', () => { if (g.localPlayer.alive) g.startReload(g.localPlayer); });
    bind('btnSwapT', () => this.game.cycleWeapon(1));
    bind('btnNadeT', () => { if (g.localPlayer.alive && g.localPlayer.nextGrenade()) g.sound.play('switch'); });
    bind('btnBuyT', () => {
      if (g.canBuy(g.localPlayer)) g.openShop(!g.shopOpen);
      else g.sound.play('error');
    });
    bind('btnScoresT', () => g.hud.showScoreboard(true), () => g.hud.showScoreboard(false));
    bind('btnPauseT', () => g.setPaused(true));
    bind('btnUseT', () => {
      g.keys.add('KeyE');
      g.useAction();                      // one-shot pickups fire immediately
    }, () => g.keys.delete('KeyE'));
  }

  /* ------------------------------ per frame ------------------------------ */

  /** Feed the stick into the movement command the game builds each frame. */
  applyMove(cmd) {
    if (this.stickTouch === null && !this.moveVec.x && !this.moveVec.y) return;
    cmd.forward += -this.moveVec.y;
    cmd.side += this.moveVec.x;
    const mag = Math.hypot(this.moveVec.x, this.moveVec.y);
    if (mag > 0.02 && mag < 0.5) cmd.walk = true;   // gentle push = silent walk
  }

  tick() {
    const g = this.game;
    if (!this.ui) return;
    const inMatch = g.running && !g.paused && !g.shopOpen && g.phase !== PHASE.MATCHEND;
    const show = g.mobile && inMatch;
    // A real touch device forced into desktop controls keeps just the pause
    // button, otherwise there is no way back to Settings without a keyboard.
    const minimal = !g.mobile && g.hasTouch && inMatch;
    this.ui.classList.toggle('hidden', !(show || minimal));
    this.ui.classList.toggle('minimal', minimal);
    document.body.classList.toggle('ingame', g.mobile && g.running);
    if (!show) return;

    // Contextual USE button: plant / defuse / pick up.
    const p = g.localPlayer;
    let label = null;
    if (p.alive) {
      if (p.team === 'T' && p.hasBomb && g.map.whichSite(p.pos) && !g.bomb.planted) label = 'PLANT';
      else if (p.team === 'CT' && g.bomb.planted && V.distXZ(p.pos, g.bomb.pos) < 2.0) label = 'DEFUSE';
      else if (g.droppedWeapons.some(d => V.distXZ(d.pos, p.pos) < 1.4)) label = 'PICK UP';
    }
    this.useBtn.classList.toggle('hidden', !label);
    if (label && this.useBtn.textContent !== label) this.useBtn.textContent = label;
  }
}
