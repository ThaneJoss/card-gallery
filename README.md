# 卡间拾光

根据参考图制作的银行卡收藏画廊，使用原生 HTML、CSS 和 JavaScript，无需安装依赖或构建。

## 已完成的功能

- 卡片列表和放大视图统一使用约 1.586 : 1 的银行卡长宽比。
- 卡面等比缩放并裁切，不拉伸银行标识和画面。
- 搜索银行、卡名和画面关键词；按卡片类型、银行、卡组织组合筛选。筛选栏保持单行，窄屏可横向滑动。
- 自定义下拉菜单显示品牌图标和选中标记，支持方向键、Enter、Esc 及点击外部关闭。
- 卡名旁仅显示银行 logo；品牌图标使用独立 SVG 文件，来源见 `ASSET_SOURCES.md`。
- 点击卡片查看大图，使用关闭按钮、Esc 键或点击遮罩关闭。
- 大图不包含上一张、下一张、页码和方向键切换功能。
- 大图根据当前窗口宽高和标题高度自动缩放，保留银行卡比例，弹窗内不出现滚动条。
- 适配手机、平板和桌面屏幕，保留键盘操作和减少动态效果支持。

## 目录与本地打开

工作项目的网页文件位于 `dist/`。交付的 `card-gallery-github.zip` 已将网页文件放在压缩包根目录，解压后直接打开 `index.html` 即可浏览。

| 文件 | 用途 |
| --- | --- |
| `index.html` | 页面结构 |
| `styles.css` | 页面样式、银行卡比例和响应式布局 |
| `app.js` | 卡片数据、搜索、筛选与放大查看 |
| `assets/collection.png` | 参考图片素材图集 |
| `assets/logos/` | 银行及卡组织 SVG 图标 |
| `ASSET_SOURCES.md` | 官方图标来源和提取说明 |
| `.nojekyll` | 让 GitHub Pages 直接发布静态文件 |
| `README.md` | 本说明 |

所有网页资源均使用相对路径，可部署在网站根目录或 GitHub 仓库子目录下。

## 上传到 GitHub

1. 解压 `card-gallery-github.zip`。
2. 在 GitHub 创建一个仓库，或打开准备存放此网站的仓库。
3. 使用 **Add file → Upload files**，上传解压后的文件及完整的 `assets` 文件夹，然后提交。不要只上传 ZIP 文件。
4. 确保仓库根目录下直接存在 `index.html`、`styles.css`、`app.js` 和 `assets` 文件夹。

如果只需要保存源码，完成以上步骤即可。

## 使用 GitHub Pages 发布

1. 打开仓库的 **Settings → Pages**。
2. 在 **Build and deployment → Source** 选择 **Deploy from a branch**。
3. 选择刚才提交文件的分支（通常为 `main`）和 **/(root)**，点击 **Save**。
4. 等待 GitHub 完成发布，然后使用 Pages 页面给出的地址访问。

上述发布设置参考 [GitHub 官方文档](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)。

## 修改内容

- **卡片信息**：编辑 `app.js` 顶部的 `cards` 数组。
- **颜色与比例**：编辑 `styles.css` 中的 `:root` 变量；`--card-ratio` 同时控制列表与大图。
- **卡面图片**：当前卡面来自参考图，`art` 使用 `[x, y, 宽, 高]` 坐标截取图集；替换图集时同步更新这些坐标。
- **品牌图标**：独立 SVG 位于 `assets/logos/`；银行与文件名的对应关系在 `app.js` 的 `bankLogos` 中。

这是一个无需后端的静态网站。搜索与筛选在浏览器中运行。
