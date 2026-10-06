"use strict";
// Human review report (spec 36-37): one page a human can use to decide
// PUBLISH / REVIEW / REJECT, with exact rejection reasons.
const S = require("./signals");

const row = (cells) => "| " + cells.join(" | ") + " |";
const esc = (s) => String(s == null ? "—" : s).replace(/\|/g, "\\|").replace(/\n/g, " ");

function render(result, bundle, extra = {}) {
  const ev = result.evidence; const a = result.assessment; const L = [];
  const dec = a.decision;
  L.push(`# ProfitDecoded review — ${bundle.topic.topic}`);
  L.push("");
  L.push(`## Verdict: **${dec}**  ${dec === "PUBLISH" ? "(still requires recorded human approval for the first 5 videos)" : ""}`);
  L.push("");
  L.push(`Format: ${result.format} · Generated ${result.generatedAt} · **Dry run: nothing was uploaded.**`);
  L.push("");
  if (a.reasons.length) { L.push("### Exact reasons"); for (const r of a.reasons) L.push("- " + r); L.push(""); }
  L.push("## Topic");
  L.push(row(["Field", "Value"])); L.push(row(["---", "---"]));
  L.push(row(["Topic", esc(bundle.topic.topic)])); L.push(row(["Content pillar", esc(bundle.topic.pillar)]));
  L.push(row(["Portfolio type", esc(extra.portfolioType)])); L.push(row(["Viral mechanism", esc(bundle.topic.viralMechanism)]));
  L.push(row(["Topic score", `${esc(bundle.topicScore)} (${esc(extra.topicScoreNote || "ESTIMATED from curation heuristics")})`]));
  L.push(row(["Expected business value", esc(extra.ebv ? `${extra.ebv.score} (${extra.ebv.category}, ESTIMATED)` : "UNKNOWN")]));
  L.push(row(["Demand / outlier evidence", esc(extra.demand || "UNKNOWN: no competitor data supplied")]));
  L.push(row(["Long-form potential", esc(extra.longPotential)])); L.push(row(["Expected learning value", esc(extra.learningValue)]));
  L.push("");
  L.push("## Research"); L.push(`Research score **${ev.research.score}** (${ev.research.pass ? "PASS" : "FAIL"}); ${ev.research.stats.sources} sources, ${ev.research.stats.tier1} primary/authoritative, Wikipedia share ${Math.round(ev.research.stats.wikipediaShare * 100)}%.`);
  L.push(""); L.push("**Core thesis:** " + esc(bundle.dossier.thesis)); L.push("");
  L.push(row(["Source", "Publisher", "Tier", "Why"])); L.push(row(["---", "---", "---", "---"]));
  for (const s of ev.research.sources) { const src = bundle.dossier.sources.find((x) => x.id === s.id); L.push(row([`[${esc(s.id)}] ${esc(src && src.title)}`, esc(s.publisher), s.tier, esc(s.tierReason)])); }
  L.push(""); L.push(row(["Claim", "Central", "Status"])); L.push(row(["---", "---", "---"]));
  for (const c of ev.research.claims) L.push(row([esc(c.text), c.central ? "yes" : "", c.status]));
  if (ev.research.warnings.length) { L.push(""); for (const w of ev.research.warnings) L.push("- ⚠ " + w); }
  L.push("");
  L.push("## Hook and first 30 seconds");
  L.push(`Winning hook (**${ev.hook.winner ? ev.hook.winner.mechanism : "—"}**, score ${ev.hook.winner ? ev.hook.winner.score : "—"}): “${ev.hook.winner ? ev.hook.winner.text : ""}”`);
  L.push(""); L.push(row(["Hook candidate", "Mechanism", "Score"])); L.push(row(["---", "---", "---"]));
  for (const h of ev.hook.ranked) L.push(row([esc(h.text), h.mechanism, h.score]));
  L.push(""); L.push(`First-30-second score **${ev.first30.score}** (hook ${ev.first30.parts.hook}, validate-click ${ev.first30.parts.validate}, momentum ${ev.first30.parts.momentum}).`);
  for (const n of ev.first30.notes) L.push("- " + n);
  L.push("");
  L.push("## Script"); L.push(`AI-writing-pattern score **${ev.aiPatterns.aiPatternScore}** (lower is better; rewrite at ≥35) → ${ev.aiPatterns.verdict}. Sentence-length variation CV ${ev.aiPatterns.stats.sentenceLengthCv}.`);
  for (const f of ev.aiPatterns.findings) L.push(`- ${f.name}${f.count ? " ×" + f.count : ""}${f.example ? ` (“${f.example}”)` : ""} −${Math.round(f.penalty)}`);
  L.push(`Storytelling score ${result.story.score}. ${result.story.notes.join("; ")}`);
  L.push("");
  L.push("## Narration QA"); const n = ev.narration;
  L.push(`Provider: ${esc(n.provider)} · certified premium: **${n.certified ? "yes" : "NO"}** · naturalness **${n.naturalness}** (required ${extra.narrationRequired || 88}) · measured from rendered take: ${n.measured ? "yes" : "no"}`);
  if (n.audio && n.audio.status === "OBSERVED") L.push(`Audio: ${n.audio.integratedLufs} LUFS integrated, true peak ${n.audio.truePeakDbfs} dBFS, ${n.audio.silenceCount} pauses ≥0.35s.`);
  for (const r of n.rejections) L.push("- ❌ " + r); for (const w of n.warnings) L.push("- ⚠ " + w);
  L.push("");
  L.push("## Visuals"); const v = ev.visuals;
  L.push(`Visual-script alignment **${v.alignment}%** · visual quality ${v.visualQuality} · graphics share ${Math.round(v.graphicShare * 100)}% · generic stock ${Math.round(v.genericStockShare * 100)}% · AI-generated ${Math.round(v.aiShare * 100)}% · shot-length CV ${v.shotLengthCv}`);
  for (const r of v.rejections) L.push("- ❌ " + r); for (const w of v.warnings) L.push("- ⚠ " + w);
  L.push(`Copyright/source status: ${ev.copyright.ok ? "OK" : "UNCERTAIN"} — ${ev.copyright.detail}`);
  L.push("");
  L.push("## Packaging");
  L.push(`Selected title: **${ev.title.selected ? ev.title.selected.title : "none"}** (score ${ev.title.selected ? ev.title.selected.score : "—"}). ${ev.title.ranked.length} candidates scored:`);
  L.push(""); L.push(row(["Title", "Score", "Pattern", "Notes"])); L.push(row(["---", "---", "---", "---"]));
  for (const t of ev.title.ranked.slice(0, 20)) L.push(row([esc(t.title), t.score, t.pattern, esc(t.notes.join("; "))]));
  L.push(""); L.push(row(["Thumbnail", "Score", "Composition", "Notes"])); L.push(row(["---", "---", "---", "---"]));
  for (const t of ev.thumbnail.ranked) L.push(row([esc(t.id), t.score, esc(t.composition), esc(t.notes.join("; "))]));
  L.push("");
  L.push("## Similarity / originality");
  L.push(`Max similarity to previous ProfitDecoded scripts: ${ev.similarity.detail.maxScriptSimilarity}; competitor transcripts checked: ${ev.similarity.detail.competitorChecked}.`);
  for (const r of ev.similarity.rejections) L.push("- ❌ " + r); for (const w of ev.similarity.warnings) L.push("- ⚠ " + w);
  L.push("");
  L.push("## Scores");
  L.push(row(["Component", "Weight", "Score", "Points"])); L.push(row(["---", "---", "---", "---"]));
  for (const [k, b] of Object.entries(a.quality.breakdown)) L.push(row([k, b.weight, b.score == null ? "UNKNOWN" : b.score, b.points]));
  L.push(""); L.push(`**Quality total ${a.quality.total}/100** (auto-publish ≥ ${a.thresholds.autoPublish}, review ≥ ${a.thresholds.review}).`);
  L.push(`**Humanness ${a.humanness.score}** (target ≥ ${a.humanness.target}, hard reject < ${a.humanness.hardReject}) → ${a.humanness.verdict}${a.humanness.unknown.length ? "; unmeasured: " + a.humanness.unknown.join(", ") : ""}`);
  L.push(`**Premium Media Test: ${a.premiumMediaTest.verdict}**${a.premiumMediaTest.reasons.length ? " — " + a.premiumMediaTest.reasons.join("; ") : ""}`);
  L.push("");
  L.push("## Hard gates");
  if (!a.hardGateFailures.length) L.push("All evaluated hard gates passed."); for (const f of a.hardGateFailures) L.push("- ❌ " + f);
  if (a.unverified.length) { L.push(""); L.push("Unverified (blocks automatic PUBLISH):"); for (const u of a.unverified) L.push("- ❔ " + u); }
  L.push("");
  L.push("## Publication protection");
  L.push(result.publishGuard.allowed ? "Upload would be allowed." : "Upload blocked:"); for (const b of result.publishGuard.blocks) L.push("- " + b);
  L.push("");
  return L.join("\n");
}

module.exports = { render };
