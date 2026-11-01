import { expect, test } from '@playwright/test';
import { strToU8, zipSync } from 'fflate';

const tinyPng = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAUAAAAFCAYAAACNbyblAAAAHElEQVQI12P4//8/w38GIAXDIBKE0DHxgljNBAAO9TXL0Y4OHwAAAABJRU5ErkJggg==', 'base64'));

test('imports a Notion ZIP with its bundled image and shows it in the preview', async ({ page }) => {
    await page.goto('/');
    const archive = zipSync({
        'Article.md': strToU8('# 导入标题\n\n正文\n\n![工作台](Article%20images/%E5%9B%BE%E7%89%87.png)'),
        'Article images/图片.png': tinyPng,
    });

    await page.getByTestId('notion-import-input').setInputFiles({
        name: 'article.zip', mimeType: 'application/zip', buffer: Buffer.from(archive),
    });

    const editor = page.getByTestId('editor-input');
    await expect(editor).toHaveValue(/# 导入标题[\s\S]*!\[工作台\]\(blob:/);
    const image = page.getByTestId('preview-content').locator('img');
    await expect(image).toHaveCount(1);
    await expect.poll(() => image.evaluate(img => (img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
});

test('keeps the draft if a Notion ZIP is missing an image', async ({ page }) => {
    await page.goto('/');
    const editor = page.getByTestId('editor-input');
    await editor.fill('我的草稿');
    page.on('dialog', dialog => dialog.accept());
    const archive = zipSync({ 'Article.md': strToU8('![缺图](media/missing.png)') });

    await page.getByTestId('notion-import-input').setInputFiles({
        name: 'article.zip', mimeType: 'application/zip', buffer: Buffer.from(archive),
    });

    await expect(editor).toHaveValue('我的草稿');
    await expect(page.getByTestId('notion-import-status')).toContainText('图片缺失');
});

test('exports imported Notion images as self-contained HTML', async ({ page }) => {
    await page.goto('/');
    const archive = zipSync({
        'Article.md': strToU8('![工作台](images/photo.png)'),
        'images/photo.png': tinyPng,
    });
    await page.getByTestId('notion-import-input').setInputFiles({
        name: 'article.zip', mimeType: 'application/zip', buffer: Buffer.from(archive),
    });
    await expect(page.getByTestId('notion-import-status')).toContainText('已导入 1 张');

    const downloadPromise = page.waitForEvent('download');
    await page.locator('[data-testid="export-html"]:visible').click();
    const download = await downloadPromise;
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    const html = Buffer.concat(chunks).toString('utf8');

    expect(html).toContain('src="data:image/png;base64,');
    expect(html).not.toContain('blob:');
});

function buildLongMarkdown() {
    return Array.from({ length: 120 }, (_, index) => `## Section ${index + 1}\n\n这是第 ${index + 1} 段内容，用来验证编辑器和预览区的滚动同步是否稳定。\n\n`).join('');
}

async function waitForScrollableArea(page: import('@playwright/test').Page, testId: string) {
    await expect
        .poll(
            async () =>
                page.evaluate((id) => {
                    const element = document.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
                    if (!element) return -1;
                    return element.scrollHeight - element.clientHeight;
                }, testId),
            {
                timeout: 8000,
                intervals: [100, 150, 250]
            }
        )
        .toBeGreaterThan(200);
}

async function setScrollRatio(page: import('@playwright/test').Page, testId: string, ratio: number) {
    await page.evaluate(
        ([id, nextRatio]) => {
            const element = document.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
            if (!element) return;

            const maxScroll = element.scrollHeight - element.clientHeight;
            if (maxScroll <= 0) {
                element.scrollTop = 0;
                return;
            }

            element.scrollTop = maxScroll * nextRatio;
            element.dispatchEvent(new Event('scroll'));
        },
        [testId, ratio] as const
    );
}

async function scrollAndWaitForSync(
    page: import('@playwright/test').Page,
    sourceTestId: string,
    targetTestId: string,
    targetRatio: number
) {
    await expect
        .poll(
            async () => {
                await setScrollRatio(page, sourceTestId, targetRatio);

                return page.evaluate(([sourceId, targetId, expectedRatio]) => {
                    const source = document.querySelector(`[data-testid="${sourceId}"]`) as HTMLElement | null;
                    const target = document.querySelector(`[data-testid="${targetId}"]`) as HTMLElement | null;
                    if (!source || !target) return Number.POSITIVE_INFINITY;

                    const sourceMax = source.scrollHeight - source.clientHeight;
                    const targetMax = target.scrollHeight - target.clientHeight;
                    if (sourceMax <= 0 || targetMax <= 0) return Number.POSITIVE_INFINITY;

                    const sourceRatio = source.scrollTop / sourceMax;
                    const targetRatio = target.scrollTop / targetMax;

                    if (Math.abs(sourceRatio - expectedRatio) >= 0.06 || target.scrollTop <= 0) {
                        return Number.POSITIVE_INFINITY;
                    }

                    return Math.abs(targetRatio - expectedRatio);
                }, [sourceTestId, targetTestId, targetRatio] as const);
            },
            {
                timeout: 8000,
                intervals: [100, 150, 250]
            }
        )
        .toBeLessThan(0.12);
}

test('keeps the copy button visible on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');

    await page.getByTestId('tab-preview').click();
    const copyButton = page.locator('[data-testid="copy-button"]:visible');

    await expect(copyButton).toBeVisible();

    const box = await copyButton.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(390);
});

test('renders bold text with punctuation without leaking markdown markers', async ({ page }) => {
    await page.goto('/');

    const editor = page.getByTestId('editor-input');
    await editor.fill('2025年初，伦敦黄金市场的一个月拆借利率一度升至**5%**。');

    const preview = page.getByTestId('preview-content');
    await expect(preview.locator('strong')).toHaveText('5%');
    await expect(preview).not.toContainText('**5%**');
    await expect(preview).toContainText('2025年初，伦敦黄金市场的一个月拆借利率一度升至5%。');
});

for (const device of [
    { testId: 'device-mobile', label: 'mobile' },
    { testId: 'device-tablet', label: 'tablet' }
] as const) {
    test(`syncs editor and ${device.label} preview scrolling in both directions`, async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.goto('/');

        const editor = page.getByTestId('editor-input');
        await editor.fill(buildLongMarkdown());
        await page.locator(`[data-testid="${device.testId}"]:visible`).click();
        await waitForScrollableArea(page, 'editor-input');
        await waitForScrollableArea(page, 'preview-inner-scroll');

        await scrollAndWaitForSync(page, 'editor-input', 'preview-inner-scroll', 0.72);
        await scrollAndWaitForSync(page, 'preview-inner-scroll', 'editor-input', 0.28);
    });
}
