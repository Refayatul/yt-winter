// Narration-anchored time references, shared by the validator (Node) and the page resolver.
//   "0" | "12.5"                      absolute seconds
//   "start" | "end"                   film start / film end (narration duration + tail)
//   "line:L4" | "lineEnd:L4"          start / end of a script line
//   "word:L10:fifty-three"            start of a word in a line (punctuation ignored); "#1" = 2nd occurrence
//   "wordEnd:L10:degrees"             end of that word
//   any of the above + " +0.3" / " -0.1"  offset in seconds (space-separated, so hyphenated words work)
(function (root) {
  const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "");
  const RE = /^(start|end|-?\d+(?:\.\d+)?|(?:line|lineEnd):L\d+|(?:word|wordEnd):L\d+:[^\s#]+(?:#\d+)?)(?: ([+-]\d+(?:\.\d+)?))?$/;
  function resolve(ref, tl, duration) {
    const m = RE.exec(String(ref)); if (!m) throw new Error(`bad time reference "${ref}"`);
    const [, base, off] = m; let t;
    if (base === "start") t = 0; else if (base === "end") t = duration;
    else if (/^-?\d/.test(base)) t = +base;
    else { const parts = base.split(":"); const kind = parts[0], line = parts[1];
      const L = tl.lines.find((x) => x.id === line); if (!L) throw new Error(`time reference "${ref}": no line ${line} in the narration`);
      if (kind === "line") t = L.start; else if (kind === "lineEnd") t = L.end;
      else { const [w, n] = parts.slice(2).join(":").split("#"); const ws = tl.words.filter((x) => x.line === line && norm(x.text) === norm(w));
        const hit = ws[+(n || 0)]; if (!hit) throw new Error(`time reference "${ref}": word "${w}"${n ? " #" + n : ""} not spoken in ${line}`);
        t = kind === "word" ? hit.start : hit.end; } }
    return t + (off ? +off : 0);
  }
  const api = { resolve, RE };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.FR_TIME = api;
})(typeof window !== "undefined" ? window : globalThis);
