import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";

it("requires dual-record ADR governance", async () => {
  const agents = await readFile("AGENTS.md", "utf8");
  const adrReadme = await readFile("docs/adr/README.md", "utf8");
  expect(agents).toContain("MCP synchronization blocked");
  expect(agents).toContain("English canonical");
  expect(agents).toContain("docs/adr/");

  for (const requirement of [
    "用户可见或工作流层面的结果必须创建或更新 Proposal",
    "面向代理的变更必须更新或要求关联的 Context Pack",
    "关系链接必须有方向、有类型且范围安全",
    "PostgreSQL 对已编写资产和关系事件保持权威",
    "图数据库只能作为派生投影",
    "区分已实现的行为、已在本地验证的行为和延期的生产能力",
    "Evidence 政策要求为每项变更记录精确命令、操作检查及其结果",
  ]) {
    expect(agents).toContain(requirement);
  }

  for (const requirement of [
    "发布后文件名必须稳定",
    "ADR 重命名必须有明确决策，并更新仓库中的所有引用",
    "ADR 必须写明稳定 ID、精确的所属 `architectureScope`、相关资产或记录以及实现状态",
    "`Alternatives` 必须说明被拒绝的选项及原因",
    "`Consequences` 必须包含实质性权衡",
    "`Constraints` 必须在适用时包含范围、权威性、隔离和兼容性要求",
    "每次写入后必须核验返回的 ID、精确范围、英文规范字段、中文覆盖、关系目标和证据",
  ]) {
    expect(adrReadme).toContain(requirement);
  }
});
