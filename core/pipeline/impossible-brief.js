"use strict";

const fs = require("fs");
const path = require("path");
const cp = require("child_process");
const Channel = require("../channel-context");
const Discovery = require("../discovery");
const Rendering = require("../rendering");

function writeCompatibilityFiles(result, topic, channel) {
  const directory = result.outputDirectory;
  const metadata = JSON.parse(fs.readFileSync(path.join(directory, "metadata.json"), "utf8"));
  fs.writeFileSync(path.join(directory, "konu.json"), JSON.stringify({
    slug: topic.slug,
    channel: channel.slug,
    format: "short",
    baslik: metadata.title,
    aciklama: metadata.description,
    etiketler: metadata.tags,
    bilim: topic.claimFramework,
    sahneler: result.validations.visuals ? JSON.parse(fs.readFileSync(path.join(directory, "visuals.json"), "utf8")).map((scene) => ({ metin: scene.subject, sentetik: scene.evidenceLabel === "ILLUSTRATION" })) : [],
  }, null, 2) + "\n");
  fs.writeFileSync(path.join(directory, "YUKLEME.json"), JSON.stringify({ baslik: metadata.title, aciklama: metadata.description, etiketler: metadata.tags }, null, 2) + "\n");
  if (result.render.completed) {
    const videoDirectory = path.join(directory, "Videos");
    fs.mkdirSync(videoDirectory, { recursive: true });
    const target = path.join(videoDirectory, topic.slug + ".mp4");
    fs.copyFileSync(result.render.video.file, target);
  }
  const packageDirectory = path.join(channel.paths.packages, topic.slug);
  fs.mkdirSync(packageDirectory, { recursive: true });
  for (const file of ["quality-gate.json", "render.json", "titles.json", "metadata.json", "sources.json", "thumbnail.json"]) {
    const source = path.join(directory, file);
    if (fs.existsSync(source)) fs.copyFileSync(source, path.join(packageDirectory, file));
  }
  const thumbnail = path.join(directory, "thumbnail.jpg");
  if (fs.existsSync(thumbnail)) fs.copyFileSync(thumbnail, path.join(packageDirectory, "onizleme.jpg"));
}

function writeValidationEvidence(result, topic, channel, output) {
  const failed = Object.entries(result.validations).filter(([, passed]) => !passed).map(([name]) => name);
  const evidence = {
    channel: channel.slug,
    topicId: topic.id,
    slug: topic.slug,
    passed: failed.length === 0,
    failed,
    checks: result.validations,
  };
  fs.writeFileSync(path.join(output, "validations.json"), JSON.stringify(evidence, null, 2) + "\n");
  return evidence;
}

function main(argv = []) {
  const channel = Channel.getChannel("impossible-brief");
  const explicit = argv.find((arg) => !arg.startsWith("--"));
  if (!explicit && process.env.PUBLISH === "1") {
    const due = require("../scheduling").channelPlan(channel).short;
    if (!due.due) { console.log(`[${channel.name}] Takvim: henuz degil`); return 0; }
  }
  const topic = explicit
    ? Discovery.universe(channel).topics.find((item) => item.slug === explicit || item.id === explicit)
    : Discovery.discover(channel, { limit: 1 })[0];
  if (!topic) throw new Error(explicit ? "ImpossibleBrief topic not found: " + explicit : "No qualified unused ImpossibleBrief topic remains");
  const noRender = argv.includes("--no-render");
  const output = path.join(channel.paths.production, topic.slug);
  const result = Rendering.buildPackage(topic, channel, output, { render: !noRender });
  const validationEvidence = writeValidationEvidence(result, topic, channel, output);
  if (!validationEvidence.passed) throw new Error("ImpossibleBrief package failed quality validation: " + validationEvidence.failed.join(", "));
  writeCompatibilityFiles(result, topic, channel);
  if (process.env.PUBLISH === "1") {
    if (!result.render.completed || !result.render.audio.syntheticVoice) throw new Error("Publishing blocked: a real synthetic narration render is required");
    const upload = cp.spawnSync(process.execPath, [path.join(Channel.ROOT, "youtube-yukle.js"), "--channel", channel.slug, topic.slug], { cwd: Channel.ROOT, stdio: "inherit", env: process.env });
    if (upload.status !== 0) throw new Error("ImpossibleBrief upload failed; generated state was not advanced");
  }
  const generatedFile = path.join(channel.paths.state, "generated.json");
  const generated = (() => { try { return JSON.parse(fs.readFileSync(generatedFile, "utf8")); } catch (error) { return []; } })();
  if (!generated.some((item) => item.topicId === topic.id)) generated.push({ topicId: topic.id, slug: topic.slug, generatedAt: new Date().toISOString(), uploaded: process.env.PUBLISH === "1" });
  fs.writeFileSync(generatedFile, JSON.stringify(generated, null, 2) + "\n");
  console.log(`[${channel.name}] ${topic.topic} — ${noRender ? "package only" : "rendered"}${process.env.PUBLISH === "1" ? " and uploaded" : "; upload skipped"}`);
  return 0;
}

module.exports = { writeCompatibilityFiles, writeValidationEvidence, main };
