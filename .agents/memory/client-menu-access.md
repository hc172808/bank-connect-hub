---
name: Client menu access
description: Rules for controlling regular-user menu visibility through global and per-user feature settings.
---

Every client-menu entry has a matching `client_menu_*` global feature toggle. A regular user sees an entry only when both the global toggle and that user's access row allow it; missing rows default to enabled for backward compatibility. Admin and founder accounts always retain menu access.

**Why:** Administrators need a global kill switch for launches or outages without losing the ability to make an exception for one user, while staff accounts must remain operable even when client features are disabled.

**How to apply:** Keep the client menu catalog, backend seed list, and migration aligned whenever a menu feature is added. Use global Feature Toggles for product-wide visibility and Manage Users for individual overrides.