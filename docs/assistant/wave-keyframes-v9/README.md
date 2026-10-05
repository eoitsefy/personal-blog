# v9 抬手问候样片：未通过整段美术验收

这不是线上素材。七张完整人物关键图包含本轮两张新过渡姿态、五张复用图；内置 imagegen 实际参考编辑四次，两个候选被弃用。来源、提示词及选择结果见 `prompts.json`。所有图片使用 768×768 固定透明画布、20% 留白、同一缩放和脚底锚点；原头脸、躯干中心与脚部静区不改。

动作顺序为中立→准备→低位抬臂→胸前→半张掌→展开→张掌→反向收回。**这是抬手问候，不包含左右摆掌。** 本地 RIFE 输出 37 张 PNG，变化段约 15 fps，周期三秒；插值图和中立停顿不算独立绘制。

## 分离的审查结果

- `review/automatic.json` 是准备时的原始测量，历史状态仍为待关键图审查；后续意见单独存档，不覆盖原测量。
- `review/key-visual.json` 与 `key-approval.json` 只允许七张绑定摘要的关键图进入补帧。
- `review/technical.json` 拒绝过程帧 1、14、16、17、22、35。
- `review/visual.json` 拒绝袖口灰边、手指叠线和局部模糊。自动指标遗漏的连接衣袖残影同样阻断发布。
- `review/playback.json` 只证明 37 张实际 PNG 的正常/半速整轮播放、像素、暂停、减少动态和手机宽度检查通过，不表示美术通过。
- `review/shared-warp-experiment.json` 保存离线共享 RGBA 变形实验的失败结论；它不是可发布替代品。

没有 `final-approval.json`，通用打包入口必须拒绝此样片。原 v7/v8 拒收与 v6 两个特定样片的所有者确认不变；后者不能借给 v9。

## 本机执行

在仓库根目录的普通 PowerShell 中执行；不要在生产服务器执行。完整安装与新角色操作说明见 [制作工具说明](../../codex/14_ANIMATION_WORKBENCH.md)。

```powershell
$manifest = 'docs/assistant/wave-keyframes-v9/manifest.json'
npm run animation:pipeline -- doctor $manifest
npm run animation:pipeline -- prepare $manifest
npm run animation:pipeline -- interpolate $manifest
npm run animation:pipeline -- check $manifest
```

当前 `check` 非零退出是预期拒收。诊断预览允许检查不合格动画，但不会放行打包：

```powershell
npm run animation:pipeline -- preview $manifest
npm run animation:pipeline -- status $manifest
node scripts/view-animation-review.mjs $manifest
```

最后一个命令打印只监听 `127.0.0.1` 的临时地址；在浏览器打开它，按 Ctrl+C 关闭。`preview.html` 依赖本机 HTTP 服务的哈希与 PNG 读取，不能用双击本地文件代替检查。

修改来源、蒙版、顺序或工具代码会改变任务范围；需新版本目录并重新审批。不要降低阈值、删除坏帧、强制填实皮肤或复制其他动作的许可。后续优先补准备到胸前和握拳到张掌的真实小幅姿态，再重新看完整过程。
