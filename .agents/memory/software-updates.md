---
name: Centralized software updates
description: Supported software updates are intentionally scoped so routine project updates do not unexpectedly upgrade OS packages or restart production containers.
---

Use `update-software.sh` for repeatable maintenance. Its default updates system packages, project dependencies, and installed Android SDK packages; Docker image pulls and service restarts require the explicit `--docker` scope. Project dependencies update within the ranges declared in `package.json`, preserving compatibility rather than forcing unreviewed major upgrades.

**Why:** Blindly updating every layer during deployment can cause downtime or incompatible dependency changes, especially on a remote server.

**How to apply:** Use `--project` for normal code maintenance, `--all` for a planned server maintenance window, and `--reboot` only after reviewing the OS upgrade output. The in-app Git updater must resolve the actual Git worktree before remote or pull commands; the server script directory is not always the repository root. Its SSE stream must close after a terminal result, and a requested backend restart must restart the child process without taking down the Vite workflow wrapper. The monthly host cron runs on the 10th at 03:00 and honors the admin-controlled schedule file.