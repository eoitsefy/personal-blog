# 助手动画本地制作工具

这套工具用于保留原角色的完整人物逐帧动画制作，不恢复分层拼装。软件和模型安装在 `D:\CodexTools\assistant-animation`，与生产博客、网站 DeepSeek 配置及数据库独立。DeepSeek 只生成动作草案；本地显卡制图须先通过资源检查，少量参考编辑也可使用内置 imagegen，实际工具必须分别记录。发布仍需美术和浏览器检查。

## 统一可执行流水线

入口是 `scripts/animation-pipeline.mjs`，不需要启动ComfyUI，不调用DeepSeek或图像API，也不会部署。输入必须是已制作好的完整透明PNG姿态和过程图、原中立图、允许修改区域的透明蒙版，以及固定时序的 `manifest.json`。执行适配器只有 `rife-rgba` 和 `hold`；前者调用本地 RIFE，后者按批准顺序保留已制作的完整过程 PNG，可用于经全帧审查的素材包，但不生成新中间姿态。

| 阶段 | 执行内容 | 必须保留的界限 |
| --- | --- | --- |
| doctor / prepare | 源PNG摘要/尺寸、原中立、静区/20%留白、系统盘/内存检查 | 技术准备不等于关键图美术通过 |
| interpolate | 独立关键图许可后，RIFE 补帧或 hold 排列既有完整 PNG | 中间帧、重复槽不能当作独立绘制数量 |
| check | 重新读取全部实际帧，核对数量/时序/关键节点/静区/alpha/组件 | 指标不能发现所有黑袖残影和手型错误 |
| preview | 正常/半速实际整轮、源PNG与画布、暂停/减少动态/手机宽度 | 允许拒收动画的诊断预览，不放行发布 |
| package | 重查技术、完整播放记录、最终全帧美术许可；无损WebP解码核对 | 仅产出本机离线文件，不自动部署 |

每个任务按 manifest 摘要和执行器代码摘要隔离到 D 盘目录；工具升级不借用旧结果。缓存同时核对文件摘要，重复执行可续跑但不能覆盖不相同的历史产物。来源、蒙版、顺序、参数或审批范围变化都要新版本/新审查；不能把旧动作许可复制给新素材。并发锁阻止两个任务写同一范围，崩溃留下的锁须先确认进程已停止再人工处理，不自动删除。Windows路径拒越界、链接和设备别名；外部工具的过长路径在执行前明确拒绝，避免声称任意长任务名都兼容第三方工具。

### 本机执行：每段不超过20行

以下在普通PowerShell、仓库根目录执行，**不在阿里云服务器执行**。Node须满足 `package.json`，仓库依赖须已安装，本地RIFE与锁定权重位于D盘。WebP和临时浏览器数据同样留在D盘。

```powershell
cd 'C:\Users\Administrator\Documents\Codex\2026-07-15\github-plugin-github-openai-curated-remote-4\work\personal-blog'
$manifest = 'docs/assistant/wave-keyframes-v16/manifest.json'
$env:ANIMATION_TOOL_ROOT = 'D:\CodexTools\assistant-animation'
npm run animation:pipeline -- doctor $manifest
npm run animation:pipeline -- prepare $manifest
```

关键图须由独立视觉审查给出仅限补帧的摘要许可，命令行不会生成或自动批准。已冻结的 v16 只能在当前来源和摘要不变时复用自己的许可；不要重新运行专用准备脚本覆盖已审查图，也不能借用 v9–v15 许可。

```powershell
npm run animation:pipeline -- interpolate $manifest
npm run animation:pipeline -- check $manifest
npm run animation:pipeline -- status $manifest
```

v16 已通过当前技术和完整美术门禁；历史 v9 的 `check` 仍应非零退出，不能强行改成成功。诊断预览先从仓库解析Playwright；如仓库没有它，在本机显式配置已有运行时的包解析锚点（必须是本地目录下的 `package.json` 路径，文件本身不要求存在；不在manifest内指定可执行模块）：

```powershell
$env:ANIMATION_PLAYWRIGHT_PACKAGE_JSON = 'C:\Users\Administrator\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\package.json'
$env:ANIMATION_BROWSER_CHANNEL = 'msedge'
npm run animation:pipeline -- preview $manifest
node scripts/view-animation-review.mjs $manifest
```

