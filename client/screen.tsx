import { useRpc, useTranslation, type PluginScreenProps, type PluginSidebarItemProps } from "@getpaseo/plugin/client";
import { Icon, Loading, Markdown, ScrollView, SidebarRow, useToast } from "@getpaseo/plugin/client/ui";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { listMailsRpc, markSeenRpc, viewMailRpc, type FullMail, type Mailbox, type MailHeader } from "../shared/contracts";
import { mailboxLabel, senderLabel, shortDate, threadCounts } from "./format";
import { messages } from "./i18n";
import { useMail, type MailStore } from "./mail-store";

/** Id of the Mail screen, opened from the sidebar row. */
export const SCREEN_ID = "mail";

type Theme = PluginScreenProps["theme"];
type T = ReturnType<typeof useTranslation<typeof messages.resources.en>>["t"];

const MAILBOX_PANE = 240;
const LIST_PANE = 340;

// ---------------------------------------------------------------- sidebar row

/** "Mail" in the sidebar. No badge: unread counts belong to the agents, not to the human. */
export function MailSidebarItem(props: PluginSidebarItemProps) {
  const { t } = useTranslation(messages);
  return <SidebarRow icon="Mail" label={t("title")} active={props.currentScreen?.screenId === SCREEN_ID} onPress={() => props.openScreen({ screenId: SCREEN_ID })} />;
}

// ---------------------------------------------------------------- screen

/**
 * A mail client over the agents' mailboxes: mailboxes, then the selected mailbox's mail, then
 * the selected mail with its thread. Side by side on wide layouts, one at a time on compact ones.
 * View only: nothing here sends mail or marks it read for its agent.
 */
export function MailScreen(props: PluginScreenProps & { store: MailStore }) {
  const { theme, layout, navigation, store } = props;
  const { t } = useTranslation(messages);
  const mail = useMail(store);
  const [agentId, setAgentId] = useState<string | null>(null);
  const [mailId, setMailId] = useState<string | null>(null);

  const boxes = mail.mailboxes ?? [];
  const box = boxes.find((candidate) => candidate.agentId === agentId) ?? null;
  // Wide: open the first mailbox, so the screen never starts on three empty panes.
  useEffect(() => {
    if (!layout.compact && agentId === null && boxes.length > 0) setAgentId(boxes[0]!.agentId);
  }, [layout.compact, agentId, boxes]);

  const pickBox = (id: string) => {
    setAgentId(id);
    setMailId(null);
  };

  const header = (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: layout.compact ? 12 : 18, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: theme.colors.border }}>
      {layout.compact && agentId !== null ? (
        <IconButton theme={theme} icon="ChevronLeft" label={t("back")} onPress={() => (mailId !== null ? setMailId(null) : setAgentId(null))} />
      ) : null}
      <Text accessibilityRole="header" numberOfLines={1} style={{ flex: 1, color: theme.colors.foreground, fontSize: 18, fontWeight: "700" }}>
        {layout.compact && box ? mailboxLabel(box, t("mailboxes.noName")) : t("title")}
      </Text>
      <IconButton theme={theme} icon="RefreshCw" label={t("refresh")} onPress={store.refresh} />
    </View>
  );

  let body: ReactNode;
  if (mail.mailboxes === null) {
    body = mail.error ? <ErrorState theme={theme} t={t} message={mail.error} onRetry={store.refresh} /> : <Loading />;
  } else if (boxes.length === 0) {
    body = <Empty theme={theme} icon="Inbox" text={t("mailboxes.empty")} />;
  } else {
    const mailboxes = <MailboxPane theme={theme} t={t} boxes={boxes} selected={agentId} onSelect={pickBox} />;
    const list = box ? (
      <MailListPane theme={theme} t={t} box={box} revision={mail.revision} selected={mailId} onSelect={setMailId} />
    ) : (
      <Empty theme={theme} icon="Inbox" text={t("mails.pick")} />
    );
    const reader =
      mailId !== null ? (
        <ReaderPane
          theme={theme}
          t={t}
          mailId={mailId}
          revision={mail.revision}
          onChanged={store.refresh}
          onOpenAgent={navigation ? (id) => navigation.openAgent({ agentId: id }) : undefined}
          box={box}
        />
      ) : (
        <Empty theme={theme} icon="Mail" text={t("reader.pick")} />
      );
    body = layout.compact ? (
      <View style={{ flex: 1 }}>{agentId === null ? mailboxes : mailId === null ? list : reader}</View>
    ) : (
      <View style={{ flex: 1, flexDirection: "row" }}>
        <View style={{ width: MAILBOX_PANE, borderRightWidth: 1, borderRightColor: theme.colors.border }}>{mailboxes}</View>
        <View style={{ width: LIST_PANE, borderRightWidth: 1, borderRightColor: theme.colors.border }}>{list}</View>
        <View style={{ flex: 1 }}>{reader}</View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.surface0 }}>
      {header}
      {mail.error && mail.mailboxes !== null ? (
        <Text style={{ color: theme.colors.statusDanger, fontSize: 12, paddingHorizontal: 18, paddingVertical: 6 }}>{t("error", { message: mail.error })}</Text>
      ) : null}
      {body}
    </View>
  );
}

