---
name: Support-assisted logout
description: Product security decision for staff-assisted remote logout and PIN confirmation.
---

**Rule:** A user confirms support-assisted remote logout with the same PIN used to unlock their wallet. Do not add phone verification as a requirement unless the user changes this decision. Support staff must never receive, record, or ask the user to send or read out the PIN; the user enters it on the confirmation page.

**Why:** The user explicitly chose wallet PIN only for recovery confirmation and identified the wallet-lock PIN as the one to use.

**How to apply:** Preserve the private user-entered PIN flow in any future changes to support-assisted account logout. Messaging may deliver the confirmation link, but must never transmit the PIN.
