"use strict";

const fs = require("fs");
const path = require("path");
const Channel = require("../channel-context");

function read(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch (error) { return fallback; }
}

function lastPublished(channel, format) {
  if (channel.config.pathMode === "legacy-adapter") {
    const rows = read(path.join(channel.paths.state, "yayinlananlar.json"), []);
    return rows.filter((item) => (item.format || "short") === format).map((item) => item.publishAt || item.tarih).filter(Boolean).sort().pop() || null;
  }
  const state = read(path.join(channel.paths.state, "scheduler-state.json"), {});
  const scheduled = format === "short" ? state.lastShort || null : state.lastLong || null;
  const published = read(path.join(channel.paths.state, "published.json"), [])
    .filter((item) => (item.format || "short") === format)
    .map((item) => item.publishAt || item.tarih)
    .filter(Boolean).sort().pop() || null;
  return [scheduled, published].filter(Boolean).sort().pop() || null;
}

function isDue(last, everyDays, now) {
  return !last || now.getTime() - Date.parse(last) >= everyDays * 86400000;
}

function channelPlan(channel, now = new Date()) {
  const cadence = channel.config.publishingCadence;
  const shortLast = lastPublished(channel, "short");
  const longLast = lastPublished(channel, "long");
  return {
    channel: channel.slug,
    channelName: channel.name,
    short: { due: isDue(shortLast, cadence.shorts.everyDays, now), last: shortLast, everyDays: cadence.shorts.everyDays },
    long: { due: isDue(longLast, cadence.longForm.everyDays, now), last: longLast, everyDays: cadence.longForm.everyDays },
  };
}

function portfolioPlan(now = new Date()) {
  const registry = Channel.registry();
  const channels = Object.keys(registry.channels).filter((slug) => registry.channels[slug].enabled).map((slug) => channelPlan(Channel.getChannel(slug), now));
  const due = channels.flatMap((item) => [
    ...(item.short.due ? [{ channel: item.channel, format: "short", key: `${item.channel}:short` }] : []),
    ...(item.long.due ? [{ channel: item.channel, format: "long", key: `${item.channel}:long` }] : []),
  ]);
  const order = registry.global.queuePriority || [];
  due.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
  return {
    generatedAt: now.toISOString(),
    channels,
    resourceLimits: { maxConcurrentRenders: registry.global.maxConcurrentRenders, maxConcurrentUploads: registry.global.maxConcurrentUploads },
    queue: due.map((task, index) => ({ ...task, position: index + 1, renderLane: index % registry.global.maxConcurrentRenders, uploadLane: index % registry.global.maxConcurrentUploads })),
  };
}

function enqueue(plan = portfolioPlan()) {
  for (const task of plan.queue) {
    const channel = Channel.getChannel(task.channel);
    const file = path.join(channel.paths.state, "scheduler-state.json");
    const state = read(file, { channel: task.channel, lastShort: null, lastLong: null, queue: [] });
    if (!state.queue.some((item) => item.key === task.key && item.date === plan.generatedAt.slice(0, 10))) {
      state.queue.push({ ...task, date: plan.generatedAt.slice(0, 10), status: "queued" });
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const temporary = file + `.tmp-${process.pid}`;
      fs.writeFileSync(temporary, JSON.stringify(state, null, 2) + "\n");
      fs.renameSync(temporary, file);
    }
  }
  return plan;
}

module.exports = { lastPublished, isDue, channelPlan, portfolioPlan, enqueue };
