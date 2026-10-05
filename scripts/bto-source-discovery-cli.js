#!/usr/bin/env node
"use strict";
const {discover}=require("./bto-research-v2");
const object=process.argv[2]||"street numbers",designDetail=process.argv[3]||"skipped numbers",question=process.argv[4]||`Why ${designDetail}?`;
discover({object,designDetail,question}).then(t=>console.log(JSON.stringify({object,designDetail,titles:t},null,2))).catch(e=>{console.error(e.message);process.exit(1)});
