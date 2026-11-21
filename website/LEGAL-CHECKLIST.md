# Before you publish the legal pages

These pages are a solid draft written to match how Kavori and this site actually behave. They are **not legal advice**.
Have a lawyer in your jurisdiction review them before you take payments.

## Fill in (`src/config.ts`)

| Field | What to put |
|---|---|
| `legal.company`, `registration`, `taxId`, `address` | Your registered business details |
| `legal.email`, `securityEmail` | Real, monitored inboxes |
| `legal.jurisdiction` | Governing law (state/country) |
| `legal.devices` | How many computers one license covers |
| `legal.paymentProvider`, `legal.host` | Who you actually use |
| `legal.updated` | Date of the current version |
| `site.refundDays` | Currently 30. This is a business decision, change it freely |
| `site.price`, `site.buyUrl` | Price and checkout link |

## Decisions to make

- **Merchant of record.** If your payment provider (Paddle, Lemon Squeezy and similar) is the seller of record, they collect and remit VAT/sales tax and their terms apply to the sale. Say so in `terms.astro` section 2. If you sell directly (Stripe), you are responsible for tax registration.
- **License and update checks.** The app currently makes no connection to your servers. If you add license activation or update checks, describe exactly what is sent in `privacy.astro` ("The Kavori app").
- **Update promise.** The terms say every future version is free, with a clause that old versions keep working if that ever changes. Keep only what you will honour.
- **Security promise.** The home page and security section say you ship Chromium fixes as free updates. This needs a real process behind it.
- **Third-party notices.** Regenerate the list in `legal.astro` from the final build.
- **Regional extras.** Selling into the EU, UK, Australia or Canada can bring extra requirements (e.g. withdrawal-right wording, an EU representative, a cookie banner if you later add analytics). A lawyer or your payment provider can tell you.
- **Trademarks.** Check the "Kavori" name before relying on it.
