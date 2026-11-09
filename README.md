# Priced catalog

A website that publishes your prices next to the hours behind them and what the going rate is for the same job. No database, no logins, nothing collected about anyone who visits.

Started from [dbeihl/priced-catalog](https://github.com/dbeihl/priced-catalog); this copy is maintained at Dozer1986/priced-catalog. Live site: https://dozer1986.github.io/priced-catalog/

Everything you would want to change lives in two files:

- `src/site.config.ts` — your name, service area, email, the visit minimum, and the page description, web address, and link-preview image. The "Request a walkthrough" buttons stay hidden until the email no longer starts with `TODO_`. Any other value still starting with `TODO_` is left off the page. The browser-tab titles in `index.html` and `sources.html` repeat the name, so change them there too.
- `src/data/services.ts` — every service and every price.

You do not need to understand the rest of the code to change either one.

---

## Before you change anything

Prices, hours, and market bands are all edited by hand in `src/data/services.ts`. Each service is a block of text that starts with `{` and ends with `},`. Find the service by its name, change the number, save the file. Keep the punctuation exactly as it is — the commas and quote marks matter.

If something breaks, the safest fix is to undo your change and try again one line at a time.

---

## 1. Change a price

Find the service, then find the `pricing` block inside it. Change the number after `price:`.

Before:

```ts
    pricing: { model: "flat", price: 185, unit: "project" },
```

After (raising a toilet swap from $185 to $195):

```ts
    pricing: { model: "flat", price: 195, unit: "project" },
```

For a service priced by the foot or the square foot, change `rate:` instead:

```ts
    pricing: {
      model: "per-unit",
      rate: 4.5,          // <- change this one
      unit: "linear-ft",
      minimumUnits: 40,   // <- and this if the minimum job size changes
    },
```

For a service where the first one costs more than the rest, change `firstPrice` or `additionalPrice`:

```ts
    pricing: {
      model: "flat",
      firstPrice: 95,       // the first Shelly on the visit
      additionalPrice: 65,  // every one after it
      unit: "device",
    },
```

## 2. Change the hours, or the market band

These two are the reason the site exists, so they are worth keeping honest. The hours are what the customer divides your price by. The market band is what they compare it against.

Before:

```ts
    basis: {
      hours: 2,
      note: "Two hours including haul-off.",
    },
    marketBand: {
      low: 150,
      high: 450,
      unit: "project",
      source: "Plumbing By The Book / RateYourPlumber, 2026",
      sourceKey: "Plumbing By The Book / RateYourPlumber, 2026",
      note: "Labor only, same location.",
    },
```

After (the job actually takes two and a half hours, and you found a better source):

```ts
    basis: {
      hours: 2.5,
      note: "Two and a half hours including haul-off.",
    },
    marketBand: {
      low: 175,
      high: 425,
      unit: "project",
      source: "Angi, Sep 2026",
      sourceKey: "Angi, Sep 2026",
      note: "Labor only, same location.",
    },
```

For a range of hours, use square brackets: `hours: [2, 3]`.

Whenever you change a `marketBand`, add or update the matching row in `SOURCES.md` with the link you got the numbers from. That file is what makes the band checkable rather than just published: the site publishes it as the sources table and links each band's citation to that row's web page. `source` is the label the customer sees; `sourceKey` must match the row's first column in `SOURCES.md` exactly (`npm run test` checks this). Use `sourceKey: null` to show the label without a link until the source is confirmed.

## 3. Add a service

Copy an existing service block that is closest to the one you want, paste it directly underneath, and change the fields. Every service needs an `id` that no other service uses.

```ts
  {
    id: "attic-ladder",                        // unique, lowercase, hyphens only
    name: "Attic ladder replacement",
    category: "carpentry",                     // water | smart-home | flooring | carpentry | doors | general
    blurb: "One line the customer sees on the list.",
    description: "The longer explanation shown when they tap the name.",
    pricing: { model: "flat", price: 395, unit: "project" },
    basis: {
      hours: 4.5,
      note: "Framing the rough opening is most of it.",
    },
    marketBand: {
      low: 300,
      high: 800,
      unit: "project",
      source: "HomeGuide, 2026",
      sourceKey: null,                         // or the matching SOURCES.md row
    },
    materials: "client-supplied",              // client-supplied | pass-through | included
    includes: ["Old unit removal", "Framing", "Trim"],
    excludes: ["The ladder"],
    confirmBy: "walkthrough",                  // optional: walkthrough | photos
    status: "offered",
  },
```

A priced service needs both `basis` and `marketBand`. If you cannot say how many hours a job takes and what other people charge for it, its price is not ready yet. Until it is, list it with `pricing: { model: "quote-only", unit: "project" }` and leave out `basis` and `marketBand`. The site then shows "Ask for a quote" with a link to the contact section instead of an Add button.

## 4. Hide a service

Change `status` from `"offered"` to `"coming-soon"`, or delete the whole block from `{` to `},`.

Before:

```ts
    status: "offered",
```

After:

```ts
    status: "coming-soon",
```

## Running it on your own computer

You need Node 20 or newer, once.

```bash
npm install       # first time only
npm run dev       # opens a local preview you can click through
npm run build     # makes the files that get published
```

Before publishing a change, run all four:

```bash
npm run typecheck && npm run lint && npm run test && npm run build
```

If any of them fail, the change is not ready. `npm run test` in particular checks the estimate arithmetic — the minimum job sizes, the small-room flat price, the first-one-costs-more pricing, and the visit minimum.

## Publishing it

Pushing to `master` builds the site and publishes it to GitHub Pages at
**https://dozer1986.github.io/priced-catalog/**. `.github/workflows/deploy.yml` runs the lint, the tests, and the typechecking build first, so a broken change never reaches the live page.

Two things have to be true in the repository's own settings before the first deploy succeeds, and neither can be set from a file in the repo:

1. **The repository is public**, or the account is on a paid plan. GitHub Pages will not serve a private repository on the free tier.
2. **Settings → Pages → Source is set to "GitHub Actions"** (not "Deploy from a branch").

After that, every push to `master` republishes. The Actions tab shows each run, and the run's `deploy` step links the published URL.

## Publishing it somewhere else

The site is currently built to live at `/priced-catalog/` on GitHub Pages. To publish it at the root of your own domain instead, build it with one extra setting:

```bash
VITE_BASE_PATH=/ npm run build
```

Nothing else needs to change. All of the identity and contact details are in `src/site.config.ts`, apart from the page titles in `index.html` and `sources.html`, so a new owner changes those files.

---

## Before this goes live

The site should stay behind a private link until all four of these are true. None of them are optional, and the last two are specific to Indiana.

**1. General liability insurance is in place.**
A personal homeowner's policy excludes business pursuits. If something goes wrong on a customer's property while you are being paid to be there, a homeowner's policy is not going to respond. A published price list reads as a business to everyone who sees it, including an insurer and a plaintiff's attorney.

**2. The business entity is formed.**
An Indiana LLC through INBiz. This separates your personal assets from the business, which is the entire point of doing it before the first paid job rather than after the first problem.

**3. There is a written contract template, reviewed by an attorney.**
Indiana's Home Improvement Contracts Act applies to residential work over $150, which is most of this list. It requires specific terms in the contract plus a three-day cancellation notice, and it requires change orders to be written and signed.

That last part is the one that protects you. An unsigned change order is unenforceable, so if a job turns out worse than the walkthrough suggested and you do the extra work on a handshake, you may not be able to collect for it. Violations of the Act are deceptive acts under the Deceptive Consumer Sales Act, which shifts attorney's fees to the losing side.

**4. Westfield and Hamilton County registration thresholds are confirmed.**
Indiana has no statewide contractor licensing, but cities and counties set their own registration rules and dollar thresholds. Indianapolis, for example, requires Home Improvement Contractor registration for work over $500. Several items on this list sit right on that line. Call the Westfield building department and confirm what applies before the catalog is public.
