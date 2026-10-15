"use strict";

// Experimental CT Evidence-First V1 Stage B. No production entrypoint or background scheduler.
const Evidence = require("./ct-evidence-first");
const Builder = require("./ib-ct-library/build");
const Channel = require("../core/channel-context");
const Hooks = require("../core/growth/hooks");
const TopicModel = require("../core/growth/topic-model");
const GrowthConfig = require("../core/growth/config");
const Provider = require("../core/llm/longform-provider");

const CHANNEL = "critical-thread";
const TOPIC_LIMIT = 16000, RUN_LIMIT = 45000, OUTPUT_TOKENS = 3200;
const FIELD_KEYS = ["dependency","mechanism","bottleneck","failureConsequence","resilience","expectedConsequence"];
const WORD = (value) => String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
const tokenSet = (value) => new Set(WORD(value).split(" ").filter((word) => word.length >= 3));
const STRONG_NEGATION = /\b(?:not|never|none|without|no)\b/i;
const CAUSAL = /\b(?:caused|causes|because|therefore|triggered|led to|forced|resulted)\b/i;

function auditStatement(value, ids, approvedFacts) {
  const text = String(value || "").trim();
  if (!text || !Array.isArray(ids) || !ids.length) return { status:"UNSUPPORTED", reason:"MISSING_TEXT_OR_FACT_IDS" };
  const lookup = new Map(approvedFacts.map((f) => [f.fact_id, f]));
  if (ids.some((id) => !lookup.has(id))) return { status:"UNSUPPORTED", reason:"UNKNOWN_FACT_ID" };
  const facts = ids.map((id) => lookup.get(id));
  const values = new Set(facts.flatMap((f) => Evidence.numbers(f.claim + " " + f.verbatim_quote)));
  if (Evidence.numbers(text).some((n) => !values.has(n))) return { status:"UNSUPPORTED", reason:"UNTRACED_NUMBER" };
  const claimText = facts.flatMap((f) => [f.claim, f.verbatim_quote]);
  const normalized = WORD(text);
  if (claimText.some((claim) => {
    const s=WORD(claim);
    return normalized.length >= 8 && (s === normalized || s.includes(normalized));
  })) return { status:"SUPPORTED", reason:"EXACT_SOURCE_WORDING" };
  if (STRONG_NEGATION.test(text) && !claimText.some((fact) => STRONG_NEGATION.test(fact))) return { status:"UNSUPPORTED", reason:"UNSUPPORTED_NEGATION" };
  const all = new Set(claimText.flatMap((s) => [...tokenSet(s)]));
  const content = [...tokenSet(text)];
  const shared = content.filter((word) => all.has(word));
  if (shared.length < 2) return { status:"UNSUPPORTED", reason:"NO_FACT_SUPPORT" };
  if (CAUSAL.test(text) && !claimText.some((fact) => CAUSAL.test(fact))) return { status:"NEEDS_REVIEW", reason:"CAUSAL_MEANING_UNVERIFIED" };
  return { status:"NEEDS_REVIEW", reason:"LEXICAL_OVERLAP_IS_NOT_SEMANTIC_PROOF" };
}
function requireField(value, field, facts, audit) {
  if (!value || typeof value.text !== "string" || !Array.isArray(value.fact_ids)) {
    audit.push({ field, status:"UNSUPPORTED", reason:"FIELD_MISSING_PROVENANCE" }); return "";
  }
  const result = auditStatement(value.text, value.fact_ids, facts);
  audit.push({ field, ...result });
  return value.text.trim();
}
function validateStory(story, evidence) {
  if (!story || typeof story !== "object" || Array.isArray(story)) throw new Error("INVALID_STORY");
  const audit = [], facts = evidence.approved_facts, fields = {};
  for (const key of FIELD_KEYS) fields[key] = requireField(story.fields && story.fields[key], key, facts, audit);
  const title = requireField(story.title, "title", facts, audit);
  const question = requireField(story.coreQuestion, "coreQuestion", facts, audit);
  const thumbnail = requireField(story.thumbnailText, "thumbnailText", facts, audit);
  const openings = (Array.isArray(story.openingCandidates) ? story.openingCandidates : []);
  openings.forEach((value, i) => requireField(value, "openingCandidates." + i, facts, audit));
  const narration = (Array.isArray(story.narration) ? story.narration : []).map((value, i) => ({
    role: String(value?.role || ""), layer: String(value?.layer || ""),
    text: requireField(value, "narration." + i, facts, audit),
    factIds: Array.isArray(value?.fact_ids) ? [...value.fact_ids] : []
  }));
  const titles = (Array.isArray(story.editorialTitles) ? story.editorialTitles : []).map((v,i) =>
    requireField(v, "editorialTitles." + i, facts, audit));
  const scenes = (Array.isArray(story.visualScenes) ? story.visualScenes : []).map((v,i) =>
    requireField(v, "visualScenes." + i, facts, audit));
  if (!openings.length) audit.push({ field:"openingCandidates", status:"UNSUPPORTED", reason:"NO_OPENINGS" });
  if (narration.length < 5 || narration.length > 8) audit.push({ field:"narration", status:"UNSUPPORTED", reason:"NARRATION_LINE_COUNT" });
  return { audit, fields, title, question, thumbnail, openings, narration, titles, scenes };
}
function prepareRecord(topic, evidence, reviewed) {
  const baseOpening = reviewed.openings[0]?.text || reviewed.narration[0]?.text || "";
  return {
    slug: topic.slug, category: topic.category,
    topic: reviewed.title, coreQuestion: reviewed.question,
    openingLine: baseOpening, secondBeat: reviewed.narration[1]?.text || "",
    ...reviewed.fields, thumbnailText: reviewed.thumbnail,
    editorialTitles: reviewed.titles, visualScenes: reviewed.scenes,
    narration: reviewed.narration, number: "",
    facts: evidence.approved_facts.map((f) => ({
      claim:f.claim, quote:f.verbatim_quote, factId:f.fact_id, layer:"VERIFIED FACT",
      source:"Evidence document " + f.source_id, url:f.source_url
    })),
    sources: evidence.verification.primary_document_urls.map((url) => ({
      name:new URL(url).hostname, url, type:"direct original source quotation checked"
    })),
    automated:true, researchMethod:"EXPERIMENTAL Evidence-First V1; human semantic review required",
    researchStatus:"REVIEW_REQUIRED", productionReady:false
  };
}
function hookDiagnostics(topic, record, evidence) {
  const channel = Channel.getChannel(CHANNEL);
  const config = GrowthConfig.forChannel(channel);
  const calculate = (r) => Hooks.generate(TopicModel.normalize(channel, Builder.merge(CHANNEL,topic,r)),config,{
    openingMaxSeconds:channel.config.retentionRules.openingMaxSeconds
  });
  const before = calculate(record);
  const matching = (text) => evidence.approved_facts.filter((f) =>
    auditStatement(text,[f.fact_id],evidence.approved_facts).status === "SUPPORTED"
  ).map((f) => f.fact_id);
  const supported = before.candidates.map((candidate) => ({ spoken:candidate.spoken, fact_ids:matching(candidate.spoken),
    score:candidate.adjustedTotal, blocked:candidate.blocked, fitsOpening:candidate.fitsOpening !== false }))
    .filter((c) => c.fact_ids.length && !c.blocked && c.fitsOpening && c.score >= config.hooks.minimumScore);
  // The builder re-ranks ALL candidates. Filtering its candidate list here would bypass the
  // existing selection contract. Refuse an unsupported winner rather than picking runner-up.
  const selected = before.selected;
  const matched = selected && matching(selected.spoken);
  const problems = [];
  if (before.candidateCount < config.hooks.minimumCandidates) problems.push("INSUFFICIENT_HOOK_CANDIDATES");
  if (supported.length < config.hooks.minimumCandidates) problems.push("INSUFFICIENT_SUPPORTED_HOOK_CANDIDATES");
  if (!selected || !matched?.length) problems.push("TOP_HOOK_NOT_FACT_SUPPORTED");
  let after = null;
  if (selected && matched?.length) {
    record.openingLine=selected.spoken;
    record.narration[0]={ ...record.narration[0], text:selected.spoken, factIds:matched };
    after=calculate(record);
    if (!after.selected || after.selected.spoken !== selected.spoken) problems.push("HOOK_SELECTION_UNSTABLE");
    if (auditStatement(record.openingLine, record.narration[0].factIds, evidence.approved_facts).status !== "SUPPORTED") problems.push("HOOK_UNSUPPORTED_AFTER_SELECTION");
  }
  return { problems, before:{candidateCount:before.candidateCount,selectedScore:before.selectedScore},
    supportedCandidateCount:supported.length, selectedHookFactIds:matched||[], stable:!!after?.selected&&after.selected.spoken===selected.spoken };
}
function assertEvidence(evidence) {
  if (!Evidence.verifyIntegrity(evidence) || evidence.version !== 1 || evidence.channel !== CHANNEL ||
      evidence.status !== "READY_FOR_STORY_REVIEW_REQUIRED" ||
      evidence.verification.distinct_primary_documents < 2 || evidence.approved_facts.length < 16)
    throw new Error("EVIDENCE_NOT_APPROVED_FOR_EXPERIMENTAL_STORY");
}

