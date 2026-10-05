# v16 抬手问候：连续性修整

在 v15 的袖口、手指重影和斜金饰修整之上，只重新制作第 14 张适度半开掌，并精确复用到回程第 22 张。其余 35 张 PNG 与 v15 逐像素一致，不删除帧、不减速、不改变身体位置，避免张掌→回握→再张掌的跳变。

## 来源和时序

19 个前向准备姿势为 1 原中立、6 既有关键姿态、6 修绘姿势、6 v9 插值姿势；再精确反向得到 37 PNG 时间槽。不是 37 张独立绘制。变化段 15fps、三秒周期、末尾约 0.6 秒中立。v10 的 9 次内置 imagegen 参考编辑中，最终复用 5 份来源；本包增加 1 次半开掌编辑，全部实际提示词与引用见本包 `prompts.json` 及 `../wave-keyframes-v10/prompts.json`。没有新增 DeepSeek、外部付费图像 API 或云 GPU 请求。

保持原黑金 Q 版身份、768px 画布、20% 留白、384/608 脚底锚点。新图仍使用共同缩放和脚底登记，只有固定 247/374/54/54 手掌区域被替换，手腕下方与原袖子、头脸、躯干中间、另一手臂、脚部及保护区域不变。播放完整人物 PNG，不恢复运行时分层、整图位移或交叉淡化。

## 摘要与验收

| 范围 | SHA-256 |
| --- | --- |
| Manifest | `2e08284f63548da3d68c9712b7de47ab62458d85da6991949194836643bc101f` |
| 准备姿势 | `3077d5ac7e1ef215e61970707a9b7e7ac40fc2a8747fc169ec2d93cde4c076e1` |
| 37 帧像素 | `e5d9c3c2d8f54edc05288bb52e407ee9d5c4488cd8e204c23bc6dfc1f3534add` |
| 流水线引擎 | `da8dcf4ba796f89a7bfb4520a521c3f56bfab8d76b5a197ef449c14ea911db18` |

关键姿势、技术指标、真实正常/半速播放与独立完整美术是分离门禁；审批只对本版本实际摘要有效。缺任何门禁或源文件变化时必须拒绝导出。v7–v15 拒收记录保留，不继承 v6 所有者对特定旧样片的确认。最终进度以本包 `review/`、`runtime-manifest.json` 和生产验收记录为准，不将准备成功写成已上线。

## 复用入口

```powershell
npm run animation:pipeline -- run docs/assistant/wave-keyframes-v16/manifest.json
node scripts/view-animation-review.mjs docs/assistant/wave-keyframes-v16/manifest.json
node scripts/publish-reviewed-wave.mjs docs/assistant/wave-keyframes-v16/manifest.json --check
node scripts/publish-reviewed-wave.mjs docs/assistant/wave-keyframes-v16/manifest.json
```

`run` 不自动批准；关键姿势或最终美术许可缺失时在相应步骤停止。完整无损静态运行图集为 6×7、2196×3220px，共同固定裁剪不丢任何非透明像素，逐像素回读 37 格与 5 个空格。两端使用既有眨眼中立图，其他六动作及原 84 张 PNG 保留。PNG/动画 WebP 使用 67ms/588ms 保持；运行时精确 15fps/600ms 保持，两者均三秒。

详细制作、资源/路径/并发/缓存/摘要边界和未来换角色流程见 `../../codex/14_ANIMATION_WORKBENCH.md` 与 `../../codex/13_ASSISTANT_CHARACTER_WORKFLOW.md`。动作模板和流水线可复用；任意单图自动绑定、自动修绘/抠图、美术自动放行、LoRA 与 EbSynth/ToonCrafter 全约束链仍未实现。
