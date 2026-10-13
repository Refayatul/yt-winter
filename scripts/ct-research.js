#!/usr/bin/env node
"use strict";

// CRITICALTHREAD: automated, evidence-first replenishment of the qualified Shorts inventory.
//
//   node scripts/ct-research.js [--limit 3] [--slug <topic-slug>] [--target-days 14] [--write]
//
// Runs only while the qualified runway (scripts/growth/topic-inventory.js: production's own
// selection, viral-minimum, readiness and duplicate gates) is below --target-days. It upgrades
// EXISTING topic records from the inventory's research queue; it never invents topics.
//
// Per record:
//   1. Wikipedia articles about the record's canonical subject, and the articles' own cited
//      links on CriticalThread's primary hosts (core/research PRIMARY_HOSTS), checked reachable.
//   2. The free long-form provider (Groq) drafts the record from those excerpts only: every
//      fact carries a verbatim quote, every narration line cites facts. It may answer "not
//      answerable"; the record then stays as it is.
//   3. scripts/ib-ct-library/build.js run(), unchanged and shared with hand research: numbers
//      traced to source text, verbatim quotes (required for automated records), narration
//      limits, primary reachable sources, legacy audits, hook candidates. One repair round.
//   4. --write keeps an upgrade only when the upgraded record is production-qualified: a
//      selectable bucket, ViralPotentialScore >= the effective minimum, and a pre-render readiness
//      gate (duplicate detection on) that does not BLOCK. Otherwise the original is restored.
//
// Paid providers are refused: the provider must be Groq with no fallback. Attempts are recorded
// in channel state (research-attempts.json); a record is not retried for 60 days.

const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const Channel = require(path.join(ROOT, "core", "channel-context"));
const Provider = require(path.join(ROOT, "core", "llm", "longform-provider"));
const ResearchCore = require(path.join(ROOT, "core", "research"));
const Builder = require(path.join(ROOT, "scripts", "ib-ct-library", "build"));
const FR = require(path.join(ROOT, "scripts", "fr-library", "build"));
// Shared helpers of the automated BTO research (same reference probing, excerpting and
// narration-support checks); only the subject search, prompt and record shape are CT-specific.
const Shared = require(path.join(ROOT, "scripts", "bto-research"));
const Inventory = require(path.join(ROOT, "scripts", "growth", "topic-inventory"));

const SLUG = "critical-thread";
const EXCERPT_BUDGET_CHARS = Number(process.env.CT_RESEARCH_EXCERPT_CHARS) || 8000;
const COMPLETION_TOKENS = Number(process.env.CT_RESEARCH_MAX_TOKENS) || 3200;
const PAUSE_MS = process.env.CT_RESEARCH_PAUSE_MS != null ? Number(process.env.CT_RESEARCH_PAUSE_MS) : 65000;
const ROLES = ["HIDDEN_SYSTEM", "WHY_IT_MATTERS", "WHAT_DEPENDS_ON_IT", "HOW_IT_WORKS", "BOTTLENECK", "FAILURE", "RESILIENCE", "WHERE_IT_EXISTS", "PAYOFF"];
// Words too generic to tie an article to a subject on their own.
const GENERIC = new Set(["system", "systems", "network", "networks", "plant", "station", "line", "lines", "chain", "supply", "global", "critical", "infrastructure", "industry", "production", "facility", "route", "control", "service", "services"]);
const CATALOGUE = /id\.loc\.gov\/authorities|viaf\.org|worldcat\.org|d-nb\.info|catalogue\.bnf\.fr|wikidata\.org/i;
const words = (text) => String(text || "").split(/\s+/).filter(Boolean);

// Paid usage stays disabled: Groq only, and no fallback that could reach a paid provider.
function freeProviderOnly(config = Provider.configuration()) {
  if (!config.enabled || config.primary.name !== "groq" || !config.primary.configured) return { ok: false, reason: "no free long-form provider configured (LONGFORM_LLM_PROVIDER=groq + GROQ_API_KEY)" };
  if (config.fallback && config.fallback.name !== "groq") return { ok: false, reason: `fallback provider ${config.fallback.name} refused: CriticalThread research runs on the free provider only` };
  return { ok: true };
}