// ---------------------------------------------------------------- mailboxes

function MailboxPane(props: { theme: Theme; t: T; boxes: Mailbox[]; selected: string | null; onSelect(agentId: string): void }) {
  const { theme, t } = props;
  const live = props.boxes.filter((box) => !box.archived);
  const archived = props.boxes.filter((box) => box.archived);
  return (
    <ScrollView contentContainerStyle={{ paddingVertical: 8 }}>
      {live.length > 0 ? <SectionTitle theme={theme} text={t("mailboxes.live")} /> : null}
      {live.map((box) => (
        <MailboxRow key={box.agentId} theme={theme} t={t} box={box} selected={props.selected === box.agentId} onPress={() => props.onSelect(box.agentId)} />
      ))}
      {archived.length > 0 ? <SectionTitle theme={theme} text={t("mailboxes.archived")} /> : null}
      {archived.map((box) => (
        <MailboxRow key={box.agentId} theme={theme} t={t} box={box} selected={props.selected === box.agentId} onPress={() => props.onSelect(box.agentId)} />
      ))}
    </ScrollView>
  );
}

function MailboxRow(props: { theme: Theme; t: T; box: Mailbox; selected: boolean; onPress(): void }) {
  const { theme, t, box } = props;
  const label = mailboxLabel(box, t("mailboxes.noName"));
  const muted = box.archived ? theme.colors.foregroundMuted : theme.colors.foreground;
  const details = [box.name && box.title ? box.title : null, ...box.roles.map((role) => `role:${role}`)].filter(Boolean).join(" · ");
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: props.selected }}
      accessibilityLabel={[label, box.unread > 0 ? t("mailboxes.unread", { count: box.unread }) : null, box.archived ? t("mailboxes.archivedTag") : null].filter(Boolean).join(", ")}
      onPress={props.onPress}
      style={({ hovered, pressed }: { hovered?: boolean; pressed: boolean }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        marginHorizontal: 6,
        paddingHorizontal: 10,
        paddingVertical: 8,
        borderRadius: 6,
        backgroundColor: props.selected ? theme.colors.surface2 : hovered || pressed ? theme.colors.surface1 : "transparent",
      })}
    >
      <Icon name={box.archived ? "Archive" : "Inbox"} size={15} color={theme.colors.foregroundMuted} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ color: muted, fontSize: 14, fontWeight: box.unseen > 0 ? "700" : "500" }}>
          {label}
        </Text>
        {details ? (
          <Text numberOfLines={1} style={{ color: theme.colors.foregroundMuted, fontSize: 11 }}>
            {details}
          </Text>
        ) : null}
        {box.archived && box.bounced > 0 ? (
          <Text numberOfLines={1} style={{ color: theme.colors.statusWarning, fontSize: 11 }}>
            {t("mailboxes.returned", { count: box.bounced })}
          </Text>
        ) : null}
      </View>
      {box.unread > 0 ? <Count theme={theme} count={box.unread} /> : null}
    </Pressable>
  );
}

