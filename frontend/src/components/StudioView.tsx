import { useState } from 'react';
import { useT } from '../lib/i18n';
import { Bhasha, Boards, Scan_, VoiceTutor } from './studio/tabs1';
import type { FlipResult } from '../lib/study/bhasha';
import { CodeViz, Swipe, Market, BotTab } from './studio/tabs2';

const TABS: [string, string][] = [['bhasha', 'Bhasha (Indian languages)'], ['boards', 'Exam engines'], ['scan', 'Handwriting → LaTeX'], ['voice', 'Voice tutor'], ['code', 'Code visualizer'], ['swipe', 'Swipe recall'], ['market', 'Notes marketplace'], ['bot', 'Chat bot']];
export default function StudioView() {
  const tr = useT();
  const [tab, setTab] = useState(() => { try { return sessionStorage.getItem('nm_studio_tab') || 'bhasha'; } catch { return 'bhasha'; } });
  const [material, setMaterial] = useState(''); const [result, setResult] = useState(''); const [bhRes, setBhRes] = useState<FlipResult | null>(null); const [boardOut, setBoardOut] = useState('');
  const go = (t: string) => { setTab(t); try { sessionStorage.setItem('nm_studio_tab', t); } catch { /* ignore */ } };
  return (
    <div className="space-y-4 p-1" data-testid="studio-view">
      <div><h2 className="text-lg font-bold">{tr('Study Studio')}</h2><p className="text-xs text-slate-600">{tr('Eight tools built for Indian students.')} Your material stays on this device; AI steps send only the text you choose to your own AI provider.</p></div>
      <div role="tablist" aria-label="Study Studio tools" className="flex gap-1 flex-wrap" onKeyDown={e => { if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return; const i = TABS.findIndex(t => t[0] === tab); const n = TABS[(i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length][0]; go(n); requestAnimationFrame(() => (document.querySelector(`[data-testid=studio-tab-${n}]`) as HTMLElement | null)?.focus()); }}>{TABS.map(([id, label]) => <button key={id} role="tab" aria-selected={tab === id} tabIndex={tab === id ? 0 : -1} onClick={() => go(id)} data-testid={`studio-tab-${id}`} className={`px-3 py-1.5 rounded border text-sm ${tab === id ? 'bg-slate-900 text-white' : 'hover:bg-slate-50'}`}>{tr(label)}</button>)}</div>
      <div role="tabpanel">
        {tab === 'bhasha' && <Bhasha material={material} setMaterial={setMaterial} onResult={setResult} res={bhRes} setRes={setBhRes} />}
        {tab === 'boards' && <Boards material={material} setMaterial={setMaterial} onResult={setResult} out={boardOut} setOut={setBoardOut} />}
        {tab === 'scan' && <Scan_ />}
        {tab === 'voice' && <VoiceTutor material={result || material} setMaterial={setMaterial} />}
        {tab === 'code' && <CodeViz />}
        {tab === 'swipe' && <Swipe />}
        {tab === 'market' && <Market material={material} result={result} />}
        {tab === 'bot' && <BotTab />}
      </div>
    </div>
  );
}
