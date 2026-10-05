#!/usr/bin/env node
"use strict";
// Preflight used by the research lane to find semantically related Wikipedia
// articles without requiring the article title to equal the ordinary object.
const D=require("./bto-source-discovery");
async function wikiJson(params){const q=new URLSearchParams({format:"json",...Object.fromEntries(Object.entries(params).map(([k,v])=>[k,String(v)]))});const r=await fetch(`https://en.wikipedia.org/w/api.php?${q}`,{headers:{"User-Agent":"youtube-otomasyon-bto/2.0"}});if(!r.ok)throw new Error(`Wikipedia HTTP ${r.status}`);return r.json()}
async function discover(topic){return D.broadWikipediaTitles(topic,wikiJson)}
module.exports={discover};
