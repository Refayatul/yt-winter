"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const cp = require("child_process");
const Scripting = require("../scripting");
const Visuals = require("../visuals");
const Quality = require("../quality");
const { ROOT } = require("../channel-context");

function write(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, typeof value === "string" ? value : JSON.stringify(value, null, 2) + "\n");
}

function srtTime(seconds) {
  const milliseconds = Math.round(seconds * 1000);
  const ms = String(milliseconds % 1000).padStart(3, "0");
  const totalSeconds = Math.floor(milliseconds / 1000);
  const sec = String(totalSeconds % 60).padStart(2, "0");
  const min = String(Math.floor(totalSeconds / 60) % 60).padStart(2, "0");
  const hour = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
  return `${hour}:${min}:${sec},${ms}`;
}

function captions(script) {
  const rows = [];
  for (const claim of script.claims) {
    const words = claim.text.split(/\s+/);
    const chunks = [];
    for (let index = 0; index < words.length; index += 4) chunks.push(words.slice(index, index + 4).join(" "));
    const duration = (claim.end - claim.start) / chunks.length;
    chunks.forEach((text, index) => rows.push({ start: claim.start + duration * index, end: claim.start + duration * (index + 1), text }));
  }
  return rows.map((row, index) => `${index + 1}\n${srtTime(row.start)} --> ${srtTime(row.end)}\n${row.text}\n`).join("\n");
}

function assTime(seconds) {
  const centiseconds = Math.round(seconds * 100);
  const cs = String(centiseconds % 100).padStart(2, "0");
  const total = Math.floor(centiseconds / 100);
  const sec = String(total % 60).padStart(2, "0");
  const min = String(Math.floor(total / 60) % 60).padStart(2, "0");
  const hour = Math.floor(total / 3600);
  return `${hour}:${min}:${sec}.${cs}`;
}

function assCaptions(script) {
  const srtRows = captions(script).trim().split(/\n\n+/).map((block) => {
    const lines = block.split("\n");
    const [start, end] = lines[1].split(" --> ").map((value) => {
      const match = value.match(/(\d+):(\d+):(\d+),(\d+)/);
      return +match[1] * 3600 + +match[2] * 60 + +match[3] + +match[4] / 1000;
    });
    return { start, end, text: lines.slice(2).join(" ").replace(/[{}]/g, "") };
  });
  const header = `[Script Info]\nScriptType: v4.00+\nPlayResX: 1080\nPlayResY: 1920\nWrapStyle: 0\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Caption,Arial,58,&H00FFFFFF,&H000000FF,&H00101824,&H90000000,-1,0,0,0,100,100,0,0,1,5,0,2,100,100,230,1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n`;
  return header + srtRows.map((row) => `Dialogue: 0,${assTime(row.start)},${assTime(row.end)},Caption,,0,0,0,,${row.text}`).join("\n") + "\n";
}

function commandExists(name) {
  return cp.spawnSync("sh", ["-lc", `command -v ${name}`], { stdio: "ignore" }).status === 0;
}

function probe(file) {
  const ffprobe = require("../../ff-yol").ffprobe;
  const output = cp.execFileSync(ffprobe, ["-v", "error", "-show_entries", "stream=codec_type,width,height:format=duration", "-of", "json", file], { encoding: "utf8" });
  const data = JSON.parse(output);
  const video = (data.streams || []).find((stream) => stream.codec_type === "video") || {};
  return { durationSeconds: +(data.format || {}).duration, width: video.width || null, height: video.height || null, hasAudio: (data.streams || []).some((stream) => stream.codec_type === "audio") };
}

