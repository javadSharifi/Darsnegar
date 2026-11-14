import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Copy, Highlighter, Trash2 } from 'lucide-react';
import type { FontSizePreference, HighlightColor, TextHighlight } from '../types/learning';
import { parseLessonContent } from '../utils/studyEngine';

interface LessonContentRendererProps {
  content: string;
  fontSize: FontSizePreference;
  headingIdPrefix?: string;
  scopeKey?: string;
  highlights?: TextHighlight[];
  onAddHighlights?: (highlights: TextHighlight[]) => void;
  onUpdateHighlightColor?: (highlightId: string, color: HighlightColor) => void;
  onRemoveHighlights?: (highlightIds: string[]) => void;
}

interface HighlightDraft {
  blockIndex: number;
  itemIndex?: number;
  startOffset: number;
  endOffset: number;
  text: string;
}

interface FloatingToolbarState {
  mode: 'selection' | 'mark';
  top: number;
  left: number;
  arrowOffset: number;
  placement: 'above' | 'below';
  drafts: HighlightDraft[];
  overlappingIds: string[];
  activeMark?: TextHighlight;
}

const HIGHLIGHT_SWATCHES: { color: HighlightColor; label: string; dotClass: string }[] = [
  { color: 'yellow', label: 'هایلایت زرد', dotClass: 'bg-amber-400' },
  { color: 'green', label: 'هایلایت سبز', dotClass: 'bg-emerald-400' },
  { color: 'blue', label: 'هایلایت آبی', dotClass: 'bg-sky-400' },
  { color: 'pink', label: 'هایلایت صورتی', dotClass: 'bg-pink-400' },
];

interface InlineSegment {
  visible: string;
  bold: boolean;
  start: number;
  end: number;
}

function splitInlineSegments(text: string): { segments: InlineSegment[]; visibleText: string } {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  const segments: InlineSegment[] = [];
  let cursor = 0;
  let visibleText = '';

  for (const part of parts) {
    if (!part) continue;
    const isBold = part.startsWith('**') && part.endsWith('**') && part.length > 4;
    const visible = isBold ? part.slice(2, -2) : part;
    const start = cursor;
    const end = cursor + visible.length;
    segments.push({ visible, bold: isBold, start, end });
    cursor = end;
    visibleText += visible;
  }

  return { segments, visibleText };
}

function resolveBlockHighlights(
  visibleText: string,
  rawHighlights: TextHighlight[]
): TextHighlight[] {
  if (!rawHighlights.length || !visibleText) return [];

  const resolved: TextHighlight[] = [];
  for (const h of rawHighlights) {
    if (
      h.startOffset >= 0 &&
      h.endOffset <= visibleText.length &&
      h.startOffset < h.endOffset &&
      visibleText.slice(h.startOffset, h.endOffset) === h.text
    ) {
      resolved.push(h);
      continue;
    }

    if (h.text && h.text.trim().length > 0) {
      const idx = visibleText.indexOf(h.text);
      if (idx !== -1) {
        resolved.push({
          ...h,
          startOffset: idx,
          endOffset: idx + h.text.length,
        });
      }
    }
  }

  resolved.sort((a, b) => a.startOffset - b.startOffset);

  const nonOverlapping: TextHighlight[] = [];
  let lastEnd = 0;
  for (const h of resolved) {
    if (h.startOffset < lastEnd) continue;
    nonOverlapping.push(h);
    lastEnd = h.endOffset;
  }
  return nonOverlapping;
}

