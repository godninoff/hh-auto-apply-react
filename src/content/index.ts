import type { RuntimeMessage } from "../shared/types";
import { getBotState, isBotRunning, updateBotState } from "../shared/storage";

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const isVisible = (element: Element | null): boolean =>
  element instanceof HTMLElement && element.getClientRects().length > 0;

const waitForElement = async <T extends Element>(
  selector: string,
  timeout = 10_000,
): Promise<T | null> => {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeout) {
    if (!(await isBotRunning())) return null;
    const element = document.querySelector<T>(selector);
    if (isVisible(element)) return element;
    await sleep(300);
  }
  return null;
};

const isVacancyResponsePage = (): boolean =>
  location.pathname.includes("/applicant/vacancy_response");

const isVacancyPage = (): boolean =>
  /\/vacancy\/\d+/.test(location.pathname) || isVacancyResponsePage();

const isQuestionnaireVisible = (): boolean => {
  return [...document.querySelectorAll("div")].some(
    (element) =>
      isVisible(element) &&
      element.textContent?.replace(/\s+/g, " ").trim() ===
        "Для отклика необходимо ответить на несколько вопросов работодателя",
  );
};

const sendVacancyResult = async (
  result: "success" | "error" | "questionnaire",
  status?: string,
): Promise<void> => {
  await chrome.runtime.sendMessage({
    type: "HH_AUTO_APPLY_VACANCY_RESULT",
    result,
    status,
  });
};

const fillLetter = async (
  textarea: HTMLTextAreaElement,
  letter: string,
): Promise<boolean> => {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    "value",
  )?.set;
  if (!setter) return false;

  setter.call(textarea, letter);
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
  textarea.dispatchEvent(new Event("change", { bubbles: true }));
  await sleep(1000);
  return textarea.value.trim() === letter.trim();
};

const processVacancy = async (): Promise<void> => {
  const state = await getBotState();
  if (!state.hhAutoApplyRunning) return;

  const wrapper = await waitForElement<HTMLElement>(
    '[class*="response-button-wrapper"]',
  );
  if (!wrapper) {
    await sendVacancyResult("error", "Не найден контейнер кнопки отклика.");
    return;
  }

  const respondButton = wrapper.querySelector<HTMLAnchorElement>(
    'a[data-qa="vacancy-response-link-top"]',
  );
  if (!respondButton) {
    await sendVacancyResult("error", "Кнопка «Откликнуться» не найдена.");
    return;
  }

  respondButton.scrollIntoView({ behavior: "instant", block: "center" });
  await sleep(300);
  if (!(await isBotRunning())) return;
  respondButton.click();

  const startedAt = Date.now();
  while (Date.now() - startedAt < 5000) {
    if (!(await isBotRunning())) return;
    const relocation = document.querySelector<HTMLButtonElement>(
      'button[data-qa="relocation-warning-confirm"]',
    );
    if (relocation && isVisible(relocation)) {
      relocation.scrollIntoView({ block: "center" });
      await sleep(300);
      relocation.click();
      await sleep(500);
      break;
    }

    await sleep(300);
  }

  const textarea = await waitForElement<HTMLTextAreaElement>(
    'textarea[data-qa="vacancy-response-popup-form-letter-input"]',
  );

  if (!textarea) {
    if (isQuestionnaireVisible()) {
      await sendVacancyResult("questionnaire");
    } else {
      const attachButton = await waitForElement<HTMLButtonElement>(
        'button[data-qa="responded-success-attach-cover-letter"]',
        1500,
      );
      if (attachButton) {
        attachButton.click();
        const letterField = await waitForElement<HTMLTextAreaElement>(
          'textarea[data-qa="vacancy-response-popup-form-letter-input"]',
        );
        if (!letterField) {
          await sendVacancyResult(
            "error",
            "После нажатия добавления письма поле не появилось.",
          );
          return;
        }
        await submitLetter(letterField);
        return;
      }
      await sendVacancyResult("error", "После клика не появилось поле письма.");
    }
    return;
  }

  await submitLetter(textarea);
};

