import type { PluginClientContext } from "@getpaseo/plugin/client";
import { useSyncExternalStore } from "react";
import { listMailboxesRpc, revisionRpc, type Mailbox } from "../shared/contracts";

/** How often an open Mail screen asks the daemon whether anything changed (one tiny RPC). */
export const POLL_MS = 3_000;
/** Mailboxes are fetched again at least this often, for changes the revision does not see (a title). */
export const FALLBACK_MS = 60_000;

export interface MailSnapshot {
  /** The revision the mailboxes were fetched at; the mail list and reader refetch when it moves. */
  revision: string | null;
  /** null before the first load. */
  mailboxes: Mailbox[] | null;
  error: string | null;
}

export interface MailStore {
  subscribe(listener: () => void): () => void;
  get(): MailSnapshot;
  /** Fetch the mailboxes now (after an action, or the refresh button), merged with one in flight. */
  refresh(): void;
}

type Rpc = Pick<PluginClientContext, "rpc">;

/**
 * The Mail screen's data, kept while a screen is open (docs/adrs/2026-11-10-mail-screen.md):
 * the plugin SDK cannot push from the daemon, and mail changes inside agent turns without an
 * agent event, so the store polls `mail.revision` and fetches the mailboxes only when it moves.
 */
export function createMailStore(client: Rpc, timers: { poll: number; fallback: number } = { poll: POLL_MS, fallback: FALLBACK_MS }): MailStore & { dispose(): void } {
  let snapshot: MailSnapshot = { revision: null, mailboxes: null, error: null };
  const listeners = new Set<() => void>();
  let running = false;
  let inFlight = false;
  let again = false;
  let stop: (() => void) | null = null;

  const set = (next: Partial<MailSnapshot>) => {
    snapshot = { ...snapshot, ...next };
    for (const listener of listeners) listener();
  };
  const fail = (error: unknown) => {
    console.error("[paseo-mail] refresh failed", error);
    if (running) set({ error: error instanceof Error ? error.message : String(error) });
  };

  const refresh = () => {
    if (!running) return;
    if (inFlight) {
      again = true;
      return;
    }
    inFlight = true;
    void client
      .rpc(listMailboxesRpc, {})
      .then(({ revision, mailboxes }) => {
        if (running) set({ revision, mailboxes, error: null });
      })
      .catch(fail)
      .finally(() => {
        inFlight = false;
        if (again) {
          again = false;
          refresh();
        }
      });
  };

  const poll = () => {
    if (!running || inFlight) return;
    void client
      .rpc(revisionRpc, {})
      .then(({ revision }) => {
        if (revision !== snapshot.revision) refresh();
        else if (snapshot.error) set({ error: null });
      })
      .catch(fail);
  };

  const start = () => {
    running = true;
    const pollTimer = setInterval(poll, timers.poll);
    const fallbackTimer = setInterval(refresh, timers.fallback);
    stop = () => {
      clearInterval(pollTimer);
      clearInterval(fallbackTimer);
    };
    refresh();
  };
  const halt = () => {
    running = false;
    stop?.();
    stop = null;
    snapshot = { revision: null, mailboxes: null, error: null };
  };

  return {
    subscribe(listener) {
      listeners.add(listener);
      if (!running) start();
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) halt();
      };
    },
    get: () => snapshot,
    refresh,
    dispose: halt,
  };
}

export function useMail(store: MailStore): MailSnapshot {
  return useSyncExternalStore(store.subscribe, store.get);
}