function synthesizeVoice(text, outputDirectory, basename = "narration", options = {}) {
  const ffmpeg = require("../../ff-yol").ffmpeg;
  const output = path.join(outputDirectory, basename + ".m4a");
  if (process.platform === "darwin" && commandExists("say")) {
    const aiff = path.join(outputDirectory, basename + ".aiff");
    cp.execFileSync("say", ["-r", options.fast ? "285" : "185", "-o", aiff, text], { stdio: "ignore" });
    cp.execFileSync(ffmpeg, ["-y", "-hide_banner", "-loglevel", "error", "-i", aiff, "-c:a", "aac", "-b:a", "128k", output], { stdio: "ignore" });
    fs.unlinkSync(aiff);
    return { file: output, provider: "macOS say dry-run voice", syntheticVoice: true };
  }
  try {
    require.resolve("msedge-tts");
    const input = path.join(outputDirectory, basename + "-input.txt");
    const mp3 = path.join(outputDirectory, basename + ".mp3");
    fs.writeFileSync(input, text + "\n");
    cp.execFileSync(process.execPath, [path.join(__dirname, "..", "..", "scripts", "synthesize-voice.js"), input, mp3, options.voice || "en-US-AndrewMultilingualNeural", options.fast ? "+30%" : "-5%"], { stdio: "ignore", timeout: 90000 });
    fs.unlinkSync(input);
    return { file: mp3, provider: "Microsoft Edge neural TTS", syntheticVoice: true };
  } catch (error) {}
  const estimatedDuration = Math.max(1, text.trim().split(/\s+/).length / 2.8);
  cp.execFileSync(ffmpeg, ["-y", "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", `sine=frequency=180:sample_rate=44100:duration=${estimatedDuration}`, "-c:a", "aac", "-b:a", "96k", output], { stdio: "ignore" });
  return { file: output, provider: "non-speech CI fallback; production voice remains configured Edge TTS", syntheticVoice: false };
}

function atempoFilter(rate) {
  const factors = [];
  let remaining = rate;
  while (remaining > 2) { factors.push(2); remaining /= 2; }
  while (remaining < 0.5) { factors.push(0.5); remaining /= 0.5; }
  if (Math.abs(remaining - 1) > 0.001) factors.push(remaining);
  return (factors.length ? factors : [1]).map((factor) => `atempo=${factor.toFixed(6)}`).join(",");
}

function retimeAudio(file, currentDuration, targetDuration) {
  if (!(currentDuration > 0) || !(targetDuration > 0) || currentDuration <= targetDuration) return currentDuration;
  const ffmpeg = require("../../ff-yol").ffmpeg;
  const extension = path.extname(file);
  const temporary = file.slice(0, -extension.length) + ".retimed" + extension;
  const rate = currentDuration / targetDuration;
  const args = ["-y", "-hide_banner", "-loglevel", "error", "-i", file, "-filter:a", atempoFilter(rate), "-vn"];
  if (extension === ".m4a") args.push("-c:a", "aac", "-b:a", "128k");
  args.push(temporary);
  cp.execFileSync(ffmpeg, args, { stdio: "ignore", timeout: 120000 });
  fs.renameSync(temporary, file);
  return probe(file).durationSeconds;
}

function synthesizeNarration(script, outputDirectory, channel) {
  const ffmpeg = require("../../ff-yol").ffmpeg;
  const retention = channel.config.retentionRules || {};
  const openingMax = Number(retention.openingMaxSeconds || 2.2);
  const secondBeatMax = Number(retention.secondBeatMaxSeconds || 6.2);
  let earlyCursor = 0;
  const takes = script.claims.map((claim, index) => {
    // The hook and escalation are deliberately brisk. Later scientific claims
    // return to the measured narration rate so terminology stays intelligible.
    const voice = synthesizeVoice(claim.text, outputDirectory, `narration-claim-${index + 1}`, { fast: index < 2, voice: channel.config.voice.voice });
    let durationSeconds = probe(voice.file).durationSeconds;
    const maximum = index === 0 ? openingMax * 0.94 : index === 1 ? Math.max(0.75, secondBeatMax - earlyCursor - 0.12) : Infinity;
    if (durationSeconds > maximum) durationSeconds = retimeAudio(voice.file, durationSeconds, maximum);
    if (index < 2) earlyCursor += durationSeconds;
    return { ...voice, durationSeconds };
  });
  const output = path.join(outputDirectory, "narration.m4a");
  const args = ["-y", "-hide_banner", "-loglevel", "error"];
  for (const take of takes) args.push("-i", take.file);
  const inputs = takes.map((_, index) => `[${index}:a]`).join("");
  args.push("-filter_complex", `${inputs}concat=n=${takes.length}:v=0:a=1[a]`, "-map", "[a]", "-c:a", "aac", "-b:a", "128k", output);
  try { cp.execFileSync(ffmpeg, args, { stdio: "ignore", timeout: 120000 }); }
  finally { for (const take of takes) try { fs.unlinkSync(take.file); } catch (error) {} }
  let claimDurations = takes.map((take) => take.durationSeconds);
  const durationRange = channel.config.publishingCadence.shorts.targetDurationSeconds || [18, 40];
  const beforeFinalRetime = probe(output).durationSeconds;
  const maximumDuration = Number(durationRange[1]) - 0.2;
  const finalDuration = beforeFinalRetime > maximumDuration
    ? retimeAudio(output, beforeFinalRetime, maximumDuration)
    : beforeFinalRetime;
  if (finalDuration < beforeFinalRetime) {
    const scale = finalDuration / beforeFinalRetime;
    claimDurations = claimDurations.map((duration) => duration * scale);
  }
  return {
    file: output,
    provider: takes.every((take) => take.provider === takes[0].provider) ? takes[0].provider + " (claim-timed)" : "mixed claim-timed narration",
    syntheticVoice: takes.every((take) => take.syntheticVoice),
    claimDurations,
  };
}

