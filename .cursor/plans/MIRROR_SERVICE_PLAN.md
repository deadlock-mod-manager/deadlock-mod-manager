# S3 Mirror Service Implementation Plan

## Overview

Build a separate microservice that mirrors GameBanana files to S3, with smart caching and automatic staleness detection.

## Current Architecture Summary

### GameBanana Download Flow

1. **GameBanana API Integration** (`apps/api/src/providers/game-banana/index.ts`)
   - Base URL: `https://gamebanana.com/apiv11`
   - Download Endpoint: `/{modType}/{remoteId}/DownloadPage`
   - `refreshModDownloads()` fetches download page metadata (line 534)

2. **Database Storage** (`packages/database/src/schema/mods.ts`)
   - `modDownloads` table stores: remoteId, file, url, size, modId

3. **Frontend Download** (`apps/desktop/src/hooks/use-download.ts`)
   - User selects files → `downloadManager.addToQueue()` → Tauri command `queue_download`

4. **Rust Download Manager** (`apps/desktop/src-tauri/src/download_manager/`)
   - Queue system with concurrent processing
   - Downloads to temp → extracts → copies VPK to game addons
   - Progress tracking with throttled events

### Existing Caching

- **Frontend:** React Query (5min stale, 10min cache, 2 retries)
- **Backend:** 3 retry attempts, 5min timeout, 256MB max file size

## Proposed Architecture

### 1. New Mirror Service (Separate Microservice)

**Stack:** Hono + Bun (matches existing API)
**Location:** `apps/mirror-service/`

#### Key Components

**Download Proxy Endpoint:** `GET /download/:modId/:fileId`

```typescript
// Pseudocode flow:
1. Check if file exists in S3
2. If exists && !stale:
   - Stream from S3 to client
   - Update lastDownloadedAt timestamp
3. If missing or stale:
   - Stream from GameBanana URL to client
   - Simultaneously upload to S3 in background
   - Update mirroredFiles record
```

**Validation Worker:** Background job

```typescript
// Runs periodically (e.g., every 1-6 hours)
1. Query modDownloads for all files
2. For each file:
   - Compare fileSize with database version
   - If different: mark as stale, delete old S3 version
3. Update lastValidated timestamp
```

**Cleanup Worker:** Usage-based retention

```typescript
// Runs daily
1. Query mirroredFiles where lastDownloadedAt > 90 days
2. Delete from S3
3. Remove from mirroredFiles table
```

**Metrics Endpoint:** `GET /metrics`

- Cache hit rate
- Total storage used
- Download counts per file
- Bandwidth savings

### 2. Database Schema Changes

**New table: `mirroredFiles`**

```sql
CREATE TABLE mirrored_files (
  id TEXT PRIMARY KEY,
  mod_download_id TEXT NOT NULL REFERENCES mod_downloads(id),
  s3_key TEXT NOT NULL,
  s3_bucket TEXT NOT NULL,
  file_hash TEXT,
  file_size INTEGER NOT NULL,
  mirrored_at TIMESTAMP NOT NULL,
  last_downloaded_at TIMESTAMP NOT NULL,
  last_validated TIMESTAMP NOT NULL,
  is_stale BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_mirrored_files_mod_download ON mirrored_files(mod_download_id);
CREATE INDEX idx_mirrored_files_last_downloaded ON mirrored_files(last_downloaded_at);
CREATE INDEX idx_mirrored_files_stale ON mirrored_files(is_stale);
```

### 3. API Service Updates

**Modify:** `apps/api/src/routers/v2/mods.ts`

```typescript
// Before:
{
  remoteId: "12345",
  file: "mod.zip",
  url: "https://files.gamebanana.com/...",  // Direct GameBanana
  size: 1024000
}

// After (with feature flag):
{
  remoteId: "12345",
  file: "mod.zip",
  url: env.USE_MIRROR_SERVICE
    ? `${env.MIRROR_SERVICE_URL}/download/${modId}/${fileId}`
    : "https://files.gamebanana.com/...",
  size: 1024000,
  mirrorAvailable: true  // Optional flag for client
}
```

### 4. GameBanana Sync Integration

**Modify:** `apps/api/src/providers/game-banana/index.ts`

