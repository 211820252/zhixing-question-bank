# 知行题库

基于 `题目.txt` 整理的离线选择题练习页，共 898 道，覆盖教育学、心理学、教育政策与法规。包含章节筛选、顺序和随机练习、解析、错题、收藏、进度保存与导入导出。

在线使用：[知行题库](https://211820252.github.io/zhixing-question-bank/)（iOS、Windows 和 macOS 浏览器均可打开）。各设备的练习进度分别保存在当地浏览器，需要换设备时请使用页面中的导出与导入功能。

## Windows 直接使用

将 [知行题库-Windows直接打开.html](知行题库-Windows直接打开.html) 放到 Windows 电脑，双击即可在浏览器中打开，不需要安装软件或联网。练习进度保存在当前浏览器；更换电脑或浏览器时，先导出进度，再导入备份文件。

## iPhone 使用

页面已适配手机屏幕，iPhone 用 Safari 打开上方网址即可使用。直接从 iPhone“文件”应用打开本地 HTML 时，各浏览器对脚本和本地存储的支持不同，因此建议通过网址打开。

## 重新生成

```sh
node scripts/build-question-bank.mjs /path/to/题目.txt
node scripts/build-standalone.mjs
```

题目和解析保留原资料措辞。教育政策与法规部分含较早年份的材料，涉及现行规定时应另行核对。