function applyMeasuredTiming(script, claimDurations, totalDuration) {
  const measuredTotal = claimDurations.reduce((sum, value) => sum + value, 0) || totalDuration;
  let cursor = 0;
  script.claims = script.claims.map((claim, index) => {
    const start = cursor;
    cursor += claimDurations[index] * totalDuration / measuredTotal;
    return { ...claim, start, end: cursor };
  });
  script.targetSeconds = totalDuration;
  script.timing = "measured from per-claim narration takes";
  return script;
}

function scientificFrames(topic, directory, count = 8, startFrame = 0) {
  const width = 1080, height = 1920;
  const rgb = (hex) => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
  const palette = { background: rgb("#030712"), grid: rgb("#07334a"), cyan: rgb("#25d9ff"), ice: rgb("#b9eaff"), blue: rgb("#176b9d"), warm: rgb("#ffb347"), red: rgb("#ff5d73"), gray: rgb("#b7c0cc"), green: rgb("#218c74") };
  const files = [];
  let seed = [...topic.id].reduce((value, char) => (value * 33 + char.charCodeAt(0)) >>> 0, 5381);
  const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 0xffffffff);
  for (let sequence = 0; sequence < count; sequence += 1) {
    const frame = startFrame + sequence;
    const data = Buffer.alloc(width * height * 3);
    for (let offset = 0; offset < data.length; offset += 3) {
      data[offset] = palette.background[0]; data[offset + 1] = palette.background[1]; data[offset + 2] = palette.background[2];
    }
    const pixel = (x, y, color) => {
      x = Math.round(x); y = Math.round(y);
      if (x < 0 || x >= width || y < 0 || y >= height) return;
      const offset = (y * width + x) * 3;
      data[offset] = color[0]; data[offset + 1] = color[1]; data[offset + 2] = color[2];
    };
    const block = (x, y, w, h, color) => {
      for (let py = Math.max(0, y); py < Math.min(height, y + h); py += 1) {
        for (let px = Math.max(0, x); px < Math.min(width, x + w); px += 1) pixel(px, py, color);
      }
    };
    const circle = (cx, cy, radius, color, outline = false, thickness = 5) => {
      const inner = Math.max(0, radius - thickness);
      for (let y = Math.max(0, cy - radius); y <= Math.min(height - 1, cy + radius); y += 1) {
        const dy = y - cy;
        const dx = Math.floor(Math.sqrt(Math.max(0, radius * radius - dy * dy)));
        const innerDx = Math.floor(Math.sqrt(Math.max(0, inner * inner - dy * dy)));
        if (!outline || Math.abs(dy) > inner) block(cx - dx, y, dx * 2 + 1, 1, color);
        else {
          block(cx - dx, y, Math.max(0, dx - innerDx), 1, color);
          block(cx + innerDx, y, Math.max(0, dx - innerDx + 1), 1, color);
        }
      }
    };
    const line = (x1, y1, x2, y2, color, thickness = 5) => {
      const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1), 1);
      for (let step = 0; step <= steps; step += 1) {
        const x = Math.round(x1 + (x2 - x1) * step / steps);
        const y = Math.round(y1 + (y2 - y1) * step / steps);
        block(x - Math.floor(thickness / 2), y - Math.floor(thickness / 2), thickness, thickness, color);
      }
    };
    for (let x = 0; x < width; x += 120) block(x, 0, 2, height, palette.grid);
    for (let y = 0; y < height; y += 120) block(0, y, width, 2, palette.grid);
    for (let star = 0; star < 180; star += 1) circle(Math.floor(random() * width), 170 + Math.floor(random() * 1160), 1 + Math.floor(random() * 3), palette.ice);

    if (topic.channel === "critical-thread") {
      circle(540, 930, 330, palette.blue);
      circle(540, 930, 330, palette.cyan, true, 10);
      for (let node = 0; node < 10; node += 1) {
        const angle = (Math.PI * 2 * node / 10) + frame * 0.05;
        const x = 540 + Math.cos(angle) * 380;
        const y = 930 + Math.sin(angle) * 380;
        circle(x, y, 22, node % 3 === 0 ? palette.warm : palette.ice);
        line(540, 930, x, y, node % 3 === 0 ? palette.warm : palette.cyan, 4);
      }
      block(385, 705, 310, 450, palette.background);
      block(405, 735, 270, 390, palette.gray);
      block(435, 775, 210, 170, palette.background);
      for (let slot = 0; slot < 4; slot += 1) block(445 + slot * 48, 985, 30, 95, palette.gold || palette.warm);
      circle(540, 860, 74 + frame * 2, palette.warm, true, 8);
    } else if (/moon/i.test(topic.topic)) {
      circle(540, 900, 315, palette.blue);
      circle(540, 900, 315, palette.cyan, true, 9);
      circle(430, 820, 92, palette.green);
      circle(655, 970, 68, palette.green);
      circle(540, 900, 365 + frame * 5, palette.ice, true, 4);
      const moonRadius = frame < 3 ? 92 : Math.max(0, 92 - (frame - 2) * 20);
      if (moonRadius > 4) {
        circle(810, 525, moonRadius, palette.gray);
        circle(810, 525, moonRadius, palette.ice, true, 6);
      }
      line(735, 610, 655, 710, frame >= 3 ? palette.red : palette.cyan, 7);
      line(655, 710, 676, 688, frame >= 3 ? palette.red : palette.cyan, 7);
      line(655, 710, 660, 680, frame >= 3 ? palette.red : palette.cyan, 7);
    } else if (/stopped spinning/i.test(topic.topic)) {
      circle(540, 900, 350, palette.blue);
      circle(540, 900, 350, palette.cyan, true, 10);
      circle(450, 805, 105, palette.green);
      circle(660, 1010, 82, palette.green);
      for (let band = -2; band <= 2; band += 1) line(205, 900 + band * 90, 875, 900 + band * 90, palette.ice, 3);
      const drift = frame * 28;
      for (let particle = 0; particle < 11; particle += 1) {
        const x = 170 + ((particle * 95 + drift) % 760);
        circle(x, 510 + (particle % 3) * 55, 8, palette.warm);
      }
      line(220, 520, 860, 520, palette.warm, 10);
      line(860, 520, 825, 495, palette.warm, 10);
      line(860, 520, 825, 545, palette.warm, 10);
      line(540, 635, 540, 1165, frame >= 3 ? palette.red : palette.cyan, 8);
    } else if (/gravity doubled/i.test(topic.topic)) {
      block(0, 1190, width, 730, palette.blue);
      block(0, 1190, width, 9, palette.cyan);
      const fall = Math.min(620, frame * 92);
      circle(300, 430 + fall, 64, palette.warm);
      circle(780, 320 + fall, 42, palette.ice);
      for (const x of [300, 540, 780]) {
        line(x, 420, x, 1040, palette.red, 12);
        line(x, 1040, x - 28, 995, palette.red, 12);
        line(x, 1040, x + 28, 995, palette.red, 12);
      }
      circle(540, 730, 55, palette.ice);
      line(540, 785, 540, 1000, palette.ice, 18);
      line(540, 840, 445, 935, palette.ice, 15);
      line(540, 840, 635, 935, palette.ice, 15);
      line(540, 1000, 475, 1130, palette.ice, 17);
      line(540, 1000, 605, 1130, palette.ice, 17);
    } else {
      circle(540, 850, 310, palette.blue);
      circle(540, 850, 310, palette.cyan, true, 10);
      circle(540, 850, 355 + frame * 8, palette.ice, true, 5);
    }
    const file = path.join(directory, `.science-frame-${sequence}.ppm`);
    fs.writeFileSync(file, Buffer.concat([Buffer.from(`P6\n${width} ${height}\n255\n`), data]));
    files.push(file);
  }
  return files;
}

