/**
 * Procedural geometry. Nothing here is loaded from disk or the network: reef guards, rays, standards
 * and kelp are boxes welded together and given baked vertex colours, which is all an RTS camera ever
 * resolves. One merged geometry per (unit type, side) means one InstancedMesh per unit and one draw
 * call for forty bodies.
 */
((A) => {
  /** A coloured box, pre-transformed into soldier-local space. */
  function box(w, h, d, x, y, z, color, rot) {
    const g = new THREE.BoxGeometry(w, h, d);
    if (rot) {
      if (rot[0]) g.rotateX(rot[0]);
      if (rot[1]) g.rotateY(rot[1]);
      if (rot[2]) g.rotateZ(rot[2]);
    }
    g.translate(x, y, z);
    const c = new THREE.Color(color);
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
    }
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    return g;
  }
  A.box = box;

  /**
   * Merge indexed BufferGeometries that share position/normal/color. three's BufferGeometryUtils
   * lives in the addons bundle, and pulling a second file off the CDN for thirty lines of array
   * copying is not a trade worth making.
   */
  function merge(parts) {
    let verts = 0;
    let indices = 0;
    for (const p of parts) {
      verts += p.attributes.position.count;
      indices += p.index.count;
    }
    const pos = new Float32Array(verts * 3);
    const nor = new Float32Array(verts * 3);
    const col = new Float32Array(verts * 3);
    const idx = verts > 65535 ? new Uint32Array(indices) : new Uint16Array(indices);
    let vo = 0;
    let io = 0;
    for (const p of parts) {
      const n = p.attributes.position.count;
      pos.set(p.attributes.position.array, vo * 3);
      nor.set(p.attributes.normal.array, vo * 3);
      col.set(p.attributes.color.array, vo * 3);
      const pi = p.index.array;
      for (let i = 0; i < pi.length; i++) idx[io + i] = pi[i] + vo;
      vo += n;
      io += pi.length;
      p.dispose();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeBoundingSphere();
    return g;
  }
  A.mergeGeometry = merge;

  const SKIN = 0xc79b6e;
  const IRON = 0x8d949c;
  const WOOD = 0x6b4b2f;
  const STEEL = 0xb9c2c9;

  /**
   * One reef trooper, facing local +Z, footed at y = 0. `livery` is the shoal colour and carries
   * almost all of the readability at RTS zoom — it is on the shell, which is the biggest flat face.
   */
  function soldier(kind, livery, tunic) {
    const p = [
      box(0.3, 0.44, 0.22, 0, 0.22, 0, 0x25454a), // tail-fin stance
      box(0.38, 0.5, 0.27, 0, 0.67, 0, tunic), // carapace
      box(0.44, 0.13, 0.3, 0, 0.88, 0, 0x5f7f84), // shoulder plate — breaks the slab up
      // A dorsal mantle in the shoal's colour. The camera spends most of its life looking at the
      // backs of your own troops, and without this a line read as one block of grey from behind.
      box(0.36, 0.5, 0.06, 0, 0.72, -0.16, livery),
      box(0.09, 0.34, 0.24, 0, 1.0, -0.2, livery, [0.3, 0, 0]), // dorsal fin
      box(0.21, 0.21, 0.21, 0, 1.06, 0.01, SKIN), // head
      box(0.26, 0.13, 0.26, 0, 1.19, 0.01, IRON), // shell helm
      box(0.09, 0.2, 0.16, 0, 1.32, -0.02, livery), // crest fin
    ];
    if (kind === "spear") {
      p.push(box(0.07, 0.38, 0.38, -0.24, 0.68, 0.1, livery)); // urchin buckler
      p.push(box(0.05, 2.6, 0.05, 0.26, 1.15, 0.22, WOOD, [-0.22, 0, 0])); // spine shaft
      p.push(box(0.07, 0.28, 0.07, 0.26, 2.42, 0.52, STEEL, [-0.22, 0, 0])); // spine tip
      p.push(box(0.05, 0.05, 0.5, -0.3, 0.9, 0.34, STEEL, [0.4, 0, 0])); // a second spine, splayed
    } else {
      p.push(box(0.1, 0.5, 0.5, -0.25, 0.66, 0.08, livery)); // scallop shell shield
      p.push(box(0.06, 0.06, 0.5, -0.25, 0.66, 0.08, 0xdfe8ea)); // its rib
      p.push(box(0.06, 0.46, 0.06, 0.27, 0.86, 0.16, STEEL, [-0.75, 0, 0])); // blade
    }
    return merge(p);
  }

  /**
   * A leviathan. Same idiom, twice the mass and no helm — at RTS zoom the silhouette is the whole
   * identity, so it is built wide and low with a club of reef rock that reads from across the pass.
   */
  function ogre(livery, tunic) {
    return merge([
      box(0.52, 0.6, 0.4, 0, 0.3, 0, 0x4a3a2a), // legs
      box(0.86, 0.74, 0.52, 0, 0.96, 0, tunic), // torso
      box(0.98, 0.2, 0.56, 0, 1.3, 0, 0x6f6152), // shoulders
      box(0.8, 0.6, 0.1, 0, 1.0, -0.28, livery), // hide cloak in the army colour
      box(0.36, 0.34, 0.34, 0, 1.55, 0.03, SKIN), // head
      box(0.42, 0.12, 0.4, 0, 1.72, 0.03, IRON), // iron cap
      box(0.16, 0.14, 0.16, 0.2, 1.6, 0.16, 0xd8d0c0), // tusk
      box(0.12, 0.5, 0.5, 0, 1.35, -0.42, livery, [0.25, 0, 0]), // dorsal ridge
      box(0.22, 1.5, 0.22, 0.62, 1.1, 0.2, WOOD, [-0.5, 0, 0]), // club haft
      box(0.42, 0.5, 0.42, 0.62, 1.75, 0.78, 0x6a6a68, [-0.5, 0, 0]), // club head
    ]);
  }

  /**
   * One of the drowned. Rags in a washed-out livery, no shield, arms out — the point is that a block
   * of them reads as a crowd rather than a formation even while it is still in perfect order.
   */
  function zombie(livery, tunic) {
    return merge([
      box(0.26, 0.42, 0.2, 0, 0.21, 0, 0x3f3a30),
      box(0.34, 0.48, 0.24, 0, 0.65, 0, tunic),
      box(0.4, 0.1, 0.24, 0, 0.86, 0, 0x555044),
      box(0.36, 0.4, 0.05, 0, 0.68, -0.13, livery), // tattered colours
      box(0.1, 0.12, 0.42, 0.2, 0.84, 0.22, tunic), // outstretched arms
      box(0.1, 0.12, 0.42, -0.2, 0.84, 0.22, tunic),
      box(0.19, 0.19, 0.19, 0, 1.02, 0.01, 0x9fae86), // grey-green head
      box(0.07, 0.4, 0.07, 0.24, 0.7, 0.2, WOOD, [-0.9, 0, 0]), // broken shaft
    ]);
  }

  /**
   * A ray and its rider, facing local +Z. Wide, flat and low — the silhouette of a manta seen from
   * an RTS camera is a broad wing span with a whip of tail behind, and that is what makes a block of
   * these unmistakable from a block of anything else. `heavy` plates both of them in shell.
   */
  function horseman(livery, tunic, coat, heavy) {
    const p = [
      box(1.5, 0.24, 1.5, 0, 0.95, 0.0, coat), // body disc
      box(1.1, 0.14, 1.05, 1.14, 0.98, -0.12, coat, [0, 0, 0.24]), // right wing
      box(1.1, 0.14, 1.05, -1.14, 0.98, -0.12, coat, [0, 0, -0.24]), // left wing
      box(0.62, 0.2, 0.52, 0, 0.97, 0.86, coat), // snout
      box(0.16, 0.14, 0.2, 0.26, 1.04, 1.02, coat), // cephalic lobes
      box(0.16, 0.14, 0.2, -0.26, 1.04, 1.02, coat),
      box(0.11, 0.09, 1.5, 0, 0.96, -1.28, coat), // whip tail
      box(0.07, 0.06, 0.5, 0, 0.96, -2.1, coat),
      box(1.0, 0.06, 0.8, 0, 1.09, -0.1, livery), // shoal markings across the back
      box(0.34, 0.5, 0.26, 0, 1.4, 0.02, tunic), // rider
      box(0.34, 0.46, 0.06, 0, 1.42, -0.15, livery), // rider's mantle
      box(0.44, 0.16, 0.22, 0, 1.2, 0.02, 0x25454a),
      box(0.2, 0.2, 0.2, 0, 1.74, 0.02, SKIN),
      box(0.25, 0.11, 0.25, 0, 1.85, 0.02, IRON),
      box(0.09, 0.14, 0.09, 0, 1.94, 0.02, livery),
      box(0.09, 0.4, 0.32, -0.26, 1.38, 0.12, livery), // shell shield
      box(0.05, 2.2, 0.05, 0.27, 1.52, 0.3, WOOD, [-1.25, 0, 0]), // couched spine
      box(0.07, 0.24, 0.07, 0.27, 1.98, 1.34, STEEL, [-1.25, 0, 0]),
    ];
    if (heavy) {
      p.push(box(1.3, 0.14, 1.3, 0, 1.1, 0.02, STEEL)); // shell plate over the disc
      p.push(box(0.5, 0.16, 0.4, 0, 1.1, 0.86, STEEL)); // brow plate
      p.push(box(0.42, 0.5, 0.3, 0, 1.42, 0.02, STEEL)); // cuirass
      p.push(box(0.3, 0.24, 0.3, 0, 1.8, 0.02, IRON)); // spiral helm
      p.push(box(0.16, 0.1, 0.3, 0, 1.9, -0.06, STEEL)); // the nautilus whorl
      p.push(box(0.12, 0.44, 0.05, 0, 2.14, -0.02, livery)); // crest
    }
    return merge(p);
  }

  /** Cache keyed on type+livery: six geometries serve a whole battlefield. */
  const cache = new Map();
  A.soldierGeometry = (kind, livery, tunic, coat) => {
    const key = `${kind}:${livery}:${tunic}`;
    let g = cache.get(key);
    if (!g) {
      if (kind === "cavalry" || kind === "knight") g = horseman(livery, tunic, coat, kind === "knight");
      else if (kind === "ogre") g = ogre(livery, tunic);
      else if (kind === "zombie") g = zombie(livery, tunic);
      else g = soldier(kind, livery, tunic);
      cache.set(key, g);
    }
    return g;
  };

  /** The standard that marks a formation's centre — the thing your eye actually tracks. */
  A.bannerGeometry = (livery) =>
    merge([
      box(0.07, 3.3, 0.07, 0, 1.65, 0, 0x1d4a52),
      box(0.16, 0.18, 0.16, 0, 3.36, 0, 0x9fe0ea),
      box(0.03, 0.62, 0.86, 0.01, 3.0, 0.45, livery),
      box(0.04, 0.1, 0.86, 0.01, 2.68, 0.45, 0x9fe0ea),
    ]);

  /** A fallen body: a flat slab settled on the bed. The dead are how a battle line tells its story. */
  A.corpseGeometry = (livery) =>
    merge([
      box(0.52, 0.13, 0.26, 0, 0.065, 0, 0x27403f),
      box(0.17, 0.1, 0.17, 0.32, 0.05, 0, 0x6f8a86),
      box(0.3, 0.07, 0.3, -0.2, 0.09, 0.1, livery),
    ]);

  /** A stand of kelp: a holdfast and two fronds leaning off the vertical. */
  A.treeGeometry = () =>
    merge([
      box(0.9, 0.5, 0.9, 0, 0.25, 0, 0x2a4a3c),
      box(0.5, 3.4, 0.35, 0.15, 2.0, 0, 0x2f6b4e, [0, 0, -0.14]),
      box(0.42, 2.8, 0.3, -0.35, 1.7, 0.2, 0x3d7a52, [0, 0, 0.2]),
      box(0.9, 1.2, 0.5, 0.45, 3.6, 0, 0x46895c, [0, 0, -0.14]),
      box(0.7, 1.0, 0.4, -0.6, 3.0, 0.2, 0x386f4a, [0, 0, 0.2]),
    ]);

  /**
   * A tiling caustic web, generated in a canvas.
   *
   * This is the single cheapest thing that makes a scene read as underwater: bright wandering lines
   * of focused light crawling over the seabed. Three ridged sine fields at integer frequencies over
   * a full period, so the texture tiles seamlessly, then raised to a power so the ridges become thin
   * bright lines instead of soft blobs.
   */
  A.causticTexture = () => {
    const N = 256;
    const c = document.createElement("canvas");
    c.width = c.height = N;
    const ctx = c.getContext("2d");
    const img = ctx.createImageData(N, N);
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const u = (x / N) * Math.PI * 2;
        const v = (y / N) * Math.PI * 2;
        const n =
          Math.abs(
            Math.sin(u * 3 + Math.sin(v * 2) * 1.4) +
              Math.sin(v * 3 + Math.sin(u * 2) * 1.2) +
              Math.sin((u + v) * 2),
          ) / 3;
        const k = (1 - Math.min(1, n * 1.35)) ** 7;
        const i = (y * N + x) * 4;
        img.data[i] = 170 * k;
        img.data[i + 1] = 240 * k;
        img.data[i + 2] = 255 * k;
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };

  /** Soft radial blob, generated in a canvas — the ground shade under a formation. */
  A.blobTexture = () => {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const ctx = c.getContext("2d");
    const grd = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, "rgba(255,255,255,1)");
    grd.addColorStop(0.55, "rgba(255,255,255,0.75)");
    grd.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
})((window.Anchor = window.Anchor || {}));
