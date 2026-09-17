# Scraper Development Guide

- Package manager: Bun 1.3.4+; run `bun install` at the root.
- Check formatting/lint: `bun check`; fix with `bunx biome check --write`.
- Check types: `bun check:types`.
- Test: `bun test` (offline course fixtures; unimplemented program tests skipped).
- Build: `bun run build` (Wrangler dry run, no deployment).
- Dev: `bun dev` (Cloudflare Worker only).
- TypeScript strict mode, explicit export types, camelCase functions and PascalCase types.
- Biome formatting: 2 spaces, double quotes, organized imports.
- Use async/await and typed errors (`JobError` for scraper jobs).
- Keep parser modules independent of backend packages; shared contracts live in
  `src/lib/schemas.ts`.
- D1/Drizzle stores operational jobs, parsed job results, and errors. No external
  application backend is required. Apply migrations before running the Worker.