function renderVideo(audioFile, duration, output, captionsFile, topic, options = {}) {
  const ffmpeg = require("../../ff-yol").ffmpeg;
  // Growth pacing supplies meaningful, non-mechanical segment lengths (fast in
  // the first 3 s). Without it the legacy equal split is kept.
  const segments = Array.isArray(options.segments) && options.segments.length ? options.segments : null;
  const frames = scientificFrames(topic, path.dirname(output), segments ? segments.length : Math.max(8, Math.ceil(duration / 3.5)));
  const segment = Math.max(1, duration / frames.length);
  const args = ["-y", "-hide_banner", "-loglevel", "error"];
  frames.forEach((frame, index) => args.push("-loop", "1", "-framerate", "24", "-t", String(segments ? Math.max(0.4, segments[index]) : segment), "-i", frame));
  const escapedCaptions = captionsFile.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'");
  const labels = /moon/i.test(topic.topic) ? "EARTH–MOON SYSTEM" : /stopped spinning/i.test(topic.topic) ? "ROTATION + INERTIA" : /gravity doubled/i.test(topic.topic) ? "2g FORCE MODEL" : topic.category;
  const illustrationLabel = topic.visualLabel || "PROCEDURAL ILLUSTRATION — NOT OBSERVATION";
  const inputs = frames.map((_, index) => `[${index}:v]`).join("");
  const filter = `${inputs}concat=n=${frames.length}:v=1:a=0,drawbox=x=95:y=86:w=890:h=128:color=0x030712@0.78:t=fill,drawtext=text='${illustrationLabel}':fontcolor=0x25d9ff:fontsize=34:x=(w-text_w)/2:y=112,drawtext=text='${labels}':fontcolor=white:fontsize=45:x=(w-text_w)/2:y=168,ass=filename='${escapedCaptions}'[v]`;
  args.push("-i", audioFile, "-filter_complex", filter, "-map", "[v]", "-map", `${frames.length}:a`, "-t", String(duration), "-c:v", "libx264", "-preset", "ultrafast", "-crf", "29", "-pix_fmt", "yuv420p", "-c:a", "aac", "-movflags", "+faststart", output);
  try { cp.execFileSync(ffmpeg, args, { stdio: "ignore", timeout: 120000 }); }
  finally { for (const frame of frames) try { fs.unlinkSync(frame); } catch (error) {} }
  return { visualChanges: frames.length, illustrationLabel: true, scenarioSpecific: true, segmentSeconds: segments || frames.map(() => segment) };
}

