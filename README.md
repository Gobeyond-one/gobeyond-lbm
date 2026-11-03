# 格流 LBM · GoBeyond

LBM 求解器产品展示网站，包含程序化 CAD/STL 示例、参数预览、真实 LBM 格点与 IBM 节点、搅拌流场启动回放以及其他物理模块的实际结果。

这是可独立托管的纯静态网站，不依赖 ChatGPT、OpenAI 登录或外部脚本 CDN。Three.js、几何文件、流场记录与图片均随站点提供。三维动画在浏览器中绘制；网站不提交新的求解任务。

## 本地预览

在本目录运行 `python3 -m http.server 8788`，访问 `http://127.0.0.1:8788/`。

## GitHub Pages

仓库 Settings → Pages → Build and deployment：选择 Deploy from a branch，分支 main，目录 /(root)。`.nojekyll` 保证这些文件直接作为静态内容发布。

更新静态文件并推送 main 后，GitHub Pages 会自动发布。几何、脚本与结果均使用相对路径，支持仓库子路径访问。

## 数据说明

包含两套真实 CAD 文件、243 × 250 × 250 的保存网格、218438 个 IBM 节点、从静止开始的 28 帧流场记录和 8 组既有模型结果。回放压缩了帧间时间，以界面的物理时间读数为准。参数调整仅更新几何预览与导出的参数，不会重算网格或流场。

第三方 Three.js 许可证见 `assets/vendor/LICENSE.three`。算例来源记录见 `assets/case-provenance.json`。
