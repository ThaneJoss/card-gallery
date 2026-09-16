# 卡间拾光

卡间拾光是一个独立的银行卡收藏画廊，使用原生 HTML、CSS 和 JavaScript。卡片信息及远程图片 URL 在 `cards.js` 中维护；部署时通过 pnpm 构建，下载卡面并转换成 WebP，生成可以独立发布的 `public/`。

日常不需要把卡面图片下载到本地，也不需要把生成图片提交到 Git。直接打开根目录的 `index.html` 仍可预览，预览时读取原始图片 URL；发布时使用构建后的 `public/`。

## 手动维护卡片

日常维护只需编辑 **`cards.js`**，把每张卡的 `image` 填成可直接访问的远程图片 URL。

### 新增一张卡

1. 准备图片直链，例如自己图床上的 `https://images.example.com/my-new-card.jpg`。
2. 打开 `cards.js`，在 `window.CARD_GALLERY_DATA` 数组中复制一条记录，修改唯一 `id`、卡片信息和 `image`。记录之间用逗号分隔。
3. 保存后可刷新根目录页面预览；重新部署后，线上使用转换后的站内卡面。展示顺序与数组顺序一致，卡片数量、银行列表及银行数量会自动更新。

一条记录的示例：

```js
{
  "id": "my-new-card",
  "name": "我的新卡片",
  "bank": "中国银行",
  "type": "credit",
  "networks": ["visa", "unionpay"],
  "keywords": "蓝色 雪山 旅行",
  "image": "https://images.example.com/my-new-card.jpg",
  "bankLogo": "./assets/logos/banks/boc.svg"
}
```

| 字段 | 必填 | 用途 |
| --- | --- | --- |
| `id` | 是 | 唯一标识；不同卡片不能重复。建议用英文、数字与短横线。 |
| `name` | 是 | 显示的卡片名称。 |
| `bank` | 是 | 银行名称；新增银行时直接填写新名称即可。 |
| `type` | 是 | `credit` 为信用卡，`debit` 为储蓄卡。 |
| `image` | 是 | 远程 HTTP(S) 图片直链；构建时自动下载、转成 WebP。现有本地示例也兼容相对于项目根目录的图片路径。 |
| `networks` | 否 | 卡组织数组，可选 `visa`、`mastercard`、`unionpay`、`amex`、`jcb`、`discover`；未指定时用 `[]`。 |
| `keywords` | 否 | 搜索关键词，支持字符串或字符串数组。 |
| `bankLogo` | 否 | 银行图标路径；省略时显示通用银行图标。 |

- **修改卡片**：修改相应记录的字段。换图时将 `image` 指向新 URL；同一 URL 的图片内容改变后，也需要重新构建部署。
- **删除卡片**：删除相应记录；下一次构建会自动清理不再使用的生成图片。没有卡片时可将数组设为 `[]`。
- **调整顺序**：移动记录在数组中的位置。
- **新增银行**：填写 `bank`，可选填 `bankLogo`；无需编辑 `app.js`。同一银行共用第一条非空图标配置。
- **图片格式与比例**：可使用浏览器支持的 WebP、PNG、JPG 等图片，建议比例约为 `1.586 : 1`。页面等比填满银行卡区域，非标准比例的图片会裁切，不会拉伸。
- **图片直链**：填写图片本身的地址，不是图片所在的网页或网盘分享页。地址需允许部署机器无需登录即可下载，避免短期过期的链接。
- **本地示例**：仓库原有的九张示例卡仍引用 `assets/cards/`。替换为自己的远程 URL 后，可以删除不再使用的示例图片。后续新增卡面无需放入仓库。
- **数据格式**：这是可写注释的 JavaScript 数据文件。保留 `window.CARD_GALLERY_DATA = [` 和结尾的 `];`，字符串使用引号。
- **排查错误**：文件缺失、必填字段错误或重复 `id` 时，页面会显示具体提示；单张卡面或银行图标加载失败时会显示占位内容，其余卡片可继续浏览。有 Node.js 时可运行 `node --check cards.js` 检查语法。

`assets/collection.webp` 是原始素材备份，页面不再读取它，构建也不会把它复制到 `public/`。

## 构建

需要 Node.js 22 或更新版本，以及 pnpm 11.25.0（版本已写入 `package.json` 的 `packageManager`）。安装依赖后运行构建：

```sh
pnpm install --frozen-lockfile
pnpm build
```

仓库统一使用 `pnpm-lock.yaml` 锁定依赖。新增依赖使用 `pnpm add`，远程构建使用 `pnpm install --frozen-lockfile`。

