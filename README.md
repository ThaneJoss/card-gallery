# 卡间拾光

卡间拾光是一个独立的银行卡收藏画廊，使用原生 HTML、CSS 和 JavaScript。卡片信息在 **`cards.yaml`** 中维护，卡面原图保存在 **`assets/cards/`**。提交 PR 时可直接填写图片网址，bot 会下载图片、改为本地相对路径、清理未引用卡面，并向 PR 追加一个提交。部署时通过 pnpm 构建，将卡面转换成 WebP，生成可以独立发布的 `public/`。

日常只需编辑中文字段，不需要写 JavaScript，也不需要手动下载卡面；等待 bot 提交后合并 PR 即可。预览和发布都使用构建后的 `public/`。

## 手动维护卡片

日常维护只需编辑 **`cards.yaml`**，把每张卡的「图片」填成可直接访问的图片 URL，或已经提交到仓库的本地相对路径。

### 新增一张卡

1. 准备图片直链，例如自己图床上的 `https://images.example.com/my-new-card.jpg`。
2. 打开 `cards.yaml`，复制下面的四行，改成自己的信息。每张卡以 `- 名称:` 开头，其他字段前面保留两个空格。
3. 保存后运行 `pnpm check:cards` 检查资料并提交 PR；bot 会把远程卡面存入仓库，再更新「图片」字段。确认 bot 的提交后合并 PR，重新部署后线上会更新。本地预览可先运行 `pnpm localize:cards`，再运行 `pnpm build`，打开 `public/index.html`。

最少只需四个字段：

```yaml
- 名称: 我的新卡片
  银行: 中国银行
  类型: 信用卡
  图片: https://images.example.com/my-new-card.jpg
```

需要填写卡组织时，在后面补充：

```yaml
- 名称: 我的新卡片
  银行: 中国银行
  类型: 信用卡
  图片: https://images.example.com/my-new-card.jpg
  卡组织:
    - Visa
    - 银联
```

卡组织只有一个时，也可以直接写 `卡组织: 银联`。普通文本和图片 URL 通常不需要引号；没有大括号、结尾逗号或分号。

| 字段 | 必填 | 用途 |
| --- | --- | --- |
| 名称 | 是 | 显示的卡片名称。 |
| 银行 | 是 | 银行名称；新增银行时直接填写新名称即可。 |
| 类型 | 是 | 填写「信用卡」或「储蓄卡」。 |
| 图片 | 是 | 仓库内相对路径，或交给 PR bot 下载的图片直链；支持 HTTP(S)、`//域名/路径` 和省略协议的 `域名/路径`。 |
| 卡组织 | 否 | 可填 Visa、Mastercard（万事达）、银联（UnionPay）、Amex（美国运通）、JCB、Discover；一个写文本，多个写列表。 |
| 编号 | 否 | 省略时自动生成。手动填写时不能重复；复制已有记录时请修改或删除编号。 |

- **修改卡片**：直接修改相应字段。换图时重新填入「图片」的 URL 并提交 PR，bot 会保存新文件；已有同名文件不会被覆盖。
- **删除卡片**：删除从 `- 名称:` 到下一张卡之前的整段；PR bot 会删除不再被任何卡片引用的原图，下一次构建会清理发布目录的旧图片。没有卡片时可以清空文件。
- **调整顺序**：上下移动整段卡片资料，网页按文件中的顺序展示。
- **银行图标**：只需填写「银行」。图标根据银行名称自动匹配，无需逐张配置；暂未收录图标的银行显示通用银行图标。银行名称与图标的对应关系统一维护在 `assets/logos/sources.json` 中。
- **图片格式与比例**：可使用浏览器支持的 WebP、PNG、JPG 等图片，建议比例约为 `1.586 : 1`。页面等比填满银行卡区域，非标准比例的图片会裁切，不会拉伸。
- **图片直链**：填写图片本身的地址，不是图片所在的网页或网盘分享页。地址需允许 GitHub Actions 无需登录即可下载；bot 保存成功后，部署不再依赖该来源网址。
- **本地卡面**：使用 `./assets/cards/文件名.jpg` 等相对路径。bot 和 `pnpm localize:cards` 都会清理 `assets/cards/` 中未被资料引用的图片，包含子目录；仍有卡片引用的共享图片会保留。
- **格式提示**：可以用 `#` 写注释，卡片之间可留空行。缩进使用空格，不使用 Tab。文本含有 `: ` 或 ` #`，以及纯数字编号等容易被当成其他类型的值时，请用引号包住，如 `名称: "旅行卡: 蓝色"`。
- **检查资料**：运行 `pnpm check:cards`，无需下载图片即可检查格式和字段；语法错误会给出出错行列，字段错误会指出第几张卡片及中文字段名。
- **自动生成文件**：只修改 `cards.yaml`。`public/cards.js` 由构建自动生成，不手动维护；根目录的 `index.html` 是构建模板，预览请打开 `public/index.html`。

