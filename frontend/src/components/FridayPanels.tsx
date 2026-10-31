import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Folder, File as FileIcon, FileText, Upload, Download, Trash2, Brain, RefreshCw, ChevronRight } from 'lucide-react';
import { vfs, join, dirname } from '../lib/friday/vfs';
import type { VNode } from '../lib/friday/vfs';
import { memory, policy, knowledgeMap, planCtx } from '../lib/friday/brain';
import { STRATEGIES } from '../lib/friday/learn';
import type { KnowledgeMap } from '../lib/friday/cluster';
import * as router from '../lib/friday/route';
import type { Found } from '../lib/friday/route';
import { extractPdf } from '../lib/libraryStore';

const useVfs = () => { const v = vfs(); return useSyncExternalStore(f => v.subscribe(f), () => v.version()); };
const fmtSize = (n: number) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : n > 1024 ? `${Math.round(n / 1024)} KB` : `${n} B`);
const COLORS = ['#d97706', '#2563eb', '#059669', '#db2777', '#7c3aed', '#0891b2', '#65a30d', '#dc2626', '#475569'];

/* ---------------- virtual file explorer ---------------- */
export function FilesPanel({ openPath, onOpened }: { openPath?: string; onOpened?: () => void }) {
  useVfs(); const v = vfs(); const [dir, setDir] = useState(planCtx.cwd || '/'); const [sel, setSel] = useState<string | null>(null); const [msg, setMsg] = useState(''); const inp = useRef<HTMLInputElement>(null);
  useEffect(() => { void v.ready(); }, [v]);
  useEffect(() => { if (openPath) { queueMicrotask(() => { setDir(dirname(openPath)); setSel(openPath); onOpened?.(); }); } }, [openPath, onOpened]);
  const items = v.list(dir).sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'dir' ? -1 : 1)); const node = sel ? v.stat(sel) : null;
  const crumbs = dir.split('/').filter(Boolean);
  const upload = async (files: FileList | File[]) => {
    for (const f of Array.from(files)) {
      try { let text = ''; let pages: number | undefined; if (/pdf$/i.test(f.type) || /\.pdf$/i.test(f.name)) { const r = await extractPdf(f); text = r.pageTexts.join('\n\n'); pages = r.pages; } else if (/^text\/|json|csv|markdown/.test(f.type) || /\.(txt|md|csv|json|py|js|ts|tex)$/i.test(f.name)) text = await f.text(); await v.writeBlob(v.uniquePath(dir, f.name), f, text, pages); setMsg(`Added ${f.name}.`); } catch (e) { setMsg(`Could not add ${f.name}: ${(e as Error).message}`); }
    }
  };
  const download = (n: VNode) => { const b = n.blob ?? new Blob([n.text ?? ''], { type: n.mime || 'text/plain' }); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = n.name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); };
  return (
    <div className="h-full flex flex-col min-h-0 bg-white" data-testid="files-panel" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); if (e.dataTransfer.files.length) void upload(e.dataTransfer.files); }}>
      <div className="flex items-center gap-1 px-3 py-2 border-b text-xs flex-wrap">
        <button onClick={() => setDir('/')} className="font-semibold text-amber-700 hover:underline">root</button>
        {crumbs.map((c, i) => <span key={i} className="flex items-center gap-1"><ChevronRight className="w-3 h-3 text-slate-400" /><button onClick={() => setDir('/' + crumbs.slice(0, i + 1).join('/'))} className="hover:underline">{c}</button></span>)}
        <span className="flex-1" />
        <button onClick={() => { const n = prompt('New folder name'); if (n) void v.mkdir(join(dir, n)).then(r => setMsg(r.message)); }} className="px-2 py-1 border rounded hover:bg-slate-50">New folder</button>
        <button onClick={() => inp.current?.click()} className="px-2 py-1 border rounded hover:bg-slate-50 flex items-center gap-1"><Upload className="w-3 h-3" /> Add files</button>
        <input ref={inp} type="file" multiple hidden onChange={e => { if (e.target.files) void upload(e.target.files); e.target.value = ''; }} data-testid="files-upload" />
      </div>
      <div className="flex-1 min-h-0 flex flex-col md:flex-row">
        <ul className="md:w-1/2 overflow-y-auto divide-y text-sm" data-testid="files-list">
          {dir !== '/' && <li><button onClick={() => setDir(dirname(dir))} className="w-full text-left px-3 py-2 hover:bg-slate-50 text-slate-500">↩ ..</button></li>}
          {items.length === 0 && <li className="px-3 py-6 text-center text-slate-500 text-xs">Empty folder. Drop files here or tell FRIDAY: “capture the document in Inbox”.</li>}
          {items.map(n => <li key={n.path}><button onClick={() => (n.type === 'dir' ? setDir(n.path) : setSel(n.path))} className={`w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-amber-50 ${sel === n.path ? 'bg-amber-50' : ''}`}>{n.type === 'dir' ? <Folder className="w-4 h-4 text-amber-600" /> : n.mime.includes('pdf') ? <FileText className="w-4 h-4 text-red-600" /> : <FileIcon className="w-4 h-4 text-slate-500" />}<span className="flex-1 truncate">{n.name}</span>{n.type === 'file' && <span className="text-[10px] text-slate-400">{fmtSize(n.size)}</span>}</button></li>)}
        </ul>
        <div className="md:w-1/2 border-t md:border-t-0 md:border-l overflow-y-auto p-3 text-xs bg-slate-50 min-h-[8rem]">
          {node && node.type === 'file' ? <>
            <div className="font-semibold text-sm break-all">{node.name}</div><div className="text-slate-500 mb-2">{node.path} · {fmtSize(node.size)}{node.pages ? ` · ${node.pages} pages` : ''}</div>
            <div className="flex gap-1.5 mb-2"><button onClick={() => download(node)} className="px-2 py-1 border rounded bg-white flex items-center gap-1"><Download className="w-3 h-3" /> Download</button>{!node.readonly && <button onClick={() => { void v.remove(node.path).then(r => { setMsg(r.message); setSel(null); }); }} className="px-2 py-1 border rounded bg-white flex items-center gap-1 text-red-700"><Trash2 className="w-3 h-3" /> Delete</button>}</div>
            <pre className="whitespace-pre-wrap break-words bg-white border rounded p-2 max-h-72 overflow-y-auto">{node.text ? node.text.slice(0, 5000) : '(no text preview)'}</pre>
          </> : <div className="text-slate-500">Select a file to preview it. FRIDAY works on this same file system — “{`move the latest pdf to PDF Processing`}” changes what you see here.{msg && <div className="mt-2 text-slate-700">{msg}</div>}</div>}
          {msg && node && <div className="mt-2 text-slate-600">{msg}</div>}
        </div>
      </div>
    </div>
  );
}

