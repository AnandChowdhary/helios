# Helios - Shared Task Notes

## Current State

All core implementation is complete. 102 tests passing:
- Unit tests: 58
- Integration tests: 28
- E2E tests: 16 (15 require staging env vars, 1 runs always)

GitHub Actions deployment workflows are now created.

## Next Priority Tasks

1. **Configure GitHub Secrets for Deployment**
   Required secrets for staging/production deployment:
   - `CLOUDFLARE_API_TOKEN` - Cloudflare API token with Workers permissions
   - `CLOUDFLARE_ACCOUNT_ID` - Already in wrangler.toml (0f5ad4e52108866c892fca418834b9b8)
   - `STAGING_API_KEY` - API key for E2E tests (create via `npm run seed-keys`)
   - `ANTHROPIC_API_KEY` - For E2E tests to run Claude

2. **Create Staging Resources**
   Before deploying, create these Cloudflare resources:
   ```bash
   # Create staging R2 bucket
   wrangler r2 bucket create helios-artifacts-staging

   # Create staging queue
   wrangler queues create helios-tasks-staging
   ```

3. **Deploy to Staging**
   - Push to main branch triggers `deploy-staging.yml` workflow
   - Or run manually: `npm run deploy:staging`

4. **Production Deployment**
   - Triggered by GitHub Release or manual workflow dispatch
   - Runs `deploy-prod.yml` workflow

## Key Files

```
.github/workflows/deploy-staging.yml  # Staging deployment workflow
.github/workflows/deploy-prod.yml     # Production deployment workflow
wrangler.toml                         # Full staging env config added
```

## Notes

- Staging uses separate R2 bucket and queue for isolation
- KV namespaces currently shared between staging/prod (can be separated)
- Container config is same for both environments (Cloudflare handles isolation)
