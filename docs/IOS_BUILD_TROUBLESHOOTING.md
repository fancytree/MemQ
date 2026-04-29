# iOS 构建故障排除指南

## CocoaPods 安装问题

### 自动安装（推荐）

运行 `npx expo run:ios` 时，如果 CocoaPods 未安装，系统会自动安装。这是正常行为，请等待安装完成。

### 手动安装 CocoaPods

如果自动安装失败，可以手动安装：

```bash
# 使用 Homebrew 安装（推荐）
brew install cocoapods

# 或使用 Gem 安装
sudo gem install cocoapods
```

### 验证安装

```bash
pod --version
```

应该显示版本号，例如：`1.15.2`

## 常见问题

### 1. CocoaPods 安装权限问题

如果遇到权限错误：

```bash
# 使用 Homebrew 安装（不需要 sudo）
brew install cocoapods

# 或使用用户目录安装
gem install cocoapods --user-install
```

### 2. Pod 安装失败

如果 `pod install` 失败：

```bash
# 清理并重新安装
cd ios
rm -rf Pods Podfile.lock
pod install --repo-update
cd ..
```

### 3. Xcode 命令行工具未安装

```bash
# 安装 Xcode 命令行工具
xcode-select --install
```

### 4. 构建缓存问题

```bash
# 清理构建缓存
cd ios
rm -rf build
rm -rf ~/Library/Developer/Xcode/DerivedData
cd ..
npx expo run:ios
```

### 5. 依赖版本冲突

```bash
# 更新 CocoaPods
sudo gem update cocoapods

# 更新 Pod 仓库
pod repo update
```

## 构建流程

正常的构建流程应该是：

1. ✅ 检查 CocoaPods（自动安装如果缺失）
2. ✅ 安装 iOS 依赖（`pod install`）
3. ✅ 编译原生代码
4. ✅ 启动 Metro bundler
5. ✅ 在模拟器或设备上运行应用

## 如果构建仍然失败

1. **检查 Xcode 版本**：
   ```bash
   xcodebuild -version
   ```
   确保使用最新版本或兼容版本

2. **检查 Node 版本**：
   ```bash
   node --version
   ```
   推荐使用 Node 18 或更高版本

3. **清理所有缓存**：
   ```bash
   # 清理 Expo 缓存
   npx expo start -c
   
   # 清理 iOS 构建
   cd ios
   rm -rf Pods Podfile.lock build
   pod install
   cd ..
   ```

4. **重新生成原生代码**：
   ```bash
   npx expo prebuild --clean
   npx expo run:ios
   ```

## 获取帮助

如果问题仍然存在，可以：

1. 查看完整的错误日志
2. 检查 [Expo 文档](https://docs.expo.dev/)
3. 查看 [CocoaPods 文档](https://guides.cocoapods.org/)
