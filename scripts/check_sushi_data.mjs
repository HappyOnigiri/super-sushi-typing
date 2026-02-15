import fs from "node:fs";
import path from "node:path";
import { parse } from "yaml";

const SUSHI_YAML_PATH = path.resolve("src/data/sushi.yaml");
const READING_RE = /^[a-z-]+$/;

function fail(message) {
	console.error(message);
	process.exit(1);
}

function isRecord(v) {
	return typeof v === "object" && v !== null && !Array.isArray(v);
}

function assertNonEmptyString(v, label) {
	if (typeof v !== "string" || v.length === 0) {
		fail(`sushi.yaml の形式が不正です（${label} が不正です）`);
	}
}

function readYamlText() {
	try {
		return fs.readFileSync(SUSHI_YAML_PATH, "utf8");
	} catch (e) {
		fail(`sushi.yaml を読み込めませんでした: ${String(e)}`);
	}
}

function parseYaml(text) {
	try {
		return parse(text);
	} catch (e) {
		fail(`sushi.yaml のパースに失敗しました: ${String(e)}`);
	}
}

function validateSushiItem(item, label) {
	if (!isRecord(item)) {
		fail(`sushi.yaml の形式が不正です（${label} が object ではありません）`);
	}
	assertNonEmptyString(item.name, `${label}.name`);
	assertNonEmptyString(item.reading, `${label}.reading`);
	if (!READING_RE.test(item.reading)) {
		fail(
			`sushi.yaml の形式が不正です（${label}.reading は a-z とハイフンのみ許可）: ${item.reading}`,
		);
	}
	return { name: item.name, reading: item.reading };
}

function main() {
	const text = readYamlText();
	const root = parseYaml(text);

	if (!isRecord(root)) {
		fail("sushi.yaml の形式が不正です（root が object ではありません）");
	}

	const random = root.random_sushis;
	const groups = root.sushi_groups;

	if (!Array.isArray(random)) {
		fail("sushi.yaml の形式が不正です（random_sushis が配列ではありません）");
	}
	if (!Array.isArray(groups)) {
		fail("sushi.yaml の形式が不正です（sushi_groups が配列ではありません）");
	}

	const usedReadings = new Set();

	// random_sushis: 重複なし
	for (let i = 0; i < random.length; i++) {
		const item = validateSushiItem(random[i], `random_sushis[${i}]`);
		if (usedReadings.has(item.reading)) {
			fail(
				`sushi.yaml の形式が不正です（reading が重複しています）: ${item.reading}`,
			);
		}
		usedReadings.add(item.reading);
	}

	// sushi_groups: id 重複なし、グループ内重複なし、全体でも重複なし
	const usedGroupIds = new Set();
	for (let gi = 0; gi < groups.length; gi++) {
		const g = groups[gi];
		if (!isRecord(g)) {
			fail(`sushi.yaml の形式が不正です（sushi_groups[${gi}] が object ではありません）`);
		}

		const id = g.id;
		if (typeof id !== "string" && typeof id !== "number") {
			fail(`sushi.yaml の形式が不正です（sushi_groups[${gi}].id が不正です）`);
		}
		const idKey = String(id);
		if (idKey.length === 0) {
			fail(`sushi.yaml の形式が不正です（sushi_groups[${gi}].id が空です）`);
		}
		if (usedGroupIds.has(idKey)) {
			fail(`sushi.yaml の形式が不正です（group id が重複しています）: ${idKey}`);
		}
		usedGroupIds.add(idKey);

		if (!Array.isArray(g.sushis) || g.sushis.length === 0) {
			fail(
				`sushi.yaml の形式が不正です（sushi_groups[${gi}].sushis が配列ではない、または空です）: ${idKey}`,
			);
		}

		const usedInGroup = new Set();
		for (let si = 0; si < g.sushis.length; si++) {
			const item = validateSushiItem(
				g.sushis[si],
				`sushi_groups[${gi}].sushis[${si}] (id=${idKey})`,
			);
			if (usedInGroup.has(item.reading)) {
				fail(
					`sushi.yaml の形式が不正です（同一グループ内で reading が重複しています）: id=${idKey}, reading=${item.reading}`,
				);
			}
			usedInGroup.add(item.reading);

			if (usedReadings.has(item.reading)) {
				fail(
					`sushi.yaml の形式が不正です（reading が random_sushis または他グループと重複しています）: ${item.reading}`,
				);
			}
			usedReadings.add(item.reading);
		}
	}

	console.log("sushi.yaml: OK");
}

main();

