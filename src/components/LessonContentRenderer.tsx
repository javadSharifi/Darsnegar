import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import type { FontSizePreference } from '../types/learning';
import { parseLessonContent } from '../utils/studyEngine';

interface LessonContentRendererProps {
  content: string;
  fontSize: FontSizePreference;
  headingIdPrefix?: string;
}

function renderInlineFormatting(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, idx) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return (
        <strong key={idx} className="font-bold text-[var(--ink-strong)]">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <span key={idx}>{part}</span>;
  });
}

export function LessonContentRenderer({
  content,
  fontSize,
  headingIdPrefix = 'lesson-sec',
}: LessonContentRendererProps) {
  const blocks = parseLessonContent(content);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const proseSizeClass =
    fontSize === 'small'
      ? 'text-[14.5px] leading-[1.85]'
      : fontSize === 'large'
        ? 'text-[17px] leading-[2.05]'
        : 'text-[15.5px] leading-[1.95]';

  const handleCopy = async (code: string, index: number) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedIndex(index);
      window.setTimeout(() => setCopiedIndex(null), 1800);
    } catch {
      // Clipboard unavailable in restricted contexts
    }
  };

  if (blocks.length === 0) {
    return (
      <p className="text-sm text-[var(--muted)]">
        هنوز متنی برای این درس ثبت نشده است. می‌توانید از بخش ویرایش، متن درس را اضافه کنید.
      </p>
    );
  }

  let headingCounter = 0;

  return (
    <div className="space-y-4">
      {blocks.map((block, index) => {
        if (block.type === 'heading') {
          const headingId = `${headingIdPrefix}-${headingCounter}`;
          headingCounter += 1;
          return (
            <h3
              key={index}
              id={headingId}
              className="scroll-mt-6 pt-5 pb-2 border-b border-[var(--line)] flex items-center gap-2.5 text-[17.5px] sm:text-[19px] font-extrabold tracking-tight text-[var(--ink-strong)] first:pt-0"
            >
              <span
                className="h-2 w-2 rounded-full bg-[var(--blue)] shrink-0"
                aria-hidden="true"
              />
              <span>{block.text}</span>
            </h3>
          );
        }

        if (block.type === 'code') {
          const isCopied = copiedIndex === index;
          return (
            <div
              key={index}
              dir="ltr"
              className="overflow-hidden rounded-2xl border border-[var(--line-2)] bg-[var(--code-bg)] text-[var(--code-ink)]"
            >
              <div className="flex items-center justify-between border-b border-white/10 px-4 py-2 text-xs text-slate-300">
                <span className="font-mono-code">{block.language ?? 'code'}</span>
                <button
                  type="button"
                  onClick={() => handleCopy(block.text ?? '', index)}
                  aria-label="کپی کردن کد"
                  className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-slate-200 hover:bg-white/10 transition-colors cursor-pointer"
                >
                  {isCopied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  <span>{isCopied ? 'کپی شد' : 'کپی'}</span>
                </button>
              </div>
              <pre className="overflow-x-auto p-4 text-[13px] leading-6 font-mono-code">
                <code>{block.text}</code>
              </pre>
            </div>
          );
        }

        if (block.type === 'blockquote') {
          return (
            <blockquote
              key={index}
              className="rounded-2xl border border-[var(--line)] bg-[var(--sunk)] px-4 py-3 text-xs sm:text-[13.5px] leading-7 text-[var(--muted)]"
            >
              {renderInlineFormatting(block.text ?? '')}
            </blockquote>
          );
        }

        if (block.type === 'list') {
          return (
            <ul
              key={index}
              className={`space-y-2.5 pr-5 list-disc marker:text-[var(--blue)] text-[var(--ink-2)] ${proseSizeClass}`}
            >
              {block.items?.map((item, idx) => (
                <li key={idx}>{renderInlineFormatting(item)}</li>
              ))}
            </ul>
          );
        }

        return (
          <p key={index} className={`text-[var(--ink-2)] ${proseSizeClass}`}>
            {renderInlineFormatting(block.text ?? '')}
          </p>
        );
      })}
    </div>
  );
}
