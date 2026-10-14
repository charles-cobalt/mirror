// Best-effort, on-device OCR of a TradingView screenshot. Nothing is uploaded anywhere.
// Returns only what could be read; every value must be confirmed by the user.
let _w;
function loadScript(src){return new Promise((res,rej)=>{const s=document.createElement('script');s.src=src;s.onload=res;s.onerror=rej;document.head.appendChild(s)})}
async function worker(){if(_w)return _w;if(!window.Tesseract)await loadScript('https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js');_w=await Tesseract.createWorker('eng');return _w}
function toCanvas(img,box,scale,invert){const [x,y,w,h]=box;const c=document.createElement('canvas');c.width=Math.round(w*scale);c.height=Math.round(h*scale);const g=c.getContext('2d');g.imageSmoothingQuality='high';g.filter='grayscale(1)'+(invert?' invert(1)':'');g.drawImage(img,x,y,w,h,0,0,c.width,c.height);return c}
function maskArrow(c,col){const g=c.getContext('2d'),d=g.getImageData(0,0,c.width,c.height),a=d.data;for(let i=0;i<a.length;i+=4){const r=a[i],gg=a[i+1],b=a[i+2];if((r>150&&gg<130&&b<140&&r-gg>70)||(b>150&&r<130&&b-r>70&&b-gg>40)){a[i]=a[i+1]=a[i+2]=col}}g.putImageData(d,0,0);return c}
async function ocrD(w,canvas,psm,wl){await w.setParameters({tessedit_pageseg_mode:String(psm),tessedit_char_whitelist:wl||''});return (await w.recognize(canvas)).data}
function qtyFrom(d){const S=(d.symbols||[]).map(x=>({t:x.text,x0:x.bbox.x0,x1:x.bbox.x1,y0:x.bbox.y0,y1:x.bbox.y1}));const at=S.findIndex(x=>x.t==='@');if(at<0)return null;const R=S.slice(at+1).filter(x=>/\d/.test(x.t));if(R.length<4)return null;const hs=R.map(x=>x.y1-x.y0).sort((a,b)=>a-b),h=hs[hs.length>>1],cs=R.map(x=>(x.y0+x.y1)/2).sort((a,b)=>a-b),cy=cs[cs.length>>1];let q='',prev=S[at].x0;for(let i=at-1;i>=0;i--){const x=S[i];if(!/\d/.test(x.t))break;if(Math.abs((x.y0+x.y1)/2-cy)>.25*h||(x.y1-x.y0)<.6*h||(x.y1-x.y0)>1.9*h)break;if(prev-x.x1>1.4*h)break;q=x.t+q;prev=x.x0}return q&&q.length<=3?q:null}
async function ocr(w,canvas,psm,wl){await w.setParameters({tessedit_pageseg_mode:String(psm),tessedit_char_whitelist:wl||''});return (await w.recognize(canvas)).data.text}
// find the blue quantity box of TradingView's open-position pill (about 20x20px, rgb ~ 41,98,255)
function findPositionPill(img){const W=img.naturalWidth,H=img.naturalHeight;const c=document.createElement('canvas');c.width=W;c.height=H;const g=c.getContext('2d');g.drawImage(img,0,0);const d=g.getImageData(0,0,W,H).data;
 const blue=(i)=>d[i+2]>200&&d[i]<90&&d[i+1]>70&&d[i+1]<140;
 const minW=Math.round(W*.012),maxW=Math.round(W*.04);
 for(let y=Math.round(H*.1);y<H*.95;y++){let run=0;for(let x=Math.round(W*.2);x<W*.95;x++){if(blue((y*W+x)*4)){run++}else{if(run>=minW&&run<=maxW){ // candidate: check it is a box (same run 8 rows lower)
   const y2=Math.min(H-1,y+Math.round(minW*.6)),x0=x-run+Math.round(run/2);if(blue((y2*W+x0)*4)){return {x:x-run,y:y-2,h:Math.round(run*1.3),runw:run}}}run=0}}}
 return null}
