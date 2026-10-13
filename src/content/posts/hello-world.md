---
title: "你好，世界"
published: 2026-10-11
publishedAt: 2026-10-11T22:01:33+08:00
description: "这个博客的第一篇文章，顺便把 frontmatter 的字段记在这里，以后写新文章直接照抄。"
image: ""
tags: ["随笔", "建站"]
category: "随笔"
draft: false
lang: ""
---

换了配色、改了站名、把界面切成中文之后，终于可以开始写东西了。

这篇文章由 `pnpm new-post hello-world` 生成，`published` 和 `publishedAt` 是脚手架按站点时区（`Asia/Shanghai`）自动算好的，我只需要改标题和正文。**这两个日期必须落在同一天**，否则构建会直接报错。

## frontmatter 速查

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `title` | ✅ | 文章标题 |
| `published` | ✅ | 日历日期 `YYYY-MM-DD`，决定归档位置 |
| `publishedAt` | | 带时区的精确发布时间，同一天发多篇时靠它排序 |
| `updated` / `updatedAt` | | 更新时间，两个也要成对且同一天 |
| `description` | | 摘要，出现在列表和 meta 里 |
| `image` | | 封面图，文件夹式文章可写 `./cover.jpeg` |
| `tags` / `category` | | 标签和分类，分类会出现在归档页筛选里 |
| `series` / `seriesOrder` | | 归属某个系列及其顺序 |
| `pinned` | | 置顶 |
| `draft` | | 草稿。**注意：只在生产构建里过滤，`pnpm dev` 下照样显示** |
| `comment` | | 单篇评论开关，默认继承全局 |
| `lang` | | 覆盖渲染语言，中文站一般留空 |

:::tip 放图片推荐用文件夹式文章
把正文放成 `src/content/posts/<slug>/index.md`，图片放在同一个目录里，frontmatter 写 `image: "./cover.jpeg"`、正文里写 `![](./photo.webp)`。这样图片会走构建期的 AVIF/WebP 响应式优化，比丢进 `public/` 更好。
:::

## 下一步

把这篇替换成真正想写的内容就行。想学主题自带的各种 Markdown 扩展语法（代码树、马克笔高亮、步骤条、图片画廊、加密等），可以翻一下 `src/content/posts/` 里那几篇示例文章——它们本身就是语法文档。
