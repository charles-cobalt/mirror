// MIRR•R private sign-in and sync (Firebase Auth + Firestore, free Spark plan).
// Local-only use is unchanged: nothing here runs a network call until the SDK loads, and failures leave the local journal alone.
(function(){
const CFG={"apiKey":"AIzaSyAiNKGecoCjvzTLm4WrbbW20OiHB8Myx4M","authDomain":"mirr-r-journal.firebaseapp.com","projectId":"mirr-r-journal","messagingSenderId":"97856130514","appId":"1:97856130514:web:ef2a5ea5e85af6f0facc0b"};
const V='10.14.1',B='https://www.gstatic.com/firebasejs/'+V+'/';
const CH=400000; // image chunk size (chars), well under the 1 MiB document limit
const S={user:null,ver:false,msg:'',busy:false,ready:false,sdk:null,st:{uid:'',hashes:{},base:{},cfgHash:'',cfgBase:'',lastPull:0,lastCfgU:0,lastSync:0},err:''};
const hs=s=>{s=String(s);let h=5381;for(let i=0;i<s.length;i++)h=((h<<5)+h+s.charCodeAt(i))|0;return s.length+':'+(h>>>0)};
const th=t=>hs(JSON.stringify(t)),ch=()=>hs(JSON.stringify(cfg));
const esc2=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const rerender=()=>{try{if(typeof view!=='undefined'&&view.name==='set')render()}catch{}};
const setMsg=(m,e)=>{S.msg=m||'';S.err=e?'1':'';rerender()};
const saveSt=()=>kvset('sync',S.st);
const nice=e=>{const c=(e&&e.code)||'';return({'auth/email-already-in-use':'That email already has an account. Use Sign in.','auth/invalid-credential':'Email or password is wrong.','auth/wrong-password':'Email or password is wrong.','auth/user-not-found':'Email or password is wrong.','auth/invalid-email':'That email address is not valid.','auth/weak-password':'Use a password of at least 6 characters.','auth/too-many-requests':'Too many tries. Wait a few minutes and try again.','auth/network-request-failed':'No connection. Try again when online.','permission-denied':'Not allowed yet. Verify your email first, then sync.','resource-exhausted':'The free daily limit was reached. Sync resumes when it resets.','unavailable':'No connection to the sync service. Your journal on this phone is safe.'})[c]||('Sync problem ('+(c||e&&e.message||'unknown')+'). Your journal on this phone is unchanged.')};
async function sdk(){if(S.sdk)return S.sdk;const [a,au,fs]=await Promise.all([import(B+'firebase-app.js'),import(B+'firebase-auth.js'),import(B+'firebase-firestore.js')]);const app=a.initializeApp(CFG);S.sdk={app,a:au,f:fs,auth:au.getAuth(app),fdb:fs.getFirestore(app)};return S.sdk}
async function start(){
 try{S.st=Object.assign(S.st,(await kvget('sync'))||{})}catch{}
 S.ready=true;rerender();
 if(!navigator.onLine&&!S.st.uid)return;
 try{const k=await sdk();k.a.onAuthStateChanged(k.auth,async u=>{S.user=u;S.ver=!!(u&&u.emailVerified);rerender();if(S.un){try{S.un.forEach(x=>x())}catch{}S.un=null}
if(u&&S.ver){await linkAndSync(u);listen(k,u)}})}catch(e){S.sdk=null}
}
const FRESH=()=>({uid:'',hashes:{},base:{},cfgHash:'',cfgBase:'',lastPull:0,lastCfgU:0,lastSync:0});
async function stash(o){await kvset('own:'+o,{trades:JSON.parse(JSON.stringify(trades)),cfg:JSON.parse(JSON.stringify(cfg)),st:S.st})}
async function restore(o){const v=await kvget('own:'+o);trades=v&&v.trades?v.trades:[];if(v&&v.cfg)cfg=v.cfg;S.st=v&&v.st?v.st:FRESH();await kvset('trades',trades);await kvset('cfg',cfg);await saveSt()}
async function linkAndSync(u){
 if(S.st.uid&&S.st.uid!==u.uid){ // this phone holds another account's journal: keep it in its own store, never delete or upload it
  await stash(S.st.uid);await restore(u.uid);S.st.uid=u.uid;S.st.email=u.email||'';await saveSt();location.reload();return
 }
 if(!S.st.uid)await kvset('own:anon',{trades:JSON.parse(JSON.stringify(trades)),cfg:JSON.parse(JSON.stringify(cfg)),st:null});
 if(!S.st.uid){S.st.uid=u.uid;S.st.email=u.email||'';S.st.base={};trades.forEach(t=>S.st.base[t.id]=th(t));S.st.cfgBase=ch();await saveSt()}
 await sync(false)
}
const col=(k,n)=>k.f.collection(k.fdb,'users',S.user.uid,n);
async function pull(k){
 const f=k.f,out={got:0};
 const q=f.query(col(k,'trades'),f.where('u','>',Math.max(0,S.st.lastPull-120000)),f.orderBy('u'));
 const snap=await f.getDocs(q);let maxU=S.st.lastPull;
 for(const d of snap.docs){
  const m=d.data(),id=d.id;maxU=Math.max(maxU,m.u||0);
  const i=trades.findIndex(x=>x.id===id),loc=i>=0?trades[i]:null,known=S.st.hashes[id]||S.st.base[id];
  const changed=loc&&th(loc)!==known;
  if(m.del){if(loc&&!changed){trades.splice(i,1);delete S.st.hashes[id];out.got++}continue}
  if(!loc&&S.st.hashes[id]&&!m.del)continue; // deleted on this phone; the tombstone is pushed next
  if(changed)continue; // this phone has newer edits; they will be pushed
  if(S.st.hashes[id]&&m.u<=(S.st.ut&&S.st.ut[id]||0))continue;
  const t=JSON.parse(m.d);t.img='';
  if(m.n){let s='';const r=await f.getDocs(f.query(col(k,'imgs'),f.where('t','==',id)));const ps=[];r.forEach(x=>ps[x.data().k]=x.data().d);if(ps.length<m.n||ps.slice(0,m.n).some(x=>x==null))throw Object.assign(new Error('missing image chunks'),{code:'incomplete'});const sp=ps.slice(0,m.n).join('').split('|');t.img=sp[0];if(sp[1])t.img2=sp[1]}
  if(i>=0)trades[i]=t;else trades.push(t);
  S.st.hashes[id]=th(t);S.st.ut=S.st.ut||{};S.st.ut[id]=m.u;out.got++}
 S.st.lastPull=maxU;
 const cd=await f.getDoc(f.doc(k.fdb,'users',S.user.uid,'meta','cfg'));
 if(cd.exists()){const m=cd.data();if(m.u>S.st.lastCfgU&&ch()===(S.st.cfgHash||S.st.cfgBase)){cfg=JSON.parse(m.d);S.st.cfgHash=ch();S.st.lastCfgU=m.u;out.got++}}
 return out}
async function pushTrade(k,t,force){
 const f=k.f,id=t.id,h=th(t);if(!force&&(S.st.hashes[id]===h||(!S.st.hashes[id]&&S.st.base[id]===h)))return 0;
 const {img,img2,...rest}=t,u=Date.now(),im=(img||'')+(img2?'|'+img2:''),n=im?Math.ceil(im.length/CH):0;
 for(let j=0;j<n;j++)await f.setDoc(f.doc(k.fdb,'users',S.user.uid,'imgs',id+'_'+j),{t:id,k:j,d:im.slice(j*CH,(j+1)*CH)});
 await f.setDoc(f.doc(k.fdb,'users',S.user.uid,'trades',id),{u,del:false,d:JSON.stringify(rest),n,ih:hs(im)});
 S.st.hashes[id]=h;S.st.ut=S.st.ut||{};S.st.ut[id]=u;S.st.n=S.st.n||{};S.st.n[id]=n;return 1}
async function push(k,all){
 const f=k.f;let c=0;
 for(const t of trades)c+=await pushTrade(k,t,false)||(all&&!S.st.hashes[t.id]?await pushTrade(k,t,true):0);
 const ids=new Set(trades.map(t=>t.id));
 for(const id of Object.keys(S.st.hashes)){if(ids.has(id))continue;
  const n=(S.st.n&&S.st.n[id])||0;for(let j=0;j<n+2;j++)try{await f.deleteDoc(f.doc(k.fdb,'users',S.user.uid,'imgs',id+'_'+j))}catch{}
  await f.setDoc(f.doc(k.fdb,'users',S.user.uid,'trades',id),{u:Date.now(),del:true,d:'',n:0,ih:''});
  delete S.st.hashes[id];c++}
 const chn=ch();if(chn!==S.st.cfgHash&&(chn!==S.st.cfgBase||all)){const u=Date.now();await f.setDoc(f.doc(k.fdb,'users',S.user.uid,'meta','cfg'),{u,d:JSON.stringify(cfg)});S.st.cfgHash=chn;S.st.lastCfgU=u;c++}
 return c}
async function sync(all){
 if(S.busy){S.again=1;return}
 if(!S.user||!S.ver||S.st.uid!==S.user.uid)return;S.busy=true;setMsg('Syncing...');
 try{const k=await sdk();await S.user.getIdToken(true);const a=await pull(k);await save();const b=await push(k,all);S.st.lastSync=Date.now();await saveSt();
  setMsg('Synced '+new Date().toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})+(a.got?' · '+a.got+' updated from your account':'')+(b?' · '+b+' sent':''));}
 catch(e){setMsg(nice(e),1)}
 S.busy=false;if(S.again){S.again=0;setTimeout(()=>sync(false),200)}rerender();try{if(['list','stats'].includes(view.name))render()}catch{}}

