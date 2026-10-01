/* Fleeter client. Works three ways:
   - on your Cloudflare site: reads sources through /api,
   - inside the Mac/Android app: fetches every source directly from the device,
   - opened from disk: shows a saved edition (preview mode). */
(() => {
"use strict";
const $ = (s,r=document) => r.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const safeUrl = (u, base) => { const v = String(u || "").trim(); if (!v || v.startsWith("data:")) return ""; try { const x = new URL(v.replace(/^\/\//,"https://"), base || location.href); return /^https?:$/.test(x.protocol) ? x.href : ""; } catch { return ""; } };
const store = {
  get(k,d){ try{ const v=localStorage.getItem("fleeter:"+k); return v==null?d:JSON.parse(v);}catch{return d;} },
  set(k,v){ try{ localStorage.setItem("fleeter:"+k,JSON.stringify(v)); return true;}catch{return false;} },
  del(k){ try{ localStorage.removeItem("fleeter:"+k);}catch{} },
  keys(){ try{ return Object.keys(localStorage).filter(k=>k.startsWith("fleeter:")); }catch{ return []; } },
  bytes(){ let n=0; try{ for(const k of this.keys()) n+=(k.length+(localStorage.getItem(k)||"").length)*2; }catch{} return n; }
};
const CATS=[{id:"games",name:"Game industry"},{id:"sport",name:"Sport"},{id:"anime",name:"Anime"},{id:"music",name:"Music"},{id:"headlines",name:"Headlines"},{id:"tech",name:"Digital tech"},{id:"economy",name:"Economy"}];
const SPORTS=[{id:"football",name:"Football"},{id:"tennis",name:"Tennis"},{id:"swimming",name:"Swimming"},{id:"tabletennis",name:"Table tennis"},{id:"other",name:"Other sport"}];
const LEAGUES=[{id:"epl",name:"Premier League"},{id:"laliga",name:"La Liga"},{id:"seriea",name:"Serie A"},{id:"bundesliga",name:"Bundesliga"},{id:"ligue1",name:"Ligue 1"},{id:"ucl",name:"Champions League"},{id:"intl",name:"International"},{id:"csl",name:"Chinese Super League"},{id:"other",name:"Other football"}];
const GAMEPAL={
  genshin:{bg:"#14223D",a:"#E8C77A",b:"#FFF4DA",c:"#23406E",gc:"#C9A24B"},
  hsr:{bg:"#140F37",a:"#B69CFF",b:"#F3EEFF",c:"#2A2169",gc:"#8B6CFF"},
  wuwa:{bg:"#0A1117",a:"#6EE7F2",b:"#EAFBFF",c:"#14303B",gc:"#22B8C9"},
  zzz:{bg:"#101010",a:"#C6F432",b:"#FFFFFF",c:"#2A2A2A",gc:"#8DBA12"},
  gta6:{bg:"#2A0E3A",a:"#FF6FA8",b:"#FFE7C2",c:"#FF9A4D",gc:"#E8508C"},
  minecraft:{bg:"#1C381D",a:"#7BD35A",b:"#F1FFE8",c:"#2E5A2B",gc:"#4FA83A"}
};
const catName = id => (CATS.find(c=>c.id===id)||{}).name||id;
const sportName = id => (SPORTS.find(c=>c.id===id)||{}).name||"Sport";
const leagueName = id => (LEAGUES.find(c=>c.id===id)||{}).name||"";
const colorOf = it => it.type==="video" ? "var(--c-video)" : `var(--c-${it.cat})`;
const tagLabel = it => it.type==="video" ? "Video" : it.cat==="sport" ? (it.sport==="football" && it.league && it.league!=="other" ? leagueName(it.league) : sportName(it.sport)) : catName(it.cat);

let PREVIEW = false;                        // no live data available (opened from disk)
let CONFIG = { sources: [], games: [], markets: [], morningEdition: null, kv: false };
let edition = { items: [], games: [], compiledAt: new Date().toISOString(), mode: "live" };
const state = { cat:"all", sport:"all", league:"all", lang:"all", q:"", kind:"all", sort:"newest", view:"list", density:"comfortable", openId:null, openGame:null, editTrack:false, shown:60 };
let read = new Set(store.get("read",[]));
let tracked = null;
const gameOf = id => (edition.games||[]).find(g=>g.id===id);
const health = new Map();
let markets = store.get("markets", null);
/* ---------- look (unchanged API) ---------- */
const STYLES=[
 {id:"default",name:"Default",note:"Fleeter's own look",pv:"background:#fff;border-radius:10px;border:1px solid #d5dde4;box-shadow:0 6px 14px -8px rgba(0,0,0,.35)",bg:"#E9EEF2"},
 {id:"glass",name:"Liquid glass",note:"Translucent, blurred, glossy",pv:"background:rgba(255,255,255,.4);border-radius:18px;border:1px solid rgba(255,255,255,.8);box-shadow:inset 0 1px 0 #fff,0 6px 14px -8px rgba(0,0,0,.35)",bg:"linear-gradient(120deg,#6E9BFF,#FF8CC6,#5FE3C0)"},
 {id:"material",name:"Material 3",note:"Tonal surfaces, soft corners",pv:"background:#E8DEF8;border-radius:12px;box-shadow:0 1px 2px rgba(0,0,0,.3),0 1px 3px 1px rgba(0,0,0,.15)",bg:"#FEF7FF"},
 {id:"fluent",name:"Fluent 2",note:"Crisp strokes, acrylic",pv:"background:#fff;border-radius:4px;border:1px solid rgba(0,0,0,.08);border-bottom-color:rgba(0,0,0,.2);box-shadow:0 2px 4px rgba(0,0,0,.14)",bg:"#F5F5F5"}
];
const BGS=[{id:"mist",name:"Mist",bg:"#E9EEF2"},{id:"paper",name:"Paper",bg:"#F6F5F1"},{id:"sage",name:"Sage",bg:"#E4ECE3"},{id:"blush",name:"Blush",bg:"#F3E8EA"},{id:"abyss",name:"Abyss",bg:"#0B1633"},{id:"midnight",name:"Midnight",bg:"#121A2B"},{id:"graphite",name:"Graphite",bg:"#1E1F24"},{id:"forest",name:"Forest",bg:"#14231D"}];
const FONTS=[{id:"style",name:"Style font",note:"Matches the page style",css:null},{id:"figtree",name:"Figtree",note:"Clean sans",css:'"Figtree","Segoe UI",system-ui,sans-serif'},{id:"newsreader",name:"Newsreader",note:"Editorial serif",css:'"Newsreader",Georgia,serif'},{id:"atkinson",name:"Atkinson",note:"Hyperlegible",css:'"Atkinson Hyperlegible",Verdana,sans-serif'},{id:"nunito",name:"Nunito",note:"Soft rounded",css:'"Nunito","Trebuchet MS",sans-serif'},{id:"roboto",name:"Roboto Flex",note:"Material's face",css:'"Roboto Flex",Roboto,system-ui,sans-serif'}];
const SIZES=[{id:.92,name:"S"},{id:1,name:"M"},{id:1.1,name:"L"},{id:1.2,name:"XL"}];
let look = Object.assign({style:"default",bg:"auto",custom:null,font:"style",scale:1}, store.get("look",{}));
const hexToRgb=h=>{h=h.replace("#","");if(h.length===3)h=h.split("").map(x=>x+x).join("");const n=parseInt(h,16);return[n>>16&255,n>>8&255,n&255];};
const rgbToHex=(r,g,b)=>"#"+[r,g,b].map(v=>Math.max(0,Math.min(255,Math.round(v))).toString(16).padStart(2,"0")).join("");
const mix=(a,b,t)=>{const A=hexToRgb(a),B=hexToRgb(b);return rgbToHex(A[0]+(B[0]-A[0])*t,A[1]+(B[1]-A[1])*t,A[2]+(B[2]-A[2])*t);};
const lum=h=>{const[r,g,b]=hexToRgb(h).map(v=>{v/=255;return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4)});return .2126*r+.7152*g+.0722*b;};
function applyLook(){
  const root=document.documentElement;
  ["--bg","--surface","--surface-2","--ink","--muted","--line","--font-body"].forEach(p=>root.style.removeProperty(p));
  root.removeAttribute("data-theme"); root.setAttribute("data-style",look.style);
  let bg=null;
  if(look.bg==="custom"&&look.custom) bg=look.custom; else { const p=BGS.find(b=>b.id===look.bg); if(p) bg=p.bg; }
  if(bg){ const dark=lum(bg)<.2; root.setAttribute("data-theme",dark?"dark":"light");
    root.style.setProperty("--bg",bg);
    root.style.setProperty("--surface",dark?mix(bg,"#ffffff",.07):mix(bg,"#ffffff",.82));
    root.style.setProperty("--surface-2",dark?mix(bg,"#ffffff",.11):mix(bg,"#ffffff",.45));
    root.style.setProperty("--ink",dark?"#E9EDF4":mix(bg,"#101722",.9));
    root.style.setProperty("--muted",dark?mix(bg,"#ffffff",.6):mix(bg,"#101722",.64));
    root.style.setProperty("--line",dark?mix(bg,"#ffffff",.16):mix(bg,"#101722",.13)); }
  const f=FONTS.find(x=>x.id===look.font);
  if(f&&f.css){ root.style.setProperty("--font-body",f.css); document.body.style.fontFamily="var(--font-body)"; } else document.body.style.removeProperty("font-family");
  root.style.setProperty("--scale",look.scale||1);
  store.set("look",look); renderLookPanel();
}
function renderLookPanel(){
  $("#styles").innerHTML=STYLES.map(s=>`<button class="sopt" role="radio" aria-checked="${look.style===s.id}" data-style="${s.id}"><span class="pv" style="background:${s.bg}"><i style="${s.pv}"></i></span><b>${s.name}</b><small>${s.note}</small></button>`).join("");
  $("#swatches").innerHTML=`<button class="sw" role="radio" aria-checked="${look.bg==="auto"}" data-bg="auto"><span class="c" style="background:linear-gradient(135deg,#E9EEF2 50%,#121A2B 50%)"></span>System</button>`+
    BGS.map(b=>`<button class="sw" role="radio" aria-checked="${look.bg===b.id}" data-bg="${b.id}"><span class="c" style="background:${b.bg}"></span>${b.name}</button>`).join("")+
    `<label class="sw" role="radio" aria-checked="${look.bg==="custom"}"><span class="c" style="background:${look.custom||"conic-gradient(#f66,#fc6,#6f9,#6cf,#c6f,#f66)"}"><input type="color" id="customColor" value="${look.custom||"#dfe7ee"}" aria-label="Pick any colour"></span>Custom</label>`;
  $("#fonts").innerHTML=FONTS.map(f=>`<button class="fopt" role="radio" aria-checked="${look.font===f.id}" data-font="${f.id}" ${f.css?`style='font-family:${f.css}'`:""}><b>Aa ${f.name}</b><small>${f.note}</small></button>`).join("");
  $("#sizes").innerHTML=SIZES.map(s=>`<button role="radio" aria-checked="${(look.scale||1)===s.id}" data-size="${s.id}">${s.name}</button>`).join("");
}
$("#styles").onclick=e=>{const b=e.target.closest("[data-style]");if(!b)return;look.style=b.dataset.style;applyLook();};
$("#swatches").onclick=e=>{const b=e.target.closest("[data-bg]");if(!b)return;look.bg=b.dataset.bg;applyLook();};
$("#swatches").oninput=e=>{if(e.target.id==="customColor"){look.bg="custom";look.custom=e.target.value;applyLook();}};
$("#fonts").onclick=e=>{const b=e.target.closest("[data-font]");if(!b)return;look.font=b.dataset.font;applyLook();};
$("#sizes").onclick=e=>{const b=e.target.closest("[data-size]");if(!b)return;look.scale=+b.dataset.size;applyLook();};
$("#resetLook").onclick=()=>{look={style:"default",bg:"auto",custom:null,font:"style",scale:1};applyLook();};

/* ---------- preview art ---------- */
function rng(seed){let h=2166136261;for(const c of seed)h=Math.imul(h^c.charCodeAt(0),16777619);return()=>{h+=0x6D2B79F5;let t=h;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};}
const PAL=Object.assign({games:{bg:"#1F1A45",a:"#8F7FFF",b:"#FFD166",c:"#352C78"},football:{bg:"#0D4331",a:"#5FD190",b:"#F3F0DA",c:"#125A42"},anime:{bg:"#4A163C",a:"#FF8FC4",b:"#FFE3F0",c:"#6A2255"},music:{bg:"#361C0B",a:"#FFB347",b:"#FFD8B0",c:"#562E13"},headlines:{bg:"#161F2C",a:"#EF4B4B",b:"#F2F4F7",c:"#223041"},tech:{bg:"#07313B",a:"#49D3EC",b:"#C9F6FF",c:"#0D4856"},economy:{bg:"#1A1A10",a:"#E9C46A",b:"#FFF6DA",c:"#33301A"},tennis:{bg:"#123A6B",a:"#D4F05A",b:"#F3F7FF",c:"#1B4F8F"},swimming:{bg:"#063A52",a:"#5ED6F5",b:"#E8FBFF",c:"#0A5272"},tabletennis:{bg:"#0F3D2E",a:"#FF7A3D",b:"#FFFFFF",c:"#155741"},sport:{bg:"#0D4331",a:"#5FD190",b:"#F3F0DA",c:"#125A42"},video:{bg:"#120D14",a:"#FF4A3D",b:"#FFFFFF",c:"#2A1A22"}},GAMEPAL);
const measureCtx=(()=>{try{return document.createElement("canvas").getContext("2d");}catch{return null;}})();
function fitSize(text,maxW,maxH){ if(!measureCtx) return Math.min(maxH,maxW/Math.max(2.5,text.length*.6)); measureCtx.font=`800 100px "Bricolage Grotesque", system-ui, sans-serif`; const w=measureCtx.measureText(text).width||text.length*60; return Math.min(maxH, maxW/(w/100)); }
const coverCache=new Map();
function motif(kind,r,p,W,H){
  let g="";
  switch(kind){
    case "genshin":{ const cx=W*.72,cy=H*.38; for(let i=5;i>0;i--) g+=`<circle cx="${cx}" cy="${cy}" r="${i*H*.11}" fill="none" stroke="${i%2?p.a:p.c}" stroke-opacity="${.18+i*.06}" stroke-width="${i===1?5:2}"/>`; g+=`<path d="M${cx} ${cy-H*.2}L${cx+H*.045} ${cy-H*.045}L${cx+H*.2} ${cy}L${cx+H*.045} ${cy+H*.045}L${cx} ${cy+H*.2}L${cx-H*.045} ${cy+H*.045}L${cx-H*.2} ${cy}L${cx-H*.045} ${cy-H*.045}Z" fill="${p.a}"/>`; for(let i=0;i<24;i++) g+=`<circle cx="${r()*W}" cy="${r()*H*.7}" r="${1+r()*2.2}" fill="${p.b}" opacity="${.3+r()*.6}"/>`; break; }
    case "hsr":{ for(let i=0;i<70;i++) g+=`<circle cx="${r()*W}" cy="${r()*H}" r="${.6+r()*2}" fill="${p.b}" opacity="${.25+r()*.7}"/>`; g+=`<path d="M${-W*.1} ${H*.95}C${W*.3} ${H*.4},${W*.6} ${H*.2},${W*1.1} ${H*.18}" fill="none" stroke="${p.a}" stroke-width="5"/><path d="M${-W*.1} ${H*1.02}C${W*.3} ${H*.5},${W*.62} ${H*.3},${W*1.1} ${H*.28}" fill="none" stroke="${p.a}" stroke-opacity=".5" stroke-width="5"/>`; for(let i=0;i<9;i++){const x=W*(.08+i*.11); g+=`<line x1="${x}" y1="${H*(.9-i*.07)}" x2="${x+10}" y2="${H*(1-i*.07)}" stroke="${p.a}" stroke-opacity=".45" stroke-width="3"/>`;} break; }
    case "wuwa":{ const cx=W*.7,cy=H*.4; for(let i=1;i<9;i++) g+=`<ellipse cx="${cx+i*6}" cy="${cy}" rx="${i*W*.05}" ry="${i*H*.06}" fill="none" stroke="${p.a}" stroke-opacity="${.9-i*.1}" stroke-width="${i<3?3:1.5}"/>`; let d=`M0 ${H*.72}`; for(let x=0;x<=W;x+=W/40) d+=`L${x} ${H*.72+Math.sin(x/28)*H*.04*(1+r())}`; g+=`<path d="${d}" fill="none" stroke="${p.b}" stroke-opacity=".5" stroke-width="2"/>`; break; }
    case "zzz":{ const cx=W*.72,cy=H*.4; for(let i=6;i>0;i--) g+=`<circle cx="${cx}" cy="${cy}" r="${i*H*.07}" fill="${i%2?p.a:p.bg}" opacity="${i%2?.9:1}"/>`; for(let y=0;y<H;y+=6) g+=`<rect y="${y}" width="${W}" height="2" fill="#fff" opacity=".035"/>`; g+=`<rect x="${W*.04}" y="${H*.08}" width="${W*.16}" height="${H*.05}" fill="${p.a}"/>`; break; }
    case "gta6":{ const grad=`<linearGradient id="sg${r().toString(36).slice(2,7)}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FF4F8B"/><stop offset=".6" stop-color="#FF9A4D"/><stop offset="1" stop-color="#FFD37A"/></linearGradient>`; const id=grad.match(/id="(\w+)"/)[1]; const cx=W*.68,cy=H*.52,R=H*.32; g+=`<defs>${grad}</defs><circle cx="${cx}" cy="${cy}" r="${R}" fill="url(#${id})"/>`; for(let i=0;i<6;i++) g+=`<rect x="${cx-R}" y="${cy+R*(.1+i*.16)}" width="${R*2}" height="${3+i*2.2}" fill="${p.bg}"/>`; g+=`<rect y="${cy+R*.98}" width="${W}" height="${H}" fill="${p.bg}"/>`; break; }
    case "minecraft":{ const s=W/14; for(let y=0;y<H/s;y++) for(let x=0;x<14;x++){ const v=r(); if(v>.55) g+=`<rect x="${x*s}" y="${y*s}" width="${s}" height="${s}" fill="${v>.9?p.a:v>.75?p.c:mix(p.bg,"#000000",.2)}"/>`; } break; }
    case "games":{ const s=W/20; for(let y=0;y<H/s;y++) for(let x=0;x<20;x++){const v=r(); if(v>.84) g+=`<rect x="${x*s}" y="${y*s}" width="${s-3}" height="${s-3}" rx="3" fill="${v>.96?p.b:v>.9?p.a:p.c}"/>`;} break; }
    case "football": case "sport":{ for(let i=0;i<8;i++) g+=`<rect x="${i*W/8}" width="${W/16}" height="${H}" fill="${p.c}"/>`; g+=`<g fill="none" stroke="${p.b}" stroke-opacity=".45" stroke-width="4"><rect x="30" y="30" width="${W-60}" height="${H-60}"/><line x1="${W/2}" y1="30" x2="${W/2}" y2="${H-30}"/><circle cx="${W/2}" cy="${H/2}" r="${H*.18}"/></g><circle cx="${W*(.3+r()*.5)}" cy="${H*(.25+r()*.3)}" r="13" fill="${p.b}"/>`; break; }
    case "anime":{ const cx=W*(.6+r()*.3),cy=H*(.2+r()*.3); for(let i=0;i<46;i++){const a=i/46*Math.PI*2,w=.02+r()*.05; g+=`<path d="M${cx} ${cy}L${cx+Math.cos(a)*1400} ${cy+Math.sin(a)*1400}L${cx+Math.cos(a+w)*1400} ${cy+Math.sin(a+w)*1400}Z" fill="${i%2?p.c:p.bg}"/>`;} for(let i=0;i<6;i++){const x=r()*W,y=r()*H*.55,s=8+r()*18; g+=`<path d="M${x} ${y-s}Q${x} ${y} ${x+s} ${y}Q${x} ${y} ${x} ${y+s}Q${x} ${y} ${x-s} ${y}Q${x} ${y} ${x} ${y-s}Z" fill="${p.b}"/>`;} break; }
    case "music":{ const n=44,bw=W/n; for(let i=0;i<n;i++){const h=(Math.sin(i*.35+r()*2)*.5+.6)*H*.48*(.5+r()*.5); g+=`<rect x="${i*bw+2}" y="${H*.4-h/2}" width="${bw-4}" height="${h}" rx="${(bw-4)/2}" fill="${i%5===0?p.b:p.a}" opacity="${.35+r()*.5}"/>`;} break; }
    case "headlines":{ for(let i=0;i<12;i++) g+=`<rect x="${40+r()*30}" y="${36+i*30}" width="${W*(.3+r()*.6)}" height="${8+r()*6}" rx="4" fill="${p.c}"/>`; g+=`<rect y="${H-14}" width="${W}" height="14" fill="${p.a}"/>`; break; }
    case "tech":{ for(let i=0;i<14;i++){let x=Math.round(r()*20)*W/20,y=Math.round(r()*12)*H/12,d=`M${x} ${y}`; for(let k=0;k<4;k++){ if(r()>.5) x+=(r()>.5?1:-1)*W/20*(1+Math.floor(r()*4)); else y+=(r()>.5?1:-1)*H/12*(1+Math.floor(r()*3)); d+=`L${x} ${y}`;} g+=`<path d="${d}" fill="none" stroke="${p.c}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/><circle cx="${x}" cy="${y}" r="7" fill="${p.a}"/>`;} break; }
    case "economy":{ let y=H*.62, d=`M0 ${y}`; const pts=[]; for(let x=0;x<=W;x+=W/24){ y=Math.max(H*.15,Math.min(H*.8,y+(r()-.47)*H*.12)); pts.push([x,y]); d+=`L${x} ${y}`; }
      for(let i=0;i<pts.length;i+=2){ const [x,yy]=pts[i], h=10+r()*36, up=r()>.45; g+=`<line x1="${x}" y1="${yy-h*.8}" x2="${x}" y2="${yy+h*.8}" stroke="${up?p.a:"#E76F51"}" stroke-width="2" opacity=".6"/><rect x="${x-6}" y="${yy-h/2}" width="12" height="${h}" fill="${up?p.a:"#E76F51"}" opacity=".55"/>`; }
      g+=`<path d="${d}" fill="none" stroke="${p.b}" stroke-width="4" stroke-linejoin="round"/>`; for(let i=1;i<5;i++) g+=`<line x1="0" y1="${H*i/5}" x2="${W}" y2="${H*i/5}" stroke="${p.c}" stroke-width="2"/>`; break; }
    case "tennis":{ g+=`<g fill="none" stroke="${p.b}" stroke-opacity=".55" stroke-width="5"><rect x="${W*.08}" y="${H*.1}" width="${W*.84}" height="${H*.8}"/><line x1="${W*.08}" y1="${H*.22}" x2="${W*.92}" y2="${H*.22}"/><line x1="${W*.08}" y1="${H*.78}" x2="${W*.92}" y2="${H*.78}"/><line x1="${W*.3}" y1="${H*.22}" x2="${W*.3}" y2="${H*.78}"/><line x1="${W*.7}" y1="${H*.22}" x2="${W*.7}" y2="${H*.78}"/><line x1="${W*.3}" y1="${H*.5}" x2="${W*.7}" y2="${H*.5}"/></g><line x1="${W/2}" y1="${H*.06}" x2="${W/2}" y2="${H*.94}" stroke="${p.b}" stroke-width="8"/>`;
      const bx=W*(.55+r()*.3), by=H*(.2+r()*.3); g+=`<circle cx="${bx}" cy="${by}" r="${H*.07}" fill="${p.a}"/><path d="M${bx-H*.05} ${by-H*.045}q${H*.05} ${H*.045} 0 ${H*.09}M${bx+H*.05} ${by-H*.045}q${-H*.05} ${H*.045} 0 ${H*.09}" fill="none" stroke="#fff" stroke-width="2.5" opacity=".8"/>`; break; }
    case "swimming":{ for(let i=1;i<6;i++){ const y=H*i/6; let d=`M0 ${y}`; for(let x=0;x<=W;x+=20) d+=`L${x} ${y+Math.sin(x/30+i)*4}`; g+=`<path d="${d}" fill="none" stroke="${i%2?p.a:p.b}" stroke-width="5" stroke-dasharray="14 10" opacity=".55"/>`; }
      for(let i=0;i<5;i++){ const y=H*(i+.5)/6; let d=`M0 ${y}`; for(let x=0;x<=W;x+=16) d+=`L${x} ${y+Math.sin(x/22+i*2)*7}`; g+=`<path d="${d}" fill="none" stroke="${p.c}" stroke-width="10" opacity=".7"/>`; } break; }
    case "tabletennis":{ g+=`<rect x="${W*.1}" y="${H*.2}" width="${W*.8}" height="${H*.6}" rx="10" fill="${p.c}"/><rect x="${W*.1}" y="${H*.2}" width="${W*.8}" height="${H*.6}" rx="10" fill="none" stroke="${p.b}" stroke-width="5" opacity=".7"/><line x1="${W*.1}" y1="${H*.5}" x2="${W*.9}" y2="${H*.5}" stroke="${p.b}" stroke-width="3" opacity=".6"/><line x1="${W/2}" y1="${H*.14}" x2="${W/2}" y2="${H*.86}" stroke="${p.b}" stroke-width="9"/>`;
      const bx=W*(.25+r()*.5), by=H*(.12+r()*.2); g+=`<circle cx="${bx}" cy="${by}" r="${H*.045}" fill="${p.a}"/><path d="M${W*.15} ${H*.9}Q${bx} ${H*.05} ${W*.85} ${H*.7}" fill="none" stroke="${p.a}" stroke-width="2.5" stroke-dasharray="6 8" opacity=".7"/>`; break; }
    default:{ for(let i=0;i<5;i++) g+=`<circle cx="${r()*W}" cy="${r()*H}" r="${80+r()*160}" fill="${p.c}"/>`; }
  }
  return g;
}
function cover(seed,kind,text,W=800,H=500,opt={}){
  const key=[seed,kind,text,W,H,opt.small?1:0,opt.sub||""].join("|"); if(coverCache.has(key)) return coverCache.get(key);
  const r=rng(seed),p=PAL[kind]||PAL.video; const g=motif(kind,r,p,W,H);
  const t=String(text||"");
  let title="";
  if(t){ const maxW=W*(opt.small?.7:.86), maxH=H*(opt.small?.2:.36); const fs=fitSize(t,maxW,maxH);
    title=`<text x="${W*.06}" y="${H*.86}" font-family="Bricolage Grotesque, system-ui, sans-serif" font-weight="800" font-size="${fs.toFixed(1)}" letter-spacing="${(-fs*.03).toFixed(1)}" fill="${p.b}">${esc(t)}</text>`; }
  const sub=opt.sub?`<text x="${W*.06}" y="${H*.14}" font-family="Figtree, system-ui, sans-serif" font-weight="700" font-size="${(H*.055).toFixed(1)}" fill="${p.b}" opacity=".8">${esc(opt.sub)}</text>`:"";
  const gid="g"+Math.abs(key.split("").reduce((a,c)=>a*31+c.charCodeAt(0)|0,7)).toString(36);
  const svg=`<svg class="cov" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMinYMax slice" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset=".4" stop-color="${p.bg}" stop-opacity="0"/><stop offset="1" stop-color="${p.bg}" stop-opacity=".9"/></linearGradient></defs><rect width="${W}" height="${H}" fill="${p.bg}"/>${g}<rect width="${W}" height="${H}" fill="url(#${gid})"/>${sub}${title}</svg>`;
  coverCache.set(key,svg); return svg;
}
const artKind = it => { if (it.games&&GAMEPAL[it.games[0]]) return it.games[0]; if (it.type==="video") return "video"; if (it.cat==="sport") return ({tennis:"tennis",swimming:"swimming",tabletennis:"tabletennis"})[it.sport]||"football"; return it.cat; };
const playIcon=`<svg viewBox="0 0 24 24"><path d="M7 4.5v15l13-7.5z"/></svg>`;

/* ---------- time ---------- */
const dayDiff=(iso)=>{ const d=new Date(iso.length===10?iso+"T12:00:00":iso), t=new Date(); return Math.round((new Date(t.toDateString())-new Date(d.toDateString()))/864e5); };
function ago(iso,time){ if(time){ const m=(Date.now()-new Date(time))/6e4; if(m>=0&&m<60) return Math.max(1,Math.round(m))+"m ago"; if(m>=0&&m<1440) return Math.round(m/60)+"h ago"; }
  if(iso.length===10){ const df=dayDiff(iso); return df<=0?"Today":df===1?"Yesterday":new Date(iso+"T12:00:00").toLocaleDateString(undefined,{day:"numeric",month:"short"}); }
  const m=(Date.now()-new Date(iso))/6e4; if(isNaN(m)) return ""; if(m<60) return Math.max(1,Math.round(m))+"m ago"; if(m<1440) return Math.round(m/60)+"h ago"; return Math.round(m/1440)+"d ago"; }
function fmtDate(iso,o){ try{return new Date(iso.length===10?iso+"T12:00:00":iso).toLocaleDateString(undefined,o||{day:"numeric",month:"short"});}catch{return iso;} }
function until(iso){ if(!iso||iso.length===4) return iso||""; const d=-dayDiff(iso); return d>1?`in ${d} days`:d===1?"tomorrow":d===0?"today":`${-d} days ago`; }
function progress(s,e){ const a=new Date(s+"T00:00:00"),b=new Date(e+"T00:00:00"),n=Date.now(); return Math.max(0,Math.min(1,(n-a)/(b-a))); }

/* ---------- network: website (/api) or app (direct, via the native fetch command) ---------- */
const TAURI_INVOKE = (window.__TAURI__ && window.__TAURI__.core && window.__TAURI__.core.invoke) || (window.__TAURI_INTERNALS__ && window.__TAURI_INTERNALS__.invoke);
const APP = !!TAURI_INVOKE;
async function nativeFetch(url, init = {}) {
  const r = await TAURI_INVOKE("fetch_url", { url, headers: init.headers || {} });
  const bin = Uint8Array.from(atob(r.body || ""), c => c.charCodeAt(0));
  const h = new Headers(); for (const [k, v] of Object.entries(r.headers || {})) { try { h.append(k, v); } catch {} }
  h.set("x-fleeter-final-url", r.url || url);
  return new Response([101, 204, 205, 304].includes(r.status) ? null : bin, { status: r.status || 599, headers: h });
}
const appCache = { get: async k => store.get("pc:" + k, null), set: async (k, v) => { store.set("pc:" + k, v); } };
const api = {
  async config() {
    if (APP) { const c = await (await fetch("sources.json")).json(); return { sources: c.sources, games: c.games, markets: c.markets, morningEdition: null, kv: false }; }
    const r = await fetch("api/config", { cache: "no-store" }); if (!r.ok) throw new Error(r.status); return r.json();
  },
  async feed(src, mode) {
    if (APP) return FleeterProviders.fetchSource(src, nativeFetch, appCache);
    return fetch(`api/feed?id=${encodeURIComponent(src.id)}&mode=${mode}`, { cache: "no-store" });
  },
  async og(url) {
    if (APP) { const r = await nativeFetch(url, { headers: { accept: "text/html" } }); if (!r.ok) return null; const html = await decodeBody(r); return ogFromHtml(html, url); }
    const r = await fetch("api/og?url=" + encodeURIComponent(url)); if (!r.ok) return null; return (await r.json()).image || null;
  },
  async article(url) {
    if (APP) return nativeFetch(url, { headers: { accept: "text/html,application/xhtml+xml", "user-agent": FleeterProviders.BROWSER_UA } });
    return fetch("api/article?url=" + encodeURIComponent(url));
  },
  async markets() {
    if (APP) return { at: new Date().toISOString(), markets: await FleeterProviders.fetchMarkets(CONFIG.markets || [], nativeFetch) };
    const r = await fetch("api/markets", { cache: "no-store" }); if (!r.ok) throw new Error(r.status); return r.json();
  },
};
async function decodeBody(res) {
  const buf = await res.arrayBuffer();
  let cs = (/charset=([\w-]+)/i.exec(res.headers.get("content-type") || "") || [])[1];
  if (!cs) { const head = new TextDecoder("latin1").decode(buf.slice(0, 4096)); cs = (/<meta[^>]+charset=["']?([\w-]+)/i.exec(head) || /encoding=["']([\w-]+)["']/i.exec(head) || [])[1]; }
  cs = (cs || "utf-8").toLowerCase(); if (cs === "gb2312") cs = "gbk";
  try { return new TextDecoder(cs).decode(buf); } catch { return new TextDecoder("utf-8").decode(buf); }
}
function ogFromHtml(html, base) {
  const m = /<meta[^>]+(?:property|name)=["'](?:og:image(?::secure_url)?|twitter:image(?::src)?)["'][^>]*content=["']([^"']+)["']/i.exec(html) || /<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["'](?:og:image|twitter:image)["']/i.exec(html);
  return m ? safeUrl(m[1].replace(/&amp;/g, "&"), base) || null : null;
}

/* ---------- HD images: ask each image service for a large version, keep the original as a fallback ---------- */
const SIGNED = /[?&](s|sig|signature|token|hmac|Expires|X-Amz-Signature)=/i;
function hd(u, w = 1280) {
  if (!u) return null;
  let x; try { x = new URL(u.replace(/^\/\//, "https://")); } catch { return null; }
  if (x.protocol === "http:") x.protocol = "https:";
  const h = x.hostname, orig = x.href;
  let m;
  if (/(^|\.)ytimg\.com$/.test(h) && (m = /\/vi(?:_webp)?\/([\w-]{11})\//.exec(x.pathname))) return { src: `https://i.ytimg.com/vi/${m[1]}/maxresdefault.jpg`, fb: `https://i.ytimg.com/vi/${m[1]}/hqdefault.jpg` };
  if (/hdslb\.com$/.test(h)) { x.pathname = x.pathname.replace(/@.*$/, ""); x.search = ""; return { src: x.href, fb: orig }; }                       // Bilibili: original upload
  if (/ichef\.bbci\.co\.uk$/.test(h)) { x.pathname = x.pathname.replace(/\/(standard|news|ws)\/\d{2,4}\//, `/$1/${w >= 1000 ? 1024 : 976}/`).replace(/\/images\/ic\/\d+x\d+\//, "/images/ic/1280x720/"); return { src: x.href, fb: orig }; }
  if (/(inews\.gtimg\.com|qpic\.cn)$/.test(h)) { x.pathname = x.pathname.replace(/\/\d{2,4}$/, "/0"); return { src: x.href, fb: orig }; }       // Tencent: /0 is the original
  if (/nimg\.ws\.126\.net$/.test(h) && x.searchParams.get("url")) { const inner = safeUrl(x.searchParams.get("url")); if (inner) return { src: inner, fb: orig }; }
  if (/126\.net$/.test(h)) { x.search = ""; return { src: x.href, fb: orig }; }                                                                  // NetEase CDN: drop thumbnail params
  if (/futurecdn\.net$/.test(h)) { x.pathname = x.pathname.replace(/-\d{3,4}-80(\.\w+)$/, "-1200-80$1"); return { src: x.href, fb: orig }; }
  if (/(^|\.)wp\.com$/.test(h)) { ["resize", "fit", "h", "w"].forEach(k => x.searchParams.delete(k)); x.searchParams.set("w", String(Math.max(w, 1200))); return { src: x.href, fb: orig }; }
  const wp = x.pathname.replace(/-\d{2,4}x\d{2,4}(\.(?:jpe?g|png|webp|avif))$/i, "$1"); if (wp !== x.pathname) { x.pathname = wp; return { src: x.href, fb: orig }; } // WordPress size suffix
  if (!SIGNED.test(x.search)) {
    let changed = false;
    for (const k of ["width", "w", "imwidth", "resize"]) { const v = parseInt(x.searchParams.get(k) || "", 10); if (v && v < w) { const ratio = w / v; x.searchParams.set(k, String(w)); for (const hk of ["height", "h"]) { const hv = parseInt(x.searchParams.get(hk) || "", 10); if (hv) x.searchParams.set(hk, String(Math.round(hv * ratio))); } changed = true; } }
    if (changed) return { src: x.href, fb: orig };
  }
  return { src: orig, fb: null };
}
// Is the feed's own image too small to look sharp, with no way to ask for a bigger one?
function lowRes(u, declaredW) {
  if (!u) return true;
  const r = hd(u); if (r && r.fb) return false;
  if (declaredW && declaredW < 800) return true;
  if (/[?&](w|width)=([1-6]\d\d)\b/.test(u) || /\/(thumb|thumbnail|small|tn)[_/.-]/i.test(u) || /-\d{2,3}x\d{2,3}\./.test(u)) return true;
  return false;
}
function imgTag(u, w, cls = "ph") {
  const r = hd(u, w); if (!r) return "";
  return `<img class="${cls}" src="${esc(r.src)}" ${r.fb ? `data-fb="${esc(r.fb)}"` : ""} alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">`;
}
document.addEventListener("error", e => { const t = e.target; if (!(t && t.tagName === "IMG" && t.classList.contains("ph"))) return; if (t.dataset.fb) { const fb = t.dataset.fb; delete t.dataset.fb; t.src = fb; } else t.remove(); }, true);
document.addEventListener("load", e => { const t = e.target; if (t && t.tagName === "IMG" && t.classList.contains("ph") && t.naturalWidth && t.naturalWidth < 200 && t.dataset.fb) { const fb = t.dataset.fb; delete t.dataset.fb; t.src = fb; } }, true);

/* ---------- feed parsing ---------- */
const kids = (el, name) => el ? [...el.children].filter(c => c.localName === name) : [];
const kid = (el, name) => { const all = kids(el, name); return all.find(c => !c.prefix) || all[0] || null; };
const deep = (el, name) => el ? [...el.getElementsByTagNameNS("*", name)] : [];
const txt = el => (el && el.textContent || "").trim();
function hashId(s){ let h=2166136261; for(const c of String(s)) h=Math.imul(h^c.charCodeAt(0),16777619); return "i"+(h>>>0).toString(36); }
function htmlBits(html, base){
  if(!html) return { text:"", img:null, yt:null, bili:null, html:"" };
  const d = new DOMParser().parseFromString(html, "text/html");
  const img = [...d.querySelectorAll("img")].map(i => i.getAttribute("data-src") || i.getAttribute("data-original") || i.getAttribute("src")).map(u => safeUrl(u, base)).find(u => u && !/(pixel|feedburner|gravatar|emoji|\.gif|1x1|spacer|tracking)/i.test(u)) || null;
  const yt = (/(?:youtube(?:-nocookie)?\.com\/(?:embed\/|watch\?v=|shorts\/)|youtu\.be\/)([\w-]{11})/.exec(html) || [])[1] || null;
  const bili = (/bilibili\.com\/(?:video\/|blackboard\/[^"']*?bvid=|player\.html\?[^"']*?bvid=)(BV[\w]{10})/.exec(html) || [])[1] || null;
  d.querySelectorAll("script,style").forEach(n=>n.remove());
  let text = (d.body ? d.body.textContent : "").replace(/\s+/g," ").trim();
  text = text.replace(/The post .{1,200}? appeared first on .{1,80}?\.?$/i,"").replace(/\s*(Continue reading|Read more|Source)\s*[.…»›]*\s*$/i,"").replace(/\[…\]|\[\.\.\.\]/g,"…").trim();
  return { text, img, yt, bili, html };
}
function clip(s, n){ if(!s || s.length<=n) return s||""; const c=s.slice(0,n); const i=c.lastIndexOf(" "); return (i>n*.6?c.slice(0,i):c).replace(/[,;:.\s]+$/,"")+"…"; }
const STOP=new Set(["the","and","for","with","from","this","that","into","after","over","new","now","its","has","have","will","what","when","how","why","who","are","was","were","out","off","about","says","said","here","your","you","our"]);
function coverWord(title){
  const num = /(\$?\d+(?:[.,:–-]\d+)?(?:bn|m|k|%)?)/.exec(title); if (num && num[1].length<=7) return num[1];
  if (/[\u4e00-\u9fff]/.test(title)) return (title.replace(/[^\u4e00-\u9fffA-Za-z0-9]/g,"").slice(0,4));
  const words = title.replace(/[‘’'"“”:!?(),.]/g," ").split(/\s+/).filter(w => w.length>2 && /^[A-Z0-9]/.test(w) && !STOP.has(w.toLowerCase()));
  return (words[0]||title.split(" ")[0]||"").slice(0,11);
}
const kwRe = k => /[\u4e00-\u9fff]/.test(k) ? new RegExp(k.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")) : new RegExp("(^|[^a-z0-9])"+k.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g,"\\$&")+"([^a-z0-9]|$)");
const reCache = new Map(); const kwTest = (k, low) => { let re = reCache.get(k); if (!re) { re = kwRe(k); reCache.set(k, re); } return re.test(low); };
function tagGames(text, srcGames){
  const out = new Set(srcGames||[]); const low = " "+text.toLowerCase()+" ";
  for (const g of CONFIG.games||[]) for (const k of g.keywords||[]) if (kwTest(k, low)) { out.add(g.id); break; }
  return [...out];
}
/* sport and league sorting by keywords (titles in English or Chinese) */
const SPORT_KW = {
  tabletennis: ["table tennis","ping pong","wtt","ittf","乒乓","樊振东","孙颖莎","王楚钦","马龙","王曼昱","陈梦","林诗栋","moregard","calderano","harimoto","张本智和"],
  swimming: ["swimming","swimmer","swim ","world aquatics","freestyle","breaststroke","backstroke","butterfly final","medley","游泳","潘展乐","汪顺","张雨霏","覃海洋","ledecky","marchand","mcintosh","titmus","peaty","duncan scott"],
  tennis: ["tennis","wimbledon","roland garros","french open","australian open","us open tennis","atp","wta","davis cup","billie jean king cup","网球","郑钦文","djokovic","alcaraz","sinner","sabalenka","swiatek","świątek","gauff","draper","raducanu","zverev","medvedev","fritz","rybakina","pegula"],
  football: ["football","soccer","足球","premier league","la liga","laliga","serie a","bundesliga","ligue 1","champions league","europa league","world cup","nations league","fifa","uefa","中超","英超","西甲","意甲","德甲","法甲","欧冠","世界杯","国足"]
};
const LEAGUE_KW = [
  ["ucl", ["champions league","europa league","conference league","ucl","uel","欧冠","欧联","欧协联"]],
  ["intl", ["world cup","nations league","euro 2028","copa america","copa américa","international friendly","world cup qualifier","three lions","lionesses","tuchel","fifa","世界杯","国足","国家队","欧洲杯","亚洲杯","女足"]],
  ["csl", ["chinese super league","中超","足协杯","国安","申花","海港","泰山","蓉城"]],
  ["epl", ["premier league","英超","arsenal","aston villa","bournemouth","brentford","brighton","burnley","chelsea","crystal palace","everton","fulham","leeds","liverpool","manchester city","man city","manchester united","man utd","man united","newcastle","nottingham forest","sunderland","tottenham","west ham","wolves","wolverhampton","阿森纳","曼城","曼联","利物浦","切尔西","热刺","纽卡"]],
  ["laliga", ["la liga","laliga","西甲","real madrid","barcelona","barça","atletico madrid","atlético madrid","athletic club","real sociedad","sevilla","valencia","villarreal","real betis","girona","osasuna","celta vigo","mallorca","getafe","rayo vallecano","espanyol","皇马","巴萨","马竞"]],
  ["seriea", ["serie a","意甲","juventus","inter milan","internazionale","ac milan","napoli","as roma","lazio","atalanta","fiorentina","bologna","torino","尤文","国米","ac米兰","那不勒斯","罗马"]],
  ["bundesliga", ["bundesliga","德甲","bayern","dortmund","leverkusen","rb leipzig","stuttgart","eintracht frankfurt","wolfsburg","freiburg","union berlin","拜仁","多特","勒沃库森"]],
  ["ligue1", ["ligue 1","法甲","psg","paris saint-germain","paris st-germain","marseille","lyon","monaco","lille","ogc nice","rc lens","rennes","大巴黎","巴黎圣日耳曼"]],
];
function classifySport(it, src){
  if (it.cat !== "sport") return;
  const low = " "+(it.title+" "+(it.outline||"").slice(0,300)).toLowerCase()+" ";
  let sport = src.sport || null;
  if (!sport) for (const s of ["tabletennis","swimming","tennis","football"]) if (SPORT_KW[s].some(k => kwTest(k, low))) { sport = s; break; }
  it.sport = sport || "other";
  if (it.sport === "football") {
    let lg = src.league || null;
    if (!lg) for (const [id, kws] of LEAGUE_KW) if (kws.some(k => kwTest(k, low))) { lg = id; break; }
    it.league = lg || "other";
  }
}
function vidTag(title){ const m=/(trailer|teaser|gameplay|livestream|special program|showcase|overview|cinematic|short|demo|PV|预告|实机|直播)/i.exec(title); return m ? m[1].replace(/^./,c=>c.toUpperCase()) : "Video"; }
function baseItem(src, o){
  const it = { id: hashId(o.url), src: src.id, source: src.name, lang: src.lang || "en", cat: src.cat, title: o.title, url: o.url, iso: o.iso, date: o.iso.slice(0,10),
    image: o.image || null, imageW: o.imageW || 0, outline: clip(o.text||"", 200), body: o.text ? [clip(o.text, 1200)] : [], fullHtml: o.fullHtml || "",
    games: tagGames(o.title+" "+(o.text||"").slice(0,400), src.games), cover: coverWord(o.title), type: "story" };
  return it;
}
function parseXml(xml, src){
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) throw new Error("Not a readable feed");
  const atom = doc.documentElement.localName === "feed";
  const nodes = atom ? deep(doc, "entry") : deep(doc, "item");
  const out = [];
  for (const n of nodes.slice(0, src.kind==="youtube" ? 12 : 18)) {
    const title = txt(kid(n,"title")).replace(/\s+/g," "); if (!title) continue;
    let link = "";
    if (atom) { const ls = kids(n,"link"); const l = ls.find(x => (x.getAttribute("rel")||"alternate")==="alternate") || ls[0]; link = l ? l.getAttribute("href") : ""; }
    else { link = txt(kid(n,"link")); if (!link) { const g = kid(n,"guid"); if (g && /^https?:/.test(txt(g))) link = txt(g); } }
    link = safeUrl(link); if (!link) continue;
    const dateS = txt(kid(n,"pubDate")) || txt(kid(n,"published")) || txt(kid(n,"updated")) || txt(kid(n,"date"));
    const when = new Date(dateS); const iso = isNaN(when) ? new Date().toISOString() : when.toISOString();
    const summaryHtml = txt(kid(n,"description")) || txt(kid(n,"summary")) || txt(deep(n,"description")[0]);
    const contentHtml = txt(kid(n,"encoded")) || txt(kids(n,"content").find(c => !c.prefix));
    const a = htmlBits(summaryHtml || contentHtml, link), b = contentHtml ? htmlBits(contentHtml, link) : { img:null, yt:null, bili:null, text:"", html:"" };
    let image = null, imageW = 0;
    const cands = [...deep(n,"thumbnail").map(t => [t.getAttribute("url"), +t.getAttribute("width")||0]),
      ...deep(n,"content").filter(c => c.getAttribute("url") && (/image/.test(c.getAttribute("medium")||c.getAttribute("type")||"") || /\.(jpe?g|png|webp|avif)(\?|$)/i.test(c.getAttribute("url")))).map(c => [c.getAttribute("url"), +c.getAttribute("width")||0]),
      ...kids(n,"enclosure").filter(e => /^image\//.test(e.getAttribute("type")||"")).map(e => [e.getAttribute("url"), 0])];
    if (cands.length) { cands.sort((x, y) => (y[1]||9999) - (x[1]||9999)); [image, imageW] = cands[0]; }
    image = safeUrl(image || b.img || a.img || "", link) || null;
    const text = (b.text && b.text.length > (a.text||"").length ? b.text : a.text) || "";
    const it = baseItem(src, { title, url: link, iso, image, imageW, text, fullHtml: b.html && b.text.length > 1500 ? b.html : "" });
    if (src.kind === "youtube") {
      const vid = txt(deep(n,"videoId")[0]); if (!vid) continue;
      const desc = txt(deep(n,"description")[0]); const st = deep(n,"statistics")[0];
      Object.assign(it, { type:"video", id:"yt"+vid, image:`https://i.ytimg.com/vi/${vid}/maxresdefault.jpg`, tag: vidTag(title), views: st ? +st.getAttribute("views") || 0 : 0,
        outline: clip(desc.replace(/\s+/g," "), 180) || `New upload from ${src.name}.`, body: desc ? desc.split(/\n{2,}/).map(s=>s.trim()).filter(Boolean).slice(0,12) : [],
        video: { ytId: vid, label: title, channel: src.name, url: `https://www.youtube.com/watch?v=${vid}` } });
    } else {
      const yt = a.yt || b.yt, bili = a.bili || b.bili;
      if (yt) it.video = { ytId: yt, label: "Video in this story", channel: src.name, url: `https://www.youtube.com/watch?v=${yt}` };
      else if (bili) it.video = { bvid: bili, label: "Video in this story", channel: src.name, url: `https://www.bilibili.com/video/${bili}` };
    }
    classifySport(it, src);
    out.push(it);
  }
  return out;
}
function parseJsonItems(list, src){
  return list.slice(0, 20).map(o => {
    const url = safeUrl(o.url); if (!url || !o.title) return null;
    const it = baseItem(src, { title: String(o.title).replace(/\s+/g," ").trim(), url, iso: o.iso || new Date().toISOString(), image: safeUrl(o.image||"") || null, text: (o.summary||"").replace(/\s+/g," ").trim() });
    if (o.author && o.author !== src.name) it.byline = o.author;
    if (o.bvid) Object.assign(it, { type:"video", id:"bl"+o.bvid, views: o.views||0, tag: o.zone || vidTag(it.title),
      outline: clip(o.summary||"", 180) || (o.author ? `By ${o.author} on Bilibili.` : "On Bilibili."), body: o.summary ? String(o.summary).split(/\n+/).filter(Boolean).slice(0,12) : [],
      video: { bvid: o.bvid, label: it.title, channel: o.author || src.name, url } });
    classifySport(it, src);
    return it;
  }).filter(Boolean);
}
function parseNeteaseJsonp(text, src){
  const s = text.indexOf("("), e = text.lastIndexOf(")");
  const body = text.slice(s + 1, e);
  let list; try { list = JSON.parse(body); } catch { list = JSON.parse(body.replace(/,\s*([\]}])/g, "$1")); }
  return parseJsonItems(list.filter(x => x && x.title && x.docurl).map(x => ({ title: x.title, url: x.docurl, iso: FleeterProviders.chinaTime(x.time), image: x.imgurl, summary: x.digest || "" })), src);
}
async function parseResponse(res, src){
  const ct = res.headers.get("content-type") || "";
  const text = await decodeBody(res);
  if (src.kind === "netease-jsonp") return parseNeteaseJsonp(text, src);
  if (/json/.test(ct) || /^\s*\{/.test(text)) { const j = JSON.parse(text); if (j.format === "fleeter-json") return parseJsonItems(j.items || [], src); if (j.error) throw new Error(j.error); }
  return parseXml(text, src);
}

/* ---------- loading ---------- */
function urlKey(u){ try { const x = new URL(u); [...x.searchParams.keys()].forEach(k => { if (/^(utm_|fbclid|gclid|mc_|ref$|src$|from$|spm)/i.test(k)) x.searchParams.delete(k); }); x.hash = ""; return (x.host.replace(/^(www|m|new)\./,"") + x.pathname.replace(/\/$/,"") + (x.search || "")).toLowerCase(); } catch { return u; } }
const bySource = new Map();
function rebuild(){
  const seenUrl = new Set(), seenTitle = new Set(), all = [];
  for (const list of bySource.values()) for (const it of list) {
    const u = urlKey(it.url), t = it.title.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g,"").slice(0,60);
    if (seenUrl.has(u) || (t.length > 8 && seenTitle.has(t))) continue; seenUrl.add(u); seenTitle.add(t); all.push(it);
  }
  all.sort((a,b) => b.iso.localeCompare(a.iso));
  edition.items = all;
  edition.games = detectVersions(CONFIG.games || []);
}
function verNum(v){ const m=/(\d+)\.(\d+)/.exec(v||""); return m ? (+m[1])*1000+(+m[2]) : -1; }
function detectVersions(games){
  return games.map(g => {
    const vids = (edition.items||[]).filter(i => i.type==="video" && (i.games||[]).includes(g.id));
    let best = null; for (const v of vids) { const m = /(?:version|版本)\s*(\d+\.\d+)|(\d+\.\d+)\s*(?:版本|version)/i.exec(v.title); const n = m && (m[1]||m[2]); if (n && (!best || verNum(n)>verNum(best))) best = n; }
    const latestVideo = vids.find(v => v.lang === "en") || vids[0] || null;
    return Object.assign({}, g, { detected: best, version: best && verNum(best)>verNum(g.version) ? best : g.version, latestVideo });
  });
}
let renderTimer=null; const scheduleRender=()=>{ clearTimeout(renderTimer); renderTimer=setTimeout(()=>{ renderAll(); },180); };
async function pool(list, n, fn){ const q=[...list]; await Promise.all(Array.from({length:Math.min(n,q.length)}, async()=>{ while(q.length) await fn(q.shift()); })); }
async function loadSource(src, mode){
  health.set(src.id, Object.assign({}, health.get(src.id)||{}, { state:"wait" }));
  const t0 = performance.now();
  try {
    const r = await api.feed(src, mode);
    if (!r.ok) { let msg = r.status+""; try { msg = (await r.json()).error || msg; } catch {} throw new Error(msg); }
    const items = await parseResponse(r, src);
    bySource.set(src.id, items);
    health.set(src.id, { state:"ok", n:items.length, ms:Math.round(performance.now()-t0), mode:r.headers.get("x-fleeter-mode")||mode });
  } catch (e) {
    health.set(src.id, Object.assign({}, health.get(src.id)||{}, { state:"bad", error:String(e && e.message || e).slice(0,90), ms:Math.round(performance.now()-t0) }));
  }
}
let loading=false;
async function loadAll(mode, onlyIds){
  if (loading) return null; loading = true;
  const prog=$("#prog"), btn=$("#refresh"); prog.classList.add("on"); prog.style.width="3%"; btn.classList.add("spinning"); btn.disabled=true;
  const list = CONFIG.sources.filter(s => !onlyIds || onlyIds.includes(s.id)); let done=0;
  const before = new Set(edition.items.map(i=>i.id));
  const mk = onlyIds ? null : loadMarkets();
  await pool(list, 8, async s => { await loadSource(s, mode); done++; prog.style.width=(3+97*done/list.length).toFixed(1)+"%"; rebuild(); scheduleRender(); });
  if (mk) await mk;
  edition.mode = mode; edition.compiledAt = mode==="morning" && CONFIG.morningEdition ? CONFIG.morningEdition : new Date().toISOString();
  rebuild(); renderAll(); saveCache();
  setTimeout(()=>{ prog.classList.remove("on"); prog.style.width="0"; },500); btn.classList.remove("spinning"); btn.disabled=false; loading=false;
  return { fresh: edition.items.filter(i=>!before.has(i.id)).length, bad: [...health.values()].filter(h=>h.state==="bad").length };
}
async function loadMarkets(){
  try { const m = await api.markets(); if (m && Array.isArray(m.markets)) { markets = m; store.set("markets", m); renderMarkets(); } } catch {}
}
function saveCache(){
  const slim = edition.items.slice(0,500).map(({fullHtml,body,...rest})=>Object.assign(rest,{ body: body && body.length ? [clip(body.join(" "),600)] : [] }));
  if (!store.set("cache", { at: edition.compiledAt, mode: edition.mode, items: slim })) { store.del("og"); store.set("cache", { at: edition.compiledAt, mode: edition.mode, items: slim.slice(0,250) }); }
}

/* ---------- sharper preview images for stories whose feed image is missing or small ---------- */
const ogMap = new Map(Object.entries(store.get("og", {})));
let ogQueue = [], ogBusy = 0;
const ogObserver = "IntersectionObserver" in window ? new IntersectionObserver(es => { for (const e of es) if (e.isIntersecting) { ogObserver.unobserve(e.target); ogQueue.push(e.target); } pumpOg(); }, { rootMargin: "400px" }) : null;
function pumpOg(){
  while (ogBusy < 4 && ogQueue.length) {
    const el = ogQueue.shift(), url = el.dataset.og; if (!url) continue;
    if (ogMap.has(url)) { applyOg(el, ogMap.get(url)); continue; }
    ogBusy++;
    api.og(url).catch(()=>null).then(img => {
      ogBusy--; img = img ? safeUrl(img) : null; ogMap.set(url, img);
      if (ogMap.size > 800) ogMap.delete(ogMap.keys().next().value);
      store.set("og", Object.fromEntries(ogMap));
      const it = edition.items.find(i => i.url===url); if (it && img) { it.image = img; it.imageW = 1200; }
      applyOg(el, img); pumpOg();
    });
  }
}
function applyOg(el, img){ if (!img) return; const th = el.querySelector(".thumb"); if (!th) return; const old = th.querySelector("img.ph"); if (old) old.remove(); th.insertAdjacentHTML("afterbegin", imgTag(img, 800)); }

/* ---------- the whole story: fetch the article page and keep only its text and pictures ---------- */
const fullCache = new Map();
let libs = null;
function loadScript(src){ return new Promise((res, rej) => { const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); }); }
function readerLibs(){
  if (!libs) libs = Promise.all([
    window.Readability ? 1 : loadScript("https://cdn.jsdelivr.net/npm/@mozilla/readability@0.5.0/Readability.js").catch(()=>0),
    window.DOMPurify ? 1 : loadScript("https://cdn.jsdelivr.net/npm/dompurify@3.1.6/dist/purify.min.js").catch(()=>0)]);
  return libs;
}
const KEEP = new Set(["P","H2","H3","H4","H5","UL","OL","LI","BLOCKQUOTE","FIGURE","FIGCAPTION","IMG","A","STRONG","EM","B","I","BR","HR","TABLE","THEAD","TBODY","TR","TH","TD","PRE","CODE","SUP","SUB","IFRAME"]);
function cleanArticle(root, base){
  root.querySelectorAll("h1, [class*=share], [class*=newsletter], [class*=related], [class*=advert], [id*=advert], [class*=promo]").forEach(n => n.remove());
  // pick the real source for lazy images, upgrade them to HD, drop tracking pixels
  root.querySelectorAll("picture").forEach(p => { const img = p.querySelector("img"); const srcs = [...p.querySelectorAll("source")].map(s => (s.getAttribute("srcset")||"").split(",").map(x=>x.trim().split(/\s+/)[0]).pop()).filter(Boolean); if (img && srcs.length && !img.getAttribute("src")) img.setAttribute("src", srcs[0]); if (img) p.replaceWith(img); });
  root.querySelectorAll("img").forEach(img => {
    const set = (img.getAttribute("srcset") || img.getAttribute("data-srcset") || "").split(",").map(s => s.trim().split(/\s+/)).filter(x => x[0]).sort((a,b) => (parseInt(b[1])||0)-(parseInt(a[1])||0))[0];
    const u = safeUrl((set && set[0]) || img.getAttribute("data-src") || img.getAttribute("data-original") || img.getAttribute("data-lazy-src") || img.getAttribute("src"), base);
    if (!u || /(pixel|1x1|spacer|tracking|doubleclick|\.gif$)/i.test(u)) { img.remove(); return; }
    const r = hd(u, 1600); [...img.attributes].forEach(a => img.removeAttribute(a.name));
    img.setAttribute("src", r.src); if (r.fb) img.setAttribute("data-fb", r.fb); img.className = "ph"; img.setAttribute("loading","lazy"); img.setAttribute("referrerpolicy","no-referrer"); img.setAttribute("alt","");
  });
  const walk = el => { for (const c of [...el.children]) {
    if (!KEEP.has(c.tagName)) { if (/^(SCRIPT|STYLE|NOSCRIPT|FORM|BUTTON|INPUT|SELECT|SVG|NAV|ASIDE|FOOTER|HEADER|VIDEO|AUDIO|OBJECT|EMBED|CANVAS)$/.test(c.tagName)) { c.remove(); continue; } walk(c); c.replaceWith(...c.childNodes); continue; }
    if (c.tagName === "IFRAME") { const s = c.getAttribute("src") || c.getAttribute("data-src") || ""; const yt = /(?:youtube(?:-nocookie)?\.com\/embed\/)([\w-]{11})/.exec(s), bv = /bvid=(BV\w{10})/.exec(s);
      if (yt || bv) { const box = document.createElement("div"); box.className = "player"; box.dataset.yt = yt ? yt[1] : ""; box.dataset.bv = bv ? bv[1] : ""; box.dataset.url = yt ? `https://www.youtube.com/watch?v=${yt[1]}` : `https://www.bilibili.com/video/${bv[1]}`; box.dataset.label = "Video in this story"; box.innerHTML = `<button class="poster" aria-label="Play video">${yt ? imgTag(`https://i.ytimg.com/vi/${yt[1]}/maxresdefault.jpg`, 1280) : ""}<span class="playbadge">${playIcon}</span></button>`; c.replaceWith(box); } else c.remove(); continue; }
    if (c.tagName !== "IMG") [...c.attributes].forEach(a => { if (!(c.tagName === "A" && a.name === "href")) c.removeAttribute(a.name); });
    if (c.tagName === "A") { const h = safeUrl(c.getAttribute("href"), base); if (h) { c.setAttribute("href", h); c.setAttribute("target","_blank"); c.setAttribute("rel","noopener"); } else c.removeAttribute("href"); }
    walk(c);
  } };
  walk(root);
  root.querySelectorAll("p,li,h2,h3,figure").forEach(n => { if (!n.textContent.trim() && !n.querySelector("img,.player")) n.remove(); });
  return root;
}
function heuristicMain(doc){
  const cands = [...doc.querySelectorAll("article, [itemprop=articleBody], .article-body, .article__body, .post-content, .entry-content, .content-article, .post_body, .article-content, #js_content, main")];
  let best = null, score = 0;
  for (const c of cands.length ? cands : [doc.body]) { const s = [...c.querySelectorAll("p")].reduce((n, p) => n + p.textContent.trim().length, 0); if (s > score) { score = s; best = c; } }
  return best;
}
function jsonLdBody(doc){
  for (const s of doc.querySelectorAll('script[type="application/ld+json"]')) { try { const arr = [].concat(JSON.parse(s.textContent)); for (const o of arr.flatMap(x => x["@graph"] || [x])) if (o && o.articleBody && String(o.articleBody).length > 400) return String(o.articleBody); } catch {} }
  return null;
}
async function loadFullStory(it){
  if (fullCache.has(it.id)) return fullCache.get(it.id);
  let html = null;
  if (it.fullHtml) html = `<html><body><article>${it.fullHtml}</article></body></html>`;
  if (!html) { const r = await api.article(it.url); if (!r.ok) { let msg = "The site didn't send the story"; try { msg = (await r.json()).error || msg; } catch {} throw new Error(msg); } html = await decodeBody(r); }
  await readerLibs();
  const doc = new DOMParser().parseFromString(html, "text/html");
  const base = doc.createElement("base"); base.href = it.url; doc.head && doc.head.prepend(base);
  let node = null, words = 0;
  if (window.Readability) { try { const art = new Readability(doc.cloneNode(true), { charThreshold: 300, keepClasses: false }).parse(); if (art && art.content) { node = new DOMParser().parseFromString(art.content, "text/html").body; words = (art.textContent||"").length; } } catch {} }
  if (!node || words < 400) { const h = heuristicMain(doc); if (h) { const t = h.textContent.length; if (t > words) { node = h.cloneNode(true); words = t; } } }
  if (words < 400) { const body = jsonLdBody(doc); if (body) { const d = document.createElement("div"); body.split(/\n+/).map(s=>s.trim()).filter(Boolean).forEach(p => { const e = document.createElement("p"); e.textContent = p; d.appendChild(e); }); node = d; words = body.length; } }
  if (!node || words < 250) throw new Error("This site only shares a preview outside its own pages");
  let out = cleanArticle(node, it.url).innerHTML;
  if (window.DOMPurify) out = DOMPurify.sanitize(out, { ADD_TAGS: ["iframe"], ADD_ATTR: ["target","loading","referrerpolicy","data-fb","data-yt","data-bv","data-url","data-label"], FORBID_ATTR: ["style","onerror","onload"] });
  const res = { html: out, chars: words };
  fullCache.set(it.id, res); if (fullCache.size > 40) fullCache.delete(fullCache.keys().next().value);
  return res;
}
/* ---------- tracker ---------- */
const relatedTo = gid => edition.items.filter(i=>(i.games||[]).includes(gid));
function liveBanner(g){ const now=new Date(); return (g.banners||[]).find(b=>new Date(b.start+"T00:00:00")<=now&&now<new Date(b.end+"T23:59:59")) || null; }
function nextBanner(g){ const now=new Date(); return (g.banners||[]).find(b=>new Date(b.start+"T00:00:00")>now) || null; }
function renderTracker(){
  const games=edition.games||[]; const sec=$("#trackSec"); sec.hidden=!games.length || !["all","games","tracked"].includes(state.cat); if(sec.hidden) return;
  const list=state.editTrack?games:games.filter(g=>tracked.has(g.id));
  $("#trkNote").textContent=state.editTrack?"Tap a game to track or untrack it":`${list.length} of ${games.length} games, with live banners and countdowns`;
  $("#editTrk").textContent=state.editTrack?"Done":"Choose games"; $("#editTrk").setAttribute("aria-pressed",state.editTrack);
  $("#tracker").innerHTML=list.length?list.map(g=>{ const p=GAMEPAL[g.id]||PAL.video, lb=liveBanner(g), nb=nextBanner(g), n=relatedTo(g.id).filter(i=>dayDiff(i.iso)<=2).length, art=g.latestVideo&&g.latestVideo.image;
    return `<button class="gtile ${state.editTrack&&!tracked.has(g.id)?"off":""}" data-game="${g.id}" style="--gc:${p.gc}" aria-label="${esc(g.name)}${state.editTrack?(tracked.has(g.id)?", tracked":", not tracked"):""}">
      <span class="gart">${cover(g.id+"t",g.id,"",480,160)}${art?imgTag(art,640):""}<span class="ver">${esc(g.version)}</span>${n?`<span class="n">${n} new</span>`:""}</span>
      <span class="gb"><b>${esc(g.name)}</b>
      ${lb?`<span class="ln"><span>${esc(lb.name)}</span><strong>ends ${until(lb.end)}</strong></span><span class="bar2"><i style="width:${(progress(lb.start,lb.end)*100).toFixed(0)}%"></i></span>`:nb?`<span class="ln"><span>${esc(nb.name)}</span><strong>starts ${until(nb.start)}</strong></span>`:`<span class="ln"><span>${esc(g.vname)}</span></span>`}
      ${g.next?`<span class="ln"><span>${esc(g.next.label)}</span><strong>${until(g.next.date)}</strong></span>`:""}</span></button>`; }).join("")
    : `<p class="note">No games tracked. Choose some to see their banners and updates here.</p>`;
}
$("#editTrk").onclick=()=>{state.editTrack=!state.editTrack;renderTracker();};
$("#tracker").addEventListener("click",e=>{ const b=e.target.closest("[data-game]"); if(!b) return; const id=b.dataset.game;
  if(state.editTrack){ tracked.has(id)?tracked.delete(id):tracked.add(id); store.set("tracked",[...tracked]); renderTracker(); renderFilters(); renderFeed(); return; }
  openGame(id); });

/* ---------- markets ---------- */
const fmtNum = (v, d=2) => v==null||isNaN(v) ? "n/a" : Number(v).toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
function sparkline(pts, up){ if(!pts||pts.length<2) return ""; const w=160,h=40, mn=Math.min(...pts), mx=Math.max(...pts); const d=pts.map((v,i)=>`${(i/(pts.length-1)*w).toFixed(1)},${(h-3-(v-mn)/((mx-mn)||1)*(h-6)).toFixed(1)}`).join(" ");
  return `<svg class="mspark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><polyline points="${d}" fill="none" stroke="${up?"var(--up)":"var(--down)"}" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>`; }
function renderMarkets(){
  const sec=$("#marketSec"); if(!sec) return; sec.hidden = state.cat!=="economy" || !markets || !(markets.markets||[]).length; if(sec.hidden) return;
  $("#mktNote").textContent = `Prices from Yahoo Finance, updated ${ago(markets.at)}. Some are delayed by up to 20 minutes.`;
  $("#markets").innerHTML = markets.markets.map(m => {
    if (m.error || m.price==null) return `<div class="mcard off"><span class="mn">${esc(m.name)}</span><span class="mv">n/a</span><span class="mc">Not available right now</span></div>`;
    const day = m.prev ? (m.price/m.prev-1)*100 : null, wk = m.start ? (m.price/m.start-1)*100 : null, up = (day==null?wk:day) >= 0;
    const dec = /USD|CNY|=X/.test(m.symbol) && m.price < 20 ? 4 : m.price > 1000 ? 0 : 2;
    return `<div class="mcard"><span class="mg">${esc(m.group||"")}</span><span class="mn">${esc(m.name)}</span><span class="mv">${fmtNum(m.price, dec)}${m.symbol==="^TNX"?"%":""}</span>
      <span class="mc ${up?"up":"down"}">${up?"▲":"▼"} ${day==null?"":fmtNum(Math.abs(day))+"% today"}</span>${sparkline(m.points, (wk==null?day:wk)>=0)}<span class="mw">${wk==null?"":`5 days: ${wk>=0?"+":"−"}${fmtNum(Math.abs(wk))}%`}</span></div>`;
  }).join("");
}

/* ---------- list ---------- */
const langOk = it => state.lang==="all" || it.lang===state.lang;
function inCat(it, cat){ return cat==="all" || (cat==="tracked" ? (it.games||[]).some(g=>tracked.has(g)) : it.cat===cat); }
function filtered(){
  const q=state.q.trim().toLowerCase();
  let list=edition.items.filter(it=> langOk(it) && inCat(it, state.cat) &&
    (state.cat!=="sport" || state.sport==="all" || it.sport===state.sport) &&
    (state.cat!=="sport" || state.sport!=="football" || state.league==="all" || it.league===state.league) &&
    (state.kind==="all"||(state.kind==="video"?(it.type==="video"||it.video):it.type!=="video"))&&
    (!q||[it.title,it.outline,it.source,catName(it.cat),it.byline||"",...(it.games||[]).map(g=>(gameOf(g)||{}).name||"")].join(" ").toLowerCase().includes(q)));
  if(state.sort==="newest"){
    const hour = it => (it.iso||"").slice(0,13);
    const rank=new Map(), seen={}; for(const it of list){ const k=hour(it)+"|"+(it.type==="video"?"v":it.cat)+"|"+it.src; seen[k]=(seen[k]||0)+1; rank.set(it.id,seen[k]); }
    list=[...list].sort((a,b)=>hour(b).localeCompare(hour(a))||rank.get(a.id)-rank.get(b.id)||b.iso.localeCompare(a.iso));
  }
  else if(state.sort==="unread") list=[...list].sort((a,b)=>read.has(a.id)-read.has(b.id)||b.iso.localeCompare(a.iso));
  else if(state.sort==="topic") list=[...list].sort((a,b)=>CATS.findIndex(c=>c.id===a.cat)-CATS.findIndex(c=>c.id===b.cat)||b.iso.localeCompare(a.iso));
  else if(state.sort==="views") list=[...list].filter(i=>i.type==="video").sort((a,b)=>(b.views||0)-(a.views||0));
  return list;
}
function renderMast(){
  const d=new Date(edition.compiledAt);
  $("#dayname").textContent=new Date().toLocaleDateString(undefined,{weekday:"long"});
  $("#datebig").textContent=new Date().toLocaleDateString(undefined,{day:"numeric",month:"long"});
  const stories=edition.items.filter(i=>i.type!=="video").length, vids=edition.items.length-stories;
  const ok=[...health.values()].filter(h=>h.state==="ok").length, total=CONFIG.sources.length;
  const unread=edition.items.filter(i=>!read.has(i.id)).length;
  const how = PREVIEW ? "Saved edition" : edition.mode==="morning" ? "Morning edition, collected" : "Live, updated";
  $("#mastmeta").innerHTML=`<strong>${stories} ${stories===1?"story":"stories"}</strong> and <strong>${vids} ${vids===1?"video":"videos"}</strong>${PREVIEW?"":` from ${ok} of ${total} sources`}. ${unread?unread+" unread.":"All caught up."}<br><span class="live"><i${edition.mode==="live"&&!PREVIEW?"":' style="background:#F5A524;box-shadow:0 0 0 3px rgba(245,165,36,.25)"'}></i>${how} ${isNaN(d)?"":d.toLocaleTimeString(undefined,{hour:"2-digit",minute:"2-digit"})}${isNaN(d)?"":", "+ago(edition.compiledAt)}</span>`;
}
function chip(attr, id, label, n, color, pressed){ return `<button class="chip" aria-pressed="${pressed}" data-${attr}="${id}" style="--c:${color}">${color!=="var(--brand)"?'<span class="dot"></span>':""}${label} <span class="n">${n}</span></button>`; }
function renderFilters(){
  const base=edition.items.filter(langOk);
  const n=id=>base.filter(i=>inCat(i,id)).length, tn=n("tracked");
  const sportItems=base.filter(i=>i.cat==="sport"), fb=sportItems.filter(i=>i.sport==="football");
  let html=chip("cat","all","All",n("all"),"var(--brand)",state.cat==="all")+
    (tn?`<button class="chip" aria-pressed="${state.cat==="tracked"}" data-cat="tracked" style="--c:var(--brand)"><span class="dot" style="background:linear-gradient(135deg,#C9A24B,#8B6CFF,#22B8C9)"></span>Tracked games <span class="n">${tn}</span></button>`:"")+
    CATS.map(c=>chip("cat",c.id,c.name,n(c.id),`var(--c-${c.id})`,state.cat===c.id)).join("")+
    `<span class="sep"></span>
    <label class="sr-only" for="lang">Language</label><select class="sel" id="lang"><option value="all">All languages</option><option value="en">English</option><option value="zh">中文</option></select>
    <label class="sr-only" for="kind">Type</label><select class="sel" id="kind"><option value="all">Stories and videos</option><option value="story">Stories only</option><option value="video">With video</option></select>
    <label class="sr-only" for="sort">Sort</label><select class="sel" id="sort"><option value="newest">Newest first</option><option value="topic">By topic</option><option value="unread">Unread first</option><option value="views">Most-watched videos</option></select>
    <span class="seg" role="radiogroup" aria-label="Layout">
      <button role="radio" aria-checked="${state.view==="list"&&state.density==="comfortable"}" data-view="list" data-density="comfortable" aria-label="List" title="List"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="4" width="7" height="6" rx="1.5"/><rect x="3" y="14" width="7" height="6" rx="1.5"/><path d="M13 6h8M13 9h5M13 16h8M13 19h5"/></svg></button>
      <button role="radio" aria-checked="${state.view==="list"&&state.density==="compact"}" data-view="list" data-density="compact" aria-label="Compact list" title="Compact list"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M4 6h16M4 12h16M4 18h16"/></svg></button>
      <button role="radio" aria-checked="${state.view==="grid"}" data-view="grid" aria-label="Grid" title="Grid"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/></svg></button>
    </span>`;
  $("#filters").innerHTML=html;
  // second and third rows: sport sections, then football leagues
  let sub="";
  if(state.cat==="sport"){
    sub+=`<div class="subrow" role="group" aria-label="Sport">`+chip("sport","all","All sport",sportItems.length,"var(--c-sport)",state.sport==="all")+
      SPORTS.map(s=>{ const c=sportItems.filter(i=>i.sport===s.id).length; return (s.id==="other"&&!c)?"":chip("sport",s.id,s.name,c,"var(--c-sport)",state.sport===s.id); }).join("")+`</div>`;
    if(state.sport==="football") sub+=`<div class="subrow" role="group" aria-label="League">`+chip("league","all","All football",fb.length,"var(--c-sport)",state.league==="all")+
      LEAGUES.map(l=>{ const c=fb.filter(i=>i.league===l.id).length; return c||["epl","laliga","seriea","bundesliga","ligue1","ucl"].includes(l.id)?chip("league",l.id,l.name,c,"var(--c-sport)",state.league===l.id):""; }).join("")+`</div>`;
  }
  $("#subfilters").innerHTML=sub;
  $("#lang").value=state.lang; $("#kind").value=state.kind; $("#sort").value=state.sort;
}
const saveF=()=>store.set("filters",{cat:state.cat,sport:state.sport,league:state.league,lang:state.lang,kind:state.kind,sort:state.sort,view:state.view,density:state.density});
function onFilterClick(e){
  const c=e.target.closest("[data-cat]"),s=e.target.closest("[data-sport]"),l=e.target.closest("[data-league]"),v=e.target.closest("[data-view]");
  if(c){ state.cat=c.dataset.cat; if(state.cat!=="sport"){state.sport="all";state.league="all";} }
  else if(s){ state.sport=s.dataset.sport; state.league="all"; }
  else if(l) state.league=l.dataset.league;
  else if(v){ state.view=v.dataset.view; if(v.dataset.density) state.density=v.dataset.density; }
  else return;
  state.shown=60; saveF(); renderFilters(); renderFeed(); renderTracker(); renderMarkets();
}
$("#filters").addEventListener("click",onFilterClick); $("#subfilters").addEventListener("click",onFilterClick);
$("#filters").addEventListener("change",e=>{ if(e.target.id==="lang")state.lang=e.target.value; if(e.target.id==="kind")state.kind=e.target.value; if(e.target.id==="sort")state.sort=e.target.value; state.shown=60; saveF(); renderFilters(); renderFeed(); });
let qt;$("#q").addEventListener("input",e=>{clearTimeout(qt);qt=setTimeout(()=>{state.q=e.target.value;state.shown=60;renderFeed();},120);});

const fmtViews = v => v>=1e8?(v/1e8).toFixed(1)+"亿 views":v>=1e6?(v/1e6).toFixed(v>=1e7?0:1)+"M views":v>=1e3?Math.round(v/1e3)+"K views":v?v+" views":"";
function cardHTML(it){
  const isV=it.type==="video", grid=state.view==="grid", compact=state.density==="compact"&&!grid;
  const W=grid?640:compact?300:440, H=grid?360:compact?240:275;
  const g=(it.games||[]).map(id=>gameOf(id)).filter(Boolean)[0];
  const needOg = !isV && !PREVIEW && lowRes(it.image, it.imageW);
  return `<li><button class="card ${read.has(it.id)?"read":""}" data-id="${it.id}" ${needOg?`data-og="${esc(it.url)}"`:""} style="--c:${colorOf(it)}">
    <span class="thumb">${it.image?imgTag(it.image, grid?960:800):""}${cover(it.id,artKind(it),isV?"":it.cover,W,H,{small:compact})}${isV||it.video?`<span class="playbadge">${playIcon}</span>`:""}${isV&&it.tag?`<span class="dur">${esc(it.tag)}</span>`:""}</span>
    <span class="cbody"><span class="kick"><span class="tag">${esc(tagLabel(it))}</span>${g?`<span class="gtag">${esc(g.name)}</span>`:""}<span class="src">${esc(it.source)}</span>${isV&&it.views?`<span class="views">${fmtViews(it.views)}</span>`:""}<span class="ago">${ago(it.iso)}</span></span>
    <h3 lang="${it.lang==="zh"?"zh":"en"}">${esc(it.title)}</h3><p>${esc(it.outline)}</p></span>${read.has(it.id)?"":'<span class="unread" aria-label="Unread"></span>'}</button></li>`;
}
function renderFeed(){
  const list=filtered(), feed=$("#feed");
  feed.className="feed "+state.view+(state.view==="list"&&state.density==="compact"?" compact":"");
  const label=({newest:"newest first",topic:"grouped by topic",unread:"unread first",views:"most-watched first"})[state.sort];
  $("#count").textContent=list.length===edition.items.length?`Showing everything, ${label}`:`${list.length} of ${edition.items.length} shown, ${label}`;
  if(!list.length){ feed.innerHTML=edition.items.length?`<li class="empty"><strong>Nothing matches these filters.</strong><br><button class="btn" id="clearF" style="margin-top:12px">Clear filters</button></li>`:`<li class="empty"><strong>Loading your sources.</strong><br>Stories appear here as each feed arrives.</li>`; const cf=$("#clearF"); if(cf) cf.onclick=()=>{Object.assign(state,{cat:"all",sport:"all",league:"all",lang:"all",kind:"all",q:""});$("#q").value="";saveF();renderFilters();renderFeed();renderTracker();renderMarkets();}; $("#more").innerHTML=""; return; }
  feed.innerHTML=list.slice(0,state.shown).map(cardHTML).join("");
  $("#more").innerHTML=list.length>state.shown?`<button class="btn" id="showMore">Show ${Math.min(60,list.length-state.shown)} more</button>`:"";
  const sm=$("#showMore"); if(sm) sm.onclick=()=>{ state.shown+=60; renderFeed(); };
  if (ogObserver) feed.querySelectorAll("[data-og]").forEach(el => { const u=el.dataset.og; if (ogMap.has(u)) applyOg(el, ogMap.get(u)); else ogObserver.observe(el); });
}
$("#feed").addEventListener("click",e=>{const c=e.target.closest(".card");if(c)openArticle(c.dataset.id);});

/* ---------- full-screen detail ---------- */
const sheet=$("#sheet");
function playerHTML(v,seed,kind,poster){
  if(!v) return "";
  const thumb = poster || (v.ytId?`https://i.ytimg.com/vi/${v.ytId}/maxresdefault.jpg`:"");
  return `<div class="player" data-yt="${esc(v.ytId||"")}" data-bv="${esc(v.bvid||"")}" data-url="${esc(v.url)}" data-label="${esc(v.label)}">
    <button class="poster" aria-label="Play ${esc(v.label)}">${cover(seed+"p",kind,"",1280,720)}${thumb?imgTag(thumb,1600):""}<span class="playbadge">${playIcon}</span><span class="cap">${esc(v.label)}<small>${esc(v.channel||"")}</small></span></button>
  </div>
  <div class="vnote"><a href="${esc(v.url)}" target="_blank" rel="noopener">Open on ${v.bvid?"Bilibili":"YouTube"}</a></div>`;
}
function wirePlayers(root){
  root.querySelectorAll(".player").forEach(pl=>{ const btn=pl.querySelector(".poster"); if(!btn) return;
    btn.onclick=()=>{ const yt=pl.dataset.yt, bv=pl.dataset.bv; if(!yt&&!bv){ window.open(pl.dataset.url,"_blank","noopener"); return; }
      const f=document.createElement("iframe");
      f.src = yt ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(yt)}?autoplay=1&rel=0&playsinline=1&modestbranding=1`
                 : `https://player.bilibili.com/player.html?bvid=${encodeURIComponent(bv)}&autoplay=1&danmaku=0&high_quality=1`;
      f.title=pl.dataset.label||"Video"; f.allow="autoplay; encrypted-media; picture-in-picture; fullscreen"; f.referrerPolicy="strict-origin-when-cross-origin";
      pl.replaceChildren(f); };
  });
}
function showSheet(title,html,color,hash){
  const a=$("#article"); a.style.setProperty("--c",color); a.innerHTML=html; $("#sheetTtl").textContent=title;
  const wasOpen=sheet.open; wirePlayers(a); if(!sheet.open) sheet.showModal(); sheet.scrollTop=0; sheet.classList.remove("scrolled");
  if(hash && location.hash!==hash){ try{ (wasOpen?history.replaceState:history.pushState).call(history,{fleeter:1},"",hash); }catch{} }
  a.querySelectorAll(".card").forEach(c=>c.onclick=()=>openArticle(c.dataset.id));
  a.querySelectorAll("[data-gopen]").forEach(b=>b.onclick=()=>openGame(b.dataset.gopen));
}
sheet.addEventListener("scroll",()=>sheet.classList.toggle("scrolled",sheet.scrollTop>140),{passive:true});
function heroHTML(it, kind, text, sub){
  return `<div class="hero"><div class="frame">${cover(it.id+"h",kind,text,1400,600,{sub})}${it.image?imgTag(it.image,1600):""}</div>${it.image?`<div class="credit">Image from ${esc(it.source)}</div>`:""}</div>`;
}
function openArticle(id){
  const it=edition.items.find(i=>i.id===id); if(!it) return; state.openId=id; state.openGame=null;
  const isV=it.type==="video", kind=artKind(it);
  const host=(()=>{try{return new URL(it.url).hostname.replace(/^www\./,"");}catch{return it.source;}})();
  const g=(it.games||[]).map(gameOf).filter(Boolean)[0];
  const rel=g?relatedTo(g.id).filter(x=>x.id!==id).slice(0,4):edition.items.filter(x=>x.cat===it.cat&&x.id!==id&&x.type===it.type&&(it.cat!=="sport"||x.sport===it.sport)).slice(0,4);
  const canFull = !isV && !PREVIEW;
  const html=`${isV?`<div class="wide" style="margin-top:18px">${playerHTML(it.video,it.id,kind,it.image)}</div>`:heroHTML(it,kind,it.cover,it.source)}
  <div class="inner">
    <div class="kick"><span class="tag">${esc(tagLabel(it))}</span>${g?`<button class="gtag btn" style="height:24px;padding:0 8px" data-gopen="${g.id}">${esc(g.name)}</button>`:""}${it.tag?`<span class="src">${esc(it.tag)}</span>`:""}${isV&&it.views?`<span class="src">${fmtViews(it.views)}</span>`:""}</div>
    <h2 id="artTitle" lang="${it.lang==="zh"?"zh":"en"}">${esc(it.title)}</h2>
    <div class="byline"><span>${esc(it.source)}</span>${it.byline?`<span>${esc(it.byline)}</span>`:""}<span>${new Date(it.iso).toLocaleString(undefined,{weekday:"long",day:"numeric",month:"long",hour:"2-digit",minute:"2-digit"})}</span></div>
    ${!isV&&it.video?playerHTML(it.video,it.id,kind):""}
    <div class="text" id="storyText" lang="${it.lang==="zh"?"zh":"en"}">${(it.body||[]).map(p=>`<p>${esc(p)}</p>`).join("") || (it.outline?`<p>${esc(it.outline)}</p>`:"")}</div>
    ${canFull?`<div class="loadingfull" id="fullState"><span class="dotspin" aria-hidden="true"></span>Loading the whole story from ${esc(host)}</div>`:""}
    <div class="orig"><a class="btn primary" href="${esc(it.url)}" target="_blank" rel="noopener">${isV?`Open on ${it.video&&it.video.bvid?"Bilibili":"YouTube"}`:"Open the original on "+esc(host)}<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg></a></div>
    <p class="note" id="storyNote">${isV?"Video from the channel named above.":PREVIEW?"Saved summary. Deploy Fleeter or use the app to read whole stories.":"Text and pictures come from the publisher's page, shown here for your own reading."}</p>
  </div>
  ${rel.length?`<div class="related"><h3>${g?"More on "+esc(g.name):"More "+esc(tagLabel(it).toLowerCase())}</h3><ul class="feed">${rel.map(cardHTML).join("")}</ul></div>`:""}`;
  showSheet(it.title,html,colorOf(it),"#"+id);
  if(!read.has(id)){read.add(id);if(read.size>4000)read=new Set([...read].slice(-3000));store.set("read",[...read]);}
  if(canFull){
    loadFullStory(it).then(res=>{ if(state.openId!==id) return; const box=$("#storyText"); if(!box) return; box.innerHTML=res.html; box.classList.add("full"); wirePlayers(box); const st=$("#fullState"); if(st) st.remove(); })
    .catch(err=>{ if(state.openId!==id) return; const st=$("#fullState"); if(st){ st.classList.add("failed"); st.textContent=`Showing the summary. ${err && err.message ? err.message : "The whole story isn't available here"}.`; } });
  }
}
function openGame(gid){
  const g=gameOf(gid); if(!g) return; state.openGame=gid; state.openId=null;
  const p=GAMEPAL[gid]||PAL.video, rel=relatedTo(gid), vids=rel.filter(i=>i.type==="video");
  const lv=g.latestVideo || (g.video?{video:Object.assign({channel:g.name},g.video),id:gid,image:null}:null);
  const html=`${heroHTML({id:gid+"hero",image:lv&&lv.image,source:g.name},gid,g.name,g.dev)}
  <div class="inner" style="max-width:1000px">
    <div class="kick"><span class="tag">Tracked game</span><span class="src">${esc(g.dev)}</span></div>
    <h2>${esc(g.name)}${g.version&&!/^[A-Za-z]/.test(g.version)?` ${esc(g.version)}`:""}</h2>
    <div class="byline"><span>${esc(g.vname)}</span>${g.released?`<span>Released ${fmtDate(g.released,{day:"numeric",month:"long"})}</span>`:""}${g.detected?`<span>Version ${esc(g.detected)} seen in the newest official uploads</span>`:""}</div>
    <div class="gstat">
      ${g.next?`<div class="stat"><div class="k">${esc(g.next.label)}</div><div class="v">${String(g.next.date).length===4?esc(g.next.date):until(g.next.date)}</div><div class="s">${String(g.next.date).length===4?"":fmtDate(g.next.date,{weekday:"short",day:"numeric",month:"long"})}</div></div>`:""}
      <div class="stat"><div class="k">In your feed</div><div class="v">${rel.length}</div><div class="s">${vids.length} official or related videos</div></div>
      <div class="stat"><div class="k">Tracking</div><div class="v">${tracked.has(gid)?"On":"Off"}</div><div class="s"><button class="btn" id="tglTrack" style="height:28px;margin-top:4px">${tracked.has(gid)?"Stop tracking":"Track this game"}</button></div></div>
    </div>
    ${(g.banners||[]).length?`<h3 style="font-family:var(--font-display);margin:18px 0 8px">Banners</h3><div class="banners">${g.banners.map(b=>{const pr=progress(b.start,b.end), now=Date.now(), st=new Date(b.start+"T00:00:00")>now?"starts "+until(b.start):new Date(b.end+"T23:59:59")<now?"ended":"ends "+until(b.end); return `<div class="bn"><div class="t"><span>${esc(b.name)}</span><span>${st}</span></div><div class="d">${fmtDate(b.start)} to ${fmtDate(b.end)}</div><div class="bar2"><i style="width:${(pr*100).toFixed(0)}%"></i></div></div>`;}).join("")}</div><p class="note">Banner dates are set in sources.json. Times vary by server.</p>`:""}
    ${lv&&lv.video?`<h3 style="font-family:var(--font-display);margin:22px 0 4px">Latest official video</h3>${playerHTML(lv.video,gid,gid,lv.image)}`:""}
  </div>
  ${rel.length?`<div class="related"><h3>Latest on ${esc(g.name)}</h3><ul class="feed">${rel.slice(0,24).map(cardHTML).join("")}</ul></div>`:""}`;
  showSheet(g.name,html,p.gc,"#game-"+gid);
  const tb=$("#tglTrack"); if(tb) tb.onclick=()=>{ tracked.has(gid)?tracked.delete(gid):tracked.add(gid); store.set("tracked",[...tracked]); renderTracker(); renderFilters(); openGame(gid); };
}
function step(d){ if(state.openGame){ const gs=(edition.games||[]); const i=gs.findIndex(g=>g.id===state.openGame); const n=gs[(i+d+gs.length)%gs.length]; if(n) openGame(n.id); return; }
  const l=filtered(); const i=l.findIndex(x=>x.id===state.openId); const n=l[(i+d+l.length)%l.length]; if(n) openArticle(n.id); }
$("#prevArt").onclick=()=>step(-1); $("#nextArt").onclick=()=>step(1);
$("#shareArt").onclick=async()=>{ const it=edition.items.find(i=>i.id===state.openId); const url=it?it.url:location.href; try{await navigator.clipboard.writeText(url);toast("Link copied");}catch{toast("Couldn't copy the link");} };
function closeSheet(){ if(sheet.open) sheet.close(); }
$("#closeSheet").onclick=closeSheet;
sheet.addEventListener("close",()=>{ $("#article").innerHTML=""; state.openId=null; state.openGame=null; if(location.hash){ try{history.replaceState(null,"",location.pathname+location.search);}catch{} } renderFeed(); renderMast(); renderTracker(); });
window.addEventListener("popstate",()=>{ const h=location.hash.slice(1); if(!h) closeSheet(); else route(h); });
function route(h){ if(h.startsWith("game-")) openGame(h.slice(5)); else if(edition.items.find(i=>i.id===h)) openArticle(h); }
document.addEventListener("keydown",e=>{ if(sheet.open&&(e.key==="ArrowRight"||e.key==="ArrowLeft")&&!/input|textarea/i.test(document.activeElement.tagName)) step(e.key==="ArrowRight"?1:-1); });
document.querySelectorAll(".panel").forEach(p=>p.addEventListener("click",e=>{if(e.target===p||e.target.closest("[data-close]"))p.close();}));
$("#openLook").onclick=()=>{renderLookPanel();$("#look").showModal();};
let tt;function toast(m){const t=$("#toast");t.textContent=m;t.classList.add("on");clearTimeout(tt);tt=setTimeout(()=>t.classList.remove("on"),3200);}

/* ---------- refresh ---------- */
$("#refresh").onclick=async()=>{
  if (PREVIEW) { toast("This is a saved edition. Run Fleeter on Cloudflare or as the app to fetch live news."); return; }
  const r = await loadAll("live"); if (!r) return;
  toast(`Updated just now: ${r.fresh} new item${r.fresh===1?"":"s"}${r.bad?`, ${r.bad} source${r.bad===1?"":"s"} didn't answer`:""}`);
};

/* ---------- sources, cache & memory ---------- */
const heap=[];
function fmtB(n){if(n==null||isNaN(n))return"n/a";const u=["B","KB","MB","GB"];let i=0;while(n>=1024&&i<3){n/=1024;i++;}return(i?n.toFixed(n<10?2:1):n)+" "+u[i];}
async function renderStats(){
  const mem=performance.memory;let est=null;try{est=await navigator.storage?.estimate?.();}catch{}
  const ls=store.bytes(),nodes=document.getElementsByTagName("*").length, imgs=[...document.images].filter(i=>i.classList.contains("ph")&&i.complete&&i.naturalWidth), hdCount=imgs.filter(i=>i.naturalWidth>=960).length;
  if(mem){heap.push(mem.usedJSHeapSize);if(heap.length>40)heap.shift();}
  const spark=heap.length<2?"":(()=>{const mn=Math.min(...heap),mx=Math.max(...heap),w=300,h=44;return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><polyline points="${heap.map((v,i)=>`${i/(heap.length-1)*w},${h-4-((v-mn)/((mx-mn)||1))*(h-8)}`).join(" ")}" fill="none" stroke="var(--brand)" stroke-width="2.5" vector-effect="non-scaling-stroke"/></svg>`;})();
  const hs=[...health.values()], ok=hs.filter(h=>h.state==="ok").length, bad=hs.filter(h=>h.state==="bad").length;
  $("#stats").innerHTML=`
  <div class="stat wide"><div class="k">JavaScript heap in use</div><div class="v">${mem?fmtB(mem.usedJSHeapSize):"Not reported"}</div><div class="s">${mem?`of ${fmtB(mem.totalJSHeapSize)} allocated, limit ${fmtB(mem.jsHeapSizeLimit)}`:"This browser doesn't expose heap figures."}</div>${mem?`<div class="meter"><i style="width:${(mem.usedJSHeapSize/mem.jsHeapSizeLimit*100).toFixed(2)}%"></i></div>${spark}`:""}</div>
  <div class="stat"><div class="k">Fleeter cache</div><div class="v">${fmtB(ls)}</div><div class="s">${store.keys().length} entries, of about 5 MB allowed</div><div class="meter"><i style="width:${Math.max(.5,ls/(5*1048576)*100).toFixed(2)}%"></i></div></div>
  <div class="stat"><div class="k">Sources answering</div><div class="v">${PREVIEW?"Preview":ok+" / "+CONFIG.sources.length}</div><div class="s">${bad?bad+" not answering":"All good"}</div></div>
  <div class="stat"><div class="k">Photos loaded</div><div class="v">${imgs.length}</div><div class="s">${hdCount} at 960 px wide or more</div></div>
  <div class="stat"><div class="k">Items in memory</div><div class="v">${edition.items.length}</div><div class="s">${fullCache.size} whole stories, ${coverCache.size} drawn previews</div></div>
  <div class="stat wide"><div class="k">Running as</div><div class="v">${APP?"App":PREVIEW?"Preview":"Website"}</div><div class="s">${est?`Storage ${fmtB(est.usage)}${est.quota?` of ${fmtB(est.quota)}`:""}. `:""}${APP?"Fetching every source directly from this device.":`Morning edition on the server: ${CONFIG.morningEdition?new Date(CONFIG.morningEdition).toLocaleString(undefined,{weekday:"short",hour:"2-digit",minute:"2-digit"}):"not collected yet"}.`}</div></div>`;
  $("#srcH").textContent=`Sources (${CONFIG.sources.length})`;
  $("#srcList").innerHTML=CONFIG.sources.map(s=>{ const h=health.get(s.id)||{}; return `<li><i class="${h.state||""}"></i><span>${esc(s.name)}<small> ${esc(catName(s.cat))}${s.kind!=="rss"?", "+esc(s.kind.split("-")[0]):""}</small></span><span class="m">${h.state==="ok"?h.n+" items":h.state==="bad"?esc(h.error||"failed"):h.state==="wait"?"loading":""}</span><span class="m">${h.ms?h.ms+" ms":""}</span></li>`; }).join("") || `<li><i></i><span>No sources loaded</span><span></span><span></span></li>`;
}
let sysT=null;
$("#openSys").onclick=()=>{renderStats();$("#sys").showModal();clearInterval(sysT);sysT=setInterval(renderStats,1500);};
$("#sys").addEventListener("close",()=>clearInterval(sysT));
$("#retryFailed").onclick=async()=>{ const ids=[...health.entries()].filter(([,h])=>h.state==="bad").map(([id])=>id); if(!ids.length){toast("Every source is answering");return;} await loadAll("live",ids); renderStats(); };
$("#clearCache").onclick=()=>{store.del("cache");store.del("og");store.del("markets");store.keys().filter(k=>k.startsWith("fleeter:pc:")).forEach(k=>localStorage.removeItem(k));ogMap.clear();coverCache.clear();fullCache.clear();toast("Cache cleared");renderStats();};
$("#clearRead").onclick=()=>{read=new Set();store.del("read");renderAll();renderStats();toast("All marked unread");};

function renderAll(){ renderMast(); renderTracker(); renderMarkets(); renderFilters(); renderFeed(); $("#foot").textContent=PREVIEW?"Fleeter preview. Run it on Cloudflare or as the app for live news.":`Fleeter reads ${CONFIG.sources.length} sources${APP?" directly from this device":""}. Every card links to its original publisher.`; }

/* ---------- boot ---------- */
(async function boot(){
  const f=store.get("filters",null); if(f) Object.assign(state,{cat:f.cat||"all",sport:f.sport||"all",league:f.league||"all",lang:f.lang||"all",kind:f.kind||"all",sort:f.sort||"newest",view:f.view||"list",density:f.density||"comfortable"});
  if(!CATS.some(c=>c.id===state.cat) && !["all","tracked"].includes(state.cat)) state.cat="all";
  applyLook();
  try { CONFIG = await api.config(); }
  catch {
    PREVIEW = true;
    const snap = window.FLEETER_SNAPSHOT || { items: [], games: [] };
    CONFIG = { sources: [], games: snap.games || [], markets: [], morningEdition: null, kv: false };
    edition = { items: (snap.items||[]).map(i => { const it = Object.assign({ iso: (i.time || (i.date+"T09:00:00")), lang: "en", src: "snapshot" }, i);
      if (it.cat === "football") { it.cat = "sport"; it.sport = "football"; classifySport(it, { sport: "football" }); } return it; }), games: snap.games || [], compiledAt: snap.compiledAt, mode: "saved" };
    $("#notice").innerHTML = `<div class="notice"><strong>Preview mode.</strong> The live feed service isn't running here, so this is a saved edition. Run Fleeter with <code>npm run dev</code>, deploy it to Cloudflare, or build the app (see README.md) for live news, HD photos, whole stories and videos.</div>`;
  }
  tracked = new Set(store.get("tracked", (CONFIG.games||[]).map(g=>g.id)));
  if (!PREVIEW) {
    const cached = store.get("cache", null);
    if (cached && Array.isArray(cached.items)) { edition.items = cached.items; edition.compiledAt = cached.at; edition.mode = cached.mode; }
    edition.games = detectVersions(CONFIG.games);
  }
  renderAll();
  if (location.hash.length>1) route(location.hash.slice(1));
  if (!PREVIEW) {
    const morningFresh = !APP && CONFIG.kv && CONFIG.morningEdition && (Date.now()-new Date(CONFIG.morningEdition)) < 20*3600e3;
    const cachedNewer = edition.items.length && edition.mode==="live" && (Date.now()-new Date(edition.compiledAt)) < 15*60e3;
    if (!cachedNewer) await loadAll(morningFresh ? "morning" : "live"); else loadMarkets();
  }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(()=>{ coverCache.clear(); renderFeed(); renderTracker(); });
  setInterval(()=>{ renderMast(); renderTracker(); }, 60000);
  if (!APP && "serviceWorker" in navigator && /^https?:$/.test(location.protocol)) navigator.serviceWorker.register("sw.js").catch(()=>{});
})();
})();