function renderInlineFormatting(
  text: string,
  rawHighlights: TextHighlight[],
  onClickHighlight?: (hl: TextHighlight, rect: DOMRect) => void
) {
  const { segments, visibleText } = splitInlineSegments(text);
  const blockHighlights = resolveBlockHighlights(visibleText, rawHighlights);

  return segments.map((seg, segIdx) => {
    const overlapping = blockHighlights.filter(
      (h) => h.endOffset > seg.start && h.startOffset < seg.end
    );

    const children =
      overlapping.length === 0
        ? seg.visible
        : (() => {
            const nodes: Array<ReturnType<typeof Fragment> | string> = [];
            let cursor = seg.start;

            overlapping.forEach((hl, hlIdx) => {
              const overlapStart = Math.max(seg.start, hl.startOffset);
              const overlapEnd = Math.min(seg.end, hl.endOffset);

              if (overlapStart > cursor) {
                nodes.push(
                  <Fragment key={`t-${segIdx}-${hlIdx}`}>
                    {seg.visible.slice(cursor - seg.start, overlapStart - seg.start)}
                  </Fragment>
                );
              }

              const sliceText = seg.visible.slice(
                overlapStart - seg.start,
                overlapEnd - seg.start
              );
              nodes.push(
                <mark
                  key={`m-${segIdx}-${hl.id}-${hlIdx}`}
                  data-highlight-id={hl.id}
                  data-highlight-color={hl.color}
                  onClick={(e) => {
                    if (!onClickHighlight) return;
                    const sel = window.getSelection();
                    if (sel && !sel.isCollapsed) return;
                    e.stopPropagation();
                    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                    onClickHighlight(hl, rect);
                  }}
                  className={`darsnegar-mark darsnegar-mark-${hl.color}`}
                >
                  {sliceText}
                </mark>
              );

              cursor = overlapEnd;
            });

            if (cursor < seg.end) {
              nodes.push(
                <Fragment key={`tail-${segIdx}`}>
                  {seg.visible.slice(cursor - seg.start)}
                </Fragment>
              );
            }

            return nodes;
          })();

    if (seg.bold) {
      return (
        <strong key={segIdx} className="font-bold text-[var(--ink-strong)]">
          {children}
        </strong>
      );
    }

    return <span key={segIdx}>{children}</span>;
  });
}

function getSelectionAnchorRect(range: Range): DOMRect | null {
  const clientRects = Array.from(range.getClientRects()).filter(
    (r) => r.width > 0.5 && r.height > 0.5
  );
  if (clientRects.length === 0) {
    const fallback = range.getBoundingClientRect();
    return fallback.width > 0 || fallback.height > 0 ? fallback : null;
  }

  // Anchor above the top-most selected line (merging fragments on the same top line)
  let minTop = clientRects[0].top;
  for (const r of clientRects) {
    if (r.top < minTop) minTop = r.top;
  }

  const topLineRects = clientRects.filter((r) => Math.abs(r.top - minTop) <= 8);
  const left = Math.min(...topLineRects.map((r) => r.left));
  const right = Math.max(...topLineRects.map((r) => r.right));
  const top = Math.min(...topLineRects.map((r) => r.top));
  const bottom = Math.max(...topLineRects.map((r) => r.bottom));

  return new DOMRect(left, top, Math.max(right - left, 1), Math.max(bottom - top, 1));
}

function getToolbarCoords(rect: DOMRect): {
  top: number;
  left: number;
  arrowOffset: number;
  placement: 'above' | 'below';
} {
  const viewportW = typeof window !== 'undefined' ? window.innerWidth : 1024;
  const anchorX = rect.left + rect.width / 2;
  const halfMargin = 128;
  const clampedLeft =
    viewportW > halfMargin * 2
      ? Math.min(Math.max(anchorX, halfMargin), viewportW - halfMargin)
      : viewportW / 2;
  const arrowOffset = Math.max(-90, Math.min(90, anchorX - clampedLeft));
  const placeAbove = rect.top > 72;
  const top = placeAbove ? rect.top - 10 : rect.bottom + 10;
  return {
    top,
    left: clampedLeft,
    arrowOffset,
    placement: placeAbove ? 'above' : 'below',
  };
}

