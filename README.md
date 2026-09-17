# NYU Scraper

This repository contains the AlbertPlus NYU scraper and parser only. The web app,
browser extension, documentation site, and application backend have been removed.

## What is implemented

- Course catalog discovery and parsing: codes, titles, credits, descriptions,
  schools, levels, and basic prerequisites.
- Cloudflare Worker HTTP endpoints, queue processing, D1 job tracking and error logs.
- Parsed output retained in the D1 job record through Drizzle.

Program and semester course-offering parsers are **not implemented**. Their modules
remain as placeholders; program tests are explicitly skipped. There is no automatic
schedule configured; trigger catalog scraping through the HTTP endpoint.

## Layout

```text
  src/modules/courses/          Implemented catalog parser and offline tests
  src/modules/programs/         Program placeholder
  src/modules/courseOfferings/  Course-section placeholder
  src/lib/schemas.ts            Local data contracts (no backend package dependency)
  src/lib/queue.ts              Job message and error types
  src/drizzle/                  D1 job/result/error schema and migrations
  src/index.ts                  Worker routes, queue consumer, cron handler
  wrangler.jsonc               Cloudflare deployment configuration
```

## Setup and checks

Install Bun 1.3.4 or newer, then run from the repository root:

```sh
bun install
bun test
bun check
bun check:types
bun run build
```

`build` bundles the Worker locally with Wrangler's dry-run mode; it does not deploy.
The course tests use HTML fixtures rather than live NYU requests.

## Reuse only the parser

Run this code with Bun, which supplies `fetch` and `HTMLRewriter`:

```ts
import { discoverCourses, scrapeCourse } from "./src/modules/courses";

const urls = [...new Set(await discoverCourses("https://bulletins.nyu.edu/courses/"))];
for (const url of urls) {
  const courses = await scrapeCourse(url);
  // Upsert courses into your database here.
  console.log(JSON.stringify(courses));
  await Bun.sleep(250);
}
```

The parser does not need Cloudflare credentials or a database. Its local
schemas use Zod. Prerequisites are heuristic, credits are rounded down, and unknown
school codes default to Arts and Science.

## Run the existing Worker

This mode stores results in the existing D1 database using Drizzle. Supabase writes
and a standalone scheduled import job have not been added.

## Local development

1. Run `bun install`.
2. Copy `.dev.vars.example` to `.dev.vars` and configure your
   own scraper API key.
3. Run `bun run db:migrate:local`.
4. Run `bun dev` from the repository root.

`GET /` is a health check. `POST /api/courses` queues catalog discovery and requires
an `X-API-KEY` matching `SCRAPER_API_KEY`. It returns a job ID, not scraped data.
`POST /api/programs` exists but its parser is unfinished.

Successful scrape jobs store their validated parsed output as JSON in `jobs.result`.
Course jobs contain an array of courses with prerequisites. Discovery jobs have no
result payload; their output is the child jobs they enqueue. D1 also retains job
status and errors. Queue retries update the same job record.

Apply `bun run db:migrate:local` to existing local databases before running the
updated Worker; the new migration adds the nullable `result` column. This is
per-job output, not a deduplicated course catalog. Each new scrape retains another
result, so plan job retention for repeated imports.

## Deployment

Before deploying, configure resources in your own Cloudflare account:

- Replace the Worker name, original custom-domain route, D1 database ID/name,
  and queue names in `wrangler.jsonc` as appropriate.
- Update migration scripts if you change the D1 database name.
- Configure `SCRAPER_API_KEY` as a Worker secret.
- Apply remote D1 migrations with `bun run db:migrate:remote`.
- Run `bun run cf-typegen` after changing Worker bindings.
- Run `bun run deploy` when ready.

Catalog scraping is manually triggered. No backend configuration service is needed.

The optional GitHub deployment workflow requires `DOPPLER_TOKEN` and
`CLOUDFLARE_API_TOKEN`; local parsing does not need Doppler. Deployment is manual
via workflow dispatch. The Drizzle Studio/push commands optionally use `.db.env`
with `DEV_DATABASE_URL` locally, or `CLOUDFLARE_ACCOUNT_ID`,
`CLOUDFLARE_DATABASE_ID`, and `CLOUDFLARE_D1_TOKEN` remotely.

## License

MIT, copyright Tech@NYU. See [LICENSE](LICENSE).
