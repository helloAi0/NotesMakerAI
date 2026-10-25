# Notes Maker AI

Digital notebook with voice (dictation, equation dictation, read-aloud from any sentence), AI notes, a PDF library and a
Visuals Studio with 100+ interactive STEM simulations (Class 8 to postgraduate) and an honest curriculum-coverage view.

## Run it (Windows PowerShell, macOS, Linux)
```
cd frontend
npm install
npm run dev
```
Open the address it prints (usually http://localhost:5173). The microphone only works on `localhost` or HTTPS; use Chrome or Edge for dictation.
Add your own AI key inside the app's settings. Never commit keys.

## Checks
| Command | What it does |
|---|---|
| `npm run typecheck` | TypeScript, no emit |
| `npm run smoke -- <sims-file>` | numeric smoke test of one sims file, e.g. `npm run smoke -- ug_mech` |
| `npm run fuzz` | all simulations x extreme/random sliders, tiny to huge canvases, bad pointer input |
| `npm run build` | production build (screens are code-split) |
| `npm run check` | typecheck + fuzz + build |
| `npm run test:e2e` | browser tests (start `npm run dev -- --port 5199` first, run `npx playwright install chromium` once; set `BASE=http://localhost:PORT` for another port) |

Adding a simulation: see `frontend/tools/SIM_AUTHORING.md`. Export `defineSim({...})` from a new file in `src/sims/`; it is registered automatically.