```typescript
// In refreshModDownloads() method around line 534:
async refreshModDownloads(modId: string) {
  const downloadPage = await fetchGameBananaDownloadPage(modId);

  for (const file of downloadPage.files) {
    // Existing logic to upsert modDownloads...

    // NEW: Check if mirrored file exists and compare metadata
    const mirroredFile = await db.mirroredFiles.findByModDownloadId(fileId);

    if (mirroredFile && mirroredFile.fileSize !== file._nFilesize) {
      // File changed! Mark as stale
      await db.mirroredFiles.update(fileId, {
        isStale: true,
        lastValidated: new Date()
      });

      // Optional: trigger background re-mirror
      await mirrorService.queueForRemirroring(fileId);
    }
  }
}
```

### 5. S3 Configuration

**Bucket Setup:**

```
Bucket: deadlock-mod-mirror
Region: us-east-1 (or closest to users)
Versioning: Disabled (we handle versions manually)
```

**Lifecycle Rules:**

```
Rule 1: Transition to Glacier after 30 days of no access
Rule 2: Delete incomplete multipart uploads after 7 days
```

**CloudFront CDN:**

```
Origin: S3 bucket
Cache policy: CachingOptimized (24h TTL)
Origin access: Origin Access Identity (OAI)
Compress objects: Yes
```

**IAM Permissions:**

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
      "Resource": "arn:aws:s3:::deadlock-mod-mirror/*"
    }
  ]
}
```

## Implementation Steps

### Phase 1: Foundation (Week 1)

1. Create mirror service skeleton with Hono + Bun
2. Set up project structure in `apps/mirror-service/`
3. Add database schema for `mirroredFiles` table
4. Create Drizzle ORM repositories for new table
5. Set up S3 client and test connectivity

### Phase 2: Core Download Proxy (Week 1-2)

6. Implement `GET /download/:modId/:fileId` endpoint
7. Build S3 check logic (key format: `mods/{modId}/{fileId}/{filename}`)
8. Implement stream-through from GameBanana to client
9. Add background S3 upload pipeline with multipart support
10. Add error handling and retry logic

### Phase 3: Validation & Staleness (Week 2)

11. Create validation worker with periodic scheduling
12. Build staleness detection (compare size from database)
13. Add logic to mark files as stale and delete old S3 versions
14. Update `lastValidated` timestamps

### Phase 4: Storage Optimization (Week 3)

16. Implement usage tracking for `lastDownloadedAt`
17. Create cleanup job for unused files (90-day retention)
18. Add automatic deletion of old file versions
19. Set up S3 lifecycle policies for Glacier transition
20. Add storage metrics and monitoring

### Phase 5: Integration (Week 3-4)

21. Add feature flag to API service (`USE_MIRROR_SERVICE`)
22. Update `apps/api/src/routers/v2/mods.ts` to return mirror URLs
23. Integrate staleness checking into `refreshModDownloads()`
24. Add queue system for re-mirroring changed files
25. Test end-to-end flow with real mods

### Phase 6: Infrastructure & Deployment (Week 4)

26. Set up S3 bucket with proper permissions
27. Configure CloudFront distribution
28. Deploy mirror service to production environment
29. Set up monitoring (CloudWatch, Datadog, etc.)
30. Create alerting for high error rates or storage costs

### Phase 7: Rollout & Optimization (Week 5)

31. Gradual rollout with feature flag (10% → 50% → 100%)
32. Monitor cache hit rates and performance
33. Tune validation frequency based on file change patterns
34. Optimize S3 multipart upload chunk sizes
35. Document API and operational procedures

## Key Technical Decisions

### Staleness Detection Strategy

- **Polling Frequency:** Every 1-6 hours (configurable)
- **Detection Method:** Compare file size from GameBanana API vs S3
- **Alternative:** Could use ETag or last-modified headers if available
- **Optimization:** Only check files downloaded in last 30 days to reduce API calls

### Cache Miss Strategy

**Proxy-through approach:**

```
Client Request → Mirror Service
  ↓
  ├─→ Stream from GameBanana → Client (immediate response)
  └─→ Upload to S3 (background, non-blocking)
