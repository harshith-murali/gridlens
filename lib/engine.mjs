// Deterministic, dependency-free, causal forecasting engine. Runs in the browser.
export const mean = a => a.reduce((s,x)=>s+x,0)/a.length;
export function rng(seed=42){return ()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};}
export function demo(kind='office') {
 const rand=rng(42), rows=[];
 for(let i=0;i<24*70;i++){
  const date=new Date(Date.UTC(2026,0,5)+i*3600000),h=date.getUTCHours(),day=date.getUTCDay();
  const temp=22+6*Math.sin((h-8)*Math.PI/12)+3*Math.sin(i/170)+(rand()-.5)*2;
  const pv=Math.max(0,9*Math.sin((h-6)*Math.PI/12))*(.8+.2*rand());
  const office=day>0&&day<6&&h>=9&&h<18;
  let load=kind==='office'?8+(office?18:1)+Math.max(0,temp-24)*1.2:7+12*Math.exp(-(((h-20)/3)**2))+7*Math.exp(-(((h-8)/2)**2));
  load+=2*Math.sin(i/110)+(rand()-.5)*3;
  const anomaly=i>1400&&(i%71===0||i%113===0);if(anomaly)load+=18;
  rows.push({timestamp:date.toISOString(),load:+Math.max(0,load).toFixed(3),temperature:+temp.toFixed(2),pv:+pv.toFixed(2),injected:anomaly,imputed:false});
 }return rows;
}
export function parseCSV(text){
 const lines=text.replace(/^\uFEFF/,'').trim().split(/\r?\n/); if(lines.length<505)throw Error('Provide at least 504 hourly observations (21 days).');
 if(lines.length>5001)throw Error('This browser prototype supports up to 5,000 rows.');
 const split=s=>{const out=[];let v='',q=false;for(let i=0;i<s.length;i++){if(s[i]==='"'){if(q&&s[i+1]==='"'){v+='"';i++;}else q=!q;}else if(s[i]===','&&!q){out.push(v.trim());v='';}else v+=s[i];}if(q)throw Error('Unclosed CSV quote.');out.push(v.trim());return out;};
 const header=split(lines[0]).map(s=>s.toLowerCase()), ti=header.indexOf('timestamp'),li=header.indexOf('load_kwh'),te=header.indexOf('temperature_c'),pi=header.indexOf('pv_kwh');
 if(ti<0||li<0)throw Error('Required columns: timestamp, load_kwh. Optional: temperature_c, pv_kwh.');
 let missing=0; const rows=[];
 for(let i=1;i<lines.length;i++){
  const a=split(lines[i]);if(a.length!==header.length)throw Error(`Row ${i+1}: wrong number of columns.`);
  if(!/T.*(?:Z|[+-]\d\d:\d\d)$/.test(a[ti]))throw Error(`Row ${i+1}: use an ISO timestamp with timezone, e.g. 2026-01-01T00:00:00Z.`);
  const time=Date.parse(a[ti]);if(!Number.isFinite(time))throw Error(`Row ${i+1}: invalid timestamp.`);
  if(rows.length&&time-Date.parse(rows.at(-1).timestamp)!==3600000)throw Error(`Row ${i+1}: timestamps must be ascending, unique, and exactly one hour apart. Add blank load rows for gaps of up to 4 hours.`);
  let load=Number(a[li]),imputed=false;
  if(a[li]===''){missing++;if(!rows.length||missing>4)throw Error(`Row ${i+1}: cannot fill leading or more than 4 consecutive missing loads.`);load=rows.at(-1).load;imputed=true;}else missing=0;
  if(!Number.isFinite(load)||load<0||load>1e7)throw Error(`Row ${i+1}: load must be finite and between 0 and 10,000,000 kWh.`);
  const optional=(ix,name)=>{if(ix<0||a[ix]==='')return null;const n=Number(a[ix]);if(!Number.isFinite(n)||Math.abs(n)>1e7||(name==='PV'&&n<0))throw Error(`Row ${i+1}: invalid ${name}.`);return n;};
  rows.push({timestamp:new Date(time).toISOString(),load,temperature:optional(te,'temperature'),pv:optional(pi,'PV'),imputed,injected:false});
 }return rows;
}
export function csv(rows){return 'timestamp,load_kwh,temperature_c,pv_kwh\n'+rows.map(r=>[r.timestamp,r.imputed?'':r.load,r.temperature??'',r.pv??''].join(',')).join('\n');}
function features(rows,i,exo){
 const d=new Date(i<rows.length?rows[i].timestamp:Date.parse(rows.at(-1).timestamp)+3600000), h=d.getUTCHours(),day=d.getUTCDay();
 const x=[rows[i-1].load,rows[i-2].load,rows[i-24].load,rows[i-168].load,mean(rows.slice(i-24,i).map(r=>r.load)),Math.sin(h*Math.PI/12),Math.cos(h*Math.PI/12),Math.sin(day*Math.PI*2/7),Math.cos(day*Math.PI*2/7),day>0&&day<6&&h>=9&&h<18?1:0];
 if(exo)x.push(rows[i-1].temperature??0,rows[i-1].pv??0,rows[i-1].temperature==null?1:0,rows[i-1].pv==null?1:0);
 return x;
}
function solve(A,b){const n=b.length;A=A.map((r,i)=>[...r,b[i]]);for(let i=0;i<n;i++){let p=i;for(let k=i+1;k<n;k++)if(Math.abs(A[k][i])>Math.abs(A[p][i]))p=k;[A[i],A[p]]=[A[p],A[i]];const v=A[i][i]||1e-12;for(let j=i;j<=n;j++)A[i][j]/=v;for(let k=0;k<n;k++)if(k!==i){const v=A[k][i];for(let j=i;j<=n;j++)A[k][j]-=v*A[i][j];}}return A.map(r=>r[n]);}
function ridge(X,y){const d=X[0].length,m=Array.from({length:d},(_,j)=>mean(X.map(x=>x[j]))),s=m.map((v,j)=>Math.sqrt(mean(X.map(x=>(x[j]-v)**2)))||1);const z=x=>[1,...x.map((v,j)=>(v-m[j])/s[j])],Z=X.map(z),A=Array.from({length:d+1},()=>Array(d+1).fill(0)),b=Array(d+1).fill(0);Z.forEach((x,k)=>x.forEach((v,i)=>{b[i]+=v*y[k];x.forEach((w,j)=>A[i][j]+=v*w);}));A.forEach((r,i)=>r[i]+=i?5:1e-8);const w=solve(A,b);return x=>z(x).reduce((s,v,i)=>s+v*w[i],0);}
function tree(X,y,depth,rand,subset=false){const value=mean(y);if(depth===0||y.length<16)return {value};let best=null,loss=Infinity;
 for(let j=0;j<X[0].length;j++){if(subset&&rand()>.65)continue;let lo=Infinity,hi=-Infinity;X.forEach(x=>{lo=Math.min(lo,x[j]);hi=Math.max(hi,x[j]);});for(let k=1;k<=7;k++){const t=lo+(hi-lo)*k/8;let nl=0,nr=0,sl=0,sr=0,ql=0,qr=0;X.forEach((x,i)=>{if(x[j]<=t){nl++;sl+=y[i];ql+=y[i]**2;}else{nr++;sr+=y[i];qr+=y[i]**2;}});if(nl<6||nr<6)continue;const l=ql-sl*sl/nl+qr-sr*sr/nr;if(l<loss){loss=l;best={j,t};}}}
 if(!best)return {value};const lx=[],ly=[],rx=[],ry=[];X.forEach((x,i)=>{if(x[best.j]<=best.t){lx.push(x);ly.push(y[i]);}else{rx.push(x);ry.push(y[i]);}});return {...best,left:tree(lx,ly,depth-1,rand,subset),right:tree(rx,ry,depth-1,rand,subset)};
}
const predictTree=(t,x)=>'value'in t?t.value:predictTree(x[t.j]<=t.t?t.left:t.right,x);
function forest(X,y,seed=7){const rand=rng(seed),trees=Array.from({length:18},()=>{const ids=Array.from({length:X.length},()=>Math.floor(rand()*X.length));return tree(ids.map(i=>X[i]),ids.map(i=>y[i]),5,rand,true);});return x=>mean(trees.map(t=>predictTree(t,x)));}
function boosting(X,y){const base=mean(y),p=y.map(()=>base),trees=[];for(let k=0;k<35;k++){const t=tree(X,y.map((v,i)=>v-p[i]),2,rng(k));trees.push(t);p.forEach((_,i)=>p[i]+=.12*predictTree(t,X[i]));}return x=>base+trees.reduce((s,t)=>s+.12*predictTree(t,x),0);}
export function metrics(actual,pred){const err=actual.map((y,i)=>Math.abs(y-pred[i]));const nz=actual.map((v,i)=>[v,i]).filter(([v])=>Math.abs(v)>1e-6);return {mae:mean(err),rmse:Math.sqrt(mean(err.map(v=>v*v))),mape:nz.length?mean(nz.map(([v,i])=>err[i]/Math.abs(v)))*100:null,mapeExcluded:actual.length-nz.length};}
export function run(rows,exo=true){
 const samples=[];for(let i=168;i<rows.length;i++)if(!rows[i].imputed)samples.push({i,x:features(rows,i,exo),y:rows[i].load});
 if(samples.length<300)throw Error('At least 300 observed targets are needed after the 7-day lag warm-up.');
 const a=Math.floor(samples.length*.5),b=Math.floor(samples.length*.7),c=Math.floor(samples.length*.8);
 const train=samples.slice(0,a),blend=samples.slice(a,b),cal=samples.slice(b,c),test=samples.slice(c);
 const fit=(fn,data)=>fn(data.map(r=>r.x),data.map(r=>r.y));const base=[fit(ridge,train),fit(forest,train),fit(boosting,train)];
 const metaRows=blend.map(r=>({...r,x:base.map(f=>f(r.x))}));const meta=[fit(ridge,metaRows),fit(forest,metaRows),fit(boosting,metaRows)];
 const hybrid=x=>Math.max(0,mean(meta.map(f=>f(base.map(g=>g(x))))));
 const names=['Hybrid stack','Ridge regression','Random forest','Gradient boosting','Previous hour','Same hour yesterday'];
 const predictors=[hybrid,...base.map(f=>x=>Math.max(0,f(x))),x=>x[0],x=>x[2]];
 const results=predictors.map((f,j)=>({name:names[j],...metrics(test.map(r=>r.y),test.map(r=>f(r.x)))}));
 const residuals=cal.map(r=>Math.abs(r.y-hybrid(r.x))).sort((a,b)=>a-b),q=residuals[Math.min(residuals.length-1,Math.ceil((residuals.length+1)*.9)-1)];
 const points=test.map(r=>({...rows[r.i],pred:hybrid(r.x),lower:Math.max(0,hybrid(r.x)-q),upper:hybrid(r.x)+q,index:r.i}));
 const coverage=mean(points.map(r=>r.load>=r.lower&&r.load<=r.upper?1:0))*100;
 const next=hybrid(features(rows,rows.length,exo));
 return {results,points,q,next,nextTimestamp:new Date(Date.parse(rows.at(-1).timestamp)+3600000).toISOString(),coverage,split:[train.length,blend.length,cal.length,test.length],trainEnd:rows[train.at(-1).i].timestamp,testStart:rows[test[0].i].timestamp,exo,imputed:rows.filter(r=>r.imputed).length};
}
