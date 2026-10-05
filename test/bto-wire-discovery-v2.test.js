"use strict";
const fs=require("fs"),path=require("path"),assert=require("assert"),cp=require("child_process"),os=require("os");
const root=path.join(__dirname,"..");
const original=fs.readFileSync(path.join(root,"scripts","bto-research.js"),"utf8");
const patcher=fs.readFileSync(path.join(root,"scripts","bto-wire-discovery-v2.js"),"utf8");
assert.ok(patcher.includes("ResearchFallback.relatedArticles"));
assert.ok(patcher.includes("discoveryFallback === true"));
assert.ok(original.includes("async function articles(topic, get)"));
console.log("bto real-path wiring contract passed");
