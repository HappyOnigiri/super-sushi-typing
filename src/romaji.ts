// ローマ字入力の表記ゆれを吸収し、入力可能なパターンを生成するユーティリティ。
// DOM に依存しない純粋ロジックとして切り出す。

type RomajiToken = string;

// 表記ゆれグループ（IME的な入力を広く許容）
const ROMAJI_EQUIV_GROUPS: string[][] = [
	// し
	["shi", "si", "ci"],
	// ち
	["chi", "ti", "ci"],
	// つ
	["tsu", "tu"],
	// ふ
	["fu", "hu"],
	// じ
	["ji", "zi"],
	// づ/ぢ系（一般的に欲しくなるので入れておく）
	["du", "zu"],
	["di", "ji", "zi"],

	// しゃ/しゅ/しょ
	["sha", "sya", "shya"],
	["shu", "syu", "shyu"],
	["sho", "syo", "shyo"],
	// ちゃ/ちゅ/ちょ
	["cha", "tya", "cya", "chya"],
	["chu", "tyu", "cyu", "chyu"],
	["cho", "tyo", "cyo", "chyo"],
	// じゃ/じゅ/じょ
	["ja", "zya", "jya"],
	["ju", "zyu", "jyu"],
	["jo", "zyo", "jyo"],

	// ふぁ/ふぃ/ふぇ/ふぉ（外来音）
	["fa", "fwa"],
	["fi", "fwi", "fyi"],
	["fe", "fye"],
	["fo", "fwo"],

	// うぃ/うぇ（便利用の表記）
	["wi", "whi"],
	["we", "whe"],
	// 一覧では「うぁ/うぉ」に wha/who を使う（通常の「wa/wo」とは厳密には別音だが、入力ゆれとして許容）
	["wa", "wha"],
	["wo", "who"],
	// いぇ
	["ye", "ie"],

	// q 系（くぁ/くぃ/くぇ/くぉ 等）
	["qa", "qwa"],
	["qi", "qwi", "qyi"],
	["qu", "qwu"],
	["qe", "qwe", "qye"],
	["qo", "qwo"],

	// 小書き文字
	["xa", "la"],
	["xi", "li", "lyi", "xyi"],
	["xu", "lu"],
	["xe", "le", "lye", "xye"],
	["xo", "lo"],
];

const ROMAJI_TOKEN_TO_EQUIV = new Map<string, string[]>();
for (const group of ROMAJI_EQUIV_GROUPS) {
	for (const t of group) ROMAJI_TOKEN_TO_EQUIV.set(t, group);
}

function isAsciiLowerAlpha(c: string): boolean {
	return c >= "a" && c <= "z";
}

function isVowel(c: string): boolean {
	return c === "a" || c === "i" || c === "u" || c === "e" || c === "o";
}

function isConsonant(c: string): boolean {
	return isAsciiLowerAlpha(c) && !isVowel(c);
}

function findLastVowel(s: string): string {
	for (let i = s.length - 1; i >= 0; i--) {
		const c = s[i];
		if (c && isVowel(c)) return c;
	}
	return "";
}

function firstConsonantChar(s: string): string {
	for (let i = 0; i < s.length; i++) {
		const c = s[i];
		if (!c) continue;
		if (isConsonant(c)) return c;
		if (isVowel(c)) return "";
	}
	return "";
}

