import joplin from 'api';
import { MenuItemLocation, SettingItemType, ToolbarButtonLocation, ToastType } from 'api/types';
import * as https from 'https';
import * as http from 'http';
import { URL } from 'url';

type StreamHandler = (delta: string) => Promise<void> | void;

interface ChatRequestOptions {
	stream?: boolean;
	model?: string;
	systemMessage?: string;
}

interface AiMetadata {
	title: string;
	tags: string[];
	raw: string;
}

const DEFAULT_TITLE_SYSTEM_PROMPT = '你是一名知识管理助手，需根据笔记内容生成简洁、具体的中文标题。';
const DEFAULT_TAG_SYSTEM_PROMPT = [
	'# \u89d2\u8272',
	'\u4f60\u662f\u4e00\u540d\u4e25\u683c\u7684\u539f\u5b50\u6807\u7b7e\u751f\u6210\u5668\u3002',
	'',
	'# \u80cc\u666f',
	'\u7528\u6237\u9700\u8981\u4ece\u7b14\u8bb0\u5185\u5bb9\u4e2d\u63d0\u70bc\u51fa\u6700\u57fa\u7840\u7684\u3001\u4e0d\u53ef\u518d\u5206\u7684\u6982\u5ff5\u6807\u7b7e\uff0c\u4ee5\u4fbf\u540e\u7eed\u7075\u6d3b\u7ec4\u5408\u548c\u68c0\u7d22\u3002\u6807\u7b7e\u5fc5\u987b\u4ee3\u8868\u72ec\u7acb\u7684\u8bed\u4e49\u5355\u5143\u3002',
	'',
	'# \u6838\u5fc3\u6307\u4ee4',
	'## \u4e09\u6761\u5f3a\u5236\u89c4\u5219',
	'1. **\u9996\u8981\u5b9e\u4f53\u539f\u5219**',
	'    \u7b2c\u4e00\u4e2a\u6807\u7b7e\u5fc5\u987b\u662f\u7b14\u8bb0\u8ba8\u8bba\u7684**\u6700\u6838\u5fc3\u3001\u6700\u5177\u4f53\u7684\u5b9e\u4f53**\uff08\u5982\u8f6f\u4ef6\u540d\u3001\u9879\u76ee\u540d\u3001\u7279\u5b9a\u6982\u5ff5\uff09\u3002\u8fd9\u662f\u552f\u4e00\u5141\u8bb8\u4f7f\u7528\u7684\u4e13\u6709\u540d\u8bcd\u6807\u7b7e\u3002',
	'',
	'2. **\u7edd\u5bf9\u62c6\u89e3\u89c4\u5219**',
	'    \u4e25\u7981\u751f\u6210\u4efb\u4f55\u590d\u5408\u6807\u7b7e\u3002\u4ee5\u4e0b\u60c5\u51b5\u5fc5\u987b\u62c6\u89e3\uff1a',
	'    - \u5305\u542b\u201c\u7684\u201d\u5b57\u7ed3\u6784\uff08\u5982\u201c\u6570\u636e\u7684\u5907\u4efd\u201d \u2192 `\u6570\u636e, \u5907\u4efd`\uff09',
	'    - \u7531\u4e24\u4e2a\u72ec\u7acb\u540d\u8bcd\u62fc\u63a5\uff08\u5982\u201c\u6570\u636e\u7ba1\u7406\u201d \u2192 `\u6570\u636e, \u7ba1\u7406`\uff09',
	'    - \u7531\u540d\u8bcd+\u52a8\u8bcd/\u52a8\u540d\u8bcd\u62fc\u63a5\uff08\u5982\u201c\u683c\u5f0f\u8f6c\u6362\u201d \u2192 `\u683c\u5f0f, \u8f6c\u6362`\uff09',
	'',
	'3. **\u8bcd\u6027\u7eaf\u51c0\u8981\u6c42**',
	'    \u6240\u6709\u6807\u7b7e\u5fc5\u987b\u662f\uff1a',
	'    - \u5355\u4e00\u6982\u5ff5\u7684\u540d\u8bcd\uff08\u5982`Python`\uff09',
	'    - \u6216\u660e\u786e\u7684\u52a8\u540d\u8bcd\uff08\u5982`\u5907\u4efd`\u3001`\u8fc1\u79fb`\uff09',
	'',
	'# \u64cd\u4f5c\u6d41\u7a0b',
	'1. **\u9501\u5b9a\u6838\u5fc3**\uff1a\u8bc6\u522b\u7b14\u8bb0\u4e2d\u6700\u5177\u4f53\u7684\u5b9e\u4f53\u4f5c\u4e3a\u7b2c\u4e00\u4e2a\u6807\u7b7e',
	'2. **\u62c6\u89e3\u63d0\u70bc**\uff1a\u63d0\u53d6\u5176\u4ed6\u57fa\u7840\u52a8\u4f5c\u3001\u5c5e\u6027\u548c\u9886\u57df\u6982\u5ff5\uff0c\u5f7b\u5e95\u62c6\u89e3\u6240\u6709\u590d\u5408\u8bcd',
	'3. **\u7eaf\u51c0\u68c0\u67e5**\uff1a\u786e\u4fdd\u6bcf\u4e2a\u6807\u7b7e\u90fd\u662f\u539f\u5b50\u6982\u5ff5\uff0c\u4e14\u5f7c\u6b64\u8bed\u4e49\u72ec\u7acb',
].join('\n');

const TAG_POOL_STORAGE_KEY = 'tagPoolStorage';
const TAG_POOL_PREVIEW_KEY = 'tagPoolPreview';
const TAG_POOL_PROMPT_LIMIT = 200;
let isSyncingTagPoolPreview = false;

function normaliseTagPoolInput(tags: string[]): string[] {
	const unique = new Set<string>();
	for (const tag of tags) {
		const cleaned = typeof tag === 'string' ? tag.trim() : '';
		if (!cleaned) continue;
		unique.add(cleaned);
	}
	return Array.from(unique).sort((a, b) => a.localeCompare(b, 'zh-Hans-CN', { sensitivity: 'base' }));
}

async function loadTagPool(): Promise<string[]> {
	const raw = await joplin.settings.value(TAG_POOL_STORAGE_KEY);
	if (typeof raw !== 'string' || !raw) return [];
	try {
		const parsed = JSON.parse(raw);
		if (Array.isArray(parsed)) {
			return normaliseTagPoolInput(parsed);
		}
	} catch (error) {
		console.warn('[AI Tools] Failed to parse stored tag pool, rebuilding...', error);
	}
	return [];
}

async function ensureTagPool(): Promise<string[]> {
	const existing = await loadTagPool();
	if (existing.length) {
		await joplin.settings.setValue(TAG_POOL_PREVIEW_KEY, existing.join('\n'));
		return existing;
	}
	return refreshTagPoolFromJoplin();
}

async function saveTagPool(tags: string[]): Promise<void> {
	const normalised = normaliseTagPoolInput(tags);
	await joplin.settings.setValue(TAG_POOL_STORAGE_KEY, JSON.stringify(normalised));
	await joplin.settings.setValue(TAG_POOL_PREVIEW_KEY, normalised.join('\n'));
}

async function refreshTagPoolFromJoplin(): Promise<string[]> {
	const collected = new Set<string>();
	const limit = 50;
	let page = 1;

	while (true) {
		const result = await joplin.data.get(['notes'], {
			fields: ['id'],
			limit,
			page,
		});

		const notes = result.items as Array<{ id?: string }> | undefined;
		if (Array.isArray(notes)) {
			for (const note of notes) {
				if (!note || !note.id) continue;
				const tags = await listAllNoteTags(note.id);
				for (const tag of tags) {
					const cleaned = typeof tag.title === 'string' ? tag.title.trim() : '';
					if (cleaned) collected.add(cleaned);
				}
			}
		}

		if (!result.has_more) break;
		page += 1;
	}

	const tagPool = normaliseTagPoolInput(Array.from(collected));
	await saveTagPool(tagPool);
	return tagPool;
}

