/**
 * AI transcription dictation. Same controller API as the browser's SpeechToTextController, but it records the
 * microphone itself (getUserMedia, the same path every web voice chat uses), cuts the audio into phrases with a simple
 * voice-activity detector and transcribes each phrase with the user's own AI key (Gemini, OpenAI, or any OpenAI-compatible
 * /audio/transcriptions server such as a local faster-whisper). Works in any browser, honours the chosen microphone.
 */
import { PROVIDERS, baseUrlOf, geminiModels } from './aiClient';
import type { AiConfig } from './aiClient';
import type { SttCallbacks, SttState } from './speechUtils';

export const MIC_DEVICE_KEY = 'nm_mic_device';
const lsGet = (k: string) => { try { return localStorage.getItem(k) || ''; } catch { return ''; } };

/* ---------------- audio helpers ---------------- */
export function downsample(input: Float32Array, from: number, to = 16000): Float32Array {
  if (from <= to) return input; const ratio = from / to, n = Math.floor(input.length / ratio), out = new Float32Array(n);
  for (let i = 0; i < n; i++) { const a = Math.floor(i * ratio), b = Math.min(input.length, Math.floor((i + 1) * ratio)); let sum = 0; for (let j = a; j < b; j++) sum += input[j]; out[i] = sum / Math.max(1, b - a); }
  return out;
}
export function encodeWav(samples: Float32Array, rate: number): Uint8Array {
  const buf = new ArrayBuffer(44 + samples.length * 2), v = new DataView(buf); const w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + samples.length * 2, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) { const x = Math.max(-1, Math.min(1, samples[i])); v.setInt16(44 + i * 2, x < 0 ? x * 0x8000 : x * 0x7fff, true); }
  return new Uint8Array(buf);
}
const b64 = (u: Uint8Array) => { let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); };
const LANG_NAME: Record<string, string> = { en: 'English', hi: 'Hindi', ar: 'Arabic', mr: 'Marathi', gu: 'Gujarati', ta: 'Tamil', te: 'Telugu', bn: 'Bengali', es: 'Spanish', fr: 'French', de: 'German' };

/* ---------------- transcription back-ends ---------------- */
export class SttHttpError extends Error { status: number; constructor(status: number, m: string) { super(m); this.status = status; } }
export function canTranscribe(cfg: AiConfig | null): { ok: boolean; why?: string } {
  if (!cfg) return { ok: false, why: 'Add an AI key in Settings (Gemini or OpenAI) to use AI transcription.' };
  if (cfg.provider === 'anthropic' || cfg.provider === 'openrouter') return { ok: false, why: `${PROVIDERS[cfg.provider].label} does not offer speech-to-text. Choose Gemini or OpenAI (or a local Whisper server as “Other”) in Settings.` };
  return { ok: true };
}
/** Transcribe one 16 kHz mono WAV clip. Returns '' for silence. */
export async function transcribeWav(cfg: AiConfig, wav: Uint8Array, lang: string, signal?: AbortSignal): Promise<string> {
  const code = lang.slice(0, 2).toLowerCase(); const name = LANG_NAME[code] ?? '';
  if (cfg.provider === 'gemini') {
    const prompt = `Transcribe this audio exactly as spoken${name ? ` (the language is ${name})` : ''}. Output only the spoken words with normal punctuation, nothing else. If there is no clear human speech, output exactly: [silence]`;
    const body = JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }, { inline_data: { mime_type: 'audio/wav', data: b64(wav) } }] }], generationConfig: { temperature: 0, maxOutputTokens: 600 } });
    let lastErr: Error = new Error('Transcription failed');
    for (const model of geminiModels(cfg)) {
      const res = await fetch(`${PROVIDERS.gemini.baseUrl}/models/${model}:generateContent`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': cfg.apiKey.trim() }, body, signal });
      if (res.status === 404 || res.status === 400) { lastErr = new SttHttpError(res.status, `Model ${model} rejected the request (${res.status}).`); continue; }
      if (!res.ok) throw new SttHttpError(res.status, (await res.text().catch(() => '')).slice(0, 200));
      const j = await res.json(); const t = (j?.candidates?.[0]?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? '').join('').trim();
      return /^\[?silence\]?\.?$/i.test(t) ? '' : t;
    }
    throw lastErr;
  }
  // OpenAI and OpenAI-compatible servers
  const model = lsGet('nm_stt_model') || (cfg.provider === 'custom' && /whisper|transcri|parakeet|distil/i.test(cfg.model) ? cfg.model : cfg.provider === 'openai' ? 'whisper-1' : 'whisper-1');
  const form = new FormData(); form.append('file', new Blob([wav as BlobPart], { type: 'audio/wav' }), 'speech.wav'); form.append('model', model); form.append('response_format', 'json'); form.append('temperature', '0'); if (LANG_NAME[code]) form.append('language', code);
  const headers: Record<string, string> = {}; if (cfg.apiKey.trim()) headers.Authorization = `Bearer ${cfg.apiKey.trim()}`;
  const res = await fetch(`${baseUrlOf(cfg)}/audio/transcriptions`, { method: 'POST', headers, body: form, signal });
  if (!res.ok) throw new SttHttpError(res.status, (await res.text().catch(() => '')).slice(0, 200));
  const j = await res.json(); return String(j?.text ?? '').trim();
}
const HALLUCINATIONS = /^(?:thank you\.?|thanks for watching\.?|you\.?|bye\.?|\.+|\[.*\]|\(.*\))$/i;

