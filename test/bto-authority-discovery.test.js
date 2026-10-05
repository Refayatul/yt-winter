"use strict";
const assert=require("assert"),fs=require("fs"),path=require("path");
const D=require("../scripts/bto-authority-discovery");
const html='<a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.ykk.com%2Fexample%2Flocking-slider">YKK</a><a href="https://example.com/nope">x</a>';
assert.deepStrictEqual(D.resultUrls(html),['https://www.ykk.com/example/locking-slider']);
assert.ok(D.stripHtml('<p>locking <b>slider</b> prevents movement</p>').includes('locking slider prevents movement'));
const wire=fs.readFileSync(path.join(__dirname,'..','scripts','bto-wire-discovery-v2.js'),'utf8');
for(const token of ['AuthorityDiscovery.discover','primaryDirect','direct authority evidence','Wikipedia fallback']) assert.ok(wire.includes(token),token);
console.log('bto authority-first discovery contract passed');