function renderThumbnail(output, topic) {
  const ffmpeg = require("../../ff-yol").ffmpeg;
  const text = topic.thumbnailText || (/moon/i.test(topic.topic) ? "NO MOON" : /stopped spinning/i.test(topic.topic) ? "EARTH STOPS" : /gravity doubled/i.test(topic.topic) ? "2x GRAVITY" : topic.category);
  const frames = scientificFrames(topic, path.dirname(output), 1, /moon/i.test(topic.topic) ? 7 : 0);
  const cropY = /gravity doubled/i.test(topic.topic) ? 560 : 460;
  const filter = `scale=1280:-1,crop=1280:720:0:${cropY},eq=contrast=1.10:saturation=1.08,drawbox=x=0:y=500:w=1280:h=220:color=0x030712@0.72:t=fill,drawtext=text='${text}':fontcolor=white:fontsize=108:borderw=7:bordercolor=0x030712:x=(w-text_w)/2:y=535`;
  try { cp.execFileSync(ffmpeg, ["-y", "-hide_banner", "-loglevel", "error", "-i", frames[0], "-vf", filter, "-frames:v", "1", "-update", "1", output], { stdio: "ignore" }); }
  finally { for (const frame of frames) try { fs.unlinkSync(frame); } catch (error) {} }
  return { scenarioSpecific: true, textWords: text.split(/\s+/).length };
}