预览入口打印临时 `http://127.0.0.1:端口`，浏览器打开后可查看正常/半速、暂停和深浅背景；Ctrl+C关闭。只服务绑定摘要的HTML和PNG，不开放目录、其他仓库文件或生成API。直接双击 `preview.html` 不等价于运行预览。自动浏览器命令默认关闭其临时服务，手工查看才使用最后一个命令。

所有技术、完整播放和最终美术审查通过后才可打包；v16 具备当前范围的许可，v9–v15 的拒收历史不变：

```powershell
npm run animation:pipeline -- package $manifest --dry-run
# 真正执行时不加 --dry-run；未通过门禁会拒绝。
# 已准备并分别审批的新素材可用 run 顺序执行所有阶段。
npm run animation:pipeline -- run $manifest --dry-run
```

`--dry-run`只读取/校验输入并展示任务范围，不出图、不启动浏览器、不审批、不写文件。浏览器channel只允许本机白名单；缺少依赖/浏览器时须先补齐，不宣称预览已通过。几何测试素材已实际完成浏览器和WebP打包/解码，五张PNG合并为三编码帧，两个计数分别保存；不将它作为人物发布许可。

### v16 已交付、发布导出与生产验收

v16 已通过独立全帧美术复审、37 张实际 PNG 技术检查及正常/半速播放。19 张准备图分项为 1 张参考、6 张关键姿态、6 张图像修绘、6 张插值，按 37 槽、15 fps、3 秒播放，不称为 37 张独立绘制。本轮共 10 次内置 imagegen 调用，最终选用 6 个修绘来源，DeepSeek 调用为零；制作与拒收记录留在各版本，v10–v15 许可不能借给 v16。

每张输入可声明 `provenance.kind` 为 `reference`、`authored-keyframe`、`interpolated-frame` 或 `image-edited-frame`。衍生图必须保存 `parentFrameScopeSha256` 和 `parentFrameIndex`，修绘还需 `editSourceSha256`；未声明的旧图计为 `unspecifiedFrames`。来源计数随 manifest 摘要绑定，不把 `keys.length` 当成独立绘制数。

`scripts/publish-reviewed-wave.mjs` 接受 manifest 参数，在重新读取实际帧、技术报告、完整播放和最终美术审批后才导出。当前契约锁定原 768px 画布、19 张准备图和 37 槽；任何未审批、陈旧或拒收范围均失败，不产出公开资源。

```powershell
# 校验真实门禁，不导出公开图集。
node scripts/publish-reviewed-wave.mjs $manifest --check
# 批准后导出版本化图集；不部署。
node scripts/publish-reviewed-wave.mjs $manifest
```

v16 静态无损图集沿用固定裁剪框 `180,153,366,460`，6 列 7 排、2196×3220。37 帧逐行复制 RGBA，不逐帧缩放/自动裁切；编码后回读全部 42 格，核对可见 RGBA、alpha 与 5 格透明空白。`runtime-manifest.json` 保存实际来源、来源分项计数、审批、执行器/导出器及资源摘要；当前资源为 2348922 字节，SHA-256 `6a33ac3c97b25c127ca05a7d8aaa594830019a156c2bf5ce3089079c6c2e43aa`。播放源帧范围为 `e5d9c3c2d8f54edc05288bb52e407ee9d5c4488cd8e204c23bc6dfc1f3534add`。PNG/WebP 审查使用 67ms 步进和 588ms 中立末段，应用使用精确 15fps 与 600ms 中立末段，两者均为 3 秒。

本次只替换挥手，其他六动作及原 84 张 PNG 不改。185/185 本地测试零跳过（含实际浏览器与 WebP 回读）、lint、typecheck、无数据库 UI 预览构建通过；完整 CI `37307635788` 的 PostgreSQL 集成、生产构建及 Linux 容器检查通过。应用于 2026-10-05 20:25:25（中国时间）部署至 `6904a9b`，本地及生产四宽度各 159 个动作时间点通过，无 AI 请求。服务器原字节校验、HTTPS、数据库/Redis 健康、环境/Nginx/上传 ACL 不变检查通过；回滚及生产证据在 `docs/assistant/wave-keyframes-v16/review/production-deployment.json`。更换角色须重新制作与审查自己的整帧来源，并适配不同画布/裁剪契约，流程见 `13_ASSISTANT_CHARACTER_WORKFLOW.md`。

