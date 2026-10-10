"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { analyze, markdown } = require("../../core/profitdecoded/visual-diversity");

const shot = (id, start, end, category, background, layout) =>
  ({ id, start, end, category, background, layout, textWeight: "low" });

test("visual diagnostics locate sustained repetition and use measured shot times", () => {
  const report = analyze([
    shot("a", 0, 12, "data visualization", "dark", "chart"),
    shot("b", 12, 25, "data visualization", "dark", "chart"),
    shot("c", 25, 38, "data visualization", "dark", "chart"),
    shot("d", 38, 44, "real-world illustration", "context", "environment"),
  ]);
  assert.equal(report.shots, 4);
  assert.equal(report.categories["data visualization"].seconds, 38);
  assert.ok(report.issues.some((x) => x.kind === "chart-heavy run" && x.start === 0 && x.end === 38));
  assert.ok(report.issues.some((x) => x.kind === "repeated background" && x.start === 0 && x.end === 38));
  assert.match(markdown(report), /00:00–00:38/);
});

test("a context shot breaks an abstract run; unknown categories fail visibly", () => {
  const report = analyze([
    shot("a", 0, 30, "data visualization", "dark", "chart"),
    shot("b", 30, 35, "real-world illustration", "context", "environment"),
    shot("c", 35, 65, "financial evidence", "paper", "document"),
  ]);
  assert.equal(report.issues.filter((x) => x.kind === "context opportunity").length, 0);
  assert.throws(() => analyze([shot("bad", 0, 1, "unknown", "dark", "chart")]), /invalid visual category/);
});

test("rendered phone text, clipped citations, narration, and freezes yield measured editorial findings", () => {
  const report = analyze([
    { ...shot("statement", 0, 12, "financial evidence", "paper", "document"), asset: "filing claim c2", semanticAnchor: "redemption" },
    shot("silent-diagram", 12, 25, "explanatory diagram", "dark", "diagram"),
  ], {
    timeline: [{ start: 0, end: 10, text: "The filing describes redemption." }],
    frameObservations: [{ shotId: "statement", second: 9, essentialTextPxOn640: 8.5, sourcePresent: true, sourceClipped: true }],
    freezes: [{ start: 15, duration: 2.8 }],
  });
  const by = (kind) => report.issues.find((issue) => issue.kind === kind);
  assert.equal(by("mobile text").diagnostic.minimumPx, 8.5);
  assert.equal(by("source qualification").severity, "high");
  assert.equal(by("narration alignment").start, 12);
  assert.equal(by("static visual").diagnostic.measuredSeconds, 2.8);
  assert.equal(by("semantic alignment"), undefined);
  assert.ok(report.issues.every((issue) => issue.suggestion && issue.severity));
});

test("explicit semantic anchors flag visuals that disagree with the spoken beat", () => {
  const report = analyze([{ ...shot("claim", 0, 6, "financial evidence", "paper", "document"), semanticAnchor: "airline" }],
    { timeline: [{ start: 0, end: 6, text: "The supermarket sells a gift card." }] });
  assert.equal(report.issues.find((issue) => issue.kind === "semantic alignment").shots[0], "claim");
});