const keywords = (subject) => words(String(subject).toLowerCase().replace(/[^a-z0-9\s]/g, " ")).filter((word) => word.length >= 4 && !GENERIC.has(word));
const stem = (word) => word.toLowerCase().replace(/(ies)$/, "y").replace(/(es|s)$/, "");

// An article counts when its title shares a specific word with the subject, or its opening
// names the subject outright. Lists, timelines and disambiguation pages never count.
function relevantArticle(title, extract, subject) {
  if (/^(list|lists|timeline|index|outline|glossary) of\b/i.test(title)) return false;
  if (/may refer to/i.test(String(extract || "").slice(0, 300))) return false;
  const own = new Set(words(String(title).toLowerCase().replace(/[^a-z0-9\s]/g, " ")).map(stem));
  if (keywords(subject).some((word) => own.has(stem(word)))) return true;
  return String(extract || "").slice(0, 1500).toLowerCase().includes(String(subject).toLowerCase());
}

// Most CT records are about one event (the Milwaukee outbreak, the 2008 melamine scandal), while
// canonicalTopic names the system ("food safety laboratory"). Searching the system alone found
// the wrong articles (2026-10-12 dry run: CT-265 matched India's food regulator). The record's own
// question is searched first, so the article about the event comes first; an article is kept only
// when it is relevant to the question's specific words or to the system.
// How well an article's introduction matches the record's own specific words (place names,
// figures, the substance): 0 unless at least three of them, or half, appear, so a search hit
// about something else is never used as evidence. Returns the number of matched words.
function questionMatch(extract, text) {
  const opening = String(extract || "").slice(0, 3000).toLowerCase();
  const specific = [...new Set(String(text).toLowerCase().replace(/[^a-z0-9,\s]/g, " ").split(/\s+/)
    .filter((word) => (word.length > 4 && !GENERIC.has(word)) || /^\d[\d,]{2,}$/.test(word)))];
  const found = specific.filter((word) => opening.includes(/^\d/.test(word) ? word : stem(word))).length;
  return found >= Math.min(3, Math.ceil(specific.length / 2)) ? found : 0;
}

async function articles(topic, get) {
  const subject = topic.canonicalTopic || topic.topic;
  const question = String(topic.coreQuestion || "").replace(/[?]/g, "").trim();
  const wiki = async (params) => {
    const query = Object.entries({ format: "json", ...params }).map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join("&");
    const response = await get(`https://en.wikipedia.org/w/api.php?${query}`, { json: true });
    return response && response.body;
  };
  const hits = async (query) => {
    const search = query ? await wiki({ action: "query", list: "search", srsearch: query, srlimit: 5 }) : null;
    return ((search && search.query && search.query.search) || []).map((hit) => hit.title);
  };
  // The question, then the record's own opening beats (they name the place and figure), as
  // separate searches; candidates are ordered by how many of the record's specific words they use.
  const eventText = [question, topic.openingLine, topic.secondBeat].filter(Boolean).join(" ");
  // One request per search: the hits come back with their introductions (generator=search).
  const scored = [];
  for (const query of [question, topic.openingLine, topic.secondBeat].filter(Boolean)) {
    const data = await wiki({ action: "query", generator: "search", gsrsearch: String(query).replace(/[?.]/g, ""), gsrlimit: 4, prop: "extracts", exintro: 1, explaintext: 1, exlimit: "max" });
    for (const page of Object.values((data && data.query && data.query.pages) || {})) {
      if (!scored.some((item) => item.title === page.title)) scored.push({ title: page.title, score: questionMatch(page.extract, eventText) });
    }
  }
  const eventTitles = scored.filter((item) => item.score > 0).sort((a, b) => b.score - a.score).slice(0, 2).map((item) => item.title);
  // With an event article in hand, the system's own article joins only under its exact name;
  // loose matches on the system's words ("food safety" -> a national regulator) are not evidence.
  const canonical = subject.charAt(0).toUpperCase() + subject.slice(1);
  const titles = eventTitles.length ? [...new Set([...eventTitles, canonical])] : [...new Set([canonical, ...(await hits(subject))])].slice(0, 5);
  const out = [];
  for (const title of titles) {
    const data = await wiki({ action: "query", prop: "extracts", explaintext: 1, redirects: 1, titles: title });
    const page = data && data.query && Object.values(data.query.pages || {})[0];
    const relevant = page && (eventTitles.includes(title) || (eventTitles.length ? page.title.toLowerCase() === subject.toLowerCase() : relevantArticle(page.title, page.extract, subject)));
    if (page && page.extract && page.extract.length > 500 && !out.some((doc) => doc.title === page.title) && relevant) {
      out.push({ title: page.title, url: `https://en.wikipedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g, "_"))}`, text: page.extract });
    }
    if (out.length >= 2) break;
  }
  return out;
}

