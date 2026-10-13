# Isle

基于 janhq/jan，保留原项目 MIT 许可。个人 fork：<https://github.com/wayne-xw6/jan>。

## 使用

1. 打开“导入 / 下载模型”，导入聊天 GGUF 和 embedding GGUF。
2. 左侧选择“个人知识库”，输入名称并选择 embedding 模型。
3. 导入 TXT、Markdown、PDF、DOCX 等文档。扫描 PDF 需先 OCR。
4. 输入问题，点击“检索片段”查看来源、片段和相似度；或选择本地聊天模型并点击“基于知识库回答”。
5. 换 embedding 模型或修改检索前缀时，点击“按所选模型重建索引”。失败保留原索引；成功才切换。知识库固定使用建立索引时的模型，不受全局默认模型切换影响。

文档提取后的文本存入个人数据目录，重建不依赖原文件继续存在。每次导入或移除会重建该库，适合个人中小规模资料；大型库的增量更新、OCR、多模态检索和多轮问答历史尚未实现。当前问答是一问一答，普通 Jan 聊天仍保留。

## 模型

模型加载、tokenizer、embedding 和聊天均由 Jan 的内置 llama.cpp 引擎管理，本功能不启动额外 llama-server，不配置第二个服务端口。

- bge-m3：使用与当前内置 llama.cpp 兼容的 GGUF；本版使用 dense 向量检索，不提供其 sparse / ColBERT 检索。通常无需检索前缀。
- EmbeddingGemma 2：允许导入兼容 GGUF，但具体兼容性取决于 Jan 锁定的 llama.cpp 构建。未以实际权重验证前不宣称兼容；模型卡：<https://huggingface.co/google/embeddinggemma-2>。
- 其他 embedding GGUF：支持模型选择和动态维度，需模型被 Jan 识别为 embedding，且能生成有效非零向量。
- 查询、文档前缀分别配置；请按对应模型卡填写。更改前缀同样需要重建。
- 不要在原模型 ID 下直接覆盖 GGUF 权重；新权重以新 ID 导入并重建索引。

## Windows 安装版与便携版

安装版：运行 NSIS `*-setup.exe`。个人版应用标识及配置根目录与原 Jan 隔离；禁止从 Jan 官方更新源覆盖个人版。

便携版：解压整个 `Isle-*-portable.zip`，双击 `Isle.exe`。必须保留同目录的 `portable.flag`、`resources`、bun.exe、uv.exe。数据和 WebView2 profile 保存于解压目录的 `data` 内。移动前完全退出应用，再移动整个文件夹。

模型可在应用内下载，或从设置导入。外部导入模型引用原路径；跨盘或跨电脑移动时需重新导入，或使用应用管理的下载模型。Windows 凭据不能保证跨 Windows 用户迁移。目标系统需有 WebView2 Runtime；安装版可下载安装，便携版使用系统已有 Runtime。模型权重不随 ZIP 分发。

## 构建

依赖：Node.js 22、Yarn 4.5.3、Rust、MSVC C++ 工具、CMake、Ninja、Git Bash、make；GPU 通用版本使用 Vulkan SDK。

GitHub Actions：手动运行 `Personal Windows packages`，成功后下载 `Isle-Windows-x64` artifact，内含安装 EXE、便携 ZIP、SHA256SUMS。构建使用本 fork 的源码和内置引擎，不依赖上游签名证书，产物未做 Authenticode 签名。

本地（具备工具链的 Git Bash）：

```sh
corepack enable
corepack prepare yarn@4.5.3 --activate
make build JAN_ENGINE_VARIANT=vulkan
powershell -File scripts/package-personal-windows.ps1
```

验证：

```sh
yarn vitest run --project @janhq/web-app web-app/src/lib/__tests__/knowledge-domain.test.ts web-app/src/lib/__tests__/knowledge.test.ts
yarn build:web
```

发布前还需实际验证：选择兼容的 embedding 与聊天权重；导入中文文档；检索命中；基于引用回答；切换 embedding 并重建；退出重开；便携目录移动；全新 Windows 安装 / 卸载。
