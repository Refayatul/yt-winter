"use strict";

// Direct evidence discovery for BTO. Wikipedia is useful for orientation, but
// ordinary design questions are often answered better by the manufacturer,
// standards body, university or government page itself.
const Builder = require("./ib-ct-library/build");

function decodeHtml(s) {
  return String(s || "").replace(/&amp;/g,"&").replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,"<").replace(/&gt;/g,">");
}
function stripHtml(s) {
  return decodeHtml(String(s || "").replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi," ").replace(/<[^>]+>/g," ").replace(/\s+/g," ")).trim();
}
function resultUrls(html) {
  const out=[];
  for (const m of String(html||"").matchAll(/href=["']([^"']+)["']/gi)) {
    let u=decodeHtml(m[1]);
    try {
      if (/duckduckgo\.com\/l\//.test(u) || /^\/l\//.test(u)) {
        const parsed=new URL(u,"https://duckduckgo.com");
        u=decodeURIComponent(parsed.searchParams.get("uddg")||"");
      }
      if (!/^https?:\/\//.test(u)) continue;
      const p=new URL(u);
      if (/duckduckgo\.com$/.test(p.hostname)) continue;
      if (!Builder.hostAllowed(p.hostname, Builder.BTO_PRIMARY_HOSTS)) continue;
      if (!out.includes(u)) out.push(u);
    } catch (_) {}
  }
  return out;
}
async function fetchText(url,get) {
  let r=await get(url,{browser:true}).catch(()=>null);
  if (!(r&&r.status>=200&&r.status<400&&r.body)) return null;
  const text=stripHtml(r.body);
  return text.length>=500?text:null;
}
async function discover(topic,get,{limit=4}={}) {
  const q=[topic.coreQuestion,topic.object,topic.designDetail,"design purpose mechanism"].filter(Boolean).join(" ");
  // DDG is discovery metadata only. Every accepted URL is independently
  // fetched, host-gated and later quote-verified by the existing Builder.
  const searches=[q,`${q} site:.gov`,`${q} site:.edu`,`${q} site:ykk.com`];
  const urls=[];
  for (const query of searches) {
    const r=await get(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,{browser:true}).catch(()=>null);
    if (!(r&&r.status>=200&&r.status<400&&r.body)) continue;
    for (const u of resultUrls(r.body)) if (!urls.includes(u)) urls.push(u);
    if (urls.length>=12) break;
  }
  const docs=[];
  for (const url of urls.slice(0,12)) {
    const text=await fetchText(url,get);
    if (!text) continue;
    const p=new URL(url);
    docs.push({title:p.hostname.replace(/^www\./,""),url,text,links:[url],primaryDirect:true,discoveryFallback:true});
    if (docs.length>=limit) break;
  }
  return docs;
}
module.exports={discover,resultUrls,stripHtml};
