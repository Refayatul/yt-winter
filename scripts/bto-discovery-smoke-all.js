#!/usr/bin/env node
"use strict";const {discover}=require("./bto-research-v2"),cases=require("./bto-source-discovery-smoke-cases.json");(async()=>{for(const c of cases){const titles=await discover({...c,question:`Why ${c.designDetail}?`});console.log(c.object,":",titles.slice(0,3).join(" | "));if(!titles.length)process.exitCode=1}})().catch(e=>{console.error(e);process.exit(1)});
