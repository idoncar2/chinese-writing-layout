import { describe, expect, it } from "vitest";
import { SettingsSaveQueue } from "../src/settings-save-queue";

describe("settings save queue", () => {
  it("runs concurrent saves in order and remains usable after a failure", async () => {
    const queue = new SettingsSaveQueue();
    const events: string[] = [];

    const first = queue.enqueue(async () => {
      events.push("start:first");
      await Promise.resolve();
      events.push("end:first");
    });
    const second = queue.enqueue(async () => {
      events.push("start:second");
      events.push("end:second");
    });

    await Promise.all([first, second]);
    expect(events).toEqual([
      "start:first",
      "end:first",
      "start:second",
      "end:second",
    ]);

    await expect(queue.enqueue(async () => {
      throw new Error("save failed");
    })).rejects.toThrow("save failed");
    await expect(queue.enqueue(() => {
      events.push("after:failure");
    })).resolves.toBeUndefined();
    expect(events.at(-1)).toBe("after:failure");
  });
});
