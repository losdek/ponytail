use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::{Arc, Mutex};
use std::thread;

trait Store {
    fn get(&self, k: &str) -> Option<String>;
    fn set(&self, k: String, v: String);
}

struct MemStore {
    map: Mutex<HashMap<String, String>>,
}

impl Store for MemStore {
    fn get(&self, k: &str) -> Option<String> {
        self.map.lock().unwrap().get(k).cloned()
    }
    fn set(&self, k: String, v: String) {
        self.map.lock().unwrap().insert(k, v);
    }
}

// Protocol: "GET key" or "SET key len" followed by len bytes on the next line.
fn handle(stream: TcpStream, store: Arc<dyn Store + Send + Sync>) {
    let mut out = stream.try_clone().unwrap();
    let reader = BufReader::new(stream);
    for line in reader.lines() {
        let line = line.unwrap();
        let parts: Vec<&str> = line.split(' ').collect();
        match parts[0] {
            "GET" => {
                let v = store.get(parts[1]).unwrap_or_default();
                let _ = writeln!(out, "{}", v);
            }
            "SET" => {
                let len = parts[2].parse::<i64>().unwrap() as usize;
                let value: String = parts[3..].join(" ");
                let value = value[..len].to_string();
                store.set(parts[1].to_string(), value);
                let _ = writeln!(out, "OK");
            }
            _ => {
                let _ = writeln!(out, "ERR");
            }
        }
    }
}

fn main() {
    let store: Arc<dyn Store + Send + Sync> = Arc::new(MemStore { map: Mutex::new(HashMap::new()) });
    let listener = TcpListener::bind("0.0.0.0:7000").unwrap();
    for stream in listener.incoming() {
        let stream = stream.unwrap();
        let store = store.clone();
        thread::spawn(move || handle(stream, store));
    }
}
