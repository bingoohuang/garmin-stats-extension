# Garmin 运动统计 Chrome Extension

一个无构建步骤的 Manifest V3 扩展，直接读取已登录的 Garmin Connect China 当前活动页数据并生成运动统计。

![](snapshots/2026-07-14-15-50-15.png)

## 功能

### 1. 运动统计

- 默认展示本月跑步统计，跑步与骑行可多选；双选时统计内容左右并列展示。
- 支持本月和本周（周一至周日）两个统计周期。
- 展示累计里程、活动次数、运动天数、累计时长、累计爬升、平均配速或平均速度。
- 提供每日里程、每日时长柱状图，可切换图表指标并通过键盘查看每日数据。
- 点击浏览器工具栏中的扩展图标，可以打开完整统计弹窗。
- 在 Garmin 活动列表页右下角显示悬浮图标，点击后可直接展开统计面板。
- 手动刷新失败时保留当前数据，并提供活动页未打开、空数据和页面读取错误状态提示。

### 2. 活动 ID 展示及详情链接

- 在 `https://connect.garmin.cn/app/activities` 活动列表中，将“活动ID”添加到“距离”指标之前。
- 活动 ID 从每条活动原有的详情地址中自动提取，无需额外请求接口。
- 点击活动 ID，会在新的浏览器标签页中打开对应的 Garmin 活动详情：

  ```text
  https://connect.garmin.cn/app/activity/{活动ID}
  ```

- 支持 Garmin 单页应用的路由切换、筛选、排序、分页和虚拟列表行复用；活动列表重新渲染后会自动补充或更新 ID。

## 安装

1. 打开 `chrome://extensions/`。
2. 开启“开发者模式”。
3. 点击“加载已解压的扩展程序”。
4. 选择本目录 `garmin-stats-extension/`。
5. 确保当前标签页已打开并登录 `https://connect.garmin.cn/app/activities`，再点击工具栏中的扩展图标。

从旧版本更新到 `1.2.1` 时，需要在 `chrome://extensions/` 中点击一次扩展的“重新加载”，然后刷新 Garmin 活动页。

扩展只申请 `connect.garmin.cn` 的站点访问权限、`scripting` 和 `storage` 权限。`scripting` 只用于读取已打开活动页中当前渲染出来的可见活动数据；浏览器本地只保存已选运动类型与月/周偏好，不保存活动明细或汇总数据。扩展不请求 Garmin 内部活动接口，数据也不会发送到第三方服务。

## 数据来源

扩展只解析 Garmin 活动页当前已经渲染的活动列表，不调用 Garmin 活动接口。若当前列表尚未向下滚动加载到统计周期开始日期，统计只包含页面上已经加载并可见的记录；继续向下滚动活动列表后再刷新即可扩大统计范围。

## 测试

```bash
cd garmin-stats-extension
npm test
```

## 文件结构

```text
manifest.json        Manifest V3 配置
background.js        当前活动页读取、汇总与错误处理
popup.html/css/js    扩展弹窗界面与交互
activity-widget.js   Garmin 活动页右下角悬浮统计面板
visual-fixture.js    普通浏览器中的视觉校验模拟数据
lib/garmin-tab.js    读取已登录 Garmin 活动页当前可见数据
lib/dates.js         本月/本周日期边界
lib/stats.js         活动标准化、聚合与格式化
tests/               Node 内置测试
icons/               扩展图标
```
