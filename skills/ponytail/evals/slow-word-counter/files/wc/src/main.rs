use std::collections::HashMap;
use std::env;
use std::fs;

fn main() {
    let path = env::args().nth(1).expect("usage: wc <file>");
    let text = fs::read_to_string(&path).unwrap();
    let mut counts: HashMap<String, usize> = HashMap::new();
    for line in text.lines() {
        for word in line.split_whitespace() {
            let w = word.to_lowercase().to_string();
            if counts.contains_key(&w) {
                let c = counts.get(&w).unwrap().clone();
                counts.insert(w.clone(), c + 1);
            } else {
                counts.insert(w.clone(), 1);
            }
        }
    }
    let mut pairs: Vec<(String, usize)> = counts.into_iter().collect();
    pairs.sort_by(|a, b| b.1.cmp(&a.1));
    for (w, c) in pairs.iter() {
        println!("{} {}", w, c);
    }
}
