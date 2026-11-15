# MemQ MCP 测试环境计划

## 环境

1. 创建独立的 Supabase 测试项目（或确认账户支持后使用持久测试分支），只使用示例账号和数据。先检查现有迁移与线上结构的差异；不要直接运行 `reset_all_tables.sql`，也不要复制真实用户数据。
2. 为 MCP 创建独立的 Cloudflare Worker 和 KV 命名空间，并使用独立的 HTTPS 测试地址。测试与正式环境使用不同的项目、地址、凭据、OAuth 客户端及存储。
3. 为测试项目配置 Supabase OAuth 客户端及回调地址，并部署测试版授权页。授权服务先保持关闭；核对测试资源和回调后，再仅在测试环境启用。
4. 为测试版应用配置独立的 Supabase 地址和 MCP 地址；连接管理功能只在测试构建开启。

## 验证顺序

1. 在测试数据库应用经审查的结构变更，验证迁移历史、现有 RLS 和两个测试账号的数据隔离。
2. 使用测试账号完成网页登录、同意与拒绝授权、刷新和撤销；验证 MCP 令牌不能直接用于 Supabase 的其他账户接口。
3. 分别从 ChatGPT、Claude 和 Gemini 测试发现服务、连接、创建/编辑/删除课程与卡片、生成和保存题目。记录各客户端支持情况和其自身的确认流程。
4. 验证每道选择题保存 5–6 个选项，而练习只显示正确答案及随机抽取的三个干扰项。测试空课程、少量卡片、较长内容和卡片修改时的旧题处理。
5. 验证手机端 Connected apps 查看和断开连接，及不同客户端互不干扰。测试并发刷新、撤销后的访问、错误恢复，以及多区域存储一致性。
6. 汇总实际结果后再制定生产部署步骤；在安全检查、客户端兼容和权限审查完成前，不开放正式连接。

## 尚待确认

- Supabase 组织的可用项目配额、分支功能和可能的费用。
- Cloudflare 账户及可用的 HTTPS 测试域名。
- 三个目标客户端各自的账户、地区和自定义 MCP 功能可用性。
- 线上数据库迁移历史与已部署函数的完整清单；本地代码不是线上权限的证明。

2026-11-13 只读检查：Supabase 账户中可见当前 MemQ 项目和一个未启用的其他产品项目，没有已识别的 MemQ 测试项目；不要复用后者。Cloudflare CLI 的登录已过期。仓库的迁移目录含未编号的基础结构文件和会删除表的 `reset_all_tables.sql`，因此不能直接把整个目录当作可安全重放的初始化方案；应先整理并验证测试库基线和迁移顺序。

基线核对：仓库中 `lessons`、`terms` 和 `questions` 的建表定义出现在 `reset_all_tables.sql` 内，该文件先执行 `DROP TABLE ... CASCADE`；现有 `supabase/tests/mcp_fixture.sql` 只是用于隔离测试的简化结构，并不代表正式库。`create_srs_schema.sql` 又依赖已经存在的 `terms`。因此，需要先只读导出正式库的结构、约束、策略和迁移记录，与仓库逐项比对，再生成不包含用户数据或破坏性重置的测试基线；不能用简化 fixture 代替完整应用环境。

已准备 `supabase/tests/mcp_staging_core.sql`，仅用于全新空白测试项目中的 MCP 核心表验证：包含课程、卡片和题目、所有权策略及基本关联，不含完整应用所需的资料、进度、存储和其他功能。它在任一目标表已存在时拒绝运行，不可用于正式项目。`./scripts/test-mcp-staging-core.sh` 在一次性本地数据库验证该脚本可与相关 MCP 迁移依次执行，且第二次执行会被拒绝；它还使用本地 Auth 用户记录验证外键、所有权、原子回滚和题目操作。测试中身份通过模拟 JWT 声明注入，并非真实登录；真实 Supabase 登录及两用户权限仍需在测试项目验证。完整应用测试仍需要完整基线。

后续检查：Cloudflare 已登录，账户中未发现现有 KV 命名空间。Supabase 只读结构导出尝试因数据库主机名解析失败而终止，未取得基线；管理台会话也已过期，需重新登录后继续核对。未创建测试资源或改动正式数据。

