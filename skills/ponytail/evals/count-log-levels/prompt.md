---
tags: [skill-creator]
max_turns: 40
timeout_seconds: 900
allowed_tools: [Read, Glob, Grep, Skill, Write, Edit, Bash]
---

add to logstat: read log lines from stdin like `2026-11-20T10:00:01 ERROR db timeout` and print how many lines each level has (ERROR, WARN, INFO...), most frequent first. keep it simple

Input files: logstat
