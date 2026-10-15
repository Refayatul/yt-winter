"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const Evidence=require("../../scripts/ct-evidence-first");
const Story=require("../../scripts/ct-evidence-story");
const Channel=require("../../core/channel-context");

const t=JSON.parse(fs.readFileSync(Channel.getChannel("critical-thread").paths.topicUniverse,"utf8")).topics.find((t)=>t.id==="CT-230");
const quote=(i)=>"The official report confirms component number "+i+" triggered a cascade of documented technical failures.";
const claim=(i)=>"Component "+i+" triggered documented technical failures.";
function seed(){
  const facts=Array.from({length:16},(_,i)=>({fact_id:"F"+(i+1),source_id:i<8?"S1":"S2",claim:claim(i+1),verbatim_quote:quote(i+1)}));
  const sources=[1,2].map((n)=>({source_id:"S"+n,kind:"primary",url:n===1?"https://nasa.gov/reports/first":"https://nist.gov/reports/second",
    excerpt:facts.filter((f)=>f.source_id==="S"+n).map((f)=>f.verbatim_quote).join("\n")}));
  return {facts,sources};
}
const verified=async()=>{const {facts,sources}=seed();return Evidence.validateEvidence({
  topic:{id:t.id},facts,sources,verifyPrimary:async(s)=>({url:s.url,text:s.excerpt})});};
function textField(i){return {text:claim(i),fact_ids:["F"+i]};}
function safeStory(){
  return {
    title:textField(1),coreQuestion:textField(2),thumbnailText:textField(3),
    fields:Object.fromEntries(["dependency","mechanism","bottleneck","failureConsequence","resilience","expectedConsequence"].map((k,i)=>[k,textField(i+1)])),
    openingCandidates:[textField(4)],
    narration:Array.from({length:8},(_,i)=>({...textField(i+1),role:"HOW_IT_WORKS",layer:"VERIFIED FACT"})),
    editorialTitles:[textField(5)], visualScenes:[textField(6)]
  };
}
test("safe exact quotations are SUPPORTED but lexical paraphrases still NEEDS_REVIEW",async()=>{
  const p=await verified();
  assert.equal(Story.auditStatement(claim(1),["F1"],p.approved_facts).status,"SUPPORTED");
  assert.equal(Story.auditStatement("Component 1 not triggered documented technical failures.",["F1"],p.approved_facts).status,"UNSUPPORTED");
  assert.equal(Story.auditStatement("Component 777 triggered documented technical failures.",["F1"],p.approved_facts).status,"UNSUPPORTED");
  assert.equal(Story.auditStatement("The company triggered more technical failures.",["F1"],p.approved_facts).status,"NEEDS_REVIEW");
  assert.equal(Story.auditStatement("Because component 1 triggered documented technical failures, the station closed.",["F1"],p.approved_facts).status,"NEEDS_REVIEW");
  assert.equal(Story.auditStatement(claim(1),["F777"],p.approved_facts).status,"UNSUPPORTED");
});
test("Stage B receives only approved facts, never rejected text or source excerpts",async()=>{
  const p=await verified();
  let sent=null;
  const result=await Story.generateStory({topic:t,evidence:p,generate:async(request)=>{
    sent=JSON.parse(request.user);
    assert.equal(request.reasoningEffort,"low");
    return {json:safeStory()};
  }});
  assert.equal(sent.facts.length,16);
  assert.equal(JSON.stringify(sent).includes("rejected_facts"),false);
  assert.equal(JSON.stringify(sent).includes("excerpt"),false);
  assert.equal(result.offlineBuilder.executed,true);
  assert.equal(result.humanReviewRequired,true);
  assert.equal(result.neverProductionReady,true);
  assert.ok(["REJECTED_HOOK","REJECTED_OFFLINE_BUILDER","HUMAN_SEMANTIC_REVIEW_REQUIRED"].includes(result.status),result.status);
  assert.equal(result.traceability.length,8);
});
test("unsupported story fields cannot become VERIFIED or published",async()=>{
  const p=await verified(),draft=safeStory();
  draft.fields.failureConsequence={text:"A new 999-person catastrophe happened.",fact_ids:["F1"]};
  const result=await Story.generateStory({topic:t,evidence:p,generate:async()=>({json:draft})});
  assert.equal(result.status,"REJECTED_UNSUPPORTED");
  assert.equal(result.humanReviewRequired,true);
});
test("hook engine is consulted without changing global ranking; unsupported top hook fails closed",async()=>{
  const p=await verified(),draft=safeStory();
  const reviewed=Story.validateStory(draft,p),record=Story.prepareRecord(t,p,reviewed);
  const result=Story.hookDiagnostics(t,record,p,draft);
  assert.equal(typeof result.before.candidateCount,"number");
  assert.ok(result.problems.every((s)=>typeof s==="string"));
  assert.equal(Array.isArray(result.selectedHookFactIds),true);
});
test("tampered or insufficient evidence never reaches Story Engine",async()=>{
  const p=await verified();
  p.approved_facts[0].claim="tampered";
  await assert.rejects(()=>Story.generateStory({topic:t,evidence:p,generate:async()=>({json:safeStory()})}),/EVIDENCE_NOT_APPROVED/);
  const b=await verified();b.status="INSUFFICIENT_EVIDENCE";
  await assert.rejects(()=>Story.generateStory({topic:t,evidence:b,generate:async()=>({json:safeStory()})}),/EVIDENCE_NOT_APPROVED/);
});
test("bounded token wrapper refuses impossible requests and tracks mock usage",async()=>{
  let calls=0;
  const gen=Story.boundedGenerate(async()=>{calls++;return{json:{},usage:{total_tokens:200}};});
  await gen({system:"test",user:"test",maxTokens:300});
  assert.equal(calls,1);
  await assert.rejects(()=>gen({system:"test",user:"x".repeat(65000),maxTokens:3200}),/BUDGET_EXHAUSTED/);
  assert.equal(calls,1);
});
test("Stage A then Stage B completes offline through the actual builder without writes",async()=>{
  const {facts,sources}=seed();
  let stages=[];
  const out=await Story.runOfflineExperiment({
    topic:t,sources,verifyPrimary:async(s)=>({url:s.url,text:s.excerpt}),
    generate:async(request)=>{
      stages.push(request.stage);
      return {json:request.stage==="ct-evidence-first-extract"?{facts}:safeStory(),usage:{total_tokens:2500}};
    }});
  assert.deepEqual(stages,["ct-evidence-first-extract","ct-evidence-first-story"]);
  assert.equal(out.story.offlineBuilder.executed,true);
  assert.equal(out.story.humanReviewRequired,true);
  assert.equal(out.topicTokens,5000);
  assert.equal(out.runTokens,5000);
});
test("Stage A failure stops before Story generation",async()=>{
  const {facts,sources}=seed();
  sources[1].kind="secondary";
  const stages=[];
  const out=await Story.runOfflineExperiment({topic:t,sources,
    verifyPrimary:async(s)=>({url:s.url,text:s.excerpt}),
    generate:async(req)=>{stages.push(req.stage);return {json:{facts},usage:{total_tokens:1800}};}});
  assert.deepEqual(stages,["ct-evidence-first-extract"]);
  assert.equal(out.status,"INSUFFICIENT_EVIDENCE");
});
