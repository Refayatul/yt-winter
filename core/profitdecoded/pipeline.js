"use strict";
// Full ProfitDecoded production-assessment pipeline (dry-run only: this module
// never uploads). Input is a production "bundle" produced by the research and
// writing stages (human, LLM, or both); the pipeline verifies everything the
// spec requires before a video may be called PUBLISH-ready, and writes a
// reviewable artifact set.

const fs = require("fs");
const path = require("path");
const S = require("./signals");
const T = require("./text");
const Research = require("./research");
const Hooks = require("./hooks");
const Titles = require("./titles");
const Thumbs = require("./thumbnails");
const AI = require("./ai-patterns");
const Narr = require("./narration");
const Vis = require("./visuals");
const Sim = require("./similarity");
const Quality = require("./quality");
const Sched = require("./schedule");
const Retention = require("./retention");
const { CHANNEL_DIR, thresholds } = require("./config");

function storyStats(beats) {
  const lens = beats.map((b) => T.words(b.text).length);
  return { beats: beats.length, words: lens.reduce((s, x) => s + x, 0) };
}

// Story/Editing/Topic sub-scores that are computed (not asserted) from the bundle.
function storytelling(bundle, ai, first30) {
  const beats = bundle.beats; const sc = []; const notes = [];
  const types = beats.map((b) => b.type).filter(Boolean);
  const hasThesis = !!(bundle.dossier && bundle.dossier.thesis);
  const progression = new Set(types).size;
  let score = 55;
  if (hasThesis) score += 8;
  score += Math.min(14, progression * 2);
  const payoffs = beats.filter((b) => /payoff|mini-payoff|reveal/.test(b.type || "")).length;
  score += Math.min(10, payoffs * 3);
  const loops = beats.filter((b) => /open-loop/.test(b.type || "")).length;
  if (loops > Math.max(2, beats.length / 8)) { score -= 8; notes.push("too many open loops"); }
  const last = beats[beats.length - 1], firstB = beats[0];
  if (last && firstB && T.wordSetSimilarity(last.text, firstB.text) > 0.45) { score -= 10; notes.push("conclusion repeats the introduction"); }
  score -= Math.max(0, ai.aiPatternScore - 15) * 0.5;
  score += (first30.score - 70) * 0.1;
  return { score: S.clamp(Math.round(score)), notes };
}

