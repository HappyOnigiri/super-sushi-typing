/**
 * ゲームバランス調整用定数
 */
export const GAME_CONFIG = {
	/** 初期制限時間（秒） */
	INITIAL_TIME: 60,

	/** 寿司の初期移動速度 */
	INITIAL_SPEED: 0.5,

	/** 時間経過による速度上昇率 */
	SPEED_UP_RATE: 0.005,

	/** 最大移動速度 */
	MAX_SPEED: 1.25,

	/** 寿司の再出現間隔（ミリ秒） */
	SPAWN_INTERVAL_BASE: 1000,
	SPAWN_INTERVAL_RANDOM: 1000,

	/** コンボによるスコア倍率の上昇率 (1 + combo * value) */
	COMBO_MULTIPLIER_RATE: 0.1,

	/** 同時消しの倍率設定 */
	SIMULTANEOUS_MULTIPLIERS: {
		1: 1,
		2: 5,
		3: 15,
		4: 50, // 4皿以上
	} as Record<number, number>,

	/** 寿司の長さごとの基礎点 */
	BASE_POINTS: {
		short: 80,
		medium: 150,
		long: 300,
	} as Record<"short" | "medium" | "long", number>,

	/** 画面内に表示できる寿司の最大数 */
	MAX_LIVE_SUSHI: 6,

	/** 寿司の右端出現位置のオフセット */
	SPAWN_X_OFFSET: 50,

	/** 寿司が画面外とみなされるX座標（左端） */
	DESPAWN_X: -150,
};
