/*
  自动制版 —— CEP 面板宿主脚本
  运行环境：Adobe Illustrator（ExtendScript），由「自动制版」CEP 面板调用
  面板版本：V0.8（移植自「标签制版动作自动化插件」2026-09-10a 复杂版稳定优先 + 保线暂停版）
  入口：zbPrecheck() 只读预检（不修改文档）；zbRun(productType, specIndex, specWmm, specHmm) 执行制版
  返回：JSON 字符串（zbStringify 序列化），字段见两个入口函数末尾
  与原脚本的差异：①去掉全部原生弹窗（产品类型、主刀线确认已由面板承担）；
  ②新增只读预检供面板显示；③去掉 main() 自执行与结果的 alert，改为结构化回传面板；
  ④删除死代码（详见更新日志）；⑤不再落盘任何报告文件（.txt / .html 均取消），
  面板结果区即唯一报告；日志级别改为结构化字段（见 log / levelFromResult）。
  本轮仅改三项已确认问题：①Step0对照改为Illustrator内部栅格，不生成外部JPG文件；
  ②刀线边界改用geometricBounds，不把刀线描边宽度计入尺寸；
  ③补齐描边四色黑：支持全局Process色(SpotColor+ColorModel.PROCESS)，并处理裁切路径的可见描边。
  沿用2026-09-07a：空动作依赖已移除、真实剪切蒙版、已有CMYK单黑补叠印等逻辑均保留。
  08b复查修正：08a把共享边界函数整体改成geometricBounds会连带改变Step3清理边界；本版改为仅Step6蒙版使用几何边界，Step3保持07a原有visibleBounds清理逻辑。
  08c整合复查：已有单黑继续严格按C=0、M=0、Y=0、K=100判断，不加入额外数值容差；Step0复杂版面兼容性仅列为真机观察项，未据此改动现有栅格方案。
  08d仅修正四色黑80%边界：Illustrator面板显示为80.00%的内部浮点值（如79.9985）先按两位小数四舍五入，再按>=80%判断；单黑严格判断及其他逻辑不变。
  09a按2026-09-09会议记录新增三项确定规则：①复杂多层版面若不能保证分色搬层后视觉顺序不变，则不物理搬层，直接标记待人工确认；②同一文件存在多条“刀线”专色路径时不再合并尺寸，弹窗让操作员按实际尺寸确认主刀线；③蒙版容器最终置于图层最顶层，所有生产内容含刀线均纳入裁切，蒙版路径严格无填充/无描边，并在输出前再次核查。
  09b仅修两项本轮真机已确认问题：①Step6处理复杂版时，不在递归处理中提前恢复子图层锁定状态；统一记录全部生产图层/子图层锁定状态，蒙版建立和图层收纳完成后再恢复，避免“Cannot modify a layer that is locked”；②Step7保留原有候选检测条件，但本版只计数并写报告，不再复制对象/新增0.08mm候选描边，避免候选线跑到最终蒙版之外或影响版面尺寸。
  10a按最新确认“保线先放一边”：主流程完全不执行保线候选；复杂版稳定优先，任何检测到叠放风险的单层版面也自动保持源图层，不再提供“仍然拆层”选项；Step6新增处理前后图层顺序与对象几何范围核验，若蒙版动作导致位置/层级变化则立即停止。
  已确认：四色黑为C/M/Y/K四通道均 >=80%；标签单边出血1.5mm；礼盒单边出血2.5mm。
  本轮明确不改：Step0内部栅格方案、Step3隐藏内容业务规则、规格线尺寸数据库、JPG/AI自动套对、四色黑/单黑规则、Step8归类算法；保线主流程本轮完全暂停，不参与版面修改或导出判断。
  历史版本2026-09-05c曾依赖「动作集1」>「打开叠印预览」；收到.aia原文件后确认
  该动作 eventCount=0。本版不再调用、导入、改名或覆盖甲方现有动作集。
  历史版本：2026-09-05（甲方书面确认蒙版/黑色叠印/图层顺序三条规则后更新：①Step6建蒙版之前
  用画板边界+出血算红线位置，跟Step3的清理边界基准不统一——书面确认"刀线+出血距离=蒙版线"
  后，改成Step6也复用getBoundaryFromSpecLine，两处统一用刀线做基准；②四色黑判定阈值
  ">="还是">"存在书面说法(">80")跟真机视频演示(K=80需要转换)的冲突，未擅自定论，代码
  暂保留">="以覆盖视频里的真实数据，已列为待甲方最终澄清项；③"图层顺序需与源文件视觉
  一致"的书面表述比之前"跟JPG一致"的说法更明确，理解为"处理前后AI文件本身视觉一致"
  （不是要脚本认JPG图片内容），这个方向已经被之前的分色顺序保留、垫白核对前置等修复
  覆盖，待甲方确认这个理解是否正确）。
  版本：2026-09-04b（再次复查代码后修复：银卡垫白核对(whiteBaseCheck)原来排在Step2
  分色拆分之后执行，但Step2会把"白版"/"纳米版"图层里的对象按颜色搬到别的图层，垫白核对
  读到的时候这两个图层已经被搬空，会误判成"数量一致、通过"，实际根本没起到核对作用——
  现在把这个检查单独提到Step2之前执行；另外把"选产品类型"弹窗挪到try块内部，避免这一步
  本身出错时甩出原生错误框、跳过报告生成）。
  版本：2026-09-04（甲方确认命名规则后更新：①产品类型没有文件名规律，改为运行时弹窗
  让操作员手动选择"标签/礼盒"，不再永远按标签的3mm出血处理（这是之前唯一一个会静默算错、
  报告里毫无提示的问题）；②标版参考文件实际是跟AI文件同名的EPS文件，不是文件名带"标版"
  字样，查找逻辑改为按同名匹配，跟JPG小样共用同一套查找函数；③刀线统一叫"刀线"、纳米版
  统一叫"纳米版"，均与现有配置一致，未改动。
  历史修复(2026-09-03全面代码复查)：解锁动作挪到分色拆分之前执行（之前顺序反了导致锁定
  内容被悄悄跳过）；解锁同时覆盖图层本身；分色图层拆分顺序改为跟原稿从前到后对应（之前
  doc.layers.add()默认顶部插入会把顺序打乱）；刀线边界判断/叠印检测/保线候选补上复合路径
  (CompoundPathItem)。历史修复(更早)：历史版本曾将蒙版层级置底；四色黑转单黑补上复合路径）

  【这份脚本做什么】
  按照《标签制版操作指导》的步骤，依次对当前打开的 AI 文件做以下动作的自动检查/自动处理：
  Step0 将处理前版面在Illustrator内部栅格化后放入对照图层（锁定、不打印、45%透明度、默认隐藏；不生成外部JPG）
  Step1 文件预处理：颜色模式、画板尺寸、图片链接嵌入状态检查
  Step2 分色图层拆分：简单安全版面按专色/工艺色自动拆层；复杂版面无法保证视觉顺序时不物理搬层并标记人工确认
  Step3 解锁 / 取消隐藏 / 删除画板外多余对象 / 转曲（隐藏内容在这个早期阶段直接删除）
  Step4 清理未使用色板 / 专色命名规范化为 "PANTONE XXX C" 格式 / 四色黑自动转单黑并叠印、已有CMYK纯K100补叠印
  Step4b 文本框透明度核对（非100%不透明度标记待确认；执行顺序在Step3之前，见函数内注释）
  Step4c 专色与JPG小样核对（自动列专色清单+自动摆放JPG小样到画板右侧，不做图片文字自动识别）
  Step5 规格线（刀线）叠印描边检测，未勾选则自动修正
  Step6 按产品类型自动建立出血蒙版（刀线+出血；蒙版容器最终置于最顶层，裁切路径无填充/无描边）
  Step7 保线本轮暂停（不检测、不生成描边、不改版面）；银卡纸垫白核对仍在Step2前执行
  Step8 图层归类候选方案生成（按预设规则打标签：文字/框/底图图案，不物理搬图层，避免和Step2冲突）
  Step9 导出前校验：如果前序步骤有异常/待确认项，暂停导出，不带着问题往下走

  【关于 Step7/Step8 的重要说明】
  这两步是技术方案里公认的难点（保线、图层归类），本版实现的是"启发式候选方案生成"，
  不是精确算法：保线用"邻近异色边界"粗略判断，图层归类用"预设规则打标签"判断，
  目的是让"机器出方案 -> 人工确认/驳回/微调"这条流程先跑通，符合合同验收标准里
  "不以保线100%自动正确/归类100%准确作为验收条件"这一条。准确率会随着人工确认的
  真实数据积累逐步迭代提升，不是这一版就要做到位。

  【这份脚本还不做什么（阶段一原型的边界，后续阶段单独开发）】
  - 不做规格线的"按尺寸数据库自主判断"（甲方8/21新增需求，需要先建立版面尺寸数据库，另行开发）
  - 不做新增的 Step0（JPG与AI/EPS套对、转曲前后字体差异检测、存储前隐藏内容保留规则），另行开发
  - 不做夜间无人值守批量运行机制（对应技术方案第9项），需在以上步骤都稳定后再做
  - 不直接覆盖保存原始文件，所有修改建议在文件副本上操作
  - 已有图形界面：本脚本由「自动制版」CEP 面板调用，取代原先"文件 > 脚本 > 其他脚本"运行

  【安全提醒 - 现场运行前务必确认】
  V0.7 起"先另存副本"不再强制（预检与执行均不因未保存阻断），但流程仍会直接修改当前文档：
  建议仍在副本上操作，避免直接在唯一原始文件上跑。
*/

// ============================================================
// 面板通信：JSON 序列化 + 构建号
// ------------------------------------------------------------
// ExtendScript 没有原生 JSON，且直接读取未声明的 JSON 标识符会报错，
// 因此用独立命名的 zbStringify（与「印前检查」面板同款实现，行为一致）。
// ============================================================
function zbStringify(value) {
  function esc(s) {
    return String(s)
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"')
      .replace(/\r/g, "\\r")
      .replace(/\n/g, "\\n")
      .replace(/\t/g, "\\t")
      // 兜底转义其余 C0 控制字符，避免文本内容里的 \b/\f/\v 产出非法 JSON
      .replace(/[\u0000-\u001f]/g, function (c) {
        return "\\u" + ("0000" + c.charCodeAt(0).toString(16)).slice(-4);
      });
  }
  function ser(v) {
    if (v === null || v === undefined) return "null";
    var t = typeof v;
    if (t === "number") {
      if (isNaN(v) || !isFinite(v)) return "null";
      return String(v);
    }
    if (t === "boolean") return String(v);
    if (t === "string") return '"' + esc(v) + '"';
    if (v instanceof Array) {
      var a = [];
      for (var i = 0; i < v.length; i++) a.push(ser(v[i]));
      return "[" + a.join(",") + "]";
    }
    var parts = [];
    for (var k in v) {
      if (v.hasOwnProperty(k)) parts.push('"' + esc(k) + '":' + ser(v[k]));
    }
    return "{" + parts.join(",") + "}";
  }
  return ser(value);
}

// 构建号：随每次改动递增，并随每个返回值下发。
// 面板据此判断 ExtendScript 引擎里加载的是否为当前版本：一致则跳过 $.evalFile 直接调用。
var ZB_BUILD = "0.8";

var CONFIG = {
  // 出血值对照表（单位 mm）。注意：这里的数值是"总出血"，实际画每一边时按数值的一半计算
  // 例如标签 3mm，代表上下左右单边各加 1.5mm（甲方 2026-08-21 反馈明确过这一点）
  bleedByType: {
    "标签": 3,
    "礼盒": 5
  },
  // 规格线（刀线）专色名称，用于第5步叠印检测
  specLineSpotName: "刀线",
  // 处理前对照层名称：Step0 创建/检查、zbPrecheck 的 hasBeforeLayer 判定都用此名
  beforeLayerName: "对照-处理前(请勿编辑)",
  // 自动出血蒙版图层名称：Step6 创建、输出前核查用此名
  maskLayerName: "蒙版-自动生成",
  // 四色黑判定阈值：CMYK四个通道均大于等于此值；用户已确认包含80%边界
  richBlackThreshold: 80,
  // 分色图层拆分时，图层命名前缀
  colorLayerPrefix: "分色-",
  // 导出格式
  exportFormat: "PDF"
};

