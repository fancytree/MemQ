-- 已停用（no-op）。原内容会 DELETE 掉 6 门 LLM 种子课，现已按产品要求保留这些课程。
--
-- 背景：此迁移原本用于"清理此前误自动注入到用户 lessons 的 Explore 模板课"，
-- 会删除与模板（标题 + 描述 + 词条集合）精确匹配的 lesson，级联删除其 terms。
-- 实际执行后造成部分账号的种子课被清空，因此改为空操作。
--
-- 注意：本迁移在生产项目 sbwkwfqjpbwmacmrprwn 上已记录为已应用（version 20260430201200），
-- 不会再次执行；改成 no-op 是为了防止新建 / 重置环境时重跑并再次删除数据。
-- 原始 SQL 见 git 历史。
--
-- 需保留的 6 门种子课：
--   LLM Core Concepts / Prompt Engineering Patterns / RAG in Practice
--   LLM Evaluation Basics / Function Calling and Tools / AI Product Safety

SELECT 1;
