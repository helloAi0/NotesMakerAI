/* Reliability layer: one place for retries, time-outs and plain-language failure messages.
   Retries only what is safe to retry: network errors, 408/425/429 and 5xx. Never retries 400/401/403/404. */
export interface RetryOpts { retries?: number; baseMs?: number; timeoutMs?: number; signal?: AbortSignal; fetch?: typeof fetch; sleep?: (ms: number) => Promise<void>; onRetry?: (why: string, inMs: number) => void }
export const retryable = (status: number) => status === 408 || status === 425 || status === 429 || (status >= 500 && status <= 599);
const wait = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

export async function resilientFetch(url: string, init: RequestInit = {}, o: RetryOpts = {}): Promise<Response> {
  const f = o.fetch ?? fetch; const sleep = o.sleep ?? wait; const retries = o.retries ?? 2; const base = o.baseMs ?? 900; let lastErr: unknown = null; let res: Response | null = null;
  for (let i = 0; i <= retries; i++) {
    if (o.signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
    const ac = new AbortController(); const onAbort = () => ac.abort(); o.signal?.addEventListener('abort', onAbort); const timer = o.timeoutMs ? setTimeout(() => ac.abort(), o.timeoutMs) : null;
    try {
      res = await f(url, { ...init, signal: ac.signal }); lastErr = null;
      if (!retryable(res.status) || i === retries) return res;
      const ra = Number(res.headers.get('retry-after')); const delay = Number.isFinite(ra) && ra > 0 ? Math.min(ra * 1000, 10000) : base * 2 ** i;
      o.onRetry?.(`HTTP ${res.status}`, delay); await sleep(delay);
    } catch (e) {
      if (o.signal?.aborted) throw e; lastErr = e; res = null; const timedOut = ac.signal.aborted;
      if (i === retries) throw timedOut ? new Error(`Timed out after ${Math.round((o.timeoutMs ?? 0) / 1000)} s`) : e;
      const delay = base * 2 ** i; o.onRetry?.(timedOut ? 'timeout' : 'network error', delay); await sleep(delay);
    } finally { if (timer) clearTimeout(timer); o.signal?.removeEventListener('abort', onAbort); }
  }
  if (res) return res; throw lastErr instanceof Error ? lastErr : new Error('Network request failed');
}

export type Service = 'Gemini' | 'Ollama' | 'YouTube captions' | 'Whisper' | 'Your AI provider' | 'The AI service';
/** One plain-language sentence for any failure, with what the person can do next. */
export function describeFailure(service: Service, e: unknown): string {
  const status = typeof e === 'number' ? e : (e as { status?: number })?.status; const msg = e instanceof Error ? e.message : '';
  if (status === 401 || status === 403) return `${service} rejected the key or access. Check it in Settings.`;
  if (status === 404) return `${service} could not find that model or page. Pick another model in Settings.`;
  if (status === 429) return `${service} says the rate limit is reached. Wait a minute and try again.`;
  if (status && status >= 500) return `${service} is overloaded or down right now (${status}). This is temporary; try again in a minute, or use the offline mode.`;
  if (e instanceof DOMException && e.name === 'AbortError') return 'Cancelled.';
  if (/timed out|timeout/i.test(msg)) return `${service} did not answer in time. A local model on a CPU can take minutes; try a smaller model or try again.`;
  if (/Failed to fetch|NetworkError|Load failed|network/i.test(msg) || e instanceof TypeError) return service === 'Ollama' ? 'Cannot reach Ollama. Is it running (ollama serve)? For a browser app it must allow this origin (OLLAMA_ORIGINS).' : `Cannot reach ${service}. Check your internet connection, or keep working offline.`;
  return `${service} failed${msg ? `: ${msg.slice(0, 140)}` : ''}.`;
}
