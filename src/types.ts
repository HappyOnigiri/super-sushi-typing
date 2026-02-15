export interface SushiDef {
	name: string;
	reading: string;
}

export interface ActiveSushi {
	id: number;
	def: SushiDef;
	patterns: string[];
	matchIndices: number[];
	x: number;
	y: number;
	el: HTMLElement;
	captured: boolean;
	capturedAt: number;
}

export interface TaishoLine {
	trigger: string;
	lines: string[];
}

export interface RankDef {
	minScore: number;
	name: string;
	emoji: string;
	taisho: string[];
}
