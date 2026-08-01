# Local Git Hook Change Attestation

## English

The first enforcement increment is a standalone Go binary under `apps/specforge-cli/`. It works with Java, Go, Python, Node.js, and mixed Monorepos without requiring those repositories to install a language-specific SDK.

### Configure a repository

Copy `.specforge.yaml.example` to `.specforge.yaml`, set the repository identity, exact application-service mappings, and the active Design Change Session IDs returned by the SpecForge MCP preflight. The file contains no credentials.

Set the governance endpoint with `governance.endpoint` or `SPECFORGE_MCP_ENDPOINT`. Store the bearer token through the configured Git credential helper:

```text
specforge login
specforge hook install
specforge hook doctor
```

The HTTP MCP service requires `SPECFORGE_MCP_TRANSPORT=http`, `SPECFORGE_MCP_BEARER_TOKEN`, `SPECFORGE_MCP_TOKEN_SCOPE_IDS`, and a PKCS#8 DER Ed25519 private key in `SPECFORGE_ATTESTATION_PRIVATE_KEY_PKCS8`. The private key never enters repository configuration.

### Commit behavior

The managed `pre-commit` dispatcher preserves an existing hook as `pre-commit.specforge-original`. It computes the staged tree and manifest, requests an attestation, verifies the Ed25519 signature, rechecks the staged tree, and then allows the commit. Any unmapped path, missing session, unauthorized Scope, `UNVERIFIED` reconciliation, unavailable server, invalid signature, or changed index blocks the commit.

`specforge hook uninstall` restores the preserved hook. Local hooks can still be bypassed with `git commit --no-verify`; CodeHub protected-branch enforcement remains a separate backlog item.

## 中文

第一增量是 `apps/specforge-cli/` 下的独立 Go 可执行文件，覆盖 Java、Go、Python、Node.js 和混合 Monorepo，不要求存量仓库安装特定语言 SDK。

复制 `.specforge.yaml.example` 为 `.specforge.yaml`，填写仓库身份、精确应用服务路径映射，以及 SpecForge MCP 预检返回的有效 Design Change Session ID。配置文件不保存凭据。

通过 `governance.endpoint` 或 `SPECFORGE_MCP_ENDPOINT` 指定治理服务，并通过 Git credential helper 保存 Token：

```text
specforge login
specforge hook install
specforge hook doctor
```

HTTP MCP 服务需要配置 `SPECFORGE_MCP_TRANSPORT=http`、`SPECFORGE_MCP_BEARER_TOKEN`、`SPECFORGE_MCP_TOKEN_SCOPE_IDS` 和 PKCS#8 DER 格式的 Ed25519 私钥 `SPECFORGE_ATTESTATION_PRIVATE_KEY_PKCS8`。私钥不会进入仓库配置。

托管的 `pre-commit` 分发器会把原 Hook 保存为 `pre-commit.specforge-original`，计算暂存 tree 和文件清单，申请证明，验证 Ed25519 签名，再次检查暂存区，最后才允许提交。路径未映射、会话缺失、Scope 未授权、对账为 `UNVERIFIED`、服务不可达、签名无效或暂存区发生变化都会阻止提交。

`specforge hook uninstall` 会恢复原 Hook。本地 Hook 仍可被 `git commit --no-verify` 绕过；CodeHub 受保护分支门禁仍作为独立待办。
