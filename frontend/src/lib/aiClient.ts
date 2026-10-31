/* ------------------------------------------------------------------ */
/*  Provider-agnostic AI client (runs in the browser)                  */
/*                                                                     */
/*  Supports Google Gemini, OpenAI, Anthropic Claude, OpenRouter and   */
/*  any OpenAI-compatible service (Groq, DeepSeek, Mistral, Ollama...) */
/*  Text is streamed whenever possible, so answers appear instantly.   */
/* ------------------------------------------------------------------ */

export type ProviderId = 'gemini' | 'openai' | 'anthropic' | 'openrouter' | 'custom';
export type Speed = 'fast' | 'quality';
type Kind = 'gemini' | 'openai' | 'anthropic';

export interface AiConfig {
  provider: ProviderId;
  apiKey: string;
  model: string;   // empty = provider default
  baseUrl: string; // only used by "custom"
  speed: Speed;
}

export interface ProviderInfo {
  label: string;
  kind: Kind;
  baseUrl: string;
  defaultModel: string; // empty = automatic
  keyPlaceholder: string;
  keyHelp: string;
  note: string;
}

export const PROVIDERS: Record<ProviderId, ProviderInfo> = {
  gemini: {
    label: 'Google Gemini',
    kind: 'gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    defaultModel: '',
    keyPlaceholder: 'Gemini API key',
    keyHelp: 'aistudio.google.com/app/apikey',
    note: 'Free tier available.',
  },
  openai: {
    label: 'OpenAI (ChatGPT)',
    kind: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-5.4-mini',
    keyPlaceholder: 'OpenAI API key (sk-...)',
    keyHelp: 'platform.openai.com/api-keys',
    note: 'Paid. Pick any model from the list after verifying.',
  },
  anthropic: {
    label: 'Anthropic (Claude)',
    kind: 'anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    defaultModel: 'claude-haiku-5-5',
    keyPlaceholder: 'Anthropic API key (sk-ant-...)',
    keyHelp: 'console.anthropic.com/settings/keys',
    note: 'Paid. Haiku is the fastest; Sonnet writes better.',
  },
  openrouter: {
    label: 'OpenRouter',
    kind: 'openai',
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'openrouter/free',
    keyPlaceholder: 'OpenRouter key (sk-or-...)',
    keyHelp: 'openrouter.ai/keys',
    note: 'Free models by default (50 requests/day); type any paid model to use it.',
  },
  custom: {
    label: 'Other (OpenAI-compatible)',
    kind: 'openai',
    baseUrl: '',
    defaultModel: '',
    keyPlaceholder: 'API key',
    keyHelp: 'Groq, DeepSeek, Mistral, Together, Ollama...',
    note: 'Enter the service base URL (ending in /v1) and a model name.',
  },
};

export const PROVIDER_IDS = Object.keys(PROVIDERS) as ProviderId[];

/** How much document text is sent per request, by provider. */
export function docLimits(cfg: AiConfig): { single: number; chunk: number; qa: number; quiz: number } {
  switch (cfg.provider) {
    case 'gemini': return { single: 300_000, chunk: 150_000, qa: 250_000, quiz: 150_000 };
    case 'openai':
    case 'anthropic': return { single: 150_000, chunk: 100_000, qa: 100_000, quiz: 80_000 };
    default: return { single: 60_000, chunk: 60_000, qa: 60_000, quiz: 60_000 }; // free / unknown context sizes
  }
}

/** How many requests may run at the same time. */
export function concurrencyFor(cfg: AiConfig): number {
  return cfg.provider === 'gemini' || cfg.provider === 'openai' || cfg.provider === 'anthropic' ? 3 : 2;
}

/* ---------------- saved settings ---------------- */

interface Saved { apiKey: string; model: string; baseUrl: string }

function lsGet(k: string): string | null {
  try { return localStorage.getItem(k); } catch { return null; }
}
function lsSet(k: string, v: string) {
  try { localStorage.setItem(k, v); } catch { /* storage unavailable */ }
}

export function loadProvider(): ProviderId {
  const p = lsGet('ai_provider');
  return p && p in PROVIDERS ? (p as ProviderId) : 'gemini';
}
export function loadSpeed(): Speed {
  return lsGet('ai_speed') === 'quality' ? 'quality' : 'fast';
}
export function saveProvider(p: ProviderId) { lsSet('ai_provider', p); }
export function saveSpeed(s: Speed) { lsSet('ai_speed', s); }

