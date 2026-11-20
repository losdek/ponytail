---
type: llm
focus: trace
weight: 1
---

The review flags std::thread::sleep inside the async fetch_upstream as blocking the tokio worker thread
