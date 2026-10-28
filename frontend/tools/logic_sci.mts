import { blackScholes, nashAnalysis, armFK, ikStep } from '../src/sims/univ_biz_robot';
const ok=(c:boolean,m:string)=>{console.log((c?'PASS ':'FAIL ')+m); if(!c) process.exitCode=1;};
const c=blackScholes(100,100,1,0.05,0.2,true), p=blackScholes(100,100,1,0.05,0.2,false);
ok(Math.abs(c.price-10.4506)<0.01,'BS call 10.4506 got '+c.price);
ok(Math.abs(c.price-p.price-(100-100*Math.exp(-0.05)))<1e-6,'put-call parity');
const pd=nashAnalysis({name:'',A:[[-1,-3],[0,-2]],B:[[-1,0],[-3,-2]]}); ok(pd.pure.length===1&&pd.pure[0][0]===1&&pd.pure[0][1]===1,'PD -> (D,D)');
const mp=nashAnalysis({name:'',A:[[1,-1],[-1,1]],B:[[-1,1],[1,-1]]}); ok(!!mp.mixed&&Math.abs(mp.mixed[0]-0.5)<1e-9&&mp.pure.length===0,'pennies mixed 0.5');
let q=[0,0.5,-1,0,0.5,0]; const t:[number,number,number]=[0.6,0.3,0.5]; let e=1; for(let i=0;i<200;i++){const r=ikStep(q,t); q=r.q; e=r.err;} ok(e<0.002,'IK converges err '+e);
const pts=armFK([0,0,0,0,0,0]).pts; ok(Math.abs(pts[pts.length-1][0]-(0.45+0.4+0.12+0.1))<1e-9,'FK straight reach');
