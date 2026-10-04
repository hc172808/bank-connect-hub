---
name: System Doctor safety
description: Data-handling and execution boundaries for AI-assisted diagnostics
---

System Doctor is analysis-only. AI analysis is globally disabled by default and runs only after an admin explicitly enables it and requests diagnostics. Send only sanitized service statuses and aggregate boot-error counts; never send raw logs, credentials, user identifiers, or account balances. Automatic repairs remain disabled, and model output must never execute commands, install packages, edit source files, or mutate database records. A financial discrepancy requires human transaction reconciliation before any balance adjustment.

**Why:** AI troubleshooting in a financial application must not have authority to execute arbitrary operations or adjust balances based on incomplete evidence.

**How to apply:** Keep all diagnostic inputs allowlisted and sanitized. Any future repair must be a fixed, independently validated operation with explicit authorized-admin approval; do not turn model text into executable instructions.