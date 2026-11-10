---
name: In-app chat system
description: Peer messaging and secure in-app human/AI support chat boundaries
---

## Approach
Chat is built on top of the existing `notifications` table — no schema migrations needed.

Support chat is a separate, database-backed support queue. Its sessions, messages,
and agent availability are read and written only by authenticated server routes
using the service-role client; browser clients must not query these tables directly.

**Rule:** Automated support has no tools and may answer general product questions
only. It must not inspect or change accounts, balances, transactions, or permissions.
Only an assigned human agent may send agent replies or use the app's independently
authorized staff functions.

**Why:** The user requires AI support to be informational only and reserves account
changes and operational comments for human staff with admin-granted permissions.

**How to apply:** Keep AI prompts free of account data, do not expose mutation tools
to the model, and enforce customer ownership and agent assignment in server routes.

## Message storage
When user A sends to user B, two rows are inserted:
1. `{ user_id: B, type: "chat_message", title: A_name, message: JSON_payload, is_read: false }` — B's inbox
2. `{ user_id: A, type: "chat_outbox", title: B_name, message: JSON_payload, is_read: true }` — A's sent copy

JSON payload shape:
```json
{ "sender_id": "uuid", "recipient_id": "uuid", "text": "Hello", "thread_id": "uuid1_uuid2", "sender_name": "John" }
```

**Why:** Both queries (`user_id = me`) respect Supabase RLS — no need to read another user's rows.

**Rule:** Browser clients cannot insert the recipient's notification row under the current RLS policy. Route peer sends through an authenticated server handler that verifies the peer relationship and inserts delivery plus outbox together.

**Why:** Direct inserts are restricted to rows owned by the signed-in user; broadening the shared notifications insert policy would expose unrelated notification types.

**How to apply:** Keep sender identity server-derived and authorize each supported role pair before using the service client.

## Thread ID
`[senderId, recipientId].sort().join("_")` — symmetric, same for both parties.

## Realtime
`supabase.channel(...).on("postgres_changes", { filter: "user_id=eq.<me>" }, ...)` — subscribe to own notification inserts, filter by thread_id in handler.

## Message alerts and notification privacy
**Rule:** Keep in-app chat alerts active independently of browser notification permission. Browser notifications are an optional extra; notification queries and realtime listeners must always be scoped to the signed-in `user_id`, including on staff accounts. Exclude `chat_outbox` rows from the user's notification feed and decode incoming chat payloads before display.

**Why:** Browser permission must not disable in-app alerts, and staff RLS can expose other users' notifications unless each client query and subscription explicitly limits rows to the current user.

**How to apply:** Mount the chat alert listener at the app level, filter notification reads/subscriptions by the current user, and link chat notification entries to the sender's thread.

## Routes
- `/chat` → `ChatInbox.tsx` — conversation list
- `/chat/:peerId` → `ChatThread.tsx` — full chat window

## Peer discovery
Client-agent relationships come from `pending_deposits.agent_id/user_id`; `profiles` has no `agent_id` column. Clients can also message vendors; agents can message linked clients/vendors; vendors, admins, and founders can message agents. Contact names and roles are served through authenticated server routes because browser RLS does not expose other users' profiles or roles.

**Why:** The persistent client-agent link is recorded in deposits, while profile and role rows are private to ordinary browser users.

**How to apply:** Use `pending_deposits` for agent/client authorization and keep contact lookup scoped to the same role relationships as message sending.

## Entry points
- Menu.tsx "Messages" item
- AgentDashboard quick action
- VendorDashboard quick action