function prepareTagPoolForPrompt(tagPool: string[]): string[] {
	if (!Array.isArray(tagPool) || !tagPool.length) return [];
	return tagPool.slice(0, TAG_POOL_PROMPT_LIMIT);
}

async function streamChatCompletion(
	baseUrl: string,
	apiKey: string,
	prompt: string,
	onDelta?: StreamHandler,
	options: ChatRequestOptions = {}
): Promise<string> {
	return new Promise((resolve, reject) => {
		const endpoint = `${baseUrl.replace(/\/+$/, '')}/chat/completions`;
		const parsedUrl = new URL(endpoint);
		const protocol = parsedUrl.protocol === 'https:' ? https : http;

		const {
			stream = true,
			model = 'deepseek-chat',
			systemMessage,
		} = options;

		const requestId = `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
		const startedAt = Date.now();
		console.info('[AI Tools] LLM Request', {
			requestId,
			endpoint,
			model,
			stream,
			systemMessage,
			prompt,
			timestamp: new Date().toISOString(),
		});

		const requestOptions = {
			hostname: parsedUrl.hostname,
			port: parsedUrl.port,
			path: `${parsedUrl.pathname}${parsedUrl.search || ''}`,
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Accept': stream ? 'text/event-stream' : 'application/json',
				'Authorization': `Bearer ${apiKey}`,
			},
		};

		const req = protocol.request(requestOptions, (res) => {
			if (!res) {
				console.error('[AI Tools] LLM Error', { requestId, reason: 'No response object' });
				reject(new Error('No response received from server'));
				return;
			}

			const statusCode = res.statusCode || 0;
			if (statusCode < 200 || statusCode >= 300) {
				let errorData = '';
				res.setEncoding('utf8');
				res.on('data', (chunk) => {
					errorData += chunk;
				});
				res.on('end', () => {
					console.error('[AI Tools] LLM Error', {
						requestId,
						statusCode,
						errorData,
					});
					reject(new Error(`API request failed: ${statusCode} ${errorData}`));
				});
				return;
			}

			const contentType = (res.headers['content-type'] || '').toString();
			let accumulated = '';
			let buffer = '';
			let done = false;

			const processEvent = async (eventBlock: string) => {
				const lines = eventBlock.split(/\r?\n/);
				for (const rawLine of lines) {
					const line = rawLine.trim();
					if (!line.startsWith('data:')) continue;
					const payload = line.slice(5).trim();
					if (!payload) continue;
					if (payload === '[DONE]') {
						done = true;
						return;
					}

					try {
						const parsed = JSON.parse(payload);
						const delta =
							parsed?.choices?.[0]?.delta?.content ??
							parsed?.choices?.[0]?.message?.content ??
							'';
						if (delta) {
							accumulated += delta;
							if (onDelta) await onDelta(delta);
						}
					} catch (error) {
						console.warn('Failed to parse streaming chunk:', payload, error);
					}
				}
			};

			if (!contentType.includes('text/event-stream')) {
				let responseText = '';
				res.setEncoding('utf8');
				res.on('data', (chunk) => {
					responseText += chunk;
				});
				res.on('end', async () => {
					try {
						const parsed = JSON.parse(responseText);
						const complete = parsed?.choices?.[0]?.message?.content ?? '';
						if (complete) {
							accumulated = complete;
							if (onDelta) await onDelta(complete);
						}
						console.info('[AI Tools] LLM Response', {
							requestId,
							durationMs: Date.now() - startedAt,
							length: accumulated.length,
							raw: accumulated,
						});
						resolve(accumulated);
					} catch (error) {
						console.error('[AI Tools] LLM Response Parse Error', {
							requestId,
							responseText,
							error: (error as Error).message,
						});
						reject(new Error(`Failed to parse response: ${error.message}`));
					}
				});
				return;
			}

			res.setEncoding('utf8');

			let processing = Promise.resolve();

			const schedule = (chunk: string) => {
				processing = processing
					.then(async () => {
						buffer += chunk;
						const parts = buffer.split(/\r?\n\r?\n/);
						buffer = parts.pop() || '';
						for (const part of parts) {
							if (done) break;
							await processEvent(part);
						}
					})
					.catch((error) => {
						done = true;
						reject(error);
						req.destroy();
					});
			};

			res.on('data', (chunk) => {
				if (done) return;
				schedule(chunk);
			});

			res.on('end', () => {
				processing
					.then(async () => {
						if (!done && buffer) {
							await processEvent(buffer);
						}
						console.info('[AI Tools] LLM Response', {
							requestId,
							durationMs: Date.now() - startedAt,
							length: accumulated.length,
							raw: accumulated,
						});
						resolve(accumulated);
					})
					.catch((error) => {
						console.error('[AI Tools] LLM Response Error', {
							requestId,
							error: (error as Error).message,
						});
						reject(error);
					});
			});

			res.on('error', (error) => {
				console.error('[AI Tools] LLM Stream Error', {
					requestId,
					error: error.message,
				});
				done = true;
				reject(error);
			});
		});

		req.on('error', (error) => {
			console.error('[AI Tools] LLM Request Error', {
				requestId,
				error: error.message,
			});
			reject(error);
		});

		const messages = [] as Array<{ role: string; content: string }>;
		if (systemMessage) {
			messages.push({ role: 'system', content: systemMessage });
		}
		messages.push({ role: 'user', content: prompt });

		const requestBody = JSON.stringify({
			model,
			stream,
			messages,
		});

	req.write(requestBody);
	req.end();
});
}

function normaliseSelection(rawSelection: any): string {
	if (typeof rawSelection === 'string') return rawSelection;
	if (!rawSelection) return '';

	if (Array.isArray(rawSelection)) {
		return rawSelection.filter((chunk) => typeof chunk === 'string').join('\n');
	}

	if (typeof rawSelection === 'object') {
		const candidates = ['text', 'value', 'html', 'plainText'];
		for (const key of candidates) {
			const value = rawSelection[key];
			if (typeof value === 'string') return value;
		}
	}

	return '';
}

function truncateContent(content: string, maxLength: number): string {
	if (!content) return '';
	if (content.length <= maxLength) return content;
	return content.slice(0, maxLength);
}

function normaliseTitle(rawTitle: string, fallback: string): string {
	if (!rawTitle) return '';
	const firstMeaningfulLine = rawTitle
		.split(/\r?\n/)
		.map((line) => line.trim())
		.find((line) => line.length > 0) || '';
	let title = firstMeaningfulLine || '';
	title = title.replace(/^["'“”‘’\s]+/, '').replace(/["'“”‘’\s]+$/, '');
	if (!title) return '';
	if (title.length > 80) title = title.slice(0, 80).trim();
	if (title.toLowerCase() === 'untitled' || title === fallback) return '';
	return title;
}

function parseAiTitleAndTags(raw: string, fallbackTitle: string, maxTags: number): AiMetadata {
	let candidateTitle = '';
	let candidateTags: string[] = [];
	const trimmed = raw.trim();

	if (!trimmed) {
		return {
			title: '',
			tags: [],
			raw,
		};
	}

	let jsonPayload = trimmed;
	const firstBrace = trimmed.indexOf('{');
	const lastBrace = trimmed.lastIndexOf('}');
	if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
		jsonPayload = trimmed.slice(firstBrace, lastBrace + 1);
	}

	try {
		const parsed = JSON.parse(jsonPayload);
		candidateTitle = typeof parsed.title === 'string' ? parsed.title : '';
		if (Array.isArray(parsed.tags)) {
			candidateTags = parsed.tags
				.map(tag => (typeof tag === 'string' ? tag.trim() : ''))
				.filter(tag => !!tag);
		}
	} catch (error) {
		// fall back to treating the raw string as the title only
	}

	const normalizedTitle = normaliseTitle(candidateTitle || trimmed, fallbackTitle);
	const limit = Number.isFinite(maxTags) ? Math.max(0, Math.floor(maxTags)) : 0;
	const limitedTags = limit > 0 ? candidateTags.slice(0, limit) : [];
	return {
		title: normalizedTitle,
		tags: Array.from(new Set(limitedTags)),
		raw,
	};
}

function escapeXml(input: string): string {
	return input
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&apos;');
}

function normalisePromptInput(raw: string): string {
	if (!raw) return '';

	const asString = String(raw)
		.replace(/\r\n/g, '\n')
		.replace(/\\r\\n/g, '\n')
		.replace(/\\n/g, '\n');

	const trimmed = asString.trim();
	if (!trimmed) return '';

	const collapse = (value: string) =>
		value
			.replace(/\n{3,}/g, '\n\n')
			.split('\n')
			.map((line) => line.replace(/\s+$/g, ''))
			.join('\n');

	if (trimmed.includes('\n')) {
		return collapse(trimmed);
	}

	const insertBreaks = (value: string, pattern: RegExp) =>
		value.replace(pattern, (match, marker: string, offset: number) => (offset === 0 ? marker : `\n${marker}`));

	let structured = trimmed;
	structured = insertBreaks(structured, /\s*(#+\s+)/g);
	structured = insertBreaks(structured, /\s*((?:>+\s+))/g);
	structured = insertBreaks(structured, /\s*((?:[-*+]\s+))/g);
	structured = insertBreaks(structured, /\s*((?:\d+\.\s+))/g);
	structured = insertBreaks(structured, /\s*(```)/g);

	return collapse(structured);
}

