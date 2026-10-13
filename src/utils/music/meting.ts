import type {
	MetingMusicConfig,
	TrackDescriptor,
} from "../../types/musicConfig.ts";

export const DEFAULT_METING_API =
	"https://api.injahow.cn/meting/?server=:server&type=:type&id=:id&r=:r";
export const DEFAULT_METING_SERVER = "netease";
export const DEFAULT_METING_TYPE = "playlist";

export interface RawMetingSong {
	id?: number | string;
	name?: string;
	title?: string;
	artist?: string;
	author?: string;
	duration?: number | string;
	pic?: string;
	url?: string;
	lrc?: string;
}

/**
 * 用一份 API 模板展开出请求 URL（`:server` / `:type` / `:id` / `:r` / `:auth`）。
 * `id` 为空时返回 null。`random` 由调用方传入，让同一批候选共享同一个防缓存参数。
 */
function expandMetingTemplate(
	api: string,
	config: MetingMusicConfig,
	random: string,
): string | null {
	const id = config.id?.trim();
	if (!id) return null;

	const server = config.server?.trim() || DEFAULT_METING_SERVER;
	const type = config.type?.trim() || DEFAULT_METING_TYPE;

	return api
		.replace(":server", encodeURIComponent(server))
		.replace(":type", encodeURIComponent(type))
		.replace(":id", encodeURIComponent(id))
		.replace(":auth", "")
		.replace(":r", random);
}

/**
 * 根据 Meting 配置组装请求 URL。若 ID 为空则返回 null。
 */
export function buildMetingUrl(config: MetingMusicConfig): string | null {
	return expandMetingTemplate(
		config.api?.trim() || DEFAULT_METING_API,
		config,
		Date.now().toString(),
	);
}

/**
 * 主 API 与回退 API 的候选 URL 列表，按声明顺序去重。
 *
 * 公开的 Meting 实例经常失效或返回非 JSON 内容，回退列表让「某一个实例挂了」不再等于
 * 「歌单不可用」。`id` 为空时返回空数组。
 */
export function buildMetingUrlCandidates(
	config: MetingMusicConfig,
): readonly string[] {
	const templates = [
		config.api?.trim() || DEFAULT_METING_API,
		...(config.fallbackApis ?? []),
	];
	const random = Date.now().toString();
	const seen = new Set<string>();
	const urls: string[] = [];

	for (const template of templates) {
		const trimmed = template?.trim();
		if (!trimmed || seen.has(trimmed)) continue;
		seen.add(trimmed);

		const url = expandMetingTemplate(trimmed, config, random);
		if (url) urls.push(url);
	}

	return urls;
}

/**
 * Meting 的 `lrc` 字段是**歌词接口的绝对 URL**，不是歌词正文。这里只接受 http(s)，
 * 避免把 `javascript:` 之类的地址带进播放器。正文由播放器按需再请求一次。
 */
function normalizeLrcUrl(value: unknown): string | undefined {
	if (typeof value !== "string") return undefined;
	const trimmed = value.trim();
	return /^https?:\/\//i.test(trimmed) ? trimmed : undefined;
}

/**
 * 将 Meting API 单曲响应清洗并转换为标准的 TrackDescriptor。
 */
export function parseMetingSong(
	song: RawMetingSong,
	index: number,
	server: string = DEFAULT_METING_SERVER,
): TrackDescriptor | null {
	if (!song || typeof song !== "object") return null;

	const title = (song.name ?? song.title ?? "").trim();
	const source = (song.url ?? "").trim();
	if (!title || !source) return null;

	const id =
		song.id !== undefined && song.id !== null && String(song.id).trim() !== ""
			? `meting-${server}-${String(song.id).trim()}`
			: `meting-${server}-${index}-${Math.random().toString(36).slice(2, 8)}`;

	const artist = (song.artist ?? song.author ?? "").trim() || undefined;
	const cover = (song.pic ?? "").trim() || undefined;

	let duration: number | undefined;
	if (typeof song.duration === "number" && Number.isFinite(song.duration)) {
		duration =
			song.duration > 10000
				? Math.floor(song.duration / 1000)
				: Math.floor(song.duration);
	} else if (typeof song.duration === "string") {
		const parsed = Number.parseInt(song.duration, 10);
		if (Number.isFinite(parsed) && parsed > 0) {
			duration = parsed > 10000 ? Math.floor(parsed / 1000) : parsed;
		}
	}
	if (duration !== undefined && duration <= 0) {
		duration = undefined;
	}

	const lrcUrl = normalizeLrcUrl(song.lrc);

	return Object.freeze({
		id,
		title,
		source,
		artist,
		cover,
		duration,
		// 只在存在时带上，不给 TrackDescriptor 添一个恒为 undefined 的键
		// （tests/site/music-core.spec.ts 用 toEqual 精确比对返回对象）。
		...(lrcUrl ? { lrcUrl } : {}),
	});
}

/**
 * 从 Meting API 异步获取并解析曲目列表。
 *
 * 按 `buildMetingUrlCandidates()` 的顺序逐个尝试：主 API 请求失败、返回非数组、或返回
 * 空歌单时都会继续试下一个回退实例，第一个给出可用曲目的实例胜出。
 *
 * 若所有实例都只返回了「合法但空的歌单」，返回空数组而不是抛错——那说明歌单本身是空的，
 * 与「接口不可用」是两回事。只有所有实例都失败时才抛出最后一个错误。
 */
export async function fetchMetingTracks(
	config: MetingMusicConfig,
	customFetch: typeof fetch = fetch,
): Promise<readonly TrackDescriptor[]> {
	const urls = buildMetingUrlCandidates(config);
	if (urls.length === 0) return [];

	const server = config.server || DEFAULT_METING_SERVER;
	let emptyPlaylist: readonly TrackDescriptor[] | null = null;
	let lastError: unknown = null;

	for (const url of urls) {
		try {
			const response = await customFetch(url);
			if (!response.ok) {
				lastError = new Error(`Meting API HTTP ${response.status}`);
				continue;
			}

			const data = (await response.json()) as RawMetingSong[];
			if (!Array.isArray(data)) {
				lastError = new Error("Meting API did not return an array");
				continue;
			}

			const tracks: TrackDescriptor[] = [];
			const seenIds = new Set<string>();

			for (let i = 0; i < data.length; i++) {
				const track = parseMetingSong(data[i], i, server);
				if (track && !seenIds.has(track.id)) {
					seenIds.add(track.id);
					tracks.push(track);
				}
			}

			if (tracks.length > 0) return Object.freeze(tracks);
			emptyPlaylist = emptyPlaylist ?? Object.freeze(tracks);
		} catch (error) {
			lastError = error;
		}
	}

	if (emptyPlaylist) return emptyPlaylist;

	throw lastError instanceof Error
		? lastError
		: new Error("Meting API unavailable");
}
