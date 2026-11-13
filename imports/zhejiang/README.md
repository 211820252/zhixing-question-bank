# 浙江生物真题导入

从用户提供的18份Word资料导入514题，424道选择题、90道大题，年份覆盖2017至2026（仅包括所提供文件，不代表所有场次）。详细场次、题数和原文件名见 [manifest.json](manifest.json)。2024年1月原文件共24题；没有人为补造第25题。

题干、选项、答案及解析保留原始图表、上下标与表格；Word版式转换为网页后移除字体颜色等可能提示答案的格式。共用材料会出现在每道关联题之前，分组答案与详解已按题号拆开。原898题的文件与ID未改动，新题ID固定为 `zj-年份-月份-q题号`，不依赖排序或题干文本。

2018年4月的本地Word仅有答案解析，缺少题干。题干使用新浪教育同期转载、注明浙江省教育考试院来源的原卷图片逐题恢复，答案解析来自用户提供的Word。选择按钮对应原卷图中的A/B/C/D，图版题干没有用不可靠OCR重写。恢复过程、网页出处与逐题裁剪信息见 [恢复记录](2018-04-recovery.md)、[网络来源](2018-04-web-sources.json)、[裁剪清单](2018-04-crops.json)。

## 重建

运行网站无须原Word或Python。以下是维护时重新整理原资料的流程：

1. 用 LibreOffice 将18份Word转换为HTML（保留配套图片），放入 `.work/html/zj-YYYY-MM.html`，来源键见 [sources.json](sources.json)。原Word与转换临时文件不随网站发布。
2. 安装Python依赖 `lxml`。执行 `python3 scripts/build-zhejiang-bank.py`，会按题号与已审核边界提取、净化HTML、复制图片并校验覆盖，生成 `zhejiang-data.js` 与清单。2018年4月的已审核恢复输入保存在 `2018-04-questions.json`。
3. 执行 `node scripts/build-standalone.mjs`，更新包含所有图片的单文件离线版。

校验包括18套题号连续覆盖、ID唯一、选择题选项与答案格式、题干不泄露答案标记、HTML白名单、图片存在，以及原题库的校验值。使用 `python3 scripts/test-zhejiang-modern.py` 可额外核对近11套原始文本、图表守恒和共用材料归属（需 `Pillow`）。四处人工核对与勘误见 [corrections.json](corrections.json)，页面作答后会显示相应来源。修改原文件或解析逻辑后仍应抽查图表与子问，不应只依赖自动校验。
