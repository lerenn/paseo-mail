import type { PluginServerContext } from "@getpaseo/plugin/server";
import path from "node:path";
import { Mailer } from "./server/mailer";
import { PaseoAdapter, type PaseoApi } from "./server/paseo";
import { defaultDataDir } from "./server/paths";
import { Registry } from "./server/registry";
import { isSidekick, sidekickPrompt } from "./server/sidekick";
import { MailStore } from "./server/store";
import { withMailNote } from "./server/system-prompt";
import { mailTools } from "./server/tools";
import { MailViewer } from "./server/viewer";
import { listMailboxesRpc, listMailsRpc, markSeenRpc, revisionRpc, viewMailRpc } from "./shared/contracts";

export default function contribute(server: PluginServerContext) {
  const dataDir = defaultDataDir();
  const store = new MailStore(path.join(dataDir, "mail"));
  const registry = new Registry(path.join(dataDir, "registry.json"));
  const ready = Promise.all([store.init(), registry.init()]);
  const paseo = new PaseoAdapter();
  const mailer = new Mailer(store, registry, paseo);
  const viewer = new MailViewer(store, registry, paseo);

  /** Every hook waits for the store; the first one attaches the daemon API and flushes held nudges. */
  const enter = async (api: PaseoApi) => {
    await ready;
    if (paseo.attach(api)) mailer.start();
  };
  const quietly = (label: string, fn: () => Promise<void>) => fn().catch((error) => console.error(`[paseo-mail] ${label} failed:`, error));

  const tools = mailTools(mailer).map((tool) => ({
    ...tool,
    execute: async (input: unknown, context: Parameters<typeof tool.execute>[1]) => {
      await enter(context.paseo);
      return tool.execute(input, context);
    },
  }));

  const unhook = [
    // New agents get the mail rule appended to their system prompt. A throw here would
    // fail the agent's creation, so any problem leaves the request untouched.
    server.addHook("agent.create.before", async ({ request }) => {
      try {
        if (request.config.internal) return;
        const systemPrompt = withMailNote(request.config.systemPrompt);
        if (systemPrompt === null || systemPrompt === request.config.systemPrompt) return;
        return { ...request, config: { ...request.config, systemPrompt } };
      } catch (error) {
        console.error("[paseo-mail] could not add the mailbox note:", error);
        return;
      }
    }),
    server.addHook("agent.open.before", async ({ request }, context) => {
      if (request.purpose === "history") return;
      await enter(context.paseo);
      if (isSidekick(request.labels)) {
        // A project's Sidekick gets its mailbox here, on create and on every resume.
        void quietly("sidekick mailbox", async () => {
          const name = await mailer.adoptSidekick({ id: request.agentId, workspaceId: request.workspaceId, title: request.title });
          if (name !== null) setTimeout(() => void quietly("sidekick prompt", () => paseo.send(request.agentId, sidekickPrompt(name))), 5000);
        });
      }
      return { ...request, tools: [...request.tools, ...tools] };
    }),
    server.addHook("agent.turn.before", ({ agent }, context) =>
      quietly("turn.before", async () => {
        await enter(context.paseo);
        mailer.onTurnStarted(agent.id);
      }),
    ),
    server.addHook("agent.turn.after", ({ agent }, context) =>
      quietly("turn.after", async () => {
        await enter(context.paseo);
        mailer.onTurnEnded(agent.id);
      }),
    ),
    server.addHook("agent.archive.after", ({ agent }, context) =>
      quietly("archive.after", async () => {
        await enter(context.paseo);
        await mailer.onArchived(agent.id);
      }),
    ),
  ];

  // The Mail screen's RPCs: read-only, apart from the human-only seen mark.
  const handle: PluginServerContext["handle"] = (contract, handler) =>
    server.handle(contract, async (input, context) => {
      await enter(context.paseo);
      return handler(input, context);
    });
  handle(revisionRpc, async () => ({ revision: viewer.revision() }));
  handle(listMailboxesRpc, async () => {
    const revision = viewer.revision();
    return { revision, mailboxes: await viewer.mailboxes() };
  });
  handle(listMailsRpc, async ({ agentId, limit }) => viewer.list(agentId, limit));
  handle(viewMailRpc, async ({ id }) => viewer.view(id));
  handle(markSeenRpc, async ({ id, seen }) => ({ seenAt: await viewer.setSeen(id, seen) }));

  return () => {
    for (const off of unhook) off();
    return mailer.dispose();
  };
}
