use super::modding_image_compiler;
use crate::{
  app_runtime::{AppHandle, AppRuntime},
  errors::Error,
};
use notify::{
  Config, Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher, event::ModifyKind,
};
use std::{
  collections::HashMap,
  path::{Path, PathBuf},
  sync::{
    LazyLock, Mutex,
    atomic::{AtomicU64, Ordering},
    mpsc::{self, RecvTimeoutError},
  },
  time::Duration,
};
use tauri::Emitter;

pub const CHANGED_EVENT: &str = "workbench-image-compiler-changed";
struct ImageWatch {
  owner: String,
  _watcher: RecommendedWatcher,
}
static WATCHERS: LazyLock<Mutex<HashMap<String, ImageWatch>>> =
  LazyLock::new(|| Mutex::new(HashMap::new()));
static NEXT_ID: AtomicU64 = AtomicU64::new(1);

fn relevant(root: &Path, event: &Event) -> bool {
  event.paths.iter().any(|path| {
    let Ok(path) = path.strip_prefix(root) else {
      return false;
    };
    let path = path
      .to_string_lossy()
      .replace('\\', "/")
      .to_ascii_lowercase();
    let compiler = path == "image_compiler.vdata" || path == "panorama/image_compiler.vdata";
    let images =
      path == "panorama" || path == "panorama/images" || path.starts_with("panorama/images/");
    (compiler || images)
      && matches!(
        event.kind,
        EventKind::Create(_) | EventKind::Remove(_) | EventKind::Modify(ModifyKind::Name(_))
      )
      || compiler && matches!(event.kind, EventKind::Modify(ModifyKind::Data(_)))
  })
}

fn watch(
  root: PathBuf,
  report: impl Fn(Result<Vec<PathBuf>, Error>) + Send + 'static,
) -> Result<RecommendedWatcher, Error> {
  let (tx, rx) = mpsc::channel();
  let watched = root.clone();
  let mut watcher = RecommendedWatcher::new(
    move |result: notify::Result<Event>| match result {
      Ok(event) if relevant(&watched, &event) => {
        let _ = tx.send(Ok(()));
      }
      Err(error) => {
        let _ = tx.send(Err(error.to_string()));
      }
      _ => {}
    },
    Config::default().with_follow_symlinks(false),
  )
  .map_err(|error| Error::InvalidInput(format!("Cannot watch addon images: {error}")))?;
  watcher
    .watch(&root, RecursiveMode::Recursive)
    .map_err(|error| Error::InvalidInput(format!("Cannot watch addon images: {error}")))?;
  std::thread::spawn(move || {
    while let Ok(change) = rx.recv() {
      if let Err(error) = change {
        report(Err(Error::InvalidInput(error)));
        continue;
      }
      loop {
        match rx.recv_timeout(Duration::from_millis(300)) {
          Ok(Ok(())) => continue,
          Ok(Err(error)) => report(Err(Error::InvalidInput(error))),
          Err(RecvTimeoutError::Timeout) => break,
          Err(RecvTimeoutError::Disconnected) => return,
        }
      }
      report(modding_image_compiler::sync(&root));
    }
  });
  Ok(watcher)
}

fn report(app: &AppHandle, addon_id: &str, result: Result<Vec<PathBuf>, Error>) {
  let error = match result {
    Ok(_) => None,
    Err(error) => Some(error.to_string()),
  };
  if let Err(error) = app.emit(CHANGED_EVENT, (addon_id, error)) {
    log::warn!("Failed to report image compiler update: {error}");
  }
}

#[tauri::command]
pub async fn watch_modding_addon_images(
  app: AppHandle,
  window: tauri::WebviewWindow<AppRuntime>,
  addon_id: String,
) -> Result<String, Error> {
  let addon = super::modding_workspace::resolve(&app, &addon_id)?;
  let owner = window.label().to_owned();
  tauri::async_runtime::spawn_blocking(move || {
    let root = PathBuf::from(addon.content_path);
    std::fs::create_dir_all(&root)?;
    let reporter = app.clone();
    let watched_addon = addon_id.clone();
    let watcher = watch(root.clone(), move |result| {
      report(&reporter, &watched_addon, result)
    })?;
    let initial = modding_image_compiler::sync(&root)?;
    report(&app, &addon_id, Ok(initial));
    let id = NEXT_ID.fetch_add(1, Ordering::Relaxed).to_string();
    WATCHERS
      .lock()
      .map_err(|error| Error::BackgroundTaskFailed(error.to_string()))?
      .insert(
        id.clone(),
        ImageWatch {
          owner,
          _watcher: watcher,
        },
      );
    Ok(id)
  })
  .await
  .map_err(|error| Error::BackgroundTaskFailed(error.to_string()))?
}

