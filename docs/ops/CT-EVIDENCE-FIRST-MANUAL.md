# CriticalThread Evidence-First: manual original-document adapter (experimental)

No production workflow imports these modules. No automatic scheduling, Groq calls, topic writes, publishing, uploads, paid APIs or Cloudflare changes.

## Scope

- scripts/ct-primary-document.js securely fetches a **single** source marked primary (host restrictions from core/research). Restricts to HTTPS official-domain exact/suffix matches, pins a public IPv4 A record into TLS connection, retains normal TLS certificate verification and SNI, rejects private/metadata IPs, custom ports, cookies, cross-host redirects, oversized bodies and compressed responses. Maximum 8 MiB, 15 seconds per fetch, two same-host redirects, 500,000 extracted characters. IPv6-only hosts fail closed.
- HTML and plain-text content are parsed without executing JavaScript. PDF extraction requires a locally installed pdftotext binary (no shell invocation); malformed, oversized, unavailable or unreadable PDFs fail closed. Rendered, scanned or heavily scripted pages may be impossible to verify in V1. An HTML text extraction is **not** evidence of semantic correctness.
- createPrimaryVerifier() returns a trusted retrieval callback compatible with scripts/ct-evidence-first.js validateEvidence(). This verifies a matched quote against independently fetched original document text, not merely Wikipedia excerpts or reachability.
- scripts/ct-evidence-first-manual.js allows precisely two manual operations: a one-document metadata-only probe or a fully mocked offline two-stage replay. It requires BOTH --manual and CT_EVIDENCE_FIRST_MANUAL=1; it neither writes files nor calls Groq.

## Commands

Manual **original document** probe (one HTTPS retrieval; not a Groq call):

    CT_EVIDENCE_FIRST_MANUAL=1 node scripts/ct-evidence-first-manual.js --manual --probe-primary 'https://www.nasa.gov/YOUR-EXACT-DOCUMENT-PATH'

Manual **fully mocked** offline replay with an owner-created local fixture:

    CT_EVIDENCE_FIRST_MANUAL=1 node scripts/ct-evidence-first-manual.js --manual --fixture /path/to/local-fixture.json

Fixture keys: topic (id, slug, category), sources [{source_id,kind,url,excerpt}], facts [{fact_id,source_id,claim,verbatim_quote}], story (Stage B shape), original_documents mapping source IDs to **MOCKED** document text. Do not treat a mocked PRIMARY_SOURCE_VERIFIED result as an actual source verification. Offline replay prints only stage counts and status; mock token accounting must not be interpreted as measured Groq consumption.

Tests:

    node --test tests/js/ct-primary-document.test.js

## Current blockers before a live CT research experiment

This PR does **not** provide a real Groq adapter or an authorized live researcher. It does not prove factual meaning, quote-page authenticity in rendered PDFs, or semantic correctness. Existing strict hook selection may still reject all records. To test with real Groq later: review evidence source identity, add a separate opt-in one-topic non-writing model adapter with hard budgets and audit-safe output, obtain owner approval, and only then run it. Do not connect to CT_RESEARCH_AUTO or modify production queues.
