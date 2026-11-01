import { afterEach, describe, expect, it, vi } from 'vitest';
import { THEMES } from './themes';
import { embedLocalImages, makeWeChatCompatible } from './wechatCompat';

afterEach(() => vi.unstubAllGlobals());

describe('local images in exported HTML', () => {
    it('embeds imported blob images as data URLs', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: true,
            blob: async () => new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' }),
        }));

        const html = await embedLocalImages('<p><img src="blob:imported-image" alt="截图"></p>');

        expect(html).toContain('src="data:image/png;base64,');
        expect(html).not.toContain('blob:imported-image');
    });

    it('fails instead of copying an expired blob URL', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('resource missing')));

        await expect(makeWeChatCompatible('<img src="blob:gone">', THEMES[0].id))
            .rejects.toThrow(/图片资源已失效/);
    });
});
