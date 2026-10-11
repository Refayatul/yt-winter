"use strict";
// Owner decision 2026-10-11: The Hidden Logic of Things (behind-the-ordinary) is not an active channel.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ROOT = path.resolve(__dirname, "..", "..");
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");

test("The Hidden Logic of Things has no scheduled automation", () => {
  const registry = JSON.parse(read("config/channels.json"));
  assert.equal(registry.channels["behind-the-ordinary"].enabled, false);
  assert.match(read(".github/workflows/portfolio-production.yml"), /github\.event_name == 'workflow_dispatch' && inputs\.channel == 'behind-the-ordinary'/);
  assert.doesNotMatch(read(".github/workflows/growth-feedback-loop.yml"), /for CHANNEL in [^\n]*behind-the-ordinary/);
  assert.doesNotMatch(read(".github/workflows/bto-research.yml"), /schedule:/);
  assert.match(read(".github/workflows/youtube-oauth-health.yml"), /behind-the-ordinary:\n\s+# Inactive channel[^\n]*\n\s+if: github\.event_name == 'workflow_dispatch'/);
});
