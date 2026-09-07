/**
 * Battle for the Ford — one engagement, two armies, no campaign map.
 *
 * The scenario is stacked on purpose: Rome fields fewer men in the line but twice the cavalry, so
 * winning means pinning the Gallic warbands with the hastati and then taking them in the back with
 * the equites. Fight it as a shoving match and you lose on numbers.
 *
 * URL parameters, mostly for taking honest screenshots of a battle in progress:
 *   ?seed=123   pick the battlefield and the dice
 *   ?t=45       fast-forward the simulation this many seconds before the first frame
 *   ?auto=1     let the AI command Rome as well, so the battle plays itself
 *   ?preset=horde   start on one of the army-builder presets instead of the classic scenario
 */
((A) => {
  const ROSTER = [
    // Rome deploys the classic three lines squeezed into one: hastati across the front, the
    // triarii held back as a reserve, and the horse out on both wings where it belongs.
    { side: 0, type: "sword", name: "Hastati I", x: -13, z: -34 },
    { side: 0, type: "sword", name: "Hastati II", x: 0, z: -34 },
    { side: 0, type: "sword", name: "Principes", x: 13, z: -34 },
    { side: 0, type: "spear", name: "Triarii", x: 0, z: -48 },
    { side: 0, type: "cavalry", name: "Equites I", x: -32, z: -29 },
    { side: 0, type: "cavalry", name: "Equites II", x: 32, z: -29 },

    // The Gauls have a wider line and more of it, which is the problem the player has to solve.
    { side: 1, type: "sword", name: "Warband I", x: -19, z: 34 },
    { side: 1, type: "sword", name: "Warband II", x: -6, z: 34 },
    { side: 1, type: "sword", name: "Warband III", x: 7, z: 34 },
    { side: 1, type: "sword", name: "Warband IV", x: 20, z: 34 },
    { side: 1, type: "spear", name: "Gaesatae", x: 0, z: 47 },
    { side: 1, type: "cavalry", name: "Gallic Horse", x: -40, z: 29 },
  ];

  const LIVERY = [0xc0392b, 0x3a6ea5];

  /** What a formation of each type is called, per side. Numerals get appended when there is more. */
  const NAMES = [
    {
      sword: "Hastati",
      spear: "Triarii",
      cavalry: "Equites",
      knight: "Cataphracts",
      ogre: "Colossi",
      zombie: "The Unquiet",
    },
    {
      sword: "Warband",
      spear: "Gaesatae",
      cavalry: "Gallic Horse",
      knight: "Iron Riders",
      ogre: "Ogres",
      zombie: "The Risen",
    },
  ];
  const NUMERALS = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];

  /**
   * Turn `[{type, formations, men}]` per side into a deployment. Foot forms the line, horse goes on
   * the wings where it can get round the end of it — which is the only place horse is ever worth
   * anything in this game. A line too wide for the field folds into a second rank.
   */
  function deploy(sides) {
    const specs = [];
    for (const side of [0, 1]) {
      const rows = sides[side] || [];
      const blocks = [];
      for (const r of rows) {
        const n = A.clamp(Math.round(r.formations || 1), 1, 12);
        for (let i = 0; i < n; i++) {
          blocks.push({ type: r.type, men: A.clamp(Math.round(r.men || A.TYPES[r.type].men), 1, 200) });
        }
      }
      if (!blocks.length) blocks.push({ type: "sword", men: 40 });

      const tally = {};
      for (const b of blocks) tally[b.type] = (tally[b.type] || 0) + 1;
      const seen = {};
      for (const b of blocks) {
        seen[b.type] = (seen[b.type] || 0) + 1;
        const base = NAMES[side][b.type];
        b.name = tally[b.type] > 1 ? `${base} ${NUMERALS[seen[b.type] - 1]}` : base;
        b.size = A.formationShape(b.type, b.men);
      }

      const dir = side === 0 ? -1 : 1; // which way "back" is for this side
      const lineZ = 34 * dir;
      const foot = blocks.filter((b) => !A.TYPES[b.type].mounted);
      const horse = blocks.filter((b) => A.TYPES[b.type].mounted);

      // Foot: one line, folded into ranks when it will not fit across the field.
      const GAP = 4;
      const MAX_W = 196;
      const ranks = [[]];
      let w = 0;
      for (const b of foot) {
        const bw = b.size.halfWidth * 2 + GAP;
        if (w + bw > MAX_W && ranks[ranks.length - 1].length) {
          ranks.push([]);
          w = 0;
        }
        ranks[ranks.length - 1].push(b);
        w += bw;
      }
      let widest = 0;
      ranks.forEach((rank, ri) => {
        const total = rank.reduce((n, b) => n + b.size.halfWidth * 2, 0) + GAP * (rank.length - 1);
        widest = Math.max(widest, total);
        let cursor = -total / 2;
        for (const b of rank) {
          cursor += b.size.halfWidth;
          b.x = cursor;
          b.z = lineZ + ri * 15 * dir;
          cursor += b.size.halfWidth + GAP;
        }
      });

      // Horse: alternate wings, just behind the end of the line.
      horse.forEach((b, i) => {
        const wing = i % 2 === 0 ? -1 : 1;
        const rank = Math.floor(i / 2);
        b.x = wing * (widest / 2 + 12 + rank * (b.size.halfWidth * 2 + 6));
        b.z = lineZ + 6 * dir;
      });

      for (const b of blocks) {
        specs.push({
          side,
          type: b.type,
          name: b.name,
          men: b.men,
          x: A.clamp(b.x, -108, 108),
          z: b.z,
        });
      }
    }
    return specs;
  }

  /**
   * Three battles that are one click apart in the builder. Classic is the hand-placed scenario the
   * game shipped with; the other two exist to show what the new types do to the core rule.
   */
  A.PRESETS = {
    classic: {
      label: "Classic",
      names: ["Rome", "Gauls"],
      note: "Rome is outnumbered in the line and has twice the horse. Pin, then flank.",
      roster: ROSTER,
    },
    horde: {
      label: "Horde",
      names: ["The Legion", "The Risen"],
      note: "The dead do not rout. Flanking buys damage and nothing else — you have to kill them all.",
      sides: [
        [
          { type: "spear", formations: 2, men: 40 },
          { type: "sword", formations: 2, men: 36 },
          { type: "knight", formations: 1, men: 16 },
        ],
        [{ type: "zombie", formations: 4, men: 42 }],
      ],
    },
    monsters: {
      label: "Monsters",
      names: ["The Warband", "The Deep Wood"],
      note: "Six ogres hit like sixty men and cannot hold a frontage. Everything here punches holes.",
      sides: [
        [
          { type: "ogre", formations: 2, men: 6 },
          { type: "sword", formations: 2, men: 40 },
          { type: "knight", formations: 1, men: 16 },
        ],
        [
          { type: "ogre", formations: 2, men: 6 },
          { type: "spear", formations: 2, men: 36 },
          { type: "sword", formations: 1, men: 36 },
        ],
      ],
    },
  };

  /** Normalise anything the builder or a URL hands us into the one shape `build()` understands. */
  A.resolveConfig = (cfg) => {
    const preset = typeof cfg === "string" ? A.PRESETS[cfg] : null;
    const c = preset || cfg || A.PRESETS.classic;
    return {
      names: c.names || ["Rome", "Gauls"],
      note: c.note || "",
      roster: c.roster || deploy(c.sides),
      sides: c.sides || null,
      label: c.label || "Custom",
    };
  };

  /** Distance from a formation's centre to its edge in a given world direction. */
  function rectRadius(u, dx, dz) {
    const cf = Math.cos(u.facing);
    const sf = Math.sin(u.facing);
    const lx = Math.abs(dx * cf - dz * sf) / u.halfWidth;
    const lz = Math.abs(dx * sf + dz * cf) / u.halfDepth;
    return 1 / Math.max(lx, lz, 1e-6);
  }

  A.fatal = (msg) => {
    const boot = document.getElementById("boot");
    if (!boot) return;
    boot.hidden = false;
    boot.className = "fatal";
    boot.textContent = `The battle would not start: ${msg}`;
  };

  A.Game = class Game {
    constructor() {
      const params = new URLSearchParams(location.search);
      this.params = params;
      this.autoPlay = params.get("auto") === "1";
      this.seed = Number(params.get("seed")) || 20260907;
      const preset = params.get("preset");
      this.config = A.resolveConfig(A.PRESETS[preset] ? preset : "classic");

      this.renderer = new THREE.WebGLRenderer({
        canvas: document.getElementById("stage"),
        antialias: true,
      });
      this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
      this.camera = new THREE.PerspectiveCamera(46, 1, 0.5, 900);
      this.blob = A.blobTexture();
      this.soldierMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });

      this.hud = new A.Hud(this);
      this.paused = false;
      this.time = 0;
      this.over = false;

      this.resize();
      addEventListener("resize", () => this.resize());

      this.build();
      this.controls = new A.Controls(this);

      const skip = Number(params.get("t")) || 0;
      if (skip > 0) this.fastForward(skip);

      this.last = performance.now();
      this.loop = this.loop.bind(this);
      requestAnimationFrame(this.loop);
    }

    // ── scene ──────────────────────────────────────────────────────────────
    build() {
      this.rng = A.makeRng(this.seed);
      this.scene = new THREE.Scene();
      this.scene.fog = new THREE.Fog(0xc9c9b6, 290, 760);

      this.scene.add(this.sky());
      // A low, raking sun: gentle hills only read as hills if something is shading their far side.
      const hemi = new THREE.HemisphereLight(0xbcd4e8, 0x4b5326, 1.05);
      this.scene.add(hemi);
      const sun = new THREE.DirectionalLight(0xffeecb, 2.6);
      sun.position.set(-120, 62, 48);
      this.scene.add(sun);

      this.terrain = new A.Terrain(this.rng);
      this.terrain.build(this.scene, this.rng);

      this.units = this.config.roster.map(
        (spec) =>
          new A.Unit(this, {
            side: spec.side,
            type: spec.type,
            name: spec.name,
            men: spec.men,
            livery: LIVERY[spec.side],
            x: spec.x,
            z: spec.z,
            facing: spec.side === 0 ? 0 : Math.PI,
          }),
      );

      this.startingMen = [0, 0];
      for (const u of this.units) this.startingMen[u.side] += u.initial;

      this.buildCorpses();
      this.buildPings();
      this.selected = [];
      this.over = false;
      this.time = 0;
      this.resultAt = 0;
      this.hud.armiesChanged(this.config.names);
      this.hud.log(
        `${this.config.names[0]} — ${this.startingMen[0]} men in ${this.units.filter((u) => u.side === 0).length} formations.`,
        "system",
      );
      this.hud.log(
        `${this.config.names[1]} — ${this.startingMen[1]} in ${this.units.filter((u) => u.side === 1).length}.`,
        "system",
      );
    }

    /** A gradient dome. Cheaper and calmer than a skybox, and it sets the whole colour key. */
    sky() {
      const g = new THREE.SphereGeometry(620, 20, 14);
      const pos = g.attributes.position;
      const col = new Float32Array(pos.count * 3);
      const low = new THREE.Color(0xdcd0b0);
      const high = new THREE.Color(0x5d86b3);
      const c = new THREE.Color();
      for (let i = 0; i < pos.count; i++) {
        c.copy(low).lerp(high, A.clamp(pos.getY(i) / 380 + 0.08, 0, 1));
        col[i * 3] = c.r;
        col[i * 3 + 1] = c.g;
        col[i * 3 + 2] = c.b;
      }
      g.setAttribute("color", new THREE.BufferAttribute(col, 3));
      const m = new THREE.Mesh(
        g,
        new THREE.MeshBasicMaterial({
          vertexColors: true,
          side: THREE.BackSide,
          fog: false,
          depthWrite: false,
        }),
      );
      m.renderOrder = -1;
      return m;
    }

    buildCorpses() {
      this.corpses = [0, 1].map((side) => {
        const mesh = new THREE.InstancedMesh(
          A.corpseGeometry(LIVERY[side]),
          this.soldierMaterial,
          this.startingMen[side],
        );
        mesh.count = 0;
        mesh.frustumCulled = false;
        this.scene.add(mesh);
        return mesh;
      });
      this._cm = new THREE.Matrix4();
      this._cq = new THREE.Quaternion();
      this._cp = new THREE.Vector3();
      this._cs = new THREE.Vector3(1, 1, 1);
      this._up = new THREE.Vector3(0, 1, 0);
    }

    /** The dead stay on the field. Where the line stood is written in bodies by the end. */
    addCorpse(side, x, z, face) {
      const mesh = this.corpses[side];
      if (mesh.count >= mesh.instanceMatrix.count) return;
      this._cp.set(x, this.terrain.heightAt(x, z) + 0.02, z);
      this._cq.setFromAxisAngle(this._up, face + this.rng.range(-0.7, 0.7));
      mesh.setMatrixAt(mesh.count, this._cm.compose(this._cp, this._cq, this._cs));
      mesh.count++;
      mesh.instanceMatrix.needsUpdate = true;
    }

    buildPings() {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xe0b566,
        transparent: true,
        opacity: 0,
        depthTest: false,
      });
      this.pings = [];
      for (let i = 0; i < 8; i++) {
        const m = new THREE.Mesh(new THREE.RingGeometry(0.72, 1, 24), mat.clone());
        m.rotation.x = -Math.PI / 2;
        m.renderOrder = 22;
        m.visible = false;
        this.scene.add(m);
        this.pings.push({ mesh: m, life: 0 });
      }
    }

    ping(x, z) {
      const p = this.pings.find((q) => q.life <= 0) || this.pings[0];
      p.life = 0.85;
      p.mesh.visible = true;
      p.mesh.position.set(x, this.terrain.heightAt(x, z) + 0.3, z);
    }

    updatePings(dt) {
      for (const p of this.pings) {
        if (p.life <= 0) continue;
        p.life -= dt;
        const k = Math.max(0, p.life) / 0.85;
        const s = A.lerp(4.2, 1.1, k);
        p.mesh.scale.set(s, s, s);
        p.mesh.material.opacity = k * 0.9;
        if (p.life <= 0) p.mesh.visible = false;
      }
    }

    // ── selection and orders ───────────────────────────────────────────────
    select(units) {
      const set = new Set(units.filter((u) => u && u.state !== "gone"));
      for (const u of this.units) u.selected = set.has(u);
      this.selected = [...set];
    }

    selectAll() {
      this.select(this.units.filter((u) => u.side === 0 && u.isActive));
    }

    /** Lay the selected units out as one line, in the order they already stand, and march them. */
    issueOrders(x, z, facing) {
      const sel = this.selected.filter((u) => u.state !== "gone" && u.state !== "routing");
      if (!sel.length) return;
      let f = facing;
      if (f === null || f === undefined) {
        const cx = sel.reduce((s, u) => s + u.pos.x, 0) / sel.length;
        const cz = sel.reduce((s, u) => s + u.pos.z, 0) / sel.length;
        f = Math.atan2(x - cx, z - cz);
      }
      const rx = Math.cos(f);
      const rz = -Math.sin(f);
      sel.sort((a, b) => a.pos.x * rx + a.pos.z * rz - (b.pos.x * rx + b.pos.z * rz));
      const gap = 2.8;
      const total = sel.reduce((s, u) => s + u.halfWidth * 2, 0) + gap * (sel.length - 1);
      let cursor = -total / 2;
      for (const u of sel) {
        cursor += u.halfWidth;
        u.orderMove(x + rx * cursor, z + rz * cursor, f);
        cursor += u.halfWidth + gap;
      }
      this.ping(x, z);
      if (A.coach) A.coach.onOrder(sel);
    }

    togglePause() {
      this.paused = !this.paused;
      this.hud.toast(this.paused ? "Paused" : "Resumed", this.time);
    }

    onRout(u) {
      this.hud.log(`${u.name} breaks and runs!`, u.side === 0 ? "bad" : "good");
      this.hud.shout(u.name, u.side === 0);
      if (A.coach) A.coach.onRout(u);
    }

    // ── simulation ─────────────────────────────────────────────────────────
    step(dt) {
      this.time += dt;
      if (!this.over) {
        A.AI.update(this, 1, this.time);
        if (this.autoPlay) A.AI.update(this, 0, this.time);
      }
      for (const u of this.units) u.update(dt, this.time);
      this.separate(dt);
      A.Combat.resolve(this, dt, this.time);
      this.selected = this.selected.filter((u) => u.state !== "gone");
      this.checkVictory();
    }

    /**
     * Formations are solid. Without this two blocks walk straight through each other and a battle
     * turns into one interpenetrating mob — which was exactly what the first playable build looked
     * like. Rectangles, not circles: a ten-wide line is nothing like a disc.
     */
    separate(dt) {
      const us = this.units.filter((u) => u.state !== "gone" && u.state !== "routing");
      const k = Math.min(1, 9 * dt) * 0.5;
      for (let i = 0; i < us.length; i++) {
        for (let j = i + 1; j < us.length; j++) {
          const a = us[i];
          const b = us[j];
          let dx = b.pos.x - a.pos.x;
          let dz = b.pos.z - a.pos.z;
          let d = Math.hypot(dx, dz);
          if (d < 0.01) {
            dx = 0.01;
            dz = 0;
            d = 0.01;
          }
          const nx = dx / d;
          const nz = dz / d;
          // Overlap is allowed to be slightly negative so front ranks still reach each other.
          const minD = rectRadius(a, nx, nz) + rectRadius(b, -nx, -nz) - 1.0;
          if (d >= minD) continue;
          const push = (minD - d) * (a.side === b.side ? 0.5 : 0.95) * k;
          a.pos.x -= nx * push;
          a.pos.z -= nz * push;
          b.pos.x += nx * push;
          b.pos.z += nz * push;
        }
      }
    }

    checkVictory() {
      if (this.over) return;
      const left = [0, 1].map((s) => this.units.filter((u) => u.side === s && u.isActive).length);
      if (left[0] > 0 && left[1] > 0) return;
      this.over = true;
      const won = left[0] > 0;
      const survivors = this.units.filter((u) => u.side === 0 && u.isActive).reduce((n, u) => n + u.alive, 0);
      const [mine, theirs] = this.config.names;
      this.hud.showResult(
        won,
        won
          ? `${theirs} are broken. ${survivors} of ${this.startingMen[0]} still stand in formation.`
          : `The line of ${mine} has given way. What is left of it is running for the trees.`,
      );
    }

    /** Run the battle forward without drawing it — used by ?t= for reproducible screenshots. */
    fastForward(seconds) {
      const dt = 1 / 30;
      for (let i = 0; i < Math.min(seconds, 300) * 30; i++) {
        this.step(dt);
        this.controls.update(dt); // so the camera arrives already looking at the fighting
      }
    }

    /** Everything the old scene is holding on the GPU, released before the next one is built. */
    dispose() {
      for (const u of this.units) {
        u.mesh.dispose();
        u.outline.traverse((o) => o.geometry?.dispose());
      }
      for (const m of this.corpses) m.dispose();
      this.terrain.mesh.geometry.dispose();
      this.terrain.trees.dispose();
      this.terrain.trees.geometry.dispose();
    }

    /** Tear the battle down and stand a new one up — the one path both Fight again and the builder use. */
    startBattle(config) {
      this.dispose();
      this.hud.reset();
      if (config) {
        if (config.seed) this.seed = config.seed >>> 0;
        this.config = A.resolveConfig(config.preset || config);
      }
      this.build();
      this.controls.reframe();
      if (A.coach) A.coach.begin(this);
      return this.config;
    }

    restart() {
      this.seed = (this.seed * 1103515245 + 12345) >>> 0;
      this.startBattle(null);
      this.hud.log("A new field, a new battle.", "system");
    }

    // ── frame ──────────────────────────────────────────────────────────────
    resize() {
      const w = innerWidth;
      const h = innerHeight;
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    }

    loop(nowMs) {
      requestAnimationFrame(this.loop);
      const dt = Math.min(0.05, (nowMs - this.last) / 1000);
      this.last = nowMs;
      this.controls.update(dt);
      if (!this.paused) this.step(dt);
      this.updatePings(dt);
      this.hud.update(this.time, dt);
      if (A.coach) A.coach.update(this, dt);
      this.renderer.render(this.scene, this.camera);
      const boot = document.getElementById("boot");
      if (boot && !boot.hidden && !boot.classList.contains("fatal")) boot.hidden = true;
    }
  };

  A.boot = () => {
    try {
      const game = new A.Game();
      A.game = game;
      A.builder = new A.Builder(game);
      A.coach = new A.Coach();
      // Nothing is taught in words the player has not asked for. The first thing they see is one
      // objective and one arrow; the controls live behind a button until they want them.
      if (!game.params.get("t") && !game.autoPlay) A.coach.begin(game);
    } catch (err) {
      A.fatal(err?.message ? err.message : String(err));
      throw err;
    }
  };
})((window.Anchor = window.Anchor || {}));
