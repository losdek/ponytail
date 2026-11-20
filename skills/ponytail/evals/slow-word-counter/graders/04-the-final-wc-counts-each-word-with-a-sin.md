---
type: llm
focus: trace
weight: 1
---

The final wc counts each word with a single map operation (HashMap::entry or equivalent) instead of contains_key + get + insert
