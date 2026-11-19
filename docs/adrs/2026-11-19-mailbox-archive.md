# Archive mailboxes independently of agents

## Status

Accepted

## Context

The Mail screen only groups mailboxes as archived when their agent is archived or gone.
Users also need to put a mailbox away while its agent remains available.

## Decision

Add an Archive button beside each live mailbox and a Restore button for manually archived
mailboxes. Group manually archived mailboxes under the existing Archived section; preserve
selection and access to all mail. Agent-archived mailboxes remain in Archived after restoring
the human preference.

The `mailboxes.archive` RPC sets a human viewing preference, persisted atomically as an array
of agent IDs in `mail/mailboxes.json`. It shares the store's write queue and revision counter.
Expose `mailboxArchived` separately from the existing agent lifecycle `archived` flag.

This extends the screen writes permitted by `2026-11-10-mail-screen.md`: archive preferences,
like seen marks, affect human viewing only. Delivery, nudges, registration and agent lifecycle
remain independent. New mail does not automatically restore the mailbox.

## Consequences

Archive preferences survive daemon restarts and apply across clients. Restoring a mailbox
whose agent is gone does not revive that agent. The mail loader reserves `mailboxes.json`
for preferences and continues reading existing mail files unchanged.