var LOG = [];
var AUTO_BLEED_GROUP_NOTE = "prepress:auto-bleed-group:v1";
var AUTO_BLEED_PATH_NOTE = "prepress:auto-bleed-path:v1";
var BEFORE_SNAPSHOT_NOTE = "prepress:before-raster:v2";
var RUNTIME_SPEC_PATH = null;
var RUNTIME_SPEC_INFO = null;

// 日志每条 = { text, level }。level 在落笔时判定，全工程只有 levelFromResult 这一处判定规则；
// 面板渲染与「导出前校验」都读这个字段，不再靠匹配日志文字 —— 原写法“详情里偶然出现
// 『异常』二字就会被判成异常、从而莫名暂停导出”的脆弱点由此消除。
function log(step, result, detail) {
  var text = "[" + step + "] " + result + (detail ? "：" + detail : "");
  LOG.push({ text: text, level: levelFromResult(result) });
}

// 级别只看受控的“结果词”，不看后面的详情文字。
function levelFromResult(result) {
  var r = String(result || "");
  if (r.indexOf("异常") !== -1 || r.indexOf("已暂停") !== -1) return "hold";
  if (r.indexOf("待人工确认") !== -1) return "review";
  if (r.indexOf("已自动修正") !== -1) return "fixed";
  return "pass";
}

// ============================================================
// 面板入口 ① zbPrecheck() —— 只读预检，不修改文档
// 面板打开/刷新时调用：显示当前文档信息、判断能否开跑、
// 列出多条「刀线」候选（按几何面积从大到小，与执行时同一套查找与排序），
// 由操作员在面板里选定主刀线。返回 JSON 字符串。
// ============================================================
function zbPrecheck() {
  var res = { ok: false, build: ZB_BUILD, specCount: 0, specs: [] };
  if (app.documents.length === 0) {
    res.error = "当前没有打开的文档，请先打开一个 AI 文件。";
    return zbStringify(res);
  }
  var doc = app.activeDocument;
  res.docName = doc.name;
  res.docPath = String(doc.path || "");
  res.saved = !!res.docPath;

  // 是否已有处理前对照层：有则本次不能直接跑，需用运行脚本前的原始副本
  res.hasBeforeLayer = false;
  try {
    for (var li = 0; li < doc.layers.length; li++) {
      if (doc.layers[li].name === CONFIG.beforeLayerName) { res.hasBeforeLayer = true; break; }
    }
  } catch (eL) {}

  try {
    var paths = findSpecLinePaths(doc);
    var cands = [];
    for (var i = 0; i < paths.length; i++) {
      var info = getSpecCandidateInfo(paths[i]);
      if (info) cands.push(info);
    }
    cands.sort(function (a, b) { return b.area - a.area; });
    for (var j = 0; j < cands.length; j++) {
      var closed = false;
      try { closed = !!cands[j].path.closed; } catch (eC) {}
      res.specs.push({
        widthMM: round2(cands[j].widthMM),
        heightMM: round2(cands[j].heightMM),
        closed: closed
      });
    }
    res.specCount = cands.length;
  } catch (eS) {
    res.error = "读取刀线失败：" + eS.message;
    return zbStringify(res);
  }

  res.ok = true;
  return zbStringify(res);
}

// ============================================================
// 面板入口 ② zbRun(productType, specIndex, specWmm, specHmm) —— 执行制版
//   productType: "标签" | "礼盒"（决定出血值：标签3mm / 礼盒5mm）
//   specIndex:   主刀线在 zbPrecheck().specs 中的下标
//   specWmm/Hmm: 预检给出的该条刀线尺寸；执行前复核，对不上即停（防预检与执行之间文档被改）
// 返回 JSON 字符串：{ ok, build, canExport, log:[{text,level}...], error }
// 注意：本版不再落盘任何报告文件，面板结果区即最终报告。
// ============================================================
function zbRun(productType, specIndex, specWmm, specHmm) {
  var res = { ok: false, build: ZB_BUILD, canExport: false, log: [] };
  if (app.documents.length === 0) {
    res.error = "当前没有打开的文档，请先打开一个 AI 文件。";
    return zbStringify(res);
  }
  var doc = app.activeDocument;
  res.docName = doc.name;
  res.docPath = String(doc.path || "");

  LOG = [];
  productType = (productType === "礼盒") ? "礼盒" : "标签";
  res.productType = productType;

  try {
    log("Step0-产品类型选择", "已记录",
      "面板选择的产品类型：" + productType + "（决定出血值：标签3mm/礼盒5mm）");

    step0_createBeforeSnapshot(doc);
    step1_filePreCheck(doc);
    // 9/9复杂版：多条“刀线”专色路径时由面板按尺寸确认主刀线，避免把标注/小图形一起并入尺寸
    preparePrimarySpecLineReference(doc, specIndex, specWmm, specHmm);
    // 银卡垫白核对必须在Step2分色拆分之前执行，见 whiteBaseCheck 函数内注释
    whiteBaseCheck(doc);
    stepA_unlockAll(doc); // 必须在Step2分色拆分之前执行，见函数内注释
    step2_colorLayerSplit(doc);
    step4b_textFrameTransparencyCheck(doc); // 必须在Step3转曲之前执行
    step3_unlockCleanOutline(doc, productType);
    step4_cleanSwatchesAndBlack(doc);
    step4c_spotColorJpgCheck(doc);
    step5_checkSpecLineOverprint(doc);
    step6_buildBleedMask(doc, productType);
    log("Step7-保线", "已暂缓", "按当前确认，本轮保线模块完全不执行，不检测、不生成描边、不修改生产版面");
    step8_layerClassificationCandidates(doc);
    step6_finalizeMaskBeforeOutput(doc, productType); // 输出前再次确认蒙版最顶层、无填充无描边、所有生产内容均受裁切
    var previewResult = enableOverprintPreview(doc);
    res.canExport = step9_preExportCheck();

    res.overprintVerified = !!previewResult.verified;
    res.overprintDetail = previewResult.detail || "";
    res.ok = true;
  } catch (e) {
    res.error = e.message;
    res.canExport = false;
  }
  res.log = LOG;
  return zbStringify(res);
}
// ---------- Step0 处理前栅格对照 ----------
// 甲方2026-09-08确认：AI里的「处理前对照层」只要是一张栅格图片即可，
// 不要求文件夹里实际生成/保留JPG文件。因此本版不再走“导出JPG -> 重新放回 -> 强制缩放”流程。
// 做法：只复制当前可见的生产对象作为临时栅格源，调用Illustrator内部rasterize()得到单张RasterItem；
// 原生产对象本身不栅格化、不移动、不删除。clipBounds直接使用处理前版面范围，栅格结果不再二次改宽高/坐标，
// 避免上一版300dpi JPG像素取整后再强制缩放造成的轻微套对偏差，也不会再触发中文JPG文件名/目录的非拉丁字符提示。
function step0_createBeforeSnapshot(doc) {
  var beforeName = CONFIG.beforeLayerName;
  for (var li = 0; li < doc.layers.length; li++) {
    if (doc.layers[li].name === beforeName) {
      log("Step0-建立对照图层", "异常【高优先级】", "已有处理前对照层，未覆盖其内容；请用运行脚本前的原始AI副本测试本版，避免把处理后的稿件当作处理前原稿");
      throw new Error("当前文件已有处理前对照层。请重新打开运行脚本前的AI副本，不要在旧结果上叠加运行。");
    }
  }

  // V0.7：不再因文档未保存（doc.path 为空）硬阻断。处理前对照层建在文档内、不需要路径；
  // 同目录参考文件查找（Step4b/4c）在无路径时按"未找到"优雅降级。
  // 报告文件早已取消（V0.2 面板即报告），doc.path 仅剩参考文件查找一个用途。

  // V0.5：收集与算边界合并为一次扫描（原先 getBeforeSnapshotBounds + collectSnapshotSourceItems
  // 对同一文档各做一次全量遍历；边界口径以收集到的可见生产对象为准，两者天然一致）。
  var sourceItems = collectSnapshotSourceItems(doc);
  if (sourceItems.length === 0) {
    throw new Error("当前文件没有可用于处理前对照的可见生产对象，尚未生成处理前对照。");
  }
  var bounds = getSnapshotBounds(sourceItems);
  if (!bounds || bounds[2] <= bounds[0] || bounds[1] <= bounds[3]) {
    throw new Error("未找到可栅格化的原稿对象，尚未生成处理前对照。");
  }

  var originalLayer = doc.activeLayer;
  var snapLayer = null;
  var tempGroup = null;
  try {
    // sourceItems 已在上方一次扫描中收集（V0.5 合并），这里直接复制。

    snapLayer = doc.layers.add();
    snapLayer.name = beforeName;
    snapLayer.zOrder(ZOrderMethod.SENDTOBACK);
    snapLayer.printable = false;
    snapLayer.locked = false;
    snapLayer.visible = true;

    tempGroup = snapLayer.groupItems.add();
    tempGroup.name = "处理前栅格临时源";

    // doc.pageItems索引较小的对象通常更靠前；从后往前复制并PLACEATBEGINNING，保持相对前后关系。
    // 每次复制仅临时解锁该对象及其父图层，复制完成马上恢复，不改变生产稿的锁定状态。
    var duplicatedCount = 0;
    for (var i = sourceItems.length - 1; i >= 0; i--) {
      duplicateSnapshotItem(sourceItems[i], tempGroup);
      duplicatedCount++;
    }
    if (duplicatedCount !== sourceItems.length || tempGroup.pageItems.length === 0) {
      throw new Error("处理前栅格临时源复制不完整，已停止后续步骤。");
    }

    var options = new RasterizeOptions();
    options.resolution = 300;
    options.antiAliasingMethod = AntiAliasingMethod.ARTOPTIMIZED;
    options.transparency = false;       // 沿用上一版JPG白底对照的视觉效果
    options.backgroundBlack = false;
    options.convertSpotColors = false;  // 对照图只用于视觉套对，不改生产专色定义
    options.convertTextToOutlines = false;
    options.includeLayers = true;
    options.clippingMask = false;
    options.padding = 0;

    // rasterize会处理并销毁tempGroup，只影响上面复制出来的临时副本，不碰生产原稿。
    var image = doc.rasterize(tempGroup, bounds, options);
    tempGroup = null;
    if (!image || image.typename !== "RasterItem") {
      throw new Error("Illustrator内部栅格化未返回有效RasterItem。");
    }
    image.move(snapLayer, ElementPlacement.PLACEATEND);
    image.name = "处理前栅格对照";
    image.note = BEFORE_SNAPSHOT_NOTE;
    image.opacity = 45;

    // 不再像上一版那样人为重设width/height/position；clipBounds本身就是原版面坐标基准。
    // 只核验返回对象仍覆盖该范围，发现宿主异常则停止，避免用错位对照继续生产。
    if (!rasterBoundsMatch(image, bounds, 0.5)) {
      throw new Error("内部栅格结果与处理前版面范围不一致，未通过套对位置核验。");
    }

    snapLayer.visible = false;
    snapLayer.locked = true;
    log("Step0-建立对照图层", "已处理", "处理前当前AI版面已在Illustrator内部栅格化并放入「" + beforeName +
      "」；仅含1张RasterItem，不生成外部JPG文件，不二次缩放/改坐标，45%透明度、锁定、不打印、默认隐藏。复制栅格源对象 " + duplicatedCount + " 个");
  } catch (e) {
    if (tempGroup) {
      try { tempGroup.remove(); } catch (tempCleanupError) {}
    }
    if (snapLayer) {
      try { snapLayer.locked = false; snapLayer.remove(); } catch (cleanupError) {}
    }
    log("Step0-建立对照图层", "异常【高优先级】", "处理前栅格对照未完成，未进入后续制版步骤：" + e.message);
    throw e;
  } finally {
    try { doc.activeLayer = originalLayer; } catch (layerError) {}
  }
}

// 收集所有“父级直接是Layer”的可见生产对象，避免把GroupItem里的子对象再复制一遍。
// 子图层里的顶层对象也会被doc.pageItems收集到；辅助图层与隐藏/参考线对象不进入快照。
function collectSnapshotSourceItems(doc) {
  var result = [];
  for (var i = 0; i < doc.pageItems.length; i++) {
    var item = doc.pageItems[i];
    try {
      if (!item.parent || item.parent.typename !== "Layer") continue;
      if (isAuxiliaryLayer(item.layer)) continue;
      if (!isItemVisibleForSnapshot(item)) continue;
      result.push(item);
    } catch (e) {}
  }
  return result;
}

