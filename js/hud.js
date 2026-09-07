/**
 * The HTML layer, and the place the battle is made legible.
 *
 * Borrowed wholesale from Rome: Total War, because it solved this: a bar of unit cards along the
 * bottom, one per formation, each carrying a type sigil, a strength bar that visibly drains and a
 * morale strip that changes colour a moment *before* the unit breaks. You read the state of your
 * whole line without looking away from the field, and a break is telegraphed rather than surprising.
 *
 * Everything here is read-only reporting on the simulation, with one exception: clicking a card
 * selects that formation, which is how most orders actually get given. Clicking its sigil opens the
 * formation's own card — rarity, traits, and what it has done in this battle.
 */
((A) => {
  const $ = (id) => document.getElementById(id);

  /**
   * A silhouette per type. Words are slower than shapes — at a glance you should know that the card
   * on the left is horse and the one next to it is a spear wall without reading either.
   */
  const SIGILS = {
    sword:
      '<path d="M12 1.5l2.4 4.6v8.4H9.6V6.1z"/><rect x="6.6" y="14.5" width="10.8" height="2.1"/><rect x="10.9" y="16.6" width="2.2" height="6"/>',
    spear:
      '<path d="M12 0.8l3.2 6.4H8.8z"/><rect x="10.9" y="7.2" width="2.2" height="15.5"/><rect x="7.4" y="11" width="9.2" height="1.6"/>',
    cavalry:
      '<path d="M3.6 22.4c0-7.4 2.2-11.6 6.2-13.7l.7-5.3 3.9 3.8 3.6 1.2-1.9 3.1c1.9 2.9 2.1 6.9 2.1 10.9z"/>',
    knight:
      '<path fill-rule="evenodd" d="M12 1.4A7.2 7.2 0 0 0 4.8 8.6v6.6A4.2 4.2 0 0 0 9 19.4h6a4.2 4.2 0 0 0 4.2-4.2V8.6A7.2 7.2 0 0 0 12 1.4zM7.8 9.6h8.4v2.6H7.8z"/><path d="M11 19.4h2v3.4h-2z"/>',
    ogre: '<circle cx="15.6" cy="7.6" r="6.1"/><path d="M11.1 12.2l2.4 2.4-8.2 8.2-2.4-2.4z"/>',
    zombie:
      '<path fill-rule="evenodd" d="M12 1.2a8.2 8.2 0 0 0-8.2 8.2v3.9l1.9 1.9v3.5a2 2 0 0 0 2 2h8.6a2 2 0 0 0 2-2v-3.5l1.9-1.9V9.4A8.2 8.2 0 0 0 12 1.2zM8 8.4a1.9 1.9 0 1 0 0 3.8 1.9 1.9 0 0 0 0-3.8zm8 0a1.9 1.9 0 1 0 0 3.8 1.9 1.9 0 0 0 0-3.8z"/>',
  };

  A.sigil = (type) =>
    `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${SIGILS[type] || SIGILS.sword}</svg>`;

  A.Hud = class Hud {
    constructor(game) {
      this.game = game;
      this.markers = $("markers");
      this.sheetEl = $("sheet");
      this.sheetOpen = true;
      this.sheetSig = "";
      this.commandEl = $("command");
      this.selinfoEl = $("selinfo");
      this.logEl = $("log");
      this.shoutEl = $("shout");
      this.toastEl = $("toast");
      this.resultEl = $("result");
      this.minimap = $("minimap-canvas");
      this.mctx = this.minimap ? this.minimap.getContext("2d") : null;
      this.bars = [$("bar0"), $("bar1")];
      this.men = [$("men0"), $("men1")];
      this.names = [$("name0"), $("name1")];
      this.byUnit = new Map();
      this.cards = new Map();
      this.signature = "";
      this.toastUntil = 0;
      this.shoutUntil = 0;
      this.v = new THREE.Vector3();
      this.lines = [];

      $("restart").addEventListener("click", () => game.restart());
      $("result-new").addEventListener("click", () => A.builder.open());
      $("newgame").addEventListener("click", () => A.builder.open());

      const help = $("help");
      const toggle = $("help-toggle");
      toggle.addEventListener("click", () => {
        const open = help.classList.toggle("collapsed") === false;
        toggle.setAttribute("aria-expanded", String(open));
      });
      // The controls belong behind a key as well as behind a button.
      addEventListener("keydown", (e) => {
        if (A.typingInAField(e.target)) return;
        if (e.key === "?" || (e.key === "/" && e.shiftKey) || e.key === "h") toggle.click();
        if (e.key === "c" || e.key === "C") {
          this.sheetOpen = !this.sheetOpen;
          this.sheetSig = "";
        }
      });

      this.commandEl.addEventListener("click", (e) => {
        const card = e.target.closest(".card");
        if (!card) return;
        const unit = game.units.find((u) => String(u.id) === card.dataset.id);
        if (!unit || unit.state === "gone") return;
        // Clicking the sigil opens the formation's card rather than just selecting it.
        if (e.target.closest(".sigil")) this.sheetOpen = true;
        game.select(e.shiftKey ? game.selected.concat([unit]) : [unit]);
      });
    }

    reset() {
      this.markers.innerHTML = "";
      this.commandEl.innerHTML = "";
      this.selinfoEl.innerHTML = "";
      this.selinfoEl.hidden = true;
      this.logEl.innerHTML = "";
      this.lines = [];
      this.byUnit.clear();
      this.cards.clear();
      this.signature = "";
      this.resultEl.hidden = true;
      this.resultEl.className = "";
      this.shoutEl.hidden = true;
      this.toastEl.hidden = true;
      this.sheetEl.hidden = true;
      this.sheetSig = "";
    }

    armiesChanged(names) {
      this.names[0].textContent = names[0];
      this.names[1].textContent = names[1];
      this.buildCommandBar();
    }

    // ── the running commentary ─────────────────────────────────────────────
    toast(msg, now) {
      this.toastEl.textContent = msg;
      this.toastEl.hidden = false;
      this.toastUntil = now + 2.6;
    }

    /** The battle's own voice. Six lines, newest at the bottom, colour-coded by who it hurt. */
    log(msg, kind = "") {
      const el = document.createElement("div");
      el.className = `line fresh ${kind}`;
      el.textContent = msg;
      this.logEl.appendChild(el);
      this.lines.push(el);
      while (this.lines.length > 6) this.lines.shift().remove();
      setTimeout(() => el.classList.remove("fresh"), 320);
    }

    /** A formation breaking is the loudest thing that happens. It gets the middle of the screen. */
    shout(name, mine) {
      this.shoutEl.className = mine ? "bad" : "";
      this.shoutEl.hidden = false;
      this.shoutEl.innerHTML = `<div class="who"></div><div class="what">broken</div>`;
      this.shoutEl.firstChild.textContent = name;
      // Restart the animation even if one is already running.
      this.shoutEl.classList.remove("live");
      void this.shoutEl.offsetWidth;
      this.shoutEl.classList.add("live");
      this.shoutUntil = this.game.time + 2.6;
    }

    showResult(won, sub) {
      this.resultEl.hidden = false;
      this.resultEl.className = won ? "win" : "lose";
      $("result-title").textContent = won ? "The pass is yours" : "The line is broken";
      $("result-sub").textContent = sub;
    }

    /** World point to screen point, for anything that has to hang over the battlefield. */
    project(x, z, lift = 0) {
      const g = this.game;
      this.v.set(x, g.terrain.heightAt(x, z) + lift, z);
      this.v.project(g.camera);
      return {
        x: ((this.v.x + 1) / 2) * innerWidth,
        y: ((1 - this.v.y) / 2) * innerHeight,
        visible: this.v.z < 1 && Math.abs(this.v.x) < 1.3 && Math.abs(this.v.y) < 1.3,
      };
    }

    // ── per frame ──────────────────────────────────────────────────────────
    update(now, _dt) {
      const g = this.game;
      if (!this.toastEl.hidden && now > this.toastUntil) this.toastEl.hidden = true;
      if (!this.shoutEl.hidden && now > this.shoutUntil) this.shoutEl.hidden = true;

      for (const side of [0, 1]) {
        const units = g.units.filter((u) => u.side === side);
        const alive = units.reduce((n, u) => n + (u.state === "gone" ? 0 : u.alive), 0);
        const steady = units.reduce((n, u) => n + (u.isActive ? u.alive : 0), 0);
        const total = g.startingMen[side] || 1;
        this.bars[side].style.width = `${((steady / total) * 100).toFixed(1)}%`;
        this.men[side].textContent = `${steady}/${total}${alive > steady ? " ⚑" : ""}`;
      }

      this.drainHitCalls();
      this.updateMarkers();
      this.updateCommandBar();
      this.updateSelection();
      this.updateSheet();
      this.drawMinimap();
    }

    /**
     * The payoff. combat.js queues a call whenever a flank or rear attack lands with real contact
     * behind it; this puts the number on the field, where the player is already looking.
     */
    drainHitCalls() {
      for (const u of this.game.units) {
        if (!u.hitCalls.length) continue;
        for (const call of u.hitCalls) {
          const p = this.project(call.x, call.z, 6);
          if (p.visible) {
            const el = document.createElement("div");
            el.className = `hit-call${call.tier >= 2.5 ? " rear" : ""}${call.byFriendly ? "" : " against"}`;
            el.textContent = `${call.label} ×${call.mult.toFixed(1)}`;
            el.style.left = `${p.x}px`;
            el.style.top = `${p.y}px`;
            this.markers.appendChild(el);
            el.addEventListener("animationend", () => el.remove());
          }
          if (call.byFriendly) {
            this.log(
              `${call.label === "REAR" ? "In the back" : "In the flank"} — ×${call.mult.toFixed(1)} on ${u.name}`,
              "flank",
            );
            if (A.coach) A.coach.onFlank(call);
          }
        }
        u.hitCalls.length = 0;
      }
    }

    updateMarkers() {
      const g = this.game;
      for (const u of g.units) {
        let el = this.byUnit.get(u);
        if (!el) {
          el = document.createElement("div");
          el.className = "marker";
          el.innerHTML = '<div class="m-bar"><i></i></div><div class="m-tag"></div>';
          this.markers.appendChild(el);
          this.byUnit.set(u, el);
        }
        if (u.state === "gone") {
          el.style.display = "none";
          continue;
        }

        const p = this.project(u.pos.x, u.pos.z, 4.2);
        if (!p.visible) {
          el.style.display = "none";
          continue;
        }
        el.style.display = "";
        el.style.left = `${p.x}px`;
        el.style.top = `${p.y}px`;
        el.classList.toggle("sel", u.selected);

        const fill = el.firstChild.firstChild;
        fill.style.width = `${((u.alive / u.initial) * 100).toFixed(0)}%`;
        // The bar carries two numbers at once: length is men, colour is nerve.
        fill.style.background =
          u.state === "routing"
            ? "#ff6a4d"
            : u.side === 0
              ? `hsl(${(8 + u.morale * 0.16).toFixed(0)}, 88%, 66%)`
              : `hsl(${(188 - (100 - u.morale) * 1.6).toFixed(0)}, 70%, 60%)`;
        el.lastChild.textContent = u.state === "routing" ? "ROUTING" : "";
      }
    }

    // ── the command bar ────────────────────────────────────────────────────
    buildCommandBar() {
      this.commandEl.innerHTML = "";
      this.cards.clear();
      for (const u of this.game.units) {
        if (u.side !== 0) continue;
        const el = document.createElement("button");
        el.type = "button";
        el.className = "card";
        el.dataset.id = String(u.id);
        el.dataset.side = String(u.side);
        el.dataset.rarity = u.rarity;
        el.innerHTML =
          `<span class="sigil">${A.sigil(u.type)}</span>` +
          '<span class="count"></span><span class="name"></span>' +
          '<span class="strength"><i></i></span><span class="nerve"><i></i></span><span class="tag" hidden></span>';
        el.querySelector(".name").textContent = u.name;
        el.title = `${u.name} — ${A.rarityOf(u.rarity).label} ${A.TYPES[u.type].label}`;
        this.commandEl.appendChild(el);
        this.cards.set(u, el);
      }
    }

    updateCommandBar() {
      if (this.cards.size === 0 && this.game.units.length) this.buildCommandBar();
      for (const [u, el] of this.cards) {
        const routing = u.state === "routing";
        el.classList.toggle("sel", u.selected);
        el.classList.toggle("routing", routing);
        el.classList.toggle("gone", u.state === "gone");
        // Amber-to-red before the break, not after it.
        el.classList.toggle("wavering", !routing && u.state !== "gone" && u.morale < 42);
        el.querySelector(".count").textContent = u.state === "gone" ? "—" : u.alive;
        el.querySelector(".sigil").style.color = u.selected
          ? "var(--gold)"
          : routing
            ? "var(--bad)"
            : "var(--bronze)";
        el.querySelector(".strength i").style.width = `${((u.alive / u.initial) * 100).toFixed(0)}%`;
        const nerve = el.querySelector(".nerve i");
        nerve.style.width = `${Math.max(0, u.morale).toFixed(0)}%`;
        nerve.style.background = routing
          ? "var(--bad)"
          : u.def.fearless
            ? "#7c6ca8"
            : u.morale > 58
              ? "var(--good)"
              : u.morale > 34
                ? "var(--warn)"
                : "var(--bad)";
        const tag = el.querySelector(".tag");
        const label = routing ? "BROKEN" : u.worstFlank >= 2.5 ? "REAR!" : u.worstFlank > 0 ? "FLANKED" : "";
        tag.hidden = !label;
        tag.textContent = label;
      }
    }

    /**
     * What is selected, what it eats, what eats it, and whether it is currently winning. Three
     * short lines instead of a paragraph, because it is read mid-battle or not at all.
     */
    updateSelection() {
      const sel = this.game.selected;
      const sig = sel.map((u) => u.id).join(",");
      if (sig !== this.signature) {
        this.signature = sig;
        this.selinfoEl.innerHTML = "";
        this.selinfoEl.hidden = sel.length === 0;
        if (sel.length) {
          this.selinfoEl.innerHTML =
            '<span class="who"></span><span class="kind"></span><span class="vs"></span><span class="verdict"></span>';
        }
      }
      if (!sel.length) return;

      const lead = sel[0];
      const many = sel.length > 1;
      const notes = A.matchupNotes(lead.type);
      this.selinfoEl.querySelector(".who").textContent = many ? `${sel.length} formations` : lead.name;
      this.selinfoEl.querySelector(".kind").textContent = many ? "mixed orders" : A.TYPES[lead.type].label;
      this.selinfoEl.querySelector(".vs").innerHTML = many
        ? ""
        : `beats <b></b> · loses to <s></s>${lead.def.fearless ? " · never routs" : ""} · ${lead.alive}/${lead.initial} men`;
      if (!many) {
        this.selinfoEl.querySelector(".vs b").textContent = notes.beats;
        this.selinfoEl.querySelector(".vs s").textContent = notes.losesTo;
      }

      const verdict = this.selinfoEl.querySelector(".verdict");
      const worst = sel.reduce((a, u) => (u.morale < a.morale ? u : a), sel[0]);
      let text = "holding";
      let cls = "holding";
      if (sel.some((u) => u.state === "routing")) {
        text = "broken";
        cls = "broken";
      } else if (sel.some((u) => u.worstFlank >= 2.5)) {
        text = "taken in the rear";
        cls = "losing";
      } else if (sel.some((u) => u.worstFlank > 0)) {
        text = "flanked";
        cls = "losing";
      } else if (sel.some((u) => u.contactsOn > 0 || u.contactsAgainst > 0)) {
        const edge = sel.reduce((n, u) => n + u.edge, 0) / sel.length;
        text = edge > 0.12 ? "winning" : edge < -0.12 ? "losing" : "even fight";
        cls = edge > 0.12 ? "winning" : edge < -0.12 ? "losing" : "holding";
      } else if (sel.some((u) => u.state === "moving")) {
        text = "advancing";
      }
      if (cls === "holding" && worst.morale < 45 && !worst.def.fearless) {
        text = "wavering";
        cls = "losing";
      }
      verdict.textContent = text;
      verdict.className = `verdict ${cls}`;
    }

    /**
     * The trait sheet: one formation as a collectible card — what it is, what tier it rolled, the
     * traits that tier bought it, and what it has actually done today. The record is the point. A
     * collectible with no provenance is a sticker, and the provenance here is the battle you are in.
     */
    updateSheet() {
      const sel = this.game.selected;
      const u = sel.length === 1 ? sel[0] : null;
      if (!u || !this.sheetOpen) {
        this.sheetEl.hidden = true;
        this.sheetSig = "";
        return;
      }
      const s = u.sheet;
      const r = s.record;
      const sig = `${u.id}:${r.kills}:${r.flanks}:${r.rears}:${r.brokeEnemies}:${r.broke}:${u.alive}`;
      if (sig === this.sheetSig) return;
      this.sheetSig = sig;
      this.sheetEl.hidden = false;
      this.sheetEl.style.setProperty("--rare", s.rarity.tint);

      const notes = A.matchupNotes(u.type);
      const traits = s.traits.length
        ? s.traits.map((t) => `<div class="trait"><b>${t.label}</b><span>${t.note}</span></div>`).join("")
        : '<div class="none">No traits. Common formations fight on their stat line alone.</div>';
      this.sheetEl.innerHTML =
        `<div class="head"><span class="sigil">${A.sigil(u.type)}</span>` +
        `<div><div class="who"></div><div class="kind"><span class="rarity"></span> · <span class="tl"></span>` +
        `${s.record.broke ? ' · <span class="scar">broke once</span>' : ""}</div></div></div>` +
        `<div class="traits">${traits}</div>` +
        '<div class="record">' +
        `<div><span>killed</span><b>${s.record.kills}</b></div>` +
        `<div><span>strength</span><b>${s.alive}/${s.initial}</b></div>` +
        `<div><span>flanks</span><b>${s.record.flanks}</b></div>` +
        `<div><span>rear hits</span><b>${s.record.rears}</b></div>` +
        `<div><span>broke</span><b>${s.record.brokeEnemies}</b></div>` +
        `<div><span>own nerve</span><b>${u.def.fearless ? "—" : `${Math.round(u.morale)}%`}</b></div>` +
        "</div>" +
        '<div class="vs">beats <b></b> · loses to <s></s></div>';
      this.sheetEl.querySelector(".who").textContent = s.name;
      this.sheetEl.querySelector(".rarity").textContent = s.rarity.label;
      this.sheetEl.querySelector(".tl").textContent = s.typeLabel;
      this.sheetEl.querySelector(".vs b").textContent = notes.beats;
      this.sheetEl.querySelector(".vs s").textContent = notes.losesTo;
    }

    /** A cheap tactical overview: where both lines are, and where the camera is looking. */
    drawMinimap() {
      const ctx = this.mctx;
      if (!ctx) return;
      const g = this.game;
      const W = this.minimap.width;
      const H = this.minimap.height;
      const t = g.terrain;
      const sx = W / (t.width + 40);
      const sz = H / (t.depth + 40);
      const toX = (x) => W / 2 + x * sx;
      // North is up: side 1 deploys at +z and should sit at the top of the map.
      const toY = (z) => H / 2 - z * sz;

      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = "#0a2028";
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = "rgba(95,212,228,0.24)";
      ctx.lineWidth = 2;
      ctx.strokeRect(toX(-t.width / 2), toY(t.depth / 2), t.width * sx, t.depth * sz);
      ctx.fillStyle = "rgba(95,212,228,0.10)";
      ctx.fillRect(toX(-t.width / 2), toY(9), t.width * sx, 18 * sz); // the pass

      for (const u of g.units) {
        if (u.state === "gone") continue;
        const s = Math.max(3, u.halfWidth * sx * 1.6);
        ctx.fillStyle = u.state === "routing" ? "#8a5a4a" : u.side === 0 ? "#e2694f" : "#5f96d8";
        ctx.fillRect(toX(u.pos.x) - s / 2, toY(u.pos.z) - s / 4, s, Math.max(3, s / 2));
        if (u.selected) {
          ctx.strokeStyle = "#7fe3f0";
          ctx.lineWidth = 2;
          ctx.strokeRect(toX(u.pos.x) - s / 2 - 2, toY(u.pos.z) - s / 4 - 2, s + 4, Math.max(3, s / 2) + 4);
        }
      }

      const cam = g.controls;
      if (cam) {
        ctx.strokeStyle = "rgba(220,245,250,0.55)";
        ctx.lineWidth = 2;
        const r = cam.dist * 0.42;
        ctx.strokeRect(toX(cam.target.x - r), toY(cam.target.z + r * 0.7), r * 2 * sx, r * 1.4 * sz);
      }
    }
  };
})((window.Anchor = window.Anchor || {}));
