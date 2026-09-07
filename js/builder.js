/**
 * The muster sheet: assembling a shoal out of a roster of cards.
 *
 * Two rules shaped it. A new player must never have to fill in a form before they can play, so the
 * game still boots straight into the reef pass and the three presets are one click from starting a
 * battle. And anyone who does want to pick their own roster should be able to do it in about fifteen
 * seconds, so it is a strip of cards to tap and a row per formation — type, rarity, how many
 * formations, how many in each — behind a disclosure triangle, and nothing else.
 *
 * Rarity is on the row because rarity is load-bearing: a tier buys traits and traits move the same
 * numbers everything else uses. It is the shape of a collection and none of the machinery — no
 * wallet, no mint, no network. See A.RARITY in units.js.
 */
((A) => {
  const $ = (id) => document.getElementById(id);
  const clone = (v) => JSON.parse(JSON.stringify(v));

  A.Builder = class Builder {
    constructor(game) {
      this.game = game;
      this.el = $("builder");
      this.detail = $("builder-detail");
      this.noteEl = $("builder-note");
      this.nameEls = [$("builder-name0"), $("builder-name1")];
      this.rowEls = [$("builder-rows0"), $("builder-rows1")];
      this.totalEls = [$("builder-total0"), $("builder-total1")];
      this.state = this.fromPreset("classic");
      this.presetName = "classic";

      for (const b of this.el.querySelectorAll(".preset")) {
        const key = b.dataset.preset;
        const p = A.PRESETS[key];
        b.innerHTML = `${p.label}<small></small>`;
        b.querySelector("small").textContent = this.summarise(key);
        // One click is the whole interaction: pick a battle, be in it.
        b.addEventListener("click", () => this.start(key));
        b.addEventListener("mouseenter", () => {
          this.noteEl.textContent = p.note;
        });
      }
      this.el.addEventListener("mouseleave", () => {
        this.noteEl.textContent = A.PRESETS[this.presetName].note;
      });

      this.buildRosters();
      this.nameEls.forEach((el, side) => {
        el.addEventListener("input", () => {
          this.state.names[side] = el.value.slice(0, 18) || (side === 0 ? "Rome" : "Gauls");
        });
      });

      $("builder-start").addEventListener("click", () => this.start(null));
      $("builder-cancel").addEventListener("click", () => this.close());
      addEventListener("keydown", (e) => {
        if (e.key === "Escape" && !this.el.hidden) {
          e.preventDefault();
          this.close();
        }
      });
      this.buildLegend();
      this.render();
    }

    /** A preset, expanded into the editable shape so the detail rows can start from it. */
    fromPreset(key) {
      const p = A.PRESETS[key];
      if (p.sides) return { names: clone(p.names), sides: clone(p.sides) };
      // Classic is hand-placed, so summarise its roster into rows.
      const sides = [[], []];
      for (const spec of p.roster) {
        const row = sides[spec.side].find(
          (r) => r.type === spec.type && r.men === (spec.men || A.TYPES[spec.type].men),
        );
        if (row) row.formations++;
        else
          sides[spec.side].push({ type: spec.type, formations: 1, men: spec.men || A.TYPES[spec.type].men });
      }
      return { names: clone(p.names), sides };
    }

    summarise(key) {
      const s = this.fromPreset(key);
      return s.sides
        .map((side) => side.reduce((n, r) => n + r.formations * r.men, 0))
        .join(" v ")
        .concat(" men");
    }

    // ── the detail rows ────────────────────────────────────────────────────
    render() {
      for (const side of [0, 1]) {
        this.nameEls[side].value = this.state.names[side];
        const host = this.rowEls[side];
        host.innerHTML = "";
        this.state.sides[side].forEach((row, i) => {
          const el = document.createElement("div");
          el.className = "brow";
          el.innerHTML =
            "<select></select>" +
            '<select class="rar" aria-label="rarity"></select>' +
            '<input class="f" type="number" min="1" max="12" step="1" aria-label="formations">' +
            "<label>×</label>" +
            '<input class="m" type="number" min="1" max="200" step="1" aria-label="size">' +
            '<button class="x" type="button" aria-label="remove">✕</button>';
          const sel = el.querySelector("select");
          for (const t of A.TYPE_ORDER) {
            const o = document.createElement("option");
            o.value = t;
            o.textContent = A.TYPES[t].label;
            sel.appendChild(o);
          }
          sel.value = row.type;
          sel.addEventListener("change", () => {
            row.type = sel.value;
            row.men = A.TYPES[sel.value].men;
            this.render();
          });
          const rar = el.querySelector(".rar");
          for (const tier of A.RARITY) {
            const o = document.createElement("option");
            o.value = tier.key;
            o.textContent = tier.label;
            rar.appendChild(o);
          }
          rar.value = row.rarity || "common";
          rar.dataset.rarity = rar.value;
          rar.title = `${A.rarityOf(rar.value).traits} traits · attack and defence ×${A.rarityOf(rar.value).scale}`;
          rar.addEventListener("change", () => {
            row.rarity = rar.value;
            this.render();
          });
          const f = el.querySelector(".f");
          const m = el.querySelector(".m");
          f.value = row.formations;
          m.value = row.men;
          f.addEventListener("input", () => {
            row.formations = A.clamp(Math.round(Number(f.value) || 1), 1, 12);
            this.totals();
          });
          m.addEventListener("input", () => {
            row.men = A.clamp(Math.round(Number(m.value) || 1), 1, 200);
            this.totals();
          });
          el.querySelector(".x").addEventListener("click", () => {
            if (this.state.sides[side].length > 1) this.state.sides[side].splice(i, 1);
            this.render();
          });
          host.appendChild(el);
        });
      }
      this.totals();
      for (const b of this.el.querySelectorAll(".preset")) {
        b.classList.toggle("on", b.dataset.preset === this.presetName);
      }
      this.noteEl.textContent = A.PRESETS[this.presetName].note;
    }

    totals() {
      for (const side of [0, 1]) {
        const rows = this.state.sides[side];
        const men = rows.reduce((n, r) => n + r.formations * r.men, 0);
        const forms = rows.reduce((n, r) => n + r.formations, 0);
        const traits = rows.reduce((n, r) => n + r.formations * A.rarityOf(r.rarity).traits, 0);
        this.totalEls[side].textContent = `${forms} formations · ${men} strong · ${traits} traits`;
      }
    }

    /** Six cards a side. Tap one and it joins your line — that is the whole interaction. */
    buildRosters() {
      for (const host of this.el.querySelectorAll(".roster")) {
        const side = Number(host.dataset.side);
        host.innerHTML = "";
        for (const t of A.TYPE_ORDER) {
          const n = A.matchupNotes(t);
          const b = document.createElement("button");
          b.type = "button";
          b.className = "pick";
          b.dataset.type = t;
          b.innerHTML = `${A.sigil(t)}<b></b>`;
          b.querySelector("b").textContent = A.TYPES[t].label;
          b.title = `${A.TYPES[t].blurb}\nBeats ${n.beats}, loses to ${n.losesTo}.`;
          b.addEventListener("click", () => {
            this.state.sides[side].push({
              type: t,
              formations: 1,
              men: A.TYPES[t].men,
              rarity: "common",
            });
            this.render();
          });
          host.appendChild(b);
        }
      }
    }

    /** The whole triangle, on the page, so nobody has to guess what a leviathan is for. */
    buildLegend() {
      const host = $("builder-legend");
      host.innerHTML = "";
      for (const t of A.TYPE_ORDER) {
        const n = A.matchupNotes(t);
        const el = document.createElement("div");
        el.className = "row";
        el.innerHTML =
          `${A.sigil(t)}<span><b></b> beats <span class="good"></span>, loses to <span class="bad"></span>` +
          `${A.TYPES[t].fearless ? ", never routs" : ""}${A.TYPES[t].fatigueMax ? ", tires fast" : ""}</span>`;
        el.querySelector("b").textContent = A.TYPES[t].label;
        el.querySelector(".good").textContent = n.beats;
        el.querySelector(".bad").textContent = n.losesTo;
        el.title = A.TYPES[t].blurb;
        host.appendChild(el);
      }
    }

    // ── programmatic access, used by the QA harness ────────────────────────
    set(cfg) {
      if (cfg.names) this.state.names = clone(cfg.names);
      if (cfg.sides) this.state.sides = clone(cfg.sides);
      this.presetName = "classic";
      this.render();
      return this.config();
    }

    config() {
      return clone({ names: this.state.names, sides: this.state.sides });
    }

    // ── open, close, fight ─────────────────────────────────────────────────
    open() {
      this.wasPaused = this.game.paused;
      this.game.paused = true;
      this.el.hidden = false;
      this.render();
    }

    close() {
      this.el.hidden = true;
      this.game.paused = this.wasPaused === true;
    }

    start(preset) {
      if (preset) {
        this.presetName = preset;
        this.state = this.fromPreset(preset);
      }
      this.el.hidden = true;
      this.game.paused = false;
      const cfg = preset ? A.PRESETS[preset] : { names: this.state.names, sides: clone(this.state.sides) };
      this.game.startBattle({ ...cfg, seed: (Math.random() * 0xffffffff) >>> 0 });
      this.game.hud.log(`${this.game.config.names[0]} take the water.`, "system");
      this.render();
    }
  };
})((window.Anchor = window.Anchor || {}));
