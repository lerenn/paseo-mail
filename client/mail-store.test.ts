import { afterEach, describe, expect, it, vi } from "vitest";
import { createMailStore } from "./mail-store";

/** A client whose mailbox RPC answers at the daemon's current revision. */
function fakeClient() {
  const state = { revision: "r1", calls: [] as string[] };
  const client = {
    rpc: async (contract: { name: string }) => {
      state.calls.push(contract.name);
      if (contract.name === "mail.revision") return { revision: state.revision };
      return { revision: state.revision, mailboxes: [{ agentId: `a-${state.revision}` }] };
    },
  } as never;
  return { client, state };
}

afterEach(() => vi.useRealTimers());

describe("mail store", () => {
  it("does nothing until a screen subscribes, then polls the revision and fetches mailboxes only when it moves", async () => {
    vi.useFakeTimers();
    const { client, state } = fakeClient();
    const store = createMailStore(client, { poll: 1_000, fallback: 60_000 });
    store.refresh();
    expect(state.calls).toEqual([]);
    const release = store.subscribe(() => undefined);
    await vi.advanceTimersByTimeAsync(0);
    expect(state.calls).toEqual(["mailboxes.list"]);
    expect(store.get()).toMatchObject({ revision: "r1", mailboxes: [{ agentId: "a-r1" }], error: null });

    await vi.advanceTimersByTimeAsync(2_000);
    expect(state.calls).toEqual(["mailboxes.list", "mail.revision", "mail.revision"]);

    state.revision = "r2";
    await vi.advanceTimersByTimeAsync(1_000);
    expect(state.calls.slice(-2)).toEqual(["mail.revision", "mailboxes.list"]);
    expect(store.get().mailboxes).toEqual([{ agentId: "a-r2" }]);

    release();
    const before = state.calls.length;
    await vi.advanceTimersByTimeAsync(5_000);
    expect(state.calls).toHaveLength(before);
    expect(store.get()).toEqual({ revision: null, mailboxes: null, error: null });
  });

  it("keeps the last mailboxes and reports the error when a fetch fails", async () => {
    vi.useFakeTimers();
    const { client } = fakeClient();
    let fail = false;
    const rpc = (client as { rpc: (contract: { name: string }) => Promise<unknown> }).rpc;
    const failing = { rpc: (contract: { name: string }) => (fail ? Promise.reject(new Error("daemon down")) : rpc(contract)) } as never;
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const store = createMailStore(failing, { poll: 1_000, fallback: 60_000 });
    store.subscribe(() => undefined);
    await vi.advanceTimersByTimeAsync(0);
    fail = true;
    await vi.advanceTimersByTimeAsync(1_000);
    expect(store.get()).toMatchObject({ mailboxes: [{ agentId: "a-r1" }], error: "daemon down" });
    fail = false;
    await vi.advanceTimersByTimeAsync(1_000);
    expect(store.get().error).toBeNull();
    store.dispose();
    error.mockRestore();
  });
});
