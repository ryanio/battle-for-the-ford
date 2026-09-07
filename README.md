# Battle for the Ford

A real-time Roman battle in the browser. Two armies, forty men to a formation, and a morale system
tuned until flanking felt as decisive as it did in *Rome: Total War*.

**Play it: [ryanio.github.io/battle-for-the-ford](https://ryanio.github.io/battle-for-the-ford/)**

No build step. No npm dependencies. three.js from a CDN, everything else hand-written.

## The two-second version

Pick up the horse. Send it round the back. Watch a formation that has lost four men out of forty
throw down its shields and run. That is the whole game, and the opening is built to make you feel it
before you have read anything: your cavalry is already selected, one line names the objective, and an
arrow points at the empty ground behind the end of the enemy line.

## The scenario

**Rome — 208 men in 6 formations. Gauls — 224 in 6.** Rome is outnumbered in the line and has twice
the cavalry. That asymmetry *is* the scenario: you cannot win the shoving match, so you have to use
the horse.

## The units

Three of these are the original triangle. Three were added with the army builder, and each one bends
the triangle rather than extending it.

| | | beats | loses to |
|---|---|---|---|
| **Swords** | Hastati, Warbands — the line | Spears | Knights |
| **Spears** | Triarii, Gaesatae — braced, and horse dies on the points | Knights | Swords |
| **Horse** | Equites — fast enough to get behind anything | Swords | Spears |
| **Knights** | armoured horse, the best charge in the game | Swords | Spears |
| **Ogres** | six models, each worth a file of men | Undead | Spears |
| **Undead** | numerous, feeble, and they *do not rout* | Horse | Ogres |

Those two columns are exchange rates, not raw multipliers — how hard I hit you over how hard you hit
me. Swords have their biggest number against the undead, but the undead barely hit back, and the
fight a sword player actually wants is the one against spears.

Two of the new three carry a mechanic rather than a stat line:

- **Knights** are the only unit in the game that tires. `fatigue` bleeds their attack down to under
  half if you leave them locked in a brawl for half a minute, so their charge is a window, not a
  position. Nothing else fatigues at all — the original three fight at full strength forever, which
  is how they were tuned, and it was deliberately left alone.
- **Undead** are `fearless`. Morale never moves, so a rear attack on them is worth ×3.5 damage and
  exactly nothing else. The rule the whole game rests on stops working and you have to kill all of
  them, which is a genuinely different battle.

**Ogres** are the third: only six models, each hitting like a file, which means they punch holes but
cannot hold a frontage. Too few bodies to make contact with, and contact is what scales damage.

## New battle

**New battle** opens the muster sheet. Three presets start a battle in one click — **Classic** (the
scenario above), **Horde** (a legion against 168 undead who will not break), **Monsters** (ogres and
knights on both sides) — and behind a disclosure triangle you can set the types, the number of
formations and the number of men in each, per side. Nobody has to fill in a form to play: the game
still boots straight into the classic scenario.

Balanced with the same `?auto=1` rig the original was, 16 seeds each, AI commanding both sides:

| preset | first army wins | mean length | stalemates at 240s |
|---|---|---|---|
| Classic | 75% | 95s | 1 |
| Horde | 50% | 222s | 8 |
| Monsters | 63% | 144s | 4 |

Classic is bit-for-bit what it always was — same win rate, same length, same survivor counts as
before any of this was added. Horde runs long on purpose: nothing on the other side routs, so the
battle only ends when the last of them is dead.

## Controls

Behind the **Controls** button, or <kbd>?</kbd>. They are not in your face at the start.

| | |
|---|---|
| Left click / drag | Select a unit, or box-select several — or click its card in the bottom bar |
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

## Reading the battle

The HUD is lifted from *Rome: Total War*, because that game solved this. A bar of cards along the
bottom, one per formation, each with a type sigil, a strength bar that drains and a morale strip that
turns amber and starts flashing *before* the unit breaks rather than after. Click a card to select
it. Above them, one line saying what is selected, what it eats, what eats it, and whether it is
currently winning. A minimap on the right, a running log on the left.

And when a flank lands the game says so, loudly, on the field: **FLANKED ×2.2** or **REAR ×3.5**
floating over the formation taking it, a line in the log, and a full-screen shout when something
breaks.

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
node qa/play.mjs      # play the game headlessly and assert on what happens
node qa/balance.mjs   # win rates across seeds, for tuning
```

Or just open `index.html`.

`noAssignInExpressions` is disabled in `biome.json`: every file uses the
`(window.Anchor = window.Anchor || {})` namespace idiom, which is the whole point of the
classic-script architecture described above. Rewriting it nine times to satisfy a rule that is wrong
about this code would be noise.

### The QA harness

`qa/play.mjs` serves the repo, opens it in a headless Chromium over the DevTools Protocol, and plays.
No npm dependencies — Node has `fetch` and `WebSocket`, and CDP is JSON over a socket. It drives real
input (mouse press/move/release for box-select, right-drag for orders, the wheel for zoom, key events
for pan and pause), screenshots every checkpoint into `qa/out/`, and exits non-zero so CI can gate on
it. It checks three kinds of thing:

- **Geometry.** Every pair of HUD panels, compared by `getBoundingClientRect()`, at four window
  sizes; text nodes that occupy more than one line box when they should occupy one; panels whose
  edges leave the viewport; any console error. All three bugs this was first written for — a top bar
  underneath the orders panel, "208 / 208" wrapping onto two lines, and a camera that ran away when
  the window lost focus — are invisible to any assertion about game state and obvious in geometry.
- **The simulation.** Two identical duels from the same seed, one hitting the front and one the back,
  asserting the rear does multiples of the damage and far more than multiples of the morale. That a
  routed unit stops killing and runs. That the undead, hit in the back, never rout and have to be
  killed. That the documented 208 and 224 are what actually spawns.
- **The interface.** That the objective and the flank arrow are on screen at the start and the
  controls are collapsed; that a preset starts a battle in one click; that a hand-built army spawns
  exactly the composition it was asked for; that **Fight again** rebuilds a whole fresh battle.

## Credits

Built with [three.js](https://threejs.org). Inspired by *Rome: Total War* (Creative Assembly, 2004) —
this is a homage, not affiliated with or endorsed by anyone who made it.
