const fs=require('fs'),vm=require('vm'),path=require('path');const root=path.join(__dirname,'..');
const ctx={console,Math,performance,addEventListener(){},setTimeout,document:{getElementById:()=>({style:{},addEventListener(){}}),createElement:()=>({getContext:()=>null}),addEventListener(){},hasFocus:()=>false},requestAnimationFrame(){}};ctx.window=ctx;vm.createContext(ctx);
for(const f of ['data','map','sim','game','combat','abilities','commands','ai','render','ui'])vm.runInContext(fs.readFileSync(path.join(root,'js',f+'.js'),'utf8'),ctx,{filename:f});
vm.runInContext(`UI.ping=()=>{};UI.onUnitDied=()=>{};
G.init({players:[{race:'P',human:true},{race:'T',human:false}],seed:1}); G.players[1].ai=null; G.players[0].showVision=true;
const hx=G.players[0].startX, hy=G.players[0].startY;
const z=[]; for(let i=0;i<5;i++) z.push(G.spawnUnit('zealot',0,hx+200+i*20,hy+200));
const m=[]; for(let i=0;i<3;i++) m.push(G.spawnUnit('marine',1,hx+500+i*20,hy+200));
for(const u of z) u.setOrder({type:'attackmove',x:hx+500,y:hy+200});
for(let i=0;i<600;i++){ G.tick(); if(i%100===0) console.log('f'+i, z.map(u=>u.def.id[0]+Math.ceil(u.hp)+'/'+Math.ceil(u.sh)+':'+u.order.type+(u.order.target?'>'+u.order.target.def.id:'')+' d'+Math.round(u.stuck)).join(' '), '|', m.map(u=>Math.ceil(u.hp)+':'+u.order.type).join(' '));}
`,ctx);
