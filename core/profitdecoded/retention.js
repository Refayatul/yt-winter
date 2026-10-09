"use strict";
// Retention Critic (Phase 3): an independent, deterministic reading of a script, section by section.
// It never sees the writer's reasoning, only the beats, the story plan (if any) and the dossier.
// It asks the questions an editor asks about attention: does every section add something new, does the
// story escalate, are the questions it opens paid off, is anything repeated, padded or faked?
//
// IMPORTANT: these are heuristic readings of TEXT (provenance ESTIMATED). They flag likely weak spots for a
// human or a rewrite; they do not measure, predict or prove real audience retention.

const T = require("./text");
const S = require("./signals");
const AI = require("./ai-patterns");
const Hooks = require("./hooks");

const FORCED = /\b(you won'?t believe|stay with me|keep watching|stick around|but wait|wait for it|what happened next|this changes everything|the answer (will|may) (shock|surprise) you|more on that (later|in a (moment|minute|bit))|we'?ll get (to|back to) (that|this) (later|in a moment)|but first|before we get to that)\b/i;
const CONTRAST = /\b(but|yet|instead|however|except|turns out|the catch|that changes|which means)\b/i;
const WPM = 150; // narration words per minute used only to express positions in time

const numbersOf = (t) => (String(t).match(/\$?\d[\d,.]*\d|\$?\d/g) || []).map((n) => n.replace(/^\$/, "").replace(/[,.]+$/, ""));
const entitiesOf = (t) => (String(t).match(/\b[A-Z][a-z]+(?: [A-Z][a-z]+)*\b/g) || []);

// Group beats into sections: by beat.section when the writer set it, otherwise ~150-word chunks (about a minute).
function sectionsOf(beats, plan) {
  if (beats.some((b) => b.section)) {
    const order = []; const by = {};
    for (const b of beats) { const k = b.section || (order[order.length - 1] || "s1"); if (!by[k]) { by[k] = []; order.push(k); } by[k].push(b); }
    const titles = Object.fromEntries(((plan && plan.sections) || []).map((s) => [s.id, s]));
    return order.map((id) => ({ id, title: titles[id] ? titles[id].title : id, purpose: titles[id] ? titles[id].purpose : null, beats: by[id] }));
  }
  const out = []; let cur = []; let words = 0;
  for (const b of beats) { cur.push(b); words += T.words(b.text).length; if (words >= 150) { out.push(cur); cur = []; words = 0; } }
  if (cur.length) out.push(cur);
  return out.map((bs, i) => ({ id: "chunk" + (i + 1), title: `minute ${i + 1}`, purpose: null, beats: bs }));
}

