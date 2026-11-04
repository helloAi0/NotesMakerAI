/** Browser wiring for the multi-agent system: one deck, reminders, undo journal and run history per device, and the tool adapters the agents are allowed to use. */
import { getIndex } from '../friday';
import { ask as askCore, calc } from '../fridayCore';
import type { Index } from '../fridayCore';
import { runOne } from '../agentRuntime';
import { snapshot } from '../fridayAgent';
import { vfs } from './vfs';
import { extractFacts, defaultKV } from './learn';
import * as router from './route';
import { Retriever, ollamaEmbedder } from './agents/retrieval';
import type { Passage } from './agents/retrieval';
import { browserRunner } from './agents/sandbox';
import { Deck } from './agents/tutor';
import { Reminders } from './agents/reminders';
import { Journal, idbBlobStore } from './agents/journal';
import { RunStore } from './agents/orchestrator';
import type { Deps, MemoryLike } from './agents/agents';

export const deck = new Deck(); export const reminders = new Reminders(); export const journal = new Journal(vfs(), defaultKV(), 'nm_friday_journal', idbBlobStore()); export const runStore = new RunStore(defaultKV());
const get = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
export const agentsEnabled = () => get('nm_friday_agents') !== '0';
export const setAgentsEnabled = (v: boolean) => { try { localStorage.setItem('nm_friday_agents', v ? '1' : '0'); } catch { /* storage */ } };

let confirmHandler: ((why: string[]) => Promise<boolean>) | null = null;
export const setConfirmHandler = (f: ((why: string[]) => Promise<boolean>) | null) => { confirmHandler = f; };

let cache: { sig: string; r: Retriever; ix: Index } | null = null;
function embedder() { const lc = router.getLocal(); if (!lc || lc.kind !== 'ollama') return undefined; const pick = router.getEmbed(); if (pick === 'off') return undefined; const m = pick || router.knownModels().find(x => /embed|nomic|bge|minilm|mxbai|gte/i.test(x)); return m ? ollamaEmbedder(lc.url, m) : undefined; }
export async function corpus(): Promise<{ r: Retriever; ix: Index }> {
  const ix = await getIndex(); const v = vfs(); await v.ready(); const files = v.walk('/', 8).filter(n => n.type === 'file' && n.text && n.text.length > 40);
  const sig = `${ix.all.docs.length}|${files.length}|${files.reduce((a, n) => a + n.modified, 0)}|${embedder()?.name ?? ''}`; if (cache && cache.sig === sig) return cache;
  const ps: Passage[] = ix.all.docs.map(d => ({ id: d.id, kind: d.kind, title: d.title, where: d.where, text: d.text }));
  for (const n of files) ps.push({ id: `f:${n.path}`, kind: 'file', title: n.name, where: n.path, text: n.text! });
  cache = { sig, r: new Retriever(ps, embedder()), ix }; return cache;
}

export function buildDeps(o: { memory: MemoryLike; persona: string; style?: string; engine?: { engine: string; label: string } }): Deps {
  const scale = o.engine?.engine === 'local' ? 8 : o.engine?.engine === 'cloud' ? 2 : 1; // an 8B model on a CPU needs minutes, not seconds
  return {
    timeScale: scale,
    now: Date.now, retriever: async () => (await corpus()).r, calc, runCode: browserRunner, memory: o.memory, deck, reminders, extractFacts, persona: o.engine && o.engine.engine !== 'offline' ? `${o.persona} You are currently running on: ${o.engine.label}.` : o.persona, style: o.style, deep: router.getDeep(),
    llm: async (prompt, opts) => { const cur = await router.current(); if (cur.engine === 'offline') return null; const g = await router.route(prompt, { stream: false, json: opts?.json, tier: opts?.tier, temperature: opts?.temperature, maxTokens: 1200 }); return g && g.engine !== 'offline' && g.text ? g.text : null; },
    sim: { run: async c => { const r = await runOne(c); return { ok: r.ok, message: r.message }; }, read: () => snapshot() },
    fs: { vfs: vfs(), journal }, confirm: why => (confirmHandler ? confirmHandler(why) : Promise.resolve(false)),
    offline: q => { const ix = cache?.ix; if (!ix) return { text: '', found: false }; const a = askCore(ix, q); return { text: a.text, found: a.found }; },
  };
}
export async function llmAvailable(): Promise<boolean> { return (await router.current()).engine !== 'offline'; }
