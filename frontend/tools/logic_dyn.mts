import { quadcopter, mclLocalisation, bullwhip } from '../src/sims/univ_biz_robot';
import { lbmCylinder, nBody, isingModel } from '../src/sims/univ_sci';
const defs=(s:any)=>Object.fromEntries(s.params.map((p:any)=>[p.id,p.value]));
const run=(s:any,v:any,sec:number,st?:any)=>{const x=st??s.init(v); const dt=s.dt; for(let i=0;i<sec/dt;i++) s.step(x,v,dt); return x;};
let v=defs(quadcopter); let q=run(quadcopter,{...v,xt:3},5.5); console.log('quad x@5.5s',q.x.toFixed(2),'z',q.z.toFixed(2), Math.abs(q.x-0)<9?'':'' );
let m=run(mclLocalisation,defs(mclLocalisation),40); console.log('mcl err',m.err.slice(-20).reduce((a:number,b:number)=>a+b,0)/20, 'neff',m.neff.toFixed(0));
let b=run(bullwhip,defs(bullwhip),20); const va=(a:number[])=>{const mu=a.reduce((x,y)=>x+y,0)/a.length;return a.reduce((x,y)=>x+(y-mu)**2,0)/a.length}; console.log('bullwhip var ratio factory/demand',(va(b.ord[3])/va(b.dem)).toFixed(1));
for (const Re of [5,40,100,140]){ const vv={...defs(lbmCylinder)}; const k=lbmCylinder.params.find((p:any)=>/re/i.test(p.id)); if(k) (vv as any)[k.id]=Re; try{const s=run(lbmCylinder,vv,20); console.log('lbm Re',Re,'finite',JSON.stringify(s).includes('null')?'NaN?':'ok');}catch(e){console.log('lbm err',e)} }
let nb=nBody.init(defs(nBody)); const e0=nBody.readouts?.(nb,defs(nBody)); run(nBody,defs(nBody),10,nb); console.log('nbody',JSON.stringify(e0?.slice(0,3)),JSON.stringify(nBody.readouts?.(nb,defs(nBody))?.slice(0,3)));
let is=run(isingModel,defs(isingModel),10); console.log('ising',JSON.stringify(isingModel.readouts?.(is,defs(isingModel))?.slice(0,3)));
b=run(bullwhip,defs(bullwhip),20); console.log('bullwhip2',(va(b.ord[3])/va(b.dem)).toFixed(1),(va(b.ord[0])/va(b.dem)).toFixed(1));
b=run(bullwhip,{...defs(bullwhip),share:true},20); console.log('bullwhip shared',(va(b.ord[3])/va(b.dem)).toFixed(1));
q=run(quadcopter,{...v,xt:3},11.5); console.log('quad x@11.5',q.x.toFixed(2),q.z.toFixed(2));
for (const n of [200,500]) {const mm=run(mclLocalisation,{...defs(mclLocalisation),n,sl:0.05},60); const e=mm.err; console.log('mcl',n,e.slice(0,5).map((x:number)=>x.toFixed(1)).join(','),'..',e.slice(-5).map((x:number)=>x.toFixed(2)).join(','));}
for (const [n,sl] of [[200,0.1],[300,0.1],[150,0.3],[100,0.05]] as number[][]) {const mm=run(mclLocalisation,{...defs(mclLocalisation),n,sl},50); const e=mm.err; console.log('mcl2',n,sl,e.slice(-3).map((x:number)=>x.toFixed(2)).join(','));}