function critique(beats, ctx = {}) {
  const plan = ctx.plan || null;
  const secs = sectionsOf(beats, plan);
  const seenClaims = new Set(); const seenNums = new Set(); const seenEnt = new Set(); const earlier = [];
  const openQuestions = []; const questionPositions = []; let wordPos = 0;
  const report = [];
  secs.forEach((sec, si) => {
    const text = sec.beats.map((b) => b.text).join(" ");
    const sents = T.sentences(text); const words = T.words(text).length;
    const issues = [];
    const issue = (type, severity, evidence, recommendation) => issues.push({ type, severity, evidence, recommendation });
    // 1. New information: claims, numbers, named things not seen before.
    const newClaims = [...new Set(sec.beats.map((b) => b.claimId).filter(Boolean))].filter((c) => !seenClaims.has(c));
    const newNums = [...new Set(numbersOf(text))].filter((n) => !seenNums.has(n));
    const newEnt = [...new Set(entitiesOf(text))].filter((e) => !seenEnt.has(e) && !/^(The|A|An|But|And|So|This|That|It|In|On|Now|Then|When|If|For|One|What|Why|How)$/.test(e));
    const novelty = newClaims.length * 3 + newNums.length * 2 + Math.min(4, newEnt.length);
    // A dead stretch is a matter of duration: a single short beat (under ~15 s) cannot be one.
    if (si > 0 && novelty === 0 && words >= 40) issue("dead-stretch", "high", `section "${sec.title}" adds no new claim, number or name`, "cut it or give it one new piece of evidence that moves the story forward");
    else if (si > 0 && words > 120 && novelty / (words / 100) < 1.5) issue("thin-section", "medium", `${novelty} new items in ${words} words`, "tighten: say it once, with the strongest number, then move on");
    // 2. Repetition against everything said before.
    for (const s of sents) {
      if (T.words(s).length < 7) continue;
      const hit = earlier.find((e) => T.textSimilarity(s, e, 2) > 0.5 || T.wordSetSimilarity(s, e) > 0.7);
      if (hit) { issue("repetition", "medium", `"${s.slice(0, 90)}" repeats "${hit.slice(0, 70)}"`, "delete the repeat or replace it with the consequence of the earlier point"); break; }
    }
    // 3. Forced drama and fake cliffhangers.
    for (const s of sents) if (FORCED.test(s)) { issue("forced-drama", "high", `"${s.slice(0, 90)}"`, "replace the teaser with the next real piece of evidence; curiosity should come from the facts"); break; }
    // 4. Questions opened here, and whether they are answered later.
    sents.forEach((s) => {
      const isQ = s.trim().endsWith("?");
      // A later declarative sentence that reuses the question's key words counts as an answer.
      if (!isQ) for (const oq of openQuestions) if (!oq.answered && oq.words.length && oq.words.filter((w) => T.contentWords(s).includes(w)).length >= Math.min(2, oq.words.length)) oq.answered = sec.id;
      if (isQ) { questionPositions.push(wordPos); openQuestions.push({ q: s, words: T.contentWords(s), section: sec.id, at: wordPos, answered: false }); }
      wordPos += T.words(s).length;
    });
    // 5. Filler: sentences with no content beyond stock words.
    const filler = sents.filter((s) => T.contentWords(s).length <= 1 && T.words(s).length >= 4);
    if (filler.length) issue("filler", "low", `"${filler[0].slice(0, 80)}"`, "cut, or make the line carry a fact");
    // 6. Generic phrasing local to this section.
    const ai = AI.analyze(text);
    const gen = ai.findings.filter((f) => f.type === "phrase");
    if (gen.length) issue("generic-language", "medium", gen.map((f) => `${f.name} ("${f.example}")`).join("; "), "rewrite in plain, specific words");
    // 7. Spoken naturalness local to this section.
    const sp = AI.spoken(text);
    if (sp.score < 75) issue("hard-to-say", "medium", sp.findings.slice(0, 2).map((f) => `${f.name}${f.detail ? " (" + f.detail + ")" : ""}`).join("; "), "shorter sentences, one number per sentence, plain words");
    // 8. Very long sections lose people unless something turns inside them.
    if (words > 260 && !sents.some((s) => CONTRAST.test(s))) issue("no-turn-in-long-section", "medium", `${words} words without a contrast or consequence`, "split it, or add the complication that changes what the viewer thought");
    for (const b of sec.beats) { if (b.claimId) seenClaims.add(b.claimId); }
    numbersOf(text).forEach((n) => seenNums.add(n)); entitiesOf(text).forEach((e) => seenEnt.add(e)); earlier.push(...sents);
    const penalty = issues.reduce((p, x) => p + ({ high: 25, medium: 12, low: 5 }[x.severity]), 0);
    report.push({ id: sec.id, title: sec.title, purpose: sec.purpose, words, startsAtMin: null, novelty: { newClaims: newClaims.length, newNumbers: newNums.length, newNames: newEnt.length }, score: S.clamp(100 - penalty), issues });
  });
  // Positions in time (narration estimate).
  let acc = 0; for (const r of report) { r.startsAtMin = S.round(acc / WPM, 1); acc += r.words; }
  const global = [];
  const gIssue = (type, severity, evidence, recommendation) => global.push({ type, severity, evidence, recommendation });
  // Opening: the existing first-30-seconds reading.
  const f30 = Hooks.first30(beats, { title: ctx.title || "" });
  if (ctx.format !== "short" && f30.score < 80) gIssue("weak-opening", "high", `first-30-seconds reading ${f30.score} (${f30.notes.join("; ")})`, "open on the tension, validate the title by second 15, deliver the first real fact by second 30");
  // Unanswered questions.
  for (const q of openQuestions.filter((x) => !x.answered)) gIssue("unpaid-question", "high", `"${q.q.slice(0, 90)}" (${q.section}) is never answered`, "answer it later with evidence, or remove the question");
  // Mechanical curiosity loops: questions at suspiciously regular intervals.
  if (questionPositions.length >= 4) {
    const gaps = questionPositions.slice(1).map((p, i) => p - questionPositions[i]);
    if (T.cv(gaps) < 0.25) gIssue("mechanical-loops", "medium", `${questionPositions.length} questions at near-regular ${Math.round(T.mean(gaps))}-word intervals`, "let questions arise from the evidence, not a timer");
  }
  // Escalation: the middle third should contain a turn (contrast, complication, consequence).
  const third = Math.floor(beats.length / 3);
  const middle = beats.slice(third, Math.max(third + 1, 2 * third)).map((b) => b.text).join(" ");
  const middleIds = new Set(beats.slice(third, Math.max(third + 1, 2 * third)).map((b) => b.section).filter(Boolean));
  const plannedTurn = secs.some((x) => middleIds.has(x.id) && /turn|complication|consequence/.test(x.purpose || ""));
  if (beats.length >= 6 && !CONTRAST.test(middle) && !plannedTurn && !beats.slice(third, 2 * third).some((b) => /turn|caveat|consequence|complication/.test(b.type || ""))) gIssue("no-escalation", "high", "the middle third has no turn, complication or consequence", "add the fact that complicates the first explanation");
  // Payoff: the end must resolve the central question and not just restate the opening.
  const last = report[report.length - 1];
  const endText = last ? secs[secs.length - 1].beats.map((b) => b.text).join(" ") : "";
  const central = (plan && plan.centralQuestion) || (openQuestions[0] && openQuestions[0].q) || "";
  if (central && T.contentWords(central).filter((w) => T.contentWords(endText).includes(w)).length < Math.min(2, T.contentWords(central).length)) gIssue("missing-payoff", "high", `the ending does not return to the central question ("${central.slice(0, 80)}")`, "end on the answer to the question the video opened with");
  if (beats.length >= 4 && T.wordSetSimilarity(beats[0].text, beats[beats.length - 1].text) > 0.45) gIssue("predictable-ending", "medium", "the last line restates the first", "end on a consequence or a new, earned implication");
  if (/\b(in conclusion|to sum up|so there you have it|and that'?s how)\b/i.test(endText)) gIssue("essay-ending", "low", "summary formula in the ending", "end on the strongest fact or consequence instead of a summary");
  const weakest = [...report].sort((a, b) => a.score - b.score).slice(0, 3).filter((r) => r.score < 85).map((r) => ({ id: r.id, title: r.title, score: r.score, fix: r.issues[0] && r.issues[0].recommendation }));
  const score = S.clamp(Math.round(T.mean(report.map((r) => r.score)) - global.reduce((p, g) => p + ({ high: 10, medium: 5, low: 2 }[g.severity]), 0)));
  return {
    score, sections: report, global, weakest, first30: { score: f30.score, parts: f30.parts, notes: f30.notes },
    openQuestions: openQuestions.map((q) => ({ question: q.q, raisedIn: q.section, answeredIn: q.answered || null })),
    provenance: "ESTIMATED",
    disclaimer: "Heuristic reading of the script text. It points at likely weak spots; it does not measure or predict audience retention. Real retention is known only from YouTube Analytics after publishing.",
  };
}

// Section-by-section editorial quality report: retention reading + writing quality + evidence use.
function editorialReport(beats, ctx = {}) {
  const ret = critique(beats, ctx);
  const dossier = ctx.dossier || { claims: [], inferences: [] };
  const claims = Object.fromEntries((dossier.claims || []).concat(dossier.inferences || []).map((c) => [c.id, c]));
  const secs = sectionsOf(beats, ctx.plan);
  const sections = secs.map((sec, i) => {
    const text = sec.beats.map((b) => b.text).join(" ");
    const ai = AI.analyze(text); const sp = AI.spoken(text);
    const cited = [...new Set(sec.beats.map((b) => b.claimId).filter(Boolean))];
    const unknown = cited.filter((c) => !claims[c]);
    const r = ret.sections[i];
    const grades = { retention: r.score, naturalness: sp.score, genericness: ai.aiPatternScore, evidence: unknown.length ? 0 : cited.length ? 100 : 40 };
    return { id: sec.id, title: sec.title, purpose: sec.purpose, words: r.words, startsAtMin: r.startsAtMin, claims: cited, grades, issues: [...r.issues, ...unknown.map((u) => ({ type: "unknown-claim", severity: "high", evidence: u, recommendation: "use only verified dossier claim ids" }))] };
  });
  return { sections, global: ret.global, retentionScore: ret.score, openQuestions: ret.openQuestions, disclaimer: ret.disclaimer };
}

module.exports = { critique, editorialReport, sectionsOf, FORCED };