function isItemVisibleForSnapshot(item) {
  var current = item;
  while (current && current.typename !== "Document") {
    try {
      if (current.typename === "Layer") {
        if (!current.visible) return false;
      } else {
        if (current.hidden) return false;
        if (current.typename === "PathItem" && current.guides) return false;
      }
    } catch (e) {}
    current = current.parent;
  }
  return true;
}

function duplicateSnapshotItem(item, targetGroup) {
  var itemLocked = false;
  var layerStates = [];
  var current = item.parent;
  try {
    while (current && current.typename === "Layer") {
      layerStates.push({ layer: current, locked: current.locked });
      if (current.locked) current.locked = false;
      current = current.parent;
    }
    itemLocked = item.locked;
    if (itemLocked) item.locked = false;
    var dup = item.duplicate(targetGroup, ElementPlacement.PLACEATBEGINNING);
    if (!dup) throw new Error("对象复制失败");
    return dup;
  } finally {
    try { item.locked = itemLocked; } catch (itemRestoreError) {}
    for (var i = layerStates.length - 1; i >= 0; i--) {
      try { layerStates[i].layer.locked = layerStates[i].locked; } catch (layerRestoreError) {}
    }
  }
}

function rasterBoundsMatch(image, bounds, tolerancePt) {
  try {
    var b = image.geometricBounds;
    return Math.abs(b[0] - bounds[0]) <= tolerancePt &&
      Math.abs(b[1] - bounds[1]) <= tolerancePt &&
      Math.abs(b[2] - bounds[2]) <= tolerancePt &&
      Math.abs(b[3] - bounds[3]) <= tolerancePt;
  } catch (e) {
    return false;
  }
}

// 由已收集的生产对象列表计算总边界（V0.5：原来这里是对 doc.pageItems 再做一次全量扫描，
// 且把 isItemVisibleForSnapshot 的可见性判断内联复制了一份——同一套逻辑两处写迟早漂移；
// 现在只认 collectSnapshotSourceItems 收集到的结果，一次扫描同时产出清单与边界）。
function getSnapshotBounds(items) {
  var result = null;
  for (var i = 0; i < items.length; i++) {
    var b;
    try { b = items[i].visibleBounds; } catch (boundsError) { continue; }
    if (!b || !isFinite(b[0]) || !isFinite(b[1]) || !isFinite(b[2]) || !isFinite(b[3])) continue;
    if (!result) result = [b[0], b[1], b[2], b[3]];
    else {
      result[0] = Math.min(result[0], b[0]); result[1] = Math.max(result[1], b[1]);
      result[2] = Math.max(result[2], b[2]); result[3] = Math.min(result[3], b[3]);
    }
  }
  return result;
}

// ---------- Step1 文件预处理 ----------
function step1_filePreCheck(doc) {
  if (doc.documentColorSpace === DocumentColorSpace.CMYK) {
    log("Step1-颜色模式", "通过", "CMYK");
  } else {
    log("Step1-颜色模式", "异常【高优先级】", "当前非 CMYK 模式，请人工确认");
  }

  var ab = doc.artboards[0].artboardRect; // [左, 上, 右, 下]，单位 pt
  var wMM = Math.round(((ab[2] - ab[0]) / 72 * 25.4) * 100) / 100;
  var hMM = Math.round(((ab[1] - ab[3]) / 72 * 25.4) * 100) / 100;
  log("Step1-画板尺寸", "记录", wMM + "×" + hMM + "mm");

  var linkedCount = doc.placedItems.length;
  if (linkedCount === 0) {
    log("Step1-图片链接", "通过", "无未嵌入的链接图片");
  } else {
    log("Step1-图片链接", "异常【高优先级】", "发现 " + linkedCount + " 个未嵌入的链接图片，需人工嵌入");
  }
}

// ---------- 解锁全部内容(含图层) ----------
// 真机测试反馈"图层乱了、有些内容整个翻掉"排查出的一个真实顺序bug：
// 解锁动作原来写在Step3里，但Step3在main()里排在Step2(分色图层拆分)后面执行——
// 也就是说Step2先跑的时候，文件里原本锁定的对象/图层还没解锁。Illustrator里锁定对象
// (包括所在图层被锁定)是没法用脚本move()挪动的，会直接抛异常，Step2原来的try/catch
// 把这个异常吞掉了，不报错也不计入"颜色混合待确认"，这些对象就会悄悄留在原图层不动、
// 且没有任何日志提示——这一条能直接解释"图层乱了"里部分内容位置对不上的情况，
// 是从代码逻辑上可以确认的问题，不是猜测。
// 修正：把解锁动作单独提出来，挪到Step2之前最先执行；同时也要解锁图层本身
// (之前只解锁了对象的locked属性，没解锁layer.locked，如果整个图层被锁定，
// 图层里的对象一样没法被移动，这也是之前漏掉的一点)。
function stepA_unlockAll(doc) {
  var unlockedLayerCount = 0;
  for (var li = 0; li < doc.layers.length; li++) {
    if (isAuxiliaryLayer(doc.layers[li])) continue;
    try {
      if (doc.layers[li].locked) { doc.layers[li].locked = false; unlockedLayerCount++; }
    } catch (e) {}
  }

  var unlockedCount = 0;
  for (var i = 0; i < doc.pageItems.length; i++) {
    var item = doc.pageItems[i];
    if (isAuxiliaryLayer(item.layer)) continue;
    try {
      if (item.locked) { item.locked = false; unlockedCount++; }
    } catch (e) {}
  }

  log("Step-解锁", "已处理", "已解锁图层 " + unlockedLayerCount + " 个、对象 " + unlockedCount + " 个（这一步必须在分色图层拆分之前做，否则锁定内容会被分色拆分步骤悄悄跳过且不报错）");
}

// ---------- Step2 分色图层拆分 ----------
// 2026-09-09复杂版真机反馈：简单单层版面按颜色跨层搬动时曾能正常工作，但多层版面会出现
// “原来被盖住的内容跑出来 / 图层顺序乱 / 局部重叠改变”。这不是颜色判断本身的问题，而是
// 把不同父层级里的对象统一搬进新颜色层后，原稿真实叠放关系无法保证继续成立。
//
// 因此本版只在“结构足够简单且能证明不会跨层破坏视觉”的情况下执行原有物理拆层；
// 一旦检测到多顶层、子图层、隐藏生产图层等复杂结构，不自行猜测如何重排，保持源结构不动，
// 只记录颜色分类结果并标记待人工确认。这样换复杂版面时宁可少自动一步，也不能把已经正确的视觉稿改乱。
// 这一安全保护不改变后续黑色、刀线叠印、蒙版等机械动作。
function step2_colorLayerSplit(doc) {
  var productionLayers = [];
  var complexReasons = [];

  for (var li = 0; li < doc.layers.length; li++) {
    var layer = doc.layers[li];
    if (isAuxiliaryLayer(layer)) continue;
    productionLayers.push(layer);
    try {
      if (!layer.visible) complexReasons.push("存在隐藏生产图层「" + layer.name + "」");
    } catch (e1) {}
    try {
      if (layer.layers && layer.layers.length > 0) complexReasons.push("图层「" + layer.name + "」含子图层");
    } catch (e2) {}
  }

  if (productionLayers.length !== 1) {
    complexReasons.push("顶层生产图层数量为 " + productionLayers.length + "（非单层简单结构）");
  }

  // 复杂版面安全模式：不物理搬层，只做颜色扫描并保留原始层级/叠放。
  if (complexReasons.length > 0) {
    var scan = scanColorSplitCandidates(doc);
    log("Step2-分色图层拆分", "待人工确认",
      "检测到复杂版面，为保证“处理前后视觉一致”本轮未物理搬动任何生产对象；原图层、对象坐标和叠放关系保持不变。" +
      "原因：" + complexReasons.join("；") +
      "。已扫描到可判定颜色对象 " + scan.classified + " 个、颜色类别 " + scan.keys.length + " 种" +
      (scan.mixed > 0 ? "，另有 " + scan.mixed + " 个混合/无法判定对象" : "") +
      "。复杂版分色层如何合并需后续用真实版面继续定规则，当前不自行重排。");
    return;
  }

  // 单层简单版面继续沿用08d已验证过的拆分方式；只收集“父级直接是该层”的顶层对象，
  // 防止把编组/子层里的后代对象单独抽走。
  var sourceLayer = productionLayers[0];
  var targets = [];
  for (var pi = 0; pi < sourceLayer.pageItems.length; pi++) {
    if (sourceLayer.pageItems[pi].parent === sourceLayer) targets.push(sourceLayer.pageItems[pi]);
  }

  var splitRisk = analyzeSingleLayerSplitRisk(sourceLayer, targets);
  if (splitRisk.risky) {
    log("Step2-分色图层拆分", "待人工确认",
      "当前虽为单顶层版面，但检测到可能影响原始叠放/视觉效果的结构：" + splitRisk.detail +
      "。复杂版稳定优先，本轮自动保持源图层，不提供强制拆层选项，避免操作员误选后改变原稿视觉顺序。");
    return;
  }

  var flaggedMixed = 0;
  var keyOrder = [];
  var seenKey = {};
  var classified = [];

  for (var t = 0; t < targets.length; t++) {
    var item = targets[t];
    var key = null;
    try { key = classifyColorKey(item); } catch (e3) {}
    if (key === null) {
      flaggedMixed++;
      continue;
    }
    classified.push({ item: item, key: key });
    if (!seenKey[key]) {
      seenKey[key] = true;
      keyOrder.push(key);
    }
  }

  var layerCache = {};
  var createdLayers = 0;
  for (var ko = keyOrder.length - 1; ko >= 0; ko--) {
    var key2 = keyOrder[ko];
    var layerName = CONFIG.colorLayerPrefix + key2;
    var targetLayer = findOrCreateLayer(doc, layerName);
    layerCache[key2] = targetLayer;
    createdLayers++;
  }

  var movedCount = 0;
  var moveFailNames = [];
  for (var c = 0; c < classified.length; c++) {
    try {
      classified[c].item.move(layerCache[classified[c].key], ElementPlacement.PLACEATEND);
      movedCount++;
    } catch (e4) {
      // 搬移失败不再静默：对象留在原图层 = 分色不完整，必须进日志并暂停导出
      try { moveFailNames.push(classified[c].item.name || "(未命名对象)"); }
      catch (eN) { moveFailNames.push("(名称读取失败)"); }
    }
  }

  log("Step2-分色图层拆分", "已处理",
    "单层简单版面：拆分对象 " + movedCount + " 个到 " + createdLayers +
    " 个分色图层；本轮仅对父级直接位于原顶层的对象执行搬层，避免抽走嵌套内容。" +
    (flaggedMixed > 0 ? "另有 " + flaggedMixed + " 个颜色混合/无法判定对象未自动搬动，需人工确认" : "无颜色混合对象"));
  if (flaggedMixed > 0) {
    log("Step2-分色图层拆分", "待人工确认", flaggedMixed + " 个对象因颜色混合或无法判定归属，保留在原位置，需人工归类");
  }
  if (moveFailNames.length > 0) {
    log("Step2-分色图层拆分", "待人工确认",
      moveFailNames.length + " 个对象搬移到分色图层失败（仍留在原图层）：" +
      moveFailNames.slice(0, 3).join("、") + (moveFailNames.length > 3 ? " 等" : "") +
      "，请人工核对这些对象的图层归属");
  }
}

function analyzeSingleLayerSplitRisk(sourceLayer, targets) {
  var mixed = 0;
  var repeatedRun = false;
  var clippedGroup = 0;
  var seenRun = {};
  var lastToken = null;

  // 单顶层并不等于“简单版”。如果原层本身带透明度/混合模式，
  // 把对象搬到新颜色层会失去原层级外观属性，因此直接按复杂版保护。
  try {
    if (sourceLayer.opacity !== 100) {
      return { risky: true, detail: "原图层透明度为 " + sourceLayer.opacity + "%" };
    }
  } catch (e0) {}
  try {
    if (sourceLayer.blendingMode !== BlendingMode.NORMAL) {
      return { risky: true, detail: "原图层使用了非正常混合模式" };
    }
  } catch (e1) {}

  for (var i = 0; i < targets.length; i++) {
    var key = null;
    try { key = classifyColorKey(targets[i]); } catch (e2) {}
    var token = key === null ? "__MIXED__" : key;
    if (key === null) mixed++;

    try {
      if (targets[i].typename === "GroupItem" && targets[i].clipped) clippedGroup++;
    } catch (e3) {}

    if (token !== lastToken) {
      if (seenRun[token]) repeatedRun = true;
      seenRun[token] = true;
      lastToken = token;
    }
  }

  var parts = [];
  if (mixed > 0) parts.push("存在 " + mixed + " 个颜色混合/无法判定的顶层对象");
  if (repeatedRun) parts.push("同一颜色在原叠放顺序中分成多个不连续区段");
  if (clippedGroup > 0) parts.push("存在 " + clippedGroup + " 个原有裁切编组");

  return {
    risky: parts.length > 0,
    detail: parts.join("；")
  };
}