/* ---------------- controller ---------------- */
export class CloudDictationController {
  lang = 'en-US'; continuous = true;
  private cb: SttCallbacks; private state: SttState = 'idle';
  private getCfg: () => AiConfig | null;
  private stream: MediaStream | null = null; private ctx: AudioContext | null = null; private proc: ScriptProcessorNode | null = null; private src: MediaStreamAudioSourceNode | null = null;
  private pre: Float32Array[] = []; private seg: Float32Array[] = []; private inSeg = false; private segStart = 0; private lastVoice = 0; private lastPartialAt = 0; private voiceMs = 0;
  private noise = 0.004; private heard = false; private queue: Promise<void> = Promise.resolve(); private pending = 0; private seq = 0; private abort: AbortController | null = null; private rate = 48000; private stopping = false;

  constructor(getCfg: () => AiConfig | null, cb: SttCallbacks = {}) { this.getCfg = getCfg; this.cb = cb; }
  get supported() { return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && !!(window.AudioContext || (window as unknown as { webkitAudioContext?: unknown }).webkitAudioContext); }
  get status() { return this.state; }
  setCallbacks(cb: SttCallbacks) { this.cb = cb; }
  private setState(s: SttState) { if (this.state !== s) { this.state = s; this.cb.onState?.(s); } }

