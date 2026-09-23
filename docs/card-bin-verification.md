卡面替换记录（2026-09-22）

按用户要求，将中国农业银行「金穗社保卡」替换为同银行的「只此青绿借记卡（人物横版）」，仍为银联储蓄卡。新卡使用独立编号 `abc-zhici-qinglv-debit`，清理旧社保卡原图及专属高清、底图和透明图层，避免列表缩略图和三维详情继续显示旧社保卡。新卡直接使用图库原图，暂不提供分层素材。

用户提供的 [ArkFlow 卡面库](https://arklab.top/cards/) 当前显示已下架，其来源项目 [Cardentify](https://github.com/HarukaKinen/Cardentify) 已指向新的独立站点。本次替换使用项目已有的 [Hibank 农行查询](https://hi.my-api.cn/api/?resource=face&search=%E4%B8%AD%E5%9B%BD%E5%86%9C%E4%B8%9A%E9%93%B6%E8%A1%8C)条目 514：名称为「农业银行只此青绿人物卡（横版）」，标注 `Debit`、`UnionPay`、来源 `Apple Pay`。[原始 PNG](https://storage.my-api.cn/static/images/new_upload/1000042961.png) 按原样保存为 `assets/cards/abc-zhici-qinglv-debit.png`。这些是第三方图鉴提供的资料，不将其称为银行官方图片。

该条目未提供 BIN，因此新卡不填写 BIN；原社保卡的 `622823` 不迁移到新卡。下表保留 2026-09-17 的历史核实记录，其中社保卡已不属于当前展示清单。

卡 BIN 核实记录（2026-09-17，历史）

范围为当时 `cards.yaml` 的 9 张卡。核对银行、借贷类型、卡组织，并分别审查具体产品名、主题卡面和版本。当时银行、类型和卡组织均未发现明确冲突，因此保留；这不表示所有主题和版本都已得到银行官方确认。当时 BIN、卡名及图片均保留，不能由公开资料确认的细节已在 YAML 注释中说明。

| BIN | 基础信息复核 | 产品名与卡面结论 | 直接依据 |
| --- | --- | --- | --- |
| 621225 | 中国工商银行 / 储蓄卡 / 银联，一致 | 马到成功借记卡主题仅有第三方图库支持；图库未给 BIN，尚未确认当前卡面与该 BIN 的直接对应。 | [BinCheck](https://bincheck.io/zh/details/621225)、[Hibank 马到成功查询](https://hi.my-api.cn/api/?resource=face&search=%E9%A9%AC%E5%88%B0%E6%88%90%E5%8A%9F)，条目 461。 |
| 621663 | 中国银行 / 储蓄卡 / 银联，一致 | 第三方 BIN 表细分名为“员工普卡”，尚无银行官方对照表；保留长城系列名，常规卡面仅作示意。 | [BinCheck](https://bincheck.io/details/621663)、[Zao3g BIN 表](https://tool.zao3g.com/cardbin/bin_621663.html)、[中行章程第 1 页](https://www.boc.cn/bcservice/bc3/bc31/202111/P020211109538431875935.pdf)。 |
| 621700 | 中国建设银行 / 储蓄卡 / 银联，一致 | 龙卡通名称相符；Hibank 条目 49 将当前银联储蓄卡图关联至此 BIN。 | [BinCheck](https://bincheck.io/zh/details/621700)、[建行龙卡通](https://www.ccb.com/chn/home/yhk/yhklb/lkjjk/lkt/lkt/index.shtml)、[Hibank 建行查询](https://hi.my-api.cn/api/?resource=face&search=%E4%B8%AD%E5%9B%BD%E5%BB%BA%E8%AE%BE%E9%93%B6%E8%A1%8C)。 |
| 622168 | 中国建设银行 / 信用卡 / 银联，一致 | 共享 BIN，不能唯一确定 bilibili、锦绣山河或学生版；原版本来自已有截图资料。 | [建行官方 BIN 活动公告](https://www1.ccb.com/sn/cn/faverable/20160837_1425457621.html)、[原截图出处](https://post.smzdm.com/p/ar6530gx/)。 |
| 622823 | 中国农业银行 / 储蓄卡 / 银联，一致 | 金穗社保卡有官方 BIN 直接支持；河南图仅作代表，不能识别实卡地区。 | [农行官方 BIN 公告](https://www.abchina.com/cn/branch/sh/preInfo/fwgg/201201/t20120120_870632.htm)、[河南省社会保障卡介绍及卡面](https://www.abchina.com/cn/branch/ha/branchchar/201603/t20160323_861043.htm)。 |
| 622262 | 交通银行 / 储蓄卡 / 银联，一致 | Hibank 条目 529 明确关联太平洋马年贺岁卡与该 BIN；为第三方对应资料，并非马年专属 BIN。 | [BinCheck](https://bincheck.io/details/622262)、[Hibank 太平洋马年查询](https://hi.my-api.cn/api/?resource=face&search=%E5%A4%AA%E5%B9%B3%E6%B4%8B%E9%A9%AC%E5%B9%B4)。 |
| 621483 | 招商银行 / 储蓄卡 / 银联，一致 | BIN 表只支持银联 IC 普卡借记卡，不能确认锦鲤主题；保留原记录并标待确认。 | [卡号网](https://www.chakahao.com/cardbin/html/621483.html)；[原图片来源文章](https://battlele.com/cmb-credit-card/)本次访问返回 HTTP 404。 |
| 531063 | 招商银行 / 储蓄卡 / Mastercard，一致 | Hibank 条目 341 明确对应金葵花人民币结算版，第三方报道交叉支持；未找到银行官方 BIN 与结算版本对照。 | [国泰官方招行万事达借记卡活动](https://flights.cathaypacific.com/sc_CN/offers/MasterCard_promotion_CMB.html)、[Hibank 金葵花查询](https://hi.my-api.cn/api/?resource=face&search=%E9%87%91%E8%91%B5%E8%8A%B1)、[第三方报道](https://www.zaihua.news/article/32913/)。 |
| 622575 | 招商银行 / 信用卡 / 银联，一致 | Hibank 条目 95 明确对应哔哩哔哩信用卡，但不区分校园版；校园版保留原清单记录，待持卡记录确认。 | [招行 BIN 表](https://www.chakahao.com/bin/list/30800.html)、[Hibank 哔哩哔哩查询](https://hi.my-api.cn/api/?resource=face&search=%E5%93%94%E5%93%A9%E5%93%94%E5%93%A9)。 |

需要保留的证据边界：

- **共享 BIN 与主题卡。** 工行官方的[紫禁城纪念借记卡介绍](https://m.icbc.com.cn/page/721854222751383576.html)允许原 621225 等号段换卡不换号，说明该 BIN 不专属于马年。工行另有[同名生肖信用卡](https://www.sh.icbc.com.cn/column/1438058389145272546.html)，不能将同名产品的信用属性套用到当前借记卡条目。当前马年主题与 BIN 的对应仍待确认。
- **中行系列名称。** 中行章程将长城借记卡定义为境内个人借记卡系列统称；第三方库的“员工普卡”不能证明持卡人身份，也不足以据此更换卡面。[Hibank 中行查询](https://hi.my-api.cn/api/?resource=face&search=%E4%B8%AD%E5%9B%BD%E9%93%B6%E8%A1%8C)条目 13 名称为“长城借记卡”，未列 BIN。
- **建行学生版。** 建行 2015 年公告已将 622168 用于全球支付卡银联金卡，故不能把它当成 bilibili 专属 BIN。[建行产品资讯](https://www.ccb.com/chn/2020-12/23/article_2021082106161157596.shtml)能证明 bilibili 产品包含学生金卡，[2023 年公告](https://ccb.com/cn/v3/include/notice/20230109_1673252663.html)能证明锦绣山河版存在并于 2023-01-16 停发，但都不直接确认当前实卡版本。停发不影响历史收藏条目的保留。
- **交行马年卡。** 第三方[马年卡介绍](https://post.smzdm.com/p/a65rx6ng/)称 622260、622262 可同号换领马年贺岁卡；这支持主题兼容关系，不证明所有同 BIN 卡都是马年版。Hibank 当前条目已直接列 622262，但仍属于第三方资料。
- **招行结算版本。** Hibank 当前将 531063 对应人民币结算版，将 525612 对应美元结算版；[飞客讨论](https://www.flyert.com/forum.php?extra=&fromguid=0&mod=viewthread&tid=4750461)也有相同区分。国泰官方活动只能直接证实 531063 属招行 Mastercard 借记卡，不能单独证明金葵花等级或结算币种。
- **招行校园版。** [招商银行官方转卡清单第 1 页](https://s3gw.cmbimg.com/lb5001-cmbweb-prd-1255000097/cmbcms/20260428/6b6d7b3e-bebe-425b-9be8-2d54af41227b.pdf)确有“银联 bilibili 联名信用卡校园版”，但未给 BIN 或卡面。该产品存在、图库关联 622575、当前条目属于校园版，是三个不同结论；最后一项仍需持卡记录支持。

2026-09-17 当次验证：同步修复了资料解析器不接受 `bin` 的问题：允许可选的六位或八位数字/文本，构建数据统一保留为文本，不新增页面展示。提交 PR 前已同步最新主分支并保留其本地卡面路径；`pnpm check:cards` 通过 9 张卡的字段检查，`pnpm test` 的 29 项测试全部通过，`pnpm build` 使用现有本地卡面成功构建全部 9 张卡。测试涵盖 BIN 解析、卡面本地化保留 BIN 和构建输出；字段检查不等于事实核实，事实依据见上表。本次未重新下载远程卡面。