`assets/collection.webp` 是原始素材备份，页面不再读取它，构建也不会把它复制到 `public/`。

## PR 卡面 bot

工作流位于 `.github/workflows/localize-card-images.yml`。工作流及其脚本先合入默认分支后，对涉及 `cards.yaml` 或 `assets/cards/` 的 PR，在创建、追加提交、重新打开时自动运行。

1. 读取 PR 最新版本的 `cards.yaml`，检查每张卡的「图片」。`https://`、`http://`、`//` 开头的网址会下载；`images.example.com/card.jpg` 这样的地址会补上 `https://`。`./assets/cards/card.jpg`、`assets/cards/card.jpg`、`card.jpg` 等本地路径保持不变。
2. 下载并校验图片，保留原始图片字节，按实际格式命名为 `assets/cards/编号.扩展名`。未填编号时使用 `card-1` 等名称；同名时添加数字后缀，相同网址在一次处理内复用同一个文件。
3. 将「图片」改为 `./assets/cards/...`，保留 YAML 中的注释及其他字段，再按更新后的资料清理 `assets/cards/` 中未引用的图片。支持 PNG、JPEG、WebP、GIF、AVIF、SVG 等图片扩展名；非图片文件、目录、符号链接和该目录之外的资源保留。
4. 把图片新增、删除和 YAML 修改一起提交到 PR 来源分支，提交信息为「自动本地化卡面并清理未引用图片」。

即使全部是本地路径，只要存在未引用图片，也会追加清理提交；路径和图片都无需整理时不产生新提交。空卡片列表会清理全部未引用卡面。任一下载、资料或图片校验失败时，不删除图片，工作流报错且不追加提交。下载期间若 PR 出现新提交，不会覆盖新改动；新提交会触发下一次处理。

当前自动回写支持**本仓库分支的 PR**，使用内置 `GITHUB_TOKEN`，无需配置额外 secret。Fork PR 会在 Actions 中提示无法回写，贡献者可在来源分支运行 `pnpm localize:cards`，提交 `cards.yaml` 与 `assets/cards/` 的新增、删除后更新 PR。

