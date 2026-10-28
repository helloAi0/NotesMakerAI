import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { httpBase, initialRun, reduce } from '../lib/clawbot/protocol';
import type { Mode, RunState, ServerEvent } from '../lib/clawbot/protocol';

export type ConnStatus = 'connecting' | 'open' | 'closed';
export interface ClawBotConfig { url: string; token: string }
export interface HistoryTurn { role: 'user' | 'assistant'; content: string }
export interface FeedbackBody { action: 'edit' | 'reject' | 'accept'; run_id?: string | null; question?: string; generated_text?: string; edited_text?: string; comment?: string }
export interface FeedbackResult { ok: boolean; stored: { code: string; scope: string; count: number }[]; promoted: string[]; reason?: string }

export const DEFAULT_URL = 'ws://127.0.0.1:8765/ws';
const KEY = 'nm_clawbot_cfg';

export function loadConfig(): ClawBotConfig {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) { const o = JSON.parse(raw); return { url: typeof o.url === 'string' && o.url ? o.url : DEFAULT_URL, token: typeof o.token === 'string' ? o.token : '' }; }
  } catch { /* storage unavailable: fall through */ }
  return { url: DEFAULT_URL, token: '' };
}
export function saveConfig(c: ClawBotConfig): void { try { localStorage.setItem(KEY, JSON.stringify(c)); } catch { /* ignore */ } }

const MAX_BACKOFF = 15_000;

/** Live connection to ClawBot Core: auto-reconnect, heartbeat, streaming run state, mode toggle, feedback. */
export function useClawBotSocket(config: ClawBotConfig) {
  const [status, setStatus] = useState<ConnStatus>('connecting');
  const [mode, setModeState] = useState<Mode>('online');
  const [run, dispatch] = useReducer(reduce, undefined, () => initialRun('online'));
  const [attempt, setAttempt] = useState(0);
  const wsRef = useRef<WebSocket | null>(null);
  const modeRef = useRef<Mode>('online');
  const runRef = useRef<RunState>(run);
  runRef.current = run;
  const stopped = useRef(false);

  useEffect(() => {
    stopped.current = false;
    let ws: WebSocket | null = null;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let ping: ReturnType<typeof setInterval> | undefined;
    let tries = 0;

    const open = () => {
      if (stopped.current) return;
      setStatus('connecting');
      let sock: WebSocket;
      try {
        const u = new URL(config.url);
        if (config.token) u.searchParams.set('token', config.token);
        sock = new WebSocket(u.toString());
      } catch {
        setStatus('closed');
        dispatch({ type: 'local-error', message: `Invalid ClawBot URL: ${config.url}`, now: Date.now() });
        return;
      }
      ws = sock; wsRef.current = sock;
      sock.onopen = () => {
        tries = 0; setStatus('open'); setAttempt(0);
        sock.send(JSON.stringify({ type: 'set_mode', mode: modeRef.current }));
        ping = setInterval(() => { if (sock.readyState === WebSocket.OPEN) sock.send('{"type":"ping"}'); }, 25_000);
      };
      sock.onmessage = (m: MessageEvent) => {
        if (typeof m.data !== 'string') return;
        try { const ev = JSON.parse(m.data) as ServerEvent; if (ev && typeof ev.event === 'string') dispatch({ type: 'server', ev, now: Date.now() }); } catch { /* ignore malformed frame */ }
      };
      sock.onclose = () => {
        clearInterval(ping);
        if (wsRef.current === sock) wsRef.current = null;
        setStatus('closed');
        dispatch({ type: 'connection-lost', now: Date.now() });
        if (stopped.current) return;
        const delay = Math.min(MAX_BACKOFF, 500 * 2 ** tries++) * (0.75 + Math.random() * 0.5);
        setAttempt(tries);
        retry = setTimeout(open, delay);
      };
      sock.onerror = () => { try { sock.close(); } catch { /* already closed */ } };
    };
    open();
    return () => {
      stopped.current = true;
      clearTimeout(retry); clearInterval(ping);
      if (ws) { ws.onclose = null; ws.onerror = null; try { ws.close(1000); } catch { /* ignore */ } }
      wsRef.current = null;
    };
  }, [config.url, config.token]);

  const send = useCallback((obj: unknown): boolean => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    ws.send(JSON.stringify(obj));
    return true;
  }, []);

  const setMode = useCallback((m: Mode) => {
    modeRef.current = m; setModeState(m);
    send({ type: 'set_mode', mode: m });
  }, [send]);

  const ask = useCallback((question: string, history: HistoryTurn[] = []): boolean => {
    const q = question.trim();
    if (!q || runRef.current.phase === 'running') return false;
    dispatch({ type: 'ask', question: q, mode: modeRef.current, now: Date.now() });
    if (!send({ type: 'ask', question: q, mode: modeRef.current, history: history.slice(-12) })) {
      dispatch({ type: 'local-error', message: 'Not connected to ClawBot Core. Start the server and check the URL in Settings.', now: Date.now() });
      return false;
    }
    return true;
  }, [send]);

  const cancel = useCallback(() => { send({ type: 'cancel' }); }, [send]);
  const reset = useCallback(() => dispatch({ type: 'reset' }), []);

  const sendFeedback = useCallback(async (body: FeedbackBody): Promise<FeedbackResult> => {
    const base = httpBase(config.url);
    if (!base) throw new Error('Invalid server URL');
    const res = await fetch(`${base}/api/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(config.token ? { Authorization: `Bearer ${config.token}` } : {}) },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      let detail = res.statusText;
      try { const j = await res.json(); detail = typeof j.detail === 'string' ? j.detail : JSON.stringify(j.detail); } catch { /* keep statusText */ }
      throw new Error(`Feedback rejected (${res.status}): ${detail}`);
    }
    return (await res.json()) as FeedbackResult;
  }, [config.url, config.token]);

  return useMemo(() => ({ status, attempt, mode, setMode, run, ask, cancel, reset, sendFeedback }),
    [status, attempt, mode, setMode, run, ask, cancel, reset, sendFeedback]);
}