export function LessonContentRenderer({
  content,
  fontSize,
  headingIdPrefix = 'lesson-sec',
  scopeKey = 'lesson',
  highlights = [],
  onAddHighlights,
  onUpdateHighlightColor,
  onRemoveHighlights,
}: LessonContentRendererProps) {
  const blocks = useMemo(() => parseLessonContent(content), [content]);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [toolbar, setToolbar] = useState<FloatingToolbarState | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canHighlight = Boolean(onAddHighlights);

  const scopedHighlights = useMemo(
    () => highlights.filter((h) => h.scopeKey === scopeKey),
    [highlights, scopeKey]
  );

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

  const evaluateSelection = useCallback(() => {
    if (!canHighlight) return;
    const container = containerRef.current;
    if (!container) return;

    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
      setToolbar((prev) => (prev?.mode === 'selection' ? null : prev));
      return;
    }

    const range = sel.getRangeAt(0);
    if (!range.toString().trim()) {
      setToolbar((prev) => (prev?.mode === 'selection' ? null : prev));
      return;
    }

    const blockEls = container.querySelectorAll<HTMLElement>('[data-hl-block]');
    const drafts: HighlightDraft[] = [];

    blockEls.forEach((blockEl) => {
      if (!range.intersectsNode(blockEl)) return;

      const fullText = blockEl.textContent ?? '';
      if (!fullText) return;

      let startOffset = 0;
      if (blockEl.contains(range.startContainer)) {
        const preStart = document.createRange();
        preStart.selectNodeContents(blockEl);
        preStart.setEnd(range.startContainer, range.startOffset);
        startOffset = preStart.cloneContents().textContent?.length ?? 0;
      }

      let endOffset = fullText.length;
      if (blockEl.contains(range.endContainer)) {
        const preEnd = document.createRange();
        preEnd.selectNodeContents(blockEl);
        preEnd.setEnd(range.endContainer, range.endOffset);
        endOffset = preEnd.cloneContents().textContent?.length ?? 0;
      }

      if (endOffset <= startOffset) return;

      const slice = fullText.slice(startOffset, endOffset);
      if (!slice.trim()) return;

      const blockIndex = Number(blockEl.dataset.hlBlock);
      const rawItem = blockEl.dataset.hlItem;
      const itemIndex = rawItem !== undefined ? Number(rawItem) : undefined;

      drafts.push({
        blockIndex,
        itemIndex,
        startOffset,
        endOffset,
        text: slice,
      });
    });

    if (drafts.length === 0) {
      setToolbar((prev) => (prev?.mode === 'selection' ? null : prev));
      return;
    }

    const rect = getSelectionAnchorRect(range);
    if (!rect) return;

    const overlappingIds = Array.from(
      new Set(
        scopedHighlights
          .filter((hl) =>
            drafts.some(
              (d) =>
                d.blockIndex === hl.blockIndex &&
                (d.itemIndex ?? -1) === (hl.itemIndex ?? -1) &&
                hl.endOffset > d.startOffset &&
                hl.startOffset < d.endOffset
            )
          )
          .map((hl) => hl.id)
      )
    );

    const coords = getToolbarCoords(rect);
    setToolbar({
      mode: 'selection',
      ...coords,
      drafts,
      overlappingIds,
    });
  }, [canHighlight, scopedHighlights]);

  useEffect(() => {
    setToolbar(null);
  }, [content, scopeKey]);

  useEffect(() => {
    if (!canHighlight) return;

    let selectionTimer: number | null = null;
    const handleSelectionChange = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) {
        if (selectionTimer !== null) window.clearTimeout(selectionTimer);
        setToolbar((prev) => (prev?.mode === 'selection' ? null : prev));
        return;
      }
      if (selectionTimer !== null) window.clearTimeout(selectionTimer);
      selectionTimer = window.setTimeout(() => {
        evaluateSelection();
      }, 140);
    };

    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('[data-highlight-toolbar]')) return;
      if (target?.closest('[data-highlight-id]')) return;
      setToolbar((prev) => (prev?.mode === 'mark' ? null : prev));
    };

    const handleScroll = () => {
      setToolbar((prev) => {
        if (!prev) return null;
        if (prev.mode === 'mark') return null;
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;
        const rect = getSelectionAnchorRect(sel.getRangeAt(0));
        if (!rect || rect.bottom < 0 || rect.top > window.innerHeight) return null;
        return { ...prev, ...getToolbarCoords(rect) };
      });
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setToolbar(null);
      }
    };

    document.addEventListener('selectionchange', handleSelectionChange);
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('scroll', handleScroll, { passive: true, capture: true });

    return () => {
      if (selectionTimer !== null) window.clearTimeout(selectionTimer);
      document.removeEventListener('selectionchange', handleSelectionChange);
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('scroll', handleScroll, { capture: true });
    };
  }, [canHighlight, evaluateSelection]);

  const handleApplyHighlight = (color: HighlightColor) => {
    if (!toolbar) return;

    if (toolbar.mode === 'mark' && toolbar.activeMark) {
      onUpdateHighlightColor?.(toolbar.activeMark.id, color);
      setToolbar(null);
      return;
    }

    if (!onAddHighlights || toolbar.drafts.length === 0) return;

    const now = Date.now();
    const created: TextHighlight[] = toolbar.drafts.map((d, idx) => ({
      id: `hl-${now}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
      scopeKey,
      blockIndex: d.blockIndex,
      itemIndex: d.itemIndex,
      startOffset: d.startOffset,
      endOffset: d.endOffset,
      text: d.text,
      color,
      createdAt: now,
    }));

    onAddHighlights(created);
    window.getSelection()?.removeAllRanges();
    setToolbar(null);
  };

  const handleDeleteHighlight = () => {
    if (!toolbar || !onRemoveHighlights) return;
    if (toolbar.mode === 'mark' && toolbar.activeMark) {
      onRemoveHighlights([toolbar.activeMark.id]);
      setToolbar(null);
      return;
    }
    if (toolbar.overlappingIds.length > 0) {
      onRemoveHighlights(toolbar.overlappingIds);
      window.getSelection()?.removeAllRanges();
      setToolbar(null);
    }
  };

  const handleClickExistingMark = useCallback(
    (hl: TextHighlight, rect: DOMRect) => {
      if (!canHighlight) return;
      const coords = getToolbarCoords(rect);
      setToolbar({
        mode: 'mark',
        ...coords,
        drafts: [],
        overlappingIds: [hl.id],
        activeMark: hl,
      });
    },
    [canHighlight]
  );

  if (blocks.length === 0) {
    return (
      <p className="text-sm text-[var(--muted)]">
        هنوز متنی برای این درس ثبت نشده است. می‌توانید از بخش ویرایش، متن درس را اضافه کنید.
      </p>
    );
  }

  let headingCounter = 0;

  return (
    <div
      ref={containerRef}
      onMouseUp={() => window.setTimeout(evaluateSelection, 10)}
      onTouchEnd={() => window.setTimeout(evaluateSelection, 60)}
      onKeyUp={() => window.setTimeout(evaluateSelection, 10)}
      className="space-y-4 relative"
    >
      {blocks.map((block, index) => {
        if (block.type === 'heading') {
          const headingId = `${headingIdPrefix}-${headingCounter}`;
          headingCounter += 1;
          const hlForHeading = scopedHighlights.filter(
            (h) => h.blockIndex === index && h.itemIndex === undefined
          );
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
              <span data-hl-block={index}>
                {renderInlineFormatting(
                  block.text ?? '',
                  hlForHeading,
                  canHighlight ? handleClickExistingMark : undefined
                )}
              </span>
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
          const hlForQuote = scopedHighlights.filter(
            (h) => h.blockIndex === index && h.itemIndex === undefined
          );
          return (
            <blockquote
              key={index}
              data-hl-block={index}
              className="rounded-2xl border border-[var(--line)] bg-[var(--sunk)] px-4 py-3 text-xs sm:text-[13.5px] leading-7 text-[var(--muted)]"
            >
              {renderInlineFormatting(
                block.text ?? '',
                hlForQuote,
                canHighlight ? handleClickExistingMark : undefined
              )}
            </blockquote>
          );
        }

        if (block.type === 'list') {
          return (
            <ul
              key={index}
              className={`space-y-2.5 pr-5 list-disc marker:text-[var(--blue)] text-[var(--ink-2)] ${proseSizeClass}`}
            >
              {block.items?.map((item, idx) => {
                const hlForItem = scopedHighlights.filter(
                  (h) => h.blockIndex === index && h.itemIndex === idx
                );
                return (
                  <li key={idx} data-hl-block={index} data-hl-item={idx}>
                    {renderInlineFormatting(
                      item,
                      hlForItem,
                      canHighlight ? handleClickExistingMark : undefined
                    )}
                  </li>
                );
              })}
            </ul>
          );
        }

        const hlForPara = scopedHighlights.filter(
          (h) => h.blockIndex === index && h.itemIndex === undefined
        );
        return (
          <p key={index} data-hl-block={index} className={`text-[var(--ink-2)] ${proseSizeClass}`}>
            {renderInlineFormatting(
              block.text ?? '',
              hlForPara,
              canHighlight ? handleClickExistingMark : undefined
            )}
          </p>
        );
      })}

      {/* Floating Highlight Popover Above Selection (Portaled to body so backdrop-filter parents never shift fixed coords) */}
      {toolbar &&
        canHighlight &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            data-highlight-toolbar
            data-testid="selection-highlight-toolbar"
            role="toolbar"
            aria-label="ابزار هایلایت متن"
            onMouseDown={(e) => e.preventDefault()}
            onPointerDown={(e) => e.stopPropagation()}
            style={{
              position: 'fixed',
              top: `${toolbar.top}px`,
              left: `${toolbar.left}px`,
              transform:
                toolbar.placement === 'above' ? 'translate(-50%, -100%)' : 'translate(-50%, 0)',
            }}
            className="z-[70] pointer-events-auto"
          >
            <div className="relative flex items-center gap-1.5 rounded-full border border-[var(--glass-border)] bg-[var(--nav-puck)] px-2.5 py-1.5 shadow-[0_12px_28px_-8px_var(--sh)] backdrop-blur-xl animate-[puck-pop_180ms_cubic-bezier(0.16,1,0.3,1)]">
              {toolbar.mode === 'selection' && (
                <button
                  type="button"
                  data-testid="highlight-selection-btn"
                  onClick={() => handleApplyHighlight('yellow')}
                  className="inline-flex items-center gap-1.5 rounded-full bg-[var(--blue-tint)] px-3 py-1 text-xs font-bold text-[var(--blue-ink)] hover:bg-[var(--blue)] hover:text-white transition-colors cursor-pointer whitespace-nowrap"
                >
                  <Highlighter className="h-3.5 w-3.5" />
                  <span>هایلایت</span>
                </button>
              )}

              <div className="flex items-center gap-1 px-0.5">
                {HIGHLIGHT_SWATCHES.map((swatch) => {
                  const isActiveColor =
                    toolbar.mode === 'mark' && toolbar.activeMark?.color === swatch.color;
                  return (
                    <button
                      key={swatch.color}
                      type="button"
                      aria-label={swatch.label}
                      title={swatch.label}
                      onClick={() => handleApplyHighlight(swatch.color)}
                      className={`h-5 w-5 rounded-full ${swatch.dotClass} border border-black/15 dark:border-white/25 transition-transform hover:scale-110 cursor-pointer ${
                        isActiveColor ? 'ring-2 ring-[var(--ink-strong)] ring-offset-1' : ''
                      }`}
                    />
                  );
                })}
              </div>

              {(toolbar.mode === 'mark' || toolbar.overlappingIds.length > 0) &&
                onRemoveHighlights && (
                  <>
                    <span className="h-4 w-px bg-[var(--line-2)]" aria-hidden="true" />
                    <button
                      type="button"
                      data-testid="remove-highlight-btn"
                      onClick={handleDeleteHighlight}
                      aria-label="حذف هایلایت"
                      title="حذف هایلایت"
                      className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold text-[var(--danger)] hover:bg-[var(--danger-tint)] transition-colors cursor-pointer whitespace-nowrap"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>حذف</span>
                    </button>
                  </>
                )}

              <span
                aria-hidden="true"
                style={{
                  left: `calc(50% + ${toolbar.arrowOffset}px)`,
                }}
                className={`pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 rotate-45 border-[var(--glass-border)] bg-[var(--nav-puck)] ${
                  toolbar.placement === 'above'
                    ? '-bottom-[5px] border-b border-r'
                    : '-top-[5px] border-t border-l'
                }`}
              />
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
