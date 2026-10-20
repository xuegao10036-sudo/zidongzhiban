// 自动制版 宿主脚本冒烟测试（无需 Illustrator）
// 用法: node zidongzhiban/tests/jsx-smoke.js
// 作用: 在 vm 沙箱里加载 jsx/zhiban.jsx，验证 ①顶层不再自执行 ②两个入口的契约
//       ③返回值是可解析 JSON ④zbStringify 对中文/控制字符的处理。
const fs = require("fs");
const vm = require("vm");
const path = require("path");
const jsxPath = path.join(__dirname, "..", "jsx", "zhiban.jsx");

const code = fs.readFileSync(jsxPath, "utf8");
const sandbox = {
  app: { documents: [], activeDocument: null },
  $: { evalFile: function () {} },
  File: function () {}, Folder: function () {}, Window: function () {},
  alert: function () { throw new Error("不应调用 alert"); },
  JSON: undefined,
};
vm.createContext(sandbox);
vm.runInContext(code, sandbox, { filename: "zhiban.jsx" });

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; } else { fail++; console.log("  FAIL: " + msg); } }
function jsxSrcCount(s) { return code.split(s).length - 1; }

ok(typeof sandbox.zbStringify === "function", "zbStringify 已定义");
ok(typeof sandbox.zbPrecheck === "function", "zbPrecheck 已定义");
ok(typeof sandbox.zbRun === "function", "zbRun 已定义");
ok(typeof sandbox.levelFromResult === "function", "levelFromResult 已定义");
ok(sandbox.ZB_BUILD === "0.9", "ZB_BUILD = 0.9");
ok(!/function getBeforeSnapshotBounds/.test(code) && code.indexOf("getSnapshotBounds") !== -1, "step0 双扫描已合并（旧函数定义已删）");
ok(code.indexOf("outlineFailTexts") !== -1, "转曲失败已补日志");
ok(jsxSrcCount("对照-处理前(请勿编辑)") === 1, "对照层名只在 CONFIG 定义一处");
ok(jsxSrcCount("蒙版-自动生成") === 1, "蒙版层名只在 CONFIG 定义一处");
ok(code.indexOf("以便生成处理前对照并查找同目录参考文件") === -1, "V0.7 未保存硬阻断文案已移除");
ok(code.indexOf("empty path") === -1, "V0.7 step0 空 path 硬校验已删");
ok(code.indexOf("不再因文档未保存（doc.path 为空）硬阻断") !== -1, "V0.7 step0 降级说明注释在位");
ok(code.indexOf("写入自检报告") === -1, "报错文案不再提『写入自检报告』（V0.2 已不写报告）");
ok(code.indexOf("catch (e4) {}") === -1, "拆层 move 空 catch 已补日志");
ok(typeof sandbox.app.documents === "object", "app 未被意外改动");

// 不再落盘报告文件：整套写入器必须已删除
ok(typeof sandbox.writeReport === "undefined", "writeReport 已删除");
ok(typeof sandbox.writeHtmlReport === "undefined", "writeHtmlReport 已删除");
ok(typeof sandbox.classifyLogLine === "undefined", "classifyLogLine 已删除");

const preObj = JSON.parse(sandbox.zbPrecheck());
ok(preObj.ok === false, "zbPrecheck 无文档时 ok=false");
ok(typeof preObj.error === "string" && preObj.error.length > 0, "zbPrecheck 返回可读错误");
ok(preObj.build === "0.9", "zbPrecheck 回传 build");

const runObj = JSON.parse(sandbox.zbRun("标签", 0, 100, 50));
ok(runObj.ok === false, "zbRun 无文档时 ok=false");
ok(runObj.canExport === false, "zbRun 无文档时 canExport=false");
ok(Array.isArray(runObj.log), "zbRun 回传 log 数组");
ok(runObj.reportTxt === undefined && runObj.reportHtml === undefined, "zbRun 不再回传报告路径");

// 分级只看受控"结果词"，不受详情文字干扰（回归 P0-③：详情里出现"异常"二字不再误判）
const lv = sandbox.levelFromResult;
ok(lv("已自动修正") === "fixed", "结果词 已自动修正 → fixed");
ok(lv("待人工确认") === "review", "结果词 待人工确认 → review");
ok(lv("异常") === "hold" && lv("已暂停") === "hold", "异常/已暂停 → hold");
ok(lv("已记录") === "pass", "普通结果词 → pass");
ok(lv(undefined) === "pass", "空结果不抛错");

