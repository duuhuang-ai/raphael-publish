// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { parseNotionZip } from './notionZipImport';

describe('parseNotionZip', () => {
    const createDescriptor = Object.getOwnPropertyDescriptor(URL, 'createObjectURL');
    const revokeDescriptor = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL');

    beforeEach(() => {
        let next = 0;
        Object.defineProperty(URL, 'createObjectURL', {
            configurable: true,
            value: vi.fn(() => `blob:import-${++next}`),
        });
        Object.defineProperty(URL, 'revokeObjectURL', {
            configurable: true,
            value: vi.fn(),
        });
    });

    afterEach(() => {
        if (createDescriptor) Object.defineProperty(URL, 'createObjectURL', createDescriptor);
        if (revokeDescriptor) Object.defineProperty(URL, 'revokeObjectURL', revokeDescriptor);
    });

    it('imports local images with encoded Chinese paths and leaves external images visible', () => {
        const archive = zipSync({
            'Article.md': strToU8('# 标题\n\n![截图](Article%20images/%E5%9B%BE%E7%89%87%201.png)\n\n![海报](https://example.com/poster.png)'),
            'Article images/图片 1.png': new Uint8Array([137, 80, 78, 71]),
        });

        const result = parseNotionZip(archive);

        expect(result.markdown).toBe('# 标题\n\n![截图](blob:import-1)\n\n![海报](https://example.com/poster.png)');
        expect(result.imageCount).toBe(1);
        expect(result.externalImageCount).toBe(1);
        expect(result.objectUrls).toEqual(['blob:import-1']);
    });

    it('resolves image paths relative to the selected Markdown file', () => {
        const archive = zipSync({
            'export/Article.md': strToU8('![图](media/photo.png)'),
            'export/media/photo.png': new Uint8Array([137, 80, 78, 71]),
            'other/media/photo.png': new Uint8Array([137, 80, 78, 71]),
        });

        expect(parseNotionZip(archive).markdown).toBe('![图](blob:import-1)');
    });

    it('rejects missing images without producing any object URLs', () => {
        const archive = zipSync({
            'Article.md': strToU8('![已找到](media/one.png)\n\n![缺失](media/two.png)'),
            'media/one.png': new Uint8Array([137, 80, 78, 71]),
        });

        expect(() => parseNotionZip(archive)).toThrow(/缺失/);
        expect(URL.createObjectURL).not.toHaveBeenCalled();
    });

    it('does not treat Markdown image examples inside fenced code as article images', () => {
        const archive = zipSync({
            'Article.md': strToU8('```md\n![示例](missing.png)\n```\n\n![正文图](media/real.png)'),
            'media/real.png': new Uint8Array([137, 80, 78, 71]),
        });

        const result = parseNotionZip(archive);

        expect(result.markdown).toContain('```md\n![示例](missing.png)\n```');
        expect(result.markdown).toContain('![正文图](blob:import-1)');
        expect(result.imageCount).toBe(1);
    });

    it('rejects ambiguous multi-page exports', () => {
        const archive = zipSync({
            'First.md': strToU8('# First'),
            'Second.md': strToU8('# Second'),
        });

        expect(() => parseNotionZip(archive)).toThrow(/多篇/);
    });

    it('rejects unsafe paths and non-image files used as images', () => {
        const traversal = zipSync({
            'Article.md': strToU8('![图](../outside.png)'),
            'outside.png': new Uint8Array([137, 80, 78, 71]),
        });
        const wrongType = zipSync({
            'Article.md': strToU8('![图](notes.txt)'),
            'notes.txt': strToU8('not an image'),
        });

        expect(() => parseNotionZip(traversal)).toThrow(/路径/);
        expect(() => parseNotionZip(wrongType)).toThrow(/图片格式/);
    });

    it('rejects invalid ZIP bytes', () => {
        expect(() => parseNotionZip(new Uint8Array([1, 2, 3]))).toThrow(/ZIP/);
    });
});
