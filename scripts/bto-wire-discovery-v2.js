#!/usr/bin/env node
"use strict";
const fs=require("fs"),path=require("path");
const file=path.join(__dirname,"bto-research.js");
let src=fs.readFileSync(file,"utf8");
const patches=[
  [
    'const ResearchFallback = require(path.join(ROOT, "scripts", "bto-research-fallback"));',
    'const ResearchFallback = require(path.join(ROOT, "scripts", "bto-research-fallback"));',
    "require"
  ],
  [
    '  return out;\n}\n\n// The article\'s own cited links on primary hosts',
    '  if (!out.length) {\n    const fallback = await ResearchFallback.relatedArticles(topic, (params) => wikiJson(get, params));\n    return fallback;\n  }\n  return out;\n}\n\n// The article\'s own cited links on primary hosts',
    "articles fallback"
  ],
  [
    '  const mentionsDetail = (doc) => !detailWords.length || detailWords.some((word) => doc.text.toLowerCase().includes(word));',
    '  // Semantic fallback documents need not contain the inventory wording literally.\n  // They still must survive provider answerability, verbatim-quote and Builder gates.\n  const mentionsDetail = (doc) => doc.discoveryFallback === true || !detailWords.length || detailWords.some((word) => doc.text.toLowerCase().includes(word));',
    "detail gate"
  ],
  [
    '  const search = await wikiJson(get, { action: "query", list: "search", srsearch: `${topic.object} ${topic.designDetail}`, srlimit: 5 });',
    '  // Search the actual causal question, not only the inventory nouns. This\n  // improves answerability without weakening any evidence gate.\n  const causalQuery = `${topic.object} ${topic.designDetail} ${topic.coreQuestion || "why reason design"}`;\n  const search = await wikiJson(get, { action: "query", list: "search", srsearch: causalQuery, srlimit: 10 });',
    "causal search"
  ],
  [
    '  const keys = [...words(topic.object), ...words(topic.designDetail)];',
    '  // Include the causal question in excerpt selection so the provider sees\n  // sentences about the reason/mechanism rather than only object mentions.\n  const keys = [...words(topic.object), ...words(topic.designDetail), ...contentWords(topic.coreQuestion || ""), "reason", "because", "designed", "design", "purpose", "prevent", "allows", "required"];',
    "causal excerpt"
  ],
  [
    '    const links = (await primaryLinks(doc.title, deps.get)).map((url, index) => ({ url, index })).sort((a, b) => relevance(b.url) - relevance(a.url) || a.index - b.index).map((item) => item.url);',
    '    const links = (await primaryLinks(doc.title, deps.get)).map((url, index) => ({ url, index })).sort((a, b) => relevance(b.url) - relevance(a.url) || a.index - b.index).map((item) => item.url);\n    // Probe more article-cited authority links before declaring NO_PRIMARY_SOURCE.\n    // The acceptance threshold remains two reachable primary references.\n    doc._primaryCandidates = links;',
    "primary candidates"
  ],
  [
    '    doc.links = await reachableLinks(links, deps.get);',
    '    doc.links = await reachableLinks(links, deps.get, 4, 30);',
    "primary probes"
  ]
];
for(const [needle,replacement,label] of patches){
  if(src.includes(replacement)) continue;
  if(!src.includes(needle)) {
    if(label === "require" && src.includes('const FR = require(path.join(ROOT, "scripts", "fr-library", "build"));')) {
      src=src.replace('const FR = require(path.join(ROOT, "scripts", "fr-library", "build"));','const FR = require(path.join(ROOT, "scripts", "fr-library", "build"));\nconst ResearchFallback = require(path.join(ROOT, "scripts", "bto-research-fallback"));');
      continue;
    }
    throw new Error(`BTO discovery wiring failed: ${label} anchor not found`);
  }
  src=src.replace(needle,replacement);
}
fs.writeFileSync(file,src);
console.log("BTO discovery v3 wired: semantic fallback + causal excerpts + deeper primary probes");