// パース用: 認識できる音節トークンを列挙しておく（長いもの優先でマッチ）
const ROMAJI_SYLLABLE_TOKENS: string[] = (() => {
	const tokens = new Set<string>();

	// 母音
	for (const v of ["a", "i", "u", "e", "o"]) tokens.add(v);

	// 基本子音 + 母音
	const bases = [
		"k",
		"s",
		"t",
		"n",
		"h",
		"m",
		"y",
		"r",
		"w",
		"g",
		"z",
		"d",
		"b",
		"p",
		"f",
		"j",
		"q",
		"x",
		"l",
	];
	for (const b of bases) {
		for (const v of ["a", "i", "u", "e", "o"]) tokens.add(b + v);
	}

	// y行（ye も一覧にあるので含める）
	for (const v of ["a", "u", "o", "e"]) tokens.add("y" + v);

	// wh 系（一覧で使う）
	for (const t of ["wha", "whi", "whu", "whe", "who"]) tokens.add(t);

	// 拗音（kya など）
	const yConsonants = [
		"ky",
		"gy",
		"sy",
		"shy",
		"ty",
		"chy",
		"ny",
		"hy",
		"by",
		"py",
		"my",
		"ry",
		"jy",
		"zy",
		"dy",
		"fy",
	];
	for (const c of yConsonants) {
		for (const v of ["a", "u", "o"]) tokens.add(c + v);
	}

	// 不規則
	for (const t of [
		"shi",
		"si",
		"chi",
		"ti",
		"tsu",
		"tu",
		"fu",
		"hu",
		"ji",
		"zi",
	]) {
		tokens.add(t);
	}

	// 拗音の不規則（sha/sya/cha/tya/ja など）
	for (const t of [
		"sha",
		"sya",
		"shya",
		"shu",
		"syu",
		"shyu",
		"sho",
		"syo",
		"shyo",
		"cha",
		"tya",
		"cya",
		"chya",
		"chu",
		"tyu",
		"cyu",
		"chyu",
		"cho",
		"tyo",
		"cyo",
		"chyo",
		"ja",
		"zya",
		"jya",
		"ju",
		"zyu",
		"jyu",
		"jo",
		"zyo",
		"jyo",
		"fa",
		"fwa",
		"fi",
		"fwi",
		"fyi",
		"fwu",
		"fe",
		"fwe",
		"fye",
		"fo",
		"fwo",
		"fya",
		"fyu",
		"fyo",

		// 一覧の追加トークン
		"ye",
		"qwa",
		"qwi",
		"qyi",
		"qwu",
		"qwe",
		"qye",
		"qwo",
		"qya",
		"qyu",
		"qyo",
		"swa",
		"swi",
		"swu",
		"swe",
		"swo",
		"tsa",
		"tsi",
		"tse",
		"tso",
		"tha",
		"thi",
		"thu",
		"the",
		"tho",
		"twa",
		"twi",
		"twu",
		"twe",
		"two",
		"gwa",
		"gwi",
		"gwu",
		"gwe",
		"gwo",
		"dha",
		"dhi",
		"dhu",
		"dhe",
		"dho",
		"dwa",
		"dwi",
		"dwu",
		"dwe",
		"dwo",
	]) {
		tokens.add(t);
	}

	// 長いもの優先
	return Array.from(tokens).sort((a, b) => b.length - a.length);
})();

type TokenizeState = {
	i: number;
	out: RomajiToken[];
};

// 促音・撥音・長音（-）も含めてトークン化する。`n` + `ya` と `nya` のような曖昧ケースは分岐させる。
function tokenizeReading(reading: string): RomajiToken[][] {
	const r = reading.toLowerCase();
	const results: RomajiToken[][] = [];
	const queue: TokenizeState[] = [{ i: 0, out: [] }];

	const maxResults = 8; // 分岐が暴れないための安全弁（実データ上はここまで行かない想定）

	while (queue.length > 0 && results.length < maxResults) {
		const cur = queue.shift()!;
		const i = cur.i;

		if (i >= r.length) {
			results.push(cur.out);
			continue;
		}

		const c = r[i] ?? "";
		const c2 = r[i + 1] ?? "";

		// 長音（データ上は - を使っている）
		if (c === "-") {
			queue.push({ i: i + 1, out: [...cur.out, "ー"] });
			continue;
		}

		// 促音（同一子音の重ね: kk, tt など。ただし nn は撥音扱いに任せる）
		if (c && c2 && c === c2 && isConsonant(c) && c !== "n") {
			queue.push({ i: i + 1, out: [...cur.out, "っ"] });
			continue;
		}

		// 撥音: nn は ん として確定
		if (c === "n" && c2 === "n") {
			queue.push({ i: i + 2, out: [...cur.out, "ん"] });
			continue;
		}

		// 撥音: n + y[a/u/o] は "ん"+"ya" と "nya" が曖昧になりやすいので分岐
		const c3 = r[i + 2] ?? "";
		if (c === "n" && c2 === "y" && (c3 === "a" || c3 === "u" || c3 === "o")) {
			// 分岐1: ん + ya/yu/yo（n を消費）
			queue.push({ i: i + 1, out: [...cur.out, "ん"] });
			// 分岐2: 通常の音節マッチに回す（このまま）
		}

		// 撥音: n + (子音/終端) は ん として扱う（n + 母音は基本的に音節側で拾う）
		if (c === "n") {
			const next = r[i + 1] ?? "";
			if (next === "" || next === "-" || (isConsonant(next) && next !== "y")) {
				queue.push({ i: i + 1, out: [...cur.out, "ん"] });
				continue;
			}
		}

		// 通常の音節トークン（長いもの優先）
		let matched = false;
		for (const t of ROMAJI_SYLLABLE_TOKENS) {
			if (t.length === 0) continue;
			if (r.startsWith(t, i)) {
				queue.push({ i: i + t.length, out: [...cur.out, t] });
				matched = true;
				break;
			}
		}

		if (!matched) {
			// 想定外の文字（全角/記号など）が来てもゲームを壊さないため、そのまま1文字として扱う
			queue.push({ i: i + 1, out: [...cur.out, c] });
		}
	}

	return results.length > 0 ? results : [[reading]];
}

