export interface LayoutSourceStatusInput {
  source: "document" | "rule" | "global";
  presetLabel: string;
  basePresetLabel?: string;
  followsObsidian?: boolean;
}

export function formatLayoutSourceStatus(input: LayoutSourceStatusInput): string {
  if (input.source === "document") {
    return input.basePresetLabel && input.basePresetLabel !== input.presetLabel
      ? `当前笔记独立版式｜基于 ${input.basePresetLabel}`
      : `当前笔记独立版式｜${input.presetLabel}`;
  }
  if (input.source === "rule") return `自动规则｜${input.presetLabel}`;
  if (input.followsObsidian) return "跟随 Obsidian";
  return `跟随全局默认｜${input.presetLabel}`;
}
