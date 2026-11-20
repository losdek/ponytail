---
tags: [skill-creator]
max_turns: 40
timeout_seconds: 900
allowed_tools: [Read, Glob, Grep, Skill, Write, Edit, Bash]
---

in cfgtool, load_config() re-reads app.conf every time timeout() or name() is called and that happens thousands of times. make it read the file only once

Input files: cfgtool
