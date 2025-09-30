# Download Manager Rust Backend Refactor - Implementation Plan

## Overview

This document outlines the plan to refactor the download system from client-side (using Tauri plugins) to a Rust backend download manager. The new system will handle mod downloads entirely in Rust while maintaining the existing UI/UX.

## Current Implementation Analysis

### Client-Side Architecture (Current)

- **Download Plugin**: Uses `@tauri-apps/plugin-upload` for downloads
- **Download Manager**: TypeScript class that manages queue and progress
- **Location**: `apps/desktop/src/lib/download/manager.ts`
- **Flow**:
  1. User selects mod → `useDownload` hook
  2. Multi-file selection via `MultiFileDownloadDialog`
  3. Files queued in `DownloadManager`
  4. Downloads via Tauri plugin's `download()` function
  5. Progress throttled and stored in Zustand store
  6. Callbacks trigger UI updates

### Current Features

- ✅ Multi-file download support
- ✅ File selection dialog
- ✅ Concurrent downloads (Promise.allSettled)
- ✅ Progress tracking with throttling (500ms)
- ✅ Transfer speed calculation
- ✅ onStart/onProgress/onComplete/onError callbacks
- ✅ Queue management

## Proposed Rust Backend Architecture

### New Rust Modules

#### 1. `download_manager.rs` - Main Download Manager

Location: `apps/desktop/src-tauri/src/download_manager/mod.rs`

**Responsibilities**:

- Manage download queue
- Process downloads sequentially (one mod at a time)
- Coordinate with HTTP downloader
- Emit events to frontend
- Handle state management

**Key Structures**:

```rust
pub struct DownloadManager {
    queue: Arc<Mutex<VecDeque<DownloadTask>>>,
    active_downloads: Arc<Mutex<HashMap<String, DownloadHandle>>>,
    app_handle: AppHandle,
}

pub struct DownloadTask {
    mod_id: String,
    mod_name: String,
    files: Vec<DownloadFile>,
    target_dir: PathBuf,
}

pub struct DownloadFile {
    url: String,
    name: String,
    size: u64,
}

pub struct DownloadHandle {
    cancel_token: CancellationToken,
    progress: Arc<Mutex<DownloadProgress>>,
}

pub struct DownloadProgress {
    file_index: usize,
    downloaded: u64,
    total: u64,
    speed: f64,
}
```

#### 2. `downloader.rs` - HTTP Downloader

Location: `apps/desktop/src-tauri/src/download_manager/downloader.rs`

**Responsibilities**:

- Execute HTTP downloads using `reqwest`
- Stream files to disk
- Track download progress
- Calculate transfer speed
- Handle retries and errors

**Key Functions**:

```rust
pub async fn download_file(
    url: &str,
    target_path: &Path,
    on_progress: impl Fn(DownloadProgress),
    cancel_token: CancellationToken,
) -> Result<(), Error>
```

#### 3. Event Payloads

```rust
#[derive(Clone, Serialize)]
pub struct DownloadStartedEvent {
    mod_id: String,
}

#[derive(Clone, Serialize)]
pub struct DownloadProgressEvent {
    mod_id: String,
    file_index: usize,
    total_files: usize,
    progress: u64,
    progress_total: u64,
    total: u64,
    transfer_speed: f64,
    percentage: f64,
}

#[derive(Clone, Serialize)]
pub struct DownloadCompletedEvent {
    mod_id: String,
    path: String,
}

#[derive(Clone, Serialize)]
pub struct DownloadErrorEvent {
    mod_id: String,
    error: String,
}
```

### New Tauri Commands

```rust
#[tauri::command]
async fn queue_download(
    mod_id: String,
    mod_name: String,
    files: Vec<DownloadFileDto>,
) -> Result<(), Error>

#[tauri::command]
async fn cancel_download(
    mod_id: String,
) -> Result<(), Error>

#[tauri::command]
async fn get_download_status(
    mod_id: String,
) -> Result<Option<DownloadStatus>, Error>

#[tauri::command]
async fn get_all_downloads() -> Result<Vec<DownloadStatus>, Error>
```

### Events Emitted to Frontend

| Event Name           | Payload                                                      | When                        |
| -------------------- | ------------------------------------------------------------ | --------------------------- |
| `download-started`   | `{ mod_id }`                                                 | Download begins             |
| `download-progress`  | `{ mod_id, file_index, progress, total, speed, percentage }` | Every 500ms during download |
| `download-completed` | `{ mod_id, path }`                                           | Download succeeds           |
| `download-error`     | `{ mod_id, error }`                                          | Download fails              |

## Frontend Changes

### 1. Update Download Manager (`src/lib/download/manager.ts`)

**Before**:

