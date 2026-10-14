// Best-effort, on-device OCR of a TradingView screenshot. Nothing is uploaded anywhere.
// Returns only what could be read; every value must be confirmed by the user.
let _w;
function loadScript(src){return new Promise((res,rej)=>{const s=document.createElement('script');s.src=src;s.onload=res;s.onerror=rej;document.head.appendChild(s)})}
async function worker(){if(_w)return _w;if(!window.Tesseract)await loadScript('https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js');_w=await Tesseract.createWorker('eng');return _w}
function toCanvas(img,box,scale,invert){const [x,y,w,h]=box;const c=document.createElement('canvas');c.width=Math.round(w*scale);c.height=Math.round(h*scale);const g=c.getContext('2d');g.imageSmoothingQuality='high';g.filter='grayscale(1)'+(invert?' invert(1)':'');g.drawImage(img,x,y,w,h,0,0,c.width,c.height);return c}
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
 const sym=head.match(/\b([A-Z]{1,5}[0-9]?!)/);if(sym)out.found.symbol=sym[1];
 const tf=head.match(/\b(\d+[smhDWM])\b/);
 step('Reading time...');
 const bot='';
 const bt=await ocr(w,toCanvas(img,[W*.55,H*.66,W*.45,H*.08],4,false),6);out.raw.bottom=bt;
 const tm=bt.match(/(\d{1,2}:\d{2}:\d{2}\s*[AP]M)\s*(UTC[+\-−]?\d+)?/i);if(tm){out.found.clock=tm[1]+(tm[2]?' '+tm[2]:'')}
 const ds=[];for(const inv of[false,true]){for(const bx of[[W*.545,H*.674,W*.085,H*.022],[W*.54,H*.672,W*.095,H*.026],[W*.45,H*.672,W*.25,H*.035],[W*.3,H*.655,W*.6,H*.04]]){ds.push(await ocr(w,toCanvas(img,bx,bx[2]<W*.1?10:6,inv),7,''))}}out.raw.dateStrips=ds;
 const all=ds.join('\n')+bot+'\n'+head+'\n'+bt;out.raw.all=all;
 const dm=all.match(/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{1,2}),?\s+(20[2-3]\d)/);if(dm)out.found.dateText=dm[0];
 const cm=all.match(/((?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},?\s+20\d\d\s+\d{1,2}:\d\d\s*[AP]M)/i);if(cm)out.found.cx=cm[1];
 return out};