// ---------------------------------------------------------------- mail list

function useMails(agentId: string, revision: string | null) {
  const listMails = useRpc(listMailsRpc);
  const [state, setState] = useState<{ agentId: string; mails: MailHeader[]; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    listMails({ agentId })
      .then((result) => {
        if (!live) return;
        setState({ agentId, ...result });
        setError(null);
      })
      .catch((cause: unknown) => live && setError(cause instanceof Error ? cause.message : String(cause)));
    return () => {
      live = false;
    };
  }, [agentId, revision]);
  // A list of another mailbox is never shown while the new one loads.
  return { data: state?.agentId === agentId ? state : null, error };
}

function MailListPane(props: { theme: Theme; t: T; box: Mailbox; revision: string | null; selected: string | null; onSelect(id: string): void }) {
  const { theme, t } = props;
  const { data, error } = useMails(props.box.agentId, props.revision);
  const counts = useMemo(() => threadCounts(data?.mails ?? []), [data]);
  if (!data) return error ? <ErrorState theme={theme} t={t} message={error} /> : <Loading />;
  if (data.mails.length === 0) return <Empty theme={theme} icon="Inbox" text={t("mails.empty")} />;
  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 12 }}>
      <Text style={{ color: theme.colors.foregroundMuted, fontSize: 11, paddingHorizontal: 14, paddingVertical: 8 }}>{t("mails.legend")}</Text>
      {data.mails.map((mail) => (
        <MailRow key={mail.id} theme={theme} t={t} mail={mail} siblings={(counts.get(mail.threadId) ?? 1) - 1} selected={props.selected === mail.id} onPress={() => props.onSelect(mail.id)} />
      ))}
      {data.total > data.mails.length ? (
        <Text style={{ color: theme.colors.foregroundMuted, fontSize: 11, paddingHorizontal: 14, paddingTop: 8 }}>{t("mails.more", { shown: data.mails.length, total: data.total })}</Text>
      ) : null}
    </ScrollView>
  );
}