/* ---------------- memory ---------------- */
export function MemoryPanel() {
  const [, force] = useState(0); const all = memory.all(); const [txt, setTxt] = useState('');
  return (
    <div className="p-4 overflow-y-auto h-full bg-white text-sm" data-testid="memory-panel">
      <p className="text-xs text-slate-600 mb-3">Everything FRIDAY remembers about you is stored only in this browser. Say “remember that …” or “forget …” in chat, or edit here.</p>
      <form className="flex gap-2 mb-3" onSubmit={e => { e.preventDefault(); if (txt.trim()) { memory.add(txt, 'fact'); setTxt(''); force(x => x + 1); } }}><input value={txt} onChange={e => setTxt(e.target.value)} placeholder="Add a fact, e.g. I study mechanical engineering" className="flex-1 px-3 py-1.5 border rounded text-sm" /><button className="px-3 py-1.5 rounded bg-amber-600 text-white text-sm">Add</button></form>
      {all.length === 0 && <div className="text-slate-500 text-xs">Nothing stored yet.</div>}
      <ul className="space-y-1.5">{all.slice(0, 80).map(m => <li key={m.id} className="flex items-center gap-2 border rounded px-2 py-1.5"><span className="text-[10px] uppercase px-1.5 rounded bg-slate-100 text-slate-600">{m.kind}</span><span className="flex-1 break-words">{m.text}</span><button aria-label="Forget" onClick={() => { memory.forget(m.text); force(x => x + 1); }} className="text-slate-400 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button></li>)}</ul>
      {all.length > 0 && <button onClick={() => { if (confirm('Forget everything?')) { for (const m of memory.all()) memory.forget(m.text); force(x => x + 1); } }} className="mt-3 text-xs text-red-700 underline">Forget everything</button>}
    </div>
  );
}

/* ---------------- learning (reinforcement) ---------------- */
export function LearningPanel() {
  const [, force] = useState(0); const s = policy.stats(); const log = policy.s.log.slice(-60);
  const W = 320, H = 70; const pts = log.map((x, i) => [i, log.slice(0, i + 1).reduce((a, y) => a + y.r, 0)] as const); const ys = pts.map(p => p[1]); const lo = Math.min(0, ...ys), hi = Math.max(1, ...ys);
  const path = pts.map(([i, y], k) => `${k ? 'L' : 'M'}${(pts.length > 1 ? (i / (pts.length - 1)) * W : 0).toFixed(1)},${(H - ((y - lo) / (hi - lo)) * H).toFixed(1)}`).join(' ');
  return (
    <div className="p-4 overflow-y-auto h-full bg-white text-sm" data-testid="learning-panel">
      <p className="text-xs text-slate-600 mb-3">FRIDAY chooses <b>how</b> to answer (concise, step-by-step, worked example, formal, analogy) with a softmax policy per question type. 👍, 👎, regenerate and copy are rewards; the policy is updated with REINFORCE (θ ← θ + α·(r − baseline)·∇log π). It tunes style, not facts, and it is not AGI.</p>
      <div className="grid grid-cols-3 gap-2 text-center mb-3"><div className="border rounded p-2"><div className="text-lg font-bold">{s.total}</div><div className="text-[10px] text-slate-500">feedback events</div></div><div className="border rounded p-2"><div className="text-lg font-bold">{s.avgReward.toFixed(2)}</div><div className="text-[10px] text-slate-500">mean reward</div></div><div className="border rounded p-2"><div className={`text-lg font-bold ${s.trend >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{s.trend >= 0 ? '+' : ''}{s.trend.toFixed(2)}</div><div className="text-[10px] text-slate-500">recent trend</div></div></div>
      {pts.length > 1 && <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-20 border rounded mb-3 bg-slate-50" role="img" aria-label="Cumulative reward"><path d={path} fill="none" stroke="#d97706" strokeWidth="2" /></svg>}
      <div className="space-y-2.5">{s.contexts.map(c => <div key={c.ctx}><div className="text-xs font-semibold mb-1">{c.ctx} <span className="font-normal text-slate-500">· {c.n} rated · prefers {c.best}</span></div><div className="flex h-5 rounded overflow-hidden border">{c.probs.map((p, i) => <div key={i} title={`${STRATEGIES[i]} ${(p * 100).toFixed(0)}%`} style={{ width: `${p * 100}%`, background: COLORS[i] }} className="text-[9px] text-white flex items-center justify-center overflow-hidden">{p > 0.14 ? STRATEGIES[i] : ''}</div>)}</div></div>)}</div>
      <button onClick={() => { if (confirm('Reset what FRIDAY learned about your preferences?')) { policy.reset(); force(x => x + 1); } }} className="mt-4 text-xs text-red-700 underline">Reset learning</button>
    </div>
  );
}

/* ---------------- knowledge map (clustering) ---------------- */
export function MapPanel() {
  const [map, setMap] = useState<KnowledgeMap | null>(null); const [busy, setBusy] = useState(false); const [hover, setHover] = useState<string | null>(null);
  const run = async (force: boolean) => { setBusy(true); try { setMap(await knowledgeMap(force)); } finally { setBusy(false); } };
  useEffect(() => { queueMicrotask(() => { void run(false); }); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const pts = map?.points ?? []; const xs = pts.map(p => p.x), ys = pts.map(p => p.y); const x0 = Math.min(...xs, 0), x1 = Math.max(...xs, 1), y0 = Math.min(...ys, 0), y1 = Math.max(...ys, 1);
  const sx = (x: number) => 20 + ((x - x0) / (x1 - x0 || 1)) * 560, sy = (y: number) => 20 + ((y - y0) / (y1 - y0 || 1)) * 320; const hp = useMemo(() => pts.find(p => p.id === hover), [pts, hover]);
  return (
    <div className="p-4 overflow-y-auto h-full bg-white text-sm" data-testid="map-panel">
      <div className="flex items-center gap-2 mb-2"><p className="text-xs text-slate-600 flex-1">Your notes, PDFs, files, simulations and past questions, embedded with TF-IDF, grouped by spherical k-means (k chosen by silhouette score) and projected to 2-D with PCA. FRIDAY uses the nearest cluster to focus answers.</p><button onClick={() => void run(true)} disabled={busy} className="px-2 py-1 border rounded text-xs flex items-center gap-1"><RefreshCw className={`w-3 h-3 ${busy ? 'animate-spin' : ''}`} /> Re-cluster</button></div>
      {!map || pts.length === 0 ? <div className="text-slate-500 text-xs">{busy ? 'Clustering…' : 'Nothing to cluster yet.'}</div> : <>
        <div className="text-xs text-slate-600 mb-1">{pts.length} items · k = {map.k} · silhouette {map.silhouette.toFixed(2)}</div>
        <svg viewBox="0 0 600 360" className="w-full border rounded bg-slate-50" role="img" aria-label="Knowledge map">{pts.map(p => <circle key={p.id} cx={sx(p.x)} cy={sy(p.y)} r={hover === p.id ? 6 : 3.5} fill={COLORS[p.cluster % COLORS.length]} opacity={0.8} onMouseEnter={() => setHover(p.id)} onMouseLeave={() => setHover(null)}><title>{p.title}</title></circle>)}</svg>
        <div className="text-xs h-5 mt-1 text-slate-700">{hp ? `${hp.title} · ${hp.kind} · cluster ${hp.cluster + 1}` : 'Hover a point'}</div>
        <ul className="grid sm:grid-cols-2 gap-2 mt-2">{map.clusters.map(c => <li key={c.id} className="border rounded p-2 text-xs"><div className="flex items-center gap-1.5 font-semibold"><span className="w-2.5 h-2.5 rounded-full" style={{ background: COLORS[c.id % COLORS.length] }} />{c.label}<span className="font-normal text-slate-500">· {c.size} items</span></div><div className="text-slate-500 mt-0.5">{c.terms.slice(0, 6).join(', ')}</div></li>)}</ul></>}
    </div>
  );
}

/* ---------------- brain / engine settings ---------------- */
export function BrainPanel({ onChange }: { onChange: () => void }) {
  const [pref, setPref] = useState(router.getRoutePref()); const [online, setOnline] = useState(router.isOnline()); const [deep, setDeep] = useState(router.getDeep()); const [web, setWeb] = useState(router.getWeb()); const [local, setLocal] = useState(router.getLocal()); const [found, setFound] = useState<Found[] | null>(null); const [busy, setBusy] = useState(false); const [url, setUrl] = useState(''); const [cur, setCur] = useState('');
  useEffect(() => { void router.current().then(c => setCur(`${c.label} — ${c.reason}`)); }, [pref, online, local]);
  const scan = async () => { setBusy(true); const f = await router.detectLocal(url || undefined); setFound(f); if (f.length && !router.getLocal()) { const c = { kind: f[0].kind, url: f[0].url, model: router.pickModel(f[0].models) }; router.setLocal(c); setLocal(c); } await router.localReachable(true); setBusy(false); onChange(); };
  const sel = 'border rounded px-2 py-1 text-sm bg-white';
  return (
    <div className="p-4 overflow-y-auto h-full bg-white text-sm space-y-4" data-testid="brain-panel">
      <div className="text-xs bg-amber-50 border border-amber-200 rounded p-2">Active engine: <b>{cur || '…'}</b></div>
      <label className="block"><span className="text-xs font-semibold block mb-1">Which brain should FRIDAY use?</span><select value={pref} onChange={e => { const v = e.target.value as typeof pref; router.setRoutePref(v); setPref(v); onChange(); }} className={sel}><option value="auto">Automatic: local model → cloud key → offline engine</option><option value="local">Local model only (offline-capable)</option><option value="cloud">Cloud API key first</option><option value="offline">Built-in offline engine only</option></select></label>
      <div className="flex flex-wrap gap-4"><label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={online} onChange={e => { router.setOnline(e.target.checked); setOnline(e.target.checked); onChange(); }} /> Online mode (cloud models and Wikipedia recall)</label><label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={deep} onChange={e => { router.setDeep(e.target.checked); setDeep(e.target.checked); onChange(); }} /> Deep thinking (second review pass, slower)</label><label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={web} onChange={e => { router.setWeb(e.target.checked); setWeb(e.target.checked); }} /> Recall from Wikipedia for every question (sends the question text to wikipedia.org; off by default. Saying “search the web …” does it once.)</label></div>
      <div className="border rounded p-3"><div className="font-semibold text-xs mb-2 flex items-center gap-1.5"><Brain className="w-4 h-4" /> Local model server (Ollama, vLLM, LM Studio, llama.cpp)</div>
        <div className="flex gap-2 mb-2"><input value={url} onChange={e => setUrl(e.target.value)} placeholder="Optional custom URL, e.g. http://192.168.1.5:11434" className="flex-1 px-2 py-1 border rounded text-xs" /><button onClick={() => void scan()} disabled={busy} className="px-3 py-1 rounded bg-slate-900 text-white text-xs">{busy ? 'Scanning…' : 'Find local model'}</button></div>
        {found && found.length === 0 && <div className="text-xs text-slate-600 mb-2">No server found. Start one: <code className="bg-slate-100 px-1">ollama pull llama3.1</code> then <code className="bg-slate-100 px-1">OLLAMA_ORIGINS=* ollama serve</code>. vLLM: <code className="bg-slate-100 px-1">vllm serve &lt;model&gt; --allowed-origins '["*"]'</code>.</div>}
        {found?.map(f => <div key={f.url} className="mb-2 text-xs"><div className="text-slate-500">{f.kind} · {f.url}</div><div className="flex flex-wrap gap-1 mt-1">{f.models.slice(0, 20).map(m => <button key={m} onClick={() => { const c = { kind: f.kind, url: f.url, model: m }; router.setLocal(c); setLocal(c); onChange(); }} className={`px-2 py-0.5 rounded-full border ${local?.model === m && local.url === f.url ? 'bg-amber-600 text-white border-amber-600' : 'hover:bg-slate-50'}`}>{m}</button>)}</div></div>)}
        {local && <div className="text-xs text-slate-700">Selected: <b>{local.model || 'default'}</b> at {local.url} <button onClick={() => { router.setLocal(null); setLocal(null); onChange(); }} className="ml-2 text-red-700 underline">remove</button></div>}
      </div>
      <p className="text-[11px] text-slate-500">Cloud keys are added in Settings. Honest scope: the quality of open-ended answers is the quality of the model you connect. The offline engine answers from built-in STEM knowledge plus your own notes and PDFs, and says so when it does not know.</p>
    </div>
  );
}
