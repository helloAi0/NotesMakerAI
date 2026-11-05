/* Company facts shown in the app (pricing, roadmap, investor brief). Plain data: edit here, not in the UI.
   Status words are honest: "live" = works in this app today, "planned" = not built yet. */
export type Status = 'live' | 'partial' | 'planned';
export interface Tier { id: string; name: string; price: string; for: string; features: { text: string; status: Status }[] }
export const PRICING_NOTE = 'Prices are proposals to test with pilot users. No payment system is connected yet, so nothing can be bought today.';
export const PRICING: Tier[] = [
  { id: 'free', name: 'Free', price: '₹0', for: 'Any student', features: [{ text: 'Offline AI tutor (FRIDAY) with cited answers', status: 'live' }, { text: '177 interactive simulations', status: 'live' }, { text: 'Flashcards, spaced repetition, mock exams, progress graph', status: 'live' }, { text: 'Your own AI key or local model (Ollama)', status: 'live' }, { text: 'Data stays on your device', status: 'live' }] },
  { id: 'student', name: 'Student Plus', price: '₹149 / month (proposed)', for: 'Serious exam preparation', features: [{ text: 'Everything in Free', status: 'live' }, { text: 'Hosted AI so no key is needed', status: 'planned' }, { text: 'Encrypted cloud sync across devices', status: 'planned' }, { text: 'Encrypted file backup', status: 'live' }, { text: 'Priority new subjects and plugins', status: 'planned' }] },
  { id: 'inst', name: 'Institution', price: '₹99 / student / month (proposed)', for: 'Colleges and coaching institutes', features: [{ text: 'Course packs from a syllabus', status: 'live' }, { text: 'Class dashboard from student report files', status: 'live' }, { text: 'Pilot kit with before/after statistics', status: 'live' }, { text: 'Accounts, class membership and live dashboard', status: 'planned' }, { text: 'Single sign-on, admin console, support SLA', status: 'planned' }] },
];
export interface RoadItem { when: string; title: string; status: Status; note?: string }
export const ROADMAP: RoadItem[] = [
  { when: 'Shipped', title: 'FRIDAY multi-agent tutor with citations, verification and a 50-question evaluation', status: 'live' },
  { when: 'Shipped', title: 'Student model: knowledge graph, learning-outcomes numbers, spaced repetition', status: 'live' },
  { when: 'Shipped', title: 'Predict-run-explain simulation tutoring, mock exams, photo and typed solution checking, lab-report coach', status: 'live' },
  { when: 'Shipped', title: 'Course packs, class dashboard, pilot kit, study rooms, plugin system, encrypted backup', status: 'live' },
  { when: 'Shipped', title: 'Desktop app (Windows, macOS, Linux) and offline installers', status: 'live', note: 'unsigned builds; not yet tested on real machines by the maker' },
  { when: 'Next', title: 'Run a 4–6 week pilot with 2–3 institutions and publish the before/after numbers', status: 'planned' },
  { when: 'Next', title: 'Accounts and a hosted API (reference server included in this repository)', status: 'partial', note: 'reference server built and tested locally; not deployed' },
  { when: 'Next', title: 'Real payments (Razorpay / Stripe) and subscription management', status: 'planned' },
  { when: 'Later', title: 'Native mobile apps, more languages for the voice tutor, teacher-authored simulations', status: 'planned' },
];
export interface BriefRow { area: string; status: Status; text: string }
export const BRIEF_STATUS: BriefRow[] = [
  { area: 'Product', status: 'live', text: 'Working web and desktop app. Offline-first. One AI tutor (FRIDAY) with sources, recomputed arithmetic and “I’m not sure”.' },
  { area: 'Differentiation', status: 'live', text: 'Simulation-driven tutoring (predict, run, explain the gap), per-student knowledge graph, verified answers, offline and private by design.' },
  { area: 'Institutional tools', status: 'live', text: 'Course packs, class dashboard, pilot kit (before/after statistics), exchanged as files: no student data leaves the device.' },
  { area: 'Users and results', status: 'planned', text: 'No pilot has run yet. There are no user numbers or outcome claims to report. The pilot kit exists to produce them.' },
  { area: 'Accounts and payments', status: 'partial', text: 'Local profiles and a reference server exist; real accounts, hosting and billing are not live.' },
  { area: 'Security and privacy', status: 'partial', text: 'Local-first, consent-gated analytics, encrypted backup, prompt-injection defences. No external security audit yet.' },
];
export const COMPETITORS = [['Khanmigo', 'Strong tutor and content; online and not simulation-driven'], ['NotebookLM', 'Great with your documents; not a tutor, no mastery model, online'], ['Quizlet / Anki', 'Flashcards and spaced repetition; no AI tutor or simulations'], ['PhET', 'Excellent free simulations; no tutoring or personal model']];
export const DEMO_SCRIPT: { sec: string; say: string; do: string; view?: string }[] = [
  { sec: '0:00', say: 'Students lose hours turning notes into practice, and AI tutors they cannot trust.', do: 'Open the app on the Dashboard.', view: 'dashboard' },
  { sec: '0:20', say: 'Drop in notes or a PDF: flashcards and a quiz in under two minutes, fully offline.', do: 'FRIDAY → Class → Quick start → paste notes → Make cards.', view: 'friday' },
  { sec: '0:50', say: 'Ask FRIDAY a question. Every answer is cited and arithmetic is recomputed. When unsure, it says so.', do: 'FRIDAY → Chat → ask a question from your notes.', view: 'friday' },
  { sec: '1:20', say: 'Simulations are tutors: predict first, then see where your thinking differs.', do: 'Practice → Predict & run → Surprise me → lock a prediction → Watch it.', view: 'practice' },
  { sec: '2:00', say: 'It knows what you are weak at and exam-bound topics come first.', do: 'My Progress → Knowledge graph and Learning outcomes (use demo data, labelled).', view: 'progress' },
  { sec: '2:30', say: 'Teachers upload a syllabus and get a whole course, and a pilot kit that measures before/after.', do: 'Teach → Course pack → Build; then Pilot kit.', view: 'teach' },
  { sec: '2:50', say: 'No pilot results yet. We are looking for two institutions to run one with us.', do: 'Close on the ask.', view: 'platform' },
];
