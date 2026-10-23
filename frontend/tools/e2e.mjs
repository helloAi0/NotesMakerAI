import { chromium } from '/home/claude/.npm-global/lib/node_modules/playwright/index.mjs';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }).catch(()=>chromium.launch());
const pg = await b.newPage({ viewport: { width: 1400, height: 900 } });
const errs=[]; pg.on('pageerror', e=>errs.push(e.message)); pg.on('console', m=>{ if(m.type()==='error') errs.push(m.text()); });
await pg.addInitScript(() => {
  window.__spoken = []; window.__recs = [];
  const synth = { speaking:false, paused:false, _u:null, getVoices(){return []}, addEventListener(){}, removeEventListener(){},
    speak(u){ window.__spoken.push(u.text); this._u=u; setTimeout(()=>{u.onstart&&u.onstart({}); }, 0); },
    cancel(){ this._u=null; }, pause(){this.paused=true}, resume(){this.paused=false} };
  Object.defineProperty(window,'speechSynthesis',{value:synth,configurable:true});
  window.SpeechSynthesisUtterance = function(t){ this.text=t; };
  window.SpeechRecognition = function(){ const r=this; r.start=()=>{ window.__recs.push(r); window.__started=(window.__started||0)+1; setTimeout(()=>r.onstart&&r.onstart(),0); }; r.stop=()=>{ setTimeout(()=>r.onend&&r.onend(),0); }; r.abort=r.stop; };
});
await pg.goto('http://localhost:5199/'); await pg.waitForTimeout(800);
const check=(n,ok)=>console.log(ok?'PASS':'FAIL',n);
check('mic not opened on load', !(await pg.evaluate(()=>window.__started)));
// click-to-speak
await pg.click('[data-seg="c-0"]'); await pg.waitForTimeout(200);
let sp = await pg.evaluate(()=>window.__spoken);
check('click sentence speaks content', sp.length===1 && /reproductive/i.test(sp[0]));
await pg.click('[data-seg="c-0"]'); await pg.waitForTimeout(100);
// Voice tab
await pg.click('button:has-text("Voice")'); await pg.waitForTimeout(100);
await pg.click('button:has-text("Start dictation")'); await pg.waitForTimeout(200);
check('mic opened after click', (await pg.evaluate(()=>window.__started))===1);
await pg.evaluate(()=>{ const r=window.__recs[0]; r.onresult({resultIndex:0,results:[Object.assign([{transcript:'force equals mass times acceleration comma',confidence:.9}],{isFinal:true})]}); });
await pg.waitForTimeout(200);
const ta = await pg.inputValue('textarea');
console.log('notes:', JSON.stringify(ta));
check('dictation inserted, existing note kept', /Human anatomy/.test(ta) && /Force equals mass/.test(ta));
await pg.click('button:has-text("Stop")'); 
// Equation dictation
await pg.click('button:has-text("Equation Dictation")');
await pg.fill('textarea[placeholder^="e.g."]', 'one over x plus one');
await pg.click('button:has-text("Convert to equation")');
check('ambiguity asks choice', await pg.isVisible('text=could mean more than one'));
check('insert disabled before choice', await pg.isDisabled('button:has-text("Insert Equation")'));
await pg.locator('input[name=cand]').nth(1).check();
check('insert enabled after choice', !(await pg.isDisabled('button:has-text("Insert Equation")')));
await pg.screenshot({path:'/tmp/eq.png'});
await pg.click('button:has-text("Insert Equation")');
const ta2 = await pg.inputValue('textarea'); console.log('notes2:', JSON.stringify(ta2));
check('equation inserted', /\$\\frac\{1\}\{x\+1\}\$/.test(ta2));
await pg.click('button:has-text("Done editing")'); await pg.waitForTimeout(200);
check('katex rendered in read mode', await pg.locator('.katex').count()>0);
// speak equation sentence
const idx = await pg.evaluate(()=>[...document.querySelectorAll('[data-seg^=n]')].findIndex(e=>e.querySelector('.katex')));
await pg.locator('[data-seg^=n]').nth(idx).click(); await pg.waitForTimeout(200);
sp = await pg.evaluate(()=>window.__spoken); console.log('last spoken:', sp.at(-1));
check('equation spoken as words', /one over x plus one/i.test(sp.at(-1)));
// refresh persistence
await pg.reload(); await pg.waitForTimeout(600);
check('notes persist after refresh', (await pg.locator('body').innerText()).includes('Force equals mass'));
await pg.screenshot({path:'/tmp/nb.png'});
// ribbon tabs have no dead buttons: click each
for (const t of ['Insert','Draw','AI Assistant','Home']) { await pg.click(`button:has-text("${t}")`); }
console.log('errors:', errs);
await b.close();
