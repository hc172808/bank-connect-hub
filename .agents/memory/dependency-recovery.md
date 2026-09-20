---
name: Dependency recovery
description: Safe recovery behavior when this project has no node_modules or missing Vite tooling
---

When restoring dependencies for this project, preserve the committed package manifests and lockfile rather than allowing a generic install to refresh dependency ranges.

**Why:** The package-management install helper behaves like `npm install` and can upgrade many caret ranges while recreating `package.json` and `package-lock.json`, creating unrelated dependency churn even when the app itself only needed missing `node_modules`.

**How to apply:** Prefer the project deployment helper's lockfile-preserving install path, with development dependencies included because Vite and its plugins are required for builds. If a recovery install changes manifests, restore only those generated manifest changes before finishing.