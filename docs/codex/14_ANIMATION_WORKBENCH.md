# 助手动画本地制作工具

这套工具用于保留原角色的完整人物逐帧动画制作，不恢复分层拼装。软件和模型安装在 `D:\CodexTools\assistant-animation`，与生产博客、网站 DeepSeek 配置及数据库独立。DeepSeek 只生成动作草案；本地显卡制图须先通过资源检查，少量参考编辑也可使用内置 imagegen，实际工具必须分别记录。发布仍需美术和浏览器检查。

## 已安装工具

| 工具 | 用途 | 当前验证 |
| --- | --- | --- |
| ComfyUI 0.38.0 独立版 | 保存并重复执行绘图流程 | RTX 2070 GPU 出图通过 |
| SD 1.5 与 IPAdapter Plus | 基础绘图和参考图约束 | 安全权重摘要校验、联合推理通过 |
| ControlNet OpenPose 和 Lineart | 约束姿态和轮廓 | 两个模型同时加载和推理通过 |
| Krita 5.3.4 便携版 | 修关键帧、准备姿态/线稿、透明边缘处理 | 下载摘要、有效程序签名及版本检查通过；未开展本轮人工修图 |
| RIFE 4.6 NCNN Vulkan | 传播关键帧之间的过程 | 从已有验证工具复制，保留摘要；本轮没有制作新人物补帧 |
| DeepSeek 动作规划入口 | 从七动作规范生成结构化草案 | 一次真实调用通过，重复任务命中缓存 |

固定版本、下载来源和 SHA256 在 `docs/assistant/animation-workbench/toolchain-lock.json`。工具与约 8.3GB 权重留在 D 盘，不提交到 Git；包括下载包的整个目录约 14.5GiB。全局 Python、Windows 服务、启动项和生产环境均未改变。

## 资源要求和当前状态

本机为 RTX 2070 8GB 显存、约 16GB 内存。先使用 512px、单张批次和短采样验证；正式计划固定 768px 画布、20% 留白和原脚底锚点，不承诺所有复杂流程都能同时常驻显存。

联合推理完成后检测到 C 盘仅余约 0.8GiB，并观察到系统分页文件占用较多空间。已停止这次启动的绘图后台，C 盘空闲回升至约 6.9GiB。这个现象说明多模型运行有明显内存/磁盘压力，不等同于把模型安装到 C 盘。没有删除用户文件或修改虚拟内存设置。

现在启动入口和命令行出图会检查系统盘至少有 **8GiB 空闲**、物理内存至少有 **4GiB 空闲**；不足时拒绝继续。这是保守的本机保护阈值，不是官方最低配置或所有工作流的成功保证。当前后台保持停止。正式制作前先腾出系统盘空间、关闭不用的应用；若需要将分页文件迁移到 D 盘，须另行确认，不能直接删除 `pagefile.sys`。直接使用第三方程序或手动提交 UI 工作流仍须自行观察资源，命令行检查不会拦截一切第三方操作。

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
5. 关键帧通过后使用现有 RIFE/PNG 工具传播中间过程。RGB 与 alpha 必须一致；旧挥手的灰色手掌和双轮廓仍是未解决问题。RIFE 不会自动纠正坏关键帧，不能只用高帧率掩盖重影。
6. ComfyUI 绘图输出默认是 RGB PNG，不等同于透明 PNG。抠图、去色溢、静区像素保护、固定裁剪和脚底对齐后，检查全部浅/深底帧、放大边缘、半速/正常速循环、首尾中立。现有 v6 审查和摘要绑定流程继续使用。
7. 仅在新素材技术、美术与真实浏览器播放通过后，才接入图集和生产播放器。`plan.json` 始终标为 `DRAFT_REQUIRES_ART_REVIEW`，`renderAllowed` 和 `deployAllowed` 为 false；本地计划不是发布授权。