test("local revision refuses to overwrite its source master before probing or rendering", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pd-revision-test-"));
  try {
    const source = path.join(dir, "master.mp4"); fs.writeFileSync(source, "sentinel");
    const script = path.join(__dirname, "../../scripts/profitdecoded/motion/revise-master.js");
    const result = spawnSync(process.execPath, [script, dir, "--source", source, "--out", source, "--ids", "open-wall"], { encoding: "utf8" });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /must not overwrite the source master/);
    assert.equal(fs.readFileSync(source, "utf8"), "sentinel");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("a stretch carried by one visual category is flagged once, with its window and share", () => {
  const charts = Array.from({ length: 10 }, (_, i) => ({ ...shot(`c${i}`, i * 12, (i + 1) * 12, "data visualization", "paper", i % 2 ? "chart" : "document"), textWeight: "low" }));
  const report = analyze([...charts, shot("place", 120, 135, "real-world illustration", "context", "environment"), shot("doc", 135, 150, "financial evidence", "paper", "document")], { windowSeconds: 60 });
  const low = report.issues.filter((x) => x.kind === "low variety");
  assert.equal(low.length, 1);
  assert.equal(low[0].start, 0);
  assert.equal(low[0].diagnostic.dominantCategory, "data visualization");
  assert.ok(low[0].end >= 105 && low[0].end <= 120);
  assert.equal(report.summary.lowestWindowVariety, 1);
});

test("varied stretches are not flagged; summary values are measured from shot times", () => {
  const cats = ["real-world illustration", "data visualization", "financial evidence", "visual metaphor"];
  const report = analyze(Array.from({ length: 12 }, (_, i) => shot(`s${i}`, i * 10, (i + 1) * 10, cats[i % 4], i % 4 === 0 ? "context" : "dark", `l${i % 4}`)), { windowSeconds: 60 });
  assert.equal(report.issues.filter((x) => x.kind === "low variety").length, 0);
  assert.equal(report.summary.contextShare, 0.25);
  assert.equal(report.summary.longestDarkRunSeconds, 30);
  assert.equal(report.summary.categorySwitchesPerMinute, 5.5);
});

test("run findings escalate at twice their threshold and record the measured span", () => {
  const long = analyze(Array.from({ length: 5 }, (_, i) => shot(`d${i}`, i * 11, (i + 1) * 11, "visual metaphor", "dark", "metaphor")));
  const finding = long.issues.find((x) => x.kind === "repeated background");
  assert.equal(finding.severity, "high");
  assert.equal(finding.diagnostic.measuredSeconds, 55);
  assert.equal(finding.diagnostic.thresholdSeconds, 25);
  const short = analyze(Array.from({ length: 3 }, (_, i) => shot(`d${i}`, i * 10, (i + 1) * 10, "visual metaphor", "dark", "metaphor")));
  assert.equal(short.issues.find((x) => x.kind === "repeated background").severity, "medium");
});

test("a present but tiny source line still counts as a source-qualification finding", () => {
  const report = analyze([{ ...shot("figure", 0, 8, "data visualization", "dark", "chart"), sourceQualified: true }], {
    frameObservations: [{ shotId: "figure", second: 6, essentialTextPxOn640: 14, sourcePresent: true, sourceClipped: false, sourceTextPxOn640: 6.5 }],
  });
  const finding = report.issues.find((x) => x.kind === "source qualification");
  assert.equal(finding.diagnostic.minimumSourcePx, 6.5);
  assert.equal(report.issues.filter((x) => x.kind === "mobile text").length, 0);
});

test("splice continuity flags a picture jump at an edit point but not a continuous one", (t) => {
  if (spawnSync("ffmpeg", ["-version"]).status !== 0) { t.skip("ffmpeg not installed"); return; }
  const { boundaryContinuity } = require("../../scripts/profitdecoded/motion/visual-metrics");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pd-splice-test-"));
  try {
    const file = path.join(dir, "jump.mp4");
    const made = spawnSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "color=c=black:s=160x90:r=30:d=1",
      "-vf", "drawbox=x=0:y=0:w=160:h=90:color=white:t=fill:enable='gte(n,15)'", "-c:v", "libx264", "-pix_fmt", "yuv420p", file]);
    assert.equal(made.status, 0);
    const result = boundaryContinuity(file, [10, 15]);
    assert.deepEqual(result.flagged.map((p) => p.frame), [15]);
    assert.ok(result.points.find((p) => p.frame === 10).ratio < 1.5);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("the automated renderer's plan types map onto the same editorial roles", () => {
  const { fromPlanShot } = require("../../core/profitdecoded/visual-diversity");
  const filing = fromPlanShot({ type: "filing-excerpt", motion: "highlight-pulse", evidenceClaimId: "c3", overlayText: "Membership fees" }, { id: "001-b1", start: 0, end: 6 });
  assert.equal(filing.category, "financial evidence");
  assert.equal(filing.background, "paper");
  assert.equal(filing.sourceQualified, true);
  assert.equal(fromPlanShot({ type: "typography" }, { id: "t", start: 0, end: 1 }).textWeight, "high");
  assert.equal(fromPlanShot({ type: "something-new" }, { id: "x", start: 0, end: 1 }).category, "motion graphic");
});

test("the automated renderer reads phone text sizes from its frame arguments and writes an advisory report", () => {
  const R = require("../../scripts/profitdecoded/render");
  const args = ["-size", "3840x2160", "xc:#000", "-font", "Serif", "-fill", "#fff", "-pointsize", 96, "-gravity", "center", "-annotate", "+0+0", "$10.4B",
    "-pointsize", 56, "-gravity", "southwest", "-annotate", "+88+104", "Source: Costco 10-K", "-pointsize", 60, "-gravity", "northwest", "-annotate", "+88+88", "PROFITDECODED"];
  const obs = R.textObservation(args, "001-b1", 4, "Source: Costco 10-K");
  assert.equal(obs.essentialTextPxOn640, 19.2);
  assert.equal(obs.sourceTextPxOn640, 11.2);
  assert.equal(obs.sourcePresent, true);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pd-render-diag-"));
  try {
    const shots = [0, 1, 2].map((i) => ({ id: `s${i}`, start: i * 12, end: (i + 1) * 12, category: "data visualization", background: "dark", layout: "chart", textWeight: "low", motion: "push-in" }));
    const report = R.diagnose(shots, [obs], dir, null);
    assert.ok(report.issues.some((x) => x.kind === "chart-heavy run"));
    assert.match(fs.readFileSync(path.join(dir, "visual-diversity.md"), "utf8"), /chart-heavy run/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