export function loadSaved(p: ProviderId, envKey = ''): Saved {
  try {
    const raw = lsGet(`ai_cfg_${p}`);
    if (raw) {
      const j = JSON.parse(raw);
      return { apiKey: String(j.apiKey ?? ''), model: String(j.model ?? ''), baseUrl: String(j.baseUrl ?? '') };
    }
  } catch { /* fall through */ }
  // keys saved by earlier versions of the app
  const legacy = lsGet(`ai_key_${p}`) || (p === 'gemini' ? lsGet('gemini_api_key') || envKey : '');
  return { apiKey: legacy || '', model: '', baseUrl: '' };
}
export function saveConfig(cfg: AiConfig) {
  lsSet(`ai_cfg_${cfg.provider}`, JSON.stringify({ apiKey: cfg.apiKey, model: cfg.model, baseUrl: cfg.baseUrl }));
}

/* ---------------- small helpers ---------------- */

export const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Request timed out after ${Math.round(ms / 1000)}s`)), ms);
    promise.then(
      v => { clearTimeout(timer); resolve(v); },
      e => { clearTimeout(timer); reject(e); },
    );
  });
}

/** Runs fn over items with at most `limit` running at once. Never rejects: inspect each result. */
export async function pMap<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const out: PromiseSettledResult<R>[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      try { out[i] = { status: 'fulfilled', value: await fn(items[i], i) }; }
      catch (reason) { out[i] = { status: 'rejected', reason }; }
    }
  };
  await Promise.all(Array.from({ length: Math.min(Math.max(1, limit), items.length) }, worker));
  return out;
}

export function parseJsonLoose<T>(s: string): T {
  const cleaned = s.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const m = cleaned.match(/[[{][\s\S]*[\]}]/);
    if (m) {
      try { return JSON.parse(m[0]) as T; } catch { /* fall through */ }
    }
    throw new Error('The AI returned a response that was not valid JSON. Please retry.');
  }
}

/* ---------------- errors ---------------- */

export class ApiError extends Error {
  status: number;
  reason?: string;
  constructor(status: number, message: string, reason?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.reason = reason;
  }
}

function toApiError(status: number, raw: string): ApiError {
  let message = raw.slice(0, 300);
  let reason: string | undefined;
  try {
    let j: any = JSON.parse(raw);
    if (Array.isArray(j)) j = j[0];
    const err = j?.error ?? j;
    if (typeof err?.message === 'string') message = err.message;
    reason = err?.details?.find?.((d: any) => d?.reason)?.reason ?? (typeof err?.type === 'string' ? err.type : undefined);
  } catch { /* not JSON */ }
  return new ApiError(status, message || `HTTP ${status}`, reason);
}

export interface ApiErrInfo { status?: number; reason?: string; message: string }

export function parseApiError(e: any): ApiErrInfo {
  if (e instanceof ApiError) return { status: e.status, reason: e.reason, message: e.message };
  return { message: String(e?.message ?? e ?? 'Unknown error') };
}

export function friendlyError(e: any): string {
  const { status, reason, message } = parseApiError(e);
  if (reason === 'ACCESS_TOKEN_TYPE_UNSUPPORTED') {
    return (
      'Google refuses this key type for the Gemini API (401 ACCESS_TOKEN_TYPE_UNSUPPORTED). This is Google rejecting ' +
      'the new "AQ." key, not a bug in the app. Use an older "AIza..." key, create a standard key in Google Cloud ' +
      'Console (restricted to the Generative Language API), or pick another provider at the top right.'
    );
  }
  if (/data policy/i.test(message)) {
    return 'OpenRouter blocked the free models because of your privacy settings. Open openrouter.ai/settings/privacy, allow free models, then retry.';
  }
  if (status === 401 || status === 403) {
    return `The AI provider rejected the API key (${status}): ${message}. Check that the key is copied completely and matches the provider selected at the top right.`;
  }
  if (status === 402) return 'The provider says your account has no credit left (402). Add credit or switch provider.';
  if (status === 404) return `Model or endpoint not found (404): ${message}. Check the model name (choose one from the model list) and, for "Other", the base URL.`;
  if (status === 429) return 'Rate limit or quota reached. Wait a minute and try again, or switch model/provider.';
  if (status && status >= 500) return 'The AI service is overloaded or down right now. Try again in a moment, or switch model/provider.';
  if (status === 400) return `The AI service rejected the request (400): ${message}`;
  if (/timed out/i.test(message)) {
    return `${message}. The AI service stopped responding: check your internet connection, turn off any VPN or ad-blocker for localhost, or switch provider.`;
  }
  if (/failed to fetch|networkerror|load failed/i.test(message)) {
    return 'The browser could not reach the AI service (network, VPN, firewall, ad-blocker, or the service blocks browser requests). Turn off any VPN and retry.';
  }
  return message;
}

/* ---------------- HTTP plumbing ---------------- */

function watchdog(controller: AbortController, ms: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let fired = false;
  const bump = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { fired = true; controller.abort(); }, ms);
  };
  bump();
  return { bump, stop: () => { if (timer) clearTimeout(timer); }, didFire: () => fired };
}

interface HttpCall {
  url: string;
  headers: Record<string, string>;
  body: unknown;
  idleMs: number;              // stream: max silence between chunks. non-stream: total time
  stream: boolean;
  onData?: (data: string) => void; // one SSE "data:" payload
}

/** POSTs JSON. For streams, calls onData per SSE event and returns ''. Otherwise returns the raw body. */
async function httpCall(c: HttpCall): Promise<string> {
  const controller = new AbortController();
  const wd = watchdog(controller, c.idleMs);
  const timeoutErr = () => new Error(`Request timed out after ${Math.round(c.idleMs / 1000)}s`);
  const guard = async <T>(p: Promise<T>): Promise<T> => {
    try { return await p; } catch (e) { throw wd.didFire() ? timeoutErr() : e; }
  };

  try {
    const res = await guard(fetch(c.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...c.headers },
      body: JSON.stringify(c.body),
      signal: controller.signal,
    }));
    if (!res.ok) throw toApiError(res.status, await guard(res.text()).catch(() => ''));

    if (!c.stream) return await guard(res.text());

    if (!res.body) { // very old browsers: read everything, then replay the events
      const all = await guard(res.text());
      for (const line of all.split('\n')) if (line.startsWith('data:')) c.onData?.(line.slice(5).trim());
      return '';
    }

    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    const flush = (line: string) => {
      const l = line.replace(/\r$/, '');
      if (l.startsWith('data:')) c.onData?.(l.slice(5).trim());
    };
    for (;;) {
      const { done, value } = await guard(reader.read());
      if (done) break;
      wd.bump();
      buf += dec.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf('\n')) >= 0) {
        flush(buf.slice(0, nl));
        buf = buf.slice(nl + 1);
      }
    }
    if (buf.trim()) flush(buf);
    return '';
  } finally {
    wd.stop();
  }
}

export interface GenOpts {
  json?: boolean;
  timeoutMs?: number;            // see HttpCall.idleMs
  retries?: number;
  maxModels?: number;
  maxTokens?: number;
  stream?: boolean;              // default true
  onText?: (soFar: string) => void;
  log?: (line: string) => void;
}

const EMPTY = 'The AI returned no text. Please retry.';
const JSON_ONLY = 'Respond with valid JSON only: no markdown fences and no commentary.';

/* ---------------- Gemini ---------------- */

type AuthMode = 'header' | 'bearer' | 'query';
const AUTH_ORDER: AuthMode[] = ['header', 'bearer', 'query'];
const AUTH_LABEL: Record<AuthMode, string> = { header: 'x-goog-api-key', bearer: 'Bearer', query: '?key=' };
let workingAuth: AuthMode | null = null;
let workingKey = '';
const noThinking = new Set<string>(); // models that rejected the thinking setting

const GEMINI_FAST = ['gemini-3.5-flash-lite', 'gemini-3.6-flash', 'gemini-3.8-flash'];
const GEMINI_QUALITY = ['gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-3.5-flash-lite'];

export function geminiModels(cfg: AiConfig): string[] {
  if (cfg.model.trim()) return [cfg.model.trim()];
  return cfg.speed === 'fast' ? GEMINI_FAST : GEMINI_QUALITY;
}

/** Gemini 3 models think before answering, which is the main source of delay. Keep it short. */
function thinkingFor(model: string, speed: Speed): string | undefined {
  if (noThinking.has(model)) return undefined;
  if (model.includes('3.8-flash')) return 'low';                          // supports low/medium/high
  if (model.includes('3.6-flash') || model.includes('flash-lite')) return speed === 'fast' ? 'minimal' : 'low';
  return undefined;
}

async function geminiCall(
  cfg: AiConfig, model: string, prompt: string, o: GenOpts, mode: AuthMode, useThinking: boolean,
): Promise<string> {
  const key = cfg.apiKey.trim();
  const stream = o.stream !== false;
  const method = stream ? 'streamGenerateContent' : 'generateContent';
  const params: string[] = [];
  if (stream) params.push('alt=sse');
  if (mode === 'query') params.push(`key=${encodeURIComponent(key)}`);
  const url = `${PROVIDERS.gemini.baseUrl}/models/${model}:${method}${params.length ? '?' + params.join('&') : ''}`;

  const headers: Record<string, string> = {};
  if (mode === 'header') headers['x-goog-api-key'] = key;
  if (mode === 'bearer') headers['Authorization'] = `Bearer ${key}`;

  const thinking = useThinking ? thinkingFor(model, cfg.speed) : undefined;
  const generationConfig: Record<string, unknown> = {};
  if (o.json) generationConfig.responseMimeType = 'application/json';
  if (o.maxTokens) generationConfig.maxOutputTokens = o.maxTokens;
  if (thinking) generationConfig.thinkingConfig = { thinkingLevel: thinking };

  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    ...(Object.keys(generationConfig).length ? { generationConfig } : {}),
  };

  const textOf = (j: any): string => {
    if (j?.error) throw new ApiError(Number(j.error.code) || 502, String(j.error.message ?? 'Stream error'));
    const parts: any[] = j?.candidates?.[0]?.content?.parts ?? [];
    return parts.filter(p => !p?.thought).map(p => p?.text ?? '').join('');
  };

  try {
    let text = '';
    const idleMs = o.timeoutMs ?? 45_000;
    if (stream) {
      await httpCall({
        url, headers, body, idleMs, stream: true,
        onData: d => {
          if (!d) return;
          try { text += textOf(JSON.parse(d)); } catch (e) { if (e instanceof ApiError) throw e; }
          o.onText?.(text);
        },
      });
    } else {
      text = textOf(JSON.parse(await httpCall({ url, headers, body, idleMs, stream: false })));
    }
    if (!text.trim()) throw new Error(EMPTY);
    return text;
  } catch (e) {
    if (thinking && e instanceof ApiError && e.status === 400 && /think/i.test(e.message)) {
      noThinking.add(model);            // this model does not accept the setting: remember and retry without it
      return geminiCall(cfg, model, prompt, o, mode, false);
    }
    throw e;
  }
}

async function generateGemini(cfg: AiConfig, prompt: string, o: GenOpts): Promise<string> {
  const key = cfg.apiKey.trim();
  if (workingKey !== key) { workingKey = key; workingAuth = null; }
  const all = geminiModels(cfg);
  const models = all.slice(0, o.maxModels ?? all.length);
  const retries = o.retries ?? 1;
  let lastErr: unknown = new Error('No Gemini model could be reached.');
  let authErr: unknown;

  models: for (const model of models) {
    const isLast = model === models[models.length - 1];
    const modes: AuthMode[] = workingAuth ? [workingAuth] : AUTH_ORDER;
    for (const mode of modes) {
      for (let attempt = 0; attempt <= retries; attempt++) {
        const started = Date.now();
        try {
          const text = await geminiCall(cfg, model, prompt, o, mode, true);
          o.log?.(`OK    ${model} | ${AUTH_LABEL[mode]} | ${Date.now() - started} ms`);
          workingAuth = mode;
          return text;
        } catch (e) {
          lastErr = e;
          const { status, reason, message } = parseApiError(e);
          o.log?.(`FAIL  ${model} | ${AUTH_LABEL[mode]} | ${status ? `HTTP ${status}${reason ? ' ' + reason : ''}` : message.slice(0, 100)} | ${Date.now() - started} ms`);
          if (status === 404) continue models;                                  // model unavailable: next model
          if (!status && /timed out/i.test(message)) continue models;           // model silent: next model
          if (status === 401 || status === 403) { authErr ??= e; break; }       // login rejected: next login method
          if (status && [429, 500, 502, 503, 529].includes(status)) {           // overloaded / rate limited
            if (!isLast) continue models;                                       // switch model immediately
            if (attempt < retries) { await sleep(1500 * (attempt + 1)); continue; }
            throw e;
          }
          throw e;
        }
      }
    }
    if (authErr) throw authErr;
  }
  throw lastErr;
}

/* ---------------- OpenAI-compatible and Anthropic ---------------- */

const noExtras = new Set<string>();
let openRouterFree: string[] | null = null;

async function openRouterFreeModels(): Promise<string[]> {
  if (openRouterFree) return openRouterFree;
  const controller = new AbortController();
  const wd = watchdog(controller, 15_000);
  try {
    const res = await fetch(`${PROVIDERS.openrouter.baseUrl}/models`, { signal: controller.signal });
    const data: any = res.ok ? await res.json() : null;
    const list: any[] = Array.isArray(data?.data) ? data.data : [];
    openRouterFree = list
      .filter(m => typeof m?.id === 'string' && m.id.endsWith(':free'))
      .filter(m => (m?.architecture?.output_modalities ?? ['text']).includes('text'))
      .filter(m => (m?.context_length ?? 0) >= 32_000)
      .sort((a, b) => (b.context_length ?? 0) - (a.context_length ?? 0))
      .slice(0, 5)
      .map(m => m.id as string);
  } catch {
    openRouterFree = [];
  } finally {
    wd.stop();
  }
  return openRouterFree;
}

export function baseUrlOf(cfg: AiConfig): string {
  return (cfg.provider === 'custom' ? cfg.baseUrl : PROVIDERS[cfg.provider].baseUrl).trim().replace(/\/+$/, '');
}

async function compatModels(cfg: AiConfig): Promise<string[]> {
  const info = PROVIDERS[cfg.provider];
  const model = cfg.model.trim() || info.defaultModel;
  if (!model) throw new Error('Enter a model name (for example from the model list) for this provider.');
  if (cfg.provider === 'openrouter' && (model === 'openrouter/free' || model.endsWith(':free'))) {
    const extra = await openRouterFreeModels();
    return [model, ...extra.filter(m => m !== model)];
  }
  return [model];
}

async function openaiCall(cfg: AiConfig, model: string, prompt: string, o: GenOpts, useExtras: boolean): Promise<string> {
  const stream = o.stream !== false;
  const messages: { role: string; content: string }[] = [];
  if (o.json) messages.push({ role: 'system', content: JSON_ONLY });
  messages.push({ role: 'user', content: prompt });

  const extras = useExtras && cfg.provider === 'openai' && !noExtras.has(model) ? { reasoning_effort: 'low' } : {};
  const body = { model, messages, ...(stream ? { stream: true } : {}), ...extras };
  const url = `${baseUrlOf(cfg)}/chat/completions`;
  const headers = { Authorization: `Bearer ${cfg.apiKey.trim()}` };
  const idleMs = o.timeoutMs ?? 45_000;

  try {
    let text = '';
    if (stream) {
      await httpCall({
        url, headers, body, idleMs, stream: true,
        onData: d => {
          if (!d || d === '[DONE]') return;
          let j: any;
          try { j = JSON.parse(d); } catch { return; }
          if (j?.error) throw new ApiError(Number(j.error.code) || 502, String(j.error.message ?? 'Stream error'));
          const piece = j?.choices?.[0]?.delta?.content;
          if (typeof piece === 'string') { text += piece; o.onText?.(text); }
        },
      });
    } else {
      const j: any = JSON.parse(await httpCall({ url, headers, body, idleMs, stream: false }));
      if (j?.error) throw new ApiError(Number(j.error.code) || 502, String(j.error.message ?? 'Error')); // errors inside HTTP 200
      text = j?.choices?.[0]?.message?.content ?? '';
    }
    if (typeof text !== 'string' || !text.trim()) throw new Error(EMPTY);
    return text;
  } catch (e) {
    if (Object.keys(extras).length && e instanceof ApiError && e.status === 400) {
      noExtras.add(model);               // this model does not accept the reasoning setting: retry without it
      return openaiCall(cfg, model, prompt, o, false);
    }
    throw e;
  }
}

async function anthropicCall(cfg: AiConfig, model: string, prompt: string, o: GenOpts): Promise<string> {
  const stream = o.stream !== false;
  const body = {
    model,
    max_tokens: o.maxTokens ?? 8192,
    messages: [{ role: 'user', content: prompt }],
    ...(o.json ? { system: JSON_ONLY } : {}),
    ...(stream ? { stream: true } : {}),
  };
  const url = `${baseUrlOf(cfg)}/messages`;
  const headers = {
    'x-api-key': cfg.apiKey.trim(),
    'anthropic-version': '2023-06-01',
    'anthropic-dangerous-direct-browser-access': 'true', // required for calls made from a browser
  };
  const idleMs = o.timeoutMs ?? 45_000;

  let text = '';
  if (stream) {
    await httpCall({
      url, headers, body, idleMs, stream: true,
      onData: d => {
        if (!d) return;
        let j: any;
        try { j = JSON.parse(d); } catch { return; }
        if (j?.type === 'error') throw new ApiError(j.error?.type === 'overloaded_error' ? 529 : 502, String(j.error?.message ?? 'Stream error'), j.error?.type);
        if (j?.type === 'content_block_delta' && j.delta?.type === 'text_delta' && typeof j.delta.text === 'string') {
          text += j.delta.text;
          o.onText?.(text);
        }
      },
    });
  } else {
    const j: any = JSON.parse(await httpCall({ url, headers, body, idleMs, stream: false }));
    text = (Array.isArray(j?.content) ? j.content : []).filter((p: any) => p?.type === 'text').map((p: any) => p.text).join('');
  }
  if (!text.trim()) throw new Error(EMPTY);
  return text;
}

async function generateCompat(cfg: AiConfig, prompt: string, o: GenOpts): Promise<string> {
  const kind = PROVIDERS[cfg.provider].kind;
  const all = await compatModels(cfg);
  const models = all.slice(0, o.maxModels ?? all.length);
  const retries = o.retries ?? 2;
  let lastErr: unknown = new Error('No model could be reached.');

  for (let round = 0; round <= retries; round++) {
    let retryable = false;
    for (const model of models) {
      const started = Date.now();
      try {
        const text = kind === 'anthropic'
          ? await anthropicCall(cfg, model, prompt, o)
          : await openaiCall(cfg, model, prompt, o, true);
        o.log?.(`OK    ${PROVIDERS[cfg.provider].label} | ${model} | ${Date.now() - started} ms`);
        return text;
      } catch (e) {
        lastErr = e;
        const { status, message } = parseApiError(e);
        o.log?.(`FAIL  ${PROVIDERS[cfg.provider].label} | ${model} | ${status ? `HTTP ${status}` : message.slice(0, 100)} | ${Date.now() - started} ms`);
        if (status === 401 || status === 402 || status === 403) throw e;      // key or credit problem: nothing else will help
        if (!status && !/timed out/i.test(message)) throw e;                  // network / CORS problem
        if (!status || [429, 500, 502, 503, 504, 529].includes(status)) retryable = true;
        else if (models.length === 1) throw e;                                // 400/404 on the only model
      }
    }
    if (!retryable) break;
    if (round < retries) await sleep(2000 * (round + 1));
  }
  throw lastErr;
}

/* ---------------- public API ---------------- */

/** Sends one prompt to the configured provider and returns the full text. */
export function generate(cfg: AiConfig, prompt: string, opts: GenOpts = {}): Promise<string> {
  if (!cfg.apiKey.trim()) return Promise.reject(new Error('Add and verify your API key (top right) first.'));
  if (cfg.provider === 'custom' && !cfg.baseUrl.trim()) return Promise.reject(new Error('Enter the base URL of the service (for example https://api.groq.com/openai/v1).'));
  return PROVIDERS[cfg.provider].kind === 'gemini' ? generateGemini(cfg, prompt, opts) : generateCompat(cfg, prompt, opts);
}

/** Models offered to this key (used for the suggestions list). Never throws. */
export async function listModels(cfg: AiConfig): Promise<string[]> {
  const key = cfg.apiKey.trim();
  if (!key) return [];
  const kind = PROVIDERS[cfg.provider].kind;
  const controller = new AbortController();
  const wd = watchdog(controller, 15_000);
  try {
    if (kind === 'gemini') {
      const res = await fetch(`${PROVIDERS.gemini.baseUrl}/models?pageSize=200`, {
        headers: workingAuth === 'bearer' ? { Authorization: `Bearer ${key}` } : { 'x-goog-api-key': key },
        signal: controller.signal,
      });
      if (!res.ok) return [];
      const j: any = await res.json();
      return (j?.models ?? [])
        .filter((m: any) => (m?.supportedGenerationMethods ?? []).includes('generateContent'))
        .map((m: any) => String(m.name).replace(/^models\//, ''))
        .filter((id: string) => id.startsWith('gemini'));
    }
    const headers: Record<string, string> = kind === 'anthropic'
      ? { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' }
      : { Authorization: `Bearer ${key}` };
    const res = await fetch(`${baseUrlOf(cfg)}/models`, { headers, signal: controller.signal });
    if (!res.ok) return [];
    const j: any = await res.json();
    const ids: string[] = (j?.data ?? []).map((m: any) => String(m?.id)).filter(Boolean);
    return cfg.provider === 'openrouter' ? ids.slice(0, 400) : ids;
  } catch {
    return [];
  } finally {
    wd.stop();
  }
}