// Explicit generator injection; no default model, network or live source calls.
// This validates current builder behavior with offline:true and write:false only.
async function generateStory({ topic, evidence, generate, budget }) {
  assertEvidence(evidence);
  if (!topic || !topic.slug || typeof generate !== "function") throw new Error("TOPIC_AND_GENERATOR_REQUIRED");
  const response=await generate({
    stage:"ct-evidence-first-story",reasoningEffort:"low",clientJson:true,maxTokens:OUTPUT_TOKENS,
    ...(budget?{budget}:{}),
    system:"Write a CriticalThread narration and its hook inputs ONLY from provided facts. Every factual field, narration line, title and visual scene must be {text,fact_ids}. Return JSON with title,coreQuestion,thumbnailText,fields{dependency,mechanism,bottleneck,failureConsequence,resilience,expectedConsequence},openingCandidates,narration,editorialTitles,visualScenes. The existing builder must still accept its top hook and at least 20 candidates. No new numbers, entities, causal links or unsupported statements.",
    user:JSON.stringify({ topic:{id:topic.id,slug:topic.slug,subject:topic.canonicalTopic||topic.topic,category:topic.category},
      facts:evidence.approved_facts.map((f)=>({fact_id:f.fact_id,claim:f.claim,verbatim_quote:f.verbatim_quote,
        source_url:f.source_url,evidence_status:f.evidence_status})) })
  });
  const reviewed=validateStory(response?.json,evidence);
  const record=prepareRecord(topic,evidence,reviewed);
  const hooks=hookDiagnostics(topic,record,evidence);
  // Run the actual offline builder for diagnostics only, never write to production or claim
  // online verification. It may reject unsafe fields and legacy topic-gate requirements.
  const result=await Builder.run({channel:CHANNEL,records:[record]},{offline:true,write:false,log:()=>{}});
  const errors=result.report[0]?.errors||["OFFLINE_BUILDER_NO_REPORT"];
  const unsupported=reviewed.audit.filter((a)=>a.status==="UNSUPPORTED");
  const status=unsupported.length?"REJECTED_UNSUPPORTED":hooks.problems.length?"REJECTED_HOOK":
    errors.length?"REJECTED_OFFLINE_BUILDER":"HUMAN_SEMANTIC_REVIEW_REQUIRED";
  return { status, audit:reviewed.audit, hooks, offlineBuilder:{executed:true,passed:!errors.length,errors},
    semanticAccuracy:"NEEDS_REVIEW",humanReviewRequired:true,neverProductionReady:true,
    traceability:record.narration.map((line,index)=>({line:index+1,text:line.text,fact_ids:line.factIds})),
    evidenceDigest:evidence.integrity_sha256 };
}

