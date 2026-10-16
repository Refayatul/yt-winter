#!/usr/bin/env node
"use strict";
// Manual CT Evidence-First diagnostics. NEVER calls Groq, publishes or writes to topic universe.
// --fixture: two-stage MOCKED offline replay (no network).
// --probe-primary: ONE official original-document fetch, report metadata only.
const fs=require("node:fs"),path=require("node:path"),Primary=require("./ct-primary-document");
const USAGE="Usage: CT_EVIDENCE_FIRST_MANUAL=1 node scripts/ct-evidence-first-manual.js --manual (--fixture PATH | --probe-primary HTTPS_URL)";
function argsOf(argv){
  if(!argv.includes("--manual")||process.env.CT_EVIDENCE_FIRST_MANUAL!=="1")
    throw Error("EXPLICIT_MANUAL_OPT_IN_REQUIRED");
  if(argv.length!==3||argv[0]!=="--manual"||
    !["--fixture","--probe-primary"].includes(argv[1])||!argv[2])
    throw Error("INVALID_EXPERIMENTAL_ARGUMENTS");
  return {mode:argv[1],value:argv[2]};
}
async function run({argv=process.argv.slice(2),fetchPrimary=Primary.fetchPrimaryDocument,replay=null}={}){
  const {mode,value}=argsOf(argv);
  if(mode==="--probe-primary"){
    const doc=await fetchPrimary({kind:"primary",url:value});
    if(!doc||!doc.url||!doc.content_type||!doc.body_sha256||!doc.text)
      throw Error("INVALID_PRIMARY_DOCUMENT_RESULT");
    return {mode:"MANUAL_PRIMARY_PROBE",document_retrieved:true,
      host:new URL(doc.final_url||doc.url).hostname,content_type:doc.content_type,
      bytes:doc.bytes,characters:doc.text.length,sha256:doc.body_sha256,
      semantic_accuracy:"NOT_CHECKED",no_groq_requests:true,no_writes:true};
  }
  // Local originals and model replies are MOCKS, never real primary provenance.
  const data=JSON.parse(fs.readFileSync(path.resolve(value),"utf8"));
  if(!data||!data.topic||!Array.isArray(data.sources)||!Array.isArray(data.facts)||
    !data.story||!data.original_documents)throw Error("INVALID_MANUAL_FIXTURE");
  const Story=require("./ct-evidence-story");
  const out=await (replay||Story.runOfflineExperiment)({
    topic:data.topic,sources:data.sources,
    verifyPrimary:async s=>({url:s.url,text:data.original_documents[s.source_id]||""}),
    generate:async req=>({
      json:req.stage==="ct-evidence-first-extract"?{facts:data.facts}:data.story,
      usage:{total_tokens:2000} // mocked accounting, not real usage
    })
  });
  return {mode:"MOCKED_OFFLINE_REPLAY",status:out.status,
    facts:out.evidence?.approved_facts?.length||0,
    rejected_facts:out.evidence?.rejected_facts?.length||0,
    mock_primary_documents:out.evidence?.verification?.distinct_primary_documents||0,
    builder_reached:!!out.story?.offlineBuilder?.executed,
    builder_passed:!!out.story?.offlineBuilder?.passed,
    hook_candidate_count:out.story?.hooks?.before?.candidateCount??null,
    semantic_accuracy:"NOT_VERIFIED",model_usage:"MOCKED_NOT_REAL",
    no_groq_requests:true,no_writes:true};
}
async function main(){
  try{process.stdout.write(JSON.stringify(await run())+"\n");}
  catch(error){
    // No URLs, prompt text, excerpts, provider identifiers or raw model replies in logs.
    const raw=String(error.code||error.message||"");
    const code=/^[A-Z_]{4,64}$/.test(raw)?raw:"MANUAL_EXPERIMENT_FAILED";
    process.stderr.write(JSON.stringify({status:"FAILED",code,usage:USAGE})+"\n");
    process.exitCode=1;
  }
}
if(require.main===module)main();
module.exports={run,argsOf,USAGE};
