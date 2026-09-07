/**
 * Onboarding, of the show-don't-tell kind.
 *
 * The aha in this game is flanking: hit a formation in the side or the back and it breaks almost
 * instantly. A new player has to feel that inside ten seconds, without reading anything. So the
 * opening is not a wall of text — it is one objective, one pre-selected unit, and one animated arrow
 * curling round the end of the enemy line, with a single short line under the score.
 *
 * After that the game does the teaching: combat.js announces every flank on the field, hud.js shouts
 * when a unit breaks, and this file only steps the sentence along and then gets out of the way.
 */
((A) => {
  const HOLD = 4.2; // how long the closing line stays up
  const GIVE_UP = 45; // if nothing has happened by now, stop nagging

  A.Coach = class Coach {
    constructor() {
      this.el = document.getElementById("coach");
      this.objectiveEl = this.el.querySelector(".objective");
      this.actionEl = this.el.querySelector(".action");
      this.arrow = null;
      this.step = "off";
      this.game = null;
      this.at = 0;
    }

    begin(game) {
      this.game = game;
      this.clearArrow();
      if (game.autoPlay || game.params.get("t")) {
        this.step = "off";
        this.el.hidden = true;
        return;
      }
      this.target = this.pickVictim(game);
      this.horse = this.pickHorse(game);
      if (!this.target || !this.horse) {
        // No horse to swing with — fall back to the plain objective rather than a lie.
        this.say("Objective", `Break ${game.config.names[1]}.`, "");
        this.step = "watch";
        return;
      }
      game.select([this.horse]);
      this.say("Objective", "Send them round the back.", "");
      this.step = "aim";
      this.at = game.time;
      this.makeArrow();
    }

    /** The enemy formation whose flank is most exposed: the one on the end of their line. */
    pickVictim(game) {
      const foes = game.units.filter((u) => u.side === 1 && u.isActive && !A.TYPES[u.type].mounted);
      if (!foes.length) return null;
      return foes.reduce((a, b) => (Math.abs(b.pos.x) > Math.abs(a.pos.x) ? b : a));
    }

    /** The player's fastest formation on the same wing as that flank. */
    pickHorse(game) {
      const mine = game.units.filter((u) => u.side === 0 && u.isActive);
      const mounted = mine.filter((u) => u.def.mounted);
      const pool = mounted.length ? mounted : [];
      if (!pool.length || !this.target) return pool[0] || null;
      const side = Math.sign(this.target.pos.x) || 1;
      return pool.reduce((a, b) => (Math.abs(b.pos.x - side * 40) < Math.abs(a.pos.x - side * 40) ? b : a));
    }

    say(objective, action, cls) {
      this.el.hidden = false;
      this.el.className = cls || "";
      this.objectiveEl.textContent = objective;
      this.actionEl.textContent = action;
    }

    hide() {
      this.el.hidden = true;
      this.step = "off";
      this.clearArrow();
    }

    // ── the arrow ──────────────────────────────────────────────────────────
    makeArrow() {
      const markers = document.getElementById("markers");
      const el = document.createElement("div");
      el.className = "flank-arrow";
      el.innerHTML =
        // The head sits at the centre of the box, because the box is positioned on the patch of
        // open ground behind the enemy — that is the spot the arrow is naming.
        '<svg viewBox="0 0 120 78" aria-hidden="true">' +
        '<path d="M6 74 C 0 30, 30 16, 58 36" fill="none" stroke="#04141b" stroke-width="14" stroke-linecap="round"/>' +
        '<path d="M6 74 C 0 30, 30 16, 58 36" fill="none" stroke="#7fe3f0" stroke-width="7.5" stroke-linecap="round"/>' +
        '<polygon points="0,-11 23,1 -3,12" fill="#7fe3f0" stroke="#04141b" stroke-width="2.5" ' +
        'stroke-linejoin="round" transform="translate(60 39) rotate(36)"/>' +
        "</svg>";
      markers.appendChild(el);
      this.arrow = el;
    }

    clearArrow() {
      if (this.arrow) this.arrow.remove();
      this.arrow = null;
    }

    /** Where the arrow is pointing: the empty ground directly behind the victim. */
    rearPoint() {
      const t = this.target;
      const d = t.halfDepth + 13;
      return { x: t.pos.x - Math.sin(t.facing) * d, z: t.pos.z - Math.cos(t.facing) * d };
    }

    // ── the story, one beat at a time ──────────────────────────────────────
    onOrder(units) {
      if (this.step !== "aim") return;
      if (!units.some((u) => u.def.mounted)) return;
      this.step = "strike";
      this.say("Now", "Hit them where they are not looking.", "");
    }

    onFlank(call) {
      if (this.step === "off" || this.step === "paid") return;
      this.step = "paid";
      this.clearArrow();
      this.say(
        call.tier >= 2.5 ? "Rear attack" : "Flank attack",
        `×${call.mult.toFixed(1)} damage — and far worse for their nerve.`,
        "win",
      );
      this.at = this.game.time;
    }

    onRout(unit) {
      if (this.step === "off") return;
      if (unit.side !== 1) return;
      this.step = "done";
      this.clearArrow();
      this.say("That is the game", "Units break long before they die. Do it again.", "win");
      this.at = this.game.time;
    }

    update(game, _dt) {
      if (this.step === "off") return;
      this.game = game;

      if ((this.step === "paid" || this.step === "done") && game.time - this.at > HOLD) {
        this.hide();
        return;
      }
      if (game.time > GIVE_UP && this.step !== "paid" && this.step !== "done") {
        this.hide();
        return;
      }
      if (this.target && !this.target.isActive) {
        this.target = this.pickVictim(game);
        if (!this.target) {
          this.clearArrow();
          return;
        }
      }
      if (!this.arrow) return;

      const p = this.rearPoint();
      const s = game.hud.project(p.x, p.z, 3);
      this.arrow.style.display = s.visible ? "" : "none";
      if (!s.visible) return;
      // Kept inside the frame: an arrow half off the top of the screen names nothing.
      this.arrow.style.left = `${A.clamp(s.x, 76, innerWidth - 76)}px`;
      this.arrow.style.top = `${A.clamp(s.y, 128, innerHeight - 210)}px`;
      // Curl the arrow in from whichever wing the player's horse is actually on — measured on
      // screen, not in the world, because the default camera looks north and mirrors x. The pulse
      // animation owns `transform`, so the mirror rides in as a custom property it reads.
      const h = this.horse?.isActive ? game.hud.project(this.horse.pos.x, this.horse.pos.z) : null;
      this.arrow.style.setProperty("--flip", h && h.x > s.x ? "-1" : "1");
    }
  };
})((window.Anchor = window.Anchor || {}));
