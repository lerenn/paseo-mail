import type { PluginClientContext } from "@getpaseo/plugin/client";
import { messages } from "./client/i18n";
import { createMailStore } from "./client/mail-store";
import { MailScreen, MailSidebarItem, SCREEN_ID } from "./client/screen";

export default function contribute(client: PluginClientContext) {
  // A Mail row in the sidebar opens a screen over every agent's mailbox (docs/adrs/2026-11-10-mail-screen.md).
  const store = createMailStore(client);
  const screen = client.addScreen({ id: SCREEN_ID, title: messages.message("title"), Component: (props) => <MailScreen {...props} store={store} /> });
  const sidebar = client.addSidebarHeaderItem({ id: "mail", title: messages.message("title"), Component: MailSidebarItem });
  return () => {
    sidebar();
    screen();
    store.dispose();
  };
}