  async start() {
    if (this.state === 'listening' || this.state === 'starting') return;
    const ok = canTranscribe(this.getCfg()); if (!ok.ok) { this.cb.onError?.(ok.why!, 'no-key'); return; }
    if (!window.isSecureContext) { this.cb.onError?.('The microphone only works on https:// or http://localhost.', 'insecure'); return; }
    this.setState('starting'); this.stopping = false; this.abort = new AbortController();
    try {
      const id = lsGet(MIC_DEVICE_KEY);
      try { this.stream = await navigator.mediaDevices.getUserMedia({ audio: id ? { deviceId: { exact: id }, echoCancellation: true, noiseSuppression: true, autoGainControl: true } : { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }); }
      catch (e) { if (id && (e as DOMException).name === 'OverconstrainedError') { try { localStorage.removeItem(MIC_DEVICE_KEY); } catch { /* ignore */ } this.stream = await navigator.mediaDevices.getUserMedia({ audio: true }); } else throw e; }
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AC(); await this.ctx.resume(); this.rate = this.ctx.sampleRate;
      this.src = this.ctx.createMediaStreamSource(this.stream); this.proc = this.ctx.createScriptProcessor(4096, 1, 1);
      const mute = this.ctx.createGain(); mute.gain.value = 0; this.src.connect(this.proc); this.proc.connect(mute); mute.connect(this.ctx.destination);
      this.proc.onaudioprocess = e => this.onAudio(new Float32Array(e.inputBuffer.getChannelData(0)));
      this.heard = false; this.noise = 0.004; this.pre = []; this.seg = []; this.inSeg = false; this.cb.onSignal?.('audio'); this.setState('listening');
      setTimeout(() => { if (this.state === 'listening' && !this.heard) this.cb.onError?.('The microphone is open but silent. Choose the right microphone under “Test microphone” (the one whose bar moves), then dictate again.', 'no-sound'); }, 8000);
    } catch (e) {
      this.teardown(); this.setState('idle'); const n = (e as DOMException).name;
      this.cb.onError?.(n === 'NotAllowedError' || n === 'SecurityError' ? 'Microphone permission was denied. Click the lock icon in the address bar and allow the microphone.' : n === 'NotFoundError' ? 'No microphone was found.' : n === 'NotReadableError' ? 'The microphone is busy in another app. Close it and retry.' : `Could not open the microphone (${n || (e as Error).message}).`, n || 'start-failed');
    }
  }

  private onAudio(frame: Float32Array) {
    if (this.state !== 'listening') return;
    let sum = 0; for (let i = 0; i < frame.length; i++) sum += frame[i] * frame[i]; const rms = Math.sqrt(sum / frame.length), now = performance.now();
    const thr = Math.max(0.012, this.noise * 3.2); const voice = rms > thr;
    if (!voice) this.noise = this.noise * 0.95 + rms * 0.05; // follow the room noise while nobody speaks
    if (voice) { if (!this.heard) this.heard = true; this.cb.onSignal?.('speech'); } else if (rms > this.noise * 1.5) this.cb.onSignal?.('sound');
    if (!this.inSeg) {
      this.pre.push(frame); if (this.pre.length > 4) this.pre.shift();
      if (voice) { this.inSeg = true; this.seg = [...this.pre]; this.pre = []; this.segStart = now; this.lastVoice = now; this.lastPartialAt = now; this.voiceMs = 0; }
      return;
    }
    this.seg.push(frame); if (voice) { this.lastVoice = now; this.voiceMs += frame.length / this.rate * 1000; }
    if (now - this.lastVoice > 750 || now - this.segStart > 12000) { this.endSegment(true); return; }
    if (now - this.lastPartialAt > 2500 && this.voiceMs > 400) { this.lastPartialAt = now; this.requestClip(false); }
  }
  private clip(): Uint8Array { let n = 0; for (const f of this.seg) n += f.length; const all = new Float32Array(n); let o = 0; for (const f of this.seg) { all.set(f, o); o += f.length; } return encodeWav(downsample(all, this.rate), Math.min(16000, this.rate)); }
  private endSegment(final: boolean) {
    if (!this.inSeg) return; const long = this.voiceMs >= 250; if (long && final) this.requestClip(true);
    this.inSeg = false; this.seg = []; this.voiceMs = 0; if (!long) this.cb.onInterim?.('');
  }
  private requestClip(final: boolean) {
    const cfg = this.getCfg(); if (!cfg) return; const wav = this.clip(); const mine = ++this.seq;
    if (!final && this.pending > 0) return; // one request at a time for live previews
    this.pending++; const signal = this.abort?.signal;
    this.queue = this.queue.then(async () => {
      try {
        const text = await transcribeWav(cfg, wav, this.lang, signal);
        if (signal?.aborted) return;
        if (final) { if (text && !HALLUCINATIONS.test(text)) this.cb.onFinal?.(text, [text]); else this.cb.onInterim?.(''); }
        else if (mine === this.seq && this.inSeg && text && !HALLUCINATIONS.test(text)) this.cb.onInterim?.(text);
      } catch (e) {
        if (signal?.aborted) return; const st = (e as SttHttpError).status;
        if (final || st === 401 || st === 403) { this.cb.onError?.(st === 401 || st === 403 ? 'The AI provider rejected your key for transcription. Check the key in Settings.' : st === 429 ? 'Transcription rate limit reached. Pause for a moment and continue.' : `Transcription failed${st ? ` (${st})` : ''}: ${(e as Error).message.slice(0, 120)}`, 'transcribe'); if (st === 401 || st === 403) this.cancel(); }
      } finally { this.pending--; }
    });
  }
  private teardown() { try { this.proc && (this.proc.onaudioprocess = null); this.proc?.disconnect(); this.src?.disconnect(); } catch { /* ignore */ } this.stream?.getTracks().forEach(t => t.stop()); void this.ctx?.close().catch(() => undefined); this.proc = null; this.src = null; this.stream = null; this.ctx = null; }

  pause() { if (this.state === 'listening') { this.endSegment(true); this.setState('paused'); } }
  resume() { if (this.state === 'paused') { this.setState('listening'); } }
  /** Stop; the phrase being spoken is still transcribed and delivered. */
  stop() {
    if (this.state === 'idle' || this.stopping) return; this.stopping = true; this.endSegment(true); this.cb.onSignal?.('none');
    void this.queue.then(() => { this.teardown(); this.setState('idle'); this.stopping = false; this.cb.onInterim?.(''); });
  }
  cancel() { this.abort?.abort(); this.stopping = false; this.inSeg = false; this.seg = []; this.cb.onInterim?.(''); this.cb.onSignal?.('none'); this.teardown(); this.setState('idle'); }
}
