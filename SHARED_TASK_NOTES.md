# Helios - Shared Task Notes

## Current State

**All tasks complete!** All Phase 1, Phase 2, and Phase 3 items from SPEC.md are now checked off, including the Dashboard UI.

**Verified on 2026-01-08:** All 179 tests pass, TypeScript type checking passes, ESLint passes.

**Deployed URLs:**

- **Production**: https://helios.getelysium.workers.dev
- **Staging**: https://helios-staging.getelysium.workers.dev
- **Dashboard**: https://helios.getelysium.workers.dev/dashboard

**Test Suite:** 179 tests (all passing)

## Dashboard UI

The dashboard is available at `/dashboard` and provides:

- API key-based authentication (stored in localStorage)
- Task status viewing with logs and diffs
- Usage tracking with daily charts
- Cost estimation display

## Before Deploying Updates

The USAGE KV namespace needs to be created if not already done:

```bash
# Production
wrangler kv:namespace create USAGE
# Update wrangler.toml with the returned ID

# Staging
wrangler kv:namespace create USAGE --env staging
# Update wrangler.toml env.staging section with the returned ID
```

## Notes

- All SPEC.md checkboxes are now complete
- Usage data expires after 90 days in KV
- Cost calculation uses Claude Sonnet 4.5 pricing ($3/1M input, $15/1M output)
- Dashboard uses vanilla HTML/CSS/JS served via Hono's html() helper (no build step required)
