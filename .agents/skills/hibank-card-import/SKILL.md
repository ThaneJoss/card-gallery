---
name: hibank-card-import
description: 为本项目从 Hibank 卡面图鉴查找银行卡、下载卡面到 assets/cards/，并更新 cards.yaml。新增卡片或替换卡面时使用，直接复用查询接口与图片直链。
---

# Hibank 卡面导入

在包含 `cards.yaml` 的项目根目录执行。卡面一次下载到 `assets/cards/`，YAML 引用本地路径，后续构建直接读取本地文件。

## 查卡

图鉴入口：<https://hi.zzz.moe/face>。

直接使用已有查询接口，无需读取或分析前端 JavaScript：

```bash
curl --fail --silent --show-error --get 'https://hi.my-api.cn/api/' \
  --data-urlencode 'resource=face' \
  --data-urlencode 'search=马到成功'
```

把 `search` 换成用户给出的卡名或银行。结果位于 `data.list`：

- `description`：卡名；`issuer.native_name`：银行。
- `card.type`：`Debit` 对应「储蓄卡」，`Credit` 对应「信用卡」。
- `card.brand`：`UnionPay` 对应「银联」，其他按项目支持的卡组织填写。
- `image`：可直接下载的图片 URL，不需要从图鉴页面提取。

按用户指定的银行、卡名、版本、卡组织和类型选中条目；明确匹配后直接下载。只有仍无法区分多个版本时才向用户询问。

Hibank 是第三方图库，`issuer.url` 只是银行官网，不代表图片官方出处。`source: Other` 或空的 `url` 不足以证明官方来源；如用户要求官方或高清，说明现有条目的来源限制，不把图库图片称为官方高清图。

## 下载与登记

优先复用本地已有的同一张原图；没有时对返回的 `image` 发起一次 GET，保存为 `assets/cards/<稳定编号>.<图片后缀>`。保留原始图片，不放大、不重绘。不要用 API 的 `ext` 字段覆盖直链后缀：已知它可能与实际图片不一致。

以下是已成功使用的工行「马年生肖卡马到成功版」直链，现已保存在本地，不必重复下载：

```bash
curl --fail --location --silent --show-error \
  'https://storage.my-api.cn/static/images/new_upload/155.jpg' \
  --output 'assets/cards/icbc-horse-success.jpg'
```

在 `cards.yaml` 中新增或更新对应条目，保留用户的其他编辑。使用稳定且不重复的编号，来源及原图直链放在注释中，`图片` 字段只填写本地路径：

```yaml
- 名称: 马年生肖卡马到成功版
  银行: 中国工商银行
  类型: 储蓄卡
  # 来源：https://hi.zzz.moe/face（Hibank 第三方图鉴）。
  # 原图：https://storage.my-api.cn/static/images/new_upload/155.jpg
  图片: ./assets/cards/icbc-horse-success.jpg
  卡组织: 银联
  编号: icbc-horse-success
```

导入任务默认只修改对应卡面文件与 `cards.yaml`。按用户约定，不额外进行 HEAD 请求、图片解码检查、测试或构建验证；用户明确要求时再执行。请求失败时简要报告具体失败，不循环重试或重新分析前端 JS。完成后报告导入卡片和本地路径，不声称完成未执行的验证。
