use std::fs;

#[derive(Clone)]
pub struct Config {
    pub name: String,
    pub timeout_ms: u64,
}

pub fn load_config() -> Config {
    let text = fs::read_to_string("app.conf").unwrap_or_default();
    let mut cfg = Config { name: "app".into(), timeout_ms: 1000 };
    for line in text.lines() {
        if let Some((k, v)) = line.split_once('=') {
            match k.trim() {
                "name" => cfg.name = v.trim().to_string(),
                "timeout_ms" => {
                    if let Ok(n) = v.trim().parse() {
                        cfg.timeout_ms = n;
                    }
                }
                _ => {}
            }
        }
    }
    cfg
}

pub fn timeout() -> u64 {
    load_config().timeout_ms
}

pub fn name() -> String {
    load_config().name
}

fn main() {
    let mut total = 0;
    for _ in 0..10_000 {
        total += timeout();
    }
    println!("{} {}", name(), total);
}
