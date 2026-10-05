Production integration target in `scripts/bto-research.js`:

- import `./bto-research-fallback`
- after `let docs = await articles(topic, get)`, when `docs.length === 0`, call fallback `relatedArticles(topic, params => wikiJson(get, params))`
- continue the existing pipeline unchanged using those docs; do not bypass primaryLinks, reachableLinks, Provider, narrationSupport or Builder.run.

This keeps broad discovery separate from evidence acceptance.