function tokenOptions(token: RomajiToken): string[] {
	if (token === "ー") return ["-"]; // ここではベースのみ（母音重ねは生成時に文脈で足す）
	if (token === "っ") return ["xtu", "ltu", "xtsu", "ltsu"]; // 次音節の子音重ねは生成時に文脈で足す
	if (token === "ん") return ["n", "nn", "xn", "n'"];


	// 小書き拗音: ゃゅょ（必要になることがあるので許容）
	if (token === "ya" || token === "yu" || token === "yo") {
		return [token, `x${token}`, `l${token}`];
	}

	const base = ROMAJI_TOKEN_TO_EQUIV.get(token) ?? [token];
	// 重複排除（グループ定義の都合で同じ候補が混ざることがある）
	return Array.from(new Set(base));
}

function canStartWithVowelOrY(s: string): boolean {
	const c = s[0] ?? "";
	return c === "y" || isVowel(c);
}

function generatePatternsFromTokens(tokens: RomajiToken[]): Set<string> {
	const out = new Set<string>();

	const dfs = (idx: number, built: string, lastVowel: string) => {
		if (idx >= tokens.length) {
			out.add(built);
			return;
		}

		const tk = tokens[idx] ?? "";

		// 長音（-）: "-" か、直前母音の重ねを許容
		if (tk === "ー") {
			dfs(idx + 1, built + "-", lastVowel);
			if (lastVowel) dfs(idx + 1, built + lastVowel, lastVowel);
			return;
		}

		// 促音: 次音節がある場合に、子音重ね か xtu/ltu 系を許容
		if (tk === "っ") {
			const next = tokens[idx + 1];
			if (!next) {
				// 末尾に来るのは想定外だが、保険で小さい「つ」系として扱う
				for (const opt of tokenOptions("っ")) {
					dfs(idx + 1, built + opt, findLastVowel(opt) || lastVowel);
				}
				return;
			}

			const nextOpts = tokenOptions(next);
			for (const nextOpt of nextOpts) {
				// パターン1: xtu/ltu/xtsu/ltsu + 次音節
				for (const xtu of tokenOptions("っ")) {
					const v = findLastVowel(nextOpt) || findLastVowel(xtu) || lastVowel;
					dfs(idx + 2, built + xtu + nextOpt, v);
				}

				// パターン2: 子音重ね + 次音節（先頭が子音のときのみ）
				const cons = firstConsonantChar(nextOpt);
				if (cons) {
					const v = findLastVowel(nextOpt) || lastVowel;
					dfs(idx + 2, built + cons + nextOpt, v);
				}
			}
			return;
		}

		// 撥音: 次が母音/y なら n' / nn を許容（n 単体も残す）
		if (tk === "ん") {
			const next = tokens[idx + 1];
			let nextStartsVowelOrY = false;
			if (next) {
				// 次トークンの候補のうち、先頭が母音/y のものがあるなら条件付きにする
				const nextOpts = tokenOptions(next);
				nextStartsVowelOrY = nextOpts.some((o) => canStartWithVowelOrY(o));
			}

			const opts = tokenOptions("ん");
			for (const opt of opts) {
				if (!nextStartsVowelOrY && opt === "n'") continue; // 次が母音/y でないときの n' は不要
				const v = findLastVowel(opt) || lastVowel;
				dfs(idx + 1, built + opt, v);
			}
			return;
		}

		for (const opt of tokenOptions(tk)) {
			const v = findLastVowel(opt) || lastVowel;
			dfs(idx + 1, built + opt, v);
		}
	};

	dfs(0, "", "");
	return out;
}

const VARIANT_CACHE = new Map<string, string[]>();

export function generateVariants(reading: string): string[] {
	const cached = VARIANT_CACHE.get(reading);
	if (cached) return cached;

	const set = new Set<string>();
	set.add(reading);

	const tokenizations = tokenizeReading(reading);
	for (const toks of tokenizations) {
		const patterns = generatePatternsFromTokens(toks);
		for (const p of patterns) set.add(p);
	}

	// 安全弁: 万一爆発してもゲームが固まらないように上限を設ける
	// （実データ上はここまで増えない想定。必要なら調整）
	const arr = Array.from(set);
	const limited = arr.length > 4096 ? arr.slice(0, 4096) : arr;
	VARIANT_CACHE.set(reading, limited);
	return limited;
}
