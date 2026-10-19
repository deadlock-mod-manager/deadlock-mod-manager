use super::*;
use std::os::unix::fs::PermissionsExt;
use tokio::io::AsyncReadExt;
use tokio::net::TcpListener;

const PAYLOAD: &[u8] = b"synthetic Flatpak update bytes";

async fn serve_bundle(status: &str) -> (reqwest::Url, tokio::task::JoinHandle<String>) {
  let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
  let url = format!(
    "http://{}/nightly/deadlock-mod-manager.flatpak",
    listener.local_addr().unwrap()
  );
  let response = format!(
    "HTTP/1.1 {status}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
    PAYLOAD.len()
  );
  let server = tokio::spawn(async move {
    let (mut connection, _) = listener.accept().await.unwrap();
    let mut request = Vec::new();
    loop {
      let mut buffer = [0; 1024];
      let bytes = connection.read(&mut buffer).await.unwrap();
      if bytes == 0 {
        break;
      }
      request.extend_from_slice(&buffer[..bytes]);
      if request.windows(4).any(|part| part == b"\r\n\r\n") {
        break;
      }
    }
    connection.write_all(response.as_bytes()).await.unwrap();
    connection.write_all(PAYLOAD).await.unwrap();
    String::from_utf8(request).unwrap()
  });
  (reqwest::Url::parse(&url).unwrap(), server)
}

fn recording_installer(root: &Path, exit_code: i32) -> Command {
  let script = root.join("record-installer.sh");
  std::fs::write(
    &script,
    r#"#!/bin/sh
set -eu
printf '%s\n' "$@" > "$RECORD_ROOT/args"
cp "$7" "$RECORD_ROOT/installed.flatpak"
echo recorded
exit "$INSTALL_EXIT_CODE"
"#,
  )
  .unwrap();
  std::fs::set_permissions(&script, std::fs::Permissions::from_mode(0o700)).unwrap();
  let mut command = Command::new(script);
  command
    .env("RECORD_ROOT", root)
    .env("INSTALL_EXIT_CODE", exit_code.to_string());
  command
}

#[tokio::test]
async fn http_bundle_reaches_host_installer_with_exact_bytes_scope_and_cache_path() {
  for scope in ["--user", "--system"] {
    let root = tempfile::tempdir().unwrap();
    let cache = root.path().join("cache");
    let (url, server) = serve_bundle("200 OK").await;
    download_and_install(
      url,
      &cache,
      scope,
      recording_installer(root.path(), 0),
      |_| {},
    )
    .await
    .unwrap();
    assert!(
      server
        .await
        .unwrap()
        .starts_with("GET /nightly/deadlock-mod-manager.flatpak HTTP/1.1")
    );
    assert_eq!(
      std::fs::read(root.path().join("installed.flatpak")).unwrap(),
      PAYLOAD
    );
    let arguments = std::fs::read_to_string(root.path().join("args")).unwrap();
    let arguments: Vec<_> = arguments.lines().collect();
    assert_eq!(
      &arguments[..6],
      [
        "--host",
        "flatpak",
        "install",
        scope,
        "--reinstall",
        "--noninteractive"
      ]
    );
    assert!(Path::new(arguments[6]).starts_with(&cache));
    assert!(!Path::new(arguments[6]).exists());
    assert_eq!(std::fs::read_dir(&cache).unwrap().count(), 0);
  }
}

#[tokio::test]
async fn failed_http_download_does_not_invoke_installer_and_removes_staging() {
  let root = tempfile::tempdir().unwrap();
  let cache = root.path().join("cache");
  let (url, server) = serve_bundle("404 Not Found").await;
  let result = download_and_install(
    url,
    &cache,
    "--user",
    recording_installer(root.path(), 0),
    |_| {},
  )
  .await;
  assert!(result.unwrap_err().to_string().contains("404"));
  server.await.unwrap();
  assert!(!root.path().join("args").exists());
  assert_eq!(std::fs::read_dir(cache).unwrap().count(), 0);
}

#[tokio::test]
async fn failed_host_install_reports_failure_and_removes_downloaded_bundle() {
  let root = tempfile::tempdir().unwrap();
  let cache = root.path().join("cache");
  let (url, server) = serve_bundle("200 OK").await;
  let result = download_and_install(
    url,
    &cache,
    "--user",
    recording_installer(root.path(), 23),
    |_| {},
  )
  .await;
  assert!(result.unwrap_err().to_string().contains("23"));
  server.await.unwrap();
  assert_eq!(
    std::fs::read(root.path().join("installed.flatpak")).unwrap(),
    PAYLOAD
  );
  assert_eq!(std::fs::read_dir(cache).unwrap().count(), 0);
}