// Token-aware wrapper for injected Groq adapters. The existing provider enforces the real
// per-topic budget and provider TPM; this wrapper also checks the per-run ceiling.
// If a mocked adapter does not report usage, fail closed instead of assuming zero cost.
function boundedGenerate(generate,topicBudget=Provider.tokenBudget(TOPIC_LIMIT),runBudget=Provider.tokenBudget(RUN_LIMIT)) {
  return async (request) => {
    const estimated=Provider.estimateRequestTokens(request);
    if (topicBudget.spent+estimated>TOPIC_LIMIT || runBudget.spent+estimated>RUN_LIMIT)
      throw new Error("EVIDENCE_FIRST_BUDGET_EXHAUSTED");
    const before=topicBudget.spent;
    const response=await generate({...request,budget:topicBudget});
    let charged=topicBudget.spent-before;
    if (charged===0 && Number.isFinite(response?.usage?.total_tokens)) {
      charged=response.usage.total_tokens;
      topicBudget.spent+=charged;
      topicBudget.requests++;
    }
    if (!(charged>0) || topicBudget.spent>TOPIC_LIMIT || runBudget.spent+charged>RUN_LIMIT)
      throw new Error("EVIDENCE_FIRST_UNACCOUNTED_USAGE");
    runBudget.spent+=charged;runBudget.requests++;
    return response;
  };
}
async function runOfflineExperiment({topic,sources,generate,verifyPrimary}) {
  if (typeof generate !== "function") throw new Error("GENERATOR_REQUIRED");
  const topicBudget=Provider.tokenBudget(TOPIC_LIMIT),runBudget=Provider.tokenBudget(RUN_LIMIT);
  const wrapped=boundedGenerate(generate,topicBudget,runBudget);
  const evidence=await Evidence.extractEvidence({topic,sources,generate:wrapped,verifyPrimary,budget:topicBudget});
  if (evidence.status !== "READY_FOR_STORY_REVIEW_REQUIRED")
    return {status:"INSUFFICIENT_EVIDENCE",evidence,topicTokens:topicBudget.spent,runTokens:runBudget.spent};
  const story=await generateStory({topic,evidence,generate:wrapped,budget:topicBudget});
  return {status:story.status,evidence,story,topicTokens:topicBudget.spent,runTokens:runBudget.spent};
}
module.exports={ auditStatement,validateStory,prepareRecord,hookDiagnostics,generateStory,boundedGenerate,runOfflineExperiment,
  TOPIC_LIMIT,RUN_LIMIT };
