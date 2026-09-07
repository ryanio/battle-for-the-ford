/**
 * Camera and orders. RTS conventions, because they are the ones the hands already know: left-click
 * and drag to select, right-click to order, WASD and the screen edge to pan, wheel to zoom.
 *
 * The one thing worth calling out is right-DRAG: press where you want the line to stand, drag in the
 * direction you want it to face, release. Facing is half the game, so it gets its own gesture rather
 * than being inferred from the walk.
 *
 * The other thing worth calling out is `armed`. Edge panning is driven by the last pointer position
 * the page was told about, and a page that loses focus is never told the pointer left — so alt-tab
 * away with the cursor near an edge and the camera keeps panning for as long as you are gone. It is
 * disarmed by blur, by the tab being hidden, and by the pointer leaving the document, and only a
 * genuine pointermove arms it again. Refocusing on its own must not, or the stale coordinate that
 * caused the runaway simply starts it up a second time.
 */
((A) => {
  const MIN_DIST = 26;
  const MAX_DIST = 170;
  const EDGE = 16;

  // Built on first use: these are classic scripts and run before the module that publishes THREE.
  let scratch;
  const vec = (x, y, z) => (scratch || (scratch = new THREE.Vector3())).set(x, y, z);

  A.Controls = class Controls {
    constructor(game) {
      this.game = game;
      this.canvas = game.renderer.domElement;
      this.camera = game.camera;

      this.target = new THREE.Vector3(0, 0, -8);
      this.yaw = Math.PI;
      this.dist = 78;

      this.keys = new Set();
      this.mouse = { x: 0, y: 0, inside: false };
      this.armed = false; // is the pointer position we hold actually current?
      this.focused = typeof document !== "undefined" ? document.hasFocus() : true;
      this.drag = null;
      this.rightDrag = null;
      this.userMoved = false;

      this.raycaster = new THREE.Raycaster();
      this.ndc = new THREE.Vector2();
      this.marquee = document.getElementById("marquee");

      this.bind();
      this.apply();
      this.reframe();
    }

    /**
     * Sit the camera where both lines are on screen at once, inside the band the chrome leaves free.
     *
     * Guessing a distance from the size of the deployment was not enough: perspective stretches the
     * near half of the field far more than the far half, so the player's own army ended up under the
     * command bar while the enemy sat comfortably in the middle. So this projects the two ends of
     * the deployment, measures them in pixels, and pushes the camera back or slides it along until
     * they both fit. It costs a few dozen iterations, once, at the start of a battle.
     */
    reframe() {
      let minX = Infinity;
      let maxX = -Infinity;
      let minZ = Infinity;
      let maxZ = -Infinity;
      for (const u of this.game.units) {
        if (u.state === "gone") continue;
        minX = Math.min(minX, u.pos.x - u.halfWidth);
        maxX = Math.max(maxX, u.pos.x + u.halfWidth);
        minZ = Math.min(minZ, u.pos.z - u.halfDepth);
        maxZ = Math.max(maxZ, u.pos.z + u.halfDepth);
      }
      if (!Number.isFinite(minX)) return;

      this.yaw = Math.PI;
      this.userMoved = false;
      this.armed = false;
      const cx = (minX + maxX) / 2;
      this.target.set(cx, 0, (minZ + maxZ) / 2);
      this.dist = A.clamp(Math.max(maxX - minX, maxZ - minZ) * 0.95, MIN_DIST, MAX_DIST);

      const top = 76; // the top bar, plus the coach line under it
      const bottom = 168; // the command bar, the unit read-out and the minimap
      const band = Math.max(120, innerHeight - top - bottom);
      const want = top + band / 2;

      for (let i = 0; i < 60; i++) {
        this.apply();
        const near = this.screenY(cx, minZ);
        const far = this.screenY(cx, maxZ);
        const wide = this.screenX(minX, (minZ + maxZ) / 2) - this.screenX(maxX, (minZ + maxZ) / 2);
        if (!Number.isFinite(near) || !Number.isFinite(far)) break;
        const tall = near - far;
        if ((tall > band || Math.abs(wide) > innerWidth * 0.86) && this.dist < MAX_DIST) {
          this.dist = A.clamp(this.dist * 1.05, MIN_DIST, MAX_DIST);
          continue;
        }
        const err = (near + far) / 2 - want;
        if (Math.abs(err) < 3) break;
        // Sliding the camera north pushes the field down the screen, so the correction is negative.
        this.target.z -= err * 0.055 * (this.dist / 70);
      }
      this.apply();
    }

    screenY(x, z) {
      const v = vec(x, this.game.terrain.heightAt(x, z), z).project(this.camera);
      return ((1 - v.y) / 2) * innerHeight;
    }

    screenX(x, z) {
      const v = vec(x, this.game.terrain.heightAt(x, z), z).project(this.camera);
      return ((v.x + 1) / 2) * innerWidth;
    }

    bind() {
      const c = this.canvas;
      addEventListener("contextmenu", (e) => e.preventDefault());
      addEventListener("keydown", (e) => this.onKey(e, true));
      addEventListener("keyup", (e) => this.onKey(e, false));

      addEventListener("blur", () => this.standDown());
      addEventListener("focus", () => {
        // Focus back, but the pointer is wherever it is: wait to be told before panning again.
        this.focused = true;
      });
      document.addEventListener("visibilitychange", () => {
        if (document.hidden) this.standDown();
        else this.focused = true;
      });
      // pointerleave does not bubble, so listening on `window` for it never fires. The pointer
      // leaving the document shows up as a pointerout with no relatedTarget, and as a mouseleave
      // on the document element.
      document.addEventListener("pointerout", (e) => {
        if (!e.relatedTarget) this.disarm();
      });
      document.addEventListener("mouseleave", () => this.disarm());
      document.documentElement.addEventListener("pointerleave", () => this.disarm());

      addEventListener("pointermove", (e) => this.onMove(e));
      c.addEventListener("pointerdown", (e) => this.onDown(e));
      addEventListener("pointerup", (e) => this.onUp(e));
      c.addEventListener(
        "wheel",
        (e) => {
          e.preventDefault();
          this.dist = A.clamp(this.dist * Math.exp(e.deltaY * 0.0013), MIN_DIST, MAX_DIST);
          this.userMoved = true;
        },
        { passive: false },
      );
    }

    /** Lost the window. Drop every key, forget where the pointer was, and hold the camera still. */
    standDown() {
      this.focused = false;
      this.keys.clear();
      this.disarm();
    }

    disarm() {
      this.armed = false;
      this.mouse.inside = false;
    }

    onKey(e, down) {
      // Typing a 4 into the army builder must not also pause the battle behind it.
      if (A.typingInAField(e.target)) return;
      const k = e.key.toLowerCase();
      if (down && k === " ") {
        e.preventDefault();
        this.game.togglePause();
        return;
      }
      if (down && k === "tab") {
        e.preventDefault();
        this.game.selectAll();
        return;
      }
      if (down && k === "escape") {
        this.game.select([]);
        return;
      }
      if (down && k === "r" && (e.ctrlKey || e.metaKey)) return;
      if (["w", "a", "s", "d", "q", "e", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k)) {
        e.preventDefault();
        if (down) this.keys.add(k);
        else this.keys.delete(k);
      }
    }

    onMove(e) {
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
      this.mouse.inside = true;
      this.armed = true;
      this.focused = true;
      if (this.drag) {
        this.drag.x2 = e.clientX;
        this.drag.y2 = e.clientY;
        if (Math.abs(this.drag.x2 - this.drag.x1) + Math.abs(this.drag.y2 - this.drag.y1) > 6) {
          this.drag.boxed = true;
          const m = this.marquee;
          m.hidden = false;
          m.style.left = `${Math.min(this.drag.x1, this.drag.x2)}px`;
          m.style.top = `${Math.min(this.drag.y1, this.drag.y2)}px`;
          m.style.width = `${Math.abs(this.drag.x2 - this.drag.x1)}px`;
          m.style.height = `${Math.abs(this.drag.y2 - this.drag.y1)}px`;
        }
      }
    }

    onDown(e) {
      if (e.button === 0) {
        this.drag = {
          x1: e.clientX,
          y1: e.clientY,
          x2: e.clientX,
          y2: e.clientY,
          boxed: false,
          add: e.shiftKey,
        };
      } else if (e.button === 2) {
        const p = this.groundPoint(e.clientX, e.clientY);
        if (p) this.rightDrag = { from: p, x: e.clientX, y: e.clientY };
      }
    }

    onUp(e) {
      if (e.button === 0 && this.drag) {
        const d = this.drag;
        this.drag = null;
        this.marquee.hidden = true;
        if (d.boxed) this.boxSelect(d);
        else this.clickSelect(e.clientX, e.clientY, d.add);
      } else if (e.button === 2 && this.rightDrag) {
        const from = this.rightDrag.from;
        this.rightDrag = null;
        const to = this.groundPoint(e.clientX, e.clientY) || from;
        const dx = to.x - from.x;
        const dz = to.z - from.z;
        const facing = Math.hypot(dx, dz) > 4 ? Math.atan2(dx, dz) : null;
        this.game.issueOrders(from.x, from.z, facing);
      }
    }

    groundPoint(px, py) {
      const r = this.canvas.getBoundingClientRect();
      this.ndc.set(((px - r.left) / r.width) * 2 - 1, -((py - r.top) / r.height) * 2 + 1);
      this.raycaster.setFromCamera(this.ndc, this.camera);
      const hit = this.raycaster.intersectObject(this.game.terrain.mesh, false)[0];
      return hit ? { x: hit.point.x, z: hit.point.z } : null;
    }

    clickSelect(px, py, add) {
      const p = this.groundPoint(px, py);
      if (!p) return;
      let best = null;
      let bestD = Infinity;
      for (const u of this.game.units) {
        if (u.side !== 0 || u.state === "gone") continue;
        const rx = p.x - u.pos.x;
        const rz = p.z - u.pos.z;
        const cf = Math.cos(u.facing);
        const sf = Math.sin(u.facing);
        const lx = rx * cf - rz * sf;
        const lz = rx * sf + rz * cf;
        const over = Math.abs(lx) < u.halfWidth + 2 && Math.abs(lz) < u.halfDepth + 2;
        const d = rx * rx + rz * rz;
        if (over && d < bestD) {
          bestD = d;
          best = u;
        }
      }
      if (!best) {
        if (!add) this.game.select([]);
        return;
      }
      this.game.select(add ? this.game.selected.concat([best]) : [best]);
    }

    boxSelect(d) {
      const x1 = Math.min(d.x1, d.x2);
      const x2 = Math.max(d.x1, d.x2);
      const y1 = Math.min(d.y1, d.y2);
      const y2 = Math.max(d.y1, d.y2);
      const r = this.canvas.getBoundingClientRect();
      const v = new THREE.Vector3();
      const picked = [];
      for (const u of this.game.units) {
        if (u.side !== 0 || u.state === "gone") continue;
        v.set(u.pos.x, this.game.terrain.heightAt(u.pos.x, u.pos.z) + 1, u.pos.z);
        v.project(this.camera);
        const sx = r.left + ((v.x + 1) / 2) * r.width;
        const sy = r.top + ((1 - v.y) / 2) * r.height;
        if (v.z < 1 && sx >= x1 && sx <= x2 && sy >= y1 && sy <= y2) picked.push(u);
      }
      this.game.select(d.add ? this.game.selected.concat(picked) : picked);
    }

    update(dt) {
      const k = this.keys;
      const fx = -Math.sin(this.yaw);
      const fz = -Math.cos(this.yaw);
      const rx = -fz;
      const rz = fx;
      let mx = 0;
      let mz = 0;
      if (k.has("w") || k.has("arrowup")) {
        mx += fx;
        mz += fz;
      }
      if (k.has("s") || k.has("arrowdown")) {
        mx -= fx;
        mz -= fz;
      }
      if (k.has("d") || k.has("arrowright")) {
        mx += rx;
        mz += rz;
      }
      if (k.has("a") || k.has("arrowleft")) {
        mx -= rx;
        mz -= rz;
      }

      // Edge scrolling, but never while a selection box is being dragged out, and never on a
      // pointer position the page has not been told is still true.
      if (this.armed && this.focused && this.mouse.inside && !this.drag) {
        if (this.mouse.x < EDGE) {
          mx -= rx;
          mz -= rz;
        } else if (this.mouse.x > innerWidth - EDGE) {
          mx += rx;
          mz += rz;
        }
        if (this.mouse.y < EDGE) {
          mx += fx;
          mz += fz;
        } else if (this.mouse.y > innerHeight - EDGE) {
          mx -= fx;
          mz -= fz;
        }
      }

      const m = Math.hypot(mx, mz);
      if (m > 0 || k.has("q") || k.has("e")) this.userMoved = true;
      if (m > 0) {
        const speed = (24 + this.dist * 0.42) * dt;
        this.target.x += (mx / m) * speed;
        this.target.z += (mz / m) * speed;
      }
      if (k.has("q")) this.yaw += 1.1 * dt;
      if (k.has("e")) this.yaw -= 1.1 * dt;

      if (!this.userMoved) this.followAction(dt);

      const t = this.game.terrain;
      this.target.x = A.clamp(this.target.x, -t.width / 2 - 20, t.width / 2 + 20);
      this.target.z = A.clamp(this.target.z, -t.depth / 2 - 20, t.depth / 2 + 20);
      this.apply();
    }

    /**
     * Until the player touches the camera, it drifts to keep the fighting in frame. The moment they
     * pan, zoom or rotate it stops for good — an RTS camera that keeps stealing itself back is worse
     * than one that never helps at all.
     *
     * It also stays out of the way until there *is* fighting, so the deliberate opening shot — both
     * lines in view, with the ground behind the enemy flank visible — is not immediately dragged
     * back to the centre of mass before the player has read it.
     */
    followAction(dt) {
      let sx = 0;
      let sz = 0;
      let n = 0;
      let anyEngaged = false;
      for (const u of this.game.units) {
        if (u.state === "gone") continue;
        const engaged = u.contactsAgainst > 0 || u.contactsOn > 0;
        anyEngaged = anyEngaged || engaged;
        const w = engaged ? 4 : 1;
        sx += u.pos.x * w;
        sz += u.pos.z * w;
        n += w;
      }
      if (!n || !anyEngaged) return;
      const k = 1 - Math.exp(-0.8 * dt);
      this.target.x += (sx / n - this.target.x) * k;
      this.target.z += (sz / n + 8 - this.target.z) * k;
    }

    apply() {
      // Zoomed out you want a map; zoomed in you want to see faces. Pitch follows the wheel.
      const k = (this.dist - MIN_DIST) / (MAX_DIST - MIN_DIST);
      const pitch = A.lerp(0.58, 0.98, k);
      const h = this.dist * Math.cos(pitch);
      this.target.y = this.game.terrain.heightAt(this.target.x, this.target.z);
      this.camera.position.set(
        this.target.x + Math.sin(this.yaw) * h,
        this.target.y + this.dist * Math.sin(pitch),
        this.target.z + Math.cos(this.yaw) * h,
      );
      this.camera.lookAt(this.target);
    }
  };
})((window.Anchor = window.Anchor || {}));
