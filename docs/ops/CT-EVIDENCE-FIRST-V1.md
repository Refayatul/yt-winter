# CriticalThread Evidence-First V1 — Stage A (experimental)

Production isolation: no imports from ct-research.js or production workflows, no new workflow, no scheduler flag, no writes to topic-universe.json. This PR is a Stage A review boundary; Stage B is a separate dependent PR.

## Pipeline

Topic + source excerpts + original-document retrieval adapter
→ injected free-provider extraction of 16–18 facts
→ exact excerpt quote and claim-number verification
→ independently retrieved original-document quote match
→ dedupe, provenance and a sealed evidence package
→ human semantic review / Stage B in a later PR.

Files: scripts/ct-evidence-first.js, schemas/ct-evidence-package-v1.schema.json, tests/js/ct-evidence-first.test.js.

## Trust model

A primary source hyperlink, Wikipedia reference, allowed hostname, or HEAD success does not confer primary verification. PRIMARY_SOURCE_VERIFIED requires matching text from a direct independent retrieval of the specific original document (injected verifyPrimary callback, checked URL). EXCERPT_MATCHED is not a primary-source citation. Both statuses leave semantic_status=NEEDS_REVIEW. Validation of hostnames alone does not establish provenance. The injected retrieval adapter must independently verify HTTPS, redirects, actual document content and that it is not merely a quoted derivative; V1 cannot attest to the adapter's honesty. Semantic equivalence, causal inference and wrong-subject claims cannot be certified by lexical matching.

At least 16 distinct accepted claims AND exact quotes verified against at least two distinct primary-document URLs are needed for READY_FOR_STORY_REVIEW_REQUIRED. The 16-claim threshold is intentionally an experimental fail-closed floor, not a production quality threshold. Existing builder rules are unchanged. Redundant paraphrases are not fully detected; exact duplicate claims are rejected.

## No live integration

Call extractEvidence with explicit sources and an injected generate callback. It cannot call Groq or the network itself. Tests mock all model and retrieval results. Caller enforces the existing 16k topic / 45k run budgets. The experimental module's output-token request remains 3200 at reasoningEffort=low. Before later integration, verify the adapter's usage and rate-limit accounting, and do not publish source excerpts or the evidence package to public CI logs.

Call savePackage only with an explicit private output path; it uses exclusive creation and 0600 permissions. loadPackage checks SHA256 integrity. This prevents accidental corruption, not tampering by an adversary who can replace both content and digest. It does not authenticate sources, encrypt the document, or authorize promotion.

Stage B must refuse INSUFFICIENT_EVIDENCE and continue to require human semantic review even for ready packages.

## Later PR

Implement grounded narrative generation, provenance tracking for all hook-input fields, stable canonical-hook selection, deterministic semantic warning audit, full existing builder checks, bounded budget adapter, and an explicitly disabled experimental CLI. Do not change ct-research.yml, CT_RESEARCH_AUTO, production topic selection, schedules, or Cloudflare.
