/* Starts the parts of the platform that must exist from the first moment, without loading anything heavy unless it is needed. */
import { createApi, getConsent } from './api';
import type { NotesMakerApi } from './api';
import { PluginStore } from './plugins';
import { deck } from '../friday/agentsRuntime';

declare global { interface Window { NotesMaker?: NotesMakerApi } }
export function bootPlatform() {
  if (typeof window === 'undefined' || window.NotesMaker) return;
  window.NotesMaker = createApi({
    consent: () => getConsent(), topics: () => deck.topics(), mastery: t => deck.mastery(t),
    addCards: (topic, cards) => deck.add(cards.map((c, i) => ({ id: `api${Date.now().toString(36)}${i}${Math.random().toString(36).slice(2, 5)}`, topic, front: c.front, back: c.back, kind: 'qa' as const, source: 'api', created: Date.now(), due: Date.now(), S: 0, D: 0, reps: 0, lapses: 0, state: 'new' as const }))),
    installPlugin: json => { const r = new PluginStore().install(json); if (r.ok) void registerPluginSims(); return r.ok ? { ok: true } : { ok: false, why: r.why }; },
  });
  // Plugin simulations are added to the library only when plugins exist, so the simulation catalogue is not loaded for nothing.
  try { if ((localStorage.getItem('nm_plugins') ?? '[]').length > 4) void registerPluginSims(); } catch { /* storage blocked */ }
}
export async function registerPluginSims() { const { SIMS } = await import('../../sims/registry'); for (const s of new PluginStore().sims()) if (!SIMS.some(x => x.id === s.id)) SIMS.push(s); }
