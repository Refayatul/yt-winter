"use strict";
const Hook=require("./bto-research-fallback-hook");
async function discoverWithFallback(topic,strictDocs,get,wikiJsonFactory){return Hook.fillWhenEmpty(topic,strictDocs,(params)=>wikiJsonFactory(get,params))}
module.exports={discoverWithFallback};
