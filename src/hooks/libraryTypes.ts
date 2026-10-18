import { api } from "../api";
import type { DragReport, ViewMode } from "../types";

export type DiskProgress = {
  current: number;
  total: number;
  name: string;
  bytesDone: number;
  bytesTotal: number;
  cancellable: boolean;
};

export type DiskDialog = DiskProgress & { title: string };

export const emptyProgress = (): DiskProgress => ({
  current: 0,
  total: 0,
  name: "",
  bytesDone: 0,
  bytesTotal: 0,
  cancellable: false,
});

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} ${units[unit]}`;
}

export const ERROR_MESSAGE_MAX = 2000;

let fallbackDragIcon: Promise<string> | null = null;

export function fallbackDragIconPath(): Promise<string> {
  if (!fallbackDragIcon) {
    fallbackDragIcon = api.dragIconPath().catch((err: unknown) => {
      fallbackDragIcon = null;
      throw err;
    });
  }
  return fallbackDragIcon;
}

export function formatErrorForDisplay(message: string): string {
  if (message.length <= ERROR_MESSAGE_MAX) return message;
  return `${message.slice(0, ERROR_MESSAGE_MAX)}\n…(truncated)`;
}

export type FileDrag = {
  pointerId: number;
  ids: number[];
  originX: number;
  originY: number;
  x: number;
  y: number;
  buttonDown: boolean;
  startedNative: boolean;
  captureEl: HTMLElement | null;
  prepKey: string;
  paths: string[] | null;
  pathsReady: boolean;
  imageDrag: boolean;
  skipped: string[];
  reports: DragReport[];
  prepareError: string | null;
  loggedWait: boolean;
};

export interface Actions {
  importFolder: () => void;
  importArchive: () => void;
  moveLibrary: () => void;
  backupLibrary: () => void;
  /** Optional `libraryPath` skips the second folder picker (setup can pass the chosen root). */
  restoreLibrary: (libraryPath?: string) => void;
  rescan: () => void;
  clearThumbs: () => void;
  setTheme: (theme: "dark" | "light") => void;
  setGrid: (size: ViewMode) => void;
  showAbout: () => void;
}
