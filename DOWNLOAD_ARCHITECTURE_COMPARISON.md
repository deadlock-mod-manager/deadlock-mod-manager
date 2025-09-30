# Download Architecture Comparison

## Current Architecture (Client-Side)

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend (React)                      │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────┐      ┌─────────────────┐                 │
│  │  ModButton   │─────▶│  useDownload    │                 │
│  └──────────────┘      └────────┬────────┘                 │
│                                  │                            │
│                                  ▼                            │
│                    ┌─────────────────────────┐              │
│                    │ MultiFileDownloadDialog │              │
│                    └────────────┬────────────┘              │
│                                  │                            │
│                                  ▼                            │
│                    ┌─────────────────────────┐              │
│                    │  DownloadManager (TS)   │              │
│                    │  ├─ Queue Management    │              │
│                    │  ├─ Progress Throttling │              │
│                    │  └─ Callback Handling   │              │
│                    └────────────┬────────────┘              │
│                                  │                            │
│                                  ▼                            │
│                    ┌─────────────────────────┐              │
│                    │ @tauri-apps/plugin-     │              │
│                    │      upload.download()  │              │
│                    └────────────┬────────────┘              │
└─────────────────────────────────┼────────────────────────────┘
                                  │
                                  ▼
                         ┌────────────────┐
                         │  Tauri Plugin  │
                         │  (Downloads)   │
                         └────────┬───────┘
                                  │
                                  ▼
                            [ File System ]
