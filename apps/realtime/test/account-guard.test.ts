import { describe, expect, it, vi } from "vitest";
import { ACCOUNT_RECHECK_MS, createAccountGuard, type AccountStatus } from "../src/account-guard";

function setup(answer: () => Promise<AccountStatus>) {
  let time = 1000;
  const lookup = vi.fn(answer);
  const onInvalid = vi.fn();
  const guard = createAccountGuard({ lookup, onInvalid, now: () => time });
  return { guard, lookup, onInvalid, advance: (ms: number) => (time += ms) };
}
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("account guard", () => {
  it("doesn't touch the database for a burst of game packets", () => {
    const { guard, lookup } = setup(async () => "valid");
    const next = vi.fn();
    for (let i = 0; i < 500; i++) guard("game:action", next);
    expect(next).toHaveBeenCalledTimes(500);
    expect(lookup).not.toHaveBeenCalled();
  });

  it("never makes a game packet wait, even while a check is hanging", () => {
    const { guard, lookup, advance } = setup(() => new Promise(() => {}));
    advance(ACCOUNT_RECHECK_MS);
    const next = vi.fn();
    for (let i = 0; i < 20; i++) guard("game:action", next);
    expect(next).toHaveBeenCalledTimes(20);
    expect(lookup).toHaveBeenCalledTimes(1);
  });

  it("rechecks at most once per interval", async () => {
    const { guard, lookup, advance } = setup(async () => "valid");
    const next = vi.fn();
    for (let round = 1; round <= 3; round++) {
      advance(ACCOUNT_RECHECK_MS);
      for (let i = 0; i < 50; i++) guard("game:action", next);
      await flush();
      expect(lookup).toHaveBeenCalledTimes(round);
    }
  });

  it("disconnects on the background check once a session is revoked", async () => {
    const { guard, onInvalid, advance } = setup(async () => "invalid");
    guard("game:action", vi.fn());
    expect(onInvalid).not.toHaveBeenCalled();
    advance(ACCOUNT_RECHECK_MS);
    guard("game:action", vi.fn());
    await flush();
    expect(onInvalid).toHaveBeenCalledTimes(1);
  });

  it("makes entry events wait for a fresh answer, and refuses them when revoked", async () => {
    let resolve!: (status: AccountStatus) => void;
    const { guard, onInvalid } = setup(() => new Promise((r) => (resolve = r)));
    const next = vi.fn();
    guard("room:create", next);
    await flush();
    expect(next).not.toHaveBeenCalled();
    resolve("invalid");
    await flush();
    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0]![0]).toBeInstanceOf(Error);
    expect(onInvalid).toHaveBeenCalledTimes(1);
  });

  it("lets a valid entry event through", async () => {
    const { guard } = setup(async () => "valid");
    const next = vi.fn();
    guard("room:join", next);
    await flush();
    expect(next).toHaveBeenCalledWith();
  });

  it("keeps players connected when the database can't answer", async () => {
    for (const answer of [async () => "unknown" as const, async () => { throw Error("down"); }]) {
      const { guard, onInvalid, advance } = setup(answer);
      const next = vi.fn();
      advance(ACCOUNT_RECHECK_MS);
      guard("game:action", next);
      guard("room:join", next);
      await flush();
      expect(onInvalid).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalledTimes(2);
      expect(next.mock.calls.every((call) => call.length === 0)).toBe(true);
    }
  });
});
