import type { RuntimeMessage } from "../shared/types";
import { updateBotState } from "../shared/storage";

const tabKey = (tabId: number): string => `hhAutoApplyListTab_${tabId}`;

chrome.runtime.onMessage.addListener((rawMessage, sender, sendResponse) => {
  const message = rawMessage as RuntimeMessage;

  if (message.type === "HH_AUTO_APPLY_GET_TAB_ID") {
    sendResponse({ tabId: sender.tab?.id });
    return;
  }

  if (message.type === "HH_AUTO_APPLY_OPEN_VACANCY") {
    void (async () => {
      try {
        const tab = await chrome.tabs.create({ url: message.url, active: true });
        if (tab.id === undefined) throw new Error("Не удалось получить ID вкладки");
        await chrome.storage.session.set({ [tabKey(tab.id)]: message.listTabId });
        sendResponse({ success: true, tabId: tab.id });
      } catch (error) {
        sendResponse({
          success: false,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    })();
    return true;
  }

  if (message.type === "HH_AUTO_APPLY_VACANCY_RESULT") {
    void (async () => {
      const vacancyTabId = sender.tab?.id;
      if (vacancyTabId === undefined) return;

      const key = tabKey(vacancyTabId);
      const stored = await chrome.storage.session.get(key);
      const listTabId = stored[key] as number | undefined;

      const status =
        message.result === "success"
          ? "Отклик отправлен. Перехожу к следующей вакансии."
          : message.result === "questionnaire"
            ? "Опросник оставлен открытым для ручного заполнения."
            : message.status || "Ошибка обработки вакансии.";

      await updateBotState({ hhAutoApplyStatus: status });

      if (listTabId === undefined) {
        await updateBotState({ hhAutoApplyStatus: "Не найден ID вкладки со списком вакансий." });
        return;
      }

      try {
        await chrome.tabs.update(listTabId, { active: true });
        let delivered = false;
        for (let attempt = 0; attempt < 5; attempt += 1) {
          try {
            await chrome.tabs.sendMessage(listTabId, { type: "HH_AUTO_APPLY_CONTINUE_LIST" });
            delivered = true;
            break;
          } catch {
            await new Promise((resolve) => setTimeout(resolve, 500));
          }
        }
        if (!delivered) {
          await updateBotState({
            hhAutoApplyStatus: "Не удалось передать управление списку. Обнови вкладку со списком и запусти бота снова."
          });
        }
      } catch (error) {
        await updateBotState({
          hhAutoApplyStatus: `Ошибка возврата к списку: ${error instanceof Error ? error.message : String(error)}`
        });
      }
    })();
  }
});