function scanColorSplitCandidates(doc) {
  var seen = {};
  var keys = [];
  var classified = 0;
  var mixed = 0;
  for (var i = 0; i < doc.pageItems.length; i++) {
    var item = doc.pageItems[i];
    if (isAuxiliaryLayer(item.layer)) continue;
    var key = null;
    try { key = classifyColorKey(item); } catch (e) {}
    if (key === null) {
      mixed++;
    } else {
      classified++;
      if (!seen[key]) {
        seen[key] = true;
        keys.push(key);
      }
    }
  }
  return { classified: classified, mixed: mixed, keys: keys };
}

function findOrCreateLayer(doc, name) {
  for (var i = 0; i < doc.layers.length; i++) {
    if (doc.layers[i].name === name) return doc.layers[i];
  }
  var newLayer = doc.layers.add();
  newLayer.name = name;
  return newLayer;
}

// 返回对象的颜色分类 key；无法判定或颜色混合时返回 null
function classifyColorKey(item) {
  if (item.typename === "GroupItem") {
    return classifyGroupColorKey(item);
  }
  return classifySingleItemColorKey(item);
}

function classifyGroupColorKey(group) {
  var keys = {};
  var count = 0;
  collectDescendantColorKeys(group, keys);
  for (var k in keys) { count++; }
  if (count === 1) {
    for (var onlyKey in keys) return onlyKey;
  }
  return null; // 0 个或多个不同颜色，判定为混合/无法确定
}

function collectDescendantColorKeys(container, keysOut) {
  var children = container.pageItems;
  for (var i = 0; i < children.length; i++) {
    var child = children[i];
    if (child.typename === "GroupItem") {
      collectDescendantColorKeys(child, keysOut);
    } else {
      var k = classifySingleItemColorKey(child);
      if (k !== null) keysOut[k] = true;
    }
  }
}

function classifySingleItemColorKey(item) {
  try {
    if (item.filled && item.fillColor) {
      var fk = colorToKey(item.fillColor);
      if (fk !== null) return fk;
    }
    if (item.stroked && item.strokeColor) {
      var sk = colorToKey(item.strokeColor);
      if (sk !== null) return sk;
    }
  } catch (e) {}
  return null; // 无填充无描边（比如纯裁切路径），不参与分色图层拆分
}

function colorToKey(color) {
  if (color.typename === "SpotColor") {
    var normalized = normalizePantoneName(color.spot.name);
    return normalized || color.spot.name.toUpperCase();
  }
  if (color.typename === "CMYKColor") {
    return "CMYK四色";
  }
  return null; // 其他颜色类型（灰度、RGB等）阶段一暂不处理，归为无法判定
}

// 判断是不是脚本自己建的辅助图层（蒙版图层、Step0对照图层），后续各步骤都要跳过这些图层，
// 不要把它们当成真实版面内容来处理
function isAuxiliaryLayer(layer) {
  var current = layer;
  while (current && current.typename === "Layer") {
    if (current.name.indexOf("对照-") === 0 || current.name.indexOf("保线候选") === 0) return true;
    // 蒙版容器本身无生产对象；其子图层仍是真实内容，不能随父容器一起跳过。
    if (current === layer && current.name === CONFIG.maskLayerName) return true;
    current = current.parent;
  }
  return false;
}

// Step7/8兼容本轮新增的蒙版嵌套；仅展开脚本生成的包装，不拆原稿编组、不改候选算法。
function getPostMaskContentLayers(doc) {
  var result = [];
  for (var i = 0; i < doc.layers.length; i++) {
    var layer = doc.layers[i];
    if (layer.name === CONFIG.maskLayerName) {
      for (var j = 0; j < layer.layers.length; j++) {
        if (!isAuxiliaryLayer(layer.layers[j])) result.push(layer.layers[j]);
      }
    } else if (!isAuxiliaryLayer(layer)) {
      result.push(layer);
    }
  }
  return result;
}

function getLayerOriginalItems(layer) {
  var result = [];
  var items = layer.pageItems;
  for (var i = 0; i < items.length; i++) {
    if (items[i].parent !== layer) continue;
    var item = items[i];
    if (item.typename === "GroupItem" && item.note === AUTO_BLEED_GROUP_NOTE) {
      for (var j = 0; j < item.pageItems.length; j++) {
        var child = item.pageItems[j];
        if (child.parent === item && child.note !== AUTO_BLEED_PATH_NOTE) result.push(child);
      }
    } else {
      result.push(item);
    }
  }
  return result;
}

// ---------- 规格线（刀线）识别 / 本次运行主刀线确认 ----------
// 2026-09-09复杂测试包确认：同一AI里可能有多条使用“刀线”专色的路径，除了真正规格线之外，
// 还可能包含尺寸标注、小图形或其他技术标记。旧逻辑把所有“刀线”路径做并集，会把这些附属路径
// 一起计入宽高，导致蒙版尺寸被放大。
//
// 本版不自行用“最大路径=刀线”等启发式直接替业务做决定：
// - 只有1条“刀线”路径时自动使用；
// - 有多条时按几何面积从大到小列出每条路径的尺寸，操作员确认一次真正主刀线；
// - 后续Step3清理范围与Step6蒙版尺寸共同复用这一条已确认主刀线。
// 规格尺寸数据库仍未实现，后续可用数据库替代这个人工确认步骤。
function findSpecLinePaths(doc) {
  var result = [];
  for (var i = 0; i < doc.pathItems.length; i++) {
    var p = doc.pathItems[i];
    if (isAuxiliaryLayer(p.layer)) continue;
    // 复合路径子路径在下一轮统一加入，避免同一路径被普通pathItems和compoundPathItems重复计数。
    if (p.parent && p.parent.typename === "CompoundPathItem") continue;
    try {
      if (p.stroked && p.strokeColor && p.strokeColor.typename === "SpotColor" &&
          p.strokeColor.spot.name.toUpperCase() === CONFIG.specLineSpotName.toUpperCase()) {
        result.push(p);
      }
    } catch (e) {}
  }
  for (var c = 0; c < doc.compoundPathItems.length; c++) {
    var cpItem = doc.compoundPathItems[c];
    if (isAuxiliaryLayer(cpItem.layer)) continue;
    var subPaths = cpItem.pathItems;
    for (var s = 0; s < subPaths.length; s++) {
      var sp = subPaths[s];
      try {
        if (sp.stroked && sp.strokeColor && sp.strokeColor.typename === "SpotColor" &&
            sp.strokeColor.spot.name.toUpperCase() === CONFIG.specLineSpotName.toUpperCase()) {
          result.push(sp);
        }
      } catch (e2) {}
    }
  }
  return result;
}

function getSpecCandidateInfo(path) {
  try {
    var b = path.geometricBounds;
    if (!b || b[2] <= b[0] || b[1] <= b[3]) return null;
    var wPt = b[2] - b[0];
    var hPt = b[1] - b[3];
    return {
      path: path,
      bounds: [b[0], b[1], b[2], b[3]],
      widthMM: wPt / 72 * 25.4,
      heightMM: hPt / 72 * 25.4,
      area: wPt * hPt
    };
  } catch (e) {
    return null;
  }
}

function round2(v) {
  return Math.round(v * 100) / 100;
}

function preparePrimarySpecLineReference(doc, specIndex, specWmm, specHmm) {
  RUNTIME_SPEC_PATH = null;
  RUNTIME_SPEC_INFO = null;

  var paths = findSpecLinePaths(doc);
  if (paths.length === 0) {
    log("规格线确认", "异常【高优先级】", "未找到使用专色「" + CONFIG.specLineSpotName + "」描边的规格线路径；未确认刀线前不应继续计算蒙版");
    throw new Error("未找到刀线，无法按“刀线+出血距离=蒙版线”计算。");
  }

  var candidates = [];
  for (var i = 0; i < paths.length; i++) {
    var info = getSpecCandidateInfo(paths[i]);
    if (info) candidates.push(info);
  }
  if (candidates.length === 0) {
    throw new Error("找到刀线专色对象，但没有可用的几何范围。");
  }

  candidates.sort(function (a, b) { return b.area - a.area; });

  var chosenIndex = -1;
  if (typeof specIndex === "number" && specIndex >= 0 && specIndex < candidates.length) {
    chosenIndex = specIndex;
  } else if (candidates.length === 1) {
    chosenIndex = 0;
  } else {
    throw new Error("检测到 " + candidates.length + " 条刀线路径，需在面板中选定主刀线后再执行。");
  }

  // 预检与执行之间文档若被改动，刀线次序可能变化；用预检尺寸复核，对不上就停下要求重新扫描。
  if (typeof specWmm === "number" && typeof specHmm === "number") {
    var dW = Math.abs(round2(candidates[chosenIndex].widthMM) - specWmm);
    var dH = Math.abs(round2(candidates[chosenIndex].heightMM) - specHmm);
    if (dW > 0.05 || dH > 0.05) {
      throw new Error("所选刀线尺寸与预检结果不一致（预检 " + specWmm + "×" + specHmm +
        "mm，当前 " + round2(candidates[chosenIndex].widthMM) + "×" +
        round2(candidates[chosenIndex].heightMM) + "mm），请重新扫描后再执行。");
    }
  }

  RUNTIME_SPEC_INFO = candidates[chosenIndex];
  RUNTIME_SPEC_PATH = RUNTIME_SPEC_INFO.path;
  log("规格线确认", "已记录",
    "本次用于尺寸/蒙版计算的主刀线：" + round2(RUNTIME_SPEC_INFO.widthMM) + "×" +
    round2(RUNTIME_SPEC_INFO.heightMM) + "mm；同色刀线路径总数 " + candidates.length +
    "。其他同色路径仍保留并由Step5检查叠印，但不再参与蒙版尺寸并集。");
}

function getBoundaryFromSpecLine(doc, productType, useGeometricBounds) {
  var path = RUNTIME_SPEC_PATH;
  if (!path) {
    var fallbackPaths = findSpecLinePaths(doc);
    // 不再把多条刀线路径合并；没有运行时确认且不止一条时返回null，避免静默算错尺寸。
    if (fallbackPaths.length !== 1) return null;
    path = fallbackPaths[0];
  }

  var b;
  try {
    // Step3继续沿用08d的visibleBounds清理安全范围；Step6显式传true时使用geometricBounds，
    // 排除刀线描边宽度后再加出血。
    b = useGeometricBounds ? path.geometricBounds : path.visibleBounds;
  } catch (e) {
    return null;
  }
  if (!b || b[2] <= b[0] || b[1] <= b[3]) return null;

  var bleedTotalMM = CONFIG.bleedByType[productType] || CONFIG.bleedByType["标签"];
  var marginPt = (bleedTotalMM / 2) / 25.4 * 72;
  return [b[0] - marginPt, b[1] + marginPt, b[2] + marginPt, b[3] - marginPt];
}

