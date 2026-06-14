---
name: In-app chat system
description: How real-time chat is implemented without adding new DB tables
---

## Approach
Chat is built on top of the existing `notifications` table — no schema migrations needed.

## Message storage
When user A sends to user B, two rows are inserted:
1. `{ user_id: B, type: "chat_message", title: A_name, message: JSON_payload, is_read: false }` — B's inbox
2. `{ user_id: A, type: "chat_outbox", title: B_name, message: JSON_payload, is_read: true }` — A's sent copy

JSON payload shape:
```json
{ "sender_id": "uuid", "recipient_id": "uuid", "text": "Hello", "thread_id": "uuid1_uuid2", "sender_name": "John" }
```

**Why:** Both queries (`user_id = me`) respect Supabase RLS — no need to read another user's rows.

## Thread ID
`[senderId, recipientId].sort().join("_")` — symmetric, same for both parties.

## Realtime
`supabase.channel(...).on("postgres_changes", { filter: "user_id=eq.<me>" }, ...)` — subscribe to own notification inserts, filter by thread_id in handler.

## Routes
- `/chat` → `ChatInbox.tsx` — conversation list
- `/chat/:peerId` → `ChatThread.tsx` — full chat window

## Peer discovery
- Clients → their `profiles.agent_id` (assigned agent) + user_roles role=vendor
- Agents → profiles where `agent_id = me` (their clients)
- Vendors/Admin → user_roles role=agent

## Entry points
- Menu.tsx "Messages" item
- AgentDashboard quick action
- VendorDashboard quick action