### v9 优化和拒收历史

v9本轮新增两张真实过渡姿态，七关键图经审查可补帧，37帧RIFE约15fps样片的正常/半速浏览器检查通过。但全帧美术仍发现袖口灰边、手指叠线；技术拒收1/14/16/17/22/35。`docs/assistant/wave-keyframes-v9/review/visual.json`保留明确拒收及实际帧摘要，没有最终许可，没有新生产接入。

多agent复审推动了两次边界修正：皮肤透明度指标增加全alpha/孤立组件测量，但仍承认连接黑袖残影会漏检；打包不能信任单个PASSED标签，必须核对实际PNG与完整播放记录。关键图许可与最终动画许可从结构上分离。175项单元测试零跳过通过，包含真实几何浏览器和WebP回读，lint/差异检查通过；真实v9打包正确拒绝。审查证据见新包 `review/pipeline-audit.json`。离线共享RGBA变形实验虽然保证同一颜色/alpha采样坐标，仍出现遮挡折叠，24过程帧拒收；`try-shared-wave-warp.mjs`仅为孤立实验，不是流水线适配器。

上述为 v9 当时的拒收结论；后续 v16 修整和独立许可见上节，不改写历史。不降低阈值、删坏帧、复制许可或只增加 fps。任意单图自动绑定、自动关键图修绘/抠图、美术自动放行、LoRA 训练、EbSynth/ToonCrafter 整链仍未完成；当前可流水执行的是经过素材制作和关键图审查之后的离线阶段。

## 已安装工具

| 工具 | 用途 | 当前验证 |
| --- | --- | --- |
| ComfyUI 0.38.0 独立版 | 保存并重复执行绘图流程 | RTX 2070 GPU 出图通过 |
| SD 1.5 与 IPAdapter Plus | 基础绘图和参考图约束 | 安全权重摘要校验、联合推理通过 |
| ControlNet OpenPose 和 Lineart | 约束姿态和轮廓 | 两个模型同时加载和推理通过 |
| Krita 5.3.4 便携版 | 修关键帧、准备姿态/线稿、透明边缘处理 | 下载摘要、有效程序签名及版本检查通过；未开展本轮人工修图 |
| RIFE 4.6 NCNN Vulkan | 传播关键帧之间的过程 | RTX 2070 本地RGB/独立alpha与单绿幕补帧执行通过；新33帧人物样片因残影/透明度拒收 |
| DeepSeek 动作规划入口 | 从七动作规范生成结构化草案 | 一次真实调用通过，重复任务命中缓存 |

固定版本、下载来源和 SHA256 在 `docs/assistant/animation-workbench/toolchain-lock.json`。工具与约 8.3GB 权重留在 D 盘，不提交到 Git；包括下载包的整个目录约 14.5GiB。全局 Python、Windows 服务、启动项和生产环境均未改变。

## 资源要求和当前状态

本机为 RTX 2070 8GB 显存、约 16GB 内存。先使用 512px、单张批次和短采样验证；正式计划固定 768px 画布、20% 留白和原脚底锚点，不承诺所有复杂流程都能同时常驻显存。

联合推理完成后检测到 C 盘仅余约 0.8GiB，并观察到系统分页文件占用较多空间。已停止这次启动的绘图后台，C 盘空闲回升至约 6.9GiB。这个现象说明多模型运行有明显内存/磁盘压力，不等同于把模型安装到 C 盘。没有删除用户文件或修改虚拟内存设置。

现在启动入口和命令行出图会检查系统盘至少有 **8GiB 空闲**、物理内存至少有 **4GiB 空闲**；不足时拒绝继续。这是保守的本机保护阈值，不是官方最低配置或所有工作流的成功保证。后续按用户授权清理约1.3GiB npm/本仓库构建缓存，C盘制作后约8.2GiB；当前ComfyUI仍停止，不立即重启联合模型。新RIFE入口逐次检查资源，并把临时文件放D盘。若需要迁移分页文件须另行确认，不能直接删除 `pagefile.sys`。直接使用第三方程序或手动提交 UI 工作流仍须自行观察资源，命令行检查不会拦截一切第三方操作。

