use std::env;

fn main() {
    let n: usize = env::args().nth(1).and_then(|s| s.parse().ok()).unwrap_or(2000);
    let mut img = vec![0u32; n * n];
    for (i, p) in img.iter_mut().enumerate() {
        *p = ((i * 2654435761) % 256) as u32;
    }
    let r = 3i64;
    let mut out = vec![0u32; n * n];
    for y in 0..n {
        for x in 0..n {
            let mut sum = 0u32;
            let mut cnt = 0u32;
            for dy in -r..=r {
                for dx in -r..=r {
                    let yy = y as i64 + dy;
                    let xx = x as i64 + dx;
                    if yy >= 0 && xx >= 0 && (yy as usize) < n && (xx as usize) < n {
                        sum += img[yy as usize * n + xx as usize];
                        cnt += 1;
                    }
                }
            }
            out[y * n + x] = sum / cnt;
        }
    }
    let checksum: u64 = out.iter().map(|&v| v as u64).sum();
    println!("{checksum}");
}
