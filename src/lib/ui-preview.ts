import type { PostListQuery } from "@/lib/validators/post";

type PreviewTaxonomy = {
  name: string;
  slug: string;
};

type PreviewPost = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  publishedAt: Date;
  createdAt: Date;
  category: PreviewTaxonomy | null;
  tags: Array<{ tag: PreviewTaxonomy }>;
};

const categories = [
  { name: "开发手记", slug: "development" },
  { name: "生活切片", slug: "daily-life" },
  { name: "阅读笔记", slug: "reading" },
  { name: "旅途观察", slug: "journey" },
] satisfies PreviewTaxonomy[];

const tags = [
  { name: "Next.js", slug: "next-js" },
  { name: "界面设计", slug: "ui-design" },
  { name: "部署", slug: "deployment" },
  { name: "随想", slug: "reflection" },
  { name: "摄影", slug: "photography" },
  { name: "阅读", slug: "reading" },
] satisfies PreviewTaxonomy[];

function taxonomy(categoryIndex: number, tagIndexes: number[]) {
  return {
    category: categories[categoryIndex] ?? null,
    tags: tagIndexes.map((index) => ({ tag: tags[index] })),
  };
}

const previewPosts: PreviewPost[] = [
  {
    id: "preview-01",
    slug: "building-a-quiet-personal-archive",
    title: "把个人博客重新做成一座安静、可持续维护的档案室",
    excerpt: "从内容结构、视觉语言到部署流程，记录这次博客重构中真正影响长期使用体验的取舍。",
    publishedAt: new Date("2026-07-17T02:30:00.000Z"),
    createdAt: new Date("2026-07-16T11:00:00.000Z"),
    ...taxonomy(0, [0, 1, 2]),
  },
  {
    id: "preview-02",
    slug: "rain-after-the-last-train",
    title: "末班车以后，雨还在慢慢落下来",
    excerpt: "一次没有目的地的夜间散步，几张没有拍好的照片，以及城市在雨里忽然变得安静的时刻。",
    publishedAt: new Date("2026-07-15T14:10:00.000Z"),
    createdAt: new Date("2026-07-15T10:00:00.000Z"),
    ...taxonomy(1, [3, 4]),
  },
  {
    id: "preview-03",
    slug: "nextjs-app-router-notes",
    title: "Next.js App Router 项目中容易被忽略的几个边界",
    excerpt: "关于服务端组件、动态路由、缓存和环境变量的实践笔记，也记录一些只在生产构建中出现的问题。",
    publishedAt: new Date("2026-07-13T04:20:00.000Z"),
    createdAt: new Date("2026-07-12T08:00:00.000Z"),
    ...taxonomy(0, [0, 2]),
  },
  {
    id: "preview-04",
    slug: "reading-without-finishing",
    title: "允许一本书暂时没有读完",
    excerpt: "阅读不一定要以完成为目标。有些书更像一段同行关系，停下来并不意味着失败。",
    publishedAt: new Date("2026-07-10T08:00:00.000Z"),
    createdAt: new Date("2026-07-09T08:00:00.000Z"),
    ...taxonomy(2, [3, 5]),
  },
  {
    id: "preview-05",
    slug: "media-pipeline-review",
    title: "为个人内容系统补齐一条安全的图片处理链路",
    excerpt: "上传校验、存储适配、引用计数、回收站与永久删除，一条媒体链路需要共同解决的问题比想象中更多。",
    publishedAt: new Date("2026-07-08T12:00:00.000Z"),
    createdAt: new Date("2026-07-07T12:00:00.000Z"),
    ...taxonomy(0, [0, 2]),
  },
  {
    id: "preview-06",
    slug: "summer-window",
    title: "七月窗边的光",
    excerpt: "午后的风穿过窗帘，桌面上留下缓慢移动的影子。日常值得被记录，往往只是因为它不会重来。",
    publishedAt: new Date("2026-07-05T06:40:00.000Z"),
    createdAt: new Date("2026-07-05T06:00:00.000Z"),
    ...taxonomy(1, [3, 4]),
  },
  {
    id: "preview-07",
    slug: "designing-for-long-reading",
    title: "为长时间阅读设计：不是把字号放大就足够",
    excerpt: "版心、行长、段落节奏、代码块和图片都在决定阅读是否轻松，视觉风格必须服从内容。",
    publishedAt: new Date("2026-07-02T09:30:00.000Z"),
    createdAt: new Date("2026-07-01T09:00:00.000Z"),
    ...taxonomy(0, [1]),
  },
  {
    id: "preview-08",
    slug: "a-small-station-in-the-mountains",
    title: "山里那座只停两分钟的小站",
    excerpt: "列车短暂停靠，雾从铁轨尽头漫过来。很多地方只见过一次，却比熟悉的街道更容易留在记忆里。",
    publishedAt: new Date("2026-06-28T03:00:00.000Z"),
    createdAt: new Date("2026-06-27T03:00:00.000Z"),
    ...taxonomy(3, [3, 4]),
  },
  {
    id: "preview-09",
    slug: "deployment-checklist",
    title: "一份真正可以在凌晨使用的部署检查清单",
    excerpt: "把备份、迁移、容器、反向代理和回滚写成能够照着执行的步骤，让发布不再依赖当时的记忆。",
    publishedAt: new Date("2026-06-24T12:20:00.000Z"),
    createdAt: new Date("2026-06-24T10:00:00.000Z"),
    ...taxonomy(0, [2]),
  },
  {
    id: "preview-10",
    slug: "notes-on-slow-progress",
    title: "缓慢前进也是前进",
    excerpt: "有些事情无法用冲刺完成。接受每天只向前一点，反而更接近真正可持续的节奏。",
    publishedAt: new Date("2026-06-20T07:15:00.000Z"),
    createdAt: new Date("2026-06-19T07:00:00.000Z"),
    ...taxonomy(1, [3]),
  },
  {
    id: "preview-11",
    slug: "the-shape-of-tools",
    title: "工具最终会留下使用者的形状",
    excerpt: "读完一本关于工具与人的小书后，重新想了想软件、习惯，以及我们怎样被自己的工作方式慢慢塑造。",
    publishedAt: new Date("2026-06-16T10:00:00.000Z"),
    createdAt: new Date("2026-06-15T10:00:00.000Z"),
    ...taxonomy(2, [3, 5]),
  },
  {
    id: "preview-12",
    slug: "before-sunrise",
    title: "日出之前的城市边缘",
    excerpt: "天还没有完全亮，第一班公交已经经过。城市的边缘没有地标，却有一种难以替代的真实感。",
    publishedAt: new Date("2026-06-12T21:30:00.000Z"),
    createdAt: new Date("2026-06-12T20:00:00.000Z"),
    ...taxonomy(3, [3, 4]),
  },
];

