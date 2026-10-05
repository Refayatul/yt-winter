"use strict";
const assert=require("assert"),A=require("../scripts/bto-research-production-adapter");
(async()=>{const docs=[{title:"strict"}];const out=await A.discoverWithFallback({},docs,null,()=>{throw Error("unused")});assert.strictEqual(out,docs);console.log("bto production adapter passed")})().catch(e=>{console.error(e);process.exit(1)});
