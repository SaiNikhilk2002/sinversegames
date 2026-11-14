# R2 storage assessment

Would Cloudflare R2 reduce cost or improve delivery? Read-only: no bucket or binding was created.

## Where files live today

| Files | Where | Size and count | Cost today |
|---|---|---|---|
| Game assets: cricket athlete GLB models, covers, icons (`apps/web/public`) | **Workers static assets**, deployed with every Worker version (`wrangler.jsonc` → `.open-next/assets`) | `public/`: 21 MB in 26 files; the largest are 1.8 MiB athlete GLBs. The whole built asset directory is about 31 MB, including 22 GLB models and the Next.js chunks | **$0.** "Requests to static assets are free and unlimited" ([static assets billing](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/), 2026-11-12). There's no `run_worker_first`, so the Worker isn't invoked for them |
| Prerendered pages (OpenNext incremental cache) | Workers static assets (`staticAssetsIncrementalCache`) | Part of the 31 MB | $0 |
| **Custom avatars** (64 and 256 px WebP) | **Nowhere in production.** `avatar-storage.ts` expects an R2 binding `AVATARS`, which `wrangler.jsonc` doesn't declare, so uploads report "unavailable". Local tests use a directory | — | $0 (the feature is off) |
| Match data and profiles | Neon | — | See `NEON_HYPERDRIVE_ASSESSMENT.md` |

**Limits that apply to static assets:**
- 20,000 files per version on Free, 100,000 on Paid;
- 25 MiB per file.

The project is far below both.

**Download frequency:** unknown, since no analytics were accessible. It doesn't change the answer, because static-asset requests aren't billed.

## Would moving game assets to R2 help?

**No.**

| | Workers static assets (today) | R2 behind a custom domain or Worker |
|---|---|---|
| Storage | Included | $0.015 per GB-month (10 GB free) |
| Reads | **Free and unlimited** | Class B: $0.36 per million (10M free a month); free if served from Cloudflare's cache |
| Egress | Free | Free |
| Deploys | Versioned with the code, so a rollback brings back matching assets | Separate uploads; versions can drift from the code |
| Complexity | None | A bucket, a binding or public domain, an upload step, cache rules |

R2 can't beat "free and unlimited". It would only make sense if assets outgrew static-asset limits (a file over 25 MiB, or tens of thousands of files), or needed to change without a deploy. Neither is the case.

## R2 for avatars

R2 is the store the code was built for. Turning custom avatars on would need **all** of:
1. **An R2 bucket and an `AVATARS` binding** in both `wrangler.jsonc` files (a configuration change: approval required).
2. **The Railway avatar processor:**
   - `/internal/avatar` decodes and re-encodes images with Sharp/libvips, which can't run on Workers;
   - so avatars **depend on Railway** unless the processor is replaced (`CLOUDFLARE_DURABLE_OBJECTS_ASSESSMENT.md`).
3. **`REALTIME_INTERNAL_URL`** set on the Worker.

**Cost at any plausible scale: about $0.**
- Two small WebP files per upload are a few KB each, so 10 GB free holds millions of avatars.
- Uploads are Class A operations: 1 million free a month.
- Reads are Class B operations (10 million free a month), served through the app's same-origin route with a 5-minute cache.

**Verdict:**
- **R2 isn't worthwhile for cost.** Nothing paid would move to it, and static assets are already free.
- It's the right, near-free store **if you decide to turn on custom avatars**. That's a feature decision, not a cost saving.
