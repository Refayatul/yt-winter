"use strict";
const assert=require("assert"),H=require("../scripts/bto-research-fallback-hook");
(async()=>{const existing=[{title:"Existing"}];assert.strictEqual(await H.fillWhenEmpty({},existing,()=>{throw Error("must not call")}),existing);console.log("bto fallback hook passed")})().catch(e=>{console.error(e);process.exit(1)});
