# GitHub 进度同步

公开站点继续使用现有仓库 `211820252/zhixing-question-bank`，默认将进度写到 `progress` 分支的 `progress/personal.json`（需要仓库内已存在此分支）。**该仓库公开，因此进度文件和 Git 提交历史也公开。** 题库源码中没有令牌；每台设备独立配置自己的令牌。

## 每台设备的设置

1. 打开网页的“同步到我的仓库”，点击“去 GitHub 创建专用令牌”。仓库、分支、文件路径均已固定，不需要填写。
2. 在 GitHub 创建 **fine-grained personal access token**，Resource owner 选择 `211820252`；Repository access 选择 **Only select repositories**，仅勾选 `zhixing-question-bank`。
3. 设置有效期，Repository permissions 仅开 **Contents: Read and write**（Metadata 由 GitHub 自动附带）。创建链接预填名称、owner 和 Contents 权限，仍须手动核对仓库选择。
4. 将令牌粘贴进页面，点击“连接并同步”。默认记住设备，以后点击“同步到我的仓库”直接同步，答题后也自动保存。其他设备首次连接一次即可。当前共享文件适用于同一用户。

默认勾选“记住这台设备”，令牌保存在本站点的 `localStorage`，因此不需要每次重新连接；取消勾选则仅放在 `sessionStorage`。点击“同步设置”可断开，断开会删除两处令牌。令牌不写入进度状态、云端 JSON或日志。公共设备请勿记住令牌，使用后手动断开。令牌可以在 GitHub 随时撤销。

## 保存与冲突

本地应用继续使用旧键 `zhixing-practice-v1`；同步元数据保存在独立键 `zhixing-github-progress-v2`。未配置令牌和离线时均可照常练习。本地导入、导出按钮已移除，页面只提供GitHub同步。变更后等待 1.5 秒自动同步；重新联网、页面重新可见或聚焦时再次拉取。网络或权限失败会显示状态并保留本地进度，可在设置中再次点击同步重试。

每轮同步先验证仓库、GET 云端、合并，再用 GitHub Contents API 的最新 SHA（GET `ref=progress`，PUT `branch=progress`） 执行 PUT；并发 409/422 会重新 GET 并重试，最多三次。进度写入单独的 `progress` 分支，不触发以 `main` 为源的 Pages 构建。首次文件不存在时创建文件，不把仓库不可访问的 404 当成空进度。云端格式不合法时停止写入。大于 1 MB 的文件使用 raw 媒体类型读取，避免空 content 被误作空数据。

- 答题统计：旧聚合记录作为最大基线，新增尝试按每个页面实例的独立累加计数合并；合并同一计数不会重复增加，两个设备的新增答题均保留。
- 错题与收藏：每题保存含逻辑时钟的布尔值，包括删除墓碑；旧设备或旧格式文件里的列表不会覆盖更新的删除。
- 本轮题目：轮次选择使用最新逻辑时钟，同轮按题目合并答案及草稿。字母答案、多选字母串、主观题 `{revealed:true,correct:boolean}`、仅揭示参考答案 `{revealed:true}` 均原样保留。新轮次不会混入旧轮答案。
- 时钟：使用观测到的最大时间及逻辑计数，同一时钟通过随机实例 ID 稳定裁决。实际未互相观察且系统时间严重偏移的设备，设置或收藏的先后顺序可能与用户实际时间不同。
- 兼容：接受原版 `{version:1,records,wrong,saved,session,...}` 文件。旧聚合备份没有尝试标识或删除时间，无法推断不同旧备份的全部独立答题历史；以较大基线保留统计。请保留同步元数据；清空浏览器后将已同步的聚合备份重新迁移，可能无法精确识别其中与云端增量重复的次数。

## 集成接口与测试

页面依次加载 `app.js`、`sync.js`，同时引用 `sync.css`。同步模块自行向 `.data-actions` 注入按钮和可键盘操作的原生 dialog，无构建依赖。

应用提供：

```js
window.zhixingProgress = {
  exportState(),                          // 返回JSON可序列化状态
  applyState(state, {notify:false}),       // 归一化、保存并刷新；默认不触发订阅
  subscribe(listener),                    // listener(state,{source}); 返回取消订阅函数
};
window.dispatchEvent(new Event('zhixing-progress-ready'));
```

可手动调用 `window.zhixingGitHubSync.openSettings()` 和 `.sync()`。纯合并与 Contents API 客户端可通过 `globalThis.ZhixingGitHubSyncCore` 测试，不需要真实令牌：

```sh
node --check sync.js
node scripts/test-sync.mjs
```

官方文档：[Contents API](https://docs.github.com/en/rest/repos/contents?apiVersion=2022-11-28)、[fine-grained 令牌及预填参数](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens)。
