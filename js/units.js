/**
 * Units are formations, not swimmers. Every order, every casualty and every morale check happens at
 * the level of the block; the forty bodies inside it are chasing slots in a grid and are only ever
 * there to make the block legible. One InstancedMesh per unit draws all of them.
 *
 * A formation is also a collectible: it carries a name, a type, a rarity tier and a couple of
 * traits, and it keeps a record of what it did in this battle. That is a framing device with real
 * teeth — rarity buys traits, and traits change the numbers — but it is only a framing device. There
 * are no wallets, no tokens and no network here, and there is not going to be.
 */
((A) => {
  /**
   * Six roles. The first three are one clean triangle — swords beat spears in a brawl, spears beat
   * horse, horse rides down swords — and the numbers are deliberately loud, because a
   * rock-paper-scissors you cannot feel is decoration.
   *
   * The other three exist to bend that triangle rather than extend it:
   *   knight  armoured rays. The charge is the best in the game and the brawl afterwards is the worst:
   *           `fatigue` is theirs alone, and it bleeds their attack down to under half if they are
   *           still locked in half a minute later. Everything else fights at full strength forever,
   *           which is how the original three were tuned and is deliberately left alone.
   *   ogre    six models, each hitting like a file. Almost nothing frightens them, and there
   *           are so few bodies that contact — which is what scales damage — is hard to get.
   *   zombie  numerous, feeble, and `fearless`: they never rout. Flanking still doubles the damage
   *           and does nothing at all to their nerve, so the whole trick of the game stops working
   *           and you have to kill every last one of them instead.
   */
  A.TYPES = {
    sword: {
      label: "Reef Guard",
      men: 40,
      cols: 10,
      fileGap: 1.05,
      rankGap: 1.2,
      speed: 3.6,
      turn: 1.5,
      attack: 1.0,
      defense: 1.0,
      charge: 1.8,
      chargeDur: 3.0,
      steadiness: 2,
      reach: 1.5,
      fatigue: 0,
      blurb: "The line. Shell and blade, good at everything, breaks if you leave its flank open.",
    },
    spear: {
      label: "Urchins",
      men: 40,
      cols: 10,
      fileGap: 1.12,
      rankGap: 1.32,
      speed: 3.1,
      turn: 1.1,
      attack: 0.85,
      defense: 1.22,
      charge: 1.3,
      chargeDur: 2.5,
      steadiness: 16,
      reach: 1.9,
      fatigue: 0,
      blurb: "A wall of spines. Anything that charges it head-on comes off the points.",
    },
    cavalry: {
      label: "Rays",
      men: 24,
      cols: 8,
      fileGap: 1.8,
      rankGap: 2.25,
      speed: 8.4,
      turn: 2.0,
      attack: 1.35,
      defense: 0.85,
      charge: 3.6,
      chargeDur: 3.5,
      steadiness: 6,
      reach: 1.7,
      fatigue: 0,
      mounted: true,
      blurb: "Fast enough to get behind anything. Use them on backs, never on spines.",
    },
    knight: {
      label: "Nautili",
      men: 16,
      cols: 8,
      fileGap: 2.05,
      rankGap: 2.45,
      speed: 7.2,
      turn: 1.5,
      attack: 1.75,
      defense: 1.7,
      charge: 5.2,
      chargeDur: 3.0,
      steadiness: 14,
      reach: 1.8,
      fatigue: 0.2,
      fatigueMax: 1.25,
      mounted: true,
      blurb: "Shell-armoured rays. The charge shatters a line; half a minute later they are ordinary.",
    },
    ogre: {
      label: "Leviathans",
      men: 6,
      cols: 3,
      fileGap: 3.4,
      rankGap: 3.4,
      speed: 3.3,
      turn: 0.9,
      attack: 8.2,
      defense: 1.4,
      charge: 2.4,
      chargeDur: 3.0,
      steadiness: 10,
      reach: 2.6,
      fatigue: 0,
      scale: 2.1,
      blurb: "Six of them, each worth a file. Too few bodies to hold a frontage — they punch a hole.",
    },
    zombie: {
      label: "Drowned",
      men: 50,
      cols: 10,
      fileGap: 1.1,
      rankGap: 1.25,
      speed: 2.7,
      turn: 0.7,
      attack: 0.95,
      defense: 0.55,
      charge: 1.0,
      chargeDur: 0.1,
      steadiness: 0,
      reach: 1.4,
      fatigue: 0,
      fearless: true,
      scale: 0.95,
      blurb: "They do not rout. Flanking them is worth damage and nothing else — kill every one.",
    },
  };

  A.TYPE_ORDER = ["sword", "spear", "cavalry", "knight", "ogre", "zombie"];

  A.MATCHUP = {
    sword: { sword: 1.0, spear: 1.35, cavalry: 0.85, knight: 0.7, ogre: 0.75, zombie: 1.6 },
    spear: { sword: 0.8, spear: 1.0, cavalry: 2.1, knight: 2.3, ogre: 1.25, zombie: 1.1 },
    cavalry: { sword: 1.3, spear: 0.55, cavalry: 1.0, knight: 0.8, ogre: 0.7, zombie: 1.3 },
    knight: { sword: 1.45, spear: 0.5, cavalry: 1.25, knight: 1.0, ogre: 0.85, zombie: 1.7 },
    ogre: { sword: 1.5, spear: 0.9, cavalry: 1.2, knight: 1.15, ogre: 1.0, zombie: 1.6 },
    zombie: { sword: 1.0, spear: 0.85, cavalry: 1.15, knight: 0.95, ogre: 0.6, zombie: 1.0 },
  };

  /**
   * The two names a card shows under a unit: what it eats, and what eats it.
   *
   * Read as an exchange rate rather than as a raw multiplier — how hard I hit you over how hard you
   * hit me. A one-sided reading picks the wrong answer: swords have their biggest number against the
   * undead, but the undead barely hit back at all, and the fight a sword player actually wants is
   * the one against spears. The ratio recovers the triangle the game is built on.
   */
  A.matchupNotes = (type) => {
    const trade = (t) => A.MATCHUP[type][t] / A.MATCHUP[t][type];
    const others = A.TYPE_ORDER.filter((t) => t !== type);
    const best = others.reduce((a, b) => (trade(b) > trade(a) ? b : a));
    const worst = others.reduce((a, b) => (trade(b) < trade(a) ? b : a));
    return { beats: A.TYPES[best].label, beatsType: best, losesTo: A.TYPES[worst].label, losesToType: worst };
  };

  /**
   * Rarity and traits — the collectible layer.
   *
   * The rule that keeps this honest is that rarity has to buy something real. It does: a tier grants
   * traits, and a trait is a live modifier on the same numbers everything else uses. Nothing here is
   * cosmetic and nothing here is onchain — it is the *shape* of a collection (a roster, a tier, a
   * trait sheet, a record of what this formation did) borrowed for a game, and that is the whole of
   * it. There is no wallet, no mint and no network call anywhere in this repo.
   *
   * Common is the default, has no traits and no scalar, so the hand-placed scenario is numerically
   * identical to the one that shipped before any of this existed.
   */
  A.RARITY = [
    { key: "common", label: "Common", traits: 0, scale: 1.0, tint: "#93a8ad" },
    { key: "uncommon", label: "Uncommon", traits: 1, scale: 1.04, tint: "#7fc9a8" },
    { key: "rare", label: "Rare", traits: 2, scale: 1.08, tint: "#5fd4e4" },
    { key: "epic", label: "Epic", traits: 3, scale: 1.12, tint: "#b58ce8" },
    { key: "legendary", label: "Legendary", traits: 3, scale: 1.18, tint: "#ff8a6b" },
  ];
  A.rarityOf = (key) => A.RARITY.find((r) => r.key === key) || A.RARITY[0];

  /** Every trait is one line and one number. If you cannot say what it does, it does not go in. */
  A.TRAITS = {
    braced: { label: "Braced", note: "+18% defence", apply: (d) => (d.defense *= 1.18) },
    ravenous: { label: "Ravenous", note: "+16% attack", apply: (d) => (d.attack *= 1.16) },
    swift: { label: "Swift", note: "+14% speed", apply: (d) => (d.speed *= 1.14) },
    stoic: { label: "Stoic", note: "+9 steadiness", apply: (d) => (d.steadiness += 9) },
    longreach: { label: "Long-Spined", note: "+0.4m reach", apply: (d) => (d.reach += 0.4) },
    relentless: { label: "Relentless", note: "charge lasts 60% longer", apply: (d) => (d.chargeDur *= 1.6) },
    tireless: { label: "Tireless", note: "never tires", apply: (d) => (d.fatigueMax = 0) },
    deepdweller: {
      label: "Deep-Dweller",
      note: "ignores depth advantage",
      apply: (d) => (d.ignoreGround = true),
    },
  };
  A.TRAIT_ORDER = Object.keys(A.TRAITS);

  /**
   * Traits are rolled, not chosen, and they are rolled from the unit's own id and rarity so the same
   * formation in the same battle always has the same sheet. A collectible whose traits shuffle every
   * time you look at it is not a collectible.
   */
  A.rollTraits = (type, rarity, salt) => {
    const tier = A.rarityOf(rarity);
    if (!tier.traits) return [];
    const rng = A.makeRng((salt * 2654435761 + A.TYPE_ORDER.indexOf(type) * 40503 + 7) >>> 0);
    const pool = A.TRAIT_ORDER.filter((t) => !(t === "tireless" && !A.TYPES[type].fatigueMax));
    const picked = [];
    while (picked.length < Math.min(tier.traits, pool.length)) {
      const t = pool[rng.int(pool.length)];
      if (!picked.includes(t)) picked.push(t);
    }
    return picked;
  };

  /**
   * A formation of `men` of this type, kept at roughly the depth-to-frontage ratio the type was
   * drawn at. The builder lets you set the size of a formation, and a block of ninety men has to
   * still look like that type rather than like a stripe.
   */
  A.formationShape = (type, men) => {
    const base = A.TYPES[type];
    const n = Math.max(1, Math.round(men));
    const ratio = Math.round(base.men / base.cols) / base.cols; // rows per column, as drawn
    const rows = Math.max(1, Math.round(Math.sqrt(n * ratio)));
    const cols = Math.max(1, Math.ceil(n / rows));
    return {
      men: n,
      rows,
      cols,
      halfWidth: (cols * base.fileGap) / 2,
      halfDepth: (rows * base.rankGap) / 2,
    };
  };

  // Scratch objects, built on first use: these files are classic scripts and run before the inline
  // module has had a chance to publish THREE.
  let _m, _q, _p, _s, _e;
  function scratch() {
    if (_m) return;
    _m = new THREE.Matrix4();
    _q = new THREE.Quaternion();
    _p = new THREE.Vector3();
    _s = new THREE.Vector3();
    _e = new THREE.Euler(0, 0, 0, "YXZ");
  }

  let nextId = 1;

  A.Unit = class Unit {
    constructor(game, spec) {
      scratch();
      // Each formation gets its own copy of the type: the army builder can set how many men are in
      // it, and that changes the grid the block is drawn on.
      const shape = A.formationShape(spec.type, spec.men || A.TYPES[spec.type].men);
      const def = { ...A.TYPES[spec.type], ...shape };
      this.rarity = spec.rarity || "common";
      const tier = A.rarityOf(this.rarity);
      this.traits = A.rollTraits(spec.type, this.rarity, spec.salt ?? nextId);
      // Rarity is a small across-the-board scalar; the traits are where it is actually felt.
      def.attack *= tier.scale;
      def.defense *= tier.scale;
      for (const t of this.traits) A.TRAITS[t].apply(def);
      this.game = game;
      this.id = nextId++;
      this.side = spec.side;
      this.type = spec.type;
      this.name = spec.name;
      this.def = def;
      this.livery = spec.livery;

      this.initial = def.men;
      this.alive = def.men;
      this.morale = 100;
      this.state = "idle";
      this.killAccum = 0;
      this.lossTimes = [];
      this.chargeTimer = 0;
      this.routTimer = 0;
      this.selected = false;
      // Time in contact bleeds a unit's attack away. Knights lose it fastest — that is the whole
      // difference between a knight and a horseman once the charge is spent.
      this.fatigue = 0;
      // What this formation did today. A collectible with no provenance is a sticker.
      this.record = { kills: 0, flanks: 0, rears: 0, broke: false, brokeEnemies: 0 };

      // Per-frame combat readings, refilled by combat.js.
      this.hitCalls = []; // flank/rear announcements the HUD has not shown yet
      this.contactsOn = 0; // my men touching an enemy
      this.contactsAgainst = 0; // enemy men touching me
      this.frontShare = 1; // fraction of incoming contact landing on my front arc
      this.worstFlank = 0; // 0 front, 1.2 flank, 2.5 rear — the largest coming at me
      this.attackers = new Set();
      this.threatX = 0;
      this.threatZ = 0;

      this.pos = { x: spec.x, z: spec.z };
      this.facing = spec.facing;
      this.speedNow = 0;
      this.order = { x: spec.x, z: spec.z, facing: spec.facing, hasFacing: true };

      this.rows = Math.ceil(def.men / def.cols);
      this.halfWidth = (def.cols * def.fileGap) / 2;
      this.halfDepth = (this.rows * def.rankGap) / 2;
      this.radius = Math.hypot(this.halfWidth, this.halfDepth);

      this.buildSoldiers(game.rng);
      this.buildMeshes(game);
      // Draw the block where it stands before the first tick. An InstancedMesh starts with identity
      // matrices — forty bodies stacked at the world origin, under the seabed — and normally the
      // first step() fixes that within a frame so nobody sees it. Start a battle while the game is
      // paused, which the muster sheet and the QA harness both do, and the whole army is invisible
      // until you unpause.
      this.updateMeshes(0);
    }

    buildSoldiers(rng) {
      const d = this.def;
      this.soldiers = [];
      for (let i = 0; i < d.men; i++) {
        const c = i % d.cols;
        const r = Math.floor(i / d.cols);
        const ox = (c - (d.cols - 1) / 2) * d.fileGap;
        const oz = ((this.rows - 1) / 2 - r) * d.rankGap;
        const x = this.pos.x + ox * Math.cos(this.facing) + oz * Math.sin(this.facing);
        const z = this.pos.z - ox * Math.sin(this.facing) + oz * Math.cos(this.facing);
        this.soldiers.push({
          ox,
          oz,
          rank: r,
          x,
          z,
          y: 0,
          ground: this.game.terrain.heightAt(x, z),
          alive: true,
          phase: rng.range(0, Math.PI * 2),
          // A little permanent slop per man so ranks are never machine-straight.
          wx: rng.gauss() * 0.14,
          wz: rng.gauss() * 0.14,
          scale: rng.range(0.93, 1.07) * (d.scale || 1),
          pushX: 0,
          pushZ: 0,
          face: this.facing,
          faceWant: this.facing,
          fighting: false,
        });
      }
    }

    buildMeshes(game) {
      const geo = A.soldierGeometry(this.type, this.livery, this.tunicColor(), this.coatColor());
      this.mesh = new THREE.InstancedMesh(geo, game.soldierMaterial, this.initial);
      this.mesh.frustumCulled = false;
      this.mesh.userData.unit = this;
      game.scene.add(this.mesh);

      this.banner = new THREE.Mesh(A.bannerGeometry(this.livery), game.soldierMaterial);
      this.banner.frustumCulled = false;
      game.scene.add(this.banner);

      // Ground shade: the single cheapest thing that makes a grid of men read as one block.
      const shadeSize = Math.max(this.halfWidth, this.halfDepth) * 2.9;
      this.shade = new THREE.Mesh(
        new THREE.PlaneGeometry(shadeSize, shadeSize),
        new THREE.MeshBasicMaterial({
          map: game.blob,
          color: 0x03181e,
          transparent: true,
          opacity: 0.42,
          depthWrite: false,
        }),
      );
      this.shade.rotation.x = -Math.PI / 2;
      this.shade.renderOrder = 1;
      game.scene.add(this.shade);

      this.outline = this.buildOutline(game);
      game.scene.add(this.outline);
    }

    /** A rectangle of four thin slabs, drawn on top of everything so hills never hide it. */
    buildOutline(_game) {
      const g = new THREE.Group();
      const w = this.halfWidth + 0.9;
      const d = this.halfDepth + 0.9;
      const mat = new THREE.MeshBasicMaterial({
        color: 0x7fe3f0,
        depthTest: false,
        transparent: true,
        opacity: 0.95,
      });
      const bar = (sx, sz, x, z) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(sx, 0.06, sz), mat);
        m.position.set(x, 0, z);
        m.renderOrder = 20;
        return m;
      };
      g.add(bar(w * 2, 0.26, 0, d), bar(w * 2, 0.26, 0, -d));
      g.add(bar(0.26, d * 2, w, 0), bar(0.26, d * 2, -w, 0));
      g.visible = false;
      return g;
    }

    /**
     * Deliberately duller than the livery: the shell carries the shoal's colour, the carapace the
     * individual. Both sides are pushed warmer and lighter than they look on paper, because blue
     * light and blue fog take a lot out of everything down here.
     */
    tunicColor() {
      if (this.type === "zombie") return this.side === 0 ? 0x8b9478 : 0x6f8480;
      if (this.type === "ogre") return this.side === 0 ? 0xa96f47 : 0x5f7a6a;
      if (this.type === "knight") return this.side === 0 ? 0xc2b4ae : 0xa8bcc2;
      if (this.side === 0) return this.type === "spear" ? 0xb45c3c : 0xd4744f;
      return this.type === "spear" ? 0x3d8296 : 0x39918f;
    }
    coatColor() {
      return this.side === 0 ? 0x8a5340 : 0x2f606e;
    }

    // ── orders ─────────────────────────────────────────────────────────────
    orderMove(x, z, facing) {
      if (this.state === "routing" || this.state === "gone") return;
      this.order.x = this.game.terrain.clampX(x);
      this.order.z = this.game.terrain.clampZ(z);
      this.order.hasFacing = facing !== undefined && facing !== null;
      this.order.facing = this.order.hasFacing ? facing : this.facing;
    }

    holdHere() {
      this.orderMove(this.pos.x, this.pos.z, this.facing);
    }

    // ── per-frame ──────────────────────────────────────────────────────────
    update(dt, now) {
      if (this.state === "gone") return;
      if (this.state === "routing") this.updateRout(dt, now);
      else this.updateOrdered(dt);

      this.chargeTimer = Math.max(0, this.chargeTimer - dt);
      const engaged = this.contactsOn > 0 || this.contactsAgainst > 0;
      const ceiling = this.def.fatigueMax || 0;
      this.fatigue = A.clamp(this.fatigue + (engaged ? this.def.fatigue : -0.09) * dt, 0, ceiling);
      this.updateSoldiers(dt, now);
      this.updateMeshes(now);
    }

    updateOrdered(dt) {
      const engaged = this.contactsOn > 0 || this.contactsAgainst > 0;
      const dx = this.order.x - this.pos.x;
      const dz = this.order.z - this.pos.z;
      const dist = Math.hypot(dx, dz);

      let desired = this.facing;
      if (engaged) {
        // A formation in contact wheels to face what is hitting it — but slowly, and only if its
        // front is not already busy. That four-second window is what makes a flank worth doing,
        // and why pinning the enemy first is the whole trick.
        if (this.frontShare < 0.35 && this.contactsAgainst > 0) {
          const tx = this.threatX - this.pos.x;
          const tz = this.threatZ - this.pos.z;
          if (Math.hypot(tx, tz) > 0.5) desired = Math.atan2(tx, tz);
          const turn = 0.3 * dt;
          this.facing += A.clamp(A.angleDelta(this.facing, desired), -turn, turn);
        }
        this.speedNow = 0;
        this.state = "fighting";
        return;
      }

      if (dist > 0.6) {
        desired = Math.atan2(dx, dz);
      } else if (this.order.hasFacing) {
        desired = this.order.facing;
      }
      const turn = this.def.turn * dt;
      this.facing += A.clamp(A.angleDelta(this.facing, desired), -turn, turn);

      if (dist > 0.6) {
        // Blocks pivot before they march; wheeling at full speed would look like a flock, not a line.
        const align = Math.max(0.22, Math.cos(A.angleDelta(this.facing, Math.atan2(dx, dz))));
        const step = Math.min(dist, this.def.speed * align * dt);
        this.pos.x += (dx / dist) * step;
        this.pos.z += (dz / dist) * step;
        this.speedNow = step / dt;
        this.state = "moving";
      } else {
        this.speedNow = 0;
        this.state = "idle";
      }
    }

    updateRout(dt, _now) {
      this.routTimer += dt;
      const t = this.game.terrain;
      const homeZ = this.side === 0 ? -t.depth / 2 - 45 : t.depth / 2 + 45;
      const dx = this.pos.x * 0.35 - this.pos.x;
      const dz = homeZ - this.pos.z;
      const dist = Math.hypot(dx, dz) || 1;
      const speed = this.def.speed * 1.35;
      this.pos.x += (dx / dist) * speed * dt;
      this.pos.z += (dz / dist) * speed * dt;
      this.speedNow = speed;
      const desired = Math.atan2(dx, dz);
      const turn = this.def.turn * 1.8 * dt;
      this.facing += A.clamp(A.angleDelta(this.facing, desired), -turn, turn);
      if (Math.abs(this.pos.z) > t.depth / 2 + 34 || this.routTimer > 40) this.vanish();
    }

    updateSoldiers(dt, now) {
      const cf = Math.cos(this.facing);
      const sf = Math.sin(this.facing);
      const routing = this.state === "routing";
      // Routers stop being a formation: the shoal scatters, and that is the visual tell.
      const spread = routing ? 2.4 : 1;
      const chase = this.def.speed * (routing ? 2.0 : 1.75);
      const terrain = this.game.terrain;

      for (const s of this.soldiers) {
        if (!s.alive) continue;
        const ox = s.ox * spread;
        const oz = s.oz * spread;
        let tx = this.pos.x + ox * cf + oz * sf + s.wx + s.pushX;
        let tz = this.pos.z - ox * sf + oz * cf + s.wz + s.pushZ;
        if (routing) {
          tx += Math.sin(now * 1.7 + s.phase) * 1.4;
          tz += Math.cos(now * 1.3 + s.phase * 1.7) * 1.4;
        }
        const dx = tx - s.x;
        const dz = tz - s.z;
        const d = Math.hypot(dx, dz);
        if (d > 0.01) {
          const step = Math.min(d, chase * dt);
          s.x += (dx / d) * step;
          s.z += (dz / d) * step;
          s.moving = d > 0.25;
        } else {
          s.moving = false;
        }
        s.ground = terrain.heightAt(s.x, s.z);

        const want = s.fighting ? s.faceWant : this.facing;
        const turn = 6 * dt;
        s.face += A.clamp(A.angleDelta(s.face, want), -turn, turn);
      }
    }

    /**
     * Nothing here marches. Everything hangs a little off the bed and undulates whether it is moving
     * or not, and rolls slightly as it turns — the difference between a column of infantry and a
     * shoal is almost entirely in that idle motion, and it is free.
     */
    updateMeshes(now) {
      const mesh = this.mesh;
      const glider = !!this.def.mounted;
      const swimRate = glider ? 2.6 : 1.7;
      const swimAmp = glider ? 0.2 : 0.11;
      const hover = glider ? 0.5 : 0.18;
      for (let i = 0; i < this.soldiers.length; i++) {
        const s = this.soldiers[i];
        if (!s.alive) {
          _p.set(0, -900, 0);
          _s.set(0.0001, 0.0001, 0.0001);
          _q.identity();
          mesh.setMatrixAt(i, _m.compose(_p, _q, _s));
          continue;
        }
        let y = s.ground + hover;
        let lean = 0;
        y += Math.sin(now * swimRate + s.phase) * swimAmp;
        let roll = Math.sin(now * swimRate * 0.8 + s.phase) * 0.07;
        let pitch = 0;
        if (s.moving) {
          y += Math.sin(now * swimRate * 2.1 + s.phase) * swimAmp * 0.5;
          roll += Math.sin(now * swimRate * 1.6 + s.phase) * 0.09;
          pitch = -0.09;
        }
        if (s.fighting) {
          // A short lunge in and out: at this zoom that shimmer is what "melee" looks like.
          lean = Math.sin(now * 5.5 + s.phase) * 0.16;
          y += Math.abs(Math.sin(now * 5.5 + s.phase)) * 0.03;
          roll += Math.sin(now * 4.1 + s.phase) * 0.06;
        }
        _p.set(s.x + Math.sin(s.face) * lean, y, s.z + Math.cos(s.face) * lean);
        _q.setFromEuler(_e.set(pitch, s.face, roll, "YXZ"));
        _s.set(s.scale, s.scale, s.scale);
        mesh.setMatrixAt(i, _m.compose(_p, _q, _s));
      }
      mesh.instanceMatrix.needsUpdate = true;

      const gy = this.game.terrain.heightAt(this.pos.x, this.pos.z);
      this.banner.position.set(this.pos.x, gy + Math.sin(now * 1.1 + this.id) * 0.2, this.pos.z);
      this.banner.rotation.y = this.facing + Math.sin(now * 1.4 + this.id) * 0.09;
      this.banner.rotation.z = Math.sin(now * 0.9 + this.id) * 0.035 + (this.state === "routing" ? 0.5 : 0);

      this.shade.position.set(this.pos.x, gy + 0.06, this.pos.z);
      this.shade.material.opacity = this.state === "routing" ? 0.16 : 0.42;

      this.outline.visible = this.selected && this.state !== "gone";
      if (this.outline.visible) {
        this.outline.position.set(this.pos.x, gy + 0.5, this.pos.z);
        this.outline.rotation.y = this.facing;
      }
    }

    // ── casualties and morale ──────────────────────────────────────────────
    /** Kill the man nearest whoever is doing the killing, so the line thins where it is pressed. */
    killNearest(fromX, fromZ, now) {
      let best = null;
      let bestD = Infinity;
      for (const s of this.soldiers) {
        if (!s.alive) continue;
        const d = (s.x - fromX) ** 2 + (s.z - fromZ) ** 2;
        if (d < bestD) {
          bestD = d;
          best = s;
        }
      }
      if (!best) return;
      best.alive = false;
      this.alive--;
      this.lossTimes.push(now);
      this.game.addCorpse(this.side, best.x, best.z, best.face);
      if (this.alive <= 0) this.vanish();
    }

    recentLosses(now) {
      while (this.lossTimes.length && now - this.lossTimes[0] > 3) this.lossTimes.shift();
      return this.lossTimes.length;
    }

    vanish() {
      this.state = "gone";
      this.mesh.visible = false;
      this.banner.visible = false;
      this.shade.visible = false;
      this.outline.visible = false;
      this.selected = false;
    }

    get lossFraction() {
      return 1 - this.alive / this.initial;
    }
    get isActive() {
      return this.state !== "gone" && this.state !== "routing";
    }
    /** Attack falls off the longer a unit stays locked in. */
    get vigour() {
      return 1 / (1 + this.fatigue);
    }

    /** Positive when this unit is giving more than it is getting. */
    get edge() {
      const on = this.contactsOn;
      const against = this.contactsAgainst;
      if (!on && !against) return 0;
      return (on - against) / Math.max(1, on + against);
    }

    /** The trait sheet, ready to render. */
    get sheet() {
      return {
        name: this.name,
        type: this.type,
        typeLabel: A.TYPES[this.type].label,
        rarity: A.rarityOf(this.rarity),
        traits: this.traits.map((t) => A.TRAITS[t]),
        record: this.record,
        alive: this.alive,
        initial: this.initial,
      };
    }

    get displayState() {
      if (this.state === "routing") return "routing";
      if (this.state === "fighting") return "in melee";
      if (this.state === "moving") return "advancing";
      return "holding";
    }
  };
})((window.Anchor = window.Anchor || {}));
