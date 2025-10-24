import joplin from 'api';
import { MenuItemLocation, ToolbarButtonLocation, ToastType } from 'api/types';
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

function buildSystemMessage(titlePrompt: string, tagPrompt: string, tagLimit: number): string {
	const parts: string[] = [];
	if (titlePrompt && titlePrompt.trim()) parts.push(titlePrompt.trim());
	if (tagPrompt && tagPrompt.trim()) parts.push(tagPrompt.trim());
	parts.push(
		`始终输出严格的 JSON 对象 {"title":"...","tags":["..."]}，其中 tags 数组长度不超过 ${tagLimit}，标签需与正文主题高度相关且无多余空白或编号。`
	);
	return parts.join('\n');
}

async function removeAllTagsFromNote(noteId: string): Promise<number> {
	const existing = await listAllNoteTags(noteId);
	for (const tag of existing) {
		await joplin.data.delete(['tags', tag.id, 'notes', noteId]);
	}
	return existing.length;
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
				type: 2,
				section: 'aiToolsSettings',
				public: true,
				label: 'Base URL',
				description: 'OpenAI compatible API endpoint (e.g., https://api.deepseek.com/v1)',
			},
			apiKey: {
				value: '',
				type: 2,
				section: 'aiToolsSettings',
				public: true,
				secure: true,
				label: 'API Key',
				description: 'Your API key for the service',
			},
			titleSystemPrompt: {
				value: '你是一名知识管理助手，需根据笔记内容生成简洁、具体的中文标题。',
				type: 2,
				section: 'aiToolsSettings',
				public: true,
				label: '标题系统提示词',
				description: '可选的系统消息，用于指导模型生成标题。',
			},
			tagSystemPrompt: {
				value: '根据笔记主题提炼简洁、不重复的中文标签，标签之间互相独立。',
				type: 2,
				section: 'aiToolsSettings',
				public: true,
				label: '标签系统提示词',
				description: '可选的系统消息，用于指导模型生成标签。',
			},
			tagLimit: {
				value: 3,
				type: 1,
				section: 'aiToolsSettings',
				public: true,
				label: '标签数量上限',
				description: '生成标签的最大数量（1-10）。',
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
					const systemMessage = buildSystemMessage(titleSystemPrompt, tagSystemPrompt, tagLimit);

					const body = typeof note.body === 'string' ? note.body : '';
					if (!body.trim()) {
						await joplin.views.dialogs.showMessageBox('当前笔记内容为空，无法生成标题。');
						return;
					}

					const truncatedBody = truncateContent(body, 4000);
					const prompt = `请阅读以下笔记正文，为其生成一个简洁、具体且不超过40个汉字的中文标题，并列出 1-${tagLimit} 个与正文主题高度相关的中文标签。请严格输出 JSON：{"title":"新标题","tags":["标签1","标签2"]}，不要包含额外文本。\n\n笔记原标题：${note.title || '（无标题）'}\n\n笔记正文：\n${truncatedBody}`;

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
					const systemMessage = buildSystemMessage(titleSystemPrompt, tagSystemPrompt, tagLimit);

					const limit = 20;
					let page = 1;
					let processed = 0;
					let updated = 0;
					let titlesUpdated = 0;
					let tagUpdates = 0;
					let tagsAddedTotal = 0;
					let tagsRemovedTotal = 0;
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
							const prompt = `请阅读以下笔记正文，为其生成一个简洁、具体且不超过40个汉字的中文标题，并列出 1-${tagLimit} 个与正文主题高度相关的中文标签。请严格输出 JSON：{"title":"新标题","tags":["标签1","标签2"]}，不要包含额外文本。\n\n笔记原标题：${note.title || '（无标题）'}\n\n笔记正文：\n${truncatedBody}`;

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
									if (tagStats.added || tagStats.removed) {
										tagsChanged = true;
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
			'aiGenerateTitlesButton',
			'aiGenerateTitlesForAllNotes',
			ToolbarButtonLocation.NoteToolbar
		);

		await joplin.views.toolbarButtons.create(
			'aiClearTagsAllButton',
			'aiClearTagsForAllNotes',
			ToolbarButtonLocation.NoteToolbar
		);

		await joplin.views.menuItems.create(
			'aiGenerateTitlesMenu',
			'aiGenerateTitlesForAllNotes',
			MenuItemLocation.Tools,
			{ accelerator: 'CmdOrCtrl+Shift+T' }
		);

		await joplin.views.menuItems.create(
			'aiClearTagsAllMenu',
			'aiClearTagsForAllNotes',
			MenuItemLocation.Tools
		);

		console.info('AI Tools plugin started!');
	},
});
