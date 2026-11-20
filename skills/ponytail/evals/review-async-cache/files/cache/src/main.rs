use std::collections::HashMap;
use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::TcpListener;
use tokio::sync::Mutex;

type Cache = Arc<Mutex<HashMap<String, String>>>;

// Upstream lookup; takes ~200 ms.
async fn fetch_upstream(key: &str) -> String {
    std::thread::sleep(std::time::Duration::from_millis(200));
    format!("value-for-{key}")
}

async fn lookup(cache: &Cache, key: &str) -> String {
    let mut map = cache.lock().await;
    if let Some(v) = map.get(key) {
        return v.clone();
    }
    let v = fetch_upstream(key).await;
    map.insert(key.to_string(), v.clone());
    v
}

#[tokio::main]
async fn main() {
    let cache: Cache = Arc::new(Mutex::new(HashMap::new()));
    let listener = TcpListener::bind("127.0.0.1:7100").await.unwrap();
    loop {
        let (sock, _) = listener.accept().await.unwrap();
        let cache = cache.clone();
        tokio::spawn(async move {
            let (r, mut w) = sock.into_split();
            let mut lines = BufReader::new(r).lines();
            while let Some(key) = lines.next_line().await.unwrap() {
                let v = lookup(&cache, &key).await;
                w.write_all(format!("{v}\n").as_bytes()).await.unwrap();
            }
        });
    }
}
