import { useEffect, useState } from "react";
import { DEFAULT_STATE, type BotState } from "../shared/types";
import { getBotState, updateBotState } from "../shared/storage";

export default function App() {
  const [state, setState] = useState<BotState>(DEFAULT_STATE);
  const [letter, setLetter] = useState("");

  useEffect(() => {
    void getBotState().then((current) => {
      setState(current);
      setLetter(current.hhCoverLetter);
    });

    const listener = (
      changes: { [key: string]: chrome.storage.StorageChange },
      areaName: string,
    ) => {
      if (areaName !== "local") return;
      setState((current) => ({
        ...current,
        ...Object.fromEntries(
          Object.entries(changes).map(([key, change]) => [
            key,
            change.newValue,
          ]),
        ),
      }));
    };

    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);

  const start = async () => {
    const cleanLetter = letter.trim();
    if (!cleanLetter) {
      await updateBotState({
        hhAutoApplyStatus: "Сначала вставь сопроводительное письмо.",
      });
      return;
    }

    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (
      !tab?.id ||
      !tab.url ||
      !/^https:\/\/([a-z0-9-]+\.)?hh\.ru\//i.test(tab.url)
    ) {
      await updateBotState({
        hhAutoApplyStatus: "Открой список вакансий на hh.ru.",
      });
      return;
    }
    if (/\/vacancy\/\d+/.test(new URL(tab.url).pathname)) {
      await updateBotState({
        hhAutoApplyStatus: "Сначала вернись к списку вакансий.",
      });
      return;
    }

    await updateBotState({
      hhCoverLetter: cleanLetter,
      hhAutoApplyRunning: true,
      hhAutoApplyIndex: 0,
      hhAutoApplyListUrl: tab.url,
      hhAutoApplyStatus: "Запуск...",
    });
    try {
      await chrome.tabs.sendMessage(tab.id, {
        type: "HH_AUTO_APPLY_START",
      });
    } catch (error) {
      const details = error instanceof Error ? error.message : String(error);

      await updateBotState({
        hhAutoApplyRunning: false,
        hhAutoApplyStatus: `Ошибка запуска: ${details}. URL: ${tab.url}`,
      });

      console.error("HH_AUTO_APPLY_START failed", {
        tabId: tab.id,
        url: tab.url,
        error,
      });
    }
  };

  const stop = async () => {
    await updateBotState({
      hhAutoApplyRunning: false,
      hhAutoApplyStatus: "Остановка запрошена.",
    });
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (tab?.id) {
      try {
        await chrome.tabs.sendMessage(tab.id, { type: "HH_AUTO_APPLY_STOP" });
      } catch (error) {
        console.debug("Не удалось отправить команду остановки:", error);
      }
    }
  };

  return (
    <main className="app">
      <h1>HH Auto Apply</h1>
      <label htmlFor="letter">Сопроводительное письмо</label>
      <textarea
        id="letter"
        value={letter}
        onChange={(event) => setLetter(event.target.value)}
        placeholder="Вставь сопроводительное письмо..."
      />
      <div className="actions">
        <button className="start" onClick={() => void start()}>
          Запустить
        </button>
        <button className="stop" onClick={() => void stop()}>
          Остановить
        </button>
      </div>
      <section className="status">
        <strong>
          {state.hhAutoApplyRunning
            ? "Статус: работает"
            : "Статус: остановлено"}
        </strong>
        <span>Обработано карточек: {state.hhAutoApplyIndex}</span>
        <p>{state.hhAutoApplyStatus}</p>
      </section>
    </main>
  );
}