// log 落笔即为结构化对象：text 含前缀、level 只由"结果词"判定
// 回归 P0-③：详情里出现"异常"二字，不得把级别带成 hold
const logFn = sandbox.log;
sandbox.LOG = [];
logFn("Step9-导出前校验", "已完成", "详情里提到异常二字");
logFn("Step9-导出前校验", "待人工确认", "");
ok(Array.isArray(sandbox.LOG) && sandbox.LOG.length === 2, "log 写入 2 条");
ok(sandbox.LOG[0] && typeof sandbox.LOG[0] === "object", "log 条目是对象");
ok(sandbox.LOG[0].text === "[Step9-导出前校验] 已完成：详情里提到异常二字", "log 条目 text 带步骤前缀与详情");
ok(sandbox.LOG[0].level === "pass", "详情含'异常'不污染级别");
ok(sandbox.LOG[1].level === "review", "log 条目 level 正确");

const so = JSON.parse(sandbox.zbStringify({ t: "专色「刀线」\n第二行\u0008x", n: 3, b: true, z: null, arr: [1, "两"] }));
ok(so.t.indexOf("刀线") >= 0 && so.t.indexOf("\n") >= 0, "zbStringify 保留中文与换行");
ok(so.n === 3 && so.b === true && so.z === null && so.arr[1] === "两", "zbStringify 基础类型正确");

// ---------- V0.6：本轮修复断言 ----------
ok(code.indexOf("textRange.characterAttributes.fillColor") !== -1, "P1-3 文字专色改从 textRange 收集");
ok(code.indexOf("findMatchingRefFile.matchType") !== -1, "P1-6 参考文件匹配分档标记存在");
ok(code.indexOf("对应关系请人工判断") !== -1 && code.indexOf("是否对应本文件请人工判断") !== -1, "P1-6 两个调用方区分『唯一近似』措辞");
ok(code.indexOf("自动修正未生效") !== -1, "P0-4 step5 修正失败落 hold（写后核验分支存在）");
ok(code.indexOf("读取/设置规格线路径") !== -1, "P0-4 step5 空 catch 已补日志");
ok(code.indexOf("V0.6（移植自") === -1 && code.indexOf("面板版本：V" + sandbox.ZB_BUILD + "（移植自") !== -1, "P2-9 jsx 头注释版本与 ZB_BUILD 同步（V" + sandbox.ZB_BUILD + "）");

// ---------- V0.9：待确认标记层（方案B）----------
ok(jsxSrcCount("待确认-自动标记") === 1, "V0.9 标记层名只在 CONFIG 定义一处");
ok(typeof sandbox.markItem === "function" && typeof sandbox.buildMarkLayer === "function", "V0.9 markItem/buildMarkLayer 已定义");
ok(code.indexOf("人工核对完成后请手动删除该图层") !== -1, "V0.9 标记层删除提示在位");
ok((code.match(/markItem\(/g) || []).length >= 6, "V0.9 五处待确认来源已接 markItem（1 定义 + ≥5 调用）");
ok(code.indexOf("buildMarkLayer(doc); // V0.9") !== -1, "V0.9 buildMarkLayer 在 step9 定级前调用");

// P2-6：跨文件版本一致性（面板版本 ↔ index.html .ver ↔ JSX/ZB build）
const mainSrc = fs.readFileSync(path.join(__dirname, "..", "js", "main.js"), "utf8");
const htmlSrc = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const mPanelVer = mainSrc.match(/PANEL_VER = "(V[\d.]+)"/);
const mHtmlVer = htmlSrc.match(/<span class="ver">(V[\d.]+)<\/span>/);
ok(!!mPanelVer && !!mHtmlVer && mPanelVer[1] === mHtmlVer[1],
  "P2-6 PANEL_VER 与 index.html .ver 一致（" + (mPanelVer ? mPanelVer[1] : "?") + " / " + (mHtmlVer ? mHtmlVer[1] : "?") + "）");
const mJsxBuild = mainSrc.match(/JSX_BUILD = "([\d.]+)"/);
ok(!!mJsxBuild && mJsxBuild[1] === sandbox.ZB_BUILD, "P2-6 JSX_BUILD 与 ZB_BUILD 一致");
ok(htmlSrc.indexOf("?v=") !== -1 && htmlSrc.indexOf("20261009e") === -1, "P2-6 index.html 缓存戳已更新");

console.log("result: " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