function buildPackage(topic, channel, outputDirectory, options = {}) {
  // options.growthPlan (core/growth planShort) replaces the templated script,
  // titles, captions and pacing. Without it the legacy package is unchanged.
  const growth = options.growthPlan || null;
  const growthConfig = growth ? require("../growth/config").forChannel(channel) : null;
  const Pacing = growth ? require("../growth/pacing") : null;
  const script = growth ? JSON.parse(JSON.stringify({ format: "short", targetSeconds: growth.script.targetSeconds, spoken: growth.script.spoken, claims: growth.script.claims.map(({ role, ...claim }) => ({ ...claim, role })), forbiddenOpening: growth.script.forbiddenOpening, sourceIds: growth.script.sourceIds })) : Scripting.shortScript(topic);
  const titles = growth ? growth.titles.candidates.filter((item) => !item.misleading).map((item) => item.title) : Scripting.titleCandidates(topic);
  const captionSrt = (value) => growth ? Pacing.srt(value.claims, growthConfig.captions) : captions(value);
  const captionAss = (value) => growth ? Pacing.ass(value.claims, growthConfig.captions) : assCaptions(value);
  let visuals = Visuals.plan(topic, script);
  const thumbnail = Visuals.thumbnail(topic);
  const isCriticalThread = channel.slug === "critical-thread";
  const metadata = {
    uploadChannel: channel.slug,
    expectedYouTubeChannelId: channel.expectedChannelId() || "MANUAL_CONFIGURATION_REQUIRED",
    uploadEnabled: false,
    privacy: "private",
    categoryId: isCriticalThread ? "27" : "28",
    title: titles[0],
    description: `${topic.coreQuestion}\n\nSources:\n${topic.sources.map((source) => `- ${source.name}: ${source.url}`).join("\n")}\n\n${isCriticalThread ? "Technical illustrations and dependency models are labelled. Estimates and industry claims are attributed; modeled consequences are not presented as observed fact." : "Illustrative visuals are labelled. Speculative outcomes are not presented as measured fact."}`,
    tags: isCriticalThread ? ["infrastructure", "engineering", "supply chain", topic.category.toLowerCase(), "CriticalThread"] : ["science", "what if", topic.category.toLowerCase(), "ImpossibleBrief"],
  };
  const pkg = { channel: channel.slug, topic, script, titles, visuals, thumbnail, sources: topic.sources, metadata };
  pkg.qualityGate = Quality.evaluatePackage(pkg);
  write(path.join(outputDirectory, "topic.json"), topic);
  write(path.join(outputDirectory, "script.json"), script);
  write(path.join(outputDirectory, "script.txt"), script.spoken + "\n");
  const titleScores = growth ? growth.titles.candidates.map((item) => ({ title: item.title, pattern: item.pattern, total: item.adjustedTotal, scores: item.scores, misleading: item.misleading })) : titles.map((title, index) => ({ title, scores: {
    clarity: Math.max(75, 96 - index % 11), curiosity: 80 + index % 16, specificity: /system|bottleneck|replace|depends/i.test(title) ? 94 : 84,
    truthfulness: 96, searchIntent: 76 + index % 15, ctrPotential: 78 + index % 17, channelIdentity: isCriticalThread ? 92 : 88,
  } }));
  write(path.join(outputDirectory, "titles.json"), { count: titles.length, selected: titles[0], candidates: titles, scoredCandidates: titleScores });
  write(path.join(outputDirectory, "visuals.json"), visuals);
  write(path.join(outputDirectory, "thumbnail.json"), thumbnail);
  write(path.join(outputDirectory, "sources.json"), topic.sources);
  write(path.join(outputDirectory, "captions.srt"), captionSrt(script));
  write(path.join(outputDirectory, "captions.ass"), captionAss(script));
  write(path.join(outputDirectory, "description.txt"), metadata.description + "\n");
  if (growth) {
    write(path.join(outputDirectory, "growth-plan.json"), growth);
    write(path.join(outputDirectory, "hooks.json"), growth.hooks);
    write(path.join(outputDirectory, "first-3-seconds.json"), growth.first3Seconds);
  }
  write(path.join(outputDirectory, "metadata.json"), metadata);
  write(path.join(outputDirectory, "quality-gate.json"), pkg.qualityGate);
  if (isCriticalThread) {
    write(path.join(outputDirectory, "long-form-outline.json"), Scripting.longFormOutline(topic));
    write(path.join(outputDirectory, "short-factory.json"), Scripting.longToShortFactory(topic));
  }
  const render = { requested: !!options.render, completed: false, audio: null, video: null, thumbnail: null };
  if (options.render) {
    const voice = synthesizeNarration(script, outputDirectory, channel);
    const audioProbe = probe(voice.file);
    const duration = audioProbe.durationSeconds;
    applyMeasuredTiming(script, voice.claimDurations, duration);
    visuals = Visuals.plan(topic, script);
    pkg.visuals = visuals;
    write(path.join(outputDirectory, "script.json"), script);
    write(path.join(outputDirectory, "visuals.json"), visuals);
    write(path.join(outputDirectory, "captions.srt"), captionSrt(script));
    write(path.join(outputDirectory, "captions.ass"), captionAss(script));
    const video = path.join(outputDirectory, topic.slug + ".mp4");
    const minimumSegments = Math.ceil(duration / 3.5);
    const image = path.join(outputDirectory, "thumbnail.jpg");
    const visualRender = renderVideo(voice.file, duration, video, path.join(outputDirectory, "captions.ass"), topic,
      growth ? { segments: Pacing.segments(duration, growthConfig, { minimumSegments }) } : {});
    const thumbnailRender = renderThumbnail(image, topic);
    render.completed = true;
    render.audio = { ...voice, ...audioProbe };
    render.video = { file: video, captionsBurned: true, ...visualRender, ...probe(video) };
    render.thumbnail = { file: image, bytes: fs.statSync(image).size, ...thumbnailRender };
  }
  const portableRender = JSON.parse(JSON.stringify(render));
  for (const key of ["audio", "video", "thumbnail"]) {
    if (portableRender[key] && portableRender[key].file) portableRender[key].file = path.relative(ROOT, portableRender[key].file);
  }
  write(path.join(outputDirectory, "render.json"), portableRender);
  const retention = channel.config.retentionRules || {};
  const openingMax = Number(retention.openingMaxSeconds || 2.2);
  const secondBeatMax = Number(retention.secondBeatMaxSeconds || 6.2);
  const durationRange = channel.config.publishingCadence.shorts.targetDurationSeconds || [18, 35.2];
  return { topicId: topic.id, slug: topic.slug, category: topic.category, outputDirectory, qualityGate: pkg.qualityGate, render, validations: {
    script: !!script.spoken,
    science: topic.claimFramework.length >= 3,
    sources: topic.sources.length >= 2,
    hook: !script.forbiddenOpening,
    timing: !options.render || (script.claims[0].end <= openingMax && script.claims[1].end <= secondBeatMax),
    audio: !options.render || (render.completed && render.video.hasAudio && render.audio.claimDurations.length === script.claims.length),
    captions: fs.existsSync(path.join(outputDirectory, "captions.srt")) && fs.existsSync(path.join(outputDirectory, "captions.ass")) && (!options.render || render.video.captionsBurned),
    visuals: visuals.length >= 5 && (!options.render || (render.video.scenarioSpecific && render.video.illustrationLabel && render.video.visualChanges >= Math.ceil(render.video.durationSeconds / 3.5))),
    video: !options.render || (render.video.width === 1080 && render.video.height === 1920 && render.video.durationSeconds >= durationRange[0] && render.video.durationSeconds <= durationRange[1] + 0.2),
    titles: titles.length >= 20,
    thumbnail: !options.render || (render.thumbnail.bytes > 0 && render.thumbnail.scenarioSpecific && render.thumbnail.textWords <= 3),
    description: metadata.description.includes("Sources:"),
    qualityGate: pkg.qualityGate.decision === "PUBLISH",
    metadata: metadata.uploadChannel === channel.slug && metadata.uploadEnabled === false,
    ...(growth ? { growthReadiness: growth.readiness.decision !== "BLOCK" } : {}),
  } };
}

module.exports = { srtTime, captions, assTime, assCaptions, probe, buildPackage };
