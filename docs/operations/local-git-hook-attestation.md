# Local Git Hook Change Attestation

## English

The first enforcement increment is a standalone Go binary under `apps/specforge-cli/`. It works with Java, Go, Python, Node.js, and mixed Monorepos without requiring those repositories to install a language-specific SDK.

### Configure a repository

Build the standalone binary and copy the repository-only configuration template. `.specforge.yaml` is ignored locally because it contains the active session binding for this checkout:

```powershell
go build -o dist/specforge.exe .
Copy-Item .specforge.yaml.example .specforge.yaml
```

Set the exact Design Change Session ID returned by the SpecForge MCP preflight in `.specforge.yaml`. The file contains identity, mappings, and session IDs only; it contains no credentials.

Provision the signing key outside the repository, then start the authenticated Streamable HTTP MCP endpoint. The bearer token must be supplied by the operator in the current process:

```powershell
.\deploy\scripts\new-attestation-key.ps1
$env:SPECFORGE_MCP_BEARER_TOKEN = "<operator-provided-token>"
$env:SPECFORGE_MCP_TOKEN_SCOPE_IDS = "com.huawei.celon.desiner"
.\deploy\scripts\start-mcp-http.ps1

specforge login
specforge hook install
specforge hook doctor
```

The helper reads the PKCS#8 DER Ed25519 private key from the user-local `%USERPROFILE%\.specforge\attestation-key.json` file. Alternatively, set `SPECFORGE_ATTESTATION_PRIVATE_KEY_PKCS8` directly. `SPECFORGE_MCP_TRANSPORT=http` and `SPECFORGE_MCP_HTTP_PORT=3001` are set only on the MCP server process. The private key and bearer token never enter repository configuration.
The key generator refuses to overwrite an existing key and restricts the key file ACL to the current Windows user; use `-Force` only for an intentional rotation.

### Commit behavior

The managed `pre-commit` dispatcher preserves an existing hook as `pre-commit.specforge-original`. It computes the staged tree and manifest, requests an attestation, verifies the Ed25519 signature, rechecks the staged tree, and then allows the commit. Any unmapped path, missing session, unauthorized Scope, `UNVERIFIED` reconciliation, unavailable server, invalid signature, or changed index blocks the commit.

`specforge hook uninstall` restores the preserved hook. Local hooks can still be bypassed with `git commit --no-verify`; CodeHub protected-branch enforcement remains a separate backlog item.

## 中文

第一增量是 `apps/specforge-cli/` 下的独立 Go 可执行文件，覆盖 Java、Go、Python、Node.js 和混合 Monorepo，不要求存量仓库安装特定语言 SDK。

先构建独立 CLI，再复制仓库配置模板。`.specforge.yaml` 被本地忽略，因为它包含当前检出的会话绑定：

```powershell
go build -o dist/specforge.exe .
Copy-Item .specforge.yaml.example .specforge.yaml
```

把 SpecForge MCP 预检返回的精确 Design Change Session ID 写入 `.specforge.yaml`。该文件只包含仓库身份、路径映射和会话 ID，不保存凭据。

在仓库外生成签名密钥，然后启动带鉴权的 Streamable HTTP MCP 端点。Token 由操作者注入当前进程：

```powershell
.\deploy\scripts\new-attestation-key.ps1
$env:SPECFORGE_MCP_BEARER_TOKEN = "<operator-provided-token>"
$env:SPECFORGE_MCP_TOKEN_SCOPE_IDS = "com.huawei.celon.desiner"
.\deploy\scripts\start-mcp-http.ps1

specforge login
specforge hook install
specforge hook doctor
```

辅助脚本从用户目录 `%USERPROFILE%\.specforge\attestation-key.json` 读取 PKCS#8 DER 格式的 Ed25519 私钥；也可以直接设置 `SPECFORGE_ATTESTATION_PRIVATE_KEY_PKCS8`。`SPECFORGE_MCP_TRANSPORT=http` 和 `SPECFORGE_MCP_HTTP_PORT=3001` 只注入 MCP 服务进程。私钥和 Bearer Token 都不会进入仓库配置。
密钥生成器默认拒绝覆盖已有密钥，并将密钥文件 ACL 限制为当前 Windows 用户；只有明确轮换时才使用 `-Force`。

托管的 `pre-commit` 分发器会把原 Hook 保存为 `pre-commit.specforge-original`，计算暂存 tree 和文件清单，申请证明，验证 Ed25519 签名，再次检查暂存区，最后才允许提交。路径未映射、会话缺失、Scope 未授权、对账为 `UNVERIFIED`、服务不可达、签名无效或暂存区发生变化都会阻止提交。

`specforge hook uninstall` 会恢复原 Hook。本地 Hook 仍可被 `git commit --no-verify` 绕过；CodeHub 受保护分支门禁仍作为独立待办。