// ---------- Step3 解锁 / 取消隐藏 / 删除刀线+出血范围以外多余对象 / 转曲 ----------
function step3_unlockCleanOutline(doc, productType) {
  productType = productType || "标签";
  var deletedHiddenCount = 0;
  var removedCount = 0;
  var outlinedCount = 0;

  // 解锁动作已经挪到 stepA_unlockAll，在Step2分色拆分之前最先执行，这里不再重复
  // （原因见 stepA_unlockAll 函数注释：解锁必须先于分色拆分，否则锁定内容会被悄悄跳过）

  // 隐藏对象处理规则（甲方 2026-08-25 澄清，两阶段规则不同，注意区分）：
  // ①制版开始前（也就是本 Step3，流程最早期做的检查）：检测到隐藏内容 -> 直接删除
  // ②制版过程中产生的隐藏内容（比如后面 Step 做保线/垫白时临时隐藏的对象）：
  //    存储导出前要把它放出来保留，不能删除
  // 本 Step3 属于①，所以这里做的是"检测到隐藏对象直接删除"。
  // 注意：②的逻辑要放在存储导出前的检查里实现（对应新增 Step0/存储前套对阶段），
  // 现在这个原型还没做到那一步，届时那里绝对不能照抄这里的"删除"逻辑，要反过来是"取消隐藏+保留"。
  for (var h = doc.pageItems.length - 1; h >= 0; h--) {
    var hi = doc.pageItems[h];
    if (isAuxiliaryLayer(hi.layer)) continue;
    try {
      if (hi.hidden) {
        hi.remove();
        deletedHiddenCount++;
      }
    } catch (e) {}
  }
  if (deletedHiddenCount > 0) {
    log("Step3-隐藏内容", "已处理", "制版开始前检测到 " + deletedHiddenCount + " 个隐藏对象，已按规则自动删除");
  }

  // 删除刀线+出血范围以外的多余对象（甲方反馈修正：不能用画板边界，要用刀线往外扩出血值
  // 的范围，否则贴边的正常内容会被误删——这条对应真机测试暴露的"金龙鱼字丢失"事故）
  var boundary = getBoundaryFromSpecLine(doc, productType);
  var usingFallbackBoundary = false;
  if (!boundary) {
    usingFallbackBoundary = true;
    var ab = doc.artboards[0].artboardRect;
    var fallbackMarginPt = 10 / 25.4 * 72; // 找不到刀线时没有可靠基准，画板边界再放宽10mm做安全余量，减少误删风险
    boundary = [ab[0] - fallbackMarginPt, ab[1] + fallbackMarginPt, ab[2] + fallbackMarginPt, ab[3] - fallbackMarginPt];
  }
  for (var j = doc.pageItems.length - 1; j >= 0; j--) {
    var it = doc.pageItems[j];
    if (isAuxiliaryLayer(it.layer)) continue;
    try {
      var b = it.visibleBounds;
      var outside = b[2] < boundary[0] || b[0] > boundary[2] || b[1] < boundary[3] || b[3] > boundary[1];
      if (outside) {
        it.remove();
        removedCount++;
      }
    } catch (e) {}
  }
  if (usingFallbackBoundary) {
    log("Step3-清理范围", "待人工确认", "未找到刀线，本次清理范围回退为画板边界+10mm安全余量，建议人工复核是否有该删未删或者误删的内容");
  }

  // 文字转曲：转曲后原来的"这是文字"这个身份信息就没了（变成一堆路径/编组），
  // 但后面 Step8 图层归类要用到"这个原来是不是文字"，所以这里转曲的同时，
  // 把返回的结果对象打上 note 标记 "was:text"，方便后续步骤识别。
  // V0.5：转曲失败不再静默——失败对象保持为文本，直接影响输出，必须进日志并暂停导出。
  var outlineFailTexts = [];
  for (var k = doc.textFrames.length - 1; k >= 0; k--) {
    if (isAuxiliaryLayer(doc.textFrames[k].layer)) continue;
    try {
      var outlineResult = doc.textFrames[k].createOutline();
      if (outlineResult) { try { outlineResult.note = "was:text"; } catch (e2) {} }
      outlinedCount++;
    } catch (e) {
      try { outlineFailTexts.push((doc.textFrames[k].contents || "(空文本)").substring(0, 10)); }
      catch (eN) { outlineFailTexts.push("(内容读取失败)"); }
    }
  }

  log("Step3-清理转曲", "已处理",
    "清理刀线+出血范围外对象 " + removedCount + " 个、转曲文字 " + outlinedCount + " 个" +
    (outlineFailTexts.length > 0 ? "；另有 " + outlineFailTexts.length + " 个转曲失败" : ""));
  if (outlineFailTexts.length > 0) {
    log("Step3-清理转曲", "待人工确认",
      outlineFailTexts.length + " 个文本框转曲失败（仍保持为文本）：" +
      outlineFailTexts.slice(0, 3).join("、") + (outlineFailTexts.length > 3 ? " 等" : "") +
      "，请人工完成转曲后再导出");
  }
}

// ---------- Step4 清理未使用色板 / 专色命名规范化 / 四色黑转单黑叠印 ----------
function step4_cleanSwatchesAndBlack(doc) {
  var used = {};
  for (var i = 0; i < doc.pageItems.length; i++) {
    try {
      var it = doc.pageItems[i];
      if (it.fillColor && it.fillColor.typename === "SpotColor") used[it.fillColor.spot.name] = true;
      if (it.strokeColor && it.strokeColor.typename === "SpotColor") used[it.strokeColor.spot.name] = true;
      // TextFrame 没有 fillColor 属性（读取会抛错被外层 catch 吞掉），文字专色要从 textRange 读；
      // 否则用了专色的文字会被判成"未使用"，色板在下一步被误删（转曲失败的文件里风险最大）。
      if (it.typename === "TextFrame") {
        try {
          var tfFill = it.textRange.characterAttributes.fillColor;
          if (tfFill && tfFill.typename === "SpotColor") used[tfFill.spot.name] = true;
          var tfStroke = it.textRange.characterAttributes.strokeColor;
          if (tfStroke && tfStroke.typename === "SpotColor") used[tfStroke.spot.name] = true;
        } catch (eT) {}
      }
    } catch (e) {}
  }

  var removedSwatches = 0;
  for (var s = doc.spots.length - 1; s >= 0; s--) {
    var spot = doc.spots[s];
    if (!used[spot.name] && spot.name.toUpperCase() !== CONFIG.specLineSpotName.toUpperCase()) {
      try { spot.remove(); removedSwatches++; } catch (e) {}
    }
  }

  // 专色命名规范化：统一成 "PANTONE XXX C" 格式（字母数字全大写、用空格隔开）
  var renamedCount = 0;
  for (var t = 0; t < doc.spots.length; t++) {
    var sp = doc.spots[t];
    var normalized = normalizePantoneName(sp.name);
    if (normalized && sp.name !== normalized) {
      try { sp.name = normalized; renamedCount++; } catch (e) {}
    }
  }

  log("Step4-清理色板", "已处理", "删除未使用色板 " + removedSwatches + " 个，规范化专色命名 " + renamedCount + " 个");

  // 四色黑转换与已有单黑补叠印是两个独立分支；不按面积、文字内容或视觉深浅猜测。
  // 2026-09-08真实文件反馈：营养成分表0.164mm描边仍保留为C92.94/M87.96/Y89.02/K80且未叠印。
  // 补两类此前会漏掉的情况：
  // ① Illustrator“全局Process色”在脚本DOM里会以SpotColor包装，但spot.colorType是ColorModel.PROCESS；
  // ② 裁切路径可能本身带可见描边，之前整条clipping路径被跳过。裁切路径只处理描边，不碰其填充/裁切语义。
  var stats = { richFill: 0, richStroke: 0, singleFill: 0, singleStroke: 0, errors: [] };
  // document.pathItems可包含编组内路径。复合路径在下一轮统一处理，避免重复扫描。
  for (var p2 = 0; p2 < doc.pathItems.length; p2++) {
    var pItem = doc.pathItems[p2];
    if (isAuxiliaryLayer(pItem.layer) || pItem.guides) continue;
    if (pItem.parent && pItem.parent.typename === "CompoundPathItem") continue;
    if (pItem.clipping) processBlackChannel(pItem, "stroke", stats);
    else convertIfRichBlack(pItem, stats);
  }
  for (var cp = 0; cp < doc.compoundPathItems.length; cp++) {
    var cpItem = doc.compoundPathItems[cp];
    if (isAuxiliaryLayer(cpItem.layer)) continue;
    for (var si = 0; si < cpItem.pathItems.length; si++) {
      var subPath = cpItem.pathItems[si];
      if (subPath.guides) continue;
      if (subPath.clipping) processBlackChannel(subPath, "stroke", stats);
      else convertIfRichBlack(subPath, stats);
    }
  }
  log("Step4-四色黑转单黑", "已处理", "四色黑填充 " + stats.richFill + " 处、描边 " + stats.richStroke +
    " 处已转为C0 M0 Y0 K100并核验叠印；阈值为四个通道均大于等于" + CONFIG.richBlackThreshold + "%");
  log("Step4-已有单黑补叠印", "已处理", "已有C0 M0 Y0 K100的填充补叠印 " + stats.singleFill +
    " 处、描边补叠印 " + stats.singleStroke + " 处；填充和描边独立判断，专色/RGB/灰度/网点黑不作推断性转换");
  if (stats.errors.length > 0) {
    log("Step4-黑色叠印核验", "待人工确认", stats.errors.length + " 处未完成：" + stats.errors.slice(0, 8).join("；"));
  }
}

// 保留原函数名供调用；新增已有CMYK纯K100的独立补叠印分支。
function convertIfRichBlack(item, stats) {
  stats = stats || { richFill: 0, richStroke: 0, singleFill: 0, singleStroke: 0, errors: [] };
  var convertedFill = processBlackChannel(item, "fill", stats);
  var convertedStroke = processBlackChannel(item, "stroke", stats);
  return convertedFill || convertedStroke;
}

function processBlackChannel(item, channel, stats) {
  var isFill = channel === "fill";
  var enabledKey = isFill ? "filled" : "stroked";
  var colorKey = isFill ? "fillColor" : "strokeColor";
  var overprintKey = isFill ? "fillOverprint" : "strokeOverprint";
  var label = isFill ? "填充" : "描边";
  try {
    if (!item[enabledKey]) return false;
    var color = item[colorKey];
    var cmyk = getEffectiveProcessCMYK(color);
    if (!cmyk) return false; // 真专色/RGB/灰度/渐变等仍不作推断性转换
    var rich = isRichBlack(cmyk);
    var single = isSingleBlack(cmyk);
    if (!rich && !single) return false;
    var neededOverprint = item[overprintKey] !== true;
    if (rich) item[colorKey] = makeSingleBlack();
    if (rich || neededOverprint) item[overprintKey] = true;
    // 写入无异常并不代表宿主实际接受了设置，读取实际属性核验。
    if (!isSingleBlack(item[colorKey]) || item[overprintKey] !== true) {
      throw new Error("写入后颜色或叠印状态核验未通过");
    }
    if (rich) stats[isFill ? "richFill" : "richStroke"]++;
    else if (neededOverprint) stats[isFill ? "singleFill" : "singleStroke"]++;
    return rich;
  } catch (e) {
    stats.errors.push((item.name || item.typename || "对象") + "的" + label + "：" + e.message);
    return false;
  }
}

// 返回对象实际使用的“过程CMYK”数值。
// 普通CMYKColor直接返回；全局Process色在Illustrator DOM中是SpotColor包装，
// 只有spot.colorType===ColorModel.PROCESS时才按底色×tint换算。真正的专色(ColorModel.SPOT)绝不进入四色黑转换。
function getEffectiveProcessCMYK(color) {
  if (!color) return null;
  if (color.typename === "CMYKColor") return color;
  if (color.typename !== "SpotColor") return null;
  try {
    if (!color.spot || color.spot.colorType !== ColorModel.PROCESS) return null;
    var base = color.spot.color;
    if (!base || base.typename !== "CMYKColor") return null;
    var factor = (color.tint === undefined ? 100 : color.tint) / 100;
    var effective = new CMYKColor();
    effective.cyan = base.cyan * factor;
    effective.magenta = base.magenta * factor;
    effective.yellow = base.yellow * factor;
    effective.black = base.black * factor;
    return effective;
  } catch (e) {
    return null;
  }
}

function isSingleBlack(color) {
  var c = getEffectiveProcessCMYK(color);
  if (!c) return false;
  // 已确认的单黑定义严格为 C0 / M0 / Y0 / K100，不自行增加数值容差。
  return c.cyan === 0 && c.magenta === 0 && c.yellow === 0 && c.black === 100;
}

