# Analytics adapter

Failure Reconstructed keeps its existing root `analytics/` directory during the compatibility phase. `core/channel-context.js` maps this channel to that exclusive legacy path; other channels cannot resolve it.
