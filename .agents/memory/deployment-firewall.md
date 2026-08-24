---
name: Remote firewall deployment
description: Safety constraints for running the production deploy script over SSH
---

The production deploy script must not reset the firewall before installing the active SSH rule. Firewall configuration should be idempotent, validate port values, and expose command errors.

**Why:** A remote firewall reset can terminate the deployment session or leave the server inaccessible, while redirected errors make the script appear to stop without identifying the failing command.

**How to apply:** Preserve an explicitly configured SSH port when available, detect a numeric listening SSH port otherwise, add SSH before enabling firewall policy, and avoid suppressing firewall diagnostics during deployment.