---
name: Centralized software updates
description: Supported software updates are intentionally scoped so routine project updates do not unexpectedly upgrade OS packages or restart production containers.
---

Use `update-software.sh` for repeatable maintenance. Its default updates system packages, project dependencies, and installed Android SDK packages; Docker image pulls and service restarts require the explicit `--docker` scope. Project dependencies update within the ranges declared in `package.json`, preserving compatibility rather than forcing unreviewed major upgrades.

**Why:** Blindly updating every layer during deployment can cause downtime or incompatible dependency changes, especially on a remote server.

**How to apply:** Use `--project` for normal code maintenance, `--all` for a planned server maintenance window, and `--reboot` only after reviewing the OS upgrade output.