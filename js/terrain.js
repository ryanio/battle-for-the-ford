/**
 * The seabed. A sum of a few gaussian sandbars and one long reef shelf — gentle enough that
 * formations still read as blocks, steep enough that holding the shallow side is worth a few percent
 * in the melee. The maths is untouched from when this was a hillside; only the reading changed. Up
 * is shallow, down is deep, and the dip along the centre line is the pass everyone is fighting over.
 */
((A) => {
  const WIDTH = 230;
  const DEPTH = 190;

  A.Terrain = class Terrain {
    constructor(rng) {
      this.width = WIDTH;
      this.depth = DEPTH;
      this.hills = [];
      // One ridge across the middle of the field, so the two armies meet on a slope, plus a
      // scattering of knolls to break the symmetry.
      this.hills.push({ x: rng.range(-30, 30), z: 0, r: 46, h: 4.6, sx: 2.4 });
      // (Kept as `hills` throughout: they are reef shelves now, but renaming the field would
      // change nothing except the diff.)
      for (let i = 0; i < 5; i++) {
        this.hills.push({
          x: rng.range(-95, 95),
          z: rng.range(-75, 75),
          r: rng.range(20, 42),
          h: rng.range(1.6, 4.2),
          sx: rng.range(0.8, 1.6),
        });
      }
    }

    heightAt(x, z) {
      let h = 0;
      for (const k of this.hills) {
        const dx = (x - k.x) / k.sx;
        const dz = z - k.z;
        h += k.h * Math.exp(-(dx * dx + dz * dz) / (2 * k.r * k.r));
      }
      // A channel along the centre line: the reef pass the two shoals are fighting over.
      h -= 1.1 * Math.exp(-(z * z) / (2 * 13 * 13));
      return h;
    }

    /** Downhill-ness of a slope in a given direction, used for the uphill fighting penalty. */
    build(scene, rng) {
      const seg = 120;
      const g = new THREE.PlaneGeometry(WIDTH + 90, DEPTH + 90, seg, seg);
      g.rotateX(-Math.PI / 2);
      const pos = g.attributes.position;
      const col = new Float32Array(pos.count * 3);
      // Seagrass in the hollows, bare sand on the shelf crests, dark reef rock in the channel.
      const seagrass = new THREE.Color(0x2a5a4d);
      const sand = new THREE.Color(0x7a7159);
      const reef = new THREE.Color(0x1a4048);
      const tmp = new THREE.Color();
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const z = pos.getZ(i);
        const y = this.heightAt(x, z);
        pos.setY(i, y);
        // Height does almost all the work — bare sand on the crests, seagrass in the hollows. The
        // noise is deliberately faint: an earlier version mottled the whole seabed and the
        // formations vanished into it.
        // Two scales of variation: a slow drift so the bed is not one flat colour, and a per-vertex
        // speckle that reads as sediment. Sine noise alone gave the whole map corduroy.
        const drift = Math.sin(x * 0.031 + z * 0.047) + Math.sin(x * 0.017 - z * 0.023);
        const speck = rng.gauss();
        const t = A.clamp(y / 4.2 + 0.18 + drift * 0.05, 0, 1);
        tmp.copy(y < 0.15 ? reef : seagrass).lerp(sand, t);
        tmp.offsetHSL(drift * 0.004, drift * 0.012, speck * 0.026);
        col[i * 3] = tmp.r;
        col[i * 3 + 1] = tmp.g;
        col[i * 3 + 2] = tmp.b;
      }
      g.setAttribute("color", new THREE.BufferAttribute(col, 3));
      g.computeVertexNormals();

      this.mesh = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true }));
      this.mesh.name = "ground";
      scene.add(this.mesh);

      this.plantTrees(scene, rng);
      return this.mesh;
    }

    /** Kelp well outside the fighting, purely to give the eye a sense of scale and distance. */
    plantTrees(scene, rng) {
      const spots = [];
      for (let i = 0; i < 240 && spots.length < 130; i++) {
        const x = rng.range(-(WIDTH / 2 + 42), WIDTH / 2 + 42);
        const z = rng.range(-(DEPTH / 2 + 42), DEPTH / 2 + 42);
        // Keep the battlefield itself clear — kelp inside it would just hide the formations.
        if (Math.abs(x) < WIDTH / 2 - 14 && Math.abs(z) < DEPTH / 2 - 14) continue;
        spots.push([x, z]);
      }
      const mesh = new THREE.InstancedMesh(
        A.treeGeometry(),
        new THREE.MeshLambertMaterial({ vertexColors: true }),
        spots.length,
      );
      const m = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      const p = new THREE.Vector3();
      const s = new THREE.Vector3();
      spots.forEach(([x, z], i) => {
        p.set(x, this.heightAt(x, z) - 0.2, z);
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng.range(0, Math.PI * 2));
        const k = rng.range(0.75, 1.5);
        s.set(k, rng.range(0.85, 1.4) * k, k);
        mesh.setMatrixAt(i, m.compose(p, q, s));
      });
      mesh.instanceMatrix.needsUpdate = true;
      scene.add(mesh);
      this.trees = mesh;
    }

    /** Keep a point on the playable field. */
    clampX(x) {
      return A.clamp(x, -WIDTH / 2, WIDTH / 2);
    }
    clampZ(z) {
      return A.clamp(z, -DEPTH / 2, DEPTH / 2);
    }
  };
})((window.Anchor = window.Anchor || {}));
