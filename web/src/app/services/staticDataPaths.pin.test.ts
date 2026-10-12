import { expect, test } from "bun:test";
import {
	appendStaticDataVersion,
	DSS_BOOK_KEY_ALIASES,
	dssBookAssetPath,
	dssChapterAssetPath,
	dssTranslitBookAssetPath,
	dssTranslitChapterAssetPath,
	LEXICON_ENTRY_DIR,
	LEXICON_INSTANCE_DIR,
	lexiconEntryAssetPath,
	lexiconEntryShardKey,
	lexiconInstancesAssetPath,
	normalizeStrongNumber,
	STATIC_DATA_VERSION_PATH,
	shouldVersionStaticPath,
	TRANSLIT_BOOK_FILE_ALIASES,
	toDssBookKey,
	translitBookAssetPath,
	translitBookFileStem,
	translitChapterAssetPath,
	ts2009ChapterAssetPath,
} from "../../../../shared/staticDataPaths";

test("static data path strings stay on the current contract", () => {
	expect(STATIC_DATA_VERSION_PATH).toBe("data/version.json");
	expect(LEXICON_ENTRY_DIR).toBe("dict/entries");
	expect(LEXICON_INSTANCE_DIR).toBe("dict/instances");
	expect(DSS_BOOK_KEY_ALIASES).toEqual({
		samuel1: "1samuel",
		samuel2: "2samuel",
		songofsolomon: "songs",
		hosea: "hoseah",
	});
	expect(TRANSLIT_BOOK_FILE_ALIASES).toEqual({
		samuel1: "isamuel",
		samuel2: "iisamuel",
		kings1: "ikings",
		kings2: "iikings",
		chronicles1: "ichronicles",
		chronicles2: "iichronicles",
	});

	expect(normalizeStrongNumber("H4723")).toBe("H4723");
	expect(normalizeStrongNumber(" h4723 ")).toBe("H4723");
	expect(normalizeStrongNumber("D123")).toBe("D123");
	expect(normalizeStrongNumber("Hc/H4723")).toBeNull();
	expect(normalizeStrongNumber("")).toBeNull();
	expect(normalizeStrongNumber(null)).toBeNull();
	expect(normalizeStrongNumber(undefined)).toBeNull();

	expect(lexiconEntryShardKey("H4723")).toBe("H47");
	expect(lexiconEntryAssetPath("H4723")).toBe("dict/entries/H47.json");
	expect(lexiconInstancesAssetPath(" h4723 ")).toBe(
		"dict/instances/H4723.json",
	);
	expect(lexiconInstancesAssetPath("not-a-strong")).toBe(
		"dict/instances/NOT-A-STRONG.json",
	);

	expect(toDssBookKey("samuel1")).toBe("1samuel");
	expect(toDssBookKey("hosea")).toBe("hoseah");
	expect(toDssBookKey("songofsolomon")).toBe("songs");
	expect(toDssBookKey("psalms")).toBe("psalms");
	expect(translitBookFileStem("samuel1")).toBe("isamuel");
	expect(translitBookFileStem("kings2")).toBe("iikings");
	expect(translitBookFileStem("chronicles1")).toBe("ichronicles");
	expect(translitBookFileStem("psalms")).toBe("psalms");

	expect(translitChapterAssetPath("samuel1", 1)).toBe(
		"translit/samuel1/1.json",
	);
	expect(translitBookAssetPath("samuel1")).toBe("translit/isamuel.json");
	expect(translitChapterAssetPath("psalms", 117)).toBe(
		"translit/psalms/117.json",
	);
	expect(translitBookAssetPath("psalms")).toBe("translit/psalms.json");

	expect(dssChapterAssetPath("samuel2", 3)).toBe("dss/2samuel/3.json");
	expect(dssBookAssetPath("hosea")).toBe("dss/hoseah.json");
	expect(dssBookAssetPath("chronicles1")).toBe("dss/chronicles1.json");
	expect(dssTranslitChapterAssetPath("songofsolomon", 1)).toBe(
		"translit/dss/songs/1.json",
	);
	expect(dssTranslitBookAssetPath("samuel1")).toBe("translit/dss/1samuel.json");

	expect(ts2009ChapterAssetPath("psalms", 117)).toBe("ts2009/psalms/117.json");
	expect(ts2009ChapterAssetPath("songofsolomon", 1)).toBe(
		"ts2009/songofsolomon/1.json",
	);

	expect(appendStaticDataVersion("translit/psalms.json", "abc")).toBe(
		"translit/psalms.json?v=abc",
	);
	expect(appendStaticDataVersion("translit/psalms.json?x=1", "a b")).toBe(
		"translit/psalms.json?x=1&v=a%20b",
	);
	expect(appendStaticDataVersion("translit/psalms.json", "")).toBe(
		"translit/psalms.json",
	);
	expect(appendStaticDataVersion("translit/psalms.json", null)).toBe(
		"translit/psalms.json",
	);

	expect(shouldVersionStaticPath("data/version.json")).toBe(false);
	expect(shouldVersionStaticPath("/data/version.json")).toBe(false);
	expect(shouldVersionStaticPath("data/metadata.json")).toBe(false);
	expect(shouldVersionStaticPath("greek/manifest.json")).toBe(false);
	expect(shouldVersionStaticPath("api/v1/calendar/upcoming")).toBe(false);
	expect(shouldVersionStaticPath("/api/v1/calendar/upcoming")).toBe(false);
	expect(shouldVersionStaticPath("metadata.json")).toBe(false);
	expect(shouldVersionStaticPath("notes.txt")).toBe(false);
	expect(shouldVersionStaticPath("data/oe/psalms/117.json")).toBe(true);
	expect(shouldVersionStaticPath("oe/psalms/117.json")).toBe(true);
	expect(shouldVersionStaticPath("dict/entries/H47.json")).toBe(true);
	expect(shouldVersionStaticPath("translit/isamuel.json")).toBe(true);
	expect(shouldVersionStaticPath("dss/1samuel/1.json")).toBe(true);
	expect(shouldVersionStaticPath("besorah/matthew/1.json")).toBe(true);
	expect(shouldVersionStaticPath("hutter/matthew/1.json")).toBe(true);
	expect(shouldVersionStaticPath("tth/bereshit.json")).toBe(true);
	expect(shouldVersionStaticPath("bes/genesis.json")).toBe(true);
	expect(shouldVersionStaticPath("ts2009/psalms/117.json")).toBe(true);
	expect(shouldVersionStaticPath("greek/john/1.json")).toBe(true);
	expect(shouldVersionStaticPath("prefixes.json")).toBe(true);
});