```typescript
private async downloadFiles(mod: DownloadableMod, modDir: string) {
  await Promise.allSettled(
    mod.downloads.map(async (file, index) => {
      await download(file.url, await join(modDir, file.name), (progress) => {
        this.throttledProgressUpdate(mod, progress, index);
      });
    }),
  );
  mod.onComplete(modDir);
}
```

**After**:

```typescript
private async downloadFiles(mod: DownloadableMod, modDir: string) {
  // Queue download in Rust backend
  await invoke('queue_download', {
    modId: mod.remoteId,
    modName: mod.name,
    files: mod.downloads.map(d => ({
      url: d.url,
      name: d.name,
      size: d.size || 0,
    })),
  });
}
```

### 2. Add Event Listeners

In `DownloadManager` constructor or init:

```typescript
async init() {
  await createIfNotExists("mods");

  // Listen to download events from Rust
  await listen<DownloadStartedEvent>('download-started', (event) => {
    const mod = this.findModById(event.payload.mod_id);
    if (mod) mod.onStart();
  });

  await listen<DownloadProgressEvent>('download-progress', (event) => {
    const mod = this.findModById(event.payload.mod_id);
    if (mod) {
      mod.onProgress({
        progress: event.payload.progress,
        progressTotal: event.payload.progress_total,
        total: event.payload.total,
        transferSpeed: event.payload.transfer_speed,
      });
    }
  });

  await listen<DownloadCompletedEvent>('download-completed', (event) => {
    const mod = this.findModById(event.payload.mod_id);
    if (mod) mod.onComplete(event.payload.path);
  });

  await listen<DownloadErrorEvent>('download-error', (event) => {
    const mod = this.findModById(event.payload.mod_id);
    if (mod) mod.onError(new Error(event.payload.error));
  });

  logger.info("Download manager initialized");
}
```

### 3. Simplify Queue Management

The Rust backend will handle queueing, so the TypeScript `DownloadManager` can be simplified:

- Remove `queue` array
- Remove `process()` method
- Keep callbacks registry to map events to callbacks
- Add helper to track pending downloads

### 4. No Changes Needed For:

- ✅ `useDownload` hook - same interface
- ✅ `MultiFileDownloadDialog` - no changes
- ✅ `DownloadCard` - no changes
- ✅ `ModButton` - no changes
- ✅ Store/state management - no changes

## Implementation Steps

### Phase 1: Rust Backend Core

1. **Create download manager module structure**

   - [ ] Create `apps/desktop/src-tauri/src/download_manager/mod.rs`
   - [ ] Create `apps/desktop/src-tauri/src/download_manager/downloader.rs`
   - [ ] Add module to `lib.rs`

2. **Implement downloader.rs**

   - [ ] HTTP download with `reqwest` streaming
   - [ ] Progress tracking with throttling
   - [ ] Speed calculation
   - [ ] File writing with proper buffering
   - [ ] Cancellation support
   - [ ] Error handling and retries

3. **Implement download_manager.rs**

   - [ ] Queue data structure
   - [ ] Add to queue functionality
   - [ ] Process queue (spawn task per download)
   - [ ] Event emission
   - [ ] State tracking
   - [ ] Cancellation support

4. **Add Error types**

   - [ ] Add download-related errors to `errors.rs`:
     - `DownloadFailed`
     - `DownloadCancelled`
     - `InvalidDownloadUrl`
     - `FileWriteFailed`

5. **Create Tauri commands**
   - [ ] `queue_download`
   - [ ] `cancel_download`
   - [ ] `get_download_status`
   - [ ] `get_all_downloads`
   - [ ] Register commands in `lib.rs`

### Phase 2: Frontend Integration

6. **Update Download Manager (TypeScript)**

   - [ ] Remove Tauri plugin usage
   - [ ] Add event listeners
   - [ ] Replace `downloadFiles` implementation
   - [ ] Simplify queue management
   - [ ] Keep callback tracking

7. **Update dependencies**

   - [ ] Remove `@tauri-apps/plugin-upload` from `package.json`
   - [ ] Remove plugin initialization from `lib.rs`
   - [ ] Add any new TypeScript types

8. **Add TypeScript types**
   - [ ] Event payload types
   - [ ] Download status types

### Phase 3: Testing & Refinement

9. **Test scenarios**

   - [ ] Single file download
   - [ ] Multi-file download
   - [ ] Multiple mods queued
   - [ ] Download cancellation
   - [ ] Error handling
   - [ ] Progress reporting accuracy
   - [ ] Speed calculation accuracy
   - [ ] Large file downloads (>100MB)
   - [ ] Slow connection handling
   - [ ] Network interruption recovery

10. **Performance optimization**

    - [ ] Tune progress throttling
    - [ ] Optimize buffer sizes
    - [ ] Memory usage profiling
    - [ ] Concurrent file downloads within a mod

