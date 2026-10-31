//! A loopback HTTP/1.1 server for downloader tests: every reply is scripted, so
//! a test can send a wrong `Content-Range` or cut a body short.

use std::sync::{Arc, Mutex};
use std::time::Duration;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;

#[derive(Clone, Debug)]
pub struct Request {
  pub range: Option<String>,
  pub if_range: Option<String>,
}

impl Request {
  /// `bytes=a-b` or `bytes=a-` as `(a, Some(b) | None)`.
  pub fn byte_range(&self) -> Option<(u64, Option<u64>)> {
    let spec = self.range.as_deref()?.strip_prefix("bytes=")?;
    let (start, end) = spec.split_once('-')?;
    Some((
      start.parse().ok()?,
      (!end.is_empty()).then(|| end.parse().ok()).flatten(),
    ))
  }
}

#[derive(Clone, Debug)]
pub struct Reply {
  pub status: u16,
  pub headers: Vec<(String, String)>,
  pub body: Vec<u8>,
  /// Bytes per write; each write after the first waits `chunk_delay`.
  pub chunk: usize,
  pub chunk_delay: Duration,
  /// Close the connection after this many body bytes.
  pub disconnect_after: Option<usize>,
  /// Leave out `Content-Length`, so the body ends when the connection closes.
  pub close_delimited: bool,
}

impl Reply {
  pub fn new(status: u16, body: Vec<u8>) -> Self {
    Self {
      status,
      headers: Vec::new(),
      body,
      chunk: 64 * 1024,
      chunk_delay: Duration::ZERO,
      disconnect_after: None,
      close_delimited: false,
    }
  }

  pub fn header(mut self, name: &str, value: impl Into<String>) -> Self {
    self.headers.push((name.to_string(), value.into()));
    self
  }

  /// What a Range-capable server sends for `file`: a 206 for a satisfiable
  /// range, the whole file otherwise.
  pub fn serve(file: &[u8], request: &Request) -> Self {
    let total = file.len() as u64;
    match request.byte_range() {
      Some((start, end)) if start < total => {
        let end = end.unwrap_or(total - 1).min(total - 1);
        Reply::new(206, file[start as usize..=end as usize].to_vec())
          .header("content-range", format!("bytes {start}-{end}/{total}"))
      }
      Some(_) => Reply::new(416, Vec::new()).header("content-range", format!("bytes */{total}")),
      None => Reply::new(200, file.to_vec()),
    }
  }
}

type Handler = dyn Fn(&Request, usize) -> Reply + Send + Sync;

pub struct TestServer {
  pub origin: String,
  requests: Arc<Mutex<Vec<Request>>>,
}

impl TestServer {
  /// The handler gets each request and how many came before it.
  pub async fn start(handler: impl Fn(&Request, usize) -> Reply + Send + Sync + 'static) -> Self {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let origin = format!("http://{}", listener.local_addr().unwrap());
    let handler: Arc<Handler> = Arc::new(handler);
    let requests = Arc::new(Mutex::new(Vec::new()));
    tokio::spawn({
      let requests = Arc::clone(&requests);
      async move {
        while let Ok((mut socket, _)) = listener.accept().await {
          let handler = Arc::clone(&handler);
          let requests = Arc::clone(&requests);
          tokio::spawn(async move {
            let Some(request) = read_request(&mut socket).await else {
              return;
            };
            let index = {
              let mut requests = requests.lock().unwrap();
              requests.push(request.clone());
              requests.len() - 1
            };
            let reply = handler(&request, index);
            let _ = write_reply(&mut socket, &reply).await;
          });
        }
      }
    });
    Self { origin, requests }
  }

  pub fn url(&self, path: &str) -> String {
    format!("{}{path}", self.origin)
  }

  pub fn requests(&self) -> Vec<Request> {
    self.requests.lock().unwrap().clone()
  }
}

async fn read_request(socket: &mut tokio::net::TcpStream) -> Option<Request> {
  let mut head = Vec::new();
  let mut byte = [0_u8; 1];
  while !head.ends_with(b"\r\n\r\n") {
    if socket.read(&mut byte).await.ok()? == 0 {
      return None;
    }
    head.push(byte[0]);
  }
  let head = String::from_utf8_lossy(&head);
  let mut lines = head.split("\r\n");
  lines.next()?;
  let mut request = Request {
    range: None,
    if_range: None,
  };
  for line in lines {
    if let Some((name, value)) = line.split_once(':') {
      let value = Some(value.trim().to_string());
      match name.trim().to_ascii_lowercase().as_str() {
        "range" => request.range = value,
        "if-range" => request.if_range = value,
        _ => {}
      }
    }
  }
  Some(request)
}

async fn write_reply(socket: &mut tokio::net::TcpStream, reply: &Reply) -> std::io::Result<()> {
  let mut head = format!(
    "HTTP/1.1 {} Scripted\r\nconnection: close\r\n",
    reply.status
  );
  if !reply.close_delimited
    && !reply
      .headers
      .iter()
      .any(|(name, _)| name.eq_ignore_ascii_case("content-length"))
  {
    head.push_str(&format!("content-length: {}\r\n", reply.body.len()));
  }
  for (name, value) in &reply.headers {
    head.push_str(&format!("{name}: {value}\r\n"));
  }
  head.push_str("\r\n");
  socket.write_all(head.as_bytes()).await?;
  let limit = reply
    .disconnect_after
    .unwrap_or(reply.body.len())
    .min(reply.body.len());
  for (index, chunk) in reply.body[..limit].chunks(reply.chunk.max(1)).enumerate() {
    if index > 0 && !reply.chunk_delay.is_zero() {
      tokio::time::sleep(reply.chunk_delay).await;
    }
    socket.write_all(chunk).await?;
  }
  socket.flush().await?;
  socket.shutdown().await
}
