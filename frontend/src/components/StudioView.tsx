import { useState } from 'react';
import { Bhasha, Boards, Scan_, VoiceTutor } from './studio/tabs1';
import { CodeViz, Swipe, Market, BotTab } from './studio/tabs2';

const TABS: [string, string][] = [['bhasha', 'Bhasha (Indian languages)'], ['boards', 'Exam engines'], ['scan', 'Handwriting → LaTeX'], ['voice', 'Voice tutor'], ['code', 'Code visualizer'], ['swipe', 'Swipe recall'], ['market', 'Notes marketplace'], ['bot', 'Chat bot']];
export default function StudioView() {
  const [tab, setTab] = useState(() => { try { return sessionStorage.getItem('nm_studio_tab') || 'bhasha'; } catch { return 'bhasha'; } });
  const [material, setMaterial] = useState(''); const [result, setResult] = useState('');
  const go = (t: string) => { setTab(t); try { sessionStorage.setItem('nm_studio_tab', t); } catch { /* ignore */ } };
  return (
    <div className="space-y-4 p-1" data-testid="studio-view">
      <div><h2 className="text-lg font-bold">Study Studio</h2><p className="text-xs text-slate-600">Eight tools built for Indian students. Your material stays on this device; AI steps send only the text you choose to your own AI provider.</p></div>
      <div role="tablist" aria-label="Study Studio tools" className="flex gap-1 flex-wrap">{TABS.map(([id, label]) => <button key={id} role="tab" aria-selected={tab === id} onClick={() => go(id)} data-testid={`studio-tab-${id}`} className={`px-3 py-1.5 rounded border text-sm ${tab === id ? 'bg-slate-900 text-white' : 'hover:bg-slate-50'}`}>{label}</button>)}</div>
      <div role="tabpanel">
        {tab === 'bhasha' && <Bhasha material={material} setMaterial={setMaterial} onResult={setResult} />}
        {tab === 'boards' && <Boards material={material} setMaterial={setMaterial} onResult={setResult} />}
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
