/**
 * The rule added to the system prompt of every new agent (docs/adrs/2026-11-10-system-prompt-note.md).
 * Edit the wording here; keep it to five lines or fewer. Only the prompt enforces it: the plugin
 * cannot block direct sends between agents.
 */
export const MAIL_NOTE = [
  "Paseo Mail is installed: you have a mailbox. First claim a name with mail_register: you can read your mail only after registering and it lets other agents reach you. Prefer a name over agent:<id> once you know it (a parent can mail a fresh child as agent:<its id>).",
  "You MUST use mail_send (and mail_reply to answer) for all non-urgent communication with other agents: updates, results, questions, handoffs, FYIs.",
  "You MUST NOT interrupt another agent with a direct prompt (send_agent_prompt or similar) unless it is urgent: the agent is about to do something harmful, or your work is blocked right now and cannot wait for its next turn.",
  "Read your mail (mail_list, mail_read) when you are nudged about it or a tool result shows Unread: N; if you have not registered yet, register first.",
  "When something needs a human decision and you are not in a live conversation with the human, do not ask the human directly: mail the project's Sidekick with mail_send to \"role:sidekick\" (it reaches your own project's Sidekick; its mailbox is named <project-name>-sidekick, see mail_directory). Write: your agent id, the run/playbook, the question, the facts, your recommendation. If no Sidekick mailbox exists (mail_send refuses), find its agent id with `paseo ls -g` (label playbooks/sidekick) and send it a direct prompt, still without interrupting it unless urgent.",
].join("\n");

/**
 * Appends the note to an existing system prompt, keeping that prompt as it is. Returns null when
 * the prompt cannot be handled safely (not a string), and the prompt unchanged when it already
 * has the note.
 */
export function withMailNote(prompt: unknown): string | null {
  if (prompt === undefined || prompt === null || prompt === "") return MAIL_NOTE;
  if (typeof prompt !== "string") return null;
  if (prompt.includes(MAIL_NOTE)) return prompt;
  return `${prompt}\n\n${MAIL_NOTE}`;
}
