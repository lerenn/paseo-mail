import type { PluginServerContext } from "@getpaseo/plugin/server";
import path from "node:path";
import { Mailer } from "./server/mailer";
import { PaseoAdapter, type PaseoApi } from "./server/paseo";
import { defaultDataDir } from "./server/paths";
import { Registry } from "./server/registry";
import { MailStore } from "./server/store";
import { mailTools } from "./server/tools";

export default function contribute(server: PluginServerContext) {
  const dataDir = defaultDataDir();
  const store = new MailStore(path.join(dataDir, "mail"));
  const registry = new Registry(path.join(dataDir, "registry.json"));
  const ready = Promise.all([store.init(), registry.init()]);
  const paseo = new PaseoAdapter();
  const mailer = new Mailer(store, registry, paseo);

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
    server.addHook("agent.open.before", async ({ request }, context) => {
      if (request.purpose === "history") return;
      await enter(context.paseo);
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

  return () => {
    for (const off of unhook) off();
    return mailer.dispose();
  };
}
