# v15 抬手问候修整

本包保持原版完整人物逐帧，不使用运行时分层、整图位移或交叉淡化。动作是抬手、逐步张掌、原路收回，不冒充左右摆掌。

## 素材来源与修整

- 19 个前向准备姿势：1 张原中立、6 张既有关键姿态、6 张修整后的图像编辑姿势、6 张保留的 v9 插值姿势。
- 37 个 PNG 时间线槽位为前向 19 张加精确反向 18 张；不是 37 张独立绘制。变化段 15fps，三秒周期，首尾共享原中立，末尾约 0.6 秒保持中立。
- 内置 imagegen 共 9 次参考编辑，选用其中 6 份来源；全部实际提示词和弃用输出保存在 `../wave-keyframes-v10/prompts.json` 与 `generated/`。没有新增 DeepSeek、收费图像 API 或云 GPU 请求。
- 1254px 来源使用共同缩放、768px 画布与 384/608 脚底锚点，不对每张人物单独缩放。头脸、躯干中间、另一侧手臂、靴子和保护边距保持原像素。
- 第 7 姿势仅离线修整活动手臂，颜色与 alpha 使用同一预乘采样；肩部接缝固定，恢复原衣袋和斜金饰。14/16/17 的掌部只使用有限区域，避免带入生成头发碎边。回程完全复用对应前向图，避免来回形变不同。
- v10–v14 分别因截拳/游离像素、肩部变化、金饰闪变、旧手碎片、额外金块而拒收，记录保留；不降低技术阈值，不继承 v6 所有者特定样片的许可。

## 独立门禁

关键姿势与完整动画审批分别绑定实际内容摘要。技术指标不能发现所有袖口残影，美术代理实际查看浅/深底全帧及手臂放大图；正常/半速实际浏览器播放核对全部源 PNG 和画布像素，并验证暂停、减少动态、手机无溢出。数字通过不能自动生成美术批准。

关键姿势及技术播放通过后，独立正常/半速最终美术复查拒收：13→14→15→16 的掌形开合发生回摆，反程同样复现。见 `review/rejection.json`；没有最终发布许可、运行时图集或生产部署。后续 v16 只修 14 与镜像 22，不删帧或改变时序。下列命令仅说明门禁，v15 打包/发布必须拒绝。

| 范围 | SHA-256 |
| --- | --- |
| Manifest | `aca43c82d0fff6a71ca00af9decc9653066189f397ad216f45f7ef5a47a5987b` |
| 准备姿势 | `f94fd3fd34aa1478b90354693b374931c37d906ba2274402ecf284bfaaf1d7fa` |
| 37 帧像素 | `ce1db3f2335f58f7d1d8564ce3484d45c83d1417d7f672569014b1086e23d66c` |
| 流水线引擎 | `da8dcf4ba796f89a7bfb4520a521c3f56bfab8d76b5a197ef449c14ea911db18` |

## 可执行复用流程

在仓库普通终端使用下列入口；工具运行目录在本机 D 盘，路径由 manifest/引擎摘要隔离。资源不足、并发、过期审批或文件篡改均拒绝继续。不可重写已批准版本；修改姿势应建立新版本。

```powershell
npm run animation:pipeline -- prepare docs/assistant/wave-keyframes-v15/manifest.json
npm run animation:pipeline -- interpolate docs/assistant/wave-keyframes-v15/manifest.json
npm run animation:pipeline -- check docs/assistant/wave-keyframes-v15/manifest.json
npm run animation:pipeline -- preview docs/assistant/wave-keyframes-v15/manifest.json
node scripts/view-animation-review.mjs docs/assistant/wave-keyframes-v15/manifest.json
```

独立全帧美术许可齐备后才可执行：

```powershell
npm run animation:pipeline -- package docs/assistant/wave-keyframes-v15/manifest.json
node scripts/publish-reviewed-wave.mjs docs/assistant/wave-keyframes-v15/manifest.json --check
node scripts/publish-reviewed-wave.mjs docs/assistant/wave-keyframes-v15/manifest.json
```

打包输出无损动画 WebP；运行时发布器将 37 张完整 PNG 按共同固定框无损复制到 6×7 静态图集，2196×3220px，逐像素回读全部格子及透明空格。两端与既有眨眼中立图一致。不会进行每帧自动裁切，也不会修改其他六动作或原 84 张 PNG。PNG 审查以整数 67ms/588ms 保持播放，运行时精确 15fps/600ms 保持，两者均三秒并明确记录区别。

换角色时可以复用动作阶段、时序、输入登记、路径/摘要门禁、浏览器检查和导出器，但仍需该角色实际关键姿势、固定锚点和独立完整美术验收。未实现任意单图自动绑定、自动修绘/抠图、自动美术审批、LoRA 或 EbSynth/ToonCrafter 整链。