// ---------- Step4b 文本框透明度核对 ----------
// 注意：这个函数必须在 Step3 转曲之前调用！转曲之后文本框(TextFrame)就变成路径/编组了，
// 再也没法按"文本框"来检查透明度。所以 main() 里特意把这个函数放在 Step3 前面调用。
//
// 现实限制说明：真正的"与标版文件核对是否一致"，需要打开另一个参考文件、逐个比对文本框
// 透明度是否相同，这版做的还是"机器把能独立完成的部分做好，方便人工核对"：把当前文件里
// 所有非100%不透明度的文本框都列出来标记待确认（正常情况下文本框不应该带透明度，这本身
// 就是个常见的误操作信号）；如果同目录下找到了匹配的标版文件，会额外提示一句，方便人工
// 自己打开来对比，但不做自动比对（EPS内容解析不是这版的范围）。
// 甲方2026-09-04确认：标版文件跟AI文件同名、格式是EPS，存放在"当天出版文件夹"——这里先
// 按跟AI文件同一个目录（doc.path）去找，如果实际上标版是放在另一个独立路径，需要再确认
// 具体规则，不能凭空猜。
function step4b_textFrameTransparencyCheck(doc) {
  var suspicious = [];
  for (var i = 0; i < doc.textFrames.length; i++) {
    var tf = doc.textFrames[i];
    if (isAuxiliaryLayer(tf.layer)) continue;
    try {
      if (tf.opacity !== 100) {
        suspicious.push((tf.contents || "").substring(0, 10) + "...(透明度" + tf.opacity + "%)");
      }
    } catch (e) {}
  }

  if (suspicious.length > 0) {
    log("Step4b-文本框透明度核对", "待人工确认", "发现 " + suspicious.length + " 个非100%不透明度的文本框：" + suspicious.join("；") + "，需人工核对是否与标版文件一致");
  } else {
    log("Step4b-文本框透明度核对", "通过", "文本框透明度均为100%，未发现异常");
  }

  var refFile = findMatchingRefFile(doc, /\.eps$/i);
  if (refFile) {
    var refHow = findMatchingRefFile.matchType === "唯一"
      ? "目录下唯一的EPS文件（与AI文件名并不相同，是否对应本文件请人工判断）"
      : "同名标版文件";
    log("Step4b-文本框透明度核对", "待人工确认", "同目录下找到" + refHow + "「" + refFile.name + "」(EPS格式)，建议人工打开逐项核对透明度是否一致（EPS内容自动解析比对不是本阶段范围）");
  } else {
    log("Step4b-文本框透明度核对", "待人工确认", "同目录下未找到与本文件同名的EPS标版文件，无法提示人工去核对哪份参考文件，请人工自行确认标版文件位置");
  }
}

// 在AI文件所在目录下，按扩展名找跟当前AI文件"同名"的参考文件（标版用.eps，小样用.jpg/.jpeg）。
// 甲方2026-09-04确认：标版/JPG小样/AI三个文件用相同的文件名，只是格式不同。
// 找不到严格同名的，退而求其次：如果该目录下这个扩展名的文件只有唯一一个，也算匹配上
// （但可信度较低，因为不能确定就是当前这份文件对应的参考文件）。
// findMatchingRefFile.matchType 记录本次命中的档位（"同名"/"唯一"），供调用方区分措辞，
// 避免把"目录下唯一近似文件"冒充"同名文件"误导人工判断。
function findMatchingRefFile(doc, extRegex) {
  findMatchingRefFile.matchType = "";
  try {
    var folder = new Folder(doc.path);
    var files = folder.getFiles(function (f) {
      return f instanceof File && extRegex.test(f.name);
    });
    if (files.length === 0) return null;

    var baseName = doc.name.replace(/\.[^.]+$/, "");
    for (var i = 0; i < files.length; i++) {
      if (files[i].name.indexOf(baseName) !== -1) {
        findMatchingRefFile.matchType = "同名";
        return files[i];
      }
    }
    if (files.length === 1) {
      findMatchingRefFile.matchType = "唯一";
      return files[0];
    }
    return null;
  } catch (e) {
    return null;
  }
}

// ---------- Step4c 专色与JPG小样一致性核对 ----------
// 现实限制说明：Illustrator 脚本没有OCR/图像识别能力，没法自动"读懂"JPG小样上标注的
// 专色文字（比如"专金PANTONE871C"这种标注），所以做不到完全自动比对。
// 这版做的是"机器把能自动做的部分做好，方便人工核对"：
// 1. 自动列出当前AI文件里实际使用的专色清单
// 2. 自动在同目录下找匹配的JPG小样文件，找到的话直接把它摆放到画板右侧（锁定、不参与后续步骤）
//    这样人工不用再去手动开另一个文件，两边并排摆在一起，一眼就能对比
// 3. 如果确实需要更进一步的自动化（比如自动识别JPG上的文字标注），需要接入外部OCR/图像识别
//    服务，这不是Illustrator脚本本身能做到的，如果这块以后要做，需要另外评估工作量和费用
function step4c_spotColorJpgCheck(doc) {
  var spotNames = [];
  for (var i = 0; i < doc.spots.length; i++) {
    if (doc.spots[i].name.toUpperCase() !== CONFIG.specLineSpotName.toUpperCase()) {
      spotNames.push(doc.spots[i].name);
    }
  }

  var jpgFile = findMatchingJpg(doc);

  if (jpgFile) {
    try {
      var refLayer = findOrCreateLayer(doc, "对照-JPG小样(人工核对专色)");
      refLayer.locked = false; // 先解锁才能放置图片
      var placed = refLayer.placedItems.add();
      placed.file = jpgFile;
      var ab = doc.artboards[0].artboardRect;
      var abWidth = ab[2] - ab[0];
      placed.position = [ab[2] + 40, ab[1]]; // 摆在画板右侧，留40pt间距
      refLayer.locked = true;
      var jpgHow = findMatchingRefFile.matchType === "唯一"
        ? "目录下唯一的JPG小样（与AI文件名并不相同，对应关系请人工判断）"
        : "同名JPG小样";
      log("Step4c-专色与JPG小样核对", "待人工确认",
        "当前AI文件专色清单：" + (spotNames.length > 0 ? spotNames.join("、") : "无") +
        "；已找到" + jpgHow + "「" + jpgFile.name + "」并摆放在画板右侧「" + refLayer.name + "」图层，请人工对照小样上的专色标注核对是否一致（自动识别图片文字暂不支持）");
    } catch (e) {
      log("Step4c-专色与JPG小样核对", "待人工确认", "找到JPG小样「" + jpgFile.name + "」但自动摆放失败(" + e.message + ")，请人工手动打开对比。当前AI文件专色清单：" + spotNames.join("、"));
    }
  } else {
    log("Step4c-专色与JPG小样核对", "待人工确认", "未在同目录找到匹配的JPG小样文件，无法自动摆放对照，请人工提供小样文件核对。当前AI文件专色清单：" + (spotNames.length > 0 ? spotNames.join("、") : "无"));
  }
}

// 找同目录下跟当前AI文件同名的 jpg/jpeg 小样文件（甲方2026-09-04确认：JPG小样文件名
// 跟AI文件同名）。逻辑跟Step4b标版文件的查找共用同一个 findMatchingRefFile 函数。
function findMatchingJpg(doc) {
  return findMatchingRefFile(doc, /\.(jpg|jpeg)$/i);
}

// 把类似 "pantone123c" / "Pantone 123 C" 这种写法统一成 "PANTONE 123 C"
function normalizePantoneName(name) {
  var upper = name.toUpperCase();
  var match = upper.match(/PANTONE\s*([0-9A-Z]+?)\s*([CUM])\b/);
  if (!match) return null; // 不是标准潘通命名格式的，不处理，避免误改专用色（如"刀线"）
  var code = match[1];
  var suffix = match[2];
  return "PANTONE " + code + " " + suffix;
}

function isRichBlack(cmyk) {
  // 甲方确认：四色黑按CMYK四通道均>=80%判断。
  // 2026-09-08真机文件发现：Illustrator面板显示K=80%，文件内部可能保存为79.9985之类浮点值。
  // 为了与面板显示口径一致，仅在四色黑阈值判断时先按两位小数四舍五入；单黑C0/M0/Y0/K100仍严格判断，不使用此规则。
  var cyan = Math.round(cmyk.cyan * 100) / 100;
  var magenta = Math.round(cmyk.magenta * 100) / 100;
  var yellow = Math.round(cmyk.yellow * 100) / 100;
  var black = Math.round(cmyk.black * 100) / 100;
  return cyan >= CONFIG.richBlackThreshold &&
         magenta >= CONFIG.richBlackThreshold &&
         yellow >= CONFIG.richBlackThreshold &&
         black >= CONFIG.richBlackThreshold;
}

function makeSingleBlack() {
  var c = new CMYKColor();
  c.cyan = 0;
  c.magenta = 0;
  c.yellow = 0;
  c.black = 100;
  return c;
}

// ---------- Step5 规格线（刀线）叠印描边检测与自动修正 ----------
function step5_checkSpecLineOverprint(doc) {
  // 跟Step3的边界判断共用 findSpecLinePaths，之前这里跟getBoundaryFromSpecLine一样
  // 只查doc.pathItems，如果刀线是复合路径就会漏检，现在统一改成同一个函数，两处不会再走偏
  var specPaths = findSpecLinePaths(doc);
  if (specPaths.length === 0) {
    log("Step5-规格线叠印", "异常【高优先级】", "未在文件中找到名为「" + CONFIG.specLineSpotName + "」的规格线专色，请人工确认（按尺寸自动判断规格线是甲方8/21新增需求，需另建版面尺寸数据库，本阶段暂未实现）");
    return;
  }
  for (var i = 0; i < specPaths.length; i++) {
    var p = specPaths[i];
    try {
      var overprint = p.strokeOverprint;
      if (overprint) {
        log("Step5-规格线叠印", "通过", "叠印状态：true");
      } else {
        // 修正前不落"异常"级（避免 hold 污染 step9 的暂停判定）；修正失败才落 hold，成功只落 fixed
        p.strokeOverprint = true;
        var verified = false;
        try { verified = p.strokeOverprint === true; } catch (eV) { verified = false; }
        if (verified) {
          log("Step5-规格线叠印", "已自动修正", "该路径叠印描边原为 false，已设为 true 并核验生效");
        } else {
          log("Step5-规格线叠印", "异常【高优先级】", "该路径叠印描边为 false 且自动修正未生效，请人工设置叠印");
        }
      }
    } catch (e) {
      var pname = "(未命名对象)";
      try { pname = p.name || pname; } catch (eN) {}
      log("Step5-规格线叠印", "待人工确认", "读取/设置规格线路径「" + pname + "」叠印状态失败：" + e.message + "，请人工检查");
    }
  }
}

