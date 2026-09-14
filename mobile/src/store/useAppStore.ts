import { create } from "zustand";

import type { MockVerse } from "@/src/constants/mockData";
import type { ThemeMode } from "@/src/theme";
import type { BesorahTextVersion } from "@davar/shared/translationConfig";
import type { BesorahLanguage } from "@davar/shared/greekBesorah";
import {
  getDefaultLanguage,
  type AppLanguage,
} from "@/src/services/storage";
import type {
  DownloadProgress,
  BundleVersions,
} from "@/src/services/offlineSync";

export type OfflineStatus = "idle" | "downloading" | "ready";

export type AppState = {
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
  toggleThemeMode: () => void;
  hebrewFontScale: number;
  setHebrewFontScale: (scale: number) => void;
  language: AppLanguage;
  setLanguage: (language: AppLanguage) => void;
  besorahTextVersion: BesorahTextVersion;
  setBesorahTextVersion: (version: BesorahTextVersion) => void;
  besorahLanguage: BesorahLanguage;
  setBesorahLanguage: (language: BesorahLanguage) => void;
  showQumran: boolean;
  setShowQumran: (value: boolean) => void;
  showFullChapter: boolean;
  setShowFullChapter: (value: boolean) => void;
  seferMode: boolean;
  setSeferMode: (value: boolean) => void;
  hebrewOnly: boolean;
  setHebrewOnly: (value: boolean) => void;
  translationOnly: boolean;
  setTranslationOnly: (value: boolean) => void;
  showCantillation: boolean;
  setShowCantillation: (value: boolean) => void;
  showNikud: boolean;
  setShowNikud: (value: boolean) => void;
  currentVerseId: string;
  setCurrentVerseId: (id: string) => void;
  bookmarks: string[];
  addBookmark: (id: string) => void;
  removeBookmark: (id: string) => void;
  setBookmarks: (ids: string[]) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  searchResults: MockVerse[];
  setSearchResults: (results: MockVerse[]) => void;
  // Offline download state
  offlineStatus: OfflineStatus;
  setOfflineStatus: (status: OfflineStatus) => void;
  offlineUpdateAvailable: boolean;
  setOfflineUpdateAvailable: (value: boolean) => void;
  downloadProgress: DownloadProgress | null;
  setDownloadProgress: (progress: DownloadProgress | null) => void;
  localBundleVersions: BundleVersions;
  setLocalBundleVersions: (versions: BundleVersions) => void;
  isConnected: boolean;
  setIsConnected: (connected: boolean) => void;
};

export const useAppStore = create<AppState>((set) => ({
  themeMode: "light",
  setThemeMode: (mode) => set({ themeMode: mode }),
  toggleThemeMode: () =>
    set((state) => ({
      themeMode: state.themeMode === "light" ? "dark" : "light",
    })),
  hebrewFontScale: 1,
  setHebrewFontScale: (scale) => set({ hebrewFontScale: scale }),
  language: getDefaultLanguage(),
  setLanguage: (language) => set({ language }),
  besorahTextVersion: "delitzsch",
  setBesorahTextVersion: (besorahTextVersion) => set({ besorahTextVersion }),
  besorahLanguage: "hebrew",
  setBesorahLanguage: (besorahLanguage) => set({ besorahLanguage }),
  showQumran: false,
  setShowQumran: (value) =>
    set((state) => ({
      showQumran: state.translationOnly ? false : value,
    })),
  showFullChapter: false,
  setShowFullChapter: (value) =>
    set((state) => ({
      showFullChapter: value,
      seferMode: value ? state.seferMode : false,
    })),
  seferMode: false,
  setSeferMode: (value) =>
    set((state) => ({
      seferMode:
        value && state.showFullChapter && (state.hebrewOnly || state.translationOnly),
    })),
  hebrewOnly: false,
  setHebrewOnly: (value) =>
    set((state) => ({
      hebrewOnly: state.translationOnly ? false : value,
      seferMode: state.translationOnly || !value ? false : state.seferMode,
    })),
  translationOnly: false,
  setTranslationOnly: (value) =>
    set((state) => ({
      translationOnly: value,
      hebrewOnly: value ? false : state.hebrewOnly,
      showQumran: value ? false : state.showQumran,
      showCantillation: value ? false : state.showCantillation,
      showFullChapter: value ? true : false,
      seferMode: value ? true : false,
    })),
  showCantillation: false,
  setShowCantillation: (value) =>
    set((state) => ({
      showCantillation: state.translationOnly ? false : value,
    })),
  showNikud: true,
  setShowNikud: (value) =>
    set((state) => ({
      showNikud: state.translationOnly ? false : value,
    })),
  currentVerseId: "genesis-1-1",
  setCurrentVerseId: (id) => set({ currentVerseId: id }),
  bookmarks: [],
  addBookmark: (id) =>
    set((state) => ({ bookmarks: [...new Set([...state.bookmarks, id])] })),
  removeBookmark: (id) =>
    set((state) => ({
      bookmarks: state.bookmarks.filter((item) => item !== id),
    })),
  setBookmarks: (ids) => set({ bookmarks: ids }),
  searchQuery: "",
  setSearchQuery: (query) => set({ searchQuery: query }),
  searchResults: [],
  setSearchResults: (results) => set({ searchResults: results }),
  // Offline download state
  offlineStatus: "idle",
  setOfflineStatus: (status) => set({ offlineStatus: status }),
  offlineUpdateAvailable: false,
  setOfflineUpdateAvailable: (value) => set({ offlineUpdateAvailable: value }),
  downloadProgress: null,
  setDownloadProgress: (progress) => set({ downloadProgress: progress }),
  localBundleVersions: {},
  setLocalBundleVersions: (versions) => set({ localBundleVersions: versions }),
  isConnected: true,
  setIsConnected: (connected) => set({ isConnected: connected }),
}));
