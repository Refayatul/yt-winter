"use strict";
const assert=require("assert"),D=require("../scripts/bto-source-discovery");
const ranked=D.rankCandidates([{url:"https://www.nist.gov/example",title:"Street numbers",snippet:"numbering"}],{object:"street numbers",designDetail:"skipped numbers"});
assert.ok(ranked.length===1);
assert.equal(Object.prototype.hasOwnProperty.call(ranked[0],"productionReady"),false);
console.log("bto fallback safety passed");
