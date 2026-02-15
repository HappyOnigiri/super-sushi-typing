import { parse } from "yaml";
import type { SushiDef } from "../types";
import sushiYaml from "./sushi.yaml?raw";

type SushiYamlRoot = {
	sushis: Array<{
		name: string;
		reading: string;
	}>;
};

function isRecord(v: unknown): v is Record<string, unknown> {
	return typeof v === "object" && v !== null;
}

function toSushiDefsFromYaml(rawYaml: string): SushiDef[] {
	const parsed = parse(rawYaml) as unknown;
	if (!isRecord(parsed)) {
		throw new Error(
			"sushi.yaml の形式が不正です（root が object ではありません）",
		);
	}
	const root = parsed as Partial<SushiYamlRoot>;
	if (!Array.isArray(root.sushis)) {
		throw new Error(
			"sushi.yaml の形式が不正です（sushis が配列ではありません）",
		);
	}

	const defs: SushiDef[] = [];
	for (const item of root.sushis) {
		if (!isRecord(item)) {
			throw new Error(
				"sushi.yaml の形式が不正です（sushis に object 以外が含まれています）",
			);
		}
		const name = item.name;
		const reading = item.reading;
		if (typeof name !== "string" || name.length === 0) {
			throw new Error("sushi.yaml の形式が不正です（name が不正です）");
		}
		if (typeof reading !== "string" || reading.length === 0) {
			throw new Error("sushi.yaml の形式が不正です（reading が不正です）");
		}
		defs.push({ name, reading });
	}

	return defs;
}

export const SUSHI_DEFS: SushiDef[] = toSushiDefsFromYaml(sushiYaml);
