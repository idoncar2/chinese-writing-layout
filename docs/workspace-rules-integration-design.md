# 工作区套用规则共享设计

状态：已实现，待人工验收

日期：2026-08-30

## 理解摘要

- Writing Calendar 的工作区范围规则要与 Chinese Writing Layout 的自动套用规则保持同一套匹配语义。
- 命中排版插件规则的文件自动纳入日历工作区；规则不再由日历复制维护。
- 排版插件继续作为现有 `autoApplyRules` 的编辑与数据来源，日历通过可选模块 API 读取。
- 两个插件仍可独立安装；排版插件未安装或协议不可用时，日历回退现有 `workspaceFolders`。
- 日历的历史统计不能因为当前标签、CSS Class 或文件状态变化而回溯改写。
- 未来写作工作台直接消费共享规则 API，不读取任一插件私有 `data.json`。

## 假设与约束

- 共享规则第一版包含文件夹、标签、文件名和 CSS Class 四种匹配类型。
- 规则数组顺序继续保留，排版插件仍按第一条命中规则决定版式动作；日历按“至少命中一条”判断当前文件是否进入工作区。
- 文件夹和文件名可以从历史 `event.path` 判断；标签和 CSS Class 没有历史快照，不用于回溯旧 Event。
- 旧日历设置 `workspaceFolders` 不迁移、不删除，继续作为兼容回退范围。
- API 第一版只读并提供订阅；跨插件写入留给未来工作台能力。
- 不引入共享 JSON 文件或强制安装依赖；两个仓库各自保留轻量类型和协议文档。

## 决策日志

| 决策 | 选择 | 原因 |
| --- | --- | --- |
| 共享范围 | 匹配条件与规则顺序 | 排版动作属于排版插件，日历只需要文件是否纳入工作区 |
| 规则来源 | 排版插件作为运行时来源 | 避免两边各维护一份规则产生冲突 |
| 通信方式 | 全局模块注册表 + 只读 API + 订阅 | 保持插件独立，支持未来统一工作台 |
| 旧配置 | 保留 `workspaceFolders` 作为回退 | 不破坏现有用户设置与统计行为 |
| 历史属性 | 标签/CSS Class 不回溯旧 Event | Event 只记录历史路径，避免历史归属被当前属性污染 |
| 共享存储 | 不使用共享 JSON | 避免同步竞争、迁移和旧插件覆盖未知字段 |

## 最终设计

### 共享规则协议

```ts
interface WorkspaceApplyRule {
  id: string;
  kind: "folder" | "tag" | "filename" | "css-class";
  folderPath?: string;
  includeSubfolders?: boolean;
  tag?: string;
  pattern?: string;
  cssClass?: string;
}

interface WorkspaceRulesApi {
  protocolVersion: 1;
  getWorkspaceRules(): readonly WorkspaceApplyRule[];
  subscribe(listener: () => void): () => void;
}
```

- 排版插件把现有 `autoApplyRules` 转换为上述规范化对象后提供。
- 路径统一使用 `/`；标签忽略前导 `#` 并按不区分大小写比较；文件名沿用现有 basename glob 规则；CSS Class 沿用现有规范化规则。
- 无效条目被提供方过滤；返回值为副本，消费者不能直接修改排版设置。
- 能力标识使用 `workspace.rules.read` 与 `workspace.rules.subscribe`；不支持的协议版本必须回退。

### 日历刷新与统计

日历运行时通过模块桥接获取规则。排版插件注册、卸载或保存规则时发出模块变化通知，日历重新绑定订阅并刷新工作台。

有可用规则时：

- 当前文件范围使用 FileIndex 与当前 Obsidian 元数据，四种规则均可参与匹配。
- 历史 Event 只使用 `event.path` 判断文件夹和文件名规则。
- 标签与 CSS Class 不参与旧历史回溯；页面可提示“历史增量仅按路径规则判断”。
- 当前总字数继续使用当前文件位置和当前匹配结果。

没有可用规则时，日历继续使用 `workspaceFolders`；规则来源变化只刷新内存统计，不写入 Ledger 或重写 FileIndex 历史快照。

### 设置与兼容

日历设置页保留原“工作区文件夹”输入，并增加只读的规则来源状态和“打开排版插件设置”入口。不会再提供第二个自动规则编辑器。

排版插件旧版本不提供 API 时不受影响；日历检测不到 API、遇到协议不兼容或读取失败时保留旧范围。新增协议字段不进入旧版插件必须重写的 `autoApplyRules` 结构，避免旧版本保存设置时抹掉共享字段。

## 测试策略

- 排版插件：共享规则转换、四类匹配、规则顺序、API 注册/订阅/卸载。
- Writing Calendar：API 存在、空规则、不兼容版本、损坏规则和回退 `workspaceFolders`。
- 历史边界：文件夹移动后按 `event.path` 统计；标签/CSS Class 变化不改旧历史归属。
- UI：规则来源状态、回退提示、打开排版设置入口，不出现重复规则编辑器。
- 两仓库分别运行完整测试、TypeScript 检查和生产构建。

## 明确不做

- 不把两个插件合并成一个插件。
- 不直接读取或改写另一个插件的私有 `data.json`。
- 不新增共享 JSON 文件、规则冲突合并或跨插件写入。
- 不为历史 Event 增加标签/CSS Class 快照。
- 不改写历史写作 JSONL，不改变既有 `fileId`、`aliases`、`deleted` 生命周期。
