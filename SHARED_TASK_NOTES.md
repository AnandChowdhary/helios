# Helios - Shared Task Notes

## Current State

All core implementation is complete. 102 tests passing (15 E2E tests skipped without staging env vars):
- Unit tests: 58
- Integration tests: 28
- E2E tests: 16

Deployed on Cloudflare:

- **Production**: https://helios.getelysium.workers.dev
- **Staging**: https://helios-staging.getelysium.workers.dev

Both endpoints verified working (health checks pass).

## Recent Changes

- Fixed URLs in GitHub Actions workflows, E2E tests, and SPEC.md to use correct `getelysium.workers.dev` subdomain
- Files updated: `deploy-staging.yml`, `deploy-prod.yml`, `test/e2e/full-flow.test.ts`, `SPEC.md`

CI workflow is now complete with lint, typecheck, test (with coverage), and build jobs.

## Next Priority Tasks

1. **Configure GitHub Secrets for Deployment**
   Required secrets for staging/production deployment:

   - `CLOUDFLARE_API_TOKEN` - Cloudflare API token with Workers permissions
   - `CLOUDFLARE_ACCOUNT_ID` - Already in wrangler.toml (0f5ad4e52108866c892fca418834b9b8)
   - `STAGING_API_KEY` - API key for E2E tests (create via `npm run seed-keys`)
   - `ANTHROPIC_API_KEY` - For E2E tests to run Claude
   - Optional: `CODECOV_TOKEN` for coverage reporting

2. **Run Full E2E Tests Against Production**
   Set env vars and run: `STAGING_URL=https://helios.getelysium.workers.dev npm run test:e2e`

3. **Update SPEC.md Checklist**
   Mark "Staging deployment" and "Production deployment" as complete since they're deployed.

## Key Files

```
.github/workflows/ci.yml              # CI workflow (lint, typecheck, test, build)
.github/workflows/deploy-staging.yml  # Staging deployment workflow
.github/workflows/deploy-prod.yml     # Production deployment workflow
wrangler.toml                         # Full staging env config
test/e2e/full-flow.test.ts            # E2E tests (use getelysium.workers.dev URLs)
```

## Notes

- Staging uses separate R2 bucket and queue for isolation
- KV namespaces currently shared between staging/prod (can be separated later)
- Container config is same for both environments (Cloudflare handles isolation)
- Build command requires Docker for container image (works in CI, skipped locally)