// ---------- Step6 按产品类型自动建立出血蒙版 ----------
// 已确认业务规则：蒙版线 = 主刀线 + 出血距离；标签总出血3mm=单边1.5mm，礼盒总出血5mm=单边2.5mm。
// 2026-09-09会议新增明确要求：
// 1) 蒙版容器位于图层最顶层；
// 2) 版面内所有生产图文元素（包含刀线）均受蒙版裁切，蒙版为最终有效可视区域；
// 3) 蒙版路径只保留路径本身，禁止填充、描边，不属于可印刷要素；
// 4) 输出前再次核查蒙版层级、裁切关系、无填充/无描边，避免局部内容漏出。
//
// 为避免重新破坏已经正常的对象层级，本版仍沿用08d“每个顶层对象/原编组在原位置套同一边界裁切”的结构；
// 只把蒙版总容器从旧版最底层改为最终最顶层，并增加严格的输出前结构核验。
// 如果后续业务明确要求“整份文件只能有一条单一裁切路径”，需另行确认后再改，不在本轮自行猜测。
function step6_buildBleedMask(doc, productType) {
  productType = productType || "标签";
  var bleedTotalMM = CONFIG.bleedByType[productType];
  if (bleedTotalMM === undefined) {
    log("Step6-建蒙版", "异常【高优先级】", "未找到产品类型「" + productType + "」对应的出血值配置，请人工确认");
    return;
  }
  var bleedPerSideMM = bleedTotalMM / 2;

  var boundary = getBoundaryFromSpecLine(doc, productType, true);
  if (!boundary) {
    log("Step6-建蒙版", "异常【高优先级】", "未确认唯一主刀线，未使用画板尺寸兜底；按会议规则必须先确认刀线，再计算蒙版");
    throw new Error("主刀线未确认，无法建立正确蒙版。");
  }
  if (boundary[2] <= boundary[0] || boundary[1] <= boundary[3]) {
    throw new Error("Step6蒙版范围无效，未创建剪切蒙版。");
  }

  var sourceLayers = [];
  for (var i = 0; i < doc.layers.length; i++) {
    if (!isAuxiliaryLayer(doc.layers[i])) sourceLayers.push(doc.layers[i]);
  }
  if (sourceLayers.length === 0) {
    log("Step6-建蒙版", "待人工确认", "没有可纳入蒙版的生产图层");
    return;
  }

  // 复杂版保护：在Step6真正改变层级前记录原始顶层顺序、每层直接对象顺序和对象几何范围。
  // 蒙版完成后逐项核验；只要发现位置或相对层级发生变化，就按异常停止，不把错误结构当成功。
  var maskInputSnapshot = captureMaskInputSnapshot(sourceLayers);

  var maskLayer = doc.layers.add();
  maskLayer.name = CONFIG.maskLayerName;
  maskLayer.zOrder(ZOrderMethod.BRINGTOFRONT);
  var stats = { masks: 0, items: 0 };
  var layerLockStates = [];
  try {
    // 09b真机修复：先记录并递归解锁全部生产图层/子图层，整个蒙版建立和图层收纳期间保持解锁。
    // 09a在递归处理每层结束时立即恢复锁定，随后移动父图层时会触发“Cannot modify a layer that is locked”。
    for (var ul = 0; ul < sourceLayers.length; ul++) {
      captureAndUnlockLayerTree(sourceLayers[ul], layerLockStates);
    }

    // 每个真实生产顶层对象/原编组在原位置套同一最终边界，不移动对象坐标、不拆原稿编组。
    for (var sl = 0; sl < sourceLayers.length; sl++) {
      addBleedMasksToLayer(sourceLayers[sl], boundary, stats);
    }

    // 将原生产图层按原先从前到后的顺序收纳到蒙版总容器；此时全部子图层仍保持临时解锁。
    for (var ml = 0; ml < sourceLayers.length; ml++) {
      sourceLayers[ml].move(maskLayer, ElementPlacement.PLACEATEND);
    }

    if (stats.masks === 0) throw new Error("未建立任何实际剪切关系");
    maskLayer.zOrder(ZOrderMethod.BRINGTOFRONT);
    verifyMaskInputSnapshot(maskLayer, sourceLayers, maskInputSnapshot);
    verifyMaskStructure(doc, maskLayer, boundary);
  } catch (e) {
    if (maskLayer.layers.length === 0 && maskLayer.pageItems.length === 0) {
      try { maskLayer.remove(); } catch (removeError) {}
    }
    log("Step6-建蒙版", "异常【高优先级】", "剪切蒙版未全部完成，已停止后续步骤：" + e.message);
    throw e;
  } finally {
    // 无论成功或报错，都按“子层先、父层后”的顺序恢复进入Step6前的锁定状态。
    restoreLayerLockStates(layerLockStates);
  }

  log("Step6-建蒙版", "已处理", "产品类型：" + productType + "，总出血 " + bleedTotalMM +
    "mm（单边 " + bleedPerSideMM + "mm）；主刀线+出血范围；已建立并核验 " + stats.masks +
    " 个真实剪切蒙版，覆盖 " + stats.items +
    " 个顶层对象/原编组。原生产图层按原顺序收纳到最顶层「" + CONFIG.maskLayerName + "」；已复核生产图层顺序及对象几何位置未变化；所有自动蒙版路径均无填充、无描边，只限定可视范围，不作为印刷要素。");
}


function captureMaskInputSnapshot(sourceLayers) {
  var snapshot = { topLayers: [], layerRecords: [] };
  for (var i = 0; i < sourceLayers.length; i++) {
    snapshot.topLayers.push(sourceLayers[i]);
    captureMaskLayerSnapshot(sourceLayers[i], snapshot.layerRecords);
  }
  return snapshot;
}

function captureMaskLayerSnapshot(layer, records) {
  var record = { layer: layer, items: [] };
  var items = layer.pageItems;
  for (var i = 0; i < items.length; i++) {
    var item = items[i];
    if (item.parent !== layer) continue;
    try { if (item.guides) continue; } catch (e0) {}
    var b = null;
    try {
      var gb = item.geometricBounds;
      b = [gb[0], gb[1], gb[2], gb[3]];
    } catch (e1) {}
    record.items.push({ item: item, bounds: b });
  }
  records.push(record);
  for (var j = 0; j < layer.layers.length; j++) {
    captureMaskLayerSnapshot(layer.layers[j], records);
  }
}

function verifyMaskInputSnapshot(maskLayer, sourceLayers, snapshot) {
  // 1) 顶层生产图层进入蒙版容器后，相对顺序必须与进入Step6前完全一致。
  if (maskLayer.layers.length !== sourceLayers.length) {
    throw new Error("复杂版保护核验失败：蒙版容器内生产图层数量与处理前不一致");
  }
  for (var i = 0; i < sourceLayers.length; i++) {
    if (maskLayer.layers[i] !== sourceLayers[i]) {
      throw new Error("复杂版保护核验失败：生产图层相对顺序发生变化");
    }
  }

  // 2) 每个原直接对象必须仍是同一个对象，只是被同位置的自动裁切组包裹；几何范围不得改变。
  for (var r = 0; r < snapshot.layerRecords.length; r++) {
    var rec = snapshot.layerRecords[r];
    var wrappers = [];
    var direct = rec.layer.pageItems;
    for (var d = 0; d < direct.length; d++) {
      if (direct[d].parent !== rec.layer) continue;
      if (direct[d].typename === "GroupItem" && direct[d].note === AUTO_BLEED_GROUP_NOTE) {
        wrappers.push(direct[d]);
      }
    }
    if (wrappers.length !== rec.items.length) {
      throw new Error("复杂版保护核验失败：图层「" + rec.layer.name + "」蒙版前后直接对象数量/包装关系不一致");
    }

    for (var k = 0; k < rec.items.length; k++) {
      var original = rec.items[k].item;
      if (!original.parent || original.parent !== wrappers[k]) {
        throw new Error("复杂版保护核验失败：图层「" + rec.layer.name + "」对象相对顺序发生变化");
      }
      if (rec.items[k].bounds) {
        try {
          if (!boundsEqualWithin(original.geometricBounds, rec.items[k].bounds, 0.05)) {
            throw new Error("复杂版保护核验失败：图层「" + rec.layer.name + "」存在对象位置/尺寸变化");
          }
        } catch (geometryError) {
          if (String(geometryError.message || geometryError).indexOf("复杂版保护核验失败") !== -1) throw geometryError;
          throw new Error("复杂版保护核验失败：无法复核图层「" + rec.layer.name + "」对象几何位置");
        }
      }
    }
  }
}

function captureAndUnlockLayerTree(layer, records) {
  var wasLocked = false;
  try {
    wasLocked = layer.locked;
    records.push({ layer: layer, locked: wasLocked });
    if (wasLocked) layer.locked = false;
  } catch (e) {
    throw new Error("无法临时解锁图层「" + layer.name + "」：" + e.message);
  }

  for (var i = 0; i < layer.layers.length; i++) {
    captureAndUnlockLayerTree(layer.layers[i], records);
  }
}

function restoreLayerLockStates(records) {
  for (var i = records.length - 1; i >= 0; i--) {
    try { records[i].layer.locked = records[i].locked; } catch (e) {}
  }
}

function addBleedMasksToLayer(layer, boundary, stats) {
  if (isAuxiliaryLayer(layer)) return;
  // 锁定状态由step6_buildBleedMask统一管理；这里不能处理中途恢复锁定，否则后续父层move()可能失败。
  var wasVisible = layer.visible;
  try {
    layer.visible = true;
    var items = [];
    var sublayers = [];
    for (var i = 0; i < layer.pageItems.length; i++) {
      if (layer.pageItems[i].parent === layer) items.push(layer.pageItems[i]);
    }
    for (var j = 0; j < layer.layers.length; j++) sublayers.push(layer.layers[j]);

    // 已有图层级裁切结构不擅自拆；遇到时直接停，保留现场人工确认。
    for (var c = 0; c < items.length; c++) {
      if (items[c].typename === "PathItem" && items[c].clipping) {
        throw new Error("图层「" + layer.name + "」含顶层裁切路径，需保留原有裁切结构后人工核对");
      }
    }

    for (var k = 0; k < items.length; k++) {
      if (items[k].guides) continue;
      wrapItemInBleedMask(layer, items[k], boundary);
      stats.masks++;
      stats.items++;
    }
    for (var s = 0; s < sublayers.length; s++) addBleedMasksToLayer(sublayers[s], boundary, stats);
  } finally {
    layer.visible = wasVisible;
  }
}

function wrapItemInBleedMask(layer, item, boundary) {
  var wasLocked = item.locked;
  var wasHidden = item.hidden;
  var group = null;
  try {
    item.locked = false;
    item.hidden = false;
    group = layer.groupItems.add();
    group.name = "出血剪切蒙版";
    group.note = AUTO_BLEED_GROUP_NOTE;
    group.move(item, ElementPlacement.PLACEBEFORE);
    item.move(group, ElementPlacement.PLACEATEND);

    var clip = group.pathItems.rectangle(
      boundary[1],
      boundary[0],
      boundary[2] - boundary[0],
      boundary[1] - boundary[3]
    );
    clip.name = "出血裁切路径";
    clip.note = AUTO_BLEED_PATH_NOTE;
    clip.filled = false;
    clip.stroked = false;
    clip.clipping = true;
    clip.zOrder(ZOrderMethod.BRINGTOFRONT);
    group.clipped = true;

    if (!group.clipped || !clip.clipping || clip.filled || clip.stroked ||
        item.parent !== group || clip.parent !== group) {
      throw new Error("剪切关系或蒙版无填充/无描边核验失败");
    }
  } catch (e) {
    if (group) {
      try {
        if (item.parent === group) item.move(group, ElementPlacement.PLACEBEFORE);
        if (item.parent === layer) group.remove();
      } catch (rollbackError) {
        log("Step6-局部恢复", "异常【高优先级】", "原对象保留在当前文件，局部恢复失败：" + rollbackError.message);
      }
    }
    throw e;
  } finally {
    item.hidden = wasHidden;
    item.locked = wasLocked;
  }
}

function findAutoMaskLayer(doc) {
  for (var i = 0; i < doc.layers.length; i++) {
    if (doc.layers[i].name === CONFIG.maskLayerName) return doc.layers[i];
  }
  return null;
}

function boundsEqualWithin(a, b, tolerancePt) {
  if (!a || !b) return false;
  return Math.abs(a[0] - b[0]) <= tolerancePt &&
         Math.abs(a[1] - b[1]) <= tolerancePt &&
         Math.abs(a[2] - b[2]) <= tolerancePt &&
         Math.abs(a[3] - b[3]) <= tolerancePt;
}

function isLayerInside(layer, ancestorLayer) {
  var current = layer;
  while (current && current.typename === "Layer") {
    if (current === ancestorLayer) return true;
    current = current.parent;
  }
  return false;
}

function verifyAllProductionItemsAreMasked(layer, errors) {
  var items = layer.pageItems;
  for (var i = 0; i < items.length; i++) {
    var item = items[i];
    if (item.parent !== layer) continue;
    try {
      if (item.guides) continue;
    } catch (e1) {}
    if (item.typename !== "GroupItem" || item.note !== AUTO_BLEED_GROUP_NOTE || !item.clipped) {
      errors.push("图层「" + layer.name + "」存在未纳入自动蒙版的顶层生产对象");
    }
  }
  for (var j = 0; j < layer.layers.length; j++) {
    verifyAllProductionItemsAreMasked(layer.layers[j], errors);
  }
}

