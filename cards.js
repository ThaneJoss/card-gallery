// 卡片资料：新增、删除或调整下面的记录即可，数组顺序就是展示顺序。
// image：填写远程图片直链（https://...）；部署构建时自动下载并转成 WebP。
// 现有示例仍可使用 assets/cards/ 下的本地图片；新增卡片无需保存图片到仓库。
// bankLogo：银行图标路径，可省略；省略时显示通用银行图标。
// type：credit（信用卡）或 debit（储蓄卡）。
// networks：visa、mastercard、unionpay、amex、jcb、discover，可填写多个。
// keywords：搜索关键词，可以写字符串或字符串数组。每张卡的 id 必须唯一。
// 支持 JS 注释与末尾逗号；不要删除下面的 window.CARD_GALLERY_DATA = 和末尾分号。
window.CARD_GALLERY_DATA = [
  {
    "id": "boc-mountain",
    "name": "长城环球通白金卡",
    "bank": "中国银行",
    "type": "credit",
    "networks": [
      "visa",
      "unionpay"
    ],
    "keywords": "雪山 月夜 山峰 蓝色 长城 环球通 bank of china boc",
    "image": "./assets/cards/boc-mountain.webp",
    "bankLogo": "./assets/logos/banks/boc.svg"
  },
  {
    "id": "icbc-spring",
    "name": "工银香格里拉联名卡",
    "bank": "中国工商银行",
    "type": "credit",
    "networks": [
      "mastercard",
      "unionpay"
    ],
    "keywords": "樱花 春日 古塔 粉色 工行 icbc",
    "image": "./assets/cards/icbc-spring.webp",
    "bankLogo": "./assets/logos/banks/icbc.svg"
  },
  {
    "id": "abc-valley",
    "name": "农行悠然白金卡",
    "bank": "中国农业银行",
    "type": "credit",
    "networks": [
      "unionpay"
    ],
    "keywords": "山谷 田园 绿色 河流 农行 abc",
    "image": "./assets/cards/abc-valley.webp",
    "bankLogo": "./assets/logos/banks/abc.svg"
  },
  {
    "id": "ccb-city",
    "name": "龙卡全球支付信用卡",
    "bank": "中国建设银行",
    "type": "credit",
    "networks": [
      "visa",
      "mastercard"
    ],
    "keywords": "城市 天际线 广州 广州塔 日落 建行 ccb",
    "image": "./assets/cards/ccb-city.webp",
    "bankLogo": "./assets/logos/banks/ccb.svg"
  },
  {
    "id": "cmb-coast",
    "name": "经典白金卡",
    "bank": "招商银行",
    "type": "credit",
    "networks": [
      "visa",
      "amex"
    ],
    "keywords": "灯塔 海岸 日落 夕阳 经典白 招行 cmb",
    "image": "./assets/cards/cmb-coast.webp",
    "bankLogo": "./assets/logos/banks/cmb.svg"
  },
  {
    "id": "bocom-wall",
    "name": "太平洋标准信用卡",
    "bank": "交通银行",
    "type": "credit",
    "networks": [
      "mastercard",
      "jcb",
      "unionpay"
    ],
    "keywords": "长城 山脉 中国 蓝色 交行 bocom",
    "image": "./assets/cards/bocom-wall.webp",
    "bankLogo": "./assets/logos/banks/bocom.svg"
  },
  {
    "id": "cib-ink",
    "name": "兴业悠系列信用卡",
    "bank": "兴业银行",
    "type": "credit",
    "networks": [
      "unionpay"
    ],
    "keywords": "水墨 江南 小舟 湖泊 黑白 冬日 cib",
    "image": "./assets/cards/cib-ink.webp",
    "bankLogo": "./assets/logos/banks/cib.svg"
  },
  {
    "id": "citic-autumn",
    "name": "颜卡·秋日限定",
    "bank": "中信银行",
    "type": "credit",
    "networks": [
      "unionpay"
    ],
    "keywords": "秋天 枫叶 古塔 红色 橙色 citic",
    "image": "./assets/cards/citic-autumn.webp",
    "bankLogo": "./assets/logos/banks/citic.svg"
  },
  {
    "id": "spdb-ocean",
    "name": "浦发梦卡",
    "bank": "浦发银行",
    "type": "debit",
    "networks": [
      "unionpay"
    ],
    "keywords": "鲸鱼 蓝鲸 海洋 大海 蓝色 浦发 spdb",
    "image": "./assets/cards/spdb-ocean.webp",
    "bankLogo": "./assets/logos/banks/spdb.svg"
  }
];
