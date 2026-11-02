/**
 * YouTube captions for the Lecture to Notes screen. Browsers cannot read YouTube captions (CORS), so the dev/preview server does it:
 * GET /api/yt-transcript?v=<id>  ->  { ok, text: "[mm:ss] line\n...", lines }.   Only runs where Node runs (npm run dev / vite preview).
 */
export interface Seg { startMs: number; text: string }
export const stamp = (ms: number): string => { const s = Math.max(0, Math.floor(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60; return h ? `[${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}]` : `[${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}]`; };
export function segmentsToText(segs: Seg[]): string { return segs.filter(s => s.text.trim()).map(s => `${stamp(s.startMs)} ${s.text.replace(/\s+/g, ' ').trim()}`).join('\n'); }

type Dep = { Innertube: { create: (o?: Record<string, unknown>) => Promise<{ getInfo: (id: string) => Promise<{ getTranscript: () => Promise<unknown> }> }> } };
const withTimeout = <T,>(p: Promise<T>, ms: number, msg: string): Promise<T> => new Promise<T>((res, rej) => { const t = setTimeout(() => rej(new Error(msg)), ms); p.then(v => { clearTimeout(t); res(v); }, e => { clearTimeout(t); rej(e); }); });

export async function fetchTranscript(videoId: string, dep?: Dep): Promise<{ text: string; lines: number }> {
  if (!/^[\w-]{11}$/.test(videoId)) throw new Error('That is not a YouTube video id.');
  const Innertube = dep?.Innertube ?? ((await import('youtubei.js')) as unknown as Dep).Innertube;
  const unreachable = (e: unknown) => new Error(/timed out|in time/.test((e as Error).message) ? (e as Error).message : `Could not reach YouTube (${(e as Error).message.slice(0, 80)}). Check the internet connection of the computer running the app.`);
  const yt = await withTimeout(Innertube.create({ retrieve_player: false }), 20000, 'Could not reach YouTube (timed out).').catch(e => { throw unreachable(e); });
  const info = await withTimeout(yt.getInfo(videoId), 25000, 'YouTube did not answer in time.').catch(e => { throw unreachable(e); });
  let tr: unknown; try { tr = await withTimeout(info.getTranscript(), 25000, 'YouTube did not send the transcript in time.'); } catch (e) { throw new Error(`This video has no readable captions (${(e as Error).message.slice(0, 100)}).`, { cause: e }); }
  const raw = (tr as { transcript?: { content?: { body?: { initial_segments?: unknown[] } } } })?.transcript?.content?.body?.initial_segments ?? [];
  const segs: Seg[] = [];
  for (const s of raw as { start_ms?: string | number; snippet?: { text?: string } }[]) { const t = s?.snippet?.text; if (typeof t === 'string' && s.start_ms !== undefined) segs.push({ startMs: Number(s.start_ms), text: t }); }
  if (!segs.length) throw new Error('This video has no captions to read.');
  return { text: segmentsToText(segs), lines: segs.length };
}

interface Req { url?: string }
interface Res { statusCode: number; setHeader: (k: string, v: string) => void; end: (b: string) => void }
export function mountTranscriptApi(middlewares: { use: (path: string, fn: (req: Req, res: Res) => void) => void }, dep?: Dep) {
  middlewares.use('/api/yt-transcript', (req, res) => {
    const id = new URL(req.url || '/', 'http://localhost').searchParams.get('v') || '';
    res.setHeader('content-type', 'application/json'); res.setHeader('cache-control', 'no-store');
    fetchTranscript(id, dep).then(r => res.end(JSON.stringify({ ok: true, ...r })), e => { res.statusCode = 502; res.end(JSON.stringify({ ok: false, error: (e as Error).message })); });
  });
}
