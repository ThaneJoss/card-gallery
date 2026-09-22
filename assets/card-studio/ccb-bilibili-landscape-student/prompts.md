# 处理概要（非逐字调用记录）

以下为内置图像工具实际任务约束的摘要，不声称可精确复现生成结果。原图、高清与底图应作为后续修补的视觉依据。

# 单张卡面高清与去标志试验

- 日期：2026-09-22
- 工具：内置 image_gen，依次编辑两次。
- 源图：`assets/cards/ccb-bilibili-landscape-student.jpg`，540 × 340。
- 高清图：`ccb-landscape-hd.png`，1581 × 995。提示词请求 2160 × 1360，工具实际输出为 1581 × 995。
- 去标志图：`ccb-landscape-clean.png`，基于上一步高清图生成。
- 原图副本：`ccb-landscape-original.jpg`。
- 原收藏素材与 cards.yaml 未替换；这些文件仅为对比试验产物。

## 视觉观察

高清图消除了原图的明显模糊，羽毛、山水、人物与文字边缘更清楚。颜色更鲜艳、局部纹理和线条被重绘，因此属于生成式高清重建，不能视为无损超分或真实细节恢复。

去标志图中未见明显的银行名、银行图标、bilibili 字标、无界卡文字或银联徽标残留；银色芯片也已移除。芯片覆盖处的羽毛与橙色腿部、银联徽标覆盖处的河岸与水面形成了视觉上较连贯的补全。整体构图仍保持。遮挡区域是合理推测，未进行逐像素保真验证，也不是对开源模型的效果验证。

## 第一阶段提示词

```text
Use case: precise-object-edit.
Input image 1 is the exact edit target: a 540 x 340 flat front image of a China Construction Bank bilibili landscape bank card. Create ONE high-definition restored version of this exact image. Aim for 2160 x 1360 pixels (4x) with the same aspect ratio and full framing.
Primary request: faithful high-resolution restoration / super-resolution. Reduce JPEG blur and compression artifacts and clarify existing illustration contours without redesigning the image.
Preserve the exact composition and positions: the large white crane flying toward the right, its overlapping feathers and long curved neck, the tiny rider at upper center, the pale green-blue mountains and blue river, the pale clouds at the bottom, the soft muted original palette, card edge and rounded corners. Preserve all existing Chinese and English writing, logos and the silver chip exactly in their original positions and proportions, including 中国建设银行, China Construction Bank, GOLD, bilibili, 无界卡, UnionPay, 银联. Text should be faithful to the reference, not invented.
Keep the original illustrative style, color balance and delicate line work. Output only the flat bank card front filling the image. No perspective, no 3D render, no lighting changes, no new decorative elements, no border, no title or comparison layout. Do not erase any existing element in this first stage.
```

## 第二阶段提示词

```text
Use case: precise-object-edit.
Input image 1 is the exact edit target: the high-definition illustrated bank card produced in the previous stage. Create ONE clean artwork version of this same image, retaining its full framing, aspect ratio, dimensions, and rounded card edge.
Remove all non-artwork overlays and naturally reconstruct only the areas they cover:
1. Top-left blue China Construction Bank emblem and all adjacent black writing 中国建设银行 / China Construction Bank / GOLD; fill this area with a natural continuation of the existing green-blue mountains, fine landscape lines and pale cloud regions.
2. Top-right blue bilibili wordmark; restore the pale clouds and mountain background underneath.
3. Bottom-left blue 无界卡 lettering; seamlessly restore the white cloud forms and any crane feather outlines underneath.
4. The entire bottom-right UnionPay badge including colored red/blue/green panels, silver-white frame and all UnionPay / 银联 lettering; reconstruct the blue river and the adjacent landscape/cloud edges, matching their existing directions and colors.
5. The rectangular silver electronic chip at left center, including its black outline and internal lines; naturally restore the portions of the white crane wing, its fine feather lines, the orange crane legs, and green mountain background that were obscured.
Preserve the central crane's pose, rider character, long curved neck and head, feather arrangement outside the erased regions, blue river path, mountain silhouettes, distant small birds, architecture, cloud forms, original illustration style, colors and texture outside the edited regions as closely as possible. Keep the rider's illustrated face as part of the character, not as text to erase.
The result should be the same complete Chinese landscape and crane illustration with no text, digits, bank emblems, brand logos, payment-network badge, or chip anywhere. No new motifs, no new border, no additional labeling, no perspective change, no new frame, no mockup, no comparison layout. Output only the edited image.
```



## 当前素材说明

- 高清图和底图为生成式重建，补全区域并非原始真实图案。
- 透明层 RGB 来自完整高清图；局部差分结合人工区域与颜色约束估计 alpha，细边缘可能有背景残留。
