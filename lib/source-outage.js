// Asset-source outages (Wikimedia, archive.org, Pexels) for the FR asset fetchers.
//
// A transient outage says nothing about the topic: arsiv-bul.js / stok-bul.js exit with
// ASSET_SOURCE_UNAVAILABLE_EXIT and shorts-sira.js stops the queue without marking the topic
// failed, exactly like a narration outage. A missing file (HTTP 404), an unusable licence or a bad
// topic spec stays an ordinary failure (exit 1).
"use strict";

const ASSET_SOURCE_UNAVAILABLE_EXIT = 76;

const NETWORK_CODES = new Set(["ENOTFOUND", "EAI_AGAIN", "ECONNRESET", "ECONNREFUSED", "ECONNABORTED", "ETIMEDOUT", "ESOCKETTIMEDOUT",
  "EHOSTUNREACH", "ENETUNREACH", "ENETDOWN", "EPIPE", "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_SOCKET"]);

function isTransient(error) {
  if (!error) return false;
  if (NETWORK_CODES.has(error.code)) return true;
  const message = String(error.message || error);
  // Rate limits and server errors; an HTML error page where JSON was expected; dropped sockets.
  return /\bHTTP (?:408|425|429|5\d\d)\b/.test(message)
    || /getaddrinfo|socket hang up|timed? ?out|Unexpected token '?<|Unexpected end of JSON input/i.test(message);
}

module.exports = { ASSET_SOURCE_UNAVAILABLE_EXIT, isTransient };
