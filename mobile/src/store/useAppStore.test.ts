// Bun provides this test module at runtime; Expo's resolver does not index it.
// eslint-disable-next-line import/no-unresolved
import { afterEach, describe, expect, mock, test } from "bun:test";

mock.module("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: async () => null,
    setItem: async () => {},
    removeItem: async () => {},
    clear: async () => {},
  },
}));

const { useAppStore } = await import("./useAppStore");

afterEach(() => {
  useAppStore.setState(useAppStore.getInitialState(), true);
});

describe("Sefer style", () => {
  test("can be enabled after selecting Full Chapter from bilingual reading", () => {
    const { setShowFullChapter, setSeferMode } = useAppStore.getState();
    useAppStore.setState({ showQumran: true, showCantillation: true });

    setShowFullChapter(true);
    setSeferMode(true);

    expect(useAppStore.getState()).toMatchObject({
      showFullChapter: true,
      seferMode: true,
      translationOnly: true,
      hebrewOnly: false,
      showQumran: false,
      showCantillation: false,
      showNikud: false,
    });
  });

  test("preserves Hebrew Only when Sefer is enabled", () => {
    const { setShowFullChapter, setHebrewOnly, setSeferMode } =
      useAppStore.getState();
    setHebrewOnly(true);
    setShowFullChapter(true);
    setSeferMode(true);

    expect(useAppStore.getState()).toMatchObject({
      showFullChapter: true,
      seferMode: true,
      hebrewOnly: true,
      translationOnly: false,
      showNikud: true,
    });
  });

  test("can be toggled without leaving Translation Only or Full Chapter", () => {
    const { setTranslationOnly, setSeferMode } = useAppStore.getState();
    setTranslationOnly(true);
    setSeferMode(false);
    expect(useAppStore.getState()).toMatchObject({
      showFullChapter: true,
      seferMode: false,
      translationOnly: true,
    });

    setSeferMode(true);
    expect(useAppStore.getState()).toMatchObject({
      showFullChapter: true,
      seferMode: true,
      translationOnly: true,
    });
  });

  test("requires Full Chapter and turns off when Full Chapter is disabled", () => {
    const { setShowFullChapter, setSeferMode } = useAppStore.getState();
    setSeferMode(true);
    expect(useAppStore.getState()).toMatchObject({
      showFullChapter: false,
      seferMode: false,
      translationOnly: false,
    });

    setShowFullChapter(true);
    setSeferMode(true);
    setShowFullChapter(false);
    expect(useAppStore.getState()).toMatchObject({
      showFullChapter: false,
      seferMode: false,
    });
  });
});
