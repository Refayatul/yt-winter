"use strict";

// The Shorts quality preview renders for review and never uploads. A topic the FINAL quality gate
// scores REVIEW/BLOCK is reported, not failed (IB/CT: --advisory-readiness), but a missing render or a
// narration/tool failure still fails the job, and nothing in the preview can publish.

const test = require("node:test");
const assert = require("node:assert/strict");
const cp = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const ROOT = path.join(__dirname, "..", "..");
const workflow = fs.readFileSync(path.join(ROOT, ".github", "workflows", "quality-preview.yml"), "utf8");

test("quality preview cannot publish and keeps the offline voice preview-only", () => {
  assert.match(workflow, /PUBLISH: '0'/);
  assert.match(workflow, /SHORTS_TTS_FALLBACK: preview/);
  assert.match(workflow, /permissions:\s*\n\s*contents: read/);
  assert.ok(!/youtube-yukle|YT_REFRESH_TOKEN|_YT_CLIENT_SECRET/.test(workflow), "no upload step and no YouTube credentials");
});

test("FR preview: only a final REVIEW/BLOCK verdict on a rendered MP4 is advisory", () => {
  const step = workflow.slice(workflow.indexOf('if [ "$CHANNEL" = "failure-reconstructed" ]'), workflow.indexOf("else\n", workflow.indexOf('if [ "$CHANNEL" = "failure-reconstructed" ]')));
  assert.match(step, /cp "uretim\/\$FR_SLUG\/Videos\/\$FR_SLUG\.mp4" preview\//, "a missing MP4 fails the job (set -e)");
  const script = step.match(/node -e '\n([\s\S]*?)\n\s*' "preview/)[1];
  const verdict = (gate) => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "qp-")), "gate.json");
    fs.writeFileSync(file, JSON.stringify(gate));
    return cp.spawnSync(process.execPath, ["-e", script, file], { encoding: "utf8" }).status;
  };
  assert.equal(verdict({ asama: "final", karar: "REVIEW", toplam: 84 }), 0);
  assert.equal(verdict({ asama: "final", karar: "BLOCK", toplam: 60 }), 0);
  assert.equal(verdict({ asama: "final", karar: "PUBLISH", toplam: 90 }), 1, "a PUBLISH verdict with a failed run is a real failure");
  assert.equal(verdict({ asama: "pre", karar: "REVIEW", toplam: 82 }), 1, "only the final gate counts");
});
