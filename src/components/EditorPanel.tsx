import React, { useRef, useState } from 'react';
import { Upload, Wand2 } from 'lucide-react';
import { handleSmartPaste } from '../lib/htmlToMarkdown';

interface EditorPanelProps {
    markdownInput: string;
    onInputChange: (value: string) => void;
    editorScrollRef: React.RefObject<HTMLTextAreaElement>;
    onEditorScroll: () => void;
    scrollSyncEnabled: boolean;
    onImportNotionZip: (file: File) => Promise<{ imageCount: number; externalImageCount: number } | null>;
}

export default function EditorPanel({ markdownInput, onInputChange, editorScrollRef, onEditorScroll, scrollSyncEnabled, onImportNotionZip }: EditorPanelProps) {
    const importInputRef = useRef<HTMLInputElement>(null);
    const [importStatus, setImportStatus] = useState('');
    const [isImporting, setIsImporting] = useState(false);

    const onPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
        handleSmartPaste(e, onInputChange);
    };

    const onImportFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        e.target.value = '';
        setIsImporting(true);
        setImportStatus('正在导入 Notion 文章…');
        try {
            const result = await onImportNotionZip(file);
            setImportStatus(result
                ? `已导入 ${result.imageCount} 张包内图片${result.externalImageCount ? `；另有 ${result.externalImageCount} 张外链图片` : ''}`
                : '已取消导入');
        } catch (error) {
            setImportStatus(`导入失败：${error instanceof Error ? error.message : '无法读取文件'}`);
        } finally {
            setIsImporting(false);
        }
    };

    return (
        <div className="border-r border-[#00000015] dark:border-[#ffffff15] flex flex-col relative z-30 bg-transparent flex-1 min-h-0">
            <textarea
                ref={editorScrollRef}
                data-testid="editor-input"
                className="w-full flex-1 p-8 md:p-10 resize-none bg-transparent outline-none font-mono text-[15px] md:text-[16px] leading-[1.8] no-scrollbar text-[#1d1d1f] dark:text-[#f5f5f7] placeholder-[#86868b] dark:placeholder-[#6e6e73]"
                value={markdownInput}
                onChange={(e) => onInputChange(e.target.value)}
                onPaste={onPaste}
                onScroll={scrollSyncEnabled ? onEditorScroll : undefined}
                placeholder="在这里输入 Markdown 内容..."
                spellCheck={false}
            />

            {/* Bottom Action / Info Bar for Editor */}
            <div className="flex-shrink-0 flex flex-wrap items-center justify-between gap-2 px-4 sm:px-6 py-3 sm:py-4 border-t border-[#00000010] dark:border-[#ffffff10] bg-[#fbfbfd]/50 dark:bg-[#1c1c1e]/50 backdrop-blur-md">
                <div className="flex items-center gap-2 min-w-0">
                    <Wand2 size={14} className="text-[#0066cc] dark:text-[#0a84ff] shrink-0" />
                    <span className="text-[12.5px] font-medium text-[#1d1d1f] dark:text-[#f5f5f7]">
                        <span className="hidden sm:inline">支持直接粘贴 <span className="text-[#86868b] dark:text-[#a1a1a6]">飞书、Notion或Word等</span> 富文本，自动净化为 Markdown</span>
                        <span className="sm:hidden">支持直接粘贴 <span className="text-[#86868b] dark:text-[#a1a1a6]">飞书、Notion或Word等</span> 富文本，自动转化</span>
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    <input
                        ref={importInputRef}
                        data-testid="notion-import-input"
                        type="file"
                        accept=".zip,application/zip"
                        className="hidden"
                        onChange={onImportFileChange}
                    />
                    <button
                        type="button"
                        disabled={isImporting}
                        onClick={() => importInputRef.current?.click()}
                        className="flex items-center gap-1 text-[12.5px] font-medium text-[#0066cc] dark:text-[#0a84ff] disabled:opacity-50"
                    >
                        <Upload size={14} />
                        {isImporting ? '导入中…' : '导入 Notion ZIP'}
                    </button>
                </div>
                <div className="text-[12px] font-mono text-[#86868b] dark:text-[#a1a1a6]">
                    {markdownInput.length} 字
                </div>
                {importStatus && <div data-testid="notion-import-status" role="status" className="w-full text-[12px] text-[#6e6e73] dark:text-[#a1a1a6]">{importStatus}</div>}
            </div>
        </div>
    );
}