function run(bundle, options = {}) {
  const th = thresholds();
  const format = bundle.format || "long";
  const beats = bundle.beats.map((b, i) => ({ id: b.id || "b" + (i + 1), ...b }));
  const script = beats.map((b) => b.text).join(" ");
  const ev = { format };
  // 1. Research gate (must precede everything else).
  ev.research = Research.gate(bundle.dossier, { format });
  ev.scriptClaims = Research.unsupportedClaimsInScript(script, bundle.dossier);
  // 2. Writing quality.
  ev.aiPatterns = AI.analyze(script);
  // 2b. Spoken naturalness and the Retention Critic (heuristic readings for review; they add no new gate here).
  ev.spoken = AI.spoken(script);
  ev.retention = Retention.critique(beats, { plan: bundle.storyPlan, format, title: bundle.selectedTitle || bundle.topic.topic });
  // 3. Hook competition + first 30 seconds.
  const topicWords = T.contentWords(bundle.topic.topic);
  ev.hook = Hooks.compete(bundle.hookCandidates || [], { topicWords });
  // 4. Packaging.
  const claimTexts = (bundle.dossier.claims || []).map((c) => c.text).concat((bundle.dossier.inferences || []).map((c) => c.text), [bundle.dossier.thesis]);
  ev.title = Titles.rankTitles(bundle.titleCandidates || [], { history: (bundle.history || []).map((h) => h.title), claims: claimTexts, brand: bundle.topic.entity });
  const titleOut = ev.title.selected || { score: 0, misleading: true };
  ev.first30 = Hooks.first30(beats, { title: titleOut.title || bundle.topic.topic });
  if (ev.title.problems.length) ev.title.misleading = ev.title.misleading || false;
  const supportedNumbers = (bundle.dossier.claims || []).concat(bundle.dossier.inferences || []).flatMap((c) => ((c.text || "") + " " + (c.numbers || []).join(" ")).match(/\d[\d,.]*/g) || []).map((n) => n.replace(/[,.]+$/, ""));
  ev.thumbnail = Thumbs.rank(bundle.thumbnailCandidates || [], { title: titleOut.title, supportedNumbers, allowedAccusations: bundle.allowedAccusations || [] }, (bundle.history || []).map((h) => h.thumbnailComposition));
  // 5. Narration QA (real audio measured when a take exists).
  const audioFile = bundle.audioFile && fs.existsSync(path.resolve(options.baseDir || ".", bundle.audioFile)) ? path.resolve(options.baseDir || ".", bundle.audioFile) : null;
  const segments = (bundle.narration && bundle.narration.segments) || beats.filter((b) => b.start != null).map((b) => ({ text: b.text, start: b.start, end: b.end }));
  ev.narration = Narr.qa(segments.length ? segments : beats.map((b) => ({ text: b.text, start: 0, end: 0 })), { provider: (bundle.narration || {}).provider, audioFile, humanListenApproved: (bundle.narration || {}).humanListenApproved });
  // 6. Visuals.
  const planned = (bundle.visualPlan || []).map((p) => ({ ...p }));
  ev.visuals = Vis.qa(planned, beats);
  // 7. Similarity vs history (+competitor transcripts when supplied).
  ev.similarity = Sim.compare({ script, hook: ev.hook.winner && ev.hook.winner.text, title: titleOut.title, structure: beats.map((b) => b.type), music: (bundle.audio || {}).music, thumbnailComposition: ev.thumbnail.selected && ev.thumbnail.selected.composition, transitions: [...new Set(planned.map((p) => p.transition).filter(Boolean))] }, bundle.history || [], { competitorTranscripts: bundle.competitorTranscripts || [] });
  // 8. Copyright/source status over every visual and audio asset.
  const assets = planned.map((p) => p.source).filter(Boolean).concat((bundle.audio && bundle.audio.assets) || []);
  const unlicensed = assets.filter((a) => !Vis.OK_LICENSES.has(String(a.license || "").toLowerCase()));
  ev.copyright = { ok: unlicensed.length === 0 && assets.length > 0, detail: unlicensed.length ? `${unlicensed.length} asset(s) without verified licence` : assets.length ? `${assets.length} assets, all with licence status` : "no assets recorded", assets: assets.length };
  // 9. Render inspection (only what was actually observed).
  ev.render = bundle.render || null;
  // 10. Humanness parts: measured where possible, otherwise UNKNOWN (null).
  const sentLensCv = ev.aiPatterns.stats.sentenceLengthCv;
  const narrationProsody = ev.narration.measured ? Math.min(ev.narration.parts.cadenceVariation, ev.narration.parts.pauseVariation) : null;
  const sourceDepth = ev.research.score;
  const story = storytelling({ ...bundle, beats }, ev.aiPatterns, ev.first30);
  ev.humannessParts = {
    scriptNaturalness: ev.aiPatterns.naturalness,
    sentenceVariation: S.clamp(Math.round(sentLensCv / 0.55 * 100)),
    narrationProsody,
    visualSpecificity: ev.visuals.specificity,
    visualRepetition: ev.visuals.repetition,
    editingVariation: ev.visuals.pacing,
    sourceDepth,
    insightOriginality: bundle.gap && bundle.gap.reasonToExist ? 85 : null,
    transitions: ev.visuals.pacing,
    emotionalRhythm: ev.narration.measured ? Math.round((ev.narration.parts.cadenceVariation + ev.narration.parts.pauseVariation) / 2) : null, // proxy: variation of pace and pauses across the take
    graphicSpecificity: Math.round(Math.min(100, ev.visuals.graphicShare * 160)),
    topicTreatment: story.score,
  };
  const durationSec = segments.length ? segments[segments.length - 1].end : null;
  ev.duration = { seconds: durationSec, target: format === "short" ? [30, 50] : [600, 1080] };
  if (durationSec != null) ev.duration.inRange = durationSec >= ev.duration.target[0] && durationSec <= ev.duration.target[1] + (format === "short" ? 2 : 0);
  // 11. Quality score from computed components.
  const components = {
    topic: bundle.topicScore != null ? bundle.topicScore : null,
    hook: ev.hook.winner ? ev.hook.winner.score : null,
    storytelling: story.score,
    visual: ev.visuals.visualQuality,
    visualScriptMatch: ev.visuals.alignment,
    narration: ev.narration.naturalness,
    research: ev.research.score,
    editing: ev.visuals.pacing,
    title: titleOut.score,
    thumbnail: ev.thumbnail.score,
  };
  const assessment = Quality.assess(components, { ...ev, title: { ...titleOut, misleading: ev.title.selected ? false : true } });
  const guard = Sched.publishGuard({ dryRun: true, format, assessment, hasCredentials: false, approvals: 0 });
  return { bundleId: bundle.id, format, topic: bundle.topic, components, evidence: ev, story, assessment, publishGuard: guard, generatedAt: new Date().toISOString() };
}

module.exports = { run, storytelling };