const submitLetter = async (textarea: HTMLTextAreaElement): Promise<void> => {
  const { hhCoverLetter } = await getBotState();

  if (!hhCoverLetter.trim()) {
    await sendVacancyResult("error", "Сопроводительное письмо пустое.");
    return;
  }

  if (!(await fillLetter(textarea, hhCoverLetter))) {
    await sendVacancyResult("error", "Текст письма не сохранился в поле.");
    return;
  }

  const actualSendButton = [
    ...document.querySelectorAll<HTMLButtonElement>("button"),
  ].find(
    (button) => button.innerText.trim() === "Отправить" && isVisible(button),
  );

  if (!actualSendButton) {
    await sendVacancyResult("error", "Кнопка «Отправить» не найдена.");
    return;
  }

  await sleep(500);

  if (
    actualSendButton.disabled ||
    actualSendButton.getAttribute("aria-disabled") === "true"
  ) {
    await sendVacancyResult("error", "Кнопка «Отправить» заблокирована.");
    return;
  }

  actualSendButton.scrollIntoView({ block: "center" });
  actualSendButton.click();

  const startedAt = Date.now();

  while (Date.now() - startedAt < 15_000) {
    if (!(await isBotRunning())) return;

    if (
      isVisible(document.querySelector('[data-qa="vacancy-response-success"]'))
    ) {
      await sendVacancyResult("success");
      return;
    }

    if (isQuestionnaireVisible()) {
      await sendVacancyResult("questionnaire");
      return;
    }

    if (
      !isVisible(
        document.querySelector(
          'textarea[data-qa="vacancy-response-popup-form-letter-input"]',
        ),
      )
    ) {
      await sendVacancyResult("success");
      return;
    }

    await sleep(300);
  }

  await sendVacancyResult(
    "error",
    `Отправка не подтверждена. Кнопка: ${actualSendButton.outerHTML}`,
  );
};

const getCurrentTabId = async (): Promise<number> => {
  const response = await chrome.runtime.sendMessage({
    type: "HH_AUTO_APPLY_GET_TAB_ID",
  });
  if (typeof response?.tabId !== "number")
    throw new Error("Не удалось получить ID вкладки списка.");
  return response.tabId;
};

const processList = async (): Promise<void> => {
  const state = await getBotState();
  if (!state.hhAutoApplyRunning) return;

  const index = state.hhAutoApplyIndex;
  const startedAt = Date.now();
  let cards: Element[] = [];

  while (Date.now() - startedAt < 10_000) {
    if (!(await isBotRunning())) return;
    cards = [...document.querySelectorAll('[class*="vacancy-info--"]')];
    if (cards.length > index) break;
    await sleep(500);
  }

  if (cards.length === 0) {
    await updateBotState({
      hhAutoApplyStatus: `Карточки не появились за 10 секунд. URL: ${location.href}`,
    });
    return;
  }

  if (index >= cards.length) {
    await updateBotState({
      hhAutoApplyRunning: false,
      hhAutoApplyStatus: `Карточки закончились. Загружено: ${cards.length}, индекс: ${index}.`,
    });
    return;
  }

  const link = cards[index].querySelector<HTMLAnchorElement>(
    'a[href*="/vacancy/"]',
  );
  if (!link) {
    await updateBotState({
      hhAutoApplyIndex: index + 1,
      hhAutoApplyStatus: `Карточка ${index + 1}: ссылка не найдена.`,
    });
    await sleep(300);
    await processList();
    return;
  }

  await updateBotState({
    hhAutoApplyIndex: index + 1,
    hhAutoApplyListUrl: location.href,
    hhAutoApplyStatus: `Открываю карточку ${index + 1}.`,
  });

  if (!(await isBotRunning())) return;

  const response = await chrome.runtime.sendMessage({
    type: "HH_AUTO_APPLY_OPEN_VACANCY",
    url: link.href,
    listTabId: await getCurrentTabId(),
  });
  if (!response?.success) {
    await updateBotState({
      hhAutoApplyStatus: "Не удалось открыть вкладку вакансии.",
    });
  }
};

let processing = false;

const run = async (): Promise<void> => {
  if (processing || !(await isBotRunning())) return;
  processing = true;
  try {
    if (isVacancyResponsePage()) {
      const startedAt = Date.now();

      while (Date.now() - startedAt < 10_000) {
        if (!(await isBotRunning())) return;

        if (isQuestionnaireVisible()) {
          await sendVacancyResult("questionnaire");
          return;
        }

        await sleep(300);
      }

      await sendVacancyResult(
        "error",
        "Открылась страница ответа, но опросник не обнаружен.",
      );
    } else if (isVacancyPage()) {
      await processVacancy();
    } else {
      await processList();
    }
  } catch (error) {
    await updateBotState({
      hhAutoApplyStatus: `Ошибка: ${error instanceof Error ? error.message : String(error)}`,
    });
  } finally {
    processing = false;
  }
};

chrome.runtime.onMessage.addListener((rawMessage) => {
  const message = rawMessage as RuntimeMessage;
  if (message.type === "HH_AUTO_APPLY_START") void run();
  if (message.type === "HH_AUTO_APPLY_STOP") {
    void updateBotState({
      hhAutoApplyRunning: false,
      hhAutoApplyStatus: "Остановлено пользователем.",
    });
  }
  if (message.type === "HH_AUTO_APPLY_CONTINUE_LIST") {
    processing = false;
    void run();
  }
});

const startedKey = `hhAutoApplyVacancyStarted:${location.pathname}`;

if (isVacancyPage()) {
  if (!sessionStorage.getItem(startedKey)) {
    sessionStorage.setItem(startedKey, "1");
    void run();
  }
} else {
  void getBotState().then((state) => {
    if (state.hhAutoApplyRunning) void run();
  });
}
