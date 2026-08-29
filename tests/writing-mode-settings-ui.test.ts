import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve("src/settings.ts"), "utf8");

describe("writing mode settings UI", () => {
  it("replaces the old ordinary CSS-only section with writing scope controls", () => {
    expect(source).toContain("写作范围与自动套用");
    expect(source).toContain("defaultWritingModeEnabled");
    expect(source).toContain("applyGlobalLayoutPreset");
    expect(source).toContain("推荐写作版式");
    expect(source).toContain("跟随 Obsidian");
    expect(source).toContain("当前自定义设置");
    expect(source).toContain("已保存");
    expect(source).not.toContain('setName("启用类名")');
    expect(source).not.toContain("renderCssClassLayoutRules");
  });

  it("renders ordered rules for every matching kind with explicit first-match semantics", () => {
    expect(source).toContain("autoApplyRules");
    expect(source).toContain("按顺序匹配，第一条命中的规则生效。");
    expect(source).toContain('"folder"');
    expect(source).toContain('"tag"');
    expect(source).toContain('"filename"');
    expect(source).toContain('"css-class"');
    expect(source).toContain("includeSubfolders");
    expect(source).toContain("activateWritingMode");
    expect(source).toContain("arrow-up");
    expect(source).toContain("arrow-down");
    expect(source).toContain("trash-2");
    expect(source).toContain("TFolder");
    expect(source).toContain("getAllLoadedFiles");
    expect(source).toContain("getAllTags");
    expect(source).toContain("getMarkdownFiles");
    expect(source).not.toContain("getTags()");
    expect(source).toContain('addOption("", "选择文件夹")');
    expect(source).toContain('addOption("/", "Vault 根目录")');
    expect(source).toContain("（文件夹不存在）");
    expect(source).toContain('createSpan({ text: "包含子文件夹"');
    expect(source).toContain('createSpan({ text: "自动开启写作模式"');
    expect(source).toContain("renderAutoApplyRuleCard");
    expect(source).toContain("renderAutoApplyRuleActions");
    expect(source).toContain("cw-settings-rule-card");
    expect(source).toContain("cw-settings-rule-row");
    expect(source).toContain("cw-settings-rule-match");
    expect(source).toContain("cw-settings-rule-actions");
    expect(source).toContain("aria-label");
  });

  it("keeps an incomplete rule as an in-memory draft until its matcher is complete", () => {
    expect(source).toContain("autoApplyRuleDraft");
    expect(source).toContain("createAutoApplyRuleDraft");
    expect(source).toContain("isAutoApplyRuleDraftComplete");
    expect(source).toContain("commitAutoApplyRuleDraft");
    expect(source).toContain("focusAutoApplyRuleMatcher");
    expect(source).toContain('"待设置"');
    expect(source).toContain('"优先级最高"');
    expect(source).toContain('text: "选择匹配条件后，这条规则才会生效。"');
    expect(source).toContain("this.autoApplyRuleDraft = undefined");
    expect(source).toContain('data-cw-rule-matcher');
    expect(source).toContain("this.isAutoApplyRuleDraftComplete(draft)");
  });

  it("lets a draft be cancelled and never auto-recreates it after the last deletion", () => {
    expect(source).toContain("cancelAutoApplyRuleDraft");
    // 草稿只在“添加规则”时创建，渲染与删除都不得自动补一张空草稿。
    const displayStart = source.indexOf(
      "private getAutoApplyRuleDraftForDisplay(): AutoApplyRuleDraft | undefined {",
    );
    const displayBody = source.slice(
      displayStart,
      source.indexOf("\n  private ", displayStart),
    );
    expect(displayBody).not.toContain("createAutoApplyRuleDraft");
    expect(displayBody).toContain("return this.autoApplyRuleDraft;");
    // 删除最后一条规则后回到真正的“没有新规则”状态，并显示空状态提示。
    expect(source).toContain("cw-settings-auto-rules-empty");
    expect(source).toContain("还没有自动套用规则。点击“添加规则”开始创建。");
    expect(source).toContain("private async removeAutoApplyRule");
    const removeStart = source.indexOf("private async removeAutoApplyRule");
    const removeBody = source.slice(
      removeStart,
      source.indexOf("\n  private ", removeStart),
    );
    expect(removeBody).not.toContain("createAutoApplyRuleDraft");
    // 草稿卡片上的垃圾桶用于取消草稿，而不是删除一条已保存规则。
    expect(source).toContain('isDraft ? "取消草稿" : "删除规则"');
  });

  it("updates rule cards in place instead of redrawing the whole settings page", () => {
    expect(source).toContain("private renderAutoApplyRules");
    expect(source).toContain("private refreshAutoApplyRules");
    const methods = [
      "addAutoApplyRule",
      "commitAutoApplyRuleDraft",
      "changeAutoApplyRuleKind",
      "moveAutoApplyRule",
      "removeAutoApplyRule",
    ];
    for (const method of methods) {
      const start = Math.max(
        source.indexOf(`private ${method}`),
        source.indexOf(`private async ${method}`),
      );
      const next = source.indexOf("\n  private ", start + 1);
      const body = source.slice(start, next < 0 ? source.length : next);
      expect(body, method).toContain("refreshAutoApplyRules");
      expect(body, method).not.toContain("this.display();");
    }
  });

  it("does not redraw the whole settings page after saving a layout template", () => {
    const start = source.indexOf("private renderSaveLayoutPreset");
    const next = source.indexOf("\n  private ", start + 1);
    const body = source.slice(start, next < 0 ? source.length : next);
    expect(body).not.toContain("this.display();");
  });

  it("documents filename matching and keeps legacy activation in a collapsed compatibility section", () => {
    expect(source).toContain("basename");
    expect(source).toContain("不含 .md");
    expect(source).toContain("整串匹配");
    expect(source).toContain("* 表示任意字符");
    expect(source).toContain("忽略英文大小写");
    expect(source).toContain("currentFilename.pattern = input.value;");
    expect(source).toContain("CSS Classes 兼容设置");
    expect(source).toContain("activationClass");
    expect(source).toContain("details");
    expect(source).not.toContain("cssClassLayoutRules");
  });

  it("uses the new rule defaults and preserves template saving", () => {
    expect(source).toContain('kind: "folder"');
    expect(source).toContain("includeSubfolders: true");
    expect(source).toContain("activateWritingMode: true");
    expect(source).toContain("保存当前版式为模板");
    expect(source).toContain("saveCustomLayoutPreset");
    expect(source).toContain('layoutPreset: "default"');
  });

  it("separates automatic and manual typewriter settings", () => {
    expect(source).toContain("autoTypewriterOnWritingMode");
    expect(source).toContain('setName("开启写作模式时自动启用")');
    expect(source).toContain('setName("光标位置")');
    expect(source).toContain('setName("手动开启打字机模式")');
    expect(source).toContain("让正在输入的一行停留在指定高度，只改变编辑视图，不会修改正文。");
    expect(source).toContain("开启后会记住状态，直到再次关闭；与自动启用相互独立。");
    expect(source).not.toContain("手动常驻");
    expect(source).toContain("setManualTypewriterMode");
    expect(source).toContain("TYPEWRITER_CURSOR_POSITIONS");
  });
});
