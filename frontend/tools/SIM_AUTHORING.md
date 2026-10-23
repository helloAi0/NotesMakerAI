# Writing a simulation for Notes Maker AI

Work in /home/claude/nm/frontend. Do NOT edit registry.ts, types.ts, draw.ts, curriculumCatalog.ts, or any existing sim file.
Create only your own new files in src/sims/. Every `export const x = defineSim<S>({...})` is auto-registered (ids must be unique across the whole folder:
`grep -rho "id: '[a-z0-9_]*'" src/sims | sort | uniq -d`).

## Template
Read src/sims/types.ts (SimDef), src/sims/draw.ts (drawing kit: C palette, plot, panel, drawScope/Scope, bars, arrow, circle, line, text, polyline,
fitView, spring, hsl, fmt, niceStep, clamp, gauss, rnd...), and src/sims/school_physics.ts lines 1-100 (a complete example with params,
readouts, equations, assumptions, learningObjectives, covers, tags).

Required fields for every sim: id, title, subject (SimSubject), category, educationLevels (use SCHOOL_*/UG_ENG/UG_SCI/PG_ALL constants or lists),
difficulty, status: 'active', topic, subtopic, covers (2-4 plain curriculum phrases it truly teaches, e.g. "Bode plot", "Mohr's circle"),
tags (exam/course names + synonyms), learningObjectives (2-3), assumptions (1-2 honest model limits), blurb (1-2 sentences, what the student does),
hint (what it models, for an AI tutor), params (3-6 sliders/toggles/selects with sensible ranges), readouts (4+ with units), equations (LaTeX
with the live numbers filled in, 2-3), draw, step, init, plus actions/pointer interaction where natural (drag a point, click to place, buttons).

## Quality rules (the user was burned by fake/broken sims)
- Each sim must really compute what its title says, with correct formulas and units. No placeholders, no random decoration pretending to be physics.
- Draw clearly at both 700x440 and 360x300: axes labelled, key quantity visible, text not overlapping, nothing NaN, resize-safe (use w,h).
- Be genuinely different from the existing sims (check titles with grep before choosing).
- Keep state in S; step uses fixed dt; no allocations that grow without bound; no external libs, no network.
- Security-related sims are small contained educational models only (toy numbers, no tooling for real attacks).

## Checks you must run (and fix until clean)
1. `npx tsx tools/smoke.mts <yourfile-without-ext>`   -> 0 problems
2. `npx tsc -p tsconfig.app.json --noEmit`             -> no errors in your files
3. Look at the pictures: `node tools/sheet.mjs src/sims/<yourfile>.ts /tmp/<name>.png 3 640 380 2` then Read the png.
   Fix anything ugly, clipped, empty or misleading. Re-run until each sim looks right.
Report back: one line per sim (id - what it teaches), and anything you could not make work. Do not git commit.