构建流程：

```text
cards.js 中的远程 URL
  → 下载图片到构建进程内存
  → 自动校正方向、等比缩小到最大宽度 1600px、转换为 WebP
  → 保存为 public/cards/1.webp 等文件
  → 生成 public/cards.js，将 image 改为 ./cards/1.webp 等站内路径
  → 发布整个 public/
```

- WebP 质量为 85；保留透明度，不放大小图、不裁切原图。参数位于 `scripts/build.mjs`。
- 每批处理最多四张图片；每次构建重新获取图片。不会将原图保存到源码目录，也不会修改根目录 `cards.js`。
- `public/` 和 `node_modules/` 已在 `.gitignore` 中，不提交到仓库。`public/` 仍会占用部署平台的存储空间。
- 下载失败或内容不是有效图片时，构建报出对应卡片的 `id` 并以失败状态退出；未完成的 `public/` 会被清理。
- 已发布的网站使用自身的图片文件，浏览时不依赖原图站点；下一次构建仍需要原图 URL 可用。
- `pnpm test` 可验证远程下载、图片转换、失败处理和删除卡片后的输出清理。

## 目录

| 文件 | 用途 |
| --- | --- |
| `cards.js` | 手动维护的卡片资料、远程图片 URL 及银行图标路径 |
| `scripts/build.mjs` | 下载、转换图片并生成发布目录 |
| `package.json`、`pnpm-lock.yaml` | 构建命令、pnpm 版本及依赖版本 |
| `public/` | 构建生成的完整静态网站，已忽略，不提交 Git |
| `assets/cards/` | 原有示例卡面，新卡片无需在此保存图片 |
| `app.js` | 数据校验、加载、搜索、筛选与放大查看 |
| `index.html` | 网站名称、页面文案、首页链接与页面结构 |
| `styles.css` | 颜色、字体、间距、银行卡比例与响应式布局 |
| `assets/card-mark.svg` | 卡间拾光独立品牌标识及 favicon |
| `assets/logos/` | 银行及卡组织 SVG 图标 |
| `assets/logos/sources.json` | 银行及卡组织图标来源 |
| `assets/collection.webp` | 旧图集备份，不参与页面加载 |
| `.nojekyll` | 让 GitHub Pages 直接发布静态文件 |

## 视觉与品牌

- 使用独立的“卡间拾光”名称与“叠卡拾光”矢量标识；点击品牌返回本站 `./index.html`。
- 设计参考 `ThaneJoss/webapps` 的 `ab42415` 版本，沿用 72px 白色吸顶页头、1152px 内容宽度与系统字体栈。
- 统一浅灰底色 `#f6f7f9`、蓝色强调色 `#2563eb`、文字色 `#182230` 和边框色 `#e2e6ec`。
- 控件使用 8px 圆角，卡片使用 16px 圆角；颜色、比例与动效变量集中在 `styles.css` 的 `:root` 中。

## 浏览功能

- 搜索银行、卡名、关键词、卡片类型及卡组织中英文名称，支持组合筛选与重置。
- 按 `/` 聚焦搜索；结果未变化时保留卡片节点，不重复播放入场动效。
- 下拉菜单显示品牌图标，支持方向键、Home、End、Enter、Esc、Tab 与点击外部关闭。
- 点击卡片查看大图；关闭按钮、Esc 或点击遮罩均可关闭，并将焦点交还给原卡片。
- 列表与大图使用约 `1.586 : 1` 的比例，大图根据窗口与标题高度自动适配。
- 适配手机、平板、桌面及减少动态效果偏好；非首行图片延迟加载。

## 发布

网站运行时不需要后端。部署平台需要执行构建，并发布 **`public/`**：

| 设置 | 值 |
| --- | --- |
| 框架 | 无 / Other / 静态网站 |
| Node.js | 22 或更新版本 |
| 包管理器 | pnpm 11.25.0 |
| 安装命令 | `pnpm install --frozen-lockfile` |
| 构建命令 | `pnpm build` |
| 发布目录 | `public` |

这样每次远程部署都会生成站内卡面文件，本地只需维护源码和 URL。手动部署时也可先构建，再上传整个 `public/`。生成的资源使用相对路径，可部署在网站根目录或仓库子目录下。

Vercel 项目可按上表配置构建命令和发布目录。若使用 GitHub Pages，需要通过 GitHub Actions 执行构建并上传 `public/`，直接从源码分支发布不会执行图片转换。参考 [GitHub 自定义构建文档](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)。