11. **Error handling improvements**
    - [ ] Retry logic for transient failures
    - [ ] Better error messages
    - [ ] Partial download cleanup

### Phase 4: Polish

12. **Additional features** (Optional)
    - [ ] Pause/resume support
    - [ ] Download speed limiting
    - [ ] Bandwidth usage statistics
    - [ ] Download history/logs

## Technical Details

### Progress Throttling

- **Backend**: Throttle event emission to every 500ms (same as current)
- **Frontend**: Receive events and update store immediately
- **Implementation**: Use `tokio::time::Instant` to track last emission time

### Concurrent Downloads

- **Within a mod**: Download files in parallel (using `tokio::task::JoinSet`)
- **Between mods**: Process sequentially from queue (one mod at a time)
- **Configurable**: Can make concurrent mod downloads configurable

### File Writing

- Use buffered writing to avoid excessive system calls
- Stream response body directly to file
- Use `tokio::fs::File` for async I/O

### Speed Calculation

```rust
let elapsed = start_time.elapsed().as_secs_f64();
let speed = if elapsed > 0.0 {
    downloaded_bytes as f64 / elapsed
} else {
    0.0
};
```

### Cancellation

- Use `tokio_util::sync::CancellationToken`
- Check token between chunks
- Clean up partial downloads on cancellation

## Migration Strategy

### Backward Compatibility

1. Keep both implementations temporarily
2. Add feature flag or environment variable to toggle
3. Test new implementation thoroughly
4. Remove old implementation after validation

### Rollback Plan

If issues arise:

1. Revert frontend changes
2. Re-add Tauri plugin
3. Restore original download manager

## Dependencies to Add

### Rust (`Cargo.toml`)

```toml
tokio-util = { version = "0.7", features = ["sync"] }
futures = "0.3"
```

**Already available**:

- `reqwest` - HTTP client ✓
- `tokio` - Async runtime ✓
- `serde` - Serialization ✓

### TypeScript

- Remove: `@tauri-apps/plugin-upload`
- No new dependencies needed

## Success Criteria

- ✅ All download features work as before
- ✅ Progress reporting is accurate and smooth
- ✅ Multi-file downloads work correctly
- ✅ UI remains unchanged
- ✅ No regressions in existing functionality
- ✅ Better performance or equivalent
- ✅ Proper error handling and user feedback
- ✅ Memory usage is reasonable for large downloads
- ✅ Downloads can be cancelled cleanly

## Risks & Mitigations

| Risk                                 | Impact | Mitigation                                            |
| ------------------------------------ | ------ | ----------------------------------------------------- |
| Breaking existing download UX        | High   | Keep old implementation as fallback during transition |
| Performance degradation              | Medium | Benchmark before/after, optimize as needed            |
| Memory issues with large files       | Medium | Use streaming, test with large files                  |
| Platform-specific file system issues | Medium | Test on Windows, macOS, Linux                         |
| Network error handling gaps          | Medium | Comprehensive error handling, retries                 |

## Timeline Estimate

- **Phase 1** (Rust Backend): 2-3 days
- **Phase 2** (Frontend Integration): 1 day
- **Phase 3** (Testing): 1-2 days
- **Phase 4** (Polish): 1 day

**Total**: 5-7 days for a complete, tested implementation

## Future Enhancements

After initial implementation:

1. **Download resumption** - Resume interrupted downloads
2. **Parallel mod downloads** - Download multiple mods concurrently
3. **Bandwidth limiting** - User-configurable download speed limits
4. **Download scheduling** - Schedule downloads for later
5. **Download verification** - Verify file integrity after download (checksums)
6. **Download statistics** - Track total downloaded, average speed, etc.
7. **Mirroring support** - Try alternative mirrors if primary fails

## Questions to Consider

1. **Should we download mod files in parallel or sequentially within a mod?**
   - **Recommendation**: Parallel (current behavior) for faster downloads
2. **Should we process multiple mods from the queue concurrently?**
   - **Recommendation**: Sequential initially, make configurable later
3. **What buffer size should we use for file writing?**
   - **Recommendation**: 64KB - 128KB (test and optimize)
4. **Should we implement retry logic?**
   - **Recommendation**: Yes, up to 3 retries with exponential backoff
5. **Should partial downloads be cleaned up on error?**
   - **Recommendation**: Yes, delete incomplete files to avoid corruption

## Conclusion

This refactor will move download logic from the frontend to a Rust backend, providing:

- Better control over downloads
- Improved error handling
- Foundation for future enhancements
- Separation of concerns (UI vs business logic)
- Potentially better performance

The implementation maintains backward compatibility in the UI while modernizing the download architecture.
