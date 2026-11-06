# Notes Maker AI

[![CI](https://github.com/helloAi0/NotesMakerAI/actions/workflows/ci.yml/badge.svg)](https://github.com/helloAi0/NotesMakerAI/actions/workflows/ci.yml)

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

## Click-to-speak, dictation and handwriting (all offline)
- **Click any word** in the notes (Read mode; typed, dictated or AI-generated) and reading starts at exactly that word; **highlight** text to read from the highlighted start. Clicking beside, below or between words does nothing, and the typing box never speaks. Toggle: *Voice → Click-to-speak*.
- **Handwriting:** Draw tab → *Recognise handwriting* (local tesseract.js engine, files copied to `frontend/public/ocr` by `npm install`/`npm run dev`). Then in Read mode click any handwritten word to hear from there, or *To typed text*. Accuracy is best for neat print-style letters; cursive is unreliable.
- **Dictation** streams words into the editor live and applies spoken formatting ("new line", "bullet", "heading …", "full stop").

## FRIDAY: the built-in assistant and agent

FRIDAY lives in the round button (Alt+A) on every screen and as a full chat page ("FRIDAY Assistant" in the sidebar). It has two jobs, both offline:

* **Agent**: it operates the app from typed or spoken commands, chained with `->`, "then" or "and". Examples:
  `Open AI segmentation -> go to the image processing module -> set model to U-Net -> run simulation`,
  `write a note about Fourier series`, `summarize my pdf thermodynamics`, `create folder Physics`,
  `move thermodynamics to folder Physics`, `import folder` (opens the file chooser), `add task revise optics by Friday`,
  `what is due this week`, `mark revise optics done`, `add the summary to my notebook`, `open settings`.
* **Study helper**: ask any study question or "how do I ... in this app". Answers come from a built-in STEM glossary, the app guide, all simulations, your notes and your PDFs (BM25 retrieval, sources shown). It also has a calculator (`12*7+sqrt(2)`). Add an AI key in Settings (Gemini, OpenAI, Anthropic, OpenRouter or a custom/Ollama endpoint) and it answers anything with a language model, grounded in your material; without a key it says honestly when something is outside its built-in knowledge.

Other screens: Dashboard (streak, activity, tasks), Study Planner, AI Note Generator (offline from built-in knowledge, or AI), global search (Ctrl+K), Settings (AI key, backup/restore), PWA install and a full offline cache.

Tests: `npx tsx tools/friday.mts`, `npx tsx tools/intents.mts`, and with `npx vite preview --port 5300` running: `BASE=http://127.0.0.1:5300 node tools/e2e_friday.mjs` (needs sample PDFs in `PDFDIR`, default `/tmp/pdfs`).

## Voice matrix, FRIDAY tracks and new simulations
- **Click-to-speak** reads only when you click directly on a word in Read mode; the typing box never speaks.
- **Edit pane** has a Dictate mic, a Read Page button and the Voice Modulation Matrix (English, Hindi, Arabic, Marathi, French, German; male/female; deep or melodic).
- **FRIDAY** is the single assistant (no separate bots). It chats, explains and derives maths/science, writes code, operates the app and a virtual file system, remembers facts about you, and learns answer styles from your 👍/👎. See "FRIDAY" below.
- **Play** auto-sweeps one parameter on static simulations so something always moves.
- New sims: Black–Scholes + Greeks, bullwhip, Nash equilibrium, DNA alignment, particle-filter localisation with LiDAR, planar quadcopter, 6-DOF arm FK/IK, Red-Black tree, Q-learning, Raft, ZK 3-colouring demo, traffic anomaly detector, CMOS inverter, Carnot cycle, NMR/IR, Ising, N-body, lattice-Boltzmann flow.
- Tests: `npx tsx tools/{intents,fmt,friday,logic_cs,logic_sci,fuzz}.mts`, then e2e scripts against `vite preview`.

## FRIDAY (one assistant)
Open it from the sidebar or the floating button (Alt+A). Tabs: **Chat · Files · Memory · Learning · Map · Brain**.

- **Brain order:** local model (Ollama / vLLM / LM Studio / llama.cpp on your computer) → cloud API key from Settings → built-in offline engine (STEM knowledge + your notes/PDFs, says so when it does not know). The ONLINE/OFFLINE switch in the header controls cloud and Wikipedia use. Wikipedia recall is off unless you say "search the web …" or enable it in Brain.
- **Local model setup (works with no internet):**
  `ollama pull llama3.1` then `OLLAMA_ORIGINS=* ollama serve` (vLLM: `vllm serve <model> --allowed-origins '["*"]'`). In the app: FRIDAY → Brain → *Find local model*.
- **Jarvis actions:** e.g. "Friday, go to folder Inbox, capture the document there, move it into the PDF processing section, and generate a summary report". FRIDAY writes a JSON plan (viewable), runs it step by step with live status on the virtual file system (IndexedDB; folders /Documents /Inbox /PDF Processing /Reports /Captures /Notes /Trash; your PDF library is mounted at /PDF Library) and stops honestly at the first failing step. Deleting moves files to /Trash.
- **Voice:** mic button streams speech into FRIDAY (English, Hindi, Arabic, Marathi, French, German selectable), spoken replies, hands-free conversation mode. The notebook toolbar has dictation into the text cursor and Read mode click-to-read from any word.
- **Learning (reinforcement):** a softmax policy per question type chooses the answer style (concise, step-by-step, worked example, formal, analogy). 👍, 👎 (+reason), regenerate and copy are rewards; REINFORCE with a baseline updates it. Facts you tell it are stored in Memory (this browser only).
- **Clustering:** your notes, PDFs, files, sims and past questions are embedded (TF-IDF), grouped by spherical k-means (k by silhouette) and projected with PCA in the Map tab; the nearest cluster focuses answers.
- **Honest scope:** this is not true AGI. It is a language model (yours, local or cloud) plus tools, memory, a learned answer style and a critic. Without a connected model, open-ended conversation is limited to the offline engine.

## Commands
```
cd frontend && npm install
npm run dev                    # development
npm run build && npx vite preview --port 5300 --host 127.0.0.1
npx tsc --noEmit -p tsconfig.app.json && npm run lint
npm run test:unit              # logic, FRIDAY plan/VFS/memory/RL/clustering
BASE=http://127.0.0.1:5300 npm run test:e2e   # needs the preview server above and Playwright
npx tsx tools/fuzz.mts         # every simulation x parameter combinations
```

## Lecture to Notes (Phase 9)

Sidebar → **Lecture to Notes**. Paste a YouTube link and the lecture transcript (YouTube ⋯ → Show transcript → copy, or load an `.srt`/`.vtt`/`.txt` file). The app keeps timestamps, splits the lecture into topic sections (lexical cohesion), and writes a summary, key points, formulas (written or spoken, e.g. "delta U equals Q minus W" → `ΔU = Q − W`), definitions and key terms. Clicking a timestamp seeks the embedded player; the active section follows the video. Save to Notebook, copy, download `.md`, or *Improve with AI* (your own key). All analysis runs on the device; only the video embed needs internet. Browsers cannot fetch YouTube transcripts directly (CORS), so the transcript is pasted or loaded from a file.

## Study Studio (eight tools for Indian students)
Open **Study Studio** in the sidebar.
1. **Bhasha**: upload a PDF or paste text, get notes (or a faithful translation) in Hindi, Marathi, Bengali, Tamil or Telugu. Technical terms, formulas and units are masked before the model sees them and restored after, and the app reports how many were kept. Listen with your device's voice. Buttons switch language; the rest of the app UI is English.
2. **Exam engines**: CBSE (step marking), JEE Main/Advanced, NEET, UPSC, GATE note styles and practice questions. No past papers are bundled: paste your own previous-year questions and it finds repeating topics and question types in that sample.
3. **Handwriting → LaTeX**: photo of a notebook page → LaTeX (checked with KaTeX, editable) and clickable flowcharts/circuit-style diagrams. Needs a vision-capable model.
4. **Voice tutor**: narrates notes; press the mic (or type) “Wait, explain that enthalpy part again with an easier example” and that part is rewritten and spoken. Also: pause, continue, next, back, slower, faster, stop.
5. **Code visualizer**: Python (classes, lists, dicts, loops, recursion) in a safe built-in interpreter with a step-by-step memory/pointer view. C++ is translated to Python by AI first (review it).
6. **Swipe recall**: swipe/drag/arrow keys; forgotten cards return tomorrow 8:00.
7. **Notes marketplace** and 8. **Chat bot**: need the server in `server-api/` (see its README). UPI payments are direct creator-to-buyer with manual confirmation; no real payment processing.

Tests: `npm run test:unit`, `npm run test:e2e` (includes `e2e_studio.mjs`, which runs the real server), `npm run test:server`.

### Audit notes (what was found and fixed after the first release of Study Studio)
- **Bhasha:** model output with Indic digits in term markers (⟦१⟧) was not restored; place and person names were frozen in English; whitespace around protected terms was lost; huge PDFs were sent in full (now capped at 30,000 characters with a visible notice); added Stop; scanned PDFs get an explanation; speech reads sentence by sentence (long text cut off before) and stops when you leave the tab.
- **Exam engines:** unusable AI replies now show an error instead of an empty list.
- **Handwriting:** `null`/array replies crashed the parser; slow photos could overwrite a newer scan; HEIC photos get a clear message.
- **Voice:** a late end-of-speech event could skip sentences; word matching broke Hindi (combining vowel signs); markdown symbols were read aloud; a second request while thinking was interleaved; added a few Hindi commands.
- **Code visualizer:** added f-strings, list comprehensions, keyword arguments, `global`, `any/all`, `key=`/`reverse=`; `+=` on lists now mutates in place like Python; large lists are capped per step; parser could crash on malformed code (found by fuzzing 30,000 mutated programs; now 0 crashes); the final step points at the failing line; Play restarts at the end.
- **Swipe:** added Undo.
- **Marketplace:** rights confirmation required; purchase status (pending/rejected) shown; reports need a 24-hour-old account and are rate-limited (stops brand-new accounts from mass-reporting a rival); expired sign-in is handled.
- **Bot:** group chats are refused (anyone in a group could otherwise write to a linked user's inbox); code guessing is throttled per chat; Unlink and link status; WhatsApp webhook server included; the planner syncs in the background (every 5 minutes and on focus) once signed in.
