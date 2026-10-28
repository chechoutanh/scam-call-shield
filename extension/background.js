"use strict";

importScripts(
  "../web_app/data/model/model.js",
  "../web_app/data/rules.vi.js",
  "../web_app/data/rules.en.js",
  "../web_app/js/utils/extract.js",
  "../web_app/js/ml/vectorizer.js",
  "../web_app/js/ml/model.js",
  "../web_app/js/ml/ruleEngine.js",
  "../web_app/js/ml/scoreFusion.js",
  "../web_app/js/analyzers/textAnalyzer.js"
);

const MENU_ID = "scamcall-shield-check-selection";
const RESULT_KEY = "pendingAnalysis";
const MAX_SELECTION_LENGTH = 12000;

chrome.storage.session.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" }, () => {
  if (chrome.runtime.lastError) {
    reportError("Could not restrict temporary result access", chrome.runtime.lastError.message);
  }
});

function reportError(context, error) {
  console.error("[ScamCall Shield]", context, error);
  chrome.action.setBadgeBackgroundColor({ color: "#b42318" });
  chrome.action.setBadgeText({ text: "!" });
}

function createContextMenu() {
  chrome.contextMenus.removeAll(() => {
    if (chrome.runtime.lastError) {
      reportError("Could not reset the context menu", chrome.runtime.lastError.message);
      return;
    }
    const isVietnamese = chrome.i18n.getUILanguage().toLowerCase().startsWith("vi");
    chrome.contextMenus.create({
      id: MENU_ID,
      title: isVietnamese
        ? "Kiểm tra với ScamCall Shield"
        : "Check with ScamCall Shield",
      contexts: ["selection"]
    }, () => {
      if (chrome.runtime.lastError) {
        reportError("Could not create the context menu", chrome.runtime.lastError.message);
      }
    });
  });
}

function makeResult(selection) {
  if (typeof selection !== "string" || !selection.trim()) {
    return { schemaVersion: 1, status: "empty" };
  }
  if (selection.length > MAX_SELECTION_LENGTH) {
    return {
      schemaVersion: 1,
      status: "too_long",
      characterCount: selection.length,
      maxLength: MAX_SELECTION_LENGTH
    };
  }
  if (!globalThis.SCS || !globalThis.SCS.model.available()) {
    throw new Error("The bundled scam-classification model is unavailable.");
  }

  const result = globalThis.SCS.engine.analyze({
    sourceType: "text",
    rawText: selection.trim()
  });

  return {
    schemaVersion: 1,
    status: "ok",
    score: result.overallScore,
    riskLevel: result.riskLevel,
    types: result.scamTypes.slice(0, 3).map((type) => type.id),
    flags: result.redFlags.slice(0, 8).map((flag) => ({
      category: flag.cat,
      excerpt: flag.text.slice(0, 120)
    })),
    urlSignals: result.extracted.urls
      .flatMap((url) => url.reasons)
      .filter((reason, index, reasons) => reasons.indexOf(reason) === index)
      .slice(0, 5),
    actions: result.actions.slice(0, 5),
    components: {
      ml: result.components.ml,
      rules: result.components.rules,
      indicators: result.components.indicators
    }
  };
}

function storeAndOpen(result) {
  chrome.storage.session.set({ [RESULT_KEY]: result }, () => {
    if (chrome.runtime.lastError) {
      reportError("Could not pass the result to the extension popup", chrome.runtime.lastError.message);
      return;
    }
    chrome.action.openPopup().then(() => {
      chrome.action.setBadgeText({ text: "" });
    }).catch((error) => {
      chrome.action.setBadgeBackgroundColor({ color: "#b42318" });
      chrome.action.setBadgeText({ text: "1" });
      console.warn("[ScamCall Shield] Open the extension button to view the result.", error);
    });
  });
}

chrome.runtime.onInstalled.addListener(createContextMenu);

chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId !== MENU_ID) return;
  try {
    storeAndOpen(makeResult(info.selectionText));
  } catch (error) {
    reportError("Local analysis failed", error);
    storeAndOpen({ schemaVersion: 1, status: "failed" });
  }
});