资源条件：管理台显示当前组织使用 Free 计划，项目创建表单可打开，且要求设置数据库密码。Supabase 文档称 Free 计划最多可有两个活跃免费项目、暂停项目不计入该限额；项目列表中的另一个产品显示为 `INACTIVE`，但应在实际创建前确认它是否属于暂停状态以及账户其他组织占用情况，不能仅凭列表推断一定有空余配额。不要为了测试升级计划或启用收费附加服务。参考 [Supabase 计费说明](https://supabase.com/docs/guides/platform/billing-on-supabase)。

用户确认目前没有可用的免费项目额度。备选方案是在全新隔离的本地 Supabase 项目中仅创建示例账号与数据，再临时提供 HTTPS 地址供目标客户端测试。Cloudflare Quick Tunnel 是一种开发测试选项，地址是临时公开的，知道地址的人可访问服务；停止隧道后地址失效，不能用作正式部署。[Quick Tunnel 文档](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/)

最初检查时 `cloudflared` 不在 PATH；随后为隔离测试取得了临时副本。2026-11-15 再次确认该副本存在且可执行，但这不代表临时隧道正在运行。现有 broker 对非本地地址要求 HTTPS 上游，因此不能仅把本地 Worker 暴露出去就假定 OAuth 可用。需要为全新隔离项目安排可验证的 HTTPS 上游和回调，匹配 Supabase OAuth 的重定向配置，确认浏览器能完成登录，再验证目标客户端对临时域名的接受情况。不能复用已运行的用户本地项目或现有测试账户，也不能把该方案当作多地区强一致性或生产安全验证。

独立本地准备已验证：以本文件所述 MCP 核心测试结构和最新本地迁移启动新的 Supabase 项目，并在独立 Worker 中运行 OAuth 测试，覆盖测试账号注册、授权同意/拒绝、课程和卡片操作、两用户隔离、刷新与逐客户端撤销。并发刷新测试只验证至少一条连接仍可用，不能证明强一致性。完成后已关闭并删除本次临时项目；现有用户本地项目未关闭。尚未开放公网地址或测试真实外部客户端。

2026-11-14：用户选择临时公开测试地址后，另建了全新的本地测试库与临时 Worker，并通过临时 HTTPS 隧道连接。公网 HTTP 测试已覆盖注册、OAuth、两用户隔离、课程/卡片/题目操作、刷新和撤销；浏览器中示例账号能登录并到达确认授权，模拟客户端回调因没有启动本地接收器而未在浏览器完成。为适配本地 HTTP 转发，临时 Worker 副本重建了公开请求 URL，这不是生产部署配置。尚未验证 ChatGPT、Claude 或 Gemini；本地 Worker 和隧道停止后地址失效，不用于真实数据。当前环境故意启用了测试专用的最终一致性覆盖，不具备生产级撤销保证。

管理台重新登录后，只读查询了六张核心表的字段：正式 `lessons` 有 `is_vocab_mode` 和 `learning_mode`，尚无 `cover_style`；`terms` 有 `language_data`，尚无 `content_revision`；`questions` 尚无 `source_revision`。用户进度和资料表也存在。该查询仅查看字段元数据，没有读取用户行；约束、策略、触发器和完整迁移历史仍需核对，因此尚不足以生成完整测试基线。

进一步只读核对三张学习表：`lessons.user_id` 关联 `auth.users`，`terms.lesson_id` 和 `questions.term_id` 分别关联上级表，删除均级联；课程模式限定为 `language` 或 `knowledge`。三张表各有一条面向 `authenticated` 的 `ALL` 策略，依据课程所有者限定访问；目录中的 `with_check` 显示为空，按 PostgreSQL 对 `ALL` 策略的规则使用其 `USING` 条件。正式行为仍需在测试项目用不同用户实际验证。已有本地简化 fixture 没有完整复刻上述全部约束，不能直接当作正式库基线。触发器、其他表、授权配置和完整迁移历史仍未完成核对。

只读查询 `supabase_migrations.schema_migrations` 显示正式项目有 12 条版本记录，最后一条为 `20261020141000_add_learning_mode_to_lessons`；本地 2026-11-13 的封面和 MCP 迁移均不在其中。此前经用户批准手动应用的订阅权限修复也没有迁移记录，后续必须对照实际权限与迁移历史处理，不能以记录缺失推断修复未生效。以上只核对了迁移记录和部分核心表，不代表已完成全库结构导出。

授权存储的上线限制：目前的 OAuth provider 从 Workers KV 读取令牌并通过删除 KV 记录撤销连接。Cloudflare 文档说明 KV 跨地区读取是最终一致的，旧值可能继续被缓存；据此推断，单地区本地测试通过不能证明撤销会立即在所有地区生效。同一授权的并发刷新也不能仅靠 KV 获得事务保证。上线前需要设计并验证强一致的授权状态检查与刷新协调，并确保所有受保护请求和撤销路径都经过该机制；单独串行化写入但继续从 KV 缓存读取并不足以证明立即撤销。[Cloudflare KV 一致性说明](https://developers.cloudflare.com/kv/concepts/how-kv-works/)

本地依赖检查进一步确认：当前 provider 的令牌验证直接读取 `token:{userId}:{grantId}:{id}`，撤销时删除该前缀下的令牌和授权记录；刷新回调可获得稳定的 `userId` 和 `grantId`。因此设计强一致方案时，必须同时覆盖令牌读取、撤销和同一授权的刷新，不能只在应用的 Connected apps 页面加状态判断。上述检查针对当前安装的依赖版本，升级后应重新核对。

官方参考：[Supabase 多环境](https://supabase.com/docs/guides/deployment/managing-environments)、[Supabase 分支](https://supabase.com/docs/guides/deployment/branching)、[Cloudflare KV 环境隔离](https://developers.cloudflare.com/kv/reference/environments/)。
# 客户端入口复核（2026-11-14）

已在当前登录的 ChatGPT Plus 账户检查「Settings → Plugins」：页面提供插件目录和已安装插件管理，但未显示自定义 MCP 服务器或开发者模式入口。因此无法从该账户完成 ChatGPT 真实客户端连接验证。这个结果只描述当前账户和当时看到的界面，不代表所有账户或其他客户端均不支持。临时服务的脚本测试不应作为真实客户端验证的替代。

2026-11-15：Claude 的[自定义连接器说明](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp)列出个人账户的 Customize → Connectors → Add custom connector 路径，并支持自动注册 OAuth 客户端。远程连接由 Claude 的云端发起，服务必须可从公网访问；本机地址不能作为真实客户端测试地址。该信息来自官方文档，尚未验证当前账户能否完成连接。测试时应使用独立示例账户、明确选择自动注册并在结束后移除临时连接器，不得接入真实 MemQ 数据。

