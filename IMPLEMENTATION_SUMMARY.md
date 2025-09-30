# Download Manager Rust Backend - Implementation Summary

## Executive Summary

This document provides a high-level overview of the proposed refactor to move download logic from the frontend (using Tauri plugins) to a Rust backend download manager.

## Current State

### What Works Well

- ✅ Multi-file download support with file selection UI
- ✅ Progress tracking and speed calculation
- ✅ Queue management
- ✅ Callback-based architecture for UI updates

### What Needs Improvement

- ❌ Download logic in TypeScript (performance, control)
- ❌ Dependency on external Tauri plugin
- ❌ Limited extensibility (hard to add pause/resume, retries, etc.)
- ❌ Progress throttling done in frontend

## Proposed Solution

Move all download logic to Rust backend while keeping the UI unchanged.

### High-Level Architecture

```
┌──────────────────┐
│   React UI       │  No changes to components
│  (Same hooks,    │  Same callbacks
│   same dialogs)  │  Same user experience
└────────┬─────────┘
         │ invoke('queue_download')
         ▼
┌──────────────────┐
│  Rust Backend    │  NEW: Download manager
│  - Queue         │  NEW: HTTP downloader
│  - HTTP download │  NEW: Progress tracking
│  - File I/O      │  NEW: Event emission
└────────┬─────────┘
         │ emit events
         ▼
┌──────────────────┐
│  Event Listeners │  Listen to Rust events
│  in TypeScript   │  Fire existing callbacks
└──────────────────┘
```

## Key Changes

### Rust Backend (NEW)

**Module**: `apps/desktop/src-tauri/src/download_manager/`

1. **`mod.rs`** - Download Manager

   - Queue management
   - Task spawning
   - Event emission
   - State tracking

2. **`downloader.rs`** - HTTP Downloader
   - HTTP requests with `reqwest`
   - Stream to disk
   - Progress tracking
   - Speed calculation
   - Cancellation support

**Commands**:

- `queue_download(mod_id, mod_name, files)` - Queue a download
- `cancel_download(mod_id)` - Cancel ongoing download
- `get_download_status(mod_id)` - Get download status

**Events**:

- `download-started` - Download begins
- `download-progress` - Progress update (every 500ms)
- `download-completed` - Download finished
- `download-error` - Download failed

### Frontend Changes

**Modified Files**:

1. `apps/desktop/src/lib/download/manager.ts`

   - Replace Tauri plugin with Rust commands
   - Add event listeners
   - Simplify queue (Rust handles it)

2. `apps/desktop/package.json`
   - Remove `@tauri-apps/plugin-upload`

**Unchanged**:

- ✅ `useDownload` hook
- ✅ `MultiFileDownloadDialog`
- ✅ `DownloadCard`
- ✅ `ModButton`
- ✅ All UI components
- ✅ State management

## Benefits

1. **Better Performance** - Native Rust implementation
2. **More Control** - Full control over download process
3. **No Plugin Dependency** - Self-contained solution
4. **Extensible** - Easy to add features like:
   - Pause/resume
   - Retry logic
   - Download speed limiting
   - Mirror support
5. **Better Error Handling** - Comprehensive error management in Rust
6. **Separation of Concerns** - Business logic in backend, UI in frontend

## Implementation Timeline

| Phase                       | Tasks                                               | Estimated Time |
| --------------------------- | --------------------------------------------------- | -------------- |
| **1. Rust Backend**         | Download manager, HTTP downloader, commands         | 2-3 days       |
| **2. Frontend Integration** | Update TypeScript download manager, event listeners | 1 day          |
| **3. Testing**              | All download scenarios, edge cases                  | 1-2 days       |
| **4. Polish**               | Optimization, error handling refinement             | 1 day          |
| **Total**                   |                                                     | **5-7 days**   |

## Testing Checklist

Must test:

- [ ] Single file download
- [ ] Multi-file download (user selects files)
- [ ] Multiple mods queued
- [ ] Download progress accuracy
- [ ] Speed calculation
- [ ] Download cancellation
- [ ] Error handling (network errors, invalid URLs, etc.)
- [ ] Large file downloads (>100MB)
- [ ] Slow connection handling
- [ ] Partial download cleanup on error

## Risk Mitigation

1. **Keep old implementation as fallback** during development
2. **Feature flag** to toggle between old/new
3. **Extensive testing** before full rollout
4. **Easy rollback** if issues arise

## Success Criteria

- ✅ All existing download features work
- ✅ No UI changes from user perspective
- ✅ Performance same or better
- ✅ No regressions
- ✅ Clean error handling
- ✅ Proper progress reporting

## Next Steps

1. **Review** this implementation plan
2. **Confirm** approach and architecture
3. **Start** with Phase 1 (Rust backend)
4. **Iterate** with testing and feedback

## Questions?

If you have questions or want to discuss the approach:

- Review `DOWNLOAD_MANAGER_REFACTOR_PLAN.md` for detailed implementation
- Review `DOWNLOAD_ARCHITECTURE_COMPARISON.md` for architecture comparison
- Check existing code patterns in `apps/desktop/src-tauri/src/`

---

**Ready to proceed?** Let's start with implementing the Rust backend! 🚀
