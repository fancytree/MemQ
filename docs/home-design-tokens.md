# MemQ 首页设计规范

设计基准：[首页 Figma，节点 1:176](https://www.figma.com/design/mH3dfsUnPuRiCAUBTWE6cX/Untitled?node-id=1-176)。本文区分设计稿中可见的值与为了适配其他页面而建立的语义规则。实际运行值以 `theme/colors.ts`、`theme/typography.ts`、`theme/spacing.ts` 和 `theme/components.ts` 为准；`theme/tokens.json`、CSS 与设计系统预览由脚本生成。

## 颜色

| 用途 | Token | 值 |
| --- | --- | --- |
| 页面底色 | `colors.bg` | `#FCFCED` |
| 卡片表面 | `colors.surf` | `#FFFFFF` |
| 主操作／进度 | `colors.action` | `#6C3CBC` |
| 深紫文本／按压 | `colors.sub` / `colors.actionPressed` | `#4B2C78` |
| 主要文本 | `colors.text` | `#301A50` |
| 次要文本 | `colors.muted` | `#4B2C78` |
| 分隔／底层 | `colors.border` | `#E5DFEB` |
| 柔和紫色表面 | `colors.accentL` | `#EDE1FD` |
| 进度轨道 | `colors.progressTrack` | `#F0E4FC` |
| 首页导航表面／选中 | `homeColors.nav` / `homeColors.selected` | `#F7F5FA` / `#F4FAB1` |

首页渐变使用 `homeColors.gradientStart`、`gradientBright`、`gradientSoft` 和 `canvas`，节点位置为 0%、21.154%、44.712%、100%。强调渐变用于首页，而一般页面使用静态底色。其他页面的次要文字使用较深的紫色以满足现有对比度检查；首页专用小字保留设计稿的 `homeColors.muted`。成功、警告和错误沿用原有语义颜色，避免用品牌紫替代状态含义。

## 字体

全平台 UI 只使用 Geist 与 Oswald。Geist 用于正文、控件和辅助说明，按需要使用 Regular、Medium、SemiBold、Bold、ExtraBold；Oswald SemiBold 用于首页数字、课程名称及紧凑的数字强调。`fonts` 和 `type` 提供共享角色，页面应引用这些角色，不应直接引入第三种字体。字号、行高以 `type` 具体角色为准；首页关键值为 36px 数字标题、24px 副标题／主按钮、20px 区块标题、18px 课程标题、14px、`#795BA3` 课程进度说明和 12px 辅助文字。

## 间距、圆角与深度

间距以 4px 为基础，常用 4、8、12、16、24、32px；页面水平留白为 16px，卡片间距常用 16px，卡片内部区块间距常用 24px。普通内容卡片使用 24px 圆角，图标容器使用 12px，操作按钮和导航使用胶囊圆角。触控目标至少 44px。

首页按钮、卡片、streak 和导航的底部厚度采用两个完整圆角表面叠放：底层颜色略深，上层向上偏移 2–4px。避免只设置 `borderBottomWidth`，以免圆角两端出现不均匀边缘。其他页面的卡片使用共享 `elevation.card`：24px 圆角及向下偏移 4px、无模糊的浅紫色阴影；首页保留圆角叠层实现。具体页面仍需逐屏视觉校准。

## 组件与交互

- 主按钮使用紫色背景、白色 Geist 标签和胶囊形状；按压使用深紫，禁用和加载保留明确反馈。
- 内容卡片使用白色表面、深紫文字和浅紫进度轨道；数据与进度来自实际用户数据。
- Today／Library 底部导航共用胶囊容器，选中项使用淡黄绿色；中央按钮进入创建流程。
- 装饰插画仅用于设计对应的位置；状态栏、安全区域、文字缩放与滚动内容应保持可用。

## 维护

更改源 token 后运行 `npm run design-system:build`，然后运行 `npm run typecheck` 和 `npm run check:ui`。对比度检查不能代替设备上的页面和交互验收；新增页面应检查长文本、小屏幕、键盘、加载及空状态。