```

**Benefits:**

- First user doesn't wait for S3 upload
- No additional latency vs direct GameBanana
- Subsequent users get fast S3/CDN delivery

### Storage Optimization

1. **Delete old versions immediately** when new version detected
2. **Usage-based retention:** Purge files not downloaded in 90 days
3. **S3 lifecycle:** Auto-transition to Glacier after 30 days
4. **Metrics-driven:** Monitor cost per GB and adjust retention policy

### Technology Stack

- **Runtime:** Bun (matches existing API, excellent streaming performance)
- **Framework:** Hono (consistent with `apps/api`)
- **ORM:** Drizzle (existing choice)
- **S3 Client:** `@aws-sdk/client-s3` with `@aws-sdk/lib-storage` for multipart
- **Job Scheduling:** `node-cron` or Bun's built-in scheduler
- **CDN:** CloudFront (native AWS integration)

### S3 Key Structure

```
Format: mods/{modId}/{fileId}/{filename}
Example: mods/mod_abc123/file_xyz789/cool_skin.zip

Benefits:
- Easy to organize and browse
- Simple to delete all files for a mod
- Clear relationship between database and S3
```

## Monitoring & Metrics

### Key Metrics to Track

1. **Cache Hit Rate:** `(S3 serves) / (total requests)`
2. **Storage Cost:** Total GB stored × S3 pricing
3. **Bandwidth Savings:** GB served from S3 vs GameBanana
4. **Staleness Rate:** % of files updated in each validation run
5. **Error Rate:** Failed downloads, S3 errors, GameBanana timeouts
6. **Average Download Speed:** Compare S3/CDN vs GameBanana

### Alerting

- Cache hit rate < 70%
- Storage cost > $X/month
- Error rate > 5%
- Validation worker failed to run

## Cost Estimation

### S3 Storage

- Average mod size: ~50MB
- Total mods: ~1000 (estimate)
- Total storage: 50GB
- S3 cost: ~$1.15/month (standard), ~$0.20/month (Glacier)

### Data Transfer

- Average downloads: 10,000/month
- Average size: 50MB
- Data out: 500GB/month
- CloudFront cost: ~$42.50/month (first 10TB tier)

### Total Estimated Cost

- **Without optimization:** ~$45/month
- **With Glacier + retention:** ~$30/month
- **ROI:** Improved user experience + reduced GameBanana rate limiting

## Benefits

1. **Faster Downloads:** CDN edge caching + S3 performance
2. **Reduced Rate Limiting:** Offload traffic from GameBanana
3. **Automatic Staleness Detection:** Always serve up-to-date files
4. **Cost-Optimized Storage:** Usage-based retention + Glacier
5. **Better UX:** More reliable downloads with retry logic
6. **Analytics:** Track popular mods, download patterns

## Future Enhancements

1. **Pre-warming:** Proactively mirror popular mods before users request them
2. **Delta Updates:** Only download changed parts of files
3. **Multi-region:** Deploy to multiple regions for global users
4. **P2P Distribution:** BitTorrent-style sharing between users
5. **Smart Mirroring:** ML-based prediction of which mods to mirror

## References

### Key Files to Modify

- `apps/api/src/providers/game-banana/index.ts:534` - refreshModDownloads()
- `apps/api/src/routers/v2/mods.ts` - Download URL response
- `packages/database/src/schema/mods.ts` - Add mirroredFiles table
- `packages/database/src/repositories/` - New repository for mirroredFiles

### New Files to Create

- `apps/mirror-service/src/index.ts` - Main service entry
- `apps/mirror-service/src/routes/download.ts` - Proxy endpoint
- `apps/mirror-service/src/workers/validation.ts` - Staleness checker
- `apps/mirror-service/src/workers/cleanup.ts` - Storage optimization
- `apps/mirror-service/src/services/s3.ts` - S3 upload/download
- `apps/mirror-service/src/services/gamebanana.ts` - Metadata fetching

## Notes

- Ensure GameBanana ToS allows mirroring (check robots.txt and terms)
- Consider rate limiting mirror service to prevent abuse
- Add authentication if mirror service is public-facing
- Monitor GameBanana API for changes to download URL structure
- Set up proper logging for debugging and auditing
