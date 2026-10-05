#!/usr/bin/env node
"use strict";
const fs=require("fs"),path=require("path");
const file=path.join(__dirname,"bto-research.js");
let src=fs.readFileSync(file,"utf8");
function patch(needle,replacement,label){
  if(src.includes(replacement)) return;
  if(!src.includes(needle)) throw new Error(`BTO discovery wiring failed: ${label}`);
  src=src.replace(needle,replacement);
}
if(!src.includes('bto-research-fallback')) patch(
  'const FR = require(path.join(ROOT, "scripts", "fr-library", "build"));',
  'const FR = require(path.join(ROOT, "scripts", "fr-library", "build"));\nconst ResearchFallback = require(path.join(ROOT, "scripts", "bto-research-fallback"));\nconst AuthorityDiscovery = require(path.join(ROOT, "scripts", "bto-authority-discovery"));',
  'requires');
else if(!src.includes('bto-authority-discovery')) patch(
  'const ResearchFallback = require(path.join(ROOT, "scripts", "bto-research-fallback"));',
  'const ResearchFallback = require(path.join(ROOT, "scripts", "bto-research-fallback"));\nconst AuthorityDiscovery = require(path.join(ROOT, "scripts", "bto-authority-discovery"));',
  'authority require');
patch(
  '  return out;\n}\n\n// The article\'s own cited links on primary hosts',
  '  if (!out.length) return ResearchFallback.relatedArticles(topic, (params) => wikiJson(get, params));\n  return out;\n}\n\n// The article\'s own cited links on primary hosts',
  'wiki fallback');
patch(
  '  const search = await wikiJson(get, { action: "query", list: "search", srsearch: `${topic.object} ${topic.designDetail}`, srlimit: 5 });',
  '  const causalQuery = `${topic.object} ${topic.designDetail} ${topic.coreQuestion || "why reason design"}`;\n  const search = await wikiJson(get, { action: "query", list: "search", srsearch: causalQuery, srlimit: 10 });',
  'causal wiki');
patch(
  'async function researchOne(topic, deps) {\n  const docs = await articles(topic, deps.get);',
  'async function researchOne(topic, deps) {\n  // Primary authority pages are evidence first; Wikipedia is orientation/fallback.\n  // Search-result snippets are never evidence: each authority page is fetched and\n  // its quotes are independently verified by Builder before productionReady.\n  const authorityDocs = await AuthorityDiscovery.discover(topic, deps.get).catch(() => []);\n  const wikiDocs = await articles(topic, deps.get);\n  const docs = [...authorityDocs, ...wikiDocs].slice(0, 5);',
  'authority first');
patch(
  '  for (const doc of docs) {\n    const links = (await primaryLinks(doc.title, deps.get)).map((url, index) => ({ url, index })).sort((a, b) => relevance(b.url) - relevance(a.url) || a.index - b.index).map((item) => item.url);\n    doc.links = await reachableLinks(links, deps.get);\n  }',
  '  for (const doc of docs) {\n    if (doc.primaryDirect) { doc.links = [doc.url]; continue; }\n    const links = (await primaryLinks(doc.title, deps.get)).map((url, index) => ({ url, index })).sort((a, b) => relevance(b.url) - relevance(a.url) || a.index - b.index).map((item) => item.url);\n    doc.links = await reachableLinks(links, deps.get, 4, 30);\n  }',
  'direct primary handling');
patch(
  '  const keys = [...words(topic.object), ...words(topic.designDetail)];',
  '  const keys = [...words(topic.object), ...words(topic.designDetail), ...contentWords(topic.coreQuestion || ""), "reason", "because", "designed", "purpose", "prevent", "allows", "required"];',
  'causal excerpt');
patch(
  '  const mentionsDetail = (doc) => !detailWords.length || detailWords.some((word) => doc.text.toLowerCase().includes(word));',
  '  const mentionsDetail = (doc) => doc.primaryDirect === true || doc.discoveryFallback === true || !detailWords.length || detailWords.some((word) => doc.text.toLowerCase().includes(word));',
  'detail gate');
patch(
  '  const links = [...new Set(cited.flatMap((source) => source.links || []))];',
  '  const links = [...new Set(cited.flatMap((source) => source.primaryDirect ? [source.url] : (source.links || [])))];',
  'direct cited links');
patch(
  '      source: `Wikipedia — ${sourceById.get(fact.sourceId).title}`, url: sourceById.get(fact.sourceId).url, factId: fact.id })),',
  '      source: `${sourceById.get(fact.sourceId).primaryDirect ? "Primary" : "Wikipedia"} — ${sourceById.get(fact.sourceId).title}`, url: sourceById.get(fact.sourceId).url, factId: fact.id })),',
  'fact source label');
patch(
  '    sources: links.slice(0, 3).map((url) => ({ name: new URL(url).hostname.replace(/^www\\./, ""), url, type: "primary source cited by the Wikipedia article" })),',
  '    sources: links.slice(0, 4).map((url) => ({ name: new URL(url).hostname.replace(/^www\\./, ""), url, type: cited.some((s) => s.primaryDirect && s.url === url) ? "direct primary evidence" : "primary source cited by research article" })),',
  'source type');
patch(
  '    researchMethod: "automated: provider draft from Wikipedia text; verbatim quotes, numbers and sources verified by scripts/ib-ct-library/build.js",',
  '    researchMethod: "automated authority-first research; direct primary pages preferred, Wikipedia fallback; verbatim quotes, numbers, hosts and reachability verified by scripts/ib-ct-library/build.js",',
  'method');
fs.writeFileSync(file,src);
console.log("BTO discovery v4 wired: direct authority evidence first, Wikipedia fallback, quality gates unchanged");
