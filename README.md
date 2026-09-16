# 卡间拾光

卡间拾光是一个独立的银行卡收藏画廊，使用原生 HTML、CSS 和 JavaScript，无需安装依赖或构建。直接打开 `index.html` 即可使用。

## 手动维护卡片

日常维护只需编辑 **`cards.js`**，并把卡面图片放进 **`assets/cards/`**。程序先加载 `cards.js`，再根据每条记录的 `image` 路径显示对应图片。

### 新增一张卡

1. 将图片放进 `assets/cards/`，例如 `my-new-card.webp`。
2. 打开 `cards.js`，在 `window.CARD_GALLERY_DATA` 数组中复制一条记录，修改唯一 `id`、卡片信息和图片路径。记录之间用逗号分隔。
3. 保存后刷新页面。展示顺序与数组顺序一致，卡片数量、银行列表及银行数量会自动更新。

一条记录的示例：

```js
{
  "id": "my-new-card",
  "name": "我的新卡片",
  "bank": "中国银行",
  "type": "credit",
  "networks": ["visa", "unionpay"],
  "keywords": "蓝色 雪山 旅行",
  "image": "./assets/cards/my-new-card.webp",
  "bankLogo": "./assets/logos/banks/boc.svg"
}
```

| 字段 | 必填 | 用途 |
| --- | --- | --- |
| `id` | 是 | 唯一标识；不同卡片不能重复。建议用英文、数字与短横线。 |
| `name` | 是 | 显示的卡片名称。 |
| `bank` | 是 | 银行名称；新增银行时直接填写新名称即可。 |
| `type` | 是 | `credit` 为信用卡，`debit` 为储蓄卡。 |
| `image` | 是 | 独立卡面图片路径，相对于 `index.html`；也支持 HTTP(S) 图片地址。 |
| `networks` | 否 | 卡组织数组，可选 `visa`、`mastercard`、`unionpay`、`amex`、`jcb`、`discover`；未指定时用 `[]`。 |
| `keywords` | 否 | 搜索关键词，支持字符串或字符串数组。 |
| `bankLogo` | 否 | 银行图标路径；省略时显示通用银行图标。 |

- **修改卡片**：修改相应记录的字段。换图时替换原图片，或将 `image` 指向新文件。
- **删除卡片**：删除相应记录；图片不再使用后可以自行删除。没有卡片时可将数组设为 `[]`。
- **调整顺序**：移动记录在数组中的位置。
- **新增银行**：填写 `bank`，可选填 `bankLogo`；无需编辑 `app.js`。同一银行共用第一条非空图标配置。
- **图片格式与比例**：可使用浏览器支持的 WebP、PNG、JPG 等图片，建议比例约为 `1.586 : 1`。页面等比填满银行卡区域，非标准比例的图片会裁切，不会拉伸。
- **路径写法**：使用正斜线，如 `./assets/cards/my-new-card.webp`。部署到仓库子目录时建议保留相对路径。
- **数据格式**：这是可写注释的 JavaScript 数据文件。保留 `window.CARD_GALLERY_DATA = [` 和结尾的 `];`，字符串使用引号。
- **排查错误**：文件缺失、必填字段错误或重复 `id` 时，页面会显示具体提示；单张卡面或银行图标加载失败时会显示占位内容，其余卡片可继续浏览。有 Node.js 时可运行 `node --check cards.js` 检查语法。

`assets/collection.webp` 是原始素材备份，页面不再读取它，也不再需要填写图集裁切坐标。

## 目录

| 文件 | 用途 |
| --- | --- |
| `cards.js` | 手动维护的卡片资料及图片、银行图标路径 |
| `assets/cards/` | 每张卡的独立卡面图片 |
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

这是一个无后端、无构建步骤的静态网站。发布时请同时上传根目录的 `index.html`、`cards.js`、`app.js`、`styles.css`、`.nojekyll` 和完整的 `assets/` 文件夹。

所有本地资源均使用相对路径，可部署在网站根目录或 GitHub 仓库子目录下。

使用 GitHub Pages 时，在仓库的 **Settings → Pages** 中选择 **Deploy from a branch**，选择目标分支（通常为 `main`）和 **/(root)**，保存后等待发布。参考 [GitHub 官方文档](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)。
