"use strict";
// ProfitDecoded motion fonts: open-licence (SIL OFL 1.1) faces from exact-pinned @fontsource packages
// (package.json devDependencies). They are embedded as data URIs so a render never depends on the fonts
// installed on the machine; a missing file or licence fails the render instead of silently falling back.
const fs = require("fs");
const path = require("path");

const FACES = [
  // family alias, package, file stem, weight, style
  ["PD Serif", "@fontsource/source-serif-4", "source-serif-4-latin-600-normal", 600, "normal"],
  ["PD Serif", "@fontsource/source-serif-4", "source-serif-4-latin-700-normal", 700, "normal"],
  ["PD Serif", "@fontsource/source-serif-4", "source-serif-4-latin-700-italic", 700, "italic"],
  ["PD Sans", "@fontsource/inter", "inter-latin-400-normal", 400, "normal"],
  ["PD Sans", "@fontsource/inter", "inter-latin-500-normal", 500, "normal"],
  ["PD Sans", "@fontsource/inter", "inter-latin-600-normal", 600, "normal"],
  ["PD Sans", "@fontsource/inter", "inter-latin-700-normal", 700, "normal"],
  ["PD Sans", "@fontsource/inter", "inter-latin-800-normal", 800, "normal"],
  ["PD Num", "@fontsource/barlow-semi-condensed", "barlow-semi-condensed-latin-500-normal", 500, "normal"],
  ["PD Num", "@fontsource/barlow-semi-condensed", "barlow-semi-condensed-latin-600-normal", 600, "normal"],
];

function pkgDir(name) { return path.dirname(require.resolve(name + "/package.json")); }

// Manifest for the licence register: package, exact version, licence, font file.
function manifest() {
  return FACES.map(([family, pkg, stem, weight, style]) => {
    const dir = pkgDir(pkg); const meta = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8"));
    const licence = fs.readFileSync(path.join(dir, "LICENSE"), "utf8");
    if (!/SIL Open Font License/i.test(licence)) throw new Error(`${pkg}: LICENSE is not the SIL Open Font License`);
    return { family, package: pkg, version: meta.version, license: meta.license, file: `files/${stem}.woff2`, weight, style };
  });
}

// @font-face CSS with the woff2 files inlined.
function css() {
  return FACES.map(([family, pkg, stem, weight, style]) => {
    const file = path.join(pkgDir(pkg), "files", stem + ".woff2");
    if (!fs.existsSync(file)) throw new Error(`font file missing: ${pkg}/files/${stem}.woff2 (npm install?)`);
    return `@font-face{font-family:'${family}';font-weight:${weight};font-style:${style};font-display:block;src:url(data:font/woff2;base64,${fs.readFileSync(file).toString("base64")}) format('woff2');}`;
  }).join("\n");
}

// Run inside the page after the CSS is attached: load every face and fail loudly if one is unusable.
const PAGE_CHECK = `(async () => {
  const faces = ${JSON.stringify(FACES.map(([f, , , w, s]) => [f, w, s]))};
  for (const [f, w, s] of faces) await document.fonts.load(s + " " + w + " 40px '" + f + "'");
  await document.fonts.ready;
  const loaded = [...document.fonts].filter((ff) => ff.status === "loaded").map((ff) => ff.family.replace(/['"]/g, "") + "|" + ff.weight + "|" + ff.style);
  const missing = faces.filter(([f, w, s]) => !loaded.includes(f + "|" + w + "|" + s));
  if (missing.length) throw new Error("fonts not loaded: " + JSON.stringify(missing));
  return faces.length;
})()`;

module.exports = { FACES, manifest, css, PAGE_CHECK };
