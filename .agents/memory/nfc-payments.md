---
name: NFC payment rail
description: Non-obvious Web NFC payload and settlement constraints for future payment work
---

Web NFC text records include a status byte and language-code bytes before the application payload, and payment requests must identify a real NETLIFE CASH recipient.

**Why:** Decoding the raw text bytes as JSON makes valid tags appear unreadable, while direct client inserts can report success without moving balances or satisfying required transaction columns.

**How to apply:** Strip the text-record metadata, validate the recipient and amount, and route NFC, QR, and manual tap payments through `process_private_ledger_transfer`; never mark a transaction completed by inserting it directly from the client.