function verifyMaskStructure(doc, maskLayer, boundary) {
  var errors = [];

  try {
    if (doc.layers.length === 0 || doc.layers[0] !== maskLayer) {
      errors.push("蒙版容器不是图层最顶层");
    }
  } catch (e1) {
    errors.push("无法核验蒙版顶层位置");
  }

  // 顶层不允许残留未纳入蒙版的生产图层；对照层/保线候选等辅助层不作为生产内容。
  for (var li = 0; li < doc.layers.length; li++) {
    var layer = doc.layers[li];
    if (layer === maskLayer || isAuxiliaryLayer(layer)) continue;
    errors.push("生产图层「" + layer.name + "」仍在蒙版容器外");
  }

  // 蒙版容器中的每个生产层都必须只剩“自动蒙版组”作为直接生产对象，确保没有局部内容漏出裁切。
  for (var ml = 0; ml < maskLayer.layers.length; ml++) {
    verifyAllProductionItemsAreMasked(maskLayer.layers[ml], errors);
  }

  var groupCount = 0;
  var pathCount = 0;
  for (var gi = 0; gi < doc.groupItems.length; gi++) {
    var group = doc.groupItems[gi];
    if (group.note !== AUTO_BLEED_GROUP_NOTE) continue;
    if (!isLayerInside(group.layer, maskLayer)) continue;
    groupCount++;
    if (!group.clipped) errors.push("发现未启用裁切的自动蒙版组");

    var directMaskCount = 0;
    for (var pi = 0; pi < group.pathItems.length; pi++) {
      var p = group.pathItems[pi];
      if (p.parent !== group || p.note !== AUTO_BLEED_PATH_NOTE) continue;
      directMaskCount++;
      pathCount++;
      if (!p.clipping) errors.push("自动蒙版路径未设置为clipping");
      if (p.filled) errors.push("自动蒙版路径存在填充");
      if (p.stroked) errors.push("自动蒙版路径存在描边");
      try {
        if (!boundsEqualWithin(p.geometricBounds, boundary, 0.05)) {
          errors.push("自动蒙版路径尺寸/位置与主刀线+出血边界不一致");
        }
      } catch (e2) {
        errors.push("无法读取自动蒙版路径几何边界");
      }
    }
    if (directMaskCount !== 1) errors.push("某个自动蒙版组未且仅含1条自动裁切路径");
  }

  if (groupCount === 0 || pathCount === 0) errors.push("未找到有效自动蒙版组/路径");
  if (groupCount !== pathCount) errors.push("自动蒙版组数量与裁切路径数量不一致");

  if (RUNTIME_SPEC_PATH) {
    try {
      if (!isLayerInside(RUNTIME_SPEC_PATH.layer, maskLayer)) {
        errors.push("已确认主刀线未被纳入蒙版容器");
      }
    } catch (e3) {
      errors.push("无法核验主刀线是否位于蒙版内");
    }
  }

  if (errors.length > 0) {
    throw new Error(errors.slice(0, 8).join("；"));
  }
}

function step6_finalizeMaskBeforeOutput(doc, productType) {
  var maskLayer = findAutoMaskLayer(doc);
  if (!maskLayer) {
    log("Step6-输出前蒙版核查", "异常【高优先级】", "未找到「" + CONFIG.maskLayerName + "」图层");
    return;
  }

  var boundary = getBoundaryFromSpecLine(doc, productType, true);
  if (!boundary) {
    log("Step6-输出前蒙版核查", "异常【高优先级】", "主刀线/蒙版边界无法重新读取");
    return;
  }

  try {
    maskLayer.locked = false;
    maskLayer.zOrder(ZOrderMethod.BRINGTOFRONT); // Step7可能新增辅助层，输出前强制恢复蒙版为最终最顶层
    verifyMaskStructure(doc, maskLayer, boundary);
    log("Step6-输出前蒙版核查", "通过",
      "蒙版容器位于图层最顶层；所有生产图层均在蒙版容器内；主刀线已纳入；自动裁切路径均无填充、无描边，且尺寸/位置与主刀线+出血边界一致。");
  } catch (e) {
    log("Step6-输出前蒙版核查", "异常【高优先级】", e.message);
  }
}

// ---------- Step7 银卡纸垫白核对（保线本轮暂停） ----------
// 保线（trapping）本轮完全暂停：不检测、不生成候选描边、不改版面或蒙版范围。
// 真正的保线方向、宽度和例外规则需结合甲方人工正确保线样本另行确定，本轮不自行猜测。
// （原 trappingCandidates 启发式检测函数已随“保线暂停”移除，见更新日志 V0.1。）
//
// 注意：whiteBaseCheck 原与保线检测打包一起排在 Step2 分色拆分之后执行，复查发现会失效——
// Step2 会把「白版」/「纳米版」图层里的对象按颜色搬空，whiteBaseCheck 读到时就已是空的，
// 会误判成「数量一致、通过」。现单独提到 zbRun 里 Step2 之前执行。
// 银卡纸垫白核对：对比"白版"图层和"纳米版"图层的对象数量，数量差异大说明可能有遗漏
// （对应真实验证过的案例："本香"两字漏做垫白）。这是一个数量级的启发式检查，
// 不是像素级覆盖范围比对，精确的覆盖范围比对需要几何面积运算，后续阶段再细化。
function whiteBaseCheck(doc) {
  // 甲方实际文件里图层名字可能写"白版"也可能写"白板"，两种写法都要能识别到
  var whiteLayer = findLayerByNameContains(doc, "白版") || findLayerByNameContains(doc, "白板");
  var nanoLayer = findLayerByNameContains(doc, "纳米版");

  if (!whiteLayer || !nanoLayer) {
    log("Step7-银卡垫白核对", "通过", "未在文件中找到「白版」或「纳米版」图层，跳过垫白核对（可能不是银卡产品）");
    return;
  }

  var whiteCount = countAllDescendantItems(whiteLayer);
  var nanoCount = countAllDescendantItems(nanoLayer);

  if (nanoCount > 0 && whiteCount < nanoCount) {
    log("Step7-银卡垫白核对", "待人工确认",
      "「" + nanoLayer.name + "」有 " + nanoCount + " 个对象，「" + whiteLayer.name + "」只有 " + whiteCount + " 个，白版覆盖范围可能不足，需人工核对是否有遗漏垫白");
  } else {
    log("Step7-银卡垫白核对", "通过", "「" + whiteLayer.name + "」(" + whiteCount + "个) 与「" + nanoLayer.name + "」(" + nanoCount + "个) 对象数量核对一致");
  }
}

function findLayerByNameContains(doc, keyword) {
  for (var i = 0; i < doc.layers.length; i++) {
    if (doc.layers[i].name.indexOf(keyword) !== -1) return doc.layers[i];
  }
  return null;
}

function countAllDescendantItems(container) {
  var count = 0;
  var children = container.pageItems;
  for (var i = 0; i < children.length; i++) {
    count++;
    if (children[i].typename === "GroupItem") {
      count += countAllDescendantItems(children[i]);
    }
  }
  return count;
}

// ---------- Step8 图层归类候选方案生成 ----------
// 按预设规则把对象归到"文字 / 框 / 底图图案"三类候选结果。
// 注意：这里故意不把对象物理搬到新图层——因为 Step2 已经按颜色把对象分到了
// "分色-XXX" 图层里，如果这里又按角色搬一次图层，会跟 Step2 的结果互相打架。
// 所以图层归类候选方案改成"打标签"的方式：给每个对象的 note 属性写入分类结果
// (classify:文字 / classify:框 / classify:底图图案)，人工可以在 Illustrator 里
// 用"选择 > 相同 > 备注"这类功能按分类挑选核对，报告里也会列出每类的数量。
function step8_layerClassificationCandidates(doc) {
  var counts = { "文字": 0, "框": 0, "底图图案": 0 };
  var mixedGroups = 0;

  var items = [];
  var contentLayers = getPostMaskContentLayers(doc);
  for (var li = 0; li < contentLayers.length; li++) {
    var originals = getLayerOriginalItems(contentLayers[li]);
    for (var pi = 0; pi < originals.length; pi++) items.push(originals[pi]);
  }

  for (var t = 0; t < items.length; t++) {
    var result = classifyRole(items[t]);
    if (result === null) {
      mixedGroups++;
      continue;
    }
    try { items[t].note = (items[t].note || "") + " classify:" + result; } catch (e) {}
    counts[result]++;
  }

  log("Step8-图层归类候选方案", "已处理",
    "候选归类结果：文字 " + counts["文字"] + " 个、框 " + counts["框"] + " 个、底图图案 " + counts["底图图案"] + " 个" +
    (mixedGroups > 0 ? "；另有 " + mixedGroups + " 个混合/无法判定对象需人工核验" : ""));
  if (mixedGroups > 0) {
    log("Step8-图层归类候选方案", "待人工确认", mixedGroups + " 个对象归类不明确，需人工核验分类");
  }
}

// 返回 "文字" / "框" / "底图图案"，无法判定返回 null
function classifyRole(item) {
  try {
    if (item.note && item.note.indexOf("was:text") !== -1) return "文字";

    if (item.typename === "GroupItem") {
      var childKeys = {};
      var kids = item.pageItems;
      for (var i = 0; i < kids.length; i++) {
        var k = classifyRole(kids[i]);
        if (k !== null) childKeys[k] = true;
      }
      var distinct = 0, only = null;
      for (var kk in childKeys) { distinct++; only = kk; }
      return distinct === 1 ? only : null;
    }

    if (item.typename === "PlacedItem" || item.typename === "RasterItem") return "底图图案";

    if (item.typename === "PathItem" || item.typename === "CompoundPathItem") {
      var stroked = item.stroked;
      var filled = item.filled;
      if (stroked && !filled) return "框"; // 只有描边没有填充，按"框/线"处理
      if (filled) return "底图图案"; // 有填充的图形内容，默认归为底图/图案
    }
  } catch (e) {}
  return null;
}

// ---------- Step9 导出前校验 ----------
function step9_preExportCheck() {
  for (var i = 0; i < LOG.length; i++) {
    // 读结构化级别，不再匹配日志文字（详情里出现“异常”二字不会被误判）
    if (LOG[i].level === "hold" || LOG[i].level === "review") {
      log("Step9-导出前校验", "已暂停", "前序步骤存在异常或待确认项，按安全边界原则暂停导出，等待人工确认");
      return false;
    }
  }
  log("Step9-导出前校验", "通过", "前序步骤均无异常，可以继续导出");
  return true;
}

// ---------- 自动开启并核验叠印预览 ----------
// .aia原文件中的「打开叠印预览」为eventCount=0，本版完全移除对该动作的依赖。
// getViewMode()/菜单命令ink的依据：Adobe Community，2025-01-18，
// https://community.adobe.com/t5/illustrator-discussions/how-do-i-check-in-a-script-that-overprint-preview-has-already-been-enabled/td-p/15098023
// 不通过“命令没报错”推定成功：先读状态，仅关闭时切换一次，再读取实际状态。
// 不盲目切换分色预览面板本身；窗口是否展开与叠印预览是否启用分别对待。
function readOverprintPreviewState(doc) {
  try {
    var mode = doc.getViewMode();
    if (mode === "OverprintPreview") return { known: true, enabled: true, mode: mode };
    if (mode === "DefaultPreview" || mode === "PixelPreview") {
      return { known: true, enabled: false, mode: mode };
    }
    return { known: false, enabled: false, mode: String(mode), reason: "返回了未识别的视图模式：" + String(mode) };
  } catch (e) {
    return { known: false, enabled: false, mode: "", reason: "当前Illustrator无法读取叠印预览状态：" + e.message };
  }
}

function enableOverprintPreview(doc) {
  var before;
  try {
    doc.activate();
    before = readOverprintPreviewState(doc);
    if (!before.known) {
      var unknownDetail = before.reason + "；为避免把已开启的预览反向关闭，本次未自动切换";
      log("叠印预览", "待人工确认", unknownDetail);
      return { verified: false, detail: unknownDetail };
    }
    if (before.enabled) {
      log("叠印预览", "通过", "读取视图模式为OverprintPreview，已开启；不重复切换");
      return { verified: true, detail: "叠印预览原本已开启" };
    }
    app.executeMenuCommand("ink");
    app.redraw();
    var after = readOverprintPreviewState(doc);
    if (after.known && after.enabled) {
      log("叠印预览", "已自动修正", "已由" + before.mode + "切换，重新读取并确认OverprintPreview；未调用外部动作集");
      return { verified: true, detail: "叠印预览已开启并核验" };
    }
    var failedDetail = "已请求开启叠印预览，但状态核验未通过" + (after.reason ? "：" + after.reason : "（当前" + after.mode + "）");
    log("叠印预览", "待人工确认", failedDetail);
    return { verified: false, detail: failedDetail };
  } catch (e) {
    var errorDetail = "叠印预览执行未完成：" + e.message;
    log("叠印预览", "待人工确认", errorDetail);
    return { verified: false, detail: errorDetail };
  }
}

// 本文件不再自执行；由「自动制版」CEP 面板调用 zbPrecheck() / zbRun()。
