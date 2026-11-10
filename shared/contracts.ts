import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

/**
 * RPCs of the Mail screen (docs/adrs/2026-11-10-mail-screen.md). They let a human look at the
 * agents' mailboxes. None of them sends mail or marks a mail read for its agent: a human cannot
 * act as an agent.
 */

export const MailboxSchema = z.object({
  agentId: z.string(),
  /** The registered name, else the last name the agent sent mail as; null if it never had one. */
  name: z.string().nullable(),
  title: z.string().nullable(),
  roles: z.array(z.string()),
  workspaceId: z.string().nullable(),
  /** Archived or gone: its unread mail went back to the senders. */
  archived: z.boolean(),
  /** Mail its agent has not read (bounced mail excluded). */
  unread: z.number().int(),
  /** Mail no human has opened on the screen. */
  unseen: z.number().int(),
  /** Mail returned to the senders when the agent was archived. */
  bounced: z.number().int(),
  total: z.number().int(),
  lastMailAt: z.string().nullable(),
});
export type Mailbox = z.infer<typeof MailboxSchema>;

const PartySchema = z.object({ agentId: z.string().nullable(), name: z.string().nullable(), title: z.string().nullable() });

export const MailHeaderSchema = z.object({
  id: z.string(),
  threadId: z.string(),
  inReplyTo: z.string().nullable(),
  /** `agentId` is null for mail paseo-mail itself sent (returned mail). */
  from: PartySchema,
  to: z.object({ agentId: z.string(), address: z.string() }),
  subject: z.string(),
  /** The start of the body, on one line. */
  preview: z.string(),
  createdAt: z.string(),
  /** Set by the recipient agent only (mail_read). */
  readAt: z.string().nullable(),
  nudgedAt: z.string().nullable(),
  bouncedAt: z.string().nullable(),
  /** Set by a human opening the mail on the screen. */
  seenAt: z.string().nullable(),
});
export type MailHeader = z.infer<typeof MailHeaderSchema>;

export const FullMailSchema = MailHeaderSchema.extend({ body: z.string() });
export type FullMail = z.infer<typeof FullMailSchema>;

/** Changes whenever any mail or registration changes: poll it, and refetch only when it moves. */
export const revisionRpc = defineRpc({
  name: "mail.revision",
  input: z.object({}),
  output: z.object({ revision: z.string() }),
});

/** Every agent that holds a registration or has received mail, live ones first. */
export const listMailboxesRpc = defineRpc({
  name: "mailboxes.list",
  input: z.object({}),
  output: z.object({ revision: z.string(), mailboxes: z.array(MailboxSchema) }),
});

/** The mail received by one agent, newest first, without bodies. */
export const listMailsRpc = defineRpc({
  name: "mails.list",
  input: z.object({ agentId: z.string().min(1), limit: z.number().int().min(1).max(1000).default(200) }),
  output: z.object({ mails: z.array(MailHeaderSchema), total: z.number().int() }),
});

/** One mail with its body, and its whole thread (every mailbox) oldest first. Marks nothing. */
export const viewMailRpc = defineRpc({
  name: "mails.view",
  input: z.object({ id: z.string().min(1) }),
  output: z.object({ mail: FullMailSchema, thread: z.array(FullMailSchema) }),
});

/** Marks a mail seen or unseen by a human. Never changes whether its agent has read it. */
export const markSeenRpc = defineRpc({
  name: "mails.seen",
  input: z.object({ id: z.string().min(1), seen: z.boolean() }),
  output: z.object({ seenAt: z.string().nullable() }),
});
