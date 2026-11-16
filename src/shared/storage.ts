import { DEFAULT_STATE, type BotState } from "./types";

export const getBotState = async (): Promise<BotState> => {
  const stored = await chrome.storage.local.get(Object.keys(DEFAULT_STATE));
  return { ...DEFAULT_STATE, ...stored } as BotState;
};

export const updateBotState = async (
  patch: Partial<BotState>,
): Promise<void> => {
  await chrome.storage.local.set(patch);
};

export const isBotRunning = async (): Promise<boolean> =>
  (await getBotState()).hhAutoApplyRunning;
