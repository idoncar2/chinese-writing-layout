# 精确字体系统重构：Issue 1 设计

## 范围

本阶段只建立结构化字体引用、用户字体描述模型和一次性兼容迁移。暂不重做字体选择器，不删除字体组合、系统字体扫描或旧 CSS，也不加入真实字体文件。

## 数据模型

- `FontSelection` 使用 `obsidian`、`builtin`、`user`、`system` 四种来源。
- `quoteFont`、`boldFont`、`italicFont` 额外允许 `{ source: "inherit", id: "body" }`。
- `bodyFont` 和 `headingFont` 不允许 `inherit`。
- `UserFont` 只保存字体描述，不保存二进制文件。
- `LayoutPresetValues` 和 `ChineseWritingSettings` 同时保留新的五个角色字段与旧字体字符串字段，供后续阶段切换消费者。

## 迁移规则

- 旧 CSS 字体字符串只取第一个实际字体名称。
- `serif`、`sans-serif`、`monospace` 等通用族只作为解析辅助；没有实际名称时迁移为跟随 Obsidian。
- Obsidian 的 `inherit`、`var(--font-*)` 和历史问号占位值迁移为 `obsidian`。
- Issue 1 不声明任何实际内置字体映射；许可证、体积和跨平台验证完成后再加入 `builtin` 映射。
- 旧 `specialFontFamily` 仍用于 quote/bold/italic 的迁移兼容；新字段缺失时这些角色默认跟随正文。
- `userFonts` 缺失或记录非法时归一化为空或过滤非法记录；缺失字体文件不修改保存的 `user:id`。

## 删除引用修复

Issue 1 只提供纯函数。主动删除用户字体时，body/heading 引用改为跟随 Obsidian，quote/bold/italic 引用改为跟随正文；文件暂时缺失不调用该函数。

## Schema

全局 `settingsSchemaVersion` 从 1 升为 2。加载旧数据时一次性生成新字段并保存；新数据仍保留旧字段，以保证当前渲染、导出和旧 UI 不变。

## 决策记录

1. 采用“新字段优先、旧字段兼容”的增量迁移，避免 Issue 1 同时改动渲染器和 UI。
2. 暂不把现有推荐字体名称猜测为内置字体，避免在许可证和字体打包方式确认前引入不存在的资源。
3. 运行时字体文件缺失与用户主动删除分离：前者保留引用，后者才修复数据引用。