## 打开和检查工具

以下在本机普通 PowerShell 执行，**不在阿里云服务器执行**。启动后台无可见终端窗口，只监听本机 `127.0.0.1:8188`；没有开放局域网或公网端口。

```powershell
$tools = 'D:\CodexTools\assistant-animation'
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File "$tools\Start-ComfyUI.ps1"
```

资源检查通过后在浏览器打开 `http://127.0.0.1:8188`。Krita 入口为 `D:\CodexTools\assistant-animation\tools\krita-5.3.4\krita-x64-5.3.4\bin\krita.exe`。

检查安装和服务状态不调用 DeepSeek，也不出图：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File "$tools\Workbench.ps1" -Command doctor
```

制作离线动作计划：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File "$tools\Workbench.ps1" -Command plan -Action wave
```

允许一次低用量 DeepSeek 草案：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File "$tools\Workbench.ps1" -Command plan -Action wave -DeepSeek
```

动作可选 `idle`、`wave`、`nod`、`thinking`、`bow`、`cheer`、`yawn`。Node 和仓库位置保存在本机 `workbench.json`，改变目录后更新此文件；不需要复制模型或重建动作规范。仓库内也可使用 `npm run animation:workbench -- plan wave`。

停止本次安装管理的后台，不影响其他 Python 程序：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File "$tools\Stop-ComfyUI.ps1"
```

## 工作流和美术门禁

1. `plan` 从 `motion.ts` 读取动作阶段和 15fps 制作预算，并绑定原中立参考图摘要。它不会更改旧 PNG、原动作时长或生产播放器。
2. 输出在 `jobs\动作名\plan.json` 和 `keyframe-workflow.api.json`。后者是 API 格式的固定参数模板，不会自动提交执行。用 Krita 准备同一 768px 画布的 `reference-neutral.png`、`动作名-pose.png`、`动作名-lineart.png`，在 ComfyUI 输入目录或 UI 中选择。参考图采用不透明纯色背景；OpenPose 输入必须为正确骨架引导图，不能把普通人物图当骨架。线稿引导须对应该关键姿态；本轮没有安装自动姿态/线稿预处理节点。
3. 模板固定原角色描述、基础模型、seed、IPAdapter 0.7、OpenPose 0.85、Lineart 0.9、20 步和 img2img denoise 0.3。这些是初始参数，不是身份一致性的保证。先制作少量关键帧，必要时人工修正；不要为每一中间帧重新随机文生图。大姿态变化可能需分段准备来源关键帧，不盲目提高 denoise。
4. 每个关键帧对照原版看眼睛、头身比、服装、肢体数、手型和遮挡。任一明显形变即退回修图，DeepSeek 文本不能替代视觉检查。
5. 关键图通过后，可用本地 RIFE 传播过程，或用 hold 保留已经制作/修整的完整 PNG。RGB 与 alpha 必须一致，所有实际过程仍需审查；RIFE 不会自动纠正坏关键图。旧生产 v6 的灰色手掌和双轮廓记录不改写，不能只用高帧率掩盖重影。
6. ComfyUI 绘图输出默认是 RGB PNG，不等同于透明 PNG。抠图、去色溢、静区像素保护、固定裁剪和脚底对齐后，检查全部浅/深底帧、放大边缘、半速/正常速循环、首尾中立。新素材的关键图许可、实际帧范围和最终许可分别绑定摘要，不复用旧 v6 所有者特定确认。
7. 仅在新素材技术、美术与真实浏览器播放通过后，才接入图集和生产播放器。`plan.json` 始终标为 `DRAFT_REQUIRES_ART_REVIEW`，`renderAllowed` 和 `deployAllowed` 为 false；本地计划不是发布授权。

目前没有安装或执行 LoRA 训练、EbSynth、ToonCrafter 或自动全流程抠图。已用内置 imagegen 制作少量挥手候选，未用本地联合流程生成新人物；通用 SD1.5 不保证直接复制原角色。换新角色可复用动作过程、参数模板和检查流程，但仍需自己的参考图、引导图与完整视觉验收。

