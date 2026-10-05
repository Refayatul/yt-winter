"use strict";
const {spawnSync}=require("child_process"),path=require("path");
for(const f of ["bto-source-discovery.test.js","bto-discovery-regression.test.js","bto-research-fallback.test.js","bto-fallback-safety.test.js","bto-research-fallback-hook.test.js","bto-production-adapter.test.js","bto-discovery-policy.test.js","bto-no-production-ready.test.js"]){const r=spawnSync(process.execPath,[path.join(__dirname,f)],{stdio:"inherit"});if(r.status)process.exit(r.status)}