function wrapInCdata(input: string): string {
	if (!input) return '<![CDATA[]]>';
	return `<![CDATA[${input.replace(/]]>/g, ']]]]><![CDATA[>')}]]>`;
}

function escapeHtml(input: string): string {
	return input
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

async function listAllNoteTags(noteId: string): Promise<Array<{ id: string; title: string }>> {
	const output: Array<{ id: string; title: string }> = [];
	let page = 1;

	while (true) {
		const result = await joplin.data.get(['notes', noteId, 'tags'], {
			fields: ['id', 'title'],
			limit: 100,
			page,
		});

		const items = result.items as Array<{ id: string; title: string }> | undefined;
		if (items && items.length) {
			output.push(...items);
		}

		if (!result.has_more) break;
		page += 1;
	}

	return output;
}

const tagCache: Record<string, string> = {};

async function getOrCreateTagId(tagTitle: string): Promise<string> {
	const cleaned = tagTitle.trim();
	const cacheKey = cleaned.toLowerCase();
	if (tagCache[cacheKey]) return tagCache[cacheKey];

	let page = 1;
	while (true) {
		const result = await joplin.data.get(['tags'], {
			fields: ['id', 'title'],
			limit: 100,
			page,
		});

		const items = result.items as Array<{ id: string; title: string }> | undefined;
		if (items) {
			const match = items.find(item => item.title.toLowerCase() === cacheKey);
			if (match) {
				tagCache[cacheKey] = match.id;
				return match.id;
			}
		}

		if (!result.has_more) break;
		page += 1;
	}

	const created = await joplin.data.post(['tags'], null, { title: cleaned });
	const tagId = (created as { id: string }).id;
	tagCache[cacheKey] = tagId;
	return tagId;
}

async function replaceNoteTags(noteId: string, requestedTags: string[]): Promise<{ added: number; removed: number; final: string[] }> {
	const cleanedTags = Array.from(new Set(requestedTags.map(tag => tag.trim()).filter(tag => !!tag)));
	const desiredMap = new Map(cleanedTags.map(tag => [tag.toLowerCase(), tag]));
	const desiredKeys = new Set(desiredMap.keys());

	const existing = await listAllNoteTags(noteId);
	const existingMap = new Map(existing.map(tag => [tag.title.toLowerCase(), tag]));

	let removed = 0;
	for (const existingTag of existing) {
		const key = existingTag.title.toLowerCase();
		if (!desiredKeys.has(key)) {
			await joplin.data.delete(['tags', existingTag.id, 'notes', noteId]);
			removed += 1;
		}
	}

	let added = 0;
	for (const [key, originalTitle] of desiredMap.entries()) {
		if (existingMap.has(key)) continue;
		const tagId = await getOrCreateTagId(originalTitle);
		await joplin.data.post(['tags', tagId, 'notes'], null, { id: noteId });
		added += 1;
	}

	const finalTags = cleanedTags.length ? cleanedTags : [];
	return {
		added,
		removed,
		final: finalTags,
	};
}

function clampTagLimit(raw: any): number {
	const parsed = Number(raw);
	if (!Number.isFinite(parsed) || parsed <= 0) return 3;
	return Math.max(1, Math.min(10, Math.floor(parsed)));
}

function buildSystemMessage(titlePrompt: string, tagPrompt: string, tagLimit: number, tagPool: string[]): string {
	const effectiveTitlePrompt = normalisePromptInput(titlePrompt) || DEFAULT_TITLE_SYSTEM_PROMPT;
	const effectiveTagPrompt = normalisePromptInput(tagPrompt) || DEFAULT_TAG_SYSTEM_PROMPT;
	const limitedPool = prepareTagPoolForPrompt(tagPool);
	const xmlLines: string[] = [
		'<systemInstructions>',
		'  <meta>',
		'    <role>ai-tools</role>',
		'    <purpose>generate-note-title-and-tags</purpose>',
		'    <language>zh-CN</language>',
		'    <version>1.0</version>',
		'  </meta>',
		`  <titleGuidance>${wrapInCdata(effectiveTitlePrompt)}</titleGuidance>`,
		`  <tagGuidance>${wrapInCdata(effectiveTagPrompt)}</tagGuidance>`,
		'  <reusePolicy>',
		'    <item>优先从标签池中选择语义匹配的标签；仅在确无合适选项时创建新标签。</item>',
		'  </reusePolicy>',
	];
	if (limitedPool.length) {
		xmlLines.push('  <tagPool>');
		for (const tag of limitedPool) {
			xmlLines.push(`    <tag>${escapeXml(tag)}</tag>`);
		}
		xmlLines.push('  </tagPool>');
	}
	xmlLines.push(
		'  <output>',
		'    <format>{"title":"...","tags":["..."]}</format>',
		`    <tagLimit>${tagLimit}</tagLimit>`,
		'    <constraints>',
		'      <item>Do not return anything outside the JSON object.</item>',
		'      <item>Ensure tags are relevant, deduplicated, and trimmed.</item>',
		'    </constraints>',
		'  </output>',
	'</systemInstructions>',
	);
	return xmlLines.join('\n');
}

function buildUserPrompt(originalTitle: string, body: string, tagPool: string[]): string {
	const limitedPool = prepareTagPoolForPrompt(tagPool);
	const lines = [
		'<note>',
		`  <originalTitle>${escapeXml(originalTitle || '（无标题）')}</originalTitle>`,
		`  <body>${wrapInCdata(body)}</body>`,
	];

	if (limitedPool.length) {
		lines.push('  <tagPoolSnapshot>');
		for (const tag of limitedPool) {
			lines.push(`    <tag>${escapeXml(tag)}</tag>`);
		}
		lines.push('  </tagPoolSnapshot>');
	}

	lines.push('</note>');
	return lines.join('\n');
}

function buildPromptEditorHtml(titlePrompt: string, tagPrompt: string, tagLimit: number): string {
	const titleValue = escapeHtml(titlePrompt);
	const tagValue = escapeHtml(tagPrompt);
	const limitValue = Number.isFinite(tagLimit) ? tagLimit : 3;
	return `
		<style>
			* { box-sizing: border-box; }
			body { margin: 0; padding: 16px; min-width: 760px; max-width: 800px; }
			.ai-tools-wrapper { width: 100%; }
			.ai-tools-form { font-family: sans-serif; padding: 0; margin: 0; }
			.ai-tools-form label { font-weight: 600; display: block; margin: 12px 0 4px; }
			.ai-tools-form textarea { width: 100%; min-height: 200px; padding: 8px; font-family: monospace; overflow-y: auto; resize: vertical; border: 1px solid #ccc; border-radius: 4px; }
			.ai-tools-form input[type="number"] { width: 120px; padding: 6px; border: 1px solid #ccc; border-radius: 4px; }
			.ai-tools-hint { color: #666; font-size: 12px; margin: 4px 0 0 0; }
		</style>
		<div class="ai-tools-wrapper">
			<form name="promptForm" class="ai-tools-form">
				<label for="titlePrompt">\u6807\u9898\u7cfb\u7edf\u63d0\u793a\u8bcd</label>
				<textarea id="titlePrompt" name="titlePrompt" spellcheck="false" data-autoresize="true">${titleValue}</textarea>
				<p class="ai-tools-hint">\u7528\u4e8e\u751f\u6210\u6807\u9898\u7684 system prompt\uff0c\u53ef\u76f4\u63a5\u4f7f\u7528 Markdown \u7ed3\u6784\u3002</p>

				<label for="tagPrompt">\u6807\u7b7e\u7cfb\u7edf\u63d0\u793a\u8bcd</label>
				<textarea id="tagPrompt" name="tagPrompt" spellcheck="false" data-autoresize="true">${tagValue}</textarea>
				<p class="ai-tools-hint">\u7528\u4e8e\u751f\u6210\u6807\u7b7e\u7684 system prompt\uff0c\u652f\u6301\u591a\u884c\u6587\u672c\uff0c\u53ef\u624b\u52a8\u8c03\u6574\u9ad8\u5ea6\u3002</p>

				<label for="tagLimit">\u6807\u7b7e\u6570\u91cf\u4e0a\u9650</label>
				<input id="tagLimit" name="tagLimit" type="number" min="1" max="10" value="${limitValue}" />
				<p class="ai-tools-hint">\u652f\u6301 1-10 \u4e4b\u95f4\u7684\u6574\u6570\uff0c\u9ed8\u8ba4\u4e3a 3\u3002</p>
			</form>
		</div>
		<script>
			(function() {
				const resizeIfNeeded = (el, { growOnly } = { growOnly: false }) => {
					if (!el) return;
					const minHeight = 200;
					const currentHeight = el.clientHeight;
					el.style.height = 'auto';
					const needed = Math.max(minHeight, el.scrollHeight);
					if (!growOnly || needed > currentHeight) {
						el.style.height = needed + 'px';
					} else {
						el.style.height = currentHeight + 'px';
					}
				};
				const apply = () => {
					const targets = document.querySelectorAll('[data-autoresize="true"]');
					targets.forEach((el) => {
						resizeIfNeeded(el);
						el.addEventListener('input', () => resizeIfNeeded(el, { growOnly: true }));
					});
				};
				if (document.readyState === 'loading') {
					document.addEventListener('DOMContentLoaded', apply);
				} else {
					apply();
				}
			})();
		</script>
	`;
}

function buildTagPoolViewerHtml(tagPool: string[]): string {
	const safeTags = Array.isArray(tagPool) ? tagPool : [];
	const listItems = safeTags.map(tag => `<li>${escapeHtml(tag)}</li>`).join('');
	const summary = `共 ${safeTags.length} 个标签`;
	return `
		<style>
			body { margin: 0; padding: 16px; font-family: sans-serif; min-width: 480px; max-width: 560px; }
			h1 { font-size: 18px; margin: 0 0 12px; }
			.tag-pool-summary { color: #555; margin-bottom: 12px; }
			.tag-pool-container { max-height: 400px; overflow-y: auto; border: 1px solid #ddd; border-radius: 4px; padding: 12px; background: #fafafa; }
			.tag-pool-container ul { list-style: none; margin: 0; padding: 0; }
			.tag-pool-container li { padding: 4px 0; border-bottom: 1px solid #eee; font-family: monospace; }
			.tag-pool-container li:last-child { border-bottom: none; }
		</style>
		<div>
			<h1>标签池</h1>
			<p class="tag-pool-summary">${summary}</p>
			<div class="tag-pool-container">
				<ul>${listItems || '<li>暂无标签</li>'}</ul>
			</div>
		</div>
	`;
}
async function removeAllTagsFromNote(noteId: string): Promise<number> {
	const existing = await listAllNoteTags(noteId);
	for (const tag of existing) {
		await joplin.data.delete(['tags', tag.id, 'notes', noteId]);
	}
	return existing.length;
}

type NotebookInfo = {
	id: string;
	title?: string;
};

async function resolveActiveNotebook(): Promise<NotebookInfo | null> {
	const ensureFolder = async (folderId: string | undefined, fallbackTitle?: string): Promise<NotebookInfo | null> => {
		if (typeof folderId !== 'string' || !folderId) return null;
		try {
			const folder = await joplin.data.get(['folders', folderId], {
				fields: ['id', 'title'],
			}) as { id?: string; title?: string };
			if (folder && typeof folder.id === 'string' && folder.id) {
				return {
					id: folder.id,
					title: folder.title ?? fallbackTitle,
				};
			}
		} catch (error) {
			console.warn(`[AI Tools] Failed to verify folder ${folderId}`, error);
		}
		return null;
	};

	try {
		const selectedFolder = await joplin.workspace.selectedFolder();
		const resolved = await ensureFolder(selectedFolder?.id, selectedFolder?.title);
		if (resolved) return resolved;
	} catch (error) {
		console.warn('[AI Tools] Failed to read selected folder', error);
	}

	try {
		const note = await joplin.workspace.selectedNote();
		if (note) {
			const resolved = await ensureFolder(note.parent_id);
			if (resolved) return resolved;
		}
	} catch (error) {
		console.warn('[AI Tools] Failed to read selected note', error);
	}

	return null;
}

async function collectNotebookFolderIds(rootId: string): Promise<string[]> {
	const collected: string[] = [];
	const stack: string[] = [];
	const seen = new Set<string>();

	try {
		const root = await joplin.data.get(['folders', rootId], {
			fields: ['id'],
		}) as { id?: string };
		if (!root || typeof root.id !== 'string') {
			return [];
		}
		stack.push(root.id);
	} catch (error) {
		console.warn(`[AI Tools] Failed to load root folder ${rootId}`, error);
		return [];
	}

	while (stack.length) {
		const current = stack.pop() as string;
		if (!current || seen.has(current)) continue;
		seen.add(current);
		collected.push(current);

		let page = 1;
		while (true) {
			let result: { items?: Array<{ id?: string }>; has_more?: boolean } | null = null;
			try {
				result = await joplin.data.get(['folders', current, 'folders'], {
					fields: ['id'],
					limit: 50,
					page,
				}) as { items?: Array<{ id?: string }>; has_more?: boolean };
			} catch (error) {
				console.warn(`[AI Tools] Failed to load sub-folders for ${current}`, error);
				break;
			}

			const children = result?.items as Array<{ id?: string }> | undefined;
			if (Array.isArray(children)) {
				for (const child of children) {
					if (child && typeof child.id === 'string' && child.id && !seen.has(child.id)) {
						stack.push(child.id);
					}
				}
			}

			if (!result?.has_more) break;
			page += 1;
		}
	}

	return collected;
}

type NoteIteratorHandler = (note: { [key: string]: any }) => Promise<void> | void;

async function forEachNoteInNotebook(
	notebookId: string,
	fields: string[],
	limit: number,
	handler: NoteIteratorHandler,
): Promise<void> {
	const folderIds = await collectNotebookFolderIds(notebookId);
	if (!folderIds.length) return;
	for (const folderId of folderIds) {
		let page = 1;
		while (true) {
			let result: { items?: Array<{ [key: string]: any }>; has_more?: boolean } | null = null;
			try {
				result = await joplin.data.get(['folders', folderId, 'notes'], {
					fields,
					limit,
					page,
				}) as { items?: Array<{ [key: string]: any }>; has_more?: boolean };
			} catch (error) {
				console.warn(`[AI Tools] Failed to load notes for folder ${folderId}`, error);
				break;
			}

			const notes = result?.items as Array<{ [key: string]: any }> | undefined;
			if (Array.isArray(notes) && notes.length) {
				for (const note of notes) {
					await handler(note);
				}
			}

			if (!result?.has_more) break;
			page += 1;
		}
	}
}

joplin.plugins.register({
	onStart: async function() {
		await joplin.settings.registerSection('aiToolsSettings', {
			label: 'AI Tools',
			iconName: 'fas fa-robot',
		});

		await joplin.settings.registerSettings({
			baseUrl: {
				value: 'https://api.deepseek.com/v1',
				type: SettingItemType.String,
				section: 'aiToolsSettings',
				public: true,
				label: 'Base URL',
				description: 'OpenAI compatible API endpoint (e.g., https://api.deepseek.com/v1)',
			},
			apiKey: {
				value: '',
				type: SettingItemType.String,
				section: 'aiToolsSettings',
				public: true,
				secure: true,
				label: 'API Key',
				description: 'Your API key for the service',
			},
			titleSystemPrompt: {
				value: DEFAULT_TITLE_SYSTEM_PROMPT,
				type: SettingItemType.String,
				section: 'aiToolsSettings',
				public: true,
				label: '\u6807\u9898\u7cfb\u7edf\u63d0\u793a\u8bcd',
				description: '\u53ef\u9009 system prompt\uff0c\u7528\u4e8e\u6307\u5bfc\u6a21\u578b\u751f\u6210\u6807\u9898\uff08\u652f\u6301\u7c98\u8d34 Markdown\uff09\u3002',
			},
			tagSystemPrompt: {
				value: DEFAULT_TAG_SYSTEM_PROMPT,
				type: SettingItemType.String,
				section: 'aiToolsSettings',
				public: true,
				label: '\u6807\u7b7e\u7cfb\u7edf\u63d0\u793a\u8bcd',
				description: '\u53ef\u9009 system prompt\uff0c\u7528\u4e8e\u6307\u5bfc\u6a21\u578b\u751f\u6210\u6807\u7b7e\uff08\u652f\u6301\u7c98\u8d34 Markdown\uff09\u3002',
			},
			tagLimit: {
				value: 3,
				type: SettingItemType.Int,
				section: 'aiToolsSettings',
				public: true,
				label: '\u6807\u7b7e\u6570\u91cf\u4e0a\u9650',
				description: '\u751f\u6210\u6807\u7b7e\u7684\u6570\u91cf\uff0c\u8303\u56f4 1-10\u3002',
			},
			tagPoolPreview: {
				value: '',
				type: SettingItemType.String,
				section: 'aiToolsSettings',
				public: true,
				advanced: true,
				label: '\u6807\u7b7e\u6c60\u9605\u89c8\uff08\u53ea\u8bfb\uff09',
				description: '\u7531\u63d2\u4ef6\u81ea\u52a8\u7ef4\u62a4\uff0c\u53ea\u4f9b\u67e5\u770b\u5f53\u524d\u6807\u7b7e\u6c60\u548c\u4f8b\u3002',
			},
			tagPoolStorage: {
				value: '[]',
				type: SettingItemType.String,
				section: 'aiToolsSettings',
				public: false,
				label: 'Tag Pool Storage',
				description: 'Internal storage for tag pool state.',
			},
		
		});

		await ensureTagPool();

		await joplin.settings.onChange(async (event: { keys?: string[] }) => {
			if (!event || !Array.isArray(event.keys)) return;
			if (!event.keys.includes(TAG_POOL_PREVIEW_KEY)) return;
			if (isSyncingTagPoolPreview) return;

			isSyncingTagPoolPreview = true;
			try {
				const tags = await loadTagPool();
				await joplin.settings.setValue(TAG_POOL_PREVIEW_KEY, tags.join('\n'));
			} finally {
				isSyncingTagPoolPreview = false;
			}
		});
		const promptEditorDialogId = await joplin.views.dialogs.create('aiPromptEditor');
		await joplin.views.dialogs.setButtons(promptEditorDialogId, [
			{ id: 'ok', title: '\u4fdd\u5b58' },
			{ id: 'cancel', title: '\u53d6\u6d88' },
		]);
		await joplin.views.dialogs.setFitToContent(promptEditorDialogId, true);

		const tagPoolDialogId = await joplin.views.dialogs.create('aiTagPoolViewer');
		await joplin.views.dialogs.setButtons(tagPoolDialogId, [
			{ id: 'close', title: '\u5173\u95ed' },
		]);
		await joplin.views.dialogs.setFitToContent(tagPoolDialogId, true);

		await joplin.commands.register({
			name: 'aiEditPrompts',
			label: 'AI \u7f16\u8f91\u63d0\u793a\u8bcd',
			iconName: 'fas fa-pen',
			execute: async () => {
				try {
					const titlePrompt = String(await joplin.settings.value('titleSystemPrompt') || '');
					const tagPrompt = String(await joplin.settings.value('tagSystemPrompt') || '');
					const tagLimitRaw = await joplin.settings.value('tagLimit');
					const tagLimit = clampTagLimit(tagLimitRaw);

					const html = buildPromptEditorHtml(titlePrompt, tagPrompt, tagLimit);
					await joplin.views.dialogs.setHtml(promptEditorDialogId, html);

					const result = await joplin.views.dialogs.open(promptEditorDialogId);
					if (!result || result.id !== 'ok') return;

					const formData = result.formData || {};
					const promptForm = formData.promptForm || {};
					const newTitlePrompt = String(promptForm.titlePrompt ?? '').trim();
					const newTagPrompt = String(promptForm.tagPrompt ?? '').trim();
					const newTagLimit = clampTagLimit(promptForm.tagLimit);

					await joplin.settings.setValue('titleSystemPrompt', newTitlePrompt);
					await joplin.settings.setValue('tagSystemPrompt', newTagPrompt);
					await joplin.settings.setValue('tagLimit', newTagLimit);

					await joplin.views.dialogs.showToast({
						message: '\u63d0\u793a\u8bcd\u8bbe\u7f6e\u5df2\u4fdd\u5b58\u3002',
						type: ToastType.Success,
						duration: 5000,
					});
				} catch (error) {
					console.error('AI Prompt Editor error:', error);
					await joplin.views.dialogs.showMessageBox(`Error: ${error.message}`);
				}
			},
		});

		await joplin.commands.register({
			name: 'aiShowTagPool',
			label: 'AI \u67e5\u770b\u6807\u7b7e\u6c60',
			iconName: 'fas fa-tags',
			execute: async () => {
				try {
					const tagPool = await refreshTagPoolFromJoplin();
					const html = buildTagPoolViewerHtml(tagPool);
					await joplin.views.dialogs.setHtml(tagPoolDialogId, html);
					await joplin.views.dialogs.open(tagPoolDialogId);
				} catch (error) {
					console.error('AI Tag Pool Viewer error:', error);
					await joplin.views.dialogs.showMessageBox(`Error: ${error instanceof Error ? error.message : error}`);
				}
			},
		});

		await joplin.commands.register({
			name: 'aiChatWithSelection',
			label: 'AI Chat',
			iconName: 'fas fa-robot',
			execute: async () => {
				try {
					const note = await joplin.workspace.selectedNote();
					if (!note) {
						await joplin.views.dialogs.showMessageBox('Please open a note first.');
						return;
					}

					const rawSelection = await joplin.commands.execute('editor.execCommand', {
						name: 'selectedText',
					});
					const selectedText = normaliseSelection(rawSelection);

					if (!selectedText || selectedText.trim() === '') {
						await joplin.views.dialogs.showMessageBox('Please select some text first.');
						return;
					}

					const baseUrl = await joplin.settings.value('baseUrl');
					const apiKey = await joplin.settings.value('apiKey');

					if (!apiKey || apiKey.trim() === '') {
							await joplin.views.dialogs.showMessageBox('Please configure your API Key in settings first.');
						return;
					}

					const header = `\n\n---\n**AI Response:**\n\n`;
					await joplin.commands.execute('editor.execCommand', {
						name: 'replaceSelection',
						args: [selectedText + header],
					});

					let finalResponse = '';

					const appendText = async (chunk: string) => {
						if (!chunk) return;
						finalResponse += chunk;
						await joplin.commands.execute('editor.execCommand', {
							name: 'replaceSelection',
							args: [chunk],
						});
					};

					try {
						await streamChatCompletion(
							baseUrl,
							apiKey,
							selectedText,
							async (delta) => {
								await appendText(delta);
							},
							{ stream: true }
						);
						if (finalResponse) {
							await joplin.commands.execute('editor.execCommand', {
								name: 'replaceSelection',
								args: ['\n'],
							});
						}
					} catch (error) {
						const errorText = `\n[Error: ${(error as Error).message}]`;
						await joplin.commands.execute('editor.execCommand', {
							name: 'replaceSelection',
							args: [errorText],
						});
						throw error;
					}

				} catch (error) {
					console.error('AI Chat error:', error);
					await joplin.views.dialogs.showMessageBox(`Error: ${error.message}`);
				}
			},
		});

		await joplin.commands.register({
			name: 'aiGenerateTitleForCurrentNote',
			label: 'AI Generate Title for Current Note',
			iconName: 'fas fa-lightbulb',
			execute: async () => {
				try {
					const note = await joplin.workspace.selectedNote();
					if (!note) {
						await joplin.views.dialogs.showMessageBox('Please open a note first.');
						return;
					}

					const baseUrl = await joplin.settings.value('baseUrl');
					const apiKey = await joplin.settings.value('apiKey');

					if (!apiKey || apiKey.trim() === '') {
						await joplin.views.dialogs.showMessageBox('Please configure your API Key in settings first.');
						return;
					}

					const titleSystemPrompt = String(await joplin.settings.value('titleSystemPrompt') || '');
					const tagSystemPrompt = String(await joplin.settings.value('tagSystemPrompt') || '');
					const tagLimitSetting = await joplin.settings.value('tagLimit');
					const tagLimit = clampTagLimit(tagLimitSetting);
					const tagPool = await ensureTagPool();
					const systemMessage = buildSystemMessage(titleSystemPrompt, tagSystemPrompt, tagLimit, tagPool);

					const body = typeof note.body === 'string' ? note.body : '';
					if (!body.trim()) {
						await joplin.views.dialogs.showMessageBox('当前笔记内容为空，无法生成标题。');
						return;
					}

					const truncatedBody = truncateContent(body, 4000);
					const prompt = buildUserPrompt(note.title || '（无标题）', truncatedBody, tagPool);

					const aiRaw = await streamChatCompletion(
						baseUrl,
						apiKey,
						prompt,
						undefined,
						{
							stream: false,
							systemMessage,
						}
					);
					const aiMetadata = parseAiTitleAndTags(aiRaw, note.title, tagLimit);
					const shouldUpdateTitle = !!aiMetadata.title && aiMetadata.title !== note.title;
					const shouldUpdateTags = aiMetadata.tags.length > 0;

					if (!shouldUpdateTitle && !shouldUpdateTags) {
						await joplin.views.dialogs.showMessageBox('AI 未生成有效的标题或标签。');
						return;
					}

					if (shouldUpdateTitle) {
						await joplin.data.put(['notes', note.id], null, {
							title: aiMetadata.title,
						});
					}

					let tagStats = { added: 0, removed: 0, final: [] as string[] };
					if (shouldUpdateTags) {
						tagStats = await replaceNoteTags(note.id, aiMetadata.tags);
						if (tagStats.added || tagStats.removed) {
							await refreshTagPoolFromJoplin();
						}
					}

					const changes: string[] = [];
					if (shouldUpdateTitle) changes.push(`标题已更新为「${aiMetadata.title}」`);
					if (shouldUpdateTags && (tagStats.added || tagStats.removed || tagStats.final.length)) {
						const tagDetails = [];
						if (tagStats.final.length) tagDetails.push(`标签：${tagStats.final.join(', ')}`);
						if (tagStats.added) tagDetails.push(`新增 ${tagStats.added}`);
						if (tagStats.removed) tagDetails.push(`移除 ${tagStats.removed}`);
						changes.push(tagDetails.join('，'));
					}

					await joplin.views.dialogs.showToast({
						message: changes.join('；') || 'AI 已更新当前笔记。',
						type: ToastType.Success,
						duration: 5000,
					});
				} catch (error) {
					console.error('AI Generate Title (current note) error:', error);
					await joplin.views.dialogs.showMessageBox(`Error: ${error.message}`);
				}
			},
		});

		await joplin.commands.register({
			name: 'aiClearTagsForCurrentNote',
			label: 'AI Clear Tags for Current Note',
			iconName: 'fas fa-eraser',
			execute: async () => {
				try {
					const note = await joplin.workspace.selectedNote();
					if (!note) {
						await joplin.views.dialogs.showMessageBox('Please open a note first.');
						return;
					}

					const removed = await removeAllTagsFromNote(note.id);
					if (removed > 0) {
						await refreshTagPoolFromJoplin();
					}
					await joplin.views.dialogs.showToast({
						message: removed ? `已移除当前笔记的 ${removed} 个标签。` : '当前笔记没有可移除的标签。',
						type: ToastType.Info,
						duration: 4000,
					});
				} catch (error) {
					console.error('AI Clear Tags (current note) error:', error);
					await joplin.views.dialogs.showMessageBox(`Error: ${error.message}`);
				}
			},
		});

		await joplin.commands.register({
			name: 'aiGenerateTitlesForCurrentNotebook',
			label: 'AI Generate Titles for Current Notebook',
			iconName: 'fas fa-book-open',
			execute: async () => {
				try {
					const notebook = await resolveActiveNotebook();
					if (!notebook) {
						await joplin.views.dialogs.showMessageBox('请先选择一个笔记或笔记本。');
						return;
					}

					const baseUrl = await joplin.settings.value('baseUrl');
					const apiKey = await joplin.settings.value('apiKey');

					if (!apiKey || apiKey.trim() === '') {
						await joplin.views.dialogs.showMessageBox('Please configure your API Key in settings first.');
						return;
					}

					const titleSystemPrompt = String(await joplin.settings.value('titleSystemPrompt') || '');
					const tagSystemPrompt = String(await joplin.settings.value('tagSystemPrompt') || '');
					const tagLimitSetting = await joplin.settings.value('tagLimit');
					const tagLimit = clampTagLimit(tagLimitSetting);
					const initialTagPool = await ensureTagPool();
					const workingTagPool = new Set(initialTagPool);

					const limit = 20;
					let processed = 0;
					let updated = 0;
					let titlesUpdated = 0;
					let tagUpdates = 0;
					let tagsAddedTotal = 0;
					let tagsRemovedTotal = 0;
					let tagPoolDirty = false;
					const errors: string[] = [];
					const skipIds: string[] = [];

					await forEachNoteInNotebook(
						notebook.id,
						['id', 'title', 'body'],
						limit,
						async (note) => {
							if (!note || typeof note.id !== 'string') return;
							processed++;
							const body = typeof note.body === 'string' ? note.body : '';
							if (!body.trim()) {
								skipIds.push(note.id);
								return;
							}

							const truncatedBody = truncateContent(body, 4000);
							const tagPoolSnapshot = Array.from(workingTagPool);
							const systemMessage = buildSystemMessage(titleSystemPrompt, tagSystemPrompt, tagLimit, tagPoolSnapshot);
							const prompt = buildUserPrompt(note.title || '（无标题）', truncatedBody, tagPoolSnapshot);

							try {
								const aiRaw = await streamChatCompletion(
									baseUrl,
									apiKey,
									prompt,
									undefined,
									{
										stream: false,
										systemMessage,
									}
								);
								const aiMetadata = parseAiTitleAndTags(aiRaw, note.title, tagLimit);
								const shouldUpdateTitle = !!aiMetadata.title && aiMetadata.title !== note.title;
								const shouldUpdateTags = aiMetadata.tags.length > 0;

								if (!shouldUpdateTitle && !shouldUpdateTags) {
									skipIds.push(note.id);
									return;
								}

								let titleUpdated = false;
								if (shouldUpdateTitle) {
									await joplin.data.put(['notes', note.id], null, {
										title: aiMetadata.title,
									});
									titleUpdated = true;
									updated++;
								}

								let tagsChanged = false;
								if (shouldUpdateTags) {
									const tagStats = await replaceNoteTags(note.id, aiMetadata.tags);
									if (Array.isArray(tagStats.final) && tagStats.final.length) {
										for (const tag of tagStats.final) {
											workingTagPool.add(tag);
										}
									}
									if (tagStats.added || tagStats.removed) {
										tagsChanged = true;
										tagPoolDirty = true;
									}
									if (tagStats.added) tagsAddedTotal += tagStats.added;
									if (tagStats.removed) tagsRemovedTotal += tagStats.removed;
									if (tagStats.added || tagStats.removed) tagUpdates += 1;
								}

								if (!titleUpdated && !tagsChanged) {
									skipIds.push(note.id);
								} else {
									if (!titleUpdated) updated++;
									if (titleUpdated) titlesUpdated += 1;
								}
							} catch (error) {
								const message = error instanceof Error ? error.message : `${error}`;
								errors.push(`${note.id}: ${message}`);
								console.error(`Failed to update title for note ${note.id}:`, error);
							}
						}
					);

					if (tagPoolDirty) {
						await refreshTagPoolFromJoplin();
					} else {
						await ensureTagPool();
					}

					const summary = [
						`Notebook: ${notebook.title || notebook.id}`,
						`Processed: ${processed}`,
						`Updated Notes: ${updated}`,
						`Titles Updated: ${titlesUpdated}`,
						`Tag Adjustments: ${tagUpdates} (+${tagsAddedTotal}/-${tagsRemovedTotal})`,
						`Skipped: ${skipIds.length}`,
						errors.length ? `Errors: ${errors.length}` : '',
					].filter(Boolean).join(', ');

					console.info(`AI notebook title generation summary: ${summary}`);

					const notebookDisplay = notebook.title ? `笔记本「${notebook.title}」` : '当前笔记本';
					const toastMessage = errors.length
						? `${notebookDisplay}批量更新完成：标题 ${titlesUpdated}，标签 ${tagUpdates}，跳过 ${skipIds.length}，错误 ${errors.length}`
						: `${notebookDisplay}批量更新完成：标题 ${titlesUpdated}，标签 ${tagUpdates}，跳过 ${skipIds.length}`;

					await joplin.views.dialogs.showToast({
						message: toastMessage,
						type: errors.length ? ToastType.Info : ToastType.Success,
						duration: 8000,
					});
				} catch (error) {
					console.error('AI Generate Titles (current notebook) error:', error);
					await joplin.views.dialogs.showMessageBox(`Error: ${error.message}`);
				}
			},
		});

		await joplin.commands.register({
			name: 'aiClearTagsForCurrentNotebook',
			label: 'AI Clear Tags for Current Notebook',
			iconName: 'fas fa-book',
			execute: async () => {
				try {
					const notebook = await resolveActiveNotebook();
					if (!notebook) {
						await joplin.views.dialogs.showMessageBox('请先选择一个笔记或笔记本。');
						return;
					}

					const limit = 50;
					let processed = 0;
					let clearedNotes = 0;
					let removedTags = 0;

					await forEachNoteInNotebook(
						notebook.id,
						['id', 'title'],
						limit,
						async (note) => {
							if (!note || typeof note.id !== 'string') return;
							processed++;
							const removed = await removeAllTagsFromNote(note.id);
							if (removed > 0) {
								clearedNotes++;
								removedTags += removed;
							}
						}
					);

					console.info(`AI notebook clear tags summary: notebook=${notebook.title || notebook.id}, processed=${processed}, cleared=${clearedNotes}, tagsRemoved=${removedTags}`);

					if (removedTags > 0) {
						await refreshTagPoolFromJoplin();
					} else {
						await ensureTagPool();
					}

					const notebookDisplay = notebook.title ? `笔记本「${notebook.title}」` : '当前笔记本';

					await joplin.views.dialogs.showToast({
						message: removedTags
							? `已从${notebookDisplay}的 ${clearedNotes} 篇笔记移除 ${removedTags} 个标签。`
							: `${notebookDisplay}中的所有笔记均无可移除的标签。`,
						type: removedTags ? ToastType.Success : ToastType.Info,
						duration: 6000,
					});
				} catch (error) {
					console.error('AI Clear Tags (current notebook) error:', error);
					await joplin.views.dialogs.showMessageBox(`Error: ${error.message}`);
				}
			},
		});

		await joplin.commands.register({
			name: 'aiGenerateTitlesForAllNotes',
			label: 'AI Generate Titles for All Notes',
			iconName: 'fas fa-clipboard-list',
			execute: async () => {
				try {
					const baseUrl = await joplin.settings.value('baseUrl');
					const apiKey = await joplin.settings.value('apiKey');

					if (!apiKey || apiKey.trim() === '') {
						await joplin.views.dialogs.showMessageBox('Please configure your API Key in settings first.');
						return;
					}

					const titleSystemPrompt = String(await joplin.settings.value('titleSystemPrompt') || '');
					const tagSystemPrompt = String(await joplin.settings.value('tagSystemPrompt') || '');
					const tagLimitSetting = await joplin.settings.value('tagLimit');
					const tagLimit = clampTagLimit(tagLimitSetting);
					const initialTagPool = await ensureTagPool();
					const workingTagPool = new Set(initialTagPool);

					const limit = 20;
					let page = 1;
					let processed = 0;
					let updated = 0;
					let titlesUpdated = 0;
					let tagUpdates = 0;
					let tagsAddedTotal = 0;
					let tagsRemovedTotal = 0;
					let tagPoolDirty = false;
					const errors: string[] = [];
					const skipIds: string[] = [];

					while (true) {
						const result = await joplin.data.get(['notes'], {
							fields: ['id', 'title', 'body'],
							limit,
							page,
						});

						const notes = result.items || [];
						if (!notes.length) break;

						for (const note of notes) {
							processed++;
							const body = typeof note.body === 'string' ? note.body : '';
							if (!body.trim()) {
								skipIds.push(note.id);
								continue;
							}

							const truncatedBody = truncateContent(body, 4000);
							const tagPoolSnapshot = Array.from(workingTagPool);
							const systemMessage = buildSystemMessage(titleSystemPrompt, tagSystemPrompt, tagLimit, tagPoolSnapshot);
							const prompt = buildUserPrompt(note.title || '（无标题）', truncatedBody, tagPoolSnapshot);

							try {
								const aiRaw = await streamChatCompletion(
									baseUrl,
									apiKey,
									prompt,
									undefined,
									{
										stream: false,
										systemMessage,
									}
								);
								const aiMetadata = parseAiTitleAndTags(aiRaw, note.title, tagLimit);
								const shouldUpdateTitle = !!aiMetadata.title && aiMetadata.title !== note.title;
								const shouldUpdateTags = aiMetadata.tags.length > 0;

								if (!shouldUpdateTitle && !shouldUpdateTags) {
									skipIds.push(note.id);
									continue;
								}

								let titleUpdated = false;
								if (shouldUpdateTitle) {
									await joplin.data.put(['notes', note.id], null, {
										title: aiMetadata.title,
									});
									titleUpdated = true;
									updated++;
								}

								let tagsChanged = false;
								if (shouldUpdateTags) {
									const tagStats = await replaceNoteTags(note.id, aiMetadata.tags);
									if (Array.isArray(tagStats.final) && tagStats.final.length) {
										for (const tag of tagStats.final) {
											workingTagPool.add(tag);
										}
									}
									if (tagStats.added || tagStats.removed) {
										tagsChanged = true;
										tagPoolDirty = true;
									}
									if (tagStats.added) tagsAddedTotal += tagStats.added;
									if (tagStats.removed) tagsRemovedTotal += tagStats.removed;
									if (tagStats.added || tagStats.removed) tagUpdates += 1;
								}

								if (!titleUpdated && !tagsChanged) {
									skipIds.push(note.id);
								} else {
									if (!titleUpdated) updated++;
									if (titleUpdated) titlesUpdated += 1;
								}
							} catch (error) {
								const message = error instanceof Error ? error.message : `${error}`;
								errors.push(`${note.id}: ${message}`);
								console.error(`Failed to update title for note ${note.id}:`, error);
							}
						}

						if (!result.has_more) break;
						page += 1;
					}

					if (tagPoolDirty) {
						await refreshTagPoolFromJoplin();
					} else {
						await ensureTagPool();
					}

					const summary = [
						`Processed: ${processed}`,
						`Updated Notes: ${updated}`,
						`Titles Updated: ${titlesUpdated}`,
						`Tag Adjustments: ${tagUpdates} (+${tagsAddedTotal}/-${tagsRemovedTotal})`,
						`Skipped: ${skipIds.length}`,
						errors.length ? `Errors: ${errors.length}` : '',
					].filter(Boolean).join(', ');

					console.info(`AI title generation summary: ${summary}`);

					const toastMessage = errors.length
						? `AI 批量更新完成：标题 ${titlesUpdated}，标签 ${tagUpdates}，跳过 ${skipIds.length}，错误 ${errors.length}`
						: `AI 批量更新完成：标题 ${titlesUpdated}，标签 ${tagUpdates}，跳过 ${skipIds.length}`;

					await joplin.views.dialogs.showToast({
						message: toastMessage,
						type: errors.length ? ToastType.Info : ToastType.Success,
						duration: 8000,
					});
				} catch (error) {
					console.error('AI Generate Titles error:', error);
					await joplin.views.dialogs.showMessageBox(`Error: ${error.message}`);
				}
			},
		});

		await joplin.commands.register({
			name: 'aiClearTagsForAllNotes',
			label: 'AI Clear Tags for All Notes',
			iconName: 'fas fa-broom',
			execute: async () => {
				try {
					const limit = 50;
					let page = 1;
					let processed = 0;
					let clearedNotes = 0;
					let removedTags = 0;

					while (true) {
						const result = await joplin.data.get(['notes'], {
							fields: ['id', 'title'],
							limit,
							page,
						});

						const notes = result.items || [];
						if (!notes.length) break;

						for (const note of notes) {
							processed++;
							const removed = await removeAllTagsFromNote(note.id);
							if (removed > 0) {
								clearedNotes++;
								removedTags += removed;
							}
						}

						if (!result.has_more) break;
						page += 1;
					}

					console.info(`AI clear tags summary: processed ${processed}, cleared ${clearedNotes}, tags removed ${removedTags}`);

					if (removedTags > 0) {
						await refreshTagPoolFromJoplin();
					} else {
						await ensureTagPool();
					}

					await joplin.views.dialogs.showToast({
						message: removedTags
							? `已从 ${clearedNotes} 篇笔记移除 ${removedTags} 个标签。`
							: '所有笔记均无可移除的标签。',
						type: removedTags ? ToastType.Success : ToastType.Info,
						duration: 6000,
					});
				} catch (error) {
					console.error('AI Clear Tags (all notes) error:', error);
					await joplin.views.dialogs.showMessageBox(`Error: ${error.message}`);
				}
			},
		});

		await joplin.views.toolbarButtons.create(
			'aiChatButton',
			'aiChatWithSelection',
			ToolbarButtonLocation.EditorToolbar
		);

		await joplin.views.toolbarButtons.create(
			'aiGenerateTitleCurrentButton',
			'aiGenerateTitleForCurrentNote',
			ToolbarButtonLocation.NoteToolbar
		);

		await joplin.views.toolbarButtons.create(
			'aiClearTagsCurrentButton',
			'aiClearTagsForCurrentNote',
			ToolbarButtonLocation.NoteToolbar
		);

		await joplin.views.toolbarButtons.create(
			'aiGenerateTitlesNotebookButton',
			'aiGenerateTitlesForCurrentNotebook',
			ToolbarButtonLocation.NoteToolbar
		);

		await joplin.views.toolbarButtons.create(
			'aiClearTagsNotebookButton',
			'aiClearTagsForCurrentNotebook',
			ToolbarButtonLocation.NoteToolbar
		);

		await joplin.views.toolbarButtons.create(
			'aiGenerateTitlesButton',
			'aiGenerateTitlesForAllNotes',
			ToolbarButtonLocation.NoteToolbar
		);

		await joplin.views.toolbarButtons.create(
			'aiClearTagsAllButton',
			'aiClearTagsForAllNotes',
			ToolbarButtonLocation.NoteToolbar
		);

		await joplin.views.menus.create('aiToolsMenu', 'AI Tools', [
			{
				commandName: 'aiEditPrompts',
			},
			{
				commandName: 'aiShowTagPool',
			},
			{
				commandName: 'aiGenerateTitleForCurrentNote',
			},
			{
				commandName: 'aiClearTagsForCurrentNote',
			},
			{
				commandName: 'aiGenerateTitlesForCurrentNotebook',
			},
			{
				commandName: 'aiClearTagsForCurrentNotebook',
			},
			{
				commandName: 'aiGenerateTitlesForAllNotes',
				accelerator: 'CmdOrCtrl+Shift+T',
			},
			{
				commandName: 'aiClearTagsForAllNotes',
			},
		], MenuItemLocation.Tools);

		console.info('AI Tools plugin started!');
	},
});