const previewContent = `
每隔一段时间，我都会重新审视这个博客。问题通常不是“还缺少什么功能”，而是：**它是否仍然愿意让我回来写东西？**

这一次，我决定从视觉、内容和维护方式三个方向重新整理它。目标不是制造一个看起来复杂的网站，而是留下一套能够长期使用的安静系统。

> 好的个人工具不应该时刻提醒你它的存在。它只需要在你想记录时，可靠地站在那里。

## 从内容开始，而不是从组件开始

界面设计最容易犯的错误，是先画满卡片，再寻找能够塞进去的内容。个人博客的核心始终是文章，因此我先列出了几种真实的阅读情境：

- 在手机上快速翻找某一篇旧记录；
- 在桌面端连续阅读一篇较长的技术文章；
- 通过分类和标签回看某一阶段持续关注的话题；
- 在图片、代码和普通段落之间保持稳定节奏。

这些情境直接决定了列表密度、正文宽度和导航方式。装饰只能建立气氛，不能打断阅读路径。

![晨光下穿过旷野的移动城市](/images/journal/dawn-archive.png)

## 一套克制的视觉语言

新界面使用炭黑、暖白和信号黄作为主色。深色首页负责建立“进入档案”的感觉，文章页则回到明亮纸张，让长时间阅读更轻松。

| 区域 | 主要任务 | 视觉策略 |
| --- | --- | --- |
| 首页 | 建立气氛和入口 | 深色场景、少量高对比强调 |
| 日志索引 | 查找和比较文章 | 清晰层级、稳定密度 |
| 文章详情 | 长时间阅读 | 明亮纸面、窄版心、完整 Markdown 样式 |

### 代码也属于文章排版

技术文章中的代码块不是附属内容。它需要明确的边界、足够的对比度和移动端横向滚动能力。

\`\`\`ts
export function keepAFieldNote(title: string, body: string) {
  return {
    title: title.trim(),
    body,
    archivedAt: new Date(),
  };
}
\`\`\`

行内代码，例如 \`npm run build\`，也应该与正文区分，但不能比正文更抢眼。

## 为维护留下余地

设计完成并不意味着工作结束。真正重要的是下一次新增分类、上传大图或写下超长标题时，页面仍然能够保持秩序。

1. 使用真实长度的标题和摘要验证边界；
2. 同时检查无标签、多标签和未分类状态；
3. 在桌面端与移动端分别验证分页和筛选；
4. 让生产构建成为每次交付前的固定步骤。

---

最终留下的不是一张静态效果图，而是一套可以继续生长的界面。它允许内容慢慢增加，也允许未来的我改变主意。
`;

export function isUiPreviewEnabled() {
  return process.env.UI_PREVIEW_MODE === "true" && !process.env.DATABASE_URL;
}

export function getUiPreviewPostList(query: PostListQuery, pageSize: number) {
  const keyword = query.q.toLocaleLowerCase("zh-CN");
  const filtered = previewPosts.filter((post) => {
    const matchesKeyword = !keyword || `${post.title} ${post.excerpt}`.toLocaleLowerCase("zh-CN").includes(keyword);
    const matchesCategory = !query.category || post.category?.slug === query.category;
    const matchesTag = !query.tag || post.tags.some(({ tag }) => tag.slug === query.tag);
    return matchesKeyword && matchesCategory && matchesTag;
  });

  return {
    total: filtered.length,
    posts: filtered.slice((query.page - 1) * pageSize, query.page * pageSize),
    categories,
    tags,
  };
}

export function getUiPreviewPost(slug: string) {
  const summary = previewPosts.find((post) => post.slug === slug);
  if (!summary) return null;

  return {
    ...summary,
    contentMd: previewContent,
    status: "PUBLISHED" as const,
    updatedAt: new Date("2026-07-17T03:20:00.000Z"),
    author: { id: "preview-author" },
  };
}
