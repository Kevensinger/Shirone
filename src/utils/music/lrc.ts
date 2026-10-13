/**
 * LRC 歌词解析。
 *
 * 刻意写成**纯函数、零依赖**：Meting 的歌词接口返回的就是标准 LRC 文本，格式简单到
 * 不值得引入整个歌词库——何况主题以 npm 包形式分发，新增依赖要走 `dependencies` 与
 * `check:package-manifest` 的打包清单校验，成本远高于这几十行。
 *
 * 支持的写法：
 * - `[mm:ss]` / `[mm:ss.xx]` / `[mm:ss.xxx]` / `[mm:ss:xx]`（小数位数不限）
 * - 一行带多个时间标签（`[00:12.00][00:56.00]同一句`）会展开成多条
 * - 元信息标签 `[ti:]` `[ar:]` `[al:]` `[by:]`，以及 `[offset:±毫秒]` 整体平移
 * - 空文本行会被丢弃：歌词面板只滚动有内容的行，保留空行只会制造无意义的停顿
 */

export interface LrcLine {
	/** 行开始时间，单位秒 */
	readonly time: number;
	readonly text: string;
}

export interface ParsedLrc {
	/** 元信息标签，键统一转小写（ti / ar / al / by / offset…） */
	readonly metadata: Readonly<Record<string, string>>;
	/** 按时间升序排列的歌词行 */
	readonly lines: readonly LrcLine[];
}

/** 时间标签：`[分:秒]`，小数部分允许 `.` 或 `:` 分隔且位数不限 */
const TIME_TAG = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;
/** 元信息标签：键必须是纯字母，因此不会误吞 `[00:12.00]` 这类时间标签 */
const META_TAG = /^\[([a-zA-Z]+):\s*(.*?)\s*\]$/;

function toSeconds(minute: string, second: string, fraction?: string): number {
	const m = Number.parseInt(minute, 10) || 0;
	const s = Number.parseInt(second, 10) || 0;
	// `.5` / `.50` / `.500` 是同一含义，按十进制小数解析最稳
	const f = fraction ? Number.parseFloat(`0.${fraction}`) : 0;
	return m * 60 + s + (Number.isFinite(f) ? f : 0);
}

const EMPTY: ParsedLrc = Object.freeze({
	metadata: Object.freeze({}),
	lines: Object.freeze([]),
});

export function parseLrc(source: string): ParsedLrc {
	if (typeof source !== "string" || source.length === 0) return EMPTY;

	const metadata: Record<string, string> = {};
	const lines: LrcLine[] = [];

	for (const raw of source.replace(/^\uFEFF/, "").split(/\r?\n/)) {
		const line = raw.trim();
		if (!line) continue;

		const meta = line.match(META_TAG);
		if (meta) {
			metadata[meta[1].toLowerCase()] = meta[2];
			continue;
		}

		TIME_TAG.lastIndex = 0;
		const stamps: number[] = [];
		let match: RegExpExecArray | null = TIME_TAG.exec(line);
		while (match !== null) {
			stamps.push(toSeconds(match[1], match[2], match[3]));
			match = TIME_TAG.exec(line);
		}
		if (stamps.length === 0) continue;

		// 去掉所有时间标签后剩下的才是歌词正文
		const text = line.replace(TIME_TAG, "").trim();
		if (!text) continue;

		for (const time of stamps) lines.push({ time, text });
	}

	// `offset` 单位是毫秒，正值表示歌词相对音频整体提前
	const offset = Number.parseFloat(metadata.offset ?? "");
	const shift = Number.isFinite(offset) ? -offset / 1000 : 0;

	const normalized = lines
		.map((entry) =>
			shift ? { time: Math.max(0, entry.time + shift), text: entry.text } : entry,
		)
		.sort((a, b) => a.time - b.time)
		.map((entry) => Object.freeze(entry));

	return Object.freeze({
		metadata: Object.freeze(metadata),
		lines: Object.freeze(normalized),
	});
}

/**
 * 二分查找当前播放时间对应的歌词行下标。
 *
 * 返回最后一条 `time <= currentTime` 的行；早于第一行时返回 -1（此时不该高亮任何行）。
 * 用二分而不是线性扫描，是因为这个函数会在 `timeupdate` 里被高频调用。
 */
export function findActiveLine(
	lines: readonly LrcLine[],
	currentTime: number,
): number {
	if (lines.length === 0 || !Number.isFinite(currentTime)) return -1;
	if (currentTime < lines[0].time) return -1;

	let low = 0;
	let high = lines.length - 1;
	while (low < high) {
		const mid = Math.ceil((low + high) / 2);
		if (lines[mid].time <= currentTime) low = mid;
		else high = mid - 1;
	}
	return low;
}
