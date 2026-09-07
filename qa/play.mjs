#!/usr/bin/env node
/**
 * Battle for the Ford — QA harness.
 *
 *   node qa/play.mjs            play the game headlessly and assert on what happens
 *   node qa/play.mjs --keep     leave the screenshots from a previous run in place
 *
 * It serves the repo, opens it in a headless Chromium over CDP, and then plays: real mouse presses
 * and drags for box-select and orders, a real wheel for zoom, real key events for pan and pause.
 * Every checkpoint is screenshotted into qa/out/ so a failure can be looked at rather than guessed
 * at. Exits non-zero on the first failing assertion set, so CI can gate on it.
 */
import { mkdir, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { auditConsole, auditLayout, PANELS, wrappedText, ONE_LINERS } from "./checks.mjs";
import { launch, Report, serve, sleep } from "./harness.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const out = join(here, "out");

const SIZES = [
  [1280, 800],
  [1440, 900],
  [1024, 720],
  [1920, 1080],
];

async function main() {
  if (!process.argv.includes("--keep")) await rm(out, { recursive: true, force: true });
  await mkdir(out, { recursive: true });

  const report = new Report();
  const site = await serve(root);
  const page = await launch({ width: 1280, height: 800 });

  try {
    await opening(page, report);
    await controlsWork(page, report, site);
    await cameraHoldsOnBlur(page, report, site);
    await combatInvariants(page, report, site);
    await restartRebuilds(page, report, site);
    await responsiveLayout(page, report, site);
    await armyBuilder(page, report, site);
  } catch (err) {
    report.check("harness ran to completion", false, err.stack || String(err));
    await page.shot("crash", out).catch(() => {});
  } finally {
    await page.close();
    await site.close();
  }

  const code = report.finish();
  console.log(`\nscreenshots: ${out}`);
  process.exit(code);

  // ── steps ──────────────────────────────────────────────────────────────────

  async function opening(page, report) {
    report.step("opening screen");
    await page.goto(`${site.origin}/index.html`);
    await sleep(900);
    await page.shot("01-opening", out);

    await auditLayout(page, report, "1280×800 opening");
    auditConsole(page, report, "on boot");

    const roster = await page.eval(() => {
      const g = window.Anchor.game;
      const per = [0, 1].map((s) => g.units.filter((u) => u.side === s));
      return {
        formations: per.map((l) => l.length),
        men: per.map((l) => l.reduce((n, u) => n + u.initial, 0)),
        types: per.map((l) => l.map((u) => u.type)),
      };
    });
    report.equal("Rome fields 6 formations", roster.formations[0], 6);
    report.equal("the Gauls field 6 formations", roster.formations[1], 6);
    report.equal("Rome musters 208 men", roster.men[0], 208);
    report.equal("the Gauls muster 224 men", roster.men[1], 224);
    report.check(
      "Rome has twice the cavalry",
      roster.types[0].filter((t) => t === "cavalry").length ===
        2 * roster.types[1].filter((t) => t === "cavalry").length,
      JSON.stringify(roster.types),
    );

    // The whole point of the redesign: the aha has to be on screen without reading a wall of text.
    const onboarding = await page.eval(() => {
      const g = window.Anchor.game;
      const coach = document.getElementById("coach");
      const help = document.getElementById("help");
      const arrow = document.querySelector(".flank-arrow");
      const words = (coach?.innerText || "").trim().split(/\s+/).filter(Boolean).length;
      return {
        coachVisible: !!coach && !coach.hidden && coach.getBoundingClientRect().height > 0,
        coachWords: words,
        helpCollapsed: !!help && help.classList.contains("collapsed"),
        arrowVisible: !!arrow && arrow.getBoundingClientRect().width > 0,
        preselected: g.selected.map((u) => u.type),
      };
    });
    report.check("an objective is on screen", onboarding.coachVisible);
    report.check("the objective is short", onboarding.coachWords > 0 && onboarding.coachWords <= 22, `${onboarding.coachWords} words`);
    report.check("the controls panel starts collapsed", onboarding.helpCollapsed);
    report.check("a flank arrow points at the exposed side", onboarding.arrowVisible);
    report.check(
      "cavalry is pre-selected for the player",
      onboarding.preselected.length > 0 && onboarding.preselected.every((t) => t === "cavalry" || t === "knight"),
      JSON.stringify(onboarding.preselected),
    );

    // The command bar has to carry the whole line, not just the selection.
    const bar = await page.eval(() => {
      const cards = [...document.querySelectorAll("#command .card")];
      return {
        n: cards.length,
        withIcon: cards.filter((c) => c.querySelector(".sigil")).length,
        withStrength: cards.filter((c) => c.querySelector(".strength")).length,
        withMorale: cards.filter((c) => c.querySelector(".nerve")).length,
        selected: cards.filter((c) => c.classList.contains("sel")).length,
      };
    });
    // The controls panel is the thing that used to sit on top of the score. Open it and look.
    await page.clickSelector("#help-toggle");
    await sleep(250);
    await page.shot("01b-controls-open", out);
    const helpOpen = await page.eval(() => {
      const h = document.getElementById("help");
      return { open: !h.classList.contains("collapsed"), h: h.getBoundingClientRect().height };
    });
    report.check("the Controls button opens the panel", helpOpen.open && helpOpen.h > 40, JSON.stringify(helpOpen));
    await auditLayout(page, report, "with the controls panel open");
    await page.clickSelector("#help-toggle");
    await sleep(200);

    report.equal("the command bar shows every friendly formation", bar.n, 6);
    report.equal("every card carries a type sigil", bar.withIcon, bar.n);
    report.equal("every card carries a strength bar", bar.withStrength, bar.n);
    report.equal("every card carries a morale indicator", bar.withMorale, bar.n);
    report.check("the pre-selected unit is marked in the bar", bar.selected > 0, `${bar.selected} highlighted`);
  }

  async function controlsWork(page, report, site) {
    report.step("driving the game with real input");
    await page.goto(`${site.origin}/index.html?seed=99&t=8`);
    await sleep(700);

    // Box-select: press, drag, release across Rome's line.
    const before = await page.eval(() => window.Anchor.game.selected.length);
    const box = await page.eval(() => {
      // Project the Roman formations to screen space so the drag covers something real.
      const g = window.Anchor.game;
      const v = new THREE.Vector3();
      let x1 = 1e9;
      let y1 = 1e9;
      let x2 = -1e9;
      let y2 = -1e9;
      for (const u of g.units) {
        if (u.side !== 0 || u.state === "gone") continue;
        v.set(u.pos.x, g.terrain.heightAt(u.pos.x, u.pos.z) + 1, u.pos.z);
        v.project(g.camera);
        const sx = ((v.x + 1) / 2) * innerWidth;
        const sy = ((1 - v.y) / 2) * innerHeight;
        x1 = Math.min(x1, sx);
        y1 = Math.min(y1, sy);
        x2 = Math.max(x2, sx);
        y2 = Math.max(y2, sy);
      }
      return { x1: x1 - 24, y1: y1 - 24, x2: x2 + 24, y2: y2 + 24 };
    });
    await page.dragWith("left", box.x1, box.y1, box.x2, box.y2, 10);
    await sleep(200);
    const selected = await page.eval(() => window.Anchor.game.selected.length);
    report.check("a left drag box-selects formations", selected > before && selected >= 2, `${before} → ${selected}`);
    await page.shot("02-box-select", out);
    await auditLayout(page, report, "with a selection");

    // Right-drag: move there, and face the way the drag pointed.
    const beforeOrder = await page.eval(() => {
      const u = window.Anchor.game.selected[0];
      return { x: u.order.x, z: u.order.z, facing: u.order.facing, id: u.id };
    });
    const cx = Math.round(page.width * 0.5);
    const cy = Math.round(page.height * 0.42);
    await page.dragWith("right", cx, cy, cx + 170, cy + 40, 10);
    await sleep(250);
    const afterOrder = await page.eval((id) => {
      const u = window.Anchor.game.units.find((q) => q.id === id);
      return { x: u.order.x, z: u.order.z, facing: u.order.facing, hasFacing: u.order.hasFacing };
    }, beforeOrder.id);
    const moved = Math.hypot(afterOrder.x - beforeOrder.x, afterOrder.z - beforeOrder.z);
    report.check("a right drag issues a move order", moved > 3, `order moved ${moved.toFixed(1)}m`);
    report.check("a right drag sets the facing", afterOrder.hasFacing === true);
    await page.shot("03-right-drag-order", out);

    // Wheel zoom.
    const dist0 = await page.eval(() => window.Anchor.game.controls.dist);
    await page.wheel(cx, cy, -420);
    await page.wheel(cx, cy, -420);
    const dist1 = await page.eval(() => window.Anchor.game.controls.dist);
    report.check("the wheel zooms in", dist1 < dist0 - 1, `${dist0.toFixed(1)} → ${dist1.toFixed(1)}`);
    await page.wheel(cx, cy, 900);
    const dist2 = await page.eval(() => window.Anchor.game.controls.dist);
    report.check("the wheel zooms back out", dist2 > dist1 + 1, `${dist1.toFixed(1)} → ${dist2.toFixed(1)}`);

    // Keys.
    await page.key("Tab");
    await sleep(150);
    const all = await page.eval(() => ({
      sel: window.Anchor.game.selected.length,
      active: window.Anchor.game.units.filter((u) => u.side === 0 && u.isActive).length,
    }));
    report.check("Tab selects the whole army", all.sel === all.active && all.sel > 0, JSON.stringify(all));

    await page.key(" ");
    await sleep(150);
    const paused = await page.eval(() => window.Anchor.game.paused);
    report.check("Space pauses", paused === true);
    await page.shot("04-paused-with-all-selected", out);
    await page.key(" ");
    await sleep(150);
    report.check("Space resumes", (await page.eval(() => window.Anchor.game.paused)) === false);

    const yaw0 = await page.eval(() => window.Anchor.game.controls.yaw);
    await page.holdKey("q", 420);
    const yaw1 = await page.eval(() => window.Anchor.game.controls.yaw);
    report.check("Q rotates the camera", Math.abs(yaw1 - yaw0) > 0.15, `${yaw0.toFixed(2)} → ${yaw1.toFixed(2)}`);

    const tgt0 = await page.eval(() => ({ ...window.Anchor.game.controls.target }));
    await page.holdKey("d", 420);
    const tgt1 = await page.eval(() => ({ ...window.Anchor.game.controls.target }));
    report.check(
      "D pans the camera",
      Math.hypot(tgt1.x - tgt0.x, tgt1.z - tgt0.z) > 3,
      `moved ${Math.hypot(tgt1.x - tgt0.x, tgt1.z - tgt0.z).toFixed(1)}m`,
    );

    auditConsole(page, report, "after driving the controls");
  }

  async function cameraHoldsOnBlur(page, report, site) {
    report.step("the camera holds position when the window loses focus");
    await page.goto(`${site.origin}/index.html?seed=5&t=6`);
    await sleep(500);

    // Park the pointer against the right edge: edge panning should be running.
    await page.moveTo(page.width - 3, Math.round(page.height / 2));
    await sleep(500);
    const panning = await page.eval(() => window.Anchor.game.controls.target.x);
    await sleep(500);
    const panned = await page.eval(() => window.Anchor.game.controls.target.x);
    report.check("edge panning works while focused", Math.abs(panned - panning) > 1, `moved ${(panned - panning).toFixed(2)}m`);

    // Now lose focus without moving the mouse — exactly what alt-tabbing does.
    await page.eval(() => dispatchEvent(new Event("blur")));
    const atBlur = await page.eval(() => window.Anchor.game.controls.target.x);
    await sleep(1200);
    const afterBlur = await page.eval(() => window.Anchor.game.controls.target.x);
    report.check(
      "the camera does not drift while the window is blurred",
      Math.abs(afterBlur - atBlur) < 0.5,
      `drifted ${(afterBlur - atBlur).toFixed(2)}m`,
    );

    // A hidden tab must not accumulate movement either.
    await page.eval(() => {
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
      Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    const atHide = await page.eval(() => window.Anchor.game.controls.target.x);
    await sleep(900);
    const afterHide = await page.eval(() => window.Anchor.game.controls.target.x);
    report.check(
      "the camera does not drift while the tab is hidden",
      Math.abs(afterHide - atHide) < 0.5,
      `drifted ${(afterHide - atHide).toFixed(2)}m`,
    );

    // Focus comes back, but a stale pointer position must not restart the pan on its own.
    await page.eval(() => {
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
      Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
      document.dispatchEvent(new Event("visibilitychange"));
      dispatchEvent(new Event("focus"));
    });
    const atFocus = await page.eval(() => window.Anchor.game.controls.target.x);
    await sleep(700);
    const afterFocus = await page.eval(() => window.Anchor.game.controls.target.x);
    report.check(
      "refocusing alone does not resume edge panning",
      Math.abs(afterFocus - atFocus) < 0.5,
      `drifted ${(afterFocus - atFocus).toFixed(2)}m`,
    );

    // A real pointer move re-arms it.
    await page.moveTo(page.width - 3, Math.round(page.height / 2));
    await sleep(600);
    const afterMove = await page.eval(() => window.Anchor.game.controls.target.x);
    report.check("moving the pointer back to the edge resumes panning", Math.abs(afterMove - afterFocus) > 1);

    // And the pointer leaving the document stops it.
    await page.eval(() => document.dispatchEvent(new PointerEvent("pointerout", { bubbles: true })));
    await page.eval(() => document.dispatchEvent(new Event("mouseleave")));
    const atLeave = await page.eval(() => window.Anchor.game.controls.target.x);
    await sleep(700);
    const afterLeave = await page.eval(() => window.Anchor.game.controls.target.x);
    report.check(
      "the camera stops when the pointer leaves the page",
      Math.abs(afterLeave - atLeave) < 0.5,
      `drifted ${(afterLeave - atLeave).toFixed(2)}m`,
    );
    await page.shot("05-camera-after-blur", out);
  }

  async function combatInvariants(page, report, site) {
    report.step("combat invariants");
    await page.goto(`${site.origin}/index.html?seed=31337`);
    await sleep(500);

    // Two identical duels from the same seed: one hits the front, one hits the back. Casualties are
    // read as accumulated damage rather than whole bodies — a frontal fight between two forty-man
    // blocks takes several seconds to produce its first corpse, which is the point of the game.
    const duel = await page.eval(() => {
      const A = window.Anchor;
      const g = A.game;
      window.__lab = {
        place(u, x, z, facing) {
          u.pos.x = x;
          u.pos.z = z;
          u.facing = facing;
          u.order.x = x;
          u.order.z = z;
          u.order.facing = facing;
          u.order.hasFacing = true;
          const cf = Math.cos(facing);
          const sf = Math.sin(facing);
          for (const s of u.soldiers) {
            s.x = x + s.ox * cf + s.oz * sf + s.wx;
            s.z = z - s.ox * sf + s.oz * cf + s.wz;
            s.face = facing;
            s.faceWant = facing;
          }
        },
        // The distance at which two blocks are touching and separate() leaves them alone.
        gap: (a, b) => a.halfDepth + b.halfDepth - 1.0,
        damage: (u) => u.initial - u.alive + u.killAccum,
        duel(seed, sides) {
          g.seed = seed;
          if (sides) g.startBattle({ seed, names: ["A", "B"], sides });
          else {
            g.seed = seed;
            g.build();
          }
          g.over = true; // no AI, no victory check — this is a laboratory, not a battle
          g.paused = true;
          return g;
        },
      };

      function trial(fromRear) {
        const lab = window.__lab;
        lab.duel(8675309, null);
        const atk = g.units.find((u) => u.side === 0 && u.type === "sword");
        const def = g.units.find((u) => u.side === 1 && u.type === "sword");
        for (const u of g.units) if (u !== atk && u !== def) u.vanish();
        const d = lab.gap(atk, def);
        lab.place(def, 0, 0, 0);
        lab.place(atk, 0, fromRear ? -d : d, fromRear ? 0 : Math.PI);
        const startMorale = def.morale;
        for (let i = 0; i < 90; i++) g.step(1 / 60); // 1.5 seconds
        return {
          damage: lab.damage(def),
          moraleLost: startMorale - def.morale,
          worstFlank: def.worstFlank,
          routed: def.state === "routing",
        };
      }

      return { front: trial(false), rear: trial(true) };
    });
    report.check(
      "a rear attack does far more damage than a frontal one",
      duel.rear.damage > duel.front.damage * 2,
      `front ${duel.front.damage.toFixed(2)}, rear ${duel.rear.damage.toFixed(2)} men killed`,
    );
    report.check(
      "a rear attack is read as a rear attack",
      duel.rear.worstFlank > duel.front.worstFlank && duel.rear.worstFlank >= 2.5,
      `front tier ${duel.front.worstFlank}, rear tier ${duel.rear.worstFlank}`,
    );
    report.check(
      "a rear attack breaks morale far harder than it kills",
      duel.rear.moraleLost > duel.front.moraleLost * 2 && duel.rear.moraleLost > 40,
      `front −${duel.front.moraleLost.toFixed(0)} morale, rear −${duel.rear.moraleLost.toFixed(0)}`,
    );
    report.check(
      "a unit taken in the rear routs long before it dies",
      duel.rear.routed === true,
      `routed=${duel.rear.routed} after ${duel.rear.damage.toFixed(1)} of 40 lost`,
    );

    // A flank hit has to announce itself on screen — this is the whole payoff.
    await page.eval(() => {
      const g = window.Anchor.game;
      g.paused = false;
    });
    await sleep(700);
    const shout = await page.eval(() => {
      const els = [...document.querySelectorAll(".hit-call")];
      return { n: els.length, text: els.map((e) => e.textContent).join(" ") };
    });
    report.check("a flank or rear hit is called out on screen", shout.n > 0, shout.text);
    await page.shot("06-flank-callout", out);

    // A routed unit stops fighting. The Roman attacker comes from the south so that when it breaks
    // it runs away from the enemy rather than through it.
    const rout = await page.eval(() => {
      const g = window.Anchor.game;
      const lab = window.__lab;
      lab.duel(5150, null);
      const atk = g.units.find((u) => u.side === 0 && u.type === "sword");
      const def = g.units.find((u) => u.side === 1 && u.type === "sword");
      for (const u of g.units) if (u !== atk && u !== def) u.vanish();
      const d = lab.gap(atk, def);
      lab.place(def, 0, 0, Math.PI); // facing south, so this is a frontal fight
      lab.place(atk, 0, -d, 0);

      for (let i = 0; i < 240; i++) g.step(1 / 60); // 4 seconds of honest shoving
      const dealtWhileFighting = lab.damage(def);

      atk.state = "routing";
      atk.routTimer = 0;
      const before = lab.damage(def);
      const gap0 = Math.hypot(atk.pos.x - def.pos.x, atk.pos.z - def.pos.z);
      for (let i = 0; i < 120; i++) g.step(1 / 60);
      const gap1 = Math.hypot(atk.pos.x - def.pos.x, atk.pos.z - def.pos.z);
      return {
        dealtWhileFighting,
        dealtWhileRouting: lab.damage(def) - before,
        ranAway: gap1 - gap0,
        stillRouting: atk.state === "routing" || atk.state === "gone",
      };
    });
    report.check(
      "a fighting unit inflicts casualties",
      rout.dealtWhileFighting > 0.5,
      `${rout.dealtWhileFighting.toFixed(2)} men`,
    );
    report.check(
      "a routed unit inflicts none",
      rout.dealtWhileRouting === 0,
      `${rout.dealtWhileRouting.toFixed(3)} inflicted after breaking`,
    );
    report.check("a routed unit runs", rout.ranAway > 3, `opened ${rout.ranAway.toFixed(1)}m`);

    // Zombies invert the rule the rest of the game is built on: they do not break.
    const undead = await page.eval(() => {
      const A = window.Anchor;
      const g = window.Anchor.game;
      const lab = window.__lab;
      if (!A.TYPES.zombie) return { supported: false };
      lab.duel(4242, [
        [{ type: "knight", formations: 1, men: 16 }],
        [{ type: "zombie", formations: 1, men: 60 }],
      ]);
      const atk = g.units.find((u) => u.side === 0);
      const def = g.units.find((u) => u.side === 1);
      lab.place(def, 0, 0, 0);
      lab.place(atk, 0, -lab.gap(atk, def), 0); // straight into the back
      let minMorale = 100;
      let routed = false;
      for (let i = 0; i < 900; i++) {
        g.step(1 / 60);
        if (def.state === "routing") routed = true;
        if (def.state === "gone") break;
        minMorale = Math.min(minMorale, def.morale);
      }
      return {
        supported: true,
        routed,
        minMorale,
        lost: def.initial - def.alive,
        dead: def.state === "gone",
      };
    });
    report.check("zombies exist as a unit type", undead.supported === true);
    if (undead.supported) {
      report.check(
        "zombies taken in the rear never rout",
        undead.routed === false,
        `routed=${undead.routed}, morale floor ${Math.round(undead.minMorale)}`,
      );
      report.check(
        "zombies have to be killed instead",
        undead.lost > 5,
        `${undead.lost} of 60 destroyed by 15s of rear attack`,
      );
    }
  }

  async function restartRebuilds(page, report, site) {
    report.step("the restart button rebuilds a fresh battle");
    // Let the AI command both sides and run the battle out. Stepping it here rather than trusting
    // a fixed ?t= means a stubborn seed cannot leave the assertion hanging: the check is about the
    // result screen, not about how long a particular field takes to decide.
    await page.goto(`${site.origin}/index.html?auto=1&seed=4`);
    const fought = await page.eval(() => {
      const g = window.Anchor.game;
      g.autoPlay = true;
      g.paused = true; // take the clock off the render loop so this is reproducible
      for (let i = 0; i < 900 * 30 && !g.over; i++) g.step(1 / 30);
      return { over: g.over, time: Math.round(g.time) };
    });
    report.check("a battle run out with the AI on both sides decides", fought.over === true, `after ${fought.time}s`);
    await page.waitFor(() => !document.getElementById("result").hidden, 8000, "the result screen");
    await sleep(500);
    const over = await page.eval(() => {
      const g = window.Anchor.game;
      const r = document.getElementById("result");
      return { over: g.over, resultShown: !!r && !r.hidden };
    });
    report.check("a battle played out reaches a result", over.over === true && over.resultShown === true, JSON.stringify(over));
    await page.shot("07-result-screen", out);
    await auditLayout(page, report, "on the result screen");

    const seedBefore = await page.eval(() => window.Anchor.game.seed);
    await page.clickSelector("#restart");
    await sleep(900);
    const fresh = await page.eval(() => {
      const g = window.Anchor.game;
      const r = document.getElementById("result");
      return {
        over: g.over,
        time: g.time,
        seed: g.seed,
        resultShown: !!r && !r.hidden,
        formations: [0, 1].map((s) => g.units.filter((u) => u.side === s && u.state !== "gone").length),
        men: [0, 1].map((s) => g.units.filter((u) => u.side === s).reduce((n, u) => n + u.alive, 0)),
        cards: document.querySelectorAll("#command .card").length,
      };
    });
    report.check("the result screen is dismissed", fresh.resultShown === false);
    report.check("the new battle is not already over", fresh.over === false);
    report.check("the clock restarts", fresh.time < 3, `t=${fresh.time.toFixed(1)}`);
    report.check("a different field is rolled", fresh.seed !== seedBefore);
    report.equal("both armies are back at full strength", JSON.stringify(fresh.men), JSON.stringify([208, 224]));
    report.equal("the command bar is rebuilt", fresh.cards, 6);
    await page.shot("08-after-restart", out);
    auditConsole(page, report, "after restarting");
  }

  async function responsiveLayout(page, report, site) {
    report.step("layout holds at every window size");
    for (const [w, h] of SIZES) {
      await page.setViewport(w, h);
      await page.goto(`${site.origin}/index.html?seed=11&t=25`);
      await sleep(700);
      // Select everything so the busiest possible HUD is on screen.
      await page.key("Tab");
      await sleep(300);
      await page.shot(`09-layout-${w}x${h}`, out);
      await auditLayout(page, report, `${w}×${h}`);
      const wraps = await wrappedText(page, ONE_LINERS);
      report.check(`score text stays on one line at ${w}×${h}`, wraps.length === 0, wraps.join("; "));
    }
    await page.setViewport(1280, 800);
  }

  async function armyBuilder(page, report, site) {
    report.step("the army builder");
    await page.goto(`${site.origin}/index.html?seed=2`);
    await sleep(600);

    await page.clickSelector("#newgame");
    await sleep(350);
    const opened = await page.eval(() => {
      const b = document.getElementById("builder");
      return { open: !!b && !b.hidden, presets: document.querySelectorAll("#builder .preset").length };
    });
    report.check("the New Game button opens the builder", opened.open === true);
    report.check("presets are one click away", opened.presets >= 3, `${opened.presets} presets`);
    await page.shot("10-builder", out);
    await auditLayout(page, report, "with the builder open");

    // Build something specific by hand and check that exactly that spawns.
    const want = await page.eval(() => {
      document.getElementById("builder-detail").open = true;
      const b = window.Anchor.builder;
      b.set({
        sides: [
          [
            { type: "knight", formations: 2, men: 12 },
            { type: "spear", formations: 1, men: 30 },
          ],
          [
            { type: "zombie", formations: 3, men: 50 },
            { type: "ogre", formations: 1, men: 4 },
          ],
        ],
      });
      return b.config();
    });
    await page.shot("11-builder-custom", out);
    await page.clickSelector("#builder-start");
    await sleep(900);

    const got = await page.eval(() => {
      const g = window.Anchor.game;
      return [0, 1].map((s) =>
        g.units
          .filter((u) => u.side === s)
          .map((u) => ({ type: u.type, men: u.initial }))
          .sort((a, b) => (a.type < b.type ? -1 : a.type > b.type ? 1 : a.men - b.men)),
      );
    });
    const expected = want.sides.map((side) => {
      const list = [];
      for (const row of side) for (let i = 0; i < row.formations; i++) list.push({ type: row.type, men: row.men });
      return list.sort((a, b) => (a.type < b.type ? -1 : a.type > b.type ? 1 : a.men - b.men));
    });
    report.equal("the requested composition is what spawns", JSON.stringify(got), JSON.stringify(expected));
    report.check(
      "the builder closes and the battle starts",
      (await page.eval(() => document.getElementById("builder").hidden)) === true,
    );
    await page.shot("12-custom-battle", out);
    await auditLayout(page, report, "in a custom battle");
    auditConsole(page, report, "after a custom battle");

    // Presets have to be instant.
    await page.clickSelector("#newgame");
    await sleep(250);
    await page.clickSelector('#builder .preset[data-preset="monsters"]');
    await sleep(900);
    const monsters = await page.eval(() => {
      const g = window.Anchor.game;
      return {
        types: [...new Set(g.units.map((u) => u.type))].sort(),
        running: !g.over && g.units.length > 0,
        builderClosed: document.getElementById("builder").hidden,
      };
    });
    report.check("a preset starts a battle in one click", monsters.running && monsters.builderClosed, JSON.stringify(monsters));
    report.check("the Monsters preset actually fields monsters", monsters.types.some((t) => t === "ogre" || t === "zombie"), monsters.types.join(","));
    await page.shot("13-monsters-preset", out);
    await auditLayout(page, report, "monsters preset");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
