import { normalize } from "./registry";

/** Label the paseo-playbooks plugin puts on a project's Sidekick agent (value "true"). */
export const SIDEKICK_LABEL = "playbooks/sidekick";
/** Role every Sidekick mailbox holds: `role:sidekick` reaches the sender's own project first. */
export const SIDEKICK_ROLE = "sidekick";
/** The Sidekick's agent title is `Playbooks Sidekick · <project>`. */
const TITLE_SEPARATOR = " · ";

/** Mailbox name of a project's Sidekick: `<project-name>-sidekick`, always a valid address. */
export function sidekickMailName(title: string | null, projectId: string | null): string | null {
  const fromTitle = title?.includes(TITLE_SEPARATOR) ? title.slice(title.indexOf(TITLE_SEPARATOR) + TITLE_SEPARATOR.length) : "";
  for (const source of [fromTitle, projectId ?? ""]) {
    const slug = source
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64 - "-sidekick".length)
      .replace(/-+$/, "");
    if (slug === "") continue;
    try {
      return normalize(`${slug}-sidekick`, "name");
    } catch {
      continue;
    }
  }
  return null;
}

/** Whether an agent's labels mark it as a project's Sidekick. */
export function isSidekick(labels: Readonly<Record<string, string>> | undefined): boolean {
  return Boolean(labels?.[SIDEKICK_LABEL]);
}

/** The short prompt sent to a Sidekick when the plugin gives it its mailbox. */
export function sidekickPrompt(name: string): string {
  return `[paseo-mail] Your mailbox is "${name}" (role "${SIDEKICK_ROLE}"): the plugin registered it for you, so do not register another name. Agents of your project mail you their human decisions (agent id, run/playbook, question, facts, recommendation). Read your mail with mail_list / mail_read when nudged, and answer with mail_reply.`;
}