## v8 挥手制作历史

旧 `wave-keyframes-v7` 肩部接缝拒收记录保留；新包为 `docs/assistant/wave-keyframes-v8/`。本轮内置imagegen五次参考编辑，选用三张新姿态并复用原中立/v7胸前姿态，保留两张拒收来源及实际提示词。肩线与展开手掌初审通过，关键帧许可只绑定五张图的像素摘要，没有新增DeepSeek调用，也未运行ComfyUI人物制图。

以五张姿态制作两组33帧、约15fps的本地RIFE样片：RGB/独立alpha和单绿幕调色板拟合。两组头脸/躯干中间/靴子严格保留原PNG像素、固定画布/脚底，但活动区仍有残影和皮肤透明度问题，技术与完整过程美术均拒收；不得发布。临时文件与浏览器临时目录在D盘，资源检查时C盘约8.2GiB、空闲内存约7.7GiB，ComfyUI保持停止。

查看新包 `preview.html`、全部浅深底联系表和 `review/visual.json`。下一步补低位准备到胸前的真实中间姿态，减少大跨度，并继续验证颜色/alpha一致传播；不能将33个输出帧称为33张独立绘制。新图真实来源为1254px，使用统一比例，不能按工具1280px显示预览裁切。现有生产应用和旧v6已知缺陷记录不变。

新增制作脚本、资源门禁、实际来源与像素摘要测试后，152项单元测试通过；当前样片的非零补帧退出码是拒收门禁生效，不应强制改为成功。清理只删除明确可再生成的两处缓存，遇到完整`.next`里的依赖链接时拒绝跟随，详见新包清理记录。

## DeepSeek 用量和密钥边界

本地规划使用 `deepseek-flash`、关闭 thinking、最多 1024 输出 token；每个未缓存任务一次请求、UTC 每日最多四次尝试，不自动重试。相同动作规范与参考图命中缓存；失败也占尝试额度。供应商返回的 token 用量在验证草案前登记，网络失败时无法证明零计费。

密钥仅从已有进程环境 `DEEPSEEK_API_KEY` 读取，不写进配置、浏览器、工作流 JSON、日志或仓库。ComfyUI 启动时剥离继承的 API 密钥、令牌和密码，禁用付费 API 节点、自动浏览器启动和非白名单扩展；只启用审查后的 IPAdapter 节点。DeepSeek 不能选择执行命令、模型路径、动作时序或自动放行美术。

`state\usage-日期.json` 保存次数和用量，`jobs` 保存本地文本草案。草案只含动作信息，不上传博客内容或角色图片；不要把私人内容加入动作提示词。若进程异常终止留下 `state\deepseek.lock`，先确认没有规划命令仍在运行，再手动移除这个空锁目录，不能随意删除整个 state 目录。

## 已完成验证

2026-10-05 安装包和五个 safetensors 权重摘要校验通过。ComfyUI 仅在 loopback 监听；Torch 识别 RTX 2070，基础合成图约 12 秒、IPAdapter 加两 ControlNet 的联合合成图约 18 秒完成。测试使用工具自己生成的简单圆形，不是新角色或原版美术验收。两个结果保存于本机 `reports`，未改生产素材。

一次真实 DeepSeek 草案消耗 248 输入、525 输出 token；后续相同任务复用缓存，没有额外请求。工作流和安全单元检查已纳入仓库测试，141 项全部通过；新增脚本 lint、PowerShell 语法、受管进程停止和资源不足拒绝启动通过。软件安装完成，但当前资源保护下不继续绘图。

来源：[ComfyUI 独立版](https://docs.comfy.org/installation/comfyui_portable_windows)、[ComfyUI 本地 API](https://docs.comfy.org/development/comfyui-server/comms_routes)、[Krita](https://krita.org/en/download/)、[IPAdapter Plus](https://github.com/cubiq/ComfyUI_IPAdapter_plus)、[RIFE](https://github.com/nihui/rife-ncnn-vulkan)、[DeepSeek 请求接口](https://api-docs.deepseek.com/api/create-chat-completion/)。版本和摘要以本次固定下载来源为准，升级后须重新验证。