工作流使用 `pull_request_target`，只执行默认分支中的脚本和锁定依赖，通过 API 读取 PR 资料并提交生成的文件，不执行 PR 中的代码。详见 [GitHub 的 pull_request_target 安全说明](https://docs.github.com/en/actions/reference/security/securely-using-pull_request_target)。

## 构建

需要 Node.js 22 或更新版本，以及 pnpm 11.25.0（版本已写入 `package.json` 的 `packageManager`）。安装依赖后运行构建：

```sh
pnpm install --frozen-lockfile
pnpm check:cards
pnpm build
```

仓库统一使用 `pnpm-lock.yaml` 锁定依赖。新增依赖使用 `pnpm add`，远程构建使用 `pnpm install --frozen-lockfile`。

构建流程：

```text
cards.yaml 中的中文卡片资料和本地图片路径
  → 校验字段并生成网页需要的卡片数据
  → 读取 assets/cards/ 中的卡面（未本地化的 HTTP(S) URL 仍可直接下载）
  → 自动校正方向、等比缩小到最大宽度 1600px、转换为 WebP
  → 保存为 public/cards/1.webp 等文件
  → 生成 public/cards.js，将 image 改为 ./cards/1.webp 等站内路径
  → 发布整个 public/
```

- WebP 质量为 85；保留透明度，不放大小图、不裁切原图。参数位于 `scripts/build.mjs`。
- 每批处理最多四张图片；构建只读取卡面，不会修改 `cards.yaml`。原图保存和路径改写由 PR bot 或 `pnpm localize:cards` 完成。
- `public/` 和 `node_modules/` 已在 `.gitignore` 中，不提交到仓库。`public/` 仍会占用部署平台的存储空间。
- 下载失败或内容不是有效图片时，构建报出对应卡片的 `id` 并以失败状态退出；未完成的 `public/` 会被清理。
- 已发布的网站使用自身的图片文件，浏览时不依赖原图站点；经 bot 本地化后的卡面在下一次构建时也无需访问原图站点。
- `pnpm test` 可验证中文资料解析、远程卡面本地化、未引用图片清理、PR 提交、图片转换和失败处理。

## 目录

| 文件 | 用途 |
| --- | --- |
| `cards.yaml` | 手动维护的中文卡片资料及图片路径，也可填写待 bot 下载的网址 |
| `scripts/card-data.mjs` | 解析并校验卡片资料，生成网页需要的数据 |
| `scripts/localize-card-images.mjs` | 下载远程卡面、生成本地相对路径并清理未引用图片；也提供本地命令 |
| `scripts/localize-pr-cards.mjs` | 读取 PR 资料并把图片新增、删除与 YAML 一起提交到来源分支 |
| `.github/workflows/localize-card-images.yml` | PR 卡面 bot 的触发事件、依赖安装和写入权限 |
| `scripts/build.mjs` | 下载、转换图片并生成发布目录 |
| `package.json`、`pnpm-lock.yaml` | 构建命令、pnpm 版本及依赖版本 |
| `public/` | 构建生成的完整静态网站，已忽略，不提交 Git |
| `assets/cards/` | 随 Git 提交的卡面原图，PR bot 自动保存远程卡面并清理未引用图片 |
| `app.js` | 数据校验、加载、搜索、筛选与放大查看 |
| `index.html` | 网站名称、页面文案、首页链接与页面结构 |
| `styles.css` | 颜色、字体、间距、银行卡比例与响应式布局 |
| `assets/card-mark.svg` | 卡间拾光独立品牌标识及 favicon |
| `assets/logos/` | 银行及卡组织 SVG 图标 |
| `assets/logos/sources.json` | 银行名称与图标对应关系，以及银行和卡组织图标来源 |
| `assets/collection.webp` | 旧图集备份，不参与页面加载 |
| `.nojekyll` | 让 GitHub Pages 直接发布静态文件 |

## 视觉与品牌

- 使用独立的“卡间拾光”名称与“叠卡拾光”矢量标识；点击品牌返回本站 `./index.html`。
- 设计参考 `ThaneJoss/webapps` 的 `ab42415` 版本，沿用 72px 白色吸顶页头、1152px 内容宽度与系统字体栈。
- 统一浅灰底色 `#f6f7f9`、蓝色强调色 `#2563eb`、文字色 `#182230` 和边框色 `#e2e6ec`。
- 控件使用 8px 圆角，卡片使用 16px 圆角；颜色、比例与动效变量集中在 `styles.css` 的 `:root` 中。

## 浏览功能

- 搜索银行、卡名、卡片类型及卡组织中英文名称，支持组合筛选与重置。
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

这样每次远程部署都会从仓库卡面生成站内图片文件。手动部署时也可先构建，再上传整个 `public/`。生成的资源使用相对路径，可部署在网站根目录或仓库子目录下。

Vercel 项目可按上表配置构建命令和发布目录。若使用 GitHub Pages，需要通过 GitHub Actions 执行构建并上传 `public/`，直接从源码分支发布不会执行图片转换。参考 [GitHub 自定义构建文档](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)。
