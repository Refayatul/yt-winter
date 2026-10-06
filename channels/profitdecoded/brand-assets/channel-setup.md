# ProfitDecoded: YouTube channel setup sheet

## Name and handle
* **Channel name:** `ProfitDecoded` (names do not have to be unique; only the @handle does).
* The handle `@ProfitDecoded` is taken. Candidates (check availability in YouTube Studio -> Customization -> Basic info; I cannot check it from here):
  1. `@ProfitDecodedHQ`
  2. `@ProfitDecodedShow`
  3. `@TheProfitDecoded`
  4. `@ProfitDecodedTV`
  5. `@DecodedProfit`
  Prefer 1-3: they keep the brand word intact. Once chosen, set `handle` in `channels/profitdecoded/config.json` and `brand.json`.

## Uploads
* **Profile picture:** `profile-800.png` (800x800; YouTube crops to a circle and the monogram sits inside the safe centre, see `profile-circle-preview.png`).
* **Banner:** `banner-2560x1440.png` (all text inside the 1546x423 safe area every device shows, see `banner-safe-area-preview.png`).
* **Description:** paste `description.txt`; add a contact email in the last line (YouTube also has a separate "email for business inquiries" field).
* **Keywords (Studio -> Settings -> Channel -> Basic info):** `business, how companies make money, pricing psychology, business models, consumer economics, subscriptions, hidden fees, strange economics, company stories`
* **Country:** United States (matches the planned audience); language: English.
* **Upload defaults:** category "Education", license "Standard YouTube", made-for-kids "No", and turn on the altered/synthetic-content disclosure when a video uses synthetic narration (see YouTube's current disclosure rules).

## Do not
* Do not use the dollar sign, cash, rockets, coins or candlestick imagery (brand rule).
* Do not publish the PD OAuth credentials anywhere; they go in repository secrets only.
