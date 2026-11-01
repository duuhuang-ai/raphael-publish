import { strFromU8, unzipSync } from 'fflate';

const MAX_ZIP_BYTES = 50 * 1024 * 1024;
const MAX_FILES = 1000;
const MAX_UNCOMPRESSED_BYTES = 200 * 1024 * 1024;
const MAX_MARKDOWN_BYTES = 5 * 1024 * 1024;
const MAX_IMAGE_BYTES = 30 * 1024 * 1024;

const imageMimeTypes: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    avif: 'image/avif',
    svg: 'image/svg+xml',
};

const imageReference = /(!\[[^\]\n]*\]\()(<[^>\n]+>|[^\s)\n]+)(\s+(?:"[^"]*"|'[^']*'))?(\))/g;

function articleImageReferences(markdown: string): Array<{ start: number; full: string; prefix: string; source: string; title: string; suffix: string }> {
    const references = [];
    let offset = 0;
    let fence: { marker: string; length: number } | null = null;
    for (const line of markdown.split('\n')) {
        const marker = line.match(/^ {0,3}(`{3,}|~{3,})/);
        if (fence) {
            if (marker && marker[1][0] === fence.marker && marker[1].length >= fence.length && !line.slice(marker[0].length).trim()) {
                fence = null;
            }
        } else if (marker) {
            fence = { marker: marker[1][0], length: marker[1].length };
        } else {
            for (const match of line.matchAll(imageReference)) {
                references.push({
                    start: offset + match.index,
                    full: match[0],
                    prefix: match[1],
                    source: match[2],
                    title: match[3] || '',
                    suffix: match[4],
                });
            }
        }
        offset += line.length + 1;
    }
    return references;
}

export interface NotionZipImport {
    markdown: string;
    imageCount: number;
    externalImageCount: number;
    objectUrls: string[];
}

class NotionZipError extends Error {}

function normalizePath(path: string): string {
    if (!path || path.startsWith('/') || path.includes('\\')) {
        throw new NotionZipError('导出包包含无效图片路径');
    }

    const parts: string[] = [];
    for (const part of path.split('/')) {
        if (!part || part === '.') continue;
        if (part === '..') {
            if (!parts.length) throw new NotionZipError('导出包包含越界图片路径');
            parts.pop();
        } else {
            parts.push(part.normalize('NFC'));
        }
    }
    return parts.join('/');
}

function resolveImagePath(markdownPath: string, source: string): string | null {
    const unwrapped = source.startsWith('<') && source.endsWith('>') ? source.slice(1, -1) : source;
    if (/^(https?:)?\/\//i.test(unwrapped) || /^data:/i.test(unwrapped)) return null;
    if (/^[a-z][a-z\d+.-]*:/i.test(unwrapped)) {
        throw new NotionZipError('导出包包含不支持的图片地址');
    }

    let decoded: string;
    try {
        decoded = decodeURIComponent(unwrapped.split(/[?#]/, 1)[0]);
    } catch {
        throw new NotionZipError('导出包包含无法解析的图片路径');
    }
    const parent = markdownPath.split('/').slice(0, -1).join('/');
    return normalizePath(parent ? `${parent}/${decoded}` : decoded);
}

function imageMime(path: string): string | undefined {
    return imageMimeTypes[path.split('.').pop()?.toLowerCase() || ''];
}

export function parseNotionZip(zipBytes: Uint8Array): NotionZipImport {
    if (zipBytes.byteLength > MAX_ZIP_BYTES) throw new NotionZipError('ZIP 文件过大，请导出单篇文章');

    let fileCount = 0;
    let totalBytes = 0;
    let files: Record<string, Uint8Array>;
    try {
        files = unzipSync(zipBytes, {
            filter: info => {
                if (info.name.endsWith('/')) return false;
                normalizePath(info.name);
                fileCount += 1;
                totalBytes += info.originalSize;
                if (fileCount > MAX_FILES || totalBytes > MAX_UNCOMPRESSED_BYTES) {
                    throw new NotionZipError('导出包文件过多或解压后过大，请导出单篇文章');
                }
                const ext = info.name.split('.').pop()?.toLowerCase();
                if (ext === 'md' && info.originalSize > MAX_MARKDOWN_BYTES) {
                    throw new NotionZipError('Markdown 正文过大');
                }
                if (ext && imageMimeTypes[ext] && info.originalSize > MAX_IMAGE_BYTES) {
                    throw new NotionZipError('导出包中有图片过大');
                }
                return ext === 'md' || Boolean(ext && imageMimeTypes[ext]);
            }
        });
    } catch (error) {
        if (error instanceof NotionZipError) throw error;
        throw new NotionZipError('无法读取 ZIP 文件，请选择 Notion 导出的 Markdown & CSV 压缩包');
    }

    const entries = new Map(Object.entries(files).map(([name, data]) => [normalizePath(name), data]));
    const markdownPaths = [...entries.keys()].filter(name => name.toLowerCase().endsWith('.md') && !name.startsWith('__MACOSX/'));
    if (!markdownPaths.length) throw new NotionZipError('ZIP 中没有 Markdown 正文');
    const shallowest = Math.min(...markdownPaths.map(name => name.split('/').length));
    const candidates = markdownPaths.filter(name => name.split('/').length === shallowest);
    if (candidates.length !== 1) throw new NotionZipError('导出包包含多篇同级文章，请单独导出一篇');

    const markdownPath = candidates[0];
    const markdown = strFromU8(entries.get(markdownPath)!);
    const localPaths: string[] = [];
    let externalImageCount = 0;
    const references = articleImageReferences(markdown);
    for (const match of references) {
        const source = match.source;
        const unwrapped = source.startsWith('<') && source.endsWith('>') ? source.slice(1, -1) : source;
        if (/^(https?:)?\/\//i.test(unwrapped)) {
            externalImageCount += 1;
            continue;
        }
        const resolved = resolveImagePath(markdownPath, source);
        if (!resolved) continue;
        if (!imageMime(resolved)) throw new NotionZipError('导出包引用了不支持的图片格式');
        if (!entries.has(resolved)) throw new NotionZipError('导出包中有图片缺失，请重新导出并包含图片资源');
        localPaths.push(resolved);
    }

    const objectUrls: string[] = [];
    const urlByPath = new Map<string, string>();
    try {
        for (const path of new Set(localPaths)) {
            const blob = new Blob([new Uint8Array(entries.get(path)!)], { type: imageMime(path) });
            const objectUrl = URL.createObjectURL(blob);
            objectUrls.push(objectUrl);
            urlByPath.set(path, objectUrl);
        }
        let importedMarkdown = '';
        let cursor = 0;
        for (const reference of references) {
            importedMarkdown += markdown.slice(cursor, reference.start);
            const path = resolveImagePath(markdownPath, reference.source);
            importedMarkdown += path
                ? `${reference.prefix}${urlByPath.get(path)}${reference.title}${reference.suffix}`
                : reference.full;
            cursor = reference.start + reference.full.length;
        }
        importedMarkdown += markdown.slice(cursor);
        return { markdown: importedMarkdown, imageCount: localPaths.length, externalImageCount, objectUrls };
    } catch (error) {
        objectUrls.forEach(url => URL.revokeObjectURL(url));
        throw error;
    }
}
