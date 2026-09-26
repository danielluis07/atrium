# Scene performance on the dev machine

Tools for measuring the live Scene's GPU cost on the dev machine: a Ryzen 7 3700U laptop with a Radeon Vega 10 iGPU and 5.9 GB of RAM, running Windows through ANGLE D3D11. The Vega is the low-end desktop the render-tier ladder is tuned against (`DESIGN.md` § Render tiers). Every script opens the Scene in a headed Chromium at 1600×900 with vsync, and times the GPU with `EXT_disjoint_timer_query_webgl2`. Outputs go to `scripts/perf/out/`, which is gitignored.

## Which check an issue needs

| Change | Check | Time |
|---|---|---|
| Any change to a House or its bake | The download budget in `bun test` | none |
| New or reworked furniture, rooms or other geometry | **Probe**, 2–3 loads: the change's own draws | ~10 min |
| Full-screen passes, the ladder, the rung monitor, shaders on large surfaces | **Frames**, paired builds; add **settle** when the question is which rung the Scene ends on | 30–60 min |

The probe is the default. On the Vega, whole-frame time between builds swings by several ms from run to run, with the GPU's temperature and its whole-frame slow spells (#62), so a 1 ms whole-frame difference needs 7–12 alternating pairs to see. A change's own draws barely move with that, and 2–3 loads give a stable number. The four hero Interiors, for example, cost 0.12 ms together at the overview (#65).

## Before measuring

- **No bake running**, and no second measurement. A bake starves Chrome and roughly doubles iGPU frame times through the shared memory.
- **Build first:** `bun run build` in each checkout being measured. For `main`, a worktree such as `/c/tmp/atrium-main`.
- **One server at a time:** `sh scripts/perf/serve.sh start <dir>` / `stop`. Two `next start` servers plus a headed Chromium run the machine out of memory.
- **Cold or warm:** the first run after 5 idle minutes is cold. After a few loads the GPU is warm, and the rung-4 overview drifts from about 16 to about 21 ms. Say which one each number is.
- **Keep the Chromium window visible.** Chrome pauses rAF in an occluded window.

## Probe: the per-pass breakdown

```sh
sh scripts/perf/serve.sh start .
bun scripts/perf/probe.ts --label branch --select Lyngen            # rung 4, the ?scene=lean override
bun scripts/perf/probe.ts --label branch --select Lyngen --rung 6   # rung 6, via the session's remembered rung
bun scripts/perf/report.ts probe
sh scripts/perf/serve.sh stop
```

- At each camera, one load records a whole-frame window and a per-draw window. Every draw, clear and blit gets its own timer query, grouped by framebuffer and shader program.
- `stats.ts` (`scenePart`) names the Scene part each program belongs to. Give a new material a line there, or it is counted as "other".
- The per-draw sum runs about 1 ms over the whole frame.
- **In a pass bar**, compare the change's own part (for example "Interiors") against `main`'s. Also check that the whole-frame p50 moved by no more than the part's own gain.

**In-page A/B.** Some changes can be tried inside the page without a build; these are listed in `TOGGLES` in `scene-page.ts`. For those, `--toggle <name>` runs whole-frame windows in ABBA order within one load, so both sides share one thermal state (#65: `depth-resolve`, 13 of 13 pairs agreeing). Add a toggle when a change can be faked from the WebGL calls.

## Frames: two builds compared

```sh
sh scripts/perf/pairs.sh /c/tmp/atrium-main main . branch 7 scripts/perf/out/frames4.jsonl --select Lyngen
sh scripts/perf/pairs.sh /c/tmp/atrium-main main . branch 12 scripts/perf/out/frames6.jsonl --select Lyngen --rung 6
bun scripts/perf/report.ts frames scripts/perf/out/frames4.jsonl --a main --b branch
```

This is the method of #57 / #59.

- **The rung is held** by slowing `performance.now()`, the clock the rung monitor reads. Rungs below 4 are held from the first frame by presetting the session's remembered rung.
- **The window:** 15 s at the overview and 15 s at the selected camera.
- **Order:** the builds alternate A B, B A, …, because the first run after an idle spell is about 3 ms faster whichever build it is.
- **The report** gives paired deltas and a sign-flip p. Treat a gap with p above about 0.05 as not separated from the GPU's state, and look at the p50s too: the p90 at rung 6 is bimodal.

## Settle: where the Scene ends up

```sh
bun scripts/perf/settle.ts --label cold1   # after 5 idle minutes
bun scripts/perf/report.ts settle
```

A fresh load with no `?scene=` override and no remembered rung, like a visitor's. It logs the rung and the rAF p50/p90 every second for 45 s. Use 3 cold and 3 warm runs.

## When a driver is stopped

When memory runs low, Claude Code stops background shells, and the loop inside can outlive its shell. It keeps a Chromium and the server running, and a restarted driver would run alongside them (#63, #65). **Before starting again**, run `sh scripts/perf/reap.sh`. It stops the leftover processes, clears `drive.lock` and prints free memory. Then drop any `{"error":true}` or partial lines, and rerun only the missing pairs in their original order.

Runs under about 10 minutes can go in the foreground, where the low-memory reaper doesn't stop them.
