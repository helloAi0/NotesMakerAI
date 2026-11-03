/**
 * Code sandbox for the Solver. Browser: a throw-away Web Worker with the network and storage APIs removed and a hard timeout (the worker is terminated, so an
 * infinite loop cannot freeze the app). The runner is injectable so unit tests can use Node's vm.
 */
export interface RunResult { ok: boolean; out: string; value?: string; error?: string; ms: number; timedOut?: boolean }
export type CodeRunner = (code: string, ms?: number) => Promise<RunResult>;
const WORKER_SRC = `
const BLOCK=['fetch','XMLHttpRequest','WebSocket','importScripts','indexedDB','caches','localStorage','sessionStorage','EventSource','BroadcastChannel','Worker','SharedWorker','navigator'];
for(const n of BLOCK){try{Object.defineProperty(self,n,{value:undefined,configurable:true,writable:true})}catch(e){}}
const post=self.postMessage.bind(self);
const show=v=>{try{if(typeof v==='string')return v;if(typeof v==='function')return String(v);return JSON.stringify(v,(k,x)=>typeof x==='bigint'?x.toString()+'n':(typeof x==='number'&&!isFinite(x)?String(x):x))}catch(e){return String(v)}};
self.onmessage=e=>{const out=[];const log=(...a)=>{if(out.join('\\n').length<20000)out.push(a.map(show).join(' '))};
 const con={log,info:log,warn:log,error:log};
 try{let fn;try{fn=new Function('console','"use strict";return ('+e.data.code+'\\n)')}catch(_){fn=new Function('console','"use strict";'+e.data.code)}
  const v=fn(con);post({ok:true,out:out.join('\\n').slice(0,20000),value:v===undefined?undefined:show(v).slice(0,5000)})}
 catch(err){post({ok:false,out:out.join('\\n').slice(0,20000),error:String(err&&err.message||err)})}};`;
export const browserRunner: CodeRunner = (code, ms = 4000) => new Promise(resolve => {
  const t0 = Date.now();
  if (typeof Worker === 'undefined' || typeof Blob === 'undefined') return resolve({ ok: false, out: '', error: 'no sandbox available here', ms: 0 });
  let w: Worker | null = null; let url = '';
  const done = (r: Omit<RunResult, 'ms'>) => { clearTimeout(timer); try { w?.terminate(); } catch { /* gone */ } if (url) URL.revokeObjectURL(url); resolve({ ...r, ms: Date.now() - t0 }); };
  const timer = setTimeout(() => done({ ok: false, out: '', error: `stopped after ${ms} ms (possible infinite loop)`, timedOut: true }), ms);
  try { url = URL.createObjectURL(new Blob([WORKER_SRC], { type: 'text/javascript' })); w = new Worker(url); w.onmessage = e => done(e.data); w.onerror = e => done({ ok: false, out: '', error: e.message || 'worker error' }); w.postMessage({ code }); }
  catch (e) { done({ ok: false, out: '', error: (e as Error).message }); }
});
export const WORKER_SOURCE = WORKER_SRC;
