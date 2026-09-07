#!/usr/bin/env node
/**
 * Balance sweep. Plays every preset out with the AI commanding both sides, across a spread of
 * seeds, and prints win rates and battle lengths.
 *
 *   node qa/balance.mjs                 all presets, 16 seeds each
 *   node qa/balance.mjs horde 24        one preset, 24 seeds
 *
 * This is the same rig the original scenario was tuned with; the new unit types were balanced
 * against it rather than by eye.
 */
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { launch, serve } from "./harness.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const only = process.argv[2] && !/^\d+$/.test(process.argv[2]) ? process.argv[2] : null;
const count = Number(process.argv.find((a, i) => i > 1 && /^\d+$/.test(a))) || 16;
const CAP = 240; // seconds of simulated time before a battle is called a stalemate

const site = await serve(root);
const page = await launch({ width: 900, height: 600 });
await page.goto(`${site.origin}/index.html?seed=1&t=1`);

const presets = await page.eval(() => Object.keys(window.Anchor.PRESETS));
const rows = [];

for (const preset of only ? [only] : presets) {
  const results = [];
  for (let i = 0; i < count; i++) {
    const seed = 1000 + i * 7919;
    results.push(
      await page.eval(
        (name, s, cap) => {
          const A = window.Anchor;
          const g = A.game;
          g.startBattle({ ...A.PRESETS[name], seed: s });
          g.autoPlay = true;
          g.paused = true;
          const dt = 1 / 30;
          let t = 0;
          while (!g.over && t < cap) {
            g.step(dt);
            t += dt;
          }
          const left = [0, 1].map((k) => g.units.filter((u) => u.side === k && u.isActive).length);
          const men = [0, 1].map((k) =>
            g.units.filter((u) => u.side === k && u.isActive).reduce((n, u) => n + u.alive, 0),
          );
          return { t, a: left[0], b: left[1], men, start: g.startingMen };
        },
        preset,
        seed,
        CAP,
      ),
    );
  }
  const decided = results.filter((r) => r.a === 0 || r.b === 0);
  const wins = results.filter((r) => r.b === 0 && r.a > 0).length;
  const stale = results.length - decided.length;
  const mean = (f) => results.reduce((n, r) => n + f(r), 0) / results.length;
  rows.push({
    preset,
    n: results.length,
    winA: `${((wins / results.length) * 100).toFixed(0)}%`,
    stalemates: stale,
    seconds: mean((r) => r.t).toFixed(0),
    survivors: `${mean((r) => r.men[0]).toFixed(0)} v ${mean((r) => r.men[1]).toFixed(0)}`,
    started: `${results[0].start[0]} v ${results[0].start[1]}`,
  });
}

console.table(rows);
await page.close();
await site.close();
