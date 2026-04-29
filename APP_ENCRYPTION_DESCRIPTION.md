# App Encryption Information

## App Store Connect - App 加密文稿说明

### 应用功能和目的说明

**应用名称：** MemQ: Smart Quiz & Memory

**应用功能和目的：**

MemQ 是一款智能学习助手应用，旨在帮助用户更高效地学习和记忆知识。应用的主要功能包括：

1. **课程管理**：用户可以创建个性化的学习课程，添加术语和定义，组织学习内容。

2. **AI 智能助手**：提供 AI 驱动的学习辅助功能，包括问题生成、概念解释、学习建议和对话式学习支持。

3. **PDF 文档处理**：用户可以上传 PDF 文档，应用会自动提取关键术语和概念，转换为可学习的内容。

4. **闪卡学习系统**：基于科学记忆方法（间隔重复）的闪卡学习功能，帮助用户长期记忆学习内容。

5. **学习进度跟踪**：实时跟踪用户的学习进度、掌握情况和学习统计。

6. **学习提醒**：可自定义的学习提醒通知，帮助用户保持学习习惯。

**目标用户：**
- 学生（准备考试、学习新课程）
- 语言学习者（构建词汇库）
- 专业人士（学习新技能、继续教育）
- 任何希望更有效学习的人

**加密使用说明：**

本应用使用标准 HTTPS/TLS 加密协议进行网络通信，用于：
- 用户认证和数据同步（通过 Supabase）
- API 调用和数据传输
- 保护用户数据在传输过程中的安全性

应用不包含自定义加密算法，仅使用 iOS 系统提供的标准加密功能。根据美国出口管理条例（EAR），本应用符合加密豁免条件（ITSAppUsesNonExemptEncryption: false）。

---

## 英文版本（English Version）

### App Function and Purpose Description

**App Name:** MemQ: Smart Quiz & Memory

**App Function and Purpose:**

MemQ is an intelligent learning assistant application designed to help users learn and remember information more effectively. The app's main features include:

1. **Course Management**: Users can create personalized learning courses, add terms and definitions, and organize study materials.

2. **AI-Powered Assistant**: Provides AI-driven learning support including question generation, concept explanations, learning suggestions, and conversational learning assistance.

3. **PDF Document Processing**: Users can upload PDF documents, and the app automatically extracts key terms and concepts to convert them into learnable content.

4. **Flashcard Learning System**: Flashcard learning feature based on scientific memory methods (spaced repetition) to help users retain information long-term.

5. **Learning Progress Tracking**: Real-time tracking of user learning progress, mastery status, and study statistics.

6. **Study Reminders**: Customizable study reminder notifications to help users maintain consistent learning habits.

**Target Users:**
- Students (exam preparation, learning new subjects)
- Language learners (building vocabulary)
- Professionals (learning new skills, continuing education)
- Anyone who wants to learn more effectively

**Encryption Usage:**

This app uses standard HTTPS/TLS encryption protocols for network communications, including:
- User authentication and data synchronization (via Supabase)
- API calls and data transmission
- Protecting user data during transmission

The app does not contain custom encryption algorithms and only uses standard encryption features provided by iOS. According to U.S. Export Administration Regulations (EAR), this app qualifies for encryption exemption (ITSAppUsesNonExemptEncryption: false).

---

## 简短版本（适合直接复制到 App Store Connect）

### 中文简短版

**应用功能：**
MemQ 是一款智能学习助手应用，帮助用户通过 AI 技术和科学记忆方法更高效地学习。主要功能包括：创建学习课程、AI 生成问题和解释、PDF 文档导入、闪卡学习、进度跟踪和学习提醒。

**加密说明：**
应用仅使用标准 HTTPS/TLS 加密进行网络通信，符合加密豁免条件。

---

### English Short Version

**App Function:**
MemQ is an intelligent learning assistant app that helps users learn more effectively through AI technology and scientific memory methods. Key features include: creating learning courses, AI-powered question generation and explanations, PDF document import, flashcard learning, progress tracking, and study reminders.

**Encryption:**
The app only uses standard HTTPS/TLS encryption for network communications and qualifies for encryption exemption.

---

## App Store Connect 填写指南

### 步骤 1：应用功能和目的
在"应用功能和目的"字段中，使用上面的"简短版本"内容。

### 步骤 2：加密使用情况
- 选择"否，应用不使用加密"或"是，但符合豁免条件"
- 根据 `app.json` 中的 `ITSAppUsesNonExemptEncryption: false`，应选择符合豁免条件

### 步骤 3：加密豁免说明
如果选择了豁免，需要说明：
- 仅使用标准 HTTPS/TLS 加密
- 使用 iOS 系统提供的标准加密功能
- 不包含自定义加密算法

---

## 注意事项

1. **准确性**：确保描述准确反映应用的实际功能
2. **简洁性**：App Store Connect 的字段有字符限制，使用简短版本
3. **合规性**：确保加密说明符合实际情况和法规要求
4. **更新**：如果应用功能发生变化，记得更新此说明

