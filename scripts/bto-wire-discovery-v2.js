#!/usr/bin/env node
"use strict";
const fs=require("fs"),path=require("path");
const file=path.join(__dirname,"bto-research.js");
let src=fs.readFileSync(file,"utf8");
const requireNeedle='const FR = require(path.join(ROOT, "scripts", "fr-library", "build"));';
const requireReplacement=requireNeedle+'\nconst ResearchFallback = require(path.join(ROOT, "scripts", "bto-research-fallback"));';
const returnNeedle='  return out;\n}\n\n// The article\'s own cited links on primary hosts';
const returnReplacement='  if (!out.length) {\n    const fallback = await ResearchFallback.relatedArticles(topic, (params) => wikiJson(get, params));\n    return fallback;\n  }\n  return out;\n}\n\n// The article\'s own cited links on primary hosts';
const detailNeedle='  const mentionsDetail = (doc) => !detailWords.length || detailWords.some((word) => doc.text.toLowerCase().includes(word));';
const detailReplacement='  // Semantic fallback documents need not contain the inventory wording literally.\n  // They still must survive provider answerability, verbatim-quote and Builder gates.\n  const mentionsDetail = (doc) => doc.discoveryFallback === true || !detailWords.length || detailWords.some((word) => doc.text.toLowerCase().includes(word));';
for(const [needle,replacement,label] of [[requireNeedle,requireReplacement,"require"],[returnNeedle,returnReplacement,"articles fallback"],[detailNeedle,detailReplacement,"detail gate"]]){
  if(src.includes(replacement)) continue;
  if(!src.includes(needle)) throw new Error(`BTO discovery wiring failed: ${label} anchor not found`);
  src=src.replace(needle,replacement);
}
fs.writeFileSync(file,src);
console.log("BTO discovery v2 wired into scripts/bto-research.js");
