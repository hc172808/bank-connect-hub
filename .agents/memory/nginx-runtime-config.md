---
name: Nginx runtime config
description: Deployment rule for serving browser runtime configuration through nginx
---

Generate the browser runtime configuration as a standalone JavaScript file and let nginx serve it as a static asset; do not embed dotenv values inside an nginx `return` directive.

**Why:** URLs, quotes, semicolons, parentheses, and other ordinary dotenv characters can make the generated nginx configuration invalid and prevent nginx from starting at all.

**How to apply:** Write the runtime config after the frontend build using JSON serialization, configure an exact nginx location with `alias` and `default_type`, then run `nginx -t` before enabling or reloading nginx.