function MailRow(props: { theme: Theme; t: T; mail: MailHeader; siblings: number; selected: boolean; onPress(): void }) {
  const { theme, t, mail } = props;
  const unseen = mail.seenAt === null;
  const status = mail.bouncedAt !== null ? { text: t("mails.returned"), color: theme.colors.statusWarning } : mail.readAt === null ? { text: t("mails.unread"), color: theme.colors.accent } : null;
  const subject = mail.subject || t("mails.noSubject");
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: props.selected }}
      accessibilityLabel={[senderLabel(mail.from, t("plugin")), subject, status?.text].filter(Boolean).join(", ")}
      onPress={props.onPress}
      style={({ hovered, pressed }: { hovered?: boolean; pressed: boolean }) => ({
        flexDirection: "row",
        gap: 8,
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
        backgroundColor: props.selected ? theme.colors.surface2 : hovered || pressed ? theme.colors.surface1 : "transparent",
      })}
    >
      <View style={{ width: 8, paddingTop: 6 }}>{unseen ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: theme.colors.accent }} /> : null}</View>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Text numberOfLines={1} style={{ flex: 1, color: theme.colors.foreground, fontSize: 13, fontWeight: unseen ? "700" : "500" }}>
            {senderLabel(mail.from, t("plugin"))}
          </Text>
          <Text style={{ color: theme.colors.foregroundMuted, fontSize: 11 }}>{shortDate(mail.createdAt)}</Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Text numberOfLines={1} style={{ flex: 1, color: theme.colors.foreground, fontSize: 13, fontWeight: unseen ? "700" : "400" }}>
            {subject}
          </Text>
          {props.siblings > 0 ? <Tag theme={theme} text={t("mails.inThread", { count: props.siblings + 1 })} color={theme.colors.foregroundMuted} /> : null}
          {status ? <Tag theme={theme} text={status.text} color={status.color} /> : null}
        </View>
        {mail.preview ? (
          <Text numberOfLines={1} style={{ color: theme.colors.foregroundMuted, fontSize: 12 }}>
            {mail.preview}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

// ---------------------------------------------------------------- reader

function ReaderPane(props: { theme: Theme; t: T; mailId: string; revision: string | null; box: Mailbox | null; onChanged(): void; onOpenAgent?: (agentId: string) => void }) {
  const { theme, t, mailId } = props;
  const viewMail = useRpc(viewMailRpc);
  const markSeen = useRpc(markSeenRpc);
  const toast = useToast();
  const [state, setState] = useState<{ mail: FullMail; thread: FullMail[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Opening a mail marks it seen once; "Mark as not opened" is not undone by the next refresh. */
  const marked = useRef<string | null>(null);

  useEffect(() => {
    let live = true;
    viewMail({ id: mailId })
      .then((result) => {
        if (!live) return;
        setState(result);
        setError(null);
        if (result.mail.seenAt === null && marked.current !== mailId) {
          marked.current = mailId;
          markSeen({ id: mailId, seen: true }).then(props.onChanged, (cause: unknown) => console.error("[paseo-mail] mark seen failed", cause));
        }
      })
      .catch((cause: unknown) => live && setError(cause instanceof Error ? cause.message : String(cause)));
    return () => {
      live = false;
    };
  }, [mailId, props.revision]);

  const current = state?.mail.id === mailId ? state : null;
  if (!current) return error ? <ErrorState theme={theme} t={t} message={error} /> : <Loading />;
  const { mail, thread } = current;
  const recipientLive = props.box && !props.box.archived && props.box.agentId === mail.to.agentId;
  return (
    <ScrollView contentContainerStyle={{ padding: 18, gap: 14 }}>
      <View style={{ gap: 6 }}>
        <Text selectable style={{ color: theme.colors.foreground, fontSize: 18, fontWeight: "700" }}>
          {mail.subject || t("mails.noSubject")}
        </Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
          {thread.length > 1 ? <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12 }}>{t("reader.thread", { count: thread.length })}</Text> : null}
          <View style={{ flex: 1 }} />
          <SmallButton
            theme={theme}
            icon="MailX"
            label={t("reader.markUnseen")}
            onPress={() =>
              markSeen({ id: mail.id, seen: false }).then(props.onChanged, (cause: unknown) => toast.error(cause instanceof Error ? cause.message : String(cause)))
            }
          />
          {recipientLive && props.onOpenAgent ? <SmallButton theme={theme} icon="Bot" label={t("reader.openAgent")} onPress={() => props.onOpenAgent!(mail.to.agentId)} /> : null}
        </View>
        <Text style={{ color: theme.colors.foregroundMuted, fontSize: 11 }}>{t("reader.viewOnly")}</Text>
      </View>
      {thread.map((item) => (
        <MailCard key={item.id} theme={theme} t={t} mail={item} selected={item.id === mail.id} />
      ))}
    </ScrollView>
  );
}

function MailCard(props: { theme: Theme; t: T; mail: FullMail; selected: boolean }) {
  const { theme, t, mail } = props;
  const status =
    mail.bouncedAt !== null
      ? { text: t("reader.returned", { date: shortDate(mail.bouncedAt) }), color: theme.colors.statusWarning }
      : mail.readAt !== null
        ? { text: t("reader.readAt", { date: shortDate(mail.readAt) }), color: theme.colors.statusSuccess }
        : { text: t("reader.notRead"), color: theme.colors.accent };
  return (
    <View
      style={{
        gap: 8,
        padding: 14,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: props.selected ? theme.colors.accent : theme.colors.border,
        backgroundColor: theme.colors.surface1,
      }}
    >
      <View style={{ gap: 2 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Text numberOfLines={1} style={{ flex: 1, color: theme.colors.foreground, fontSize: 13, fontWeight: "600" }}>
            {t("reader.from")}: {senderLabel(mail.from, t("plugin"))}
          </Text>
          <Text style={{ color: theme.colors.foregroundMuted, fontSize: 11 }}>{shortDate(mail.createdAt)}</Text>
        </View>
        <Text numberOfLines={1} style={{ color: theme.colors.foregroundMuted, fontSize: 12 }}>
          {t("reader.to")}: {mail.to.address}
        </Text>
        {!props.selected && mail.subject ? (
          <Text numberOfLines={1} style={{ color: theme.colors.foreground, fontSize: 12 }}>
            {mail.subject}
          </Text>
        ) : null}
        <Text style={{ color: status.color, fontSize: 11 }}>{status.text}</Text>
        {mail.nudgedAt !== null && mail.readAt === null && mail.bouncedAt === null ? (
          <Text style={{ color: theme.colors.foregroundMuted, fontSize: 11 }}>{t("reader.nudged", { date: shortDate(mail.nudgedAt) })}</Text>
        ) : null}
      </View>
      <View style={{ borderTopWidth: 1, borderTopColor: theme.colors.border, paddingTop: 8 }}>
        <Markdown>{mail.body}</Markdown>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------- small parts

function SectionTitle(props: { theme: Theme; text: string }) {
  return (
    <Text style={{ color: props.theme.colors.foregroundMuted, fontSize: 11, fontWeight: "700", textTransform: "uppercase", paddingHorizontal: 16, paddingTop: 10, paddingBottom: 4 }}>
      {props.text}
    </Text>
  );
}

function Count(props: { theme: Theme; count: number }) {
  const { theme } = props;
  return (
    <View style={{ minWidth: 18, height: 18, paddingHorizontal: 5, borderRadius: 9, alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.accent }}>
      <Text style={{ color: theme.colors.accentForeground, fontSize: 11, fontWeight: "700" }}>{props.count > 99 ? "99+" : props.count}</Text>
    </View>
  );
}

function Tag(props: { theme: Theme; text: string; color: string }) {
  return (
    <View style={{ borderWidth: 1, borderColor: props.color, borderRadius: 4, paddingHorizontal: 4 }}>
      <Text style={{ color: props.color, fontSize: 10 }}>{props.text}</Text>
    </View>
  );
}

function Empty(props: { theme: Theme; icon: string; text: string }) {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 10 }}>
      <Icon name={props.icon} size={28} color={props.theme.colors.foregroundMuted} />
      <Text style={{ color: props.theme.colors.foregroundMuted, fontSize: 13, textAlign: "center", maxWidth: 320 }}>{props.text}</Text>
    </View>
  );
}

function ErrorState(props: { theme: Theme; t: T; message: string; onRetry?: () => void }) {
  const { theme, t } = props;
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 10 }}>
      <Icon name="TriangleAlert" size={24} color={theme.colors.statusDanger} />
      <Text style={{ color: theme.colors.statusDanger, fontSize: 13, textAlign: "center" }}>{t("error", { message: props.message })}</Text>
      {props.onRetry ? <SmallButton theme={theme} icon="RefreshCw" label={t("retry")} onPress={props.onRetry} /> : null}
    </View>
  );
}

function IconButton(props: { theme: Theme; icon: string; label: string; onPress(): void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={props.label} hitSlop={8} onPress={props.onPress}>
      <Icon name={props.icon} size={18} color={props.theme.colors.foregroundMuted} />
    </Pressable>
  );
}

function SmallButton(props: { theme: Theme; icon: string; label: string; onPress(): void }) {
  const { theme } = props;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={props.onPress}
      style={({ hovered, pressed }: { hovered?: boolean; pressed: boolean }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 6,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: hovered || pressed ? theme.colors.surface2 : theme.colors.surface1,
      })}
    >
      <Icon name={props.icon} size={14} color={theme.colors.foreground} />
      <Text style={{ color: theme.colors.foreground, fontSize: 12 }}>{props.label}</Text>
    </Pressable>
  );
}
