# Battle for the Ford

A real-time battle on a reef, in the browser. Two shoals, forty bodies to a formation, and a morale
system tuned until flanking felt as decisive as it did in *Rome: Total War*.

**Play it: [ryanio.github.io/battle-for-the-ford](https://ryanio.github.io/battle-for-the-ford/)**

No build step. No npm dependencies. three.js from a CDN, everything else hand-written.

> The repo is still called `battle-for-the-ford` because it started as a Roman field battle. The ford
> is a reef pass now and the legions are reef guard, but the simulation underneath is the same one,
> line for line and constant for constant. That was the point of the re-theme: change what it looks
> like, change nothing about how it plays.

## The two-second version

Take the rays. Send them round the back. Watch a formation that has lost four of forty break and
scatter into the deep. That is the whole game, and the opening is built to make you feel it before
you have read anything: your rays are already selected, one line names the objective, and an arrow
points at the open water behind the end of the enemy line.

## The scenario

**Coral Court — 208 in 6 formations. Abyssal Tide — 224 in 6.** The Court is outnumbered in the line
and has twice the rays. That asymmetry *is* the scenario: you cannot win the shoving match, so you
have to use the fast things.

## The roster

Three of these are the original triangle. Three were added with the muster sheet, and each bends the
triangle rather than extending it.

| | | beats | loses to |
|---|---|---|---|
| **Reef Guard** | shell and blade — the line | Urchins | Nautili |
| **Urchins** | a wall of spines; anything that charges it comes off the points | Nautili | Reef Guard |
| **Rays** | fast enough to get behind anything | Reef Guard | Urchins |
| **Nautili** | shell-armoured rays, the best charge in the game | Reef Guard | Urchins |
| **Leviathans** | six models, each worth a file | Drowned | Urchins |
| **Drowned** | numerous, feeble, and they *do not rout* | Rays | Leviathans |

Those two columns are exchange rates, not raw multipliers — how hard I hit you over how hard you hit
me. Reef guard have their biggest number against the drowned, but the drowned barely hit back, and
the fight a reef guard player actually wants is the one against urchins.

Two of the new three carry a mechanic rather than a stat line:

- **Nautili** are the only thing in the game that tires. `fatigue` bleeds their attack down to under
  half if you leave them locked in a brawl for half a minute, so their charge is a window, not a
  position. Nothing else fatigues at all — the original three fight at full strength forever, which
  is how they were tuned, and it was deliberately left alone.
- **The Drowned** are `fearless`. Morale never moves, so a rear attack on them is worth ×3.5 damage
  and exactly nothing else. The rule the whole game rests on stops working and you have to kill all
  of them, which is a genuinely different battle.

**Leviathans** are the third: six models, each hitting like a file, which means they punch holes but
cannot hold a frontage. Too few bodies to make contact with, and contact is what scales damage.

## Formations as collectibles

Every formation has a name, a type, a **rarity tier** and a couple of **traits**, and it keeps a
record of what it did in this battle — killed, flanks landed, rear hits, enemies broken. Select one
and its card is on the right; <kbd>C</kbd> hides it.

The rule that keeps this honest is that rarity has to buy something real, and it does. A tier grants
traits, and a trait is a live modifier on the same numbers everything else uses — *Braced* is +18%
defence, *Long-Spined* is +0.4m reach, *Tireless* takes a nautilus's fatigue away entirely. Traits
are rolled from the formation's own seed, so the same formation always has the same sheet.

| tier | traits | attack & defence |
|---|---|---|
| Common | — | ×1.00 |
| Uncommon | 1 | ×1.04 |
| Rare | 2 | ×1.08 |
| Epic | 3 | ×1.12 |
| Legendary | 3 | ×1.18 |

Common is the default and has nothing, which is why the hand-placed scenario is numerically identical
to the one that shipped before any of this existed.

**There is no onchain anything here.** No wallet, no mint, no token, no web3 library, no npm
dependency of any kind. This borrows the *shape* of a collection — a roster you pick from, a tier, a
trait sheet, a record of provenance — because that shape happens to be a good way to make a unit's
capabilities legible in a game. That is the whole of it, and it is meant to stay that way.

## New battle

**New battle** opens the muster sheet. Three presets start a battle in one click — **Classic** (the
scenario above), **Horde** (a reef watch against 168 drowned who will not break), **Monsters**
(leviathans and nautili on both sides) — and behind a disclosure triangle there is a roster of cards
to tap, with rarity, formation count and size per row. Nobody has to fill in a form to play: the game
still boots straight into the reef pass.

Balanced with the same `?auto=1` rig the original was, 16 seeds each, AI commanding both sides:

| preset | first shoal wins | mean length | stalemates at 240s |
|---|---|---|---|
| Classic | 75% | 95s | 1 |
| Horde | 50% | 222s | 8 |
| Monsters | 63% | 144s | 4 |

Classic is bit-for-bit what it always was — same win rate, same length, same survivor counts as
before any of this was added, checked against a pristine checkout. Horde runs long on purpose:
nothing on the other side routs, so the battle only ends when the last of them is dead.

## Controls

Behind the **Controls** button, or <kbd>?</kbd>. They are not in your face at the start.

| | |
|---|---|
| Left click / drag | Select a formation, or box-select several — or click its card in the bottom bar |
| Right click | Move there |
| **Right drag** | Move *and* set the facing — drag the direction you want them looking |
| `W A S D` / screen edge | Pan |
| `Q` `E` | Rotate camera |
| Wheel | Zoom |
| `Space` | Pause |
| `Tab` | Select everything |
| `C` | The selected formation's card |

## How the fighting works

Contact is counted body by body through a spatial hash, so damage scales with how many of yours
actually touch the enemy — a wide line that only meets at one corner does almost nothing.

**Angle is everything.** A flank multiplies damage ×2.2 and a rear attack ×3.5, but it multiplies
*morale pressure* far harder: 41 and 85 points, more than a formation accumulates from losing half
its strength. A flanked formation breaks at around 18% casualties. A charge into the rear breaks one
almost immediately. **Formations rout long before they die** — that is the whole feeling.

The rule that turns this from an exploit into a tactic: a formation in melee wheels to face its
attacker, **but only if its front isn't already engaged**. So a flank bonus decays in about four
seconds unless you pin the enemy frontally first. *Pin, then flank* fell out of that single condition
rather than being designed in.

Panic is contagious — every routing friend within 26m adds pressure — so a broken flank cascades into
a whole line collapsing. Battles end in a rout, not mutual annihilation, and run 80–120 seconds.

Depth still cuts both ways: the reef shelves and the channel through the middle are the old hills and
the old ford, and holding the shallow side is worth a few percent in the melee exactly as it was.

## Reading the battle

The layout is lifted from *Rome: Total War*, because that game solved this. A bar of cards along the
bottom, one per formation, each with a type sigil, a strength bar that drains, a morale strip that
turns amber and starts flashing *before* the formation breaks rather than after, and a hairline of
rarity down its left edge. Click a card to select it. Above them, one line saying what is selected,
what it eats, what eats it, and whether it is currently winning. A minimap on the right, a running
log on the left.

And when a flank lands the game says so, loudly, in the water: **FLANKED ×2.2** or **REAR ×3.5**
floating over the formation taking it, a line in the log, and a full-screen shout when something
breaks.

The colour is the Anchor palette from `~/Projects/anchor/theme/tokens.css` — deep water, ocean cyan
as the primary, coral as the sparing counterpoint. The two shoals *are* that reef pairing, so the
factions and the brand are the same idea.

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
it. It checks four kinds of thing:

- **Geometry.** Every pair of HUD panels, compared by `getBoundingClientRect()`, at four window
  sizes; text nodes that occupy more than one *line* when they should occupy one (counting distinct
  line tops, because `text-overflow: ellipsis` also splits a range into two rects and that is not a
  wrap); panels whose edges leave the viewport; any console error. All three bugs this was first
  written for — a top bar underneath the orders panel, "208 / 208" wrapping onto two lines, and a
  camera that ran away when the window lost focus — are invisible to any assertion about game state
  and obvious in geometry.
- **The simulation.** Two identical duels from the same seed, one hitting the front and one the back,
  asserting the rear does multiples of the damage and far more than multiples of the morale. That a
  routed formation stops killing and runs. That the drowned, hit in the back, never rout and have to
  be killed. That the documented 208 and 224 are what actually spawns.
- **The collectibles.** That a common formation rolls nothing and a legendary rolls three traits,
  that a tier moves real numbers rather than a label, that the same formation always rolls the same
  sheet, and that the hand-placed scenario is all common and carries no traits at all.
- **The interface and the water.** That the objective and the flank arrow are on screen at the start
  with the controls collapsed; that a preset starts a battle in one click; that tapping a roster card
  adds that formation and that a hand-built shoal spawns exactly what it was asked for; that **Fight
  again** rebuilds a whole fresh battle; and that the caustics are actually crawling and the marine
  snow is actually falling.

## Credits

Built with [three.js](https://threejs.org). Inspired by *Rome: Total War* (Creative Assembly, 2004) —
this is a homage, not affiliated with or endorsed by anyone who made it.
