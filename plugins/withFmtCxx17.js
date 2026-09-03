/**
 * Expo config plugin — 修复 Xcode 26 下 fmt 的 consteval 编译失败。
 *
 * 背景：Expo SDK 52 / RN 0.76 内置的 {fmt} 用 C++20 consteval 做编译期格式串校验，
 * Xcode 26 的 Clang 收紧了常量表达式规则后直接拒绝，报
 * "call to consteval function 'fmt::basic_format_string<...>' is not a constant expression"。
 *
 * 又因为 2026-04-28 起 App Store Connect 只收 Xcode 26+ / iOS 26 SDK 的包，
 * 不能靠把 EAS 构建镜像降到 Xcode 16 来绕开——那样的包上传会被拒。
 *
 * 处理：只把 fmt 这一个 pod 降到 C++17，跳过 consteval 分支；主工程与其余 pod 仍是 C++20。
 *
 * 本项目是托管 / CNG 工作流（ios/ 已 gitignore，EAS 在云端 prebuild），
 * 手改 Podfile 不会保留，因此用 withDangerousMod 在 prebuild 阶段注入。
 *
 * 待 RN 升级到内置新版 fmt（或项目升到 SDK 54+ 默认支持 Xcode 26）后即可移除本插件。
 */
const { withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

const MARKER = '# >>> withFmtCxx17';

const PATCH = `${MARKER}
    # fmt 的 consteval 格式串校验在 Xcode 26 的 Clang 下不再被视为常量表达式，
    # 单独把该 pod 降到 C++17 绕开；其余 target 不受影响。
    installer.pods_project.targets.each do |t|
      if t.name == 'fmt'
        t.build_configurations.each do |c|
          c.build_settings['CLANG_CXX_LANGUAGE_STANDARD'] = 'c++17'
        end
      end
    end
    # <<< withFmtCxx17
`;

const withFmtCxx17 = (config) =>
  withDangerousMod(config, [
    'ios',
    (cfg) => {
      const podfile = path.join(cfg.modRequest.platformProjectRoot, 'Podfile');
      const src = fs.readFileSync(podfile, 'utf8');

      if (src.includes(MARKER)) return cfg;

      const anchor = 'post_install do |installer|\n';
      const at = src.indexOf(anchor);
      if (at === -1) {
        throw new Error(
          '[withFmtCxx17] 未在 Podfile 中找到 post_install 钩子，插件无法应用。' +
            'Expo 模板结构可能已变更，请检查本插件。'
        );
      }

      const at2 = at + anchor.length;
      fs.writeFileSync(podfile, src.slice(0, at2) + PATCH + src.slice(at2));
      return cfg;
    },
  ]);

module.exports = withFmtCxx17;
