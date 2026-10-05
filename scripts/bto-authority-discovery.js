"use strict";

// Direct authority evidence discovery for BTO. Discovery engines are metadata
// only: every candidate page is fetched, host-gated, topic-scored and later
// quote-verified by the existing Builder before it can become productionReady.
const Builder = require("./ib-ct-library/build");

function decodeHtml(s) {
  return String(s || "")
    .replace(/&amp;/g,"&").replace(/&quot;/g,'"').replace(/&#39;/g,"'")
    .replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&#x2F;/gi,"/");
}
function stripHtml(s) {
  return decodeHtml(String(s || "")
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<noscript[\s\S]*?<\/noscript>/gi," ")
    .replace(/<[^>]+>/g," ").replace(/\s+/g," ")).trim();
}
function contentWords(s) {
  const stop=new Set(["what","why","does","have","has","with","from","that","this","their","they","them","into","about","which","when","where","explains","explain","purpose","design"]);
  return [...new Set(String(s||"").toLowerCase().match(/[a-z0-9][a-z0-9-]{2,}/g)||[])].filter(w=>!stop.has(w));
}
function normalizeUrl(raw) {
  let u=decodeHtml(raw||"");
  try {
    if (/duckduckgo\.com\/l\//.test(u) || /^\/l\//.test(u)) {
      const p=new URL(u,"https://duckduckgo.com");
      u=decodeURIComponent(p.searchParams.get("uddg")||"");
    }
    if (/^\/url\?/.test(u)) {
      const p=new URL(u,"https://www.google.com");
      u=p.searchParams.get("q")||p.searchParams.get("url")||"";
    }
    if (!/^https?:\/\//i.test(u)) return null;
    const p=new URL(u);
    if (/duckduckgo\.com$|google\.[a-z.]+$|bing\.com$/i.test(p.hostname)) return null;
    p.hash="";
    return p.toString();
  } catch (_) { return null; }
}
function resultUrls(html) {
  const out=[];
  const patterns=[/href=["']([^"']+)["']/gi,/uddg=([^&"']+)/gi,/url\?q=([^&"']+)/gi];
  for(const re of patterns) for(const m of String(html||"").matchAll(re)) {
    const u=normalizeUrl(m[1]);
    if(!u) continue;
    try {
      if(!Builder.hostAllowed(new URL(u).hostname,Builder.BTO_PRIMARY_HOSTS)) continue;
      if(!out.includes(u)) out.push(u);
    } catch (_) {}
  }
  return out;
}
async function fetchText(url,get) {
  const attempts=[{browser:true},{browser:true,headers:{"User-Agent":"Mozilla/5.0 (compatible; BTOResearch/1.0)"}}];
  for(const opts of attempts) {
    const r=await get(url,opts).catch(()=>null);
    if(!(r&&r.status>=200&&r.status<400&&r.body)) continue;
    const text=stripHtml(r.body);
    if(text.length>=500) return text;
  }
  return null;
}
function topicScore(topic,text,url) {
  const hay=`${url} ${text}`.toLowerCase();
  const objectWords=contentWords(topic.object);
  const detailWords=contentWords(topic.designDetail);
  const questionWords=contentWords(topic.coreQuestion);
  const objectHits=objectWords.filter(w=>hay.includes(w)).length;
  const detailHits=detailWords.filter(w=>hay.includes(w)).length;
  const questionHits=questionWords.filter(w=>hay.includes(w)).length;
  const causal=/\b(because|purpose|designed|design|prevent|allows?|ensure|detect|error|protect|reduce|increase|required|function)\b/i.test(text)?2:0;
  return objectHits*2+detailHits*4+questionHits+causal;
}
async function searchUrls(query,get) {
  const endpoints=[
    `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
    `https://www.google.com/search?q=${encodeURIComponent(query)}`,
    `https://www.bing.com/search?q=${encodeURIComponent(query)}`
  ];
  const out=[];
  for(const endpoint of endpoints) {
    const r=await get(endpoint,{browser:true}).catch(()=>null);
    if(!(r&&r.status>=200&&r.status<400&&r.body)) continue;
    for(const u of resultUrls(r.body)) if(!out.includes(u)) out.push(u);
    if(out.length>=20) break;
  }
  return out;
}
async function discover(topic,get,{limit=4}={}) {
  const base=[topic.coreQuestion,topic.object,topic.designDetail].filter(Boolean).join(" ");
  const queries=[
    `"${topic.designDetail||topic.object}" ${topic.object||""} purpose reason`,
    `${base} function mechanism`,
    `${base} site:.gov`, `${base} site:.edu`, `${base} site:.org`,
    `${base} manufacturer technical`
  ];
  const urls=[];
  for(const q of queries) {
    for(const u of await searchUrls(q,get)) if(!urls.includes(u)) urls.push(u);
    if(urls.length>=30) break;
  }
  const candidates=[];
  for(const url of urls.slice(0,30)) {
    const text=await fetchText(url,get);
    if(!text) continue;
    const score=topicScore(topic,text,url);
    // Require actual topic overlap. This prevents generic authority pages from
    // displacing a relevant Wikipedia fallback while preserving all later gates.
    if(score<6) continue;
    const p=new URL(url);
    candidates.push({title:p.hostname.replace(/^www\./,""),url,text,links:[url],primaryDirect:true,discoveryFallback:true,_authorityScore:score});
  }
  candidates.sort((a,b)=>b._authorityScore-a._authorityScore);
  return candidates.slice(0,limit);
}
module.exports={discover,resultUrls,stripHtml,normalizeUrl,topicScore};
