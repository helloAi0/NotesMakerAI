import { useRef, useState } from 'react';
import { extractPdf } from '../../lib/libraryStore';
import { btn } from './ui';

/** shared study material: paste text or load a PDF (read on this device) */
export function Material({ value, onChange, label = 'Study material' }: { value: string; onChange: (s: string) => void; label?: string }) {
  const [busy, setBusy] = useState(''); const ref = useRef<HTMLInputElement>(null);
  const load = async (f: File | undefined) => { if (!f) return; setBusy('Reading ' + f.name + '…'); try { if (/\.pdf$/i.test(f.name) || f.type === 'application/pdf') { const r = await extractPdf(f); const t = r.pageTexts.join('\n\n'); onChange(t); setBusy(t.replace(/\s/g, '').length < 50 ? `Read ${r.pages} pages but found almost no text. This looks like a scanned PDF (pictures of pages): use the Handwriting → LaTeX tab on a photo of a page, or run OCR in Library first.` : `Read ${r.pages} pages.`); } else { onChange(await f.text()); setBusy(''); } } catch (e) { setBusy('Could not read that file: ' + (e as Error).message); } };
  return (
    <div className="space-y-1">
      <div className="flex gap-2 items-center flex-wrap text-xs"><b>{label}</b><button className={btn} onClick={() => ref.current?.click()} data-testid="mat-upload">Upload PDF / text file</button><input ref={ref} type="file" accept=".pdf,.txt,.md,application/pdf,text/plain" className="hidden" onChange={e => void load(e.target.files?.[0])} data-testid="mat-file" /><span role="status">{busy}</span><span className="text-slate-500 ml-auto">{value.length.toLocaleString()} characters</span></div>
      <textarea value={value} onChange={e => onChange(e.target.value)} rows={5} className="w-full border rounded p-2 text-sm" aria-label={label} placeholder="Paste text here, or upload a PDF. Files stay on this device." data-testid="mat-text" />
    </div>
  );
}
export const Msg = ({ m, bad }: { m: string; bad?: boolean }) => (m ? <div role={bad ? 'alert' : 'status'} className={`text-xs ${bad ? 'text-red-700' : 'text-slate-600'}`}>{m}</div> : null);
