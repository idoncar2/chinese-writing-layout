import { describe, expect, it } from "vitest";
import * as textExport from "../src/text-export";

describe("folder export order", () => {
  it("sorts Chinese chapter numbers by value instead of pronunciation", () => {
    expect(textExport.compareExportNames).toBeTypeOf("function");
    const names = ["第十章", "第八章", "第二章", "第一章", "第一百零一章", "第二十章"];
    expect(names.sort(textExport.compareExportNames)).toEqual([
      "第一章", "第二章", "第八章", "第十章", "第二十章", "第一百零一章",
    ]);
  });

  it("keeps volume order, explicit numeric prefixes, and Arabic natural sorting", () => {
    const groups = [
      ["第十卷 第1章", "第二卷 第十章", "第二卷 第2章"],
      ["03 第一章", "02 第八章", "01 第十章"],
      ["第10章", "第二章", "第1章"],
      ["笔记10", "笔记2", "笔记1"],
    ];
    for (const names of groups) {
      expect([...names].sort(textExport.compareExportNames)).toEqual([...names].reverse());
    }
  });

  it("preserves source titles and the sorted order in every export content format", () => {
    const sources = ["第八章", "第一章", "第十章"]
      .sort(textExport.compareExportNames)
      .map((title) => ({ title, markdown: `${title}正文` }));
    for (const format of ["txt", "md", "docx", "png"] as const) {
      const result = textExport.prepareExportContent(sources, {
        format, scope: "folder", includeFileTitles: true, stripMarkdown: true,
      });
      expect(result.text.indexOf("第一章")).toBeLessThan(result.text.indexOf("第八章"));
      expect(result.text.indexOf("第八章")).toBeLessThan(result.text.indexOf("第十章"));
    }
  });
});