```

**Data Flow**:

1. User clicks download → ModButton
2. useDownload hook fetches available files
3. MultiFileDownloadDialog shows file selection (if multiple)
4. User selects files → downloadSelectedFiles()
5. Files added to DownloadManager queue
6. DownloadManager.process() calls Tauri plugin's download()
7. Plugin downloads file with progress callbacks
8. Progress throttled (500ms) and sent to store
9. File saved to disk
10. onComplete callback fired

**Issues**:

- Download logic in frontend (TypeScript)
- Relies on external Tauri plugin
- Limited control over download process
- Progress throttling in frontend
- Hard to add advanced features (retry, pause/resume, etc.)

---

## Proposed Architecture (Rust Backend)

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend (React)                      │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────┐      ┌─────────────────┐                 │
│  │  ModButton   │─────▶│  useDownload    │                 │
│  └──────────────┘      └────────┬────────┘                 │
│                                  │                            │
│                                  ▼                            │
│                    ┌─────────────────────────┐              │
│                    │ MultiFileDownloadDialog │              │
│                    └────────────┬────────────┘              │
│                                  │                            │
│                                  ▼                            │
│                    ┌─────────────────────────┐              │
│                    │  DownloadManager (TS)   │              │
│                    │  ├─ Callback Registry   │              │
│                    │  ├─ Event Listeners     │              │
│                    │  └─ Invoke Rust Commands│              │
│                    └────────────┬────────────┘              │
│                                  │                            │
│                                  │ invoke('queue_download')  │
│                                  ▼                            │
╞═════════════════════════════════╪═════════════════════════════╡
│                        Rust Backend (Tauri)                  │
│                                  │                            │
│                                  ▼                            │
│                    ┌─────────────────────────┐              │
│                    │  Tauri Commands         │              │
│                    │  ├─ queue_download()    │              │
│                    │  ├─ cancel_download()   │              │
│                    │  └─ get_download_status()│             │
│                    └────────────┬────────────┘              │
│                                  │                            │
│                                  ▼                            │
│                    ┌─────────────────────────┐              │
│                    │  DownloadManager (Rust) │              │
│                    │  ├─ Queue Management    │              │
│                    │  ├─ Task Spawning       │              │
│                    │  ├─ State Tracking      │              │
│                    │  └─ Event Emission      │              │
│                    └────────────┬────────────┘              │
│                                  │                            │
│                    ┌─────────────┴────────────┐             │
│                    │ For each file in parallel│             │
│                    └─────────────┬────────────┘             │
│                                  ▼                            │
│                    ┌─────────────────────────┐              │
│                    │   Downloader (Rust)     │              │
│                    │   ├─ HTTP Request       │              │
│                    │   ├─ Stream to Disk     │              │
│                    │   ├─ Progress Tracking  │              │
│                    │   ├─ Speed Calculation  │              │
│                    │   └─ Cancellation       │              │
│                    └────────────┬────────────┘              │
│                                  │                            │
│                  emit events ────┘                           │
│                  (download-progress,                         │
│                   download-completed, etc.)                  │
│                                  │                            │
└──────────────────────────────────┼──────────────────────────┘
                                  │
                                  ▼
                            [ File System ]
                                  │
                                  │ listen to events
                                  ▼
┌─────────────────────────────────────────────────────────────┐
│                     Frontend Event Handlers                  │
│                                                               │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ listen('download-started')    → mod.onStart()        │  │
│  │ listen('download-progress')   → mod.onProgress()     │  │
│  │ listen('download-completed')  → mod.onComplete()     │  │
│  │ listen('download-error')      → mod.onError()        │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

**Data Flow**:

1. User clicks download → ModButton
2. useDownload hook fetches available files
3. MultiFileDownloadDialog shows file selection (if multiple)
4. User selects files → downloadSelectedFiles()
5. **DownloadManager invokes `queue_download` Tauri command**
6. **Rust DownloadManager adds to queue**
7. **Rust spawns download task**
8. **Downloader executes HTTP download with reqwest**
9. **Progress events emitted (throttled at 500ms)**
10. **Frontend event listeners receive events**
11. **Callbacks fired (onProgress, onComplete, etc.)**
12. **UI updates via store**

**Benefits**:

- ✅ Download logic in Rust (better performance, control)
- ✅ No dependency on external plugins
- ✅ Easy to add advanced features (retry, pause/resume)
- ✅ Progress throttling in Rust (more efficient)
- ✅ Better error handling
- ✅ Foundation for future enhancements
- ✅ Separation of concerns (UI vs business logic)

---

## Key Differences

| Aspect                  | Current (Client-Side)       | Proposed (Rust Backend) |
| ----------------------- | --------------------------- | ----------------------- |
| **Download Logic**      | TypeScript                  | Rust                    |
| **HTTP Client**         | Tauri Plugin                | `reqwest`               |
| **Queue Management**    | TypeScript                  | Rust                    |
| **Progress Throttling** | TypeScript                  | Rust                    |
| **Event System**        | Callbacks                   | Tauri Events            |
| **Cancellation**        | Limited                     | Full support            |
| **Retries**             | None                        | Configurable            |
| **Dependencies**        | `@tauri-apps/plugin-upload` | Built-in                |
| **Performance**         | Good                        | Better                  |
| **Extensibility**       | Limited                     | High                    |

---

## Frontend Changes Summary

### Files Modified

1. **`apps/desktop/src/lib/download/manager.ts`**

   - Remove Tauri plugin usage
   - Add event listeners for Rust events
   - Replace `downloadFiles()` to invoke Rust command
   - Simplify queue (Rust handles it now)

2. **`apps/desktop/package.json`**

   - Remove `@tauri-apps/plugin-upload`

3. **`apps/desktop/src/types/mods.ts`**
   - Add event payload types

### Files NOT Changed

- ✅ `useDownload` hook - same interface
- ✅ `MultiFileDownloadDialog` - no UI changes
- ✅ `DownloadCard` - no UI changes
- ✅ `ModButton` - no UI changes
- ✅ Store/state management - same API

---

## Rust Backend Structure

```
apps/desktop/src-tauri/src/
├── download_manager/
│   ├── mod.rs                 # DownloadManager struct, queue management, events
│   └── downloader.rs          # HTTP download implementation
├── commands.rs                # Add download commands
├── errors.rs                  # Add download errors
└── lib.rs                     # Register commands and module
```

---

## Event Flow Example

### Single File Download

```
Frontend                          Rust Backend
   │                                   │
   │  invoke('queue_download')         │
   │──────────────────────────────────▶│
   │                                   │ Add to queue
   │                                   │ Spawn download task
   │                                   │
   │◀──────────────────────────────────│ emit('download-started')
   │                                   │
   │◀──────────────────────────────────│ emit('download-progress') [every 500ms]
   │                                   │
   │◀──────────────────────────────────│ emit('download-progress')
   │                                   │
   │◀──────────────────────────────────│ emit('download-completed')
   │                                   │
```

### Multi-File Download

```
Frontend                          Rust Backend
   │                                   │
   │  invoke('queue_download')         │
   │  files: [file1, file2, file3]     │
   │──────────────────────────────────▶│
   │                                   │ Add to queue
   │                                   │ Spawn download task
   │                                   │
   │◀──────────────────────────────────│ emit('download-started')
   │                                   │
   │                                   ├─ Download file1 (parallel)
   │                                   ├─ Download file2 (parallel)
   │                                   └─ Download file3 (parallel)
   │                                   │
   │◀──────────────────────────────────│ emit('download-progress', file_index: 0)
   │◀──────────────────────────────────│ emit('download-progress', file_index: 1)
   │◀──────────────────────────────────│ emit('download-progress', file_index: 2)
   │                                   │
   │◀──────────────────────────────────│ emit('download-progress', file_index: 0)
   │◀──────────────────────────────────│ emit('download-progress', file_index: 1)
   │                                   │
   │◀──────────────────────────────────│ emit('download-completed')
   │                                   │  (when all files complete)
```

---

## Migration Path

1. **Phase 1**: Implement Rust backend (no frontend changes yet)
2. **Phase 2**: Add feature flag to toggle between old/new implementation
3. **Phase 3**: Test new implementation thoroughly
4. **Phase 4**: Make new implementation default
5. **Phase 5**: Remove old implementation and Tauri plugin

This allows safe migration with easy rollback if needed.
