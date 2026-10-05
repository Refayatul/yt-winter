"use strict";
const F=require("./bto-research-fallback");
async function fillWhenEmpty(topic,docs,wikiJson){return docs&&docs.length?docs:F.relatedArticles(topic,wikiJson)}
module.exports={fillWhenEmpty};
