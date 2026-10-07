#!/usr/bin/env node
"use strict";

// Imports a YouTube Studio Advanced-mode export (the "Table data.csv" inside
// the downloaded zip) into each video's studio-manual.json, so the metrics the
// APIs do not expose reach analytics, diagnosis and learning:
//   impressions, impressions CTR, returning viewers and — for Shorts — the
//   share of viewers who stayed to watch instead of swiping away.
// Values are copied, never estimated; a column Studio did not export is left
// out. Existing manual entries are kept and updated.
//
//   node scripts/studio-import.js --channel <slug> "<path to Table data.csv>" [--date YYYY-MM-DD]

const fs = require("fs");
const path = require("path");
const Channel = require("../core/channel-context");

// English and Turkish Studio column names (Studio exports in its UI language).
const COLUMNS = {
  id: /^(content|video id|video|İçerik|içerik|video kimliği)$/iu,
  impressions: /^(impressions|gösterimler|gösterim sayısı|gösterim)$/iu,
  ctr: /^(impressions click-through rate|gösterimlerin tıklama oranı|gösterim tıklama oranı|tıklama oranı)/iu,
  returningViewers: /^(returning viewers|geri gelen izleyiciler|geri dönen izleyiciler)$/iu,
  stayedToWatch: /stayed to watch|viewed \(vs\.? swiped away\)|viewed vs\.? swiped|izlemeye devam|izlemek için kal|izlendi.*kaydır|kaydırılmadan|izlenen.*kaydırılan/iu,
};

function parseCsv(text) {
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i += 1; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i += 1;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

// Counts (impressions, returning viewers) are integers, so "12,345" and
// "12.345" are thousands; percentages ("4.5", "4,5") use one decimal mark.
const INTEGER_COLUMNS = new Set(["impressions", "returningViewers"]);
const number = (value, key) => {
  const text = String(value || "").replace(/[%\s]/g, "");
  if (!text) return null;
  const n = INTEGER_COLUMNS.has(key) ? Number(text.replace(/[.,]/g, "")) : Number(text.replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

function importRows(channel, rows, date) {
  const header = rows[0].map((cell) => cell.replace(/^﻿/, "").trim());
  const index = Object.fromEntries(Object.entries(COLUMNS).map(([key, re]) => [key, header.findIndex((cell) => re.test(cell))]));
  if (index.id < 0) throw new Error(`no video id column ("Content") in: ${header.join(", ")}`);
  const found = Object.keys(COLUMNS).filter((key) => key !== "id" && index[key] >= 0);
  const unmatched = header.filter((cell, i) => !Object.values(index).includes(i));
  if (unmatched.length) console.log(`(ignored columns: ${unmatched.join(" | ")})`);
  if (!found.length) throw new Error(`none of impressions / CTR / returning viewers / stayed to watch in: ${header.join(", ")}`);
  const written = [];
  for (const row of rows.slice(1)) {
    const id = String(row[index.id] || "").trim();
    if (!/^[A-Za-z0-9_-]{11}$/.test(id)) continue; // skips the "Total" row
    const values = Object.fromEntries(found.map((key) => [key, number(row[index[key]], key)]).filter(([, value]) => value != null));
    if (!Object.keys(values).length) continue;
    const file = path.join(channel.paths.analytics, id, "studio-manual.json");
    let current = {};
    try { current = JSON.parse(fs.readFileSync(file, "utf8")); } catch (error) {}
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ ...current, ...values, tarih: date, kaynak: "YouTube Studio Advanced mode export" }, null, 2) + "\n");
    written.push({ id, ...values });
  }
  return { columns: found, written };
}

function main(argv = process.argv.slice(2)) {
  const selected = Channel.selectFromArgv(argv);
  const channel = selected.channel;
  const dateIndex = selected.argv.indexOf("--date");
  const date = dateIndex >= 0 ? selected.argv[dateIndex + 1] : new Date().toISOString().slice(0, 10);
  const csv = selected.argv.find((arg, i) => !arg.startsWith("--") && selected.argv[i - 1] !== "--date");
  if (!csv) throw new Error('usage: studio-import.js --channel <slug> "<Table data.csv>" [--date YYYY-MM-DD]');
  const result = importRows(channel, parseCsv(fs.readFileSync(csv, "utf8")), date);
  console.log(`[${channel.name}] ${result.written.length} video(s) updated from Studio (${result.columns.join(", ")}) → ${path.relative(Channel.ROOT, channel.paths.analytics)}/<id>/studio-manual.json`);
  for (const row of result.written) console.log(`  ${row.id}  ${Object.entries(row).filter(([key]) => key !== "id").map(([key, value]) => `${key}=${value}`).join("  ")}`);
  return result;
}

if (require.main === module) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}

module.exports = { parseCsv, importRows, COLUMNS };