let lt;
function nudge(){clearTimeout(lt);lt=setTimeout(()=>sync(false),400)}
function listen(k,u){
 try{const f=k.f,now=Date.now()-1000,un=[];
  un.push(f.onSnapshot(f.query(col(k,'trades'),f.where('u','>',now)),sn=>{if(sn.docChanges().some(c=>!c.doc.metadata.hasPendingWrites))nudge()},()=>{}));
  un.push(f.onSnapshot(f.doc(k.fdb,'users',u.uid,'meta','cfg'),d=>{if(d.exists()&&!d.metadata.hasPendingWrites&&(d.data().u||0)>(S.st.lastCfgU||0))nudge()},()=>{}));
  S.un=un}catch{}}
document.addEventListener('visibilitychange',()=>{if(!document.hidden)nudge()});
window.addEventListener('focus',nudge);window.addEventListener('pageshow',nudge);window.addEventListener('online',nudge);
setInterval(()=>{if(!document.hidden&&S.user&&S.ver)sync(false)},60000);
let tm;
window.JSYNC={
 async refresh(){if(!S.user||!S.ver)return false;await sync(false);return !S.err},
 changed(){clearTimeout(tm);if(S.user&&S.ver)tm=setTimeout(()=>sync(false),1500)},
 card(){
  const row='style="margin-top:10px"';
  const m=S.msg?`<p class="mu" style="margin-top:10px;${S.err?'color:var(--y)':''}">${esc2(S.msg)}</p>`:'';
  if(!S.ready)return '';
  const np=trades.filter(t=>!S.st.hashes[t.id]).length;
  if(S.user&&S.ver)return `<h2>Account</h2><div class="card"><p class="mu">Signed in as ${esc2(S.user.email)}. Your journal syncs to this private account and shows on this phone only while you are signed in.</p><div class="row"><button class="btn" data-sy="sync">Sync now</button><button class="btn sec" data-sy="out">Sign out</button></div><div class="row" ${row}><button class="btn sec" data-sy="all">Upload this device's journal</button></div><p class="mu" style="margin-top:10px">${np?np+(np===1?' trade on this phone is':' trades on this phone are')+' not uploaded yet. They stay local until you upload them or edit them.':'All trades on this phone are uploaded.'} Signing out hides this account's journal on this phone; it comes back when you sign in again.</p>${m}</div>`;
  if(S.user)return `<h2>Account</h2><div class="card"><p class="mu">Check ${esc2(S.user.email)} for the verification email from this journal, open its link, then tap the button below. Nothing syncs until your email is verified.</p><div class="row"><button class="btn" data-sy="chk">I verified</button><button class="btn sec" data-sy="resend">Resend email</button></div><div class="row" ${row}><button class="btn sec" data-sy="out">Sign out</button></div>${m}</div>`;
  return `<h2>Account</h2><div class="card"><p class="mu">Optional. Sign in to keep a private copy of your journal that syncs across your devices. Without an account, everything stays on this phone as before.</p><label class="f">Email</label><input type="email" id="syem" autocomplete="email" autocapitalize="off" spellcheck="false" value="${esc2(S.em||'')}"><label class="f">Password</label><input type="password" id="sypw" autocomplete="current-password"><div class="row" ${row}><button class="btn" data-sy="in">Sign in</button><button class="btn sec" data-sy="new">Create account</button></div><div class="row" ${row}><button class="btn sec" data-sy="reset">Forgot password</button></div>${m}</div>`},
 init(){start()}};
