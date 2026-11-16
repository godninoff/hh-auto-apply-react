export type BotStatus =
  | "idle"
  | "running"
  | "stopping"
  | "error"
  | "completed";

export interface BotState {
  hhAutoApplyRunning: boolean;
  hhAutoApplyIndex: number;
  hhAutoApplyListUrl: string;
  hhCoverLetter: string;
  hhAutoApplyStatus: string;
}

export type RuntimeMessage =
  | { type: "HH_AUTO_APPLY_START" }
  | { type: "HH_AUTO_APPLY_STOP" }
  | { type: "HH_AUTO_APPLY_CONTINUE_LIST" }
  | { type: "HH_AUTO_APPLY_GET_TAB_ID" }
  | { type: "HH_AUTO_APPLY_OPEN_VACANCY"; url: string; listTabId: number }
  | { type: "HH_AUTO_APPLY_VACANCY_RESULT"; result: "success" | "error" | "questionnaire"; status?: string };

export const STORAGE_KEYS = {
  running: "hhAutoApplyRunning",
  index: "hhAutoApplyIndex",
  listUrl: "hhAutoApplyListUrl",
  letter: "hhCoverLetter",
  status: "hhAutoApplyStatus"
} as const;

export const DEFAULT_STATE: BotState = {
  hhAutoApplyRunning: false,
  hhAutoApplyIndex: 0,
  hhAutoApplyListUrl: "",
  hhCoverLetter: "",
  hhAutoApplyStatus: "Остановлено"
};