window.readShot=async function(url,onStep){
 const img=await new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=rej;i.src=url});
 const W=img.naturalWidth,H=img.naturalHeight,out={found:{},raw:{}};const step=m=>onStep&&onStep(m);
 step('Loading reader (first time downloads about 10 MB)...');const w=await worker();
 step('Reading header...');
 const head=await ocr(w,toCanvas(img,[0,0,W*.6,H*.07],4,false),6);out.raw.header=head;
 const sym=head.match(/\b([A-Z]{1,5}[0-9]?!)/);
 const tf=head.match(/\b(\d+[smhDWM])\b/);
 step('Reading time...');
 const bot='';
 const bt=await ocr(w,toCanvas(img,[W*.55,H*.66,W*.45,H*.08],4,false),6);out.raw.bottom=bt;
 const tm=bt.match(/(\d{1,2}:\d{2}:\d{2}\s*[AP]M)\s*(UTC[+\-−]?\d+)?/i);if(tm){out.found.clock=tm[1]+(tm[2]?' '+tm[2]:'')}
 const ds=[];for(const inv of[false,true]){for(const bx of[[W*.545,H*.674,W*.085,H*.022],[W*.54,H*.672,W*.095,H*.026],[W*.45,H*.672,W*.25,H*.035],[W*.3,H*.655,W*.6,H*.04]]){ds.push(await ocr(w,toCanvas(img,bx,bx[2]<W*.1?10:6,inv),7,''))}}out.raw.dateStrips=ds;
 const all=ds.join('\n')+bot+'\n'+head+'\n'+bt;out.raw.all=all;
 const dm=all.match(/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{1,2}),?\s+(20[2-3]\d)/);if(dm)out.found.dateText=dm[0];
 const cm=all.match(/((?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},?\s+20\d\d\s+\d{1,2}:\d\d\s*[AP]M)/i);if(cm)out.found.cx=cm[1];
  // --- order arrows: red (sell, down) / blue (buy, up) markers with an "N @ price" label; the black cursor label gives a bar time ---
 try{
  step('Reading order arrows...');
  const px=document.createElement('canvas');px.width=W;px.height=H;const pg=px.getContext('2d');pg.drawImage(img,0,0);const D=pg.getImageData(0,0,W,H).data;
  const isR=i=>D[i]>205&&D[i+1]<95&&D[i+2]<110,isB=i=>D[i+2]>205&&D[i]<90&&D[i+1]>70&&D[i+1]<140;
  const st=2,gw=Math.ceil(W/st),gh=Math.ceil(H/st);
  const comps=[];for(const [dir,f] of [['sell',isR],['buy',isB]]){const seen=new Uint8Array(gw*gh);
   for(let gy=0;gy<gh;gy++)for(let gx=0;gx<gw;gx++){const k=gy*gw+gx;if(seen[k]||!f(((gy*st)*W+gx*st)*4))continue;
    let x0=gx,x1=gx,y0=gy,y1=gy,n=0;const q=[k];seen[k]=1;while(q.length){const c=q.pop(),cx=c%gw,cy=(c/gw)|0;n++;if(cx<x0)x0=cx;if(cx>x1)x1=cx;if(cy<y0)y0=cy;if(cy>y1)y1=cy;
     for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,-1],[1,-1],[-1,1]]){const nx=cx+dx,ny=cy+dy;if(nx<0||ny<0||nx>=gw||ny>=gh)continue;const nk=ny*gw+nx;if(seen[nk])continue;if(f(((ny*st)*W+nx*st)*4)){seen[nk]=1;q.push(nk)}}}
    const w1=(x1-x0+1)*st,h1=(y1-y0+1)*st,fill=n*st*st/(w1*h1);
    const M=Math.min(W,H);if(h1>=M*.03&&h1<=M*.042&&w1>=M*.024&&w1<=M*.033&&fill>.2&&fill<.4)comps.push({dir,ax:(x0+x1)/2*st,ay:(y0+y1)/2*st,w:w1,h:h1})}}
  out.raw.comps=comps.length;
  const arr=[];
  let unresolved=0;
  const parse=t=>{const pm=/@\s*([\d,]{4,}\.\d{2})/.exec(t);if(!pm)return null;const rest=t.replace(pm[0],' ');const nums=rest.match(/\b\d{1,3}\b/g)||[];if(nums.length!==1)return null;return {qty:+nums[0],price:pm[1].replace(/,/g,'')}};
  for(const c of comps){let best=null;
   const sgn=c.dir==='sell'?-1:1; // TradingView draws sell labels above the bar and buy labels below it
   const cy=c.ay+sgn*c.h*1.6,bh=c.h*1.15,bw=Math.min(W,H)*.34;const bx=[Math.max(0,c.ax-bw/2),Math.max(0,cy-bh/2),Math.min(bw,W-Math.max(0,c.ax-bw/2)),bh];
   const votes=[];for(const sc2 of[3,4,5,2]){for(const inv of[false,true]){const dd=await ocrD(w,toCanvas(img,bx,sc2,inv),7,'0123456789@., ');const t=dd.text,qd=qtyFrom(dd);(out.raw.crops=out.raw.crops||[]).push([c.dir,Math.round(c.ax),sc2,inv,t.trim()]);const pmm=/@\s*([\d,]{4,}\.\d{2})/.exec(t);if(!pmm)continue;const nums=(t.replace(pmm[0],' ').match(/\b\d{1,3}\b/g)||[]);votes.push({price:pmm[1].replace(/,/g,''),qty:qd==null?null:+qd})}}
   const top=(arr2)=>{const m={};arr2.forEach(v=>{m[v]=(m[v]||0)+1});const e=Object.entries(m).sort((a,b)=>b[1]-a[1]);return e.length?{v:e[0][0],n:e[0][1],second:e[1]?e[1][1]:0}:null};
   const pt=top(votes.map(v=>v.price)),qt=top(votes.filter(v=>v.qty!=null).map(v=>String(v.qty)));
   if(pt&&pt.n>=3&&pt.second===0)best={price:pt.v,qty:(qt&&qt.n>=3&&qt.n>=votes.length*.6&&qt.second<=1)?+qt.v:null};
   if(best)arr.push({...c,...best});else unresolved++}
  arr.sort((a,b)=>a.ax-b.ax);out.raw.arrows=arr;
  {
   const cand={arrows:arr.map(x=>({dir:x.dir,price:x.price,qty:x.qty,ax:Math.round(x.ax)})),unresolved,W};
   // black cursor label: a wide near-black box in the lower part of the chart
   const dk=i=>D[i]<35&&D[i+1]<35&&D[i+2]<35;let box=null;
   for(let y=Math.round(H*.55);y<H*.95&&!box;y+=3){let run=0,start=0,last=-99;for(let x=0;x<=W;x+=2){const d=x<W&&dk((y*W+x)*4);if(d){if(!run)start=x;run=1;last=x}else if(run&&(x>=W||x-last>16)){const wd=last-start;if(wd>=Math.min(W,H)*.25&&wd<=Math.min(W,H)*.45){const mx=start+Math.round(wd/2);let y0=y,y1=y;while(y0>2&&dk(((y0-2)*W+start+4)*4))y0-=2;while(y1<H-3&&dk(((y1+2)*W+start+4)*4))y1+=2;if(y1-y0>=Math.min(W,H)*.02&&y1-y0<=Math.min(W,H)*.06)box={x:start,y:y0,w:wd,h:y1-y0}}run=0}}}
   out.raw.cursorBox=box;
   if(box){const t=await ocr(w,toCanvas(img,[box.x+3,box.y+3,box.w-6,box.h-6],3,true),7,'');out.raw.cursorLine=t;
    const cmm=/(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2}),?\s+(20\d\d)\s+(\d{1,2}):(\d\d)\s*([AP])M/i.exec(t);
    const curX=box.x+box.w/2;
    if(cmm){let h=+cmm[4]%12;if(cmm[6].toUpperCase()==='P')h+=12;const MO=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
     cand.cursor={x:Math.round(curX),time:String(h).padStart(2,'0')+':'+cmm[5],date:cmm[3]+'-'+String(MO.indexOf(cmm[1].toLowerCase())+1).padStart(2,'0')+'-'+String(+cmm[2]).padStart(2,'0')};
     const hit=arr.filter(x=>Math.abs(x.ax-curX)<=W*.02);if(hit.length===1)cand.cursorArrow=arr.indexOf(hit[0])}}
   out.found.cand=cand}
 }catch(e){out.raw.arrowErr=String(e)}
 try{step('Reading symbol...');const sv=[];const bands=[[0,.866,.2,.02]];for(let f=.72;f<=.93;f+=.02){bands.push([0,f,.24,.05]);bands.push([.07,f,.115,.05])};for(let f=0;f<=.10;f+=.025)bands.push([0,f,.24,.035]);
  for(const bd of bands){for(const sc of(bd[1]===.866?[3,4,5]:[3,4])){for(const inv of[false,true]){const t=(await ocr(w,toCanvas(img,[W*bd[0],H*bd[1],W*bd[2],H*bd[3]],sc,inv),7,'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!.:')).replace(/\s/g,'');if(/^[A-Z][A-Z0-9.]{0,9}!?[0-9]?!?$/.test(t)&&t.length>=2&&(bd[1]===.866||/^[A-Z]{1,5}[0-9]?!$/.test(t)))sv.push(t)}}}
  const ROOTS=['MNQ','NQ','MES','ES','MYM','YM','M2K','RTY','MGC','GC','MCL','CL','NG','ZB','ZN','ZF','MBT','BTC','ETH','SI'];const fixQ=v=>{const mm=/^([A-Z0-9]{1,4}?)([0-9])?(!?)$/.exec(v);if(!mm||ROOTS.includes(mm[1]))return v;const c=new Set();const sw=(r,i)=>{if(i>=r.length){if(ROOTS.includes(r))c.add(r);return}sw(r,i+1);if(r[i]==='O')sw(r.slice(0,i)+'Q'+r.slice(i+1),i+1);else if(r[i]==='Q')sw(r.slice(0,i)+'O'+r.slice(i+1),i+1)};sw(mm[1],0);return c.size===1?[...c][0]+(mm[2]||'')+mm[3]:v};
  out.raw.symVotesRaw=sv.slice();for(let i=0;i<sv.length;i++)sv[i]=fixQ(sv[i]);
  out.raw.symVotes=sv;const m={};sv.forEach(v=>m[v]=(m[v]||0)+1);const e=Object.entries(m).sort((a,b)=>b[1]-a[1]);if(e.length&&e[0][1]>=2&&(!e[1]||e[1][1]<e[0][1]))out.found.tickerCand=e[0][0];else if(e.length>1&&e[0][1]>=2)out.found.tickerAlts=e.filter(x=>x[1]===e[0][1]).map(x=>x[0])}catch(e){out.raw.symErr=String(e)}
 return out};