document.addEventListener('click',async e=>{
 const b=e.target.closest&&e.target.closest('[data-sy]');if(!b)return;const a=b.dataset.sy;
 const E=((document.getElementById('syem')||{}).value||'').trim(),P=(document.getElementById('sypw')||{}).value||'';
 try{
  if(a==='sync')return void sync(false);
  if(a==='all'){if(confirm('Upload all trades on this phone to your private account?'))await sync(true);return}
  const k=await sdk();
  if(a==='in'){S.em=E;if(!S.em||!P)return setMsg('Enter your email and password.',1);setMsg('Signing in...');await k.a.signInWithEmailAndPassword(k.auth,S.em,P);setMsg('')}
  else if(a==='new'){S.em=E;if(!S.em||!P)return setMsg('Enter an email and a password.',1);setMsg('Creating account...');const c=await k.a.createUserWithEmailAndPassword(k.auth,S.em,P);await k.a.sendEmailVerification(c.user);setMsg('Verification email sent to '+S.em+'.')}
  else if(a==='reset'){S.em=E;if(!S.em)return setMsg('Enter your email first.',1);await k.a.sendPasswordResetEmail(k.auth,S.em);setMsg('If that email has an account, a reset link was sent.')}
  else if(a==='resend'){await k.a.sendEmailVerification(k.auth.currentUser);setMsg('Verification email sent again.')}
  else if(a==='chk'){await k.auth.currentUser.reload();S.user=k.auth.currentUser;S.ver=!!S.user.emailVerified;if(S.ver){await S.user.getIdToken(true);await linkAndSync(S.user)}else setMsg('Not verified yet. Open the link in the email first.',1)}
  else if(a==='out'){const o=S.st.uid;if(o){await stash(o);await k.a.signOut(k.auth);S.user=null;S.ver=false;await restore('anon');location.reload();return}await k.a.signOut(k.auth);S.user=null;S.ver=false;setMsg('Signed out.')}
 }catch(x){setMsg(nice(x),1)}
});
if(window.__booted)start();
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&S.user&&S.ver&&Date.now()-S.st.lastSync>300000)sync(false)});
})();