目前没有安装或执行 LoRA 训练、EbSynth、ToonCrafter 或自动全流程抠图。已用内置 imagegen 制作少量挥手候选，未用本地联合流程生成新人物；通用 SD1.5 不保证直接复制原角色。换新角色可复用动作过程、参数模板和检查流程，但仍需自己的参考图、引导图与完整视觉验收。

## 当前挥手制作进度

离线包在 `docs/assistant/wave-keyframes-v7/`，含原中立和三张新姿态、全部五次内置 imagegen 提示词、两个拒收的初始候选、浅/深底整图和手臂放大图。使用缓存挥手计划，没有新增 DeepSeek 调用。静区保护与固定脚底是离线整图处理，未恢复运行时分层模型。

技术检查通过不等于可用动画：肩部接缝仍未达到严格美术标准，视觉报告为 `REJECTED`，不得传播或发布。下一步先修准备/张掌的肩线并补手掌展开中间关键帧；新摘要下复核通过后才做 15fps 补帧、全帧 RGB/alpha 和浏览器播放检查。现有生产应用不变。

本次复查 C 盘约 7.0GiB、空闲物理内存约 9.2GiB；系统盘仍不足启动阈值。没有启用 ComfyUI、修改分页文件或删除用户数据。关键帧原始生成实际为 1254px，按统一比例缩放登记，不能根据工具显示预览的 1280px 尺寸直接裁切。

## DeepSeek 用量和密钥边界

本地规划使用 `deepseek-flash`、关闭 thinking、最多 1024 输出 token；每个未缓存任务一次请求、UTC 每日最多四次尝试，不自动重试。相同动作规范与参考图命中缓存；失败也占尝试额度。供应商返回的 token 用量在验证草案前登记，网络失败时无法证明零计费。

密钥仅从已有进程环境 `DEEPSEEK_API_KEY` 读取，不写进配置、浏览器、工作流 JSON、日志或仓库。ComfyUI 启动时剥离继承的 API 密钥、令牌和密码，禁用付费 API 节点、自动浏览器启动和非白名单扩展；只启用审查后的 IPAdapter 节点。DeepSeek 不能选择执行命令、模型路径、动作时序或自动放行美术。

`state\usage-日期.json` 保存次数和用量，`jobs` 保存本地文本草案。草案只含动作信息，不上传博客内容或角色图片；不要把私人内容加入动作提示词。若进程异常终止留下 `state\deepseek.lock`，先确认没有规划命令仍在运行，再手动移除这个空锁目录，不能随意删除整个 state 目录。

## 已完成验证

2026-10-05 安装包和五个 safetensors 权重摘要校验通过。ComfyUI 仅在 loopback 监听；Torch 识别 RTX 2070，基础合成图约 12 秒、IPAdapter 加两 ControlNet 的联合合成图约 18 秒完成。测试使用工具自己生成的简单圆形，不是新角色或原版美术验收。两个结果保存于本机 `reports`，未改生产素材。

一次真实 DeepSeek 草案消耗 248 输入、525 输出 token；后续相同任务复用缓存，没有额外请求。工作流和安全单元检查已纳入仓库测试，141 项全部通过；新增脚本 lint、PowerShell 语法、受管进程停止和资源不足拒绝启动通过。软件安装完成，但当前资源保护下不继续绘图。

来源：[ComfyUI 独立版](https://docs.comfy.org/installation/comfyui_portable_windows)、[ComfyUI 本地 API](https://docs.comfy.org/development/comfyui-server/comms_routes)、[Krita](https://krita.org/en/download/)、[IPAdapter Plus](https://github.com/cubiq/ComfyUI_IPAdapter_plus)、[RIFE](https://github.com/nihui/rife-ncnn-vulkan)、[DeepSeek 请求接口](https://api-docs.deepseek.com/api/create-chat-completion/)。版本和摘要以本次固定下载来源为准，升级后须重新验证。
