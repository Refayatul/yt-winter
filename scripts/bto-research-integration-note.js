"use strict";
// Integration contract: bto-research.js may call relatedArticles() when its
// strict object-title lookup returns no article. Returned titles are discovery
// candidates only; existing primary-source, quote and Builder.run gates remain
// mandatory before any universe record is written.
module.exports=require("./bto-discovery-adapter");
