"use strict";

(function () {
  const RESULT_KEY = "pendingAnalysis";
  const content = document.getElementById("content");
  const languageButtons = Array.from(document.querySelectorAll("[data-lang]"));
  const browserLanguage = chrome.i18n.getUILanguage().toLowerCase();
  let language = browserLanguage.startsWith("vi") ? "vi" : "en";
  let result = null;

  function text(key, fallback) {
    const dictionary = globalThis.SCS_LOCALES && globalThis.SCS_LOCALES[language];
    return dictionary && dictionary[key] ? dictionary[key] : fallback;
  }

  function node(tag, className, value) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (value !== undefined) element.textContent = value;
    return element;
  }

  function section(title) {
    const wrapper = node("section", "section");
    wrapper.appendChild(node("h2", "section-title", title));
    return wrapper;
  }

  function isValidResult(candidate) {
    if (!candidate || candidate.schemaVersion !== 1 || typeof candidate.status !== "string") return false;
    if (candidate.status === "empty") return true;
    if (candidate.status === "failed") return true;
    if (candidate.status === "too_long") {
      return Number.isInteger(candidate.characterCount) &&
        Number.isInteger(candidate.maxLength) &&
        candidate.maxLength === 12000 &&
        candidate.characterCount > candidate.maxLength &&
        candidate.characterCount <= 10000000;
    }
    if (candidate.status !== "ok") return false;
    const validTypes = ["bank_phishing", "fake_authority", "job_scholarship", "delivery", "investment", "account_takeover", "other"];
    const validRisk = ["critical", "high", "medium", "low"];
    return Number.isInteger(candidate.score) &&
      candidate.score >= 0 && candidate.score <= 100 &&
      validRisk.includes(candidate.riskLevel) &&
      Array.isArray(candidate.types) && candidate.types.length <= 3 &&
      candidate.types.every((type) => validTypes.includes(type)) &&
      Array.isArray(candidate.flags) && candidate.flags.length <= 8 &&
      candidate.flags.every((flag) => flag &&
        typeof flag.category === "string" && /^[a-z_]{1,40}$/.test(flag.category) &&
        typeof flag.excerpt === "string" && flag.excerpt.length <= 120) &&
      Array.isArray(candidate.urlSignals) && candidate.urlSignals.length <= 5 &&
      candidate.urlSignals.every((signal) => typeof signal === "string" && signal.length <= 100) &&
      Array.isArray(candidate.actions) && candidate.actions.length <= 5 &&
      candidate.actions.every((action) => typeof action === "string" && /^[a-z0-9._-]{1,80}$/.test(action)) &&
      candidate.components &&
      ["ml", "rules", "indicators"].every((key) =>
        Number.isFinite(candidate.components[key]) &&
        candidate.components[key] >= 0 && candidate.components[key] <= 100
      );
  }

  function renderNotice(message, isError) {
    content.replaceChildren(node("div", isError ? "notice error" : "notice", message));
  }

  function render() {
    languageButtons.forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.lang === language));
    });
    document.documentElement.lang = language;
    if (!result) {
      renderNotice(text(
        "extension.noResult",
        language === "vi"
          ? "Bôi đen một đoạn văn bản trên trang, nhấp chuột phải và chọn “Kiểm tra với ScamCall Shield”."
          : "Select text on a page, right-click, and choose “Check with ScamCall Shield”."
      ), false);
      return;
    }

    if (!isValidResult(result)) {
      renderNotice(text("extension.invalidResult", language === "vi" ? "Không thể đọc kết quả. Hãy thử lại." : "The result could not be read. Please try again."), true);
      return;
    }
    if (result.status === "empty") {
      renderNotice(text("extension.empty", language === "vi" ? "Không nhận được văn bản đã chọn. Hãy bôi đen nội dung hiển thị rồi thử lại." : "No selected text was received. Select visible page text and try again."), true);
      return;
    }
    if (result.status === "failed") {
      renderNotice(text("extension.analysisError", language === "vi" ? "Phân tích không hoàn tất. Không có kết quả nào được tạo." : "Analysis did not complete. No result was produced."), true);
      return;
    }
    if (result.status === "too_long") {
      const message = language === "vi"
        ? `Đoạn chọn quá dài (${result.characterCount} ký tự). Giới hạn là ${result.maxLength} ký tự.`
        : `The selection is too long (${result.characterCount} characters). The limit is ${result.maxLength}.`;
      renderNotice(message, true);
      return;
    }
    const risk = {
      critical: text("level.critical", language === "vi" ? "Nghiêm trọng" : "Critical"),
      high: text("level.high", language === "vi" ? "Cao" : "High"),
      medium: text("level.medium", language === "vi" ? "Trung bình" : "Medium"),
      low: text("level.low", language === "vi" ? "Thấp" : "Low")
    };
    const card = node("div", "card");
    const row = node("div", "score-row");
    const scoreLabel = node("div");
    scoreLabel.appendChild(node("div", null, text("extension.riskScore", language === "vi" ? "Điểm rủi ro" : "Risk score")));
    const score = node("div", "score");
    score.append(document.createTextNode(String(result.score)), node("small", null, " / 100"));
    scoreLabel.appendChild(score);
    row.append(scoreLabel, node("span", `level level-${result.riskLevel}`, risk[result.riskLevel] || risk.medium));
    card.appendChild(row);
    card.appendChild(node("p", "disclaimer", text(
      "extension.disclaimer",
      language === "vi"
        ? "Điểm rủi ro không phải xác suất lừa đảo. Điểm thấp không chứng minh nội dung an toàn."
        : "Risk score is not a probability of fraud. A low score does not prove the content is safe."
    )));
    if (Array.isArray(result.types) && result.types.length) {
      const typeNames = result.types.map((type) => text(
        `type.${type}`,
        type.replace(/_/g, " ")
      ));
      card.appendChild(node(
        "p",
        "type",
        `${text("extension.possibleType", language === "vi" ? "Kịch bản có thể liên quan" : "Possible scenario")}: ${typeNames.join(", ")}`
      ));
    }
    content.replaceChildren(card);

    const flags = Array.isArray(result.flags) ? result.flags : [];
    const urls = Array.isArray(result.urlSignals) ? result.urlSignals : [];
    const evidence = section(text("extension.evidence", language === "vi" ? "Dấu hiệu cụ thể" : "Specific signals"));
    const evidenceList = node("ul", "list");
    flags.forEach((flag) => {
      if (!flag || typeof flag.category !== "string" || typeof flag.excerpt !== "string") return;
      const item = node("li");
      item.appendChild(node("span", "category", text(`cat.${flag.category}`, flag.category)));
      item.appendChild(node("span", "excerpt", `“${flag.excerpt}”`));
      evidenceList.appendChild(item);
    });
    urls.forEach((signal) => {
      if (typeof signal !== "string") return;
      evidenceList.appendChild(node("li", null, text(signal, signal)));
    });
    if (!evidenceList.childElementCount) {
      evidenceList.appendChild(node("li", null, text(
        "extension.noFlags",
        language === "vi"
          ? "Không thấy cụm từ khớp rõ với bộ luật; điều này không loại trừ rủi ro."
          : "No clear rule phrase matched; this does not rule out risk."
      )));
    }
    evidence.appendChild(evidenceList);
    content.appendChild(evidence);

    const actions = Array.isArray(result.actions) ? result.actions : [];
    const advice = section(text("actions.title", language === "vi" ? "Hành động đề xuất" : "Recommended actions"));
    const actionList = node("ol", "list");
    actions.forEach((key) => {
      if (typeof key === "string") actionList.appendChild(node("li", null, text(key, key)));
    });
    advice.appendChild(actionList);
    content.appendChild(advice);

    if (result.components && Number.isFinite(result.components.ml)) {
      const components = section(text("extension.localSignals", language === "vi" ? "Tín hiệu cục bộ" : "Local signals"));
      const values = node("div", "components");
      values.append(
        node("span", null, `${text("extension.ml", language === "vi" ? "Mô hình ML" : "ML model")}: ${result.components.ml}`),
        node("span", null, `${text("extension.rules", language === "vi" ? "Luật" : "Rules")}: ${result.components.rules}`),
        node("span", null, `${text("extension.indicators", language === "vi" ? "Chỉ báo" : "Indicators")}: ${result.components.indicators}`)
      );
      components.appendChild(values);
      content.appendChild(components);
    }
  }

  languageButtons.forEach((button) => {
    button.addEventListener("click", () => {
      language = button.dataset.lang;
      render();
    });
  });

  chrome.storage.session.get(RESULT_KEY, (stored) => {
    if (chrome.runtime.lastError) {
      renderNotice(text("extension.storageError", "Could not read the temporary analysis result."), true);
      return;
    }
    result = stored && stored[RESULT_KEY] ? stored[RESULT_KEY] : null;
    if (result && !isValidResult(result)) result = { schemaVersion: 0, status: "invalid" };
    if (result) {
      chrome.storage.session.remove(RESULT_KEY);
      chrome.action.setBadgeText({ text: "" });
    }
    render();
  });
})();
