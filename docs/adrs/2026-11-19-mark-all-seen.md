# Mark an entire mailbox seen

## Status

Accepted

## Context

Opening mail individually is cumbersome when clearing the human's unread indicators.
Agent read state must continue to reflect what the recipient agent has actually read.

## Decision

Add a “Mark all as opened” button above the selected mailbox's mail list when it has unseen
mail. The `mails.seen-all` RPC sets `seenAt` for all currently unseen mail in that mailbox,
including mail beyond the list's pagination limit. Existing seen timestamps are preserved.
The button prevents duplicate submissions and refreshes the shared view after success.

This extends the human seen-mark controls from `2026-11-10-human-seen-mark.md` without
changing their meaning: `readAt`, nudges, delivery and other mailboxes stay untouched.
Mail arriving after the operation's snapshot remains unseen.

## Consequences

Humans can clear a mailbox's bold indicators in one action. The mark persists and is shared
across clients, using the existing serialized mail writes and revision refresh.
