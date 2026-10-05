"use strict";
const Discovery=require("./bto-source-discovery");
async function relatedArticles(topic,wikiJson){return Discovery.broadWikipediaTitles(topic,wikiJson)}
module.exports={relatedArticles};
