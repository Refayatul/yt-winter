# Test plan

Regression cases cover street-number and coffee-shop questions that previously returned `NO_SOURCE`, authority-host ranking, fallback-only-on-empty behavior, and the safety invariant that discovery output cannot mark a topic production-ready. PR CI also runs a live Wikipedia smoke query; production evidence gates are intentionally unchanged.
