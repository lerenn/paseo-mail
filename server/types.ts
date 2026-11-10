import { z } from "zod";

export const MailSchema = z.object({
  id: z.string(),
  threadId: z.string(),
  inReplyTo: z.string().nullable(),
  /** `agentId` is null for mail the plugin itself sends (bounces). */
  from: z.object({ agentId: z.string().nullable(), name: z.string().nullable(), title: z.string().nullable() }),
  to: z.object({ agentId: z.string(), address: z.string() }),
  subject: z.string(),
  body: z.string(),
  createdAt: z.string(),
  readAt: z.string().nullable(),
  nudgedAt: z.string().nullable(),
  bouncedAt: z.string().nullable(),
  /**
   * When a human opened the mail on the Mail screen. Separate from `readAt`, which only the
   * recipient agent sets: a human looking does not count as the agent having read it.
   * Absent in mail written before the screen existed.
   */
  seenAt: z.string().nullable().default(null),
});
export type Mail = z.infer<typeof MailSchema>;

export const RegistrationSchema = z.object({
  agentId: z.string(),
  name: z.string().nullable(),
  roles: z.array(z.string()),
  workspaceId: z.string().nullable(),
  projectId: z.string().nullable(),
  updatedAt: z.string(),
});
export type Registration = z.infer<typeof RegistrationSchema>;

/** What the mailer needs to know about an agent. */
export interface AgentInfo {
  id: string;
  title: string | null;
  workspaceId: string | null;
  status: string;
  archived: boolean;
}

/** The slice of the daemon API the mailer uses (adapter in paseo.ts, fake in tests). */
export interface PaseoPort {
  /** null when the agent does not exist (any more). */
  agent(id: string): Promise<AgentInfo | null>;
  projectOf(workspaceId: string): Promise<string | null>;
  send(agentId: string, text: string): Promise<void>;
}

/** The agent calling a tool. */
export interface Caller {
  id: string;
  workspaceId: string | null;
  title: string | null;
}

/** A refusal the agent can act on, returned as a tool error rather than logged. */
export class UserError extends Error {}
