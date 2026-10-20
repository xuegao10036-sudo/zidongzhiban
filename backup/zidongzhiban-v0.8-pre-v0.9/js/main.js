/* 自动制版 面板前端逻辑 (CEP) */
(function () {
  "use strict";

  var PANEL_VER = "V0.8";
  var JS_BUILD = "20261009-8";
  // 必须与 jsx/zhiban.jsx 里的 ZB_BUILD 保持一致。
  // 每次返回值都带 build，前端据此判断引擎里加载的是不是当前版本：
  // 不一致就强制 $.evalFile 重载（所以改完 jsx 无需重启 Illustrator）。
  var JSX_BUILD = "0.8";
  var BUSY_TIMEOUT_MS = 20000;

  window.onerror = function (msg, line) {
    try {
      var el = document.getElementById("error");
      if (el) { el.textContent = "JS运行错误: " + msg + (line ? " (行 " + line + ")" : ""); el.classList.remove("hidden"); }
    } catch (e) {}
    return false;
  };

  function $(id) { return document.getElementById(id); }
  function inCEP() { return !!(window.__adobe_cep__ && window.__adobe_cep__.evalScript); }

  // ---------- Base64 → UTF-8 字符串（兼容 jsx 万一走 base64 返回）----------
  function b64ToStr(b64) {
    b64 = String(b64).replace(/[^A-Za-z0-9+/=]/g, "");
    var bytes = [];
    var bin = null;
    try { if (typeof atob === "function") bin = atob(b64); } catch (e) { bin = null; }
    if (bin !== null) {
      for (var bi = 0; bi < bin.length; bi++) bytes.push(bin.charCodeAt(bi) & 0xFF);
    } else {
      var chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
      var buf = 0, bits = 0;
      for (var i = 0; i < b64.length; i++) {
        var c = b64.charAt(i);
        if (c === "=") break;
        var idx = chars.indexOf(c);
        if (idx < 0) continue;
        buf = (buf << 6) | idx; bits += 6;
        if (bits >= 8) { bits -= 8; bytes.push((buf >> bits) & 0xFF); }
      }
    }
    var out = "", j = 0;
    while (j < bytes.length) {
      var b = bytes[j++];
      if (b < 0x80) out += String.fromCharCode(b);
      else if (b < 0xE0) out += String.fromCharCode(((b & 0x1F) << 6) | (bytes[j++] & 0x3F));
      else if (b < 0xF0) out += String.fromCharCode(((b & 0x0F) << 12) | ((bytes[j++] & 0x3F) << 6) | (bytes[j++] & 0x3F));
      else {
        var cp = ((b & 0x07) << 18) | ((bytes[j++] & 0x3F) << 12) | ((bytes[j++] & 0x3F) << 6) | (bytes[j++] & 0x3F);
        cp -= 0x10000;
        out += String.fromCharCode(0xD800 + (cp >> 10), 0xDC00 + (cp & 0x3FF));
      }
    }
    return out;
  }

  // 统一解析返回值：纯 JSON 优先，其次 base64，再次 URL 编码
  function parseResult(result) {
    try {
      if (!result || result === "undefined" || result === "EvalScript error.") return null;
      if (result.charAt(0) === "%") return JSON.parse(decodeURIComponent(result));
      if (/^[A-Za-z0-9+/=]+$/.test(result) && result.charAt(0) !== "{") return JSON.parse(b64ToStr(result));
      return JSON.parse(result);
    } catch (e) { return null; }
  }

  var jsxPathCache = "";
  function jsxFilePath() {
    if (jsxPathCache) return jsxPathCache;
    var extPath = "";
    try { extPath = decodeURI(window.__adobe_cep__.getSystemPath("extension")); } catch (e) {}
    var p = (extPath + "/jsx/zhiban.jsx").replace(/\\/g, "/");
    if (extPath) jsxPathCache = p;
    return p;
  }

  var jsxReady = false;
  function execJsx(call, cb) {
    var withLoad = '$.evalFile("' + jsxFilePath() + '"); ' + call;
    var first = jsxReady ? call : withLoad;
    var retried = false;   // 重载只允许一次，防止失败后递归重跑业务
    function handle(data, raw) {
      // 版本匹配：引擎已就绪，正常回调
      if (data && data.build === JSX_BUILD) { jsxReady = true; cb(data, raw); return; }
      // 解析失败 = 脚本抛错/返回异常。绝不能当成"版本过期"而自动重跑 ——
      // zbRun 不可逆，重跑由 jsx 的对照层检查兜底只是最后防线，不该走到那一步
      if (!data) { cb(null, raw); return; }
      // 版本确实不匹配：仅当第一次没带 evalFile 时重载一次
      if (retried || first === withLoad) { jsxReady = false; cb(data, raw); return; }
      retried = true;
      window.__adobe_cep__.evalScript(withLoad, function (result2) {
        var data2 = parseResult(result2);
        jsxReady = !!(data2 && data2.build === JSX_BUILD);
        cb(data2, result2);
      });
    }
    window.__adobe_cep__.evalScript(first, function (result) {
      handle(parseResult(result), result);
    });
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  // ---------- 状态 ----------
  var PRODUCT_TYPE = "标签";
  var PRECHECK = null;     // zbPrecheck 的原始数据
  var SPECS = [];          // 刀线候选（面积大到小）
  var SPEC_INDEX = 0;
  var running = false;
  var busyTimer = null;

  function showError(msg) {
    var el = $("error");
    if (!el) return;   // 与 showNotice 同样的空引用保护（DOM 不全时静默降级）
    el.textContent = msg; el.classList.remove("hidden");
    $("notice").classList.add("hidden");
    $("loading").classList.add("hidden");
  }
  var noticeTimer = null;
  function showNotice(msg) {
    var el = $("notice");
    if (!el) return;
    el.textContent = msg; el.classList.remove("hidden");
    $("error").classList.add("hidden");
    if (noticeTimer) clearTimeout(noticeTimer);
    noticeTimer = setTimeout(function () { el.classList.add("hidden"); }, 5000);
  }
  function setBusy(on) {
    running = on;
    $("loading").classList.toggle("hidden", !on);
    if (!on) $("btnRun").disabled = !canRun();
  }

  // 只有预检通过才能开跑（V0.7：文档是否另存不再作为开跑条件，仅作信息展示）
  function canRun() {
    var d = PRECHECK;
    if (!d || !d.ok) return false;
    if (d.hasBeforeLayer) return false;
    if (d.specCount < 1) return false;
    return true;
  }

  // 产品类型分段控件：同步高亮（避免依赖 NodeList.forEach，与家族面板写法一致）
  function syncSeg() {
    var btns = $("segType").getElementsByTagName("button");
    for (var i = 0; i < btns.length; i++) {
      var on = btns[i].getAttribute("data-type") === PRODUCT_TYPE;
      if (on) btns[i].classList.add("active"); else btns[i].classList.remove("active");
    }
  }

  // ---------- 预检渲染（决策优先：先讲能不能开跑、要你做什么）----------
  function renderPrecheck(d) {
    PRECHECK = d;
    SPECS = (d && d.specs) ? d.specs : [];
    if (SPEC_INDEX >= SPECS.length) SPEC_INDEX = 0;

    var foot = $("foot"), docCard = $("doc");
    var docHtml = "";

    if (!d) {
      docCard.innerHTML = '<div class="card-body">预检失败：未取到脚本返回结果。</div>';
      $("btnRun").disabled = true;
      return;
    }

    // 文档卡
    if (d.ok || d.docName) {
      var rows = "";
      rows += '<div class="row"><span class="row-t">文件</span><span class="dim" style="text-align:right">' + esc(d.docName || "-") + "</span></div>";
      rows += '<div class="row"><span class="row-t">已另存</span><span class="dim">' + (d.saved ? "是" : "否") + "</span></div>";
      rows += '<div class="row"><span class="row-t">同色刀线路径</span><span class="dim">' + (d.specCount || 0) + " 条</span></div>";
      rows += '<div class="row"><span class="row-t">处理前对照层</span><span class="dim">' + (d.hasBeforeLayer ? "已存在" : "无") + "</span></div>";
      docHtml = '<div class="card-head"><span class="card-title">当前文档</span><span class="chips"><span class="chip ' +
        (canRun() ? "ok" : "bad") + '">' + (canRun() ? "可开始" : "需处理") + "</span></span></div>" +
        '<div class="card-body">' + rows + "</div>";
    }
    docCard.className = "card";
    docCard.innerHTML = docHtml;

    // 参数卡：刀线选择
    var specWrap = $("specWrap"), specSel = $("specSel"), specNote = $("specNote");
    if (SPECS.length > 1) {
      var opt = "";
      for (var i = 0; i < SPECS.length; i++) {
        opt += '<option value="' + i + '">' + (i + 1) + "  |  " + SPECS[i].widthMM + " × " + SPECS[i].heightMM +
          " mm  |  " + (SPECS[i].closed ? "闭合" : "开放") + "</option>";
      }
      specSel.innerHTML = opt;
      specSel.value = String(SPEC_INDEX);
      specWrap.classList.remove("hidden");
      specNote.textContent = "共 " + SPECS.length + " 条同色刀线，按面积从大到小；脚本不会自行认定最大者，请按实际规格选择。";
    } else {
      specWrap.classList.add("hidden");
      specNote.textContent = SPECS.length === 1
        ? "检测到 1 条同色刀线，已自动使用：" + SPECS[0].widthMM + " × " + SPECS[0].heightMM + " mm。"
        : "";
    }

    // 参数卡徽标
    var pc = $("paramChip");
    pc.className = "chip " + (canRun() ? "ok" : "bad");
    pc.textContent = canRun() ? "就绪" : "未就绪";
    syncSeg();

    // 阻塞原因（一次说清）
    $("error").classList.add("hidden");
    if (!d.ok) showError(d.error || "预检未通过。");
    else if (d.hasBeforeLayer) showError("当前文件已存在「对照-处理前(请勿编辑)」图层。请重新打开运行制版前的原始副本，不要在旧结果上重复运行。");
    else if (d.specCount < 1) showError("未找到使用专色「刀线」描边的规格线路径。请确认刀线专色名称与文件；未确认刀线无法计算出血蒙版。");

    $("btnRun").disabled = !canRun();
    foot.innerHTML = (d.docName ? '<span class="fname">' + esc(d.docName) + "</span>" : "") +
      (d.docPath ? '<span class="fpath">' + esc(d.docPath) + "</span>" : "");
  }

  // ---------- 结果渲染 ----------
  var LV_CN = { pass: "通过", fixed: "已自动修正", review: "待人工确认", hold: "异常/暂停" };

  // 日志级别由宿主脚本判定（log 落笔时即定级），面板只做显示，不再二次猜。
  // 兼容对象 {text,level} 与纯字符串两种形态，避免旧 jsx 未重载时渲染崩掉。
  function logText(item) {
    if (item && typeof item === "object") return String(item.text == null ? "" : item.text);
    return String(item == null ? "" : item);
  }
  function logLevel(item) {
    var lv = (item && typeof item === "object") ? item.level : null;
    return (lv === "pass" || lv === "fixed" || lv === "review" || lv === "hold") ? lv : "pass";
  }

  function pad2(n) { return (n < 10 ? "0" : "") + n; }
  function stamp() {
    var d = new Date();
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()) +
      " " + pad2(d.getHours()) + ":" + pad2(d.getMinutes());
  }

  function renderResult(d) {
    var res = $("results");
    if (!d) { res.innerHTML = ""; showError("未取到脚本返回结果。"); return; }

    var log = d.log || [];
    var counts = { pass: 0, fixed: 0, review: 0, hold: 0 };
    var actions = [];
    var logHtml = "";
    for (var i = 0; i < log.length; i++) {
      var txt = logText(log[i]);
      var cls = logLevel(log[i]);
      counts[cls]++;
      logHtml += '<div class="line"><span class="tag ' + cls + '">' + LV_CN[cls] + "</span>" + esc(txt) + "</div>";
      if (cls === "hold" || cls === "review") actions.push({ cls: cls, text: txt });
    }

    // 结论卡（决策优先：一眼看到"能不能导出 / 要做什么"）
    var ok = !!d.ok && !!d.canExport;
    var html = "";
    // 报告头：面板所见即报告，自带文档名/时间/版本，便于截图或对照存档
    var meta = (PRECHECK && PRECHECK.docName ? esc(PRECHECK.docName) : "未命名文档") +
      "　·　" + stamp() + "　·　" + PANEL_VER;
    if (!d.ok) {
      html += '<div class="verdict hold"><div class="v-title">制版未完成</div><div class="v-sub">' +
        esc(d.error || "脚本执行中出错，已按能完成的部分保留日志。") + '</div><div class="v-meta">' + meta + "</div></div>";
    } else {
      html += '<div class="verdict ' + (ok ? "ok" : "hold") + '"><div class="v-title">' +
        (ok ? "可以导出" : "导出已暂停") + '</div><div class="v-sub">' +
        (ok ? "未发现需要人工确认的异常。本页即自检报告，可对照下方计数与日志核对。"
            : "发现需要人工确认的项目，已按安全边界暂停导出。请处理下方「需要你处理的项」，并对照「对照-处理前」图层核对后再手动导出。") +
        (d.overprintVerified === false ? "<br/>叠印预览未确认：" + esc(d.overprintDetail || "请手工在「窗口 > 分色预览」勾选叠印预览。") : "") +
        '</div><div class="v-meta">' + meta + "</div></div>";
    }

    // 计数
    html += '<div class="stats">' +
      '<div class="stat pass"><div class="n">' + counts.pass + '</div><div class="l">通过</div></div>' +
      '<div class="stat fixed"><div class="n">' + counts.fixed + '</div><div class="l">已自动修正</div></div>' +
      '<div class="stat review"><div class="n">' + counts.review + '</div><div class="l">待人工确认</div></div>' +
      '<div class="stat hold"><div class="n">' + counts.hold + '</div><div class="l">异常/暂停</div></div>' +
      "</div>";

    // 需要处理的项（展开；这是要行动的）
    if (actions.length) {
      var li = "";
      for (var a = 0; a < actions.length; a++) {
        li += '<li><span class="lv ' + actions[a].cls + '">' + LV_CN[actions[a].cls] + "</span>" + esc(actions[a].text) + "</li>";
      }
      html += '<div class="card"><div class="card-head"><span class="card-title">需要你处理的项</span><span class="chips"><span class="chip bad">' +
        actions.length + '</span></span></div><div class="card-body"><ul class="act">' + li + "</ul></div></div>";
    }

    // 完整日志（折叠）
    html += '<details><summary>完整过程日志（' + log.length + ' 条）</summary><div class="log">' + logHtml + "</div></details>";

    res.innerHTML = html;

    if (!d.ok) showError("制版未完成：" + (d.error || "未知错误"));
    else if (ok) showNotice("制版完成，未发现需人工确认的异常。");
    else showNotice("制版完成，存在待人工确认项，导出已暂停。");
  }

  // ---------- 预检 ----------
  function precheck() {
    if (!inCEP()) { showError("未检测到 CEP 环境。此页面需在 Illustrator 的扩展面板中运行。"); return; }
    // V0.8：预检发起即禁用（与 doRun 重扫同口径）——旧文档的判定在结果回来前不可信，
    // 切换文档触发的重预检尤其需要，防止窗口期内按旧状态误点。
    $("btnRun").disabled = true;
    execJsx("zbPrecheck();", function (data, raw) {
      if (!data) {
        showError("预检失败。请确认扩展目录中的 jsx/zhiban.jsx 存在。返回: " + String(raw).substring(0, 120));
        $("btnRun").disabled = true;
        return;
      }
      renderPrecheck(data);
    });
  }

  // ---------- 执行制版 ----------
  function doRun() {
    if (running || !canRun()) return;
    var spec = SPECS[SPEC_INDEX] || { widthMM: null, heightMM: null };
    var args = 'zbRun("' + PRODUCT_TYPE + '", ' + SPEC_INDEX + ", " + spec.widthMM + ", " + spec.heightMM + ");";

    setBusy(true);
    $("results").innerHTML = "";
    $("notice").classList.add("hidden");
    $("error").classList.add("hidden");

    busyTimer = setTimeout(function () {
      showNotice("处理耗时较长，后台仍在继续，完成后会自动显示结果。");
    }, BUSY_TIMEOUT_MS);

    execJsx(args, function (data, raw) {
      clearTimeout(busyTimer);
      setBusy(false);
      if (!data) {
        showError("脚本执行失败。请确认扩展目录中的 jsx/zhiban.jsx 存在。返回: " + String(raw).substring(0, 120));
        return;
      }
      try { renderResult(data); }
      catch (e) { showError("结果渲染出错 [" + JS_BUILD + "]：" + e.message); }
      // 文档状态已变，旧预检判定不可信：precheck 重扫回来前禁用按钮，避免窗口期内连点重跑
      $("btnRun").disabled = true;
      precheck(); // 重扫一次：处理后的文档状态（对照层、刀线）已变，按钮随之禁用
    });
  }

  // ---------- 自定义确认框 ----------
  function customConfirm(msg, onOk, title) {
    var mask = $("modalMask"), msgEl = $("modalMsg"), titleEl = $("modalTitle");
    var okBtn = $("modalOk"), cancelBtn = $("modalCancel");
    if (!mask || !msgEl || !okBtn || !cancelBtn) { if (onOk) onOk(); return; }
    if (titleEl) titleEl.textContent = title || "提示";
    msgEl.textContent = msg;
    mask.classList.remove("hidden");

    function done(ok) {
      mask.classList.add("hidden");
      okBtn.onclick = null; cancelBtn.onclick = null;
      document.removeEventListener("keydown", onKey, true);
      if (ok && onOk) onOk();
    }
    function onKey(e) {
      if (e.key === "Enter") done(true);
      else if (e.key === "Escape") done(false);
    }
    okBtn.onclick = function () { done(true); };
    cancelBtn.onclick = function () { done(false); };
    document.addEventListener("keydown", onKey, true);
  }

  function onRunClick() {
    var t = PRODUCT_TYPE;
    var specTxt = SPECS.length > 1
      ? "主刀线：第 " + (SPEC_INDEX + 1) + " 条（" + SPECS[SPEC_INDEX].widthMM + " × " + SPECS[SPEC_INDEX].heightMM + " mm）"
      : (SPECS.length === 1 ? "主刀线：" + SPECS[0].widthMM + " × " + SPECS[0].heightMM + " mm（唯一）" : "主刀线：未找到");
    customConfirm(
      "将对当前文档执行自动制版：\n" +
      "产品类型：" + t + "（出血 " + (t === "礼盒" ? "5mm" : "3mm") + "）\n" + specTxt + "\n\n" +
      "过程会修改文档：新建处理前对照层、分色拆层、清理、建立出血蒙版；完成后在下方结果区生成自检报告。\n" +
      "此操作不可撤销 —— 请确认当前是在副本上运行。\n\n确定继续？",
      function () { doRun(); },
      "确认自动制版");
  }

  // ---------- 启动 ----------
  document.addEventListener("DOMContentLoaded", function () {
    $("btnRun").addEventListener("click", onRunClick);

    $("segType").addEventListener("click", function (e) {
      var t = e.target;
      if (!t || !t.getAttribute || !t.getAttribute("data-type")) return;
      PRODUCT_TYPE = t.getAttribute("data-type");
      syncSeg();
    });

    $("specSel").addEventListener("change", function () {
      SPEC_INDEX = parseInt($("specSel").value, 10) || 0;
    });

    if (inCEP()) {
      precheck();
      // V0.8：切换/打开文档时自动重跑预检 —— 此前预检只在面板加载时执行一次，
      // 面板绑死在启动时的那份文档上，同一个 AI 进程没法连续处理多个文件。
      // 原生 __adobe_cep__.addEventListener，无需引入 CSInterface.js。
      if (window.__adobe_cep__.addEventListener) {
        window.__adobe_cep__.addEventListener("documentAfterActivate", function () {
          if (running) return; // 执行中不插队；run 完成的重扫自会反映最新状态
          precheck();
        }, null);
      }
    }
    else showError("未检测到 CEP 环境。此页面需在 Illustrator 的扩展面板中运行。");
  });
})();
