const fs=require('fs'),vm=require('vm'),path=require('path');const root=path.join(__dirname,'..');
const ctx={console,Math,performance,addEventListener(){},setTimeout,document:{getElementById:()=>({style:{},addEventListener(){}}),createElement:()=>({getContext:()=>null}),addEventListener(){},hasFocus:()=>false},requestAnimationFrame(){}};ctx.window=ctx;vm.createContext(ctx);
for(const f of ['data','map','sim','game','combat','abilities','commands','ai','render','ui'])vm.runInContext(fs.readFileSync(path.join(root,'js',f+'.js'),'utf8'),ctx,{filename:f});
const r=(process.argv[2]||'PZ').split(''); const frames=parseInt(process.argv[3]||'9600');
vm.runInContext(`UI.ping=()=>{};UI.onUnitDied=()=>{};
G.init({players:[{race:'${r[0]}',human:true},{race:'${r[1]}',human:false}],seed:1,layout:'temple'}); G.players[0].human=false; G.players[0].ai=new AI(G.players[0],'normal'); G.players[0].ai.debug=true; G.players[1].ai.debug=true;
for(let i=0;i<${frames};i++){ G.tick(); if(i%1200===0){ for(const p of G.players){ const b={}; for(const u of G.units) if(u.alive&&u.owner===p.id&&u.isBuilding) b[u.def.id]=(b[u.def.id]||0)+1; const a={}; for(const u of G.units) if(u.alive&&u.owner===p.id&&!u.isBuilding&&!u.def.worker) a[u.def.id]=(a[u.def.id]||0)+1; console.log('f'+i,p.race,'m'+Math.floor(p.minerals),'g'+Math.floor(p.gas),p.supUsed+'/'+p.supMax,'idx'+p.ai.scriptIdx,p.ai.state,JSON.stringify(b),JSON.stringify(a)); } } }
console.log('over',G.over,'winner',G.winner);`,ctx);