// The article's own cited links on CT primary hosts, matched exactly as the builder matches them.
async function primaryLinks(title, get, hosts = ResearchCore.PRIMARY_HOSTS) {
  const query = `action=query&prop=extlinks&ellimit=500&format=json&titles=${encodeURIComponent(title)}`;
  const response = await get(`https://en.wikipedia.org/w/api.php?${query}`, { json: true });
  const page = response && response.body && response.body.query && Object.values(response.body.query.pages || {})[0];
  const links = ((page && page.extlinks) || []).map((item) => item["*"] || item.url).filter((url) => /^https?:\/\//.test(url || ""));
  return [...new Set(links.map((url) => url.replace(/^http:\/\//, "https://")).filter((url) => {
    try {
      const parsed = new URL(url);
      return hosts.some((allowed) => parsed.hostname.includes(allowed)) && parsed.pathname.length > 1 && !/\.pdf($|\?)/i.test(url) && !CATALOGUE.test(url);
    } catch (error) { return false; }
  }))];
}

const SYSTEM = [
  "You research one topic for CriticalThread, a channel about the hidden systems modern life depends on and what happens when they fail (chips, power grids, cables, ports, shipping, water, cold chains, minerals, chokepoints).",
  "Use ONLY the supplied source excerpts. Never use outside knowledge. If the excerpts do not clearly support a dependency, a bottleneck and a documented failure or disruption, return {\"answerable\":false,\"reason\":\"...\"}.",
  "Every fact needs a quote copied EXACTLY, character for character, from its source excerpt (at least 6 consecutive words), and the sourceId it came from. Give 10 to 14 facts, each claim one short sentence (at most 16 words) carrying one distinct detail: the record needs at least 20 distinct evidence-backed hook candidates. Every number in a claim must appear in its quote.",
  "dependency, mechanism, bottleneck, failureConsequence and resilience: one plain sentence each, each stated by the facts.",
  "Narration: 5 to 8 short spoken lines, 55 to 90 words in total, no sentence longer than 16 words, plain English, precise, no filler, no 'Did you know'.",
  "Speak at most 3 figures in the whole narration (years, counts and measurements all count) and never repeat a figure or a date. Explain how one fact causes the next (because, so, which means) instead of listing figures.",
  "Line 1 is the hook and openingLine: at most 9 words, a concrete surprising statement about the dependency or the failure, not starting with a date. Lines 1 and 2 together: at most 18 words. The last line is the specific payoff.",
  `Each line has a role (${ROLES.join("|")}), a layer ("VERIFIED FACT" when the cited facts state it, "MODEL" when it explains how cited facts connect), and the fact ids it is based on. Add no detail that is not in those facts. Only use numbers that appear in a cited fact.`,
  "thumbnailText: 1 to 3 words, capital letters, no apostrophes. number: the one key figure exactly as a fact writes it, or empty. Titles must be accurate and supported by the facts.",
  "Return JSON only: {\"answerable\":true,\"title\":\"...\",\"coreQuestion\":\"...?\",\"openingLine\":\"...\",\"secondBeat\":\"...\",\"dependency\":\"...\",\"mechanism\":\"...\",\"bottleneck\":\"...\",\"failureConsequence\":\"...\",\"resilience\":\"...\",\"expectedConsequence\":\"...\",\"number\":\"...\",",
  "\"thumbnailText\":\"...\",\"editorialTitles\":[10 distinct accurate titles],\"visualScenes\":[5 short shot descriptions],",
  "\"facts\":[{\"id\":\"F1\",\"claim\":\"...\",\"quote\":\"exact words\",\"sourceId\":\"S1\"}],",
  "\"narration\":[{\"role\":\"HIDDEN_SYSTEM\",\"layer\":\"VERIFIED FACT\",\"text\":\"...\",\"facts\":[\"F1\"]}]}",
].join("\n");

// The hook the growth engine would select for the upgraded record (same call as the builder).
function strongestHook(topic, record) {
  const channel = Channel.getChannel(SLUG);
  const Model = require(path.join(ROOT, "core", "growth", "topic-model"));
  const Hooks = require(path.join(ROOT, "core", "growth", "hooks"));
  const config = require(path.join(ROOT, "core", "growth", "config")).forChannel(channel);
  const hooks = Hooks.generate(Model.normalize(channel, Builder.merge(SLUG, topic, record)), config, { openingMaxSeconds: channel.config.retentionRules.openingMaxSeconds });
  return hooks.selected ? hooks.selected.spoken : null;
}

const FIGURE = /\b\d[\d,.]*\b/g;
const MAX_SPOKEN_FIGURES = 3;

// Upgrade in place: same slug and id, so used-topic and duplicate tracking stay intact.
function toRecord(topic, draft, sources) {
  if (!draft || draft.answerable !== true) return { skip: (draft && draft.reason) || "provider returned no answer" };
  const sourceById = new Map(sources.map((source, index) => [`S${index + 1}`, source]));
  const facts = (Array.isArray(draft.facts) ? draft.facts : []).filter((fact) => sourceById.has(fact.sourceId) && fact.claim && fact.quote);
  const narration = (Array.isArray(draft.narration) ? draft.narration : []).filter((line) => line && line.text).map((line) => ({
    role: ROLES.includes(String(line.role || "").toUpperCase()) ? String(line.role).toUpperCase() : "WHY_IT_MATTERS",
    layer: line.layer === "MODEL" ? "MODEL" : "VERIFIED FACT", text: String(line.text).trim(), facts: Array.isArray(line.facts) ? line.facts : [],
  }));
  const supportErrors = Shared.narrationSupport(narration, facts);
  const cited = [...new Set(facts.map((fact) => fact.sourceId))].map((id) => sourceById.get(id));
  const links = [...new Set(cited.flatMap((source) => source.links || []))];
  if (links.length < 2) supportErrors.push("the cited articles have fewer than 2 reachable primary references");
  // A list of figures is hard to follow by ear (the Mont Blanc Short spoke 7 in 8 lines and said "2002" twice).
  const spoken = narration.map((line) => line.text).join(" ");
  const figures = spoken.match(FIGURE) || [];
  if (figures.length > MAX_SPOKEN_FIGURES) supportErrors.push(`narration speaks ${figures.length} figures; at most ${MAX_SPOKEN_FIGURES} (${figures.join(", ")})`);
  if (new Set(figures).size < figures.length) supportErrors.push(`narration repeats a figure (${figures.filter((f, i) => figures.indexOf(f) !== i).join(", ")})`);
  const opening = narration[0] ? narration[0].text : String(draft.openingLine || "");
  const text = (value) => String(value || "").trim().replace(/\.$/, "");
  const title = String(draft.title || topic.topic).trim();
  const record = {
    slug: topic.slug,
    category: topic.category,
    topic: title,
    coreQuestion: String(draft.coreQuestion || topic.coreQuestion).trim(),
    openingLine: opening,
    secondBeat: narration[1] ? narration[1].text : String(draft.secondBeat || ""),
    dependency: text(draft.dependency) + ".", mechanism: text(draft.mechanism) + ".", bottleneck: text(draft.bottleneck) + ".",
    failureConsequence: text(draft.failureConsequence) + ".", resilience: text(draft.resilience) + ".",
    expectedConsequence: text(draft.expectedConsequence),
    number: String(draft.number || "").trim() || undefined,
    thumbnailText: String(draft.thumbnailText || "").toUpperCase().replace(/['\\]/g, "").trim(),
    editorialTitles: [...new Set((Array.isArray(draft.editorialTitles) ? draft.editorialTitles : [title]).map(String))].slice(0, 10),
    visualScenes: (Array.isArray(draft.visualScenes) ? draft.visualScenes : []).map(String).slice(0, 6),
    narration: narration.map(({ facts: ids, ...line }) => ({ ...line, factIds: ids })),
    facts: facts.map((fact) => ({ claim: String(fact.claim).trim(), quote: String(fact.quote).trim(), layer: "VERIFIED FACT",
      source: `Wikipedia — ${sourceById.get(fact.sourceId).title}`, url: sourceById.get(fact.sourceId).url, factId: fact.id })),
    sources: links.slice(0, 3).map((url) => ({ name: new URL(url).hostname.replace(/^www\./, ""), url, type: "primary source cited by the Wikipedia article" })),
    automated: true,
    researchMethod: "automated: free provider draft from Wikipedia text; verbatim quotes, numbers and sources verified by scripts/ib-ct-library/build.js",
  };
  if (!record.visualScenes.length) delete record.visualScenes;
  return { record, supportErrors };
}

async function researchOne(topic, deps) {
  const docs = await articles(topic, deps.get);
  if (!docs.length) return { status: "NO_SOURCE", reason: `no Wikipedia article about "${topic.canonicalTopic || topic.topic}"` };
  for (const doc of docs) doc.links = await Shared.reachableLinks(await primaryLinks(doc.title, deps.get), deps.get);
  if (docs.reduce((sum, doc) => sum + doc.links.length, 0) < 2) {
    return { status: "NO_PRIMARY_SOURCE", reason: `fewer than 2 reachable primary-host references cited by ${docs.map((doc) => doc.title).join(", ")}` };
  }
  const keys = [...keywords(topic.canonicalTopic || topic.topic), ...keywords(topic.bottleneck || ""), ...keywords(topic.dependency || "")];
  const share = Math.floor(EXCERPT_BUDGET_CHARS / docs.length);
  const sources = docs.map((doc) => ({ title: doc.title, url: doc.url, text: Shared.excerpt(doc.text, keys, share), links: doc.links }));
  const user = { subject: topic.canonicalTopic || topic.topic, cluster: topic.cluster, currentQuestion: topic.coreQuestion,
    sources: sources.map((source, index) => ({ id: `S${index + 1}`, title: source.title, excerpt: source.text })) };
  let feedback = null;
  for (let round = 0; round < 2; round += 1) {
    const response = await deps.generate({ stage: "ct-research", maxTokens: COMPLETION_TOKENS, system: SYSTEM,
      user: JSON.stringify(feedback ? { ...user, previous_errors: feedback } : user) });
    const built = toRecord(topic, response.json, sources);
    if (built.skip) return { status: "NOT_ANSWERABLE", reason: String(built.skip).slice(0, 200) };
    const result = built.supportErrors.length ? { report: [{ slug: built.record.slug, errors: built.supportErrors }] }
      : await deps.verify({ channel: SLUG, records: [built.record] });
    const row = result.report[0];
    if (!row.errors.length) return { status: "VERIFIED", record: built.record, slug: built.record.slug };
    feedback = row.errors.slice(0, 12);
    // The builder requires the spoken opening to be the strongest hook; name the one that won.
    const strongest = (deps.strongestHook || strongestHook)(topic, built.record);
    if (strongest && row.errors.some((error) => /spoken opening is not a valid hook/.test(error))) feedback.push(`the strongest hook candidate is "${strongest}": make the opening line at least as strong, using only cited facts`);
    if (round === 1) return { status: "FAILED_CHECKS", reason: feedback.slice(0, 4).join("; ") };
  }
  return { status: "FAILED_CHECKS" };
}

// Writes verified upgrades, then keeps only those that are now production-qualified; the rest are
// restored to the original record. Returns the slugs kept.
async function writeQualified(records, { measure = Inventory.measure, run = Builder.run, file = Channel.getChannel(SLUG).paths.topicUniverse } = {}) {
  const before = JSON.parse(fs.readFileSync(file, "utf8"));
  await run({ channel: SLUG, records }, { write: true });
  const after = measure(SLUG, { targetDays: 1, attempts: { attempts: {} } });
  const qualified = new Set(after.qualifiedTopics.map((item) => item.slug));
  const kept = records.filter((record) => qualified.has(record.slug)).map((record) => record.slug);
  const restore = records.filter((record) => !qualified.has(record.slug)).map((record) => record.slug);
  if (restore.length) {
    const universe = JSON.parse(fs.readFileSync(file, "utf8"));
    const original = new Map(before.topics.map((item) => [item.slug, item]));
    universe.topics = universe.topics.map((item) => (restore.includes(item.slug) && original.has(item.slug) ? original.get(item.slug) : item));
    fs.writeFileSync(file, JSON.stringify(universe, null, 2) + "\n");
  }
  return { kept, restored: restore };
}

async function main(argv = process.argv.slice(2), deps = {}) {
  const channel = Channel.getChannel(SLUG);
  const valueAfter = (flag) => { const index = argv.indexOf(flag); return index >= 0 ? argv[index + 1] : null; };
  const write = argv.includes("--write");
  const targetDays = Number(valueAfter("--target-days")) || 14;
  if (!deps.generate) {
    const gate = freeProviderOnly();
    if (!gate.ok) { console.log(`CriticalThread research: ${gate.reason}; nothing to do.`); return { skipped: true, reason: gate.reason }; }
  }
  const attempts = Inventory.readAttempts(channel);
  const measure = deps.measure || Inventory.measure;
  const inventory = measure(SLUG, { targetDays, attempts });
  const slug = valueAfter("--slug");
  console.log(`CriticalThread inventory: ${inventory.qualified} qualified (${inventory.runwayDays} day(s)); target ${targetDays}; deficit ${inventory.deficit}`);
  if (!inventory.deficit && !slug) { console.log("runway at or above target; nothing to research"); return { skipped: true, reason: "runway ok" }; }
  const limit = Math.min(Number(valueAfter("--limit")) || 3, slug ? 1 : inventory.deficit);
  const universe = JSON.parse(fs.readFileSync(channel.paths.topicUniverse, "utf8"));
  const bySlug = new Map(universe.topics.map((topic) => [topic.slug, topic]));
  const list = (slug ? [{ slug }] : inventory.queue.slice(0, limit)).map((item) => bySlug.get(item.slug)).filter(Boolean);
  const get = deps.get || FR.get;
  const generate = deps.generate || ((input) => Provider.generateJson(input));
  const verify = deps.verify || ((seed) => Builder.run(seed, { write: false, log: () => {} }));
  const outcomes = [];
  for (const [index, topic] of list.entries()) {
    if (index > 0 && PAUSE_MS > 0 && !deps.generate) await new Promise((resolve) => setTimeout(resolve, PAUSE_MS));
    let outcome;
    try { outcome = await researchOne(topic, { get, generate, verify }); }
    catch (error) {
      if (error instanceof Provider.LongformProviderError && error.defer) {
        console.log(`provider deferred (${error.code}${error.status ? ` HTTP ${error.status}` : ""}); stopping this batch`);
        break;
      }
      outcome = { status: "ERROR", reason: String(error.code || error.message).slice(0, 200) };
    }
    outcomes.push({ topic: topic.slug, ...outcome });
    console.log(`${outcome.status === "VERIFIED" ? "✓" : "✗"} ${topic.id} ${topic.slug}: ${outcome.status}${outcome.reason ? " — " + outcome.reason : ""}`);
    attempts.attempts[topic.slug] = { at: new Date().toISOString(), status: outcome.status, reason: outcome.reason || null };
  }
  const verified = outcomes.filter((item) => item.status === "VERIFIED");
  let result = { kept: [], restored: [] };
  if (write && verified.length) {
    result = await (deps.writeQualified || writeQualified)(verified.map((item) => item.record));
    for (const slugKept of result.kept) attempts.attempts[slugKept].status = "QUALIFIED";
    for (const slugRestored of result.restored) attempts.attempts[slugRestored].status = "VERIFIED_NOT_QUALIFIED";
    if (result.kept.length) {
      const seed = { channel: SLUG, note: "Automated research (scripts/ct-research.js); production-qualified upgrades only.", records: verified.map((item) => item.record).filter((record) => result.kept.includes(record.slug)) };
      const file = path.join(ROOT, "channels", SLUG, "topics", "research-seeds", `auto-${new Date().toISOString().slice(0, 10)}.json`);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify(seed, null, 2) + "\n");
    }
    console.log(`kept ${result.kept.length} qualified upgrade(s); restored ${result.restored.length} verified but not qualified`);
  }
  if (write) {
    fs.mkdirSync(path.dirname(Inventory.attemptsFile(channel)), { recursive: true });
    fs.writeFileSync(Inventory.attemptsFile(channel), JSON.stringify({ ...attempts, channel: SLUG }, null, 2) + "\n");
  }
  return { outcomes, verified: verified.length, ...result };
}

if (require.main === module) main().catch((error) => { console.error(error.message); process.exitCode = 1; });

module.exports = { freeProviderOnly, relevantArticle, articles, primaryLinks, toRecord, strongestHook, researchOne, writeQualified, main, SYSTEM, ROLES };
