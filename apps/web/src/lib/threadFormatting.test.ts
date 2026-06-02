import { describe, it, expect } from "vitest";
import { isSameDay, daySeparator, groupMessages } from "./threadFormatting";

// Use local (no-Z) ISO strings so calendar-day comparisons are independent
// of the runner's timezone.

describe("isSameDay", () => {
  it("compares calendar day, ignoring time", () => {
    expect(isSameDay("2026-06-01T08:00:00", "2026-06-01T23:30:00")).toBe(true);
    expect(isSameDay("2026-06-01T23:00:00", "2026-06-02T01:00:00")).toBe(false);
  });
});

describe("daySeparator", () => {
  it("labels the current instant as Today", () => {
    expect(daySeparator(new Date().toISOString())).toBe("Today");
  });
});

type Msg = { id: string; sender: string; at: string; mine: boolean };

describe("groupMessages", () => {
  it("inserts day separators and collapses consecutive same-sender runs", () => {
    const messages: Msg[] = [
      { id: "m1", sender: "A", at: "2026-06-01T10:00:00", mine: false },
      { id: "m2", sender: "A", at: "2026-06-01T10:01:00", mine: false },
      { id: "m3", sender: "B", at: "2026-06-01T10:05:00", mine: true },
      { id: "m4", sender: "B", at: "2026-06-02T09:00:00", mine: true },
    ];
    const items = groupMessages(messages, {
      isMe: (m) => m.mine,
      senderKey: (m) => m.sender,
      createdAt: (m) => m.at,
      id: (m) => m.id,
    });

    // sep, m1, m2, m3, sep (new day), m4
    expect(items.map((i) => i.kind)).toEqual([
      "sep",
      "msg",
      "msg",
      "msg",
      "sep",
      "msg",
    ]);
    expect(items[0]).toMatchObject({ kind: "sep", key: "sep-m1" });

    // m1: first of its group; tail hidden because m2 is same sender/day.
    expect(items[1]).toMatchObject({ firstInGroup: true, showTail: false, isMe: false });
    // m2: continuation of A; tail shows because m3 is a different sender.
    expect(items[2]).toMatchObject({ firstInGroup: false, showTail: true });
    // m3: new sender (B); tail shows because m4 is on a different day.
    expect(items[3]).toMatchObject({ firstInGroup: true, showTail: true, isMe: true });
    // new-day separator keyed to m4, then m4 starts a fresh group.
    expect(items[4]).toMatchObject({ kind: "sep", key: "sep-m4" });
    expect(items[5]).toMatchObject({ firstInGroup: true, showTail: true });
  });
});
