# 左领口铭牌与闭眼修整

2026-10-06 的网站更新包。人物自身左侧对应画面右侧；铭牌垂直悬挂，金色分叉浮雕与暗红底边沿用用户参考，不是圆形怀表。原人物身份、发型、瞳孔、衣物及既有动作来源保留。

## 制作与范围

`native/` 保存 Cubism 5.3.04 实际编辑后的 PSD、模型、动画与动作文件。原 v6 铭牌层留空，新层绑定衣领呼吸变形器并建立轻变形网格。实际导出 1280×720、30fps、4 秒的 121 张 PNG（含循环末帧）。原生半闭眼仍有残留线与左右衔接差异，**原生眼部中间帧没有通过最终发布审查**，不能把本次网页发布当成 `.moc3` 模型完成。

网页使用完整人物图片：原生躯干导出加确定性的眼内修整。眼睑曲线、肤色遮挡和黑色轮廓统一闭合，瞳孔不拉伸，头发与眉毛不随睫毛移动。`source-candidate.json` 保留全部原生/修整帧摘要，`frames/idle/` 保存实际采用的 67 个采样 PNG。呼吸段 15fps、眨眼变化段 30fps；共享中立、重复画面和采样槽位不算独立绘制。121 张的全部本机导出继续留存，不自动上传到网站。

其他动作只增加独立铭牌：使用既有靴底注册和逐姿态领口位置，不改变手臂或衣物。深鞠躬用显式领口轨迹，避免明暗自动跟踪误认脸部、将铭牌盖到脸侧。旧 v3/v4 固定位置试作不发布，历史动作美术评价不改写。

## 复用与重建

1. 在 Cubism 打开独立模型与动画；如移动工作目录，在项目树替换为此模型。导出 121 张 PNG，命名 `Idle_BreathBlink_4s_000.png` 至 `120.png`，置于 `docs/assistant/live2d-badge-v7/render/breath-blink/`。不覆盖旧工程。
2. 运行 `node --import tsx scripts/animation/prepare-left-collar-release.mjs`，眼部来源使用本包 `source/` 的冻结原图、肤色与透明铭牌。产物写入独立 v4 草稿；不同字节不能覆盖已有文件。
3. 重新检查眼部深浅底、所有动作及领口遮挡；更换角色必须重新定义眼部区域和领口轨迹，不能复用本包审查许可。
4. `node --import tsx scripts/animation/build-left-collar-atlases.mjs` 从已保留 PNG 构造无损图集，回读全部 alpha 与可见 RGB。此命令只产生候选，不自动许可、提交或部署。
5. `node --import tsx scripts/verify-character-integration.mjs` 对本地网页检查四种宽度各 217 个时间点、脚底、裁剪、持续画布、暂停、减少动态、失败回退及动作切换。报告复制为 `review/browser-local.json`；最终执行 `node scripts/animation/verify-left-collar-release.mjs` 检查当前图集、PNG、美术与浏览器证据绑定一致。

播放器只缓存最多 8 个显示尺寸的姿态画布；仅加载待机与当前动作的图集，不新增 Live2D SDK、外部生成 API、麦克风或模型问答。新资源 URL 独立版本化，旧图集保留。

## 发布状态

深浅底眼部及全部动作铭牌位置的限定范围审查见 `review/art-review.json`；候选报告仍保留原始“待审”状态，最终门禁单独核对实际文件。当前文档记录制作完成和本地验证，生产上线以 `review/production-deployment.json` 及 `review/production-browser.json` 为准，没有这两项证据时不能声称已部署。

上线仅替换应用，不修改数据库、环境、Nginx、SSH、媒体或上传 ACL。应用旧提交/镜像和数据备份先保留；任何健康、资源字节或网页检查失败时回滚应用，不还原数据库覆盖新写入。
