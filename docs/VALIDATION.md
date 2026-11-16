# 3.1.0 验证记录

验证日期：2026-11-17（北京时间）。本地 Node.js v26.13.0。

`node scripts/test.cjs`：**10/10 检查通过**，包括确定性构建与语法检查，以及以下 9 组测试：

| 测试文件 | 主要覆盖 |
| --- | --- |
| identity-quota-drive.test.cjs | 数字片名、年份、错片排除、429/509、限额、网盘核验 |
| manifest-regression.test.cjs | 清单、分页、附件关联、替换中断、导入互斥 |
| media-upload-ui.test.cjs | 影视类型/季集、整理计划、字幕状态、上传恢复记录 |
| platform-completion.test.cjs | 各平台启动、Token 捕获、当前目录、跨盘接口、停止、同名保护 |
| subtitle-efficiency.test.cjs | 整季复用、缓存隔离、缺集更新、来源补查 |
| subtitle-encoding.test.cjs | UTF-8/UTF-16/GB18030、拒绝非字幕正文 |
| subtitle-log-regression.test.cjs | &/and、实际资源名、冷却等待、授权错误中断 |
| subtitle-selection.test.cjs | 文件列表、双语简繁优先、指定文件下载 |
| subtitle-stability.test.cjs | 分页、候选上限、可信别名、下载链接刷新 |

平台补齐测试确认：

- fetch 字符串、Request/Headers、XHR 都能捕获凭证；刷新后的凭证会被读取；网页原请求继续执行。
- 百度和 123 直接粘贴清单后，使用各自接口和当前目录，未调用光鸭路径。
- 光鸭状态码 147 会继续轮询，省略 code 的正常响应可用。
- 创建任务响应丢失时只提交一次，不自动重复创建。
- JSON 停止后不发送后续网络请求；普通光鸭导入同名同内容跳过、同名不同内容不提交。
- 三个平台都有 JSON 面板；123/光鸭启动影视与字幕面板；请求观察在 DOM 就绪前安装。

效率回归中的 136 个文件名配合模拟整季资源：13 次搜索、123 次整季复用。Love, Death & Robots 的已记录第 1–4 集资源名回归：1 次搜索、3 次复用。这些是模拟输入的请求计数，不是承诺真实网络速度或成功率。

验证为本地生产函数、合成字幕正文、模拟 API 和 DOM；没有安装到浏览器，也没有对真实网盘执行上传、改名或删除。外部接口和用户登录状态需要在实际使用中确认。
