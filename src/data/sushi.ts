import { parse } from "yaml";
import type { SushiDef, SushiGroup } from "../types";
import sushiYaml from "./sushi.yaml?raw";

type SushiYamlSushiItem = {
	name: string;
	reading: string;
};

type SushiYamlGroup = {
	id: string;
	sushis: SushiYamlSushiItem[];
};

type SushiYamlRoot = {
	random_sushis: SushiYamlSushiItem[];
	sushi_groups: SushiYamlGroup[];
};

function isRecord(v: unknown): v is Record<string, unknown> {
	return typeof v === "object" && v !== null;
}

function toSushiDefList(
	items: SushiYamlSushiItem[],
	yamlName: string,
	context: string,
): SushiDef[] {
	const defs: SushiDef[] = [];
	const usedReadings = new Set<string>();

	for (const item of items) {
		if (!isRecord(item)) {
			throw new Error(
				`${yamlName} の形式が不正です（${context} に object 以外が含まれています）`,
			);
		}
		const name = item.name;
		const reading = item.reading;
		if (typeof name !== "string" || name.length === 0) {
			throw new Error(
				`${yamlName} の形式が不正です（${context}.name が不正です）`,
			);
		}
		if (typeof reading !== "string" || reading.length === 0) {
			throw new Error(
				`${yamlName} の形式が不正です（${context}.reading が不正です）`,
			);
		}
		if (usedReadings.has(reading)) {
			throw new Error(
				`${yamlName} の形式が不正です（${context} 内で reading が重複しています）: ${reading}`,
			);
		}
		usedReadings.add(reading);
		defs.push({ name, reading });
	}

	return defs;
}

function parseRoot(rawYaml: string, yamlName: string): SushiYamlRoot {
	const parsed = parse(rawYaml) as unknown;
	if (!isRecord(parsed)) {
		throw new Error(
			`${yamlName} の形式が不正です（root が object ではありません）`,
		);
	}
	const root = parsed as Partial<SushiYamlRoot>;
	if (!Array.isArray(root.random_sushis)) {
		throw new Error(
			`${yamlName} の形式が不正です（random_sushis が配列ではありません）`,
		);
	}
	if (!Array.isArray(root.sushi_groups)) {
		throw new Error(
			`${yamlName} の形式が不正です（sushi_groups が配列ではありません）`,
		);
	}
	return root as SushiYamlRoot;
}

const root = parseRoot(sushiYaml, "sushi.yaml");

export const RANDOM_SUSHI_DEFS: SushiDef[] = toSushiDefList(
	root.random_sushis,
	"sushi.yaml",
	"random_sushis",
);

const usedAllReadings = new Set<string>(
	RANDOM_SUSHI_DEFS.map((d) => d.reading),
);
export const SUSHI_GROUPS: SushiGroup[] = [];
export const GROUP_SUSHI_DEFS: SushiDef[] = [];

const usedGroupIds = new Set<string>();
for (const group of root.sushi_groups) {
	if (!isRecord(group)) {
		throw new Error(
			"sushi.yaml の形式が不正です（sushi_groups に object 以外が含まれています）",
		);
	}
	const id = group.id;
	if (typeof id !== "string" || id.length === 0) {
		throw new Error(
			"sushi.yaml の形式が不正です（sushi_groups.id が不正です）",
		);
	}
	if (usedGroupIds.has(id)) {
		throw new Error(
			`sushi.yaml の形式が不正です（sushi_groups.id が重複しています）: ${id}`,
		);
	}
	usedGroupIds.add(id);

	const items = (group as SushiYamlGroup).sushis;
	if (!Array.isArray(items) || items.length === 0) {
		throw new Error(
			`sushi.yaml の形式が不正です（sushi_groups.sushis が不正です）: ${id}`,
		);
	}

	const defs = toSushiDefList(
		items,
		"sushi.yaml",
		`sushi_groups(${id}).sushis`,
	);
	const readings: string[] = [];
	for (const d of defs) {
		if (usedAllReadings.has(d.reading)) {
			throw new Error(
				`sushi.yaml の形式が不正です（reading が random_sushis または他グループと重複しています）: ${d.reading}`,
			);
		}
		usedAllReadings.add(d.reading);
		GROUP_SUSHI_DEFS.push(d);
		readings.push(d.reading);
	}

	SUSHI_GROUPS.push({ id, readings });
}

export const SUSHI_DEFS: SushiDef[] = [
	...RANDOM_SUSHI_DEFS,
	...GROUP_SUSHI_DEFS,
];