#[tauri::command]
pub fn stop_modding_addon_image_watch(
  window: tauri::WebviewWindow<AppRuntime>,
  watch_id: String,
) -> Result<(), Error> {
  let mut watchers = WATCHERS
    .lock()
    .map_err(|error| Error::BackgroundTaskFailed(error.to_string()))?;
  if watchers
    .get(&watch_id)
    .is_some_and(|watch| watch.owner == window.label())
  {
    watchers.remove(&watch_id);
  }
  Ok(())
}

pub fn close_window(owner: &str) {
  if let Ok(mut watchers) = WATCHERS.lock() {
    watchers.retain(|_, watch| watch.owner != owner);
  }
}

#[cfg(test)]
mod image_watch_tests {
  use super::*;
  #[test]
  fn external_add_move_remove_and_compiler_deletion_are_reconciled_without_refresh() {
    let root = tempfile::tempdir().unwrap();
    modding_image_compiler::sync(root.path()).unwrap();
    let compiler = root.path().join("panorama/image_compiler.vdata");
    let observed = compiler.clone();
    let (tx, rx) = mpsc::channel();
    let watcher = watch(root.path().to_owned(), move |result| match result {
      Ok(paths) if paths.is_empty() => {}
      Ok(_) => {
        let _ = tx.send(std::fs::read_to_string(&observed).unwrap());
      }
      Err(error) => panic!("Image watch failed: {error}"),
    })
    .unwrap();
    let images = root.path().join("panorama/images");
    std::fs::create_dir_all(&images).unwrap();
    std::fs::write(images.join("gltf_embedded_3.png"), "fixture").unwrap();
    let added = rx.recv_timeout(Duration::from_secs(5)).unwrap();
    assert!(added.contains("file://{images}/gltf_embedded_3.png"));
    std::fs::create_dir(images.join("nested")).unwrap();
    std::fs::rename(
      images.join("gltf_embedded_3.png"),
      images.join("nested/renamed.png"),
    )
    .unwrap();
    let moved = rx.recv_timeout(Duration::from_secs(5)).unwrap();
    assert!(!moved.contains("gltf_embedded_3.png"));
    assert!(moved.contains("file://{images}/nested/renamed.png"));
    std::fs::create_dir(root.path().join("models")).unwrap();
    std::fs::rename(
      images.join("nested/renamed.png"),
      root.path().join("models/renamed.png"),
    )
    .unwrap();
    let removed = rx.recv_timeout(Duration::from_secs(5)).unwrap();
    assert!(!removed.contains("renamed.png"));
    std::fs::remove_file(&compiler).unwrap();
    let recreated = rx.recv_timeout(Duration::from_secs(5)).unwrap();
    assert!(recreated.contains("panorama_image_list"));
    assert!(compiler.is_file());
    drop(watcher);
    assert!(matches!(
      rx.recv_timeout(Duration::from_secs(2)),
      Err(RecvTimeoutError::Disconnected)
    ));
  }

  #[test]
  fn image_watches_ignore_models_history_and_compiled_output() {
    let root = Path::new("/project");
    for (path, expected) in [
      ("panorama/images/icon.png", true),
      ("panorama/images/folder", true),
      ("panorama/images", true),
      ("panorama", true),
      ("image_compiler.vdata", true),
      ("panorama/image_compiler.vdata", true),
      ("models/texture.png", false),
      ("panorama/image_compiler.vdata_c", false),
      (".dmm-history/image_compiler.vdata", false),
    ] {
      let event =
        Event::new(EventKind::Remove(notify::event::RemoveKind::Any)).add_path(root.join(path));
      assert_eq!(relevant(root, &event), expected, "{path}");
    }
  }
}
