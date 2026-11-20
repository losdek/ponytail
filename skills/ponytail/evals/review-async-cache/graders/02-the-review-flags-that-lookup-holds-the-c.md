---
type: llm
focus: trace
weight: 1
---

The review flags that lookup holds the cache lock across fetch_upstream().await, so every request waits behind each cache miss
