# Battle for the Ford

A real-time Roman battle in the browser. Two armies, forty men to a formation, and a morale system
tuned until flanking felt as decisive as it did in *Rome: Total War*.

**Play it: [ryanio.github.io/battle-for-the-ford](https://ryanio.github.io/battle-for-the-ford/)**

No build step. No npm dependencies. three.js from a CDN, everything else hand-written.

## The scenario

**Rome — 208 men in 6 formations. Gauls — 224 in 6.** Rome is outnumbered in the line and has twice
the cavalry. That asymmetry *is* the scenario: you cannot win the shoving match, so you have to use
the horse.

| | beats | loses to |
|---|---|---|
| **Sword** (Hastati, Principes) | spear | cavalry |
| **Spear** (Triarii, Gaesatae) | cavalry | sword |
| **Cavalry** (Equites, Gallic Horse) | sword | spear |

## Controls

| | |
|---|---|
| Left click / drag | Select a unit, or box-select several |
| Right click | Move there |
| **Right drag** | Move *and* set the facing — drag the direction you want them looking |
| `W A S D` / screen edge | Pan |
| `Q` `E` | Rotate camera |
| Wheel | Zoom |
| `Space` | Pause |
| `Tab` | Select everything |

## How the fighting works

Contact is counted man by man through a spatial hash, so damage scales with how many of your soldiers
actually touch the enemy — a wide line that only meets at one corner does almost nothing.

**Angle is everything.** A flank multiplies damage ×2.2 and a rear attack ×3.5, but it multiplies
*morale pressure* far harder: 41 and 85 points, more than a unit accumulates from losing half its
strength. A flanked formation breaks at around 18% casualties. A cavalry charge into the rear breaks
one almost immediately. **Units rout long before they die** — that is the whole feeling.

The rule that turns this from an exploit into a tactic: a unit in melee wheels to face its attacker,
**but only if its front isn't already engaged**. So a flank bonus decays in about four seconds unless
you pin the enemy frontally first. *Pin, then flank* fell out of that single condition rather than
being designed in.

Panic is contagious — every routing friend within 26m adds pressure — so a broken flank cascades into
a whole line collapsing. Battles end in a rout, not mutual annihilation, and run 80–120 seconds.

## A note on the module system

The game files are classic scripts hanging off one `Anchor` global rather than ES modules, and a
single inline module pulls three.js through an import map and publishes it as `window.THREE`.

That is deliberate: **ES modules do not load over `file://`** in Chrome — an opaque origin fails the
CORS check — and this should be playable by double-clicking `index.html`. The cost is one real bug
during development: module-level `new THREE.Matrix4()` scratch objects ran before THREE existed.

## Development

```bash
npx biome check .     # lint and format
python3 -m http.server -d . 8000
```

Or just open `index.html`.

## Credits

Built with [three.js](https://threejs.org). Inspired by *Rome: Total War* (Creative Assembly, 2004) —
this is a homage, not affiliated with or endorsed by anyone who made it.
