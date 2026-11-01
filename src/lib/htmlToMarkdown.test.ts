import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handleSmartPaste, insertAtSelection } from './htmlToMarkdown';

describe('insertAtSelection', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.runOnlyPendingTimers();
        vi.useRealTimers();
        document.body.innerHTML = '';
    });

    function createTextarea(value: string) {
        const textarea = document.createElement('textarea');
        textarea.value = value;
        document.body.appendChild(textarea);
        return textarea;
    }

    it('inserts text using the live textarea value so concurrent typing is preserved', () => {
        const textarea = createTextarea('START\nTYPED_AFTER_UPLOAD');
        textarea.selectionStart = textarea.selectionEnd = textarea.value.length;

        let nextValue = '';
        insertAtSelection(textarea, '\n![图片](data:image/png;base64,AAA)', (value) => {
            nextValue = value;
            textarea.value = value;
        });

        expect(nextValue).toBe('START\nTYPED_AFTER_UPLOAD\n![图片](data:image/png;base64,AAA)');
    });

    it('replaces the active selection and moves the caret after the inserted text', () => {
        const textarea = createTextarea('hello world');
        textarea.selectionStart = 6;
        textarea.selectionEnd = 11;

        let nextValue = '';
        insertAtSelection(textarea, 'Raphael', (value) => {
            nextValue = value;
            textarea.value = value;
        });

        expect(nextValue).toBe('hello Raphael');

        vi.runAllTimers();

        expect(textarea.selectionStart).toBe('hello Raphael'.length);
        expect(textarea.selectionEnd).toBe('hello Raphael'.length);
    });
});

describe('handleSmartPaste', () => {
    it('marks unavailable Notion attachment images in place while keeping reachable images', () => {
        const textarea = document.createElement('textarea');
        document.body.appendChild(textarea);
        const clipboardData = {
            getData: (type: string) => type === 'text/html'
                ? '<h1>标题</h1><p><img src="attachment:internal-id" alt="工作台截图"></p><p>正文</p><p><img src="https://example.com/photo.png" alt="海报"></p>'
                : '标题\n工作台截图\n正文\n海报',
            items: [],
            files: []
        } as unknown as DataTransfer;
        let nextValue = '';
        const pasteEvent = {
            clipboardData,
            currentTarget: textarea,
            preventDefault: () => {},
        } as unknown as React.ClipboardEvent<HTMLTextAreaElement>;
        const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

        handleSmartPaste(pasteEvent, value => { nextValue = value; });

        expect(nextValue).toContain('[图片待补：工作台截图]');
        expect(nextValue).toContain('正文');
        expect(nextValue).toContain('![海报](https://example.com/photo.png)');
        expect(nextValue).not.toContain('attachment:');
        expect(alertSpy).toHaveBeenCalledOnce();
        expect(alertSpy.mock.calls[0][0]).toContain('1 张');
        alertSpy.mockRestore();
        textarea.remove();
    });
});
