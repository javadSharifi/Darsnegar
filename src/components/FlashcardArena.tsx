import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Award,
  BookmarkPlus,
  CheckCircle2,
  RotateCcw,
  SkipForward,
  Sparkles,
} from 'lucide-react';
import type {
  DifficultyLevel,
  Lesson,
  LessonQuestion,
  QuestionProgressState,
  UserQuestionProgress,
} from '../types/learning';
import {
  buildFlashcardQueue,
  getLevelLabel,
  getOptionLetter,
  toPersianDigits,
} from '../utils/studyEngine';

interface FlashcardArenaProps {
  lessons: Lesson[];
  initialLessonId: string | 'all';
  initialChapterId?: string | 'all';
  progress: Record<string, UserQuestionProgress>;
  onMarkQuestion: (questionId: string, state: QuestionProgressState, xpDelta: number) => void;
  onStartExamForLesson: (lessonId: string, chapterId?: string | 'all') => void;
}

interface EnrichedQuestion extends LessonQuestion {
  lessonTitle: string;
  lessonCategory: string;
}

export function FlashcardArena({
  lessons,
  initialLessonId,
  initialChapterId = 'all',
  progress,
  onMarkQuestion,
  onStartExamForLesson,
}: FlashcardArenaProps) {
  const [selectedLessonId, setSelectedLessonId] = useState<string | 'all'>(initialLessonId);
  const [selectedChapterId, setSelectedChapterId] = useState<string | 'all'>(initialChapterId);
  const [levelFilter, setLevelFilter] = useState<DifficultyLevel | 'all'>('all');
  const [flipped, setFlipped] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [sessionXp, setSessionXp] = useState(0);
  const [sessionKnown, setSessionKnown] = useState(0);
  const [sessionLearning, setSessionLearning] = useState(0);
  const [completed, setCompleted] = useState(false);

  // Sync if user jumped from a specific lesson/chapter
  useEffect(() => {
    setSelectedLessonId(initialLessonId);
    setSelectedChapterId(initialChapterId);
    setCurrentIndex(0);
    setFlipped(false);
    setCompleted(false);
    setSessionXp(0);
    setSessionKnown(0);
    setSessionLearning(0);
  }, [initialLessonId, initialChapterId]);

  const lessonMap = useMemo(() => {
    const map = new Map<string, Lesson>();
    for (const l of lessons) map.set(l.id, l);
    return map;
  }, [lessons]);

  const selectedLessonObj = useMemo(
    () => (selectedLessonId === 'all' ? null : lessons.find((l) => l.id === selectedLessonId) ?? null),
    [lessons, selectedLessonId]
  );

  const availableChapters = selectedLessonObj?.chapters ?? [];

  const queue = useMemo<EnrichedQuestion[]>(() => {
    const sourceLessons =
      selectedLessonId === 'all'
        ? lessons
        : lessons.filter((l) => l.id === selectedLessonId);

    const flat: EnrichedQuestion[] = [];
    for (const lesson of sourceLessons) {
      for (const q of lesson.questions) {
        if (
          selectedLessonId !== 'all' &&
          selectedChapterId !== 'all' &&
          q.chapterId &&
          q.chapterId !== selectedChapterId
        ) {
          continue;
        }
        flat.push({
          ...q,
          lessonTitle: lesson.title,
          lessonCategory: lesson.category,
        });
      }
    }

    return buildFlashcardQueue(flat, progress, levelFilter) as EnrichedQuestion[];
  }, [lessons, selectedLessonId, selectedChapterId, levelFilter, progress]);

  // Keep snapshot of queue IDs during an active session so marking doesn't reshuffle mid-card
  const [sessionQueueIds, setSessionQueueIds] = useState<string[]>([]);

  useEffect(() => {
    setSessionQueueIds(queue.map((q) => q.id));
    setCurrentIndex(0);
    setFlipped(false);
    setCompleted(false);
    setSessionXp(0);
    setSessionKnown(0);
    setSessionLearning(0);
  }, [selectedLessonId, selectedChapterId, levelFilter]);

  const activeCards = useMemo(() => {
    if (sessionQueueIds.length === 0) return queue;
    const byId = new Map<string, EnrichedQuestion>();
    for (const item of queue) byId.set(item.id, item);
    const ordered = sessionQueueIds
      .map((id) => byId.get(id))
      .filter((item): item is EnrichedQuestion => Boolean(item));
    return ordered.length > 0 ? ordered : queue;
  }, [queue, sessionQueueIds]);

  const currentCard = activeCards[currentIndex] ?? null;
  const totalCards = activeCards.length;

  const advance = useCallback(() => {
    setFlipped(false);
    if (currentIndex + 1 >= totalCards) {
      setCompleted(true);
    } else {
      setCurrentIndex((prev) => prev + 1);
    }
  }, [currentIndex, totalCards]);

  const handleAction = useCallback(
    (state: QuestionProgressState) => {
      if (!currentCard || completed) return;
      const xp = state === 'know' ? 10 : state === 'want_to_learn' ? 4 : 0;
      onMarkQuestion(currentCard.id, state, xp);
      setSessionXp((prev) => prev + xp);
      if (state === 'know') setSessionKnown((prev) => prev + 1);
      if (state === 'want_to_learn') setSessionLearning((prev) => prev + 1);
      advance();
    },
    [currentCard, completed, onMarkQuestion, advance]
  );

  const handleRestart = () => {
    setSessionQueueIds(queue.map((q) => q.id));
    setCurrentIndex(0);
    setFlipped(false);
    setCompleted(false);
    setSessionXp(0);
    setSessionKnown(0);
    setSessionLearning(0);
  };

  // Keyboard shortcuts like DevQuiz
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT')
      ) {
        return;
      }
      if (completed || !currentCard) return;
      if (e.code === 'Space') {
        e.preventDefault();
        setFlipped((prev) => !prev);
      } else if (e.key === '1' || e.key === 'ArrowRight') {
        e.preventDefault();
        handleAction('know');
      } else if (e.key === '2' || e.key === 'ArrowDown') {
        e.preventDefault();
        handleAction('want_to_learn');
      } else if (e.key === '3' || e.key === 'ArrowLeft') {
        e.preventDefault();
        handleAction('skip');
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [completed, currentCard, handleAction]);

  const progressPercent =
    totalCards > 0
      ? Math.round(((completed ? totalCards : currentIndex) / totalCards) * 100)
      : 0;

  return (
    <div className="space-y-5">
      {/* Filter Toolbar */}
      <section className="glass-card p-4 sm:p-5 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label htmlFor="flashcard-lesson-select" className="text-xs font-semibold text-[var(--muted)]">
              درس:
            </label>
            <select
              id="flashcard-lesson-select"
              value={selectedLessonId}
              onChange={(e) => {
                setSelectedLessonId(e.target.value);
                setSelectedChapterId('all');
              }}
              className="glass-field px-3 py-2 text-xs sm:text-sm font-medium min-w-[180px]"
            >
              <option value="all">همه درس‌ها</option>
              {lessons.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.title}
                </option>
              ))}
            </select>
          </div>

          {availableChapters.length > 1 && (
            <div className="flex items-center gap-2">
              <label htmlFor="flashcard-chapter-select" className="text-xs font-semibold text-[var(--muted)]">
                فصل:
              </label>
              <select
                id="flashcard-chapter-select"
                value={selectedChapterId}
                onChange={(e) => setSelectedChapterId(e.target.value)}
                className="glass-field px-3 py-2 text-xs sm:text-sm font-medium min-w-[150px]"
              >
                <option value="all">همه فصل‌ها</option>
                {availableChapters.map((ch) => (
                  <option key={ch.id} value={ch.id}>
                    {ch.title}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex items-center gap-1 rounded-xl bg-[var(--sunk)] p-1">
            {(['all', 'junior', 'mid', 'senior'] as const).map((lvl) => (
              <button
                key={lvl}
                type="button"
                onClick={() => setLevelFilter(lvl)}
                className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  levelFilter === lvl
                    ? 'bg-[var(--glass-strong)] text-[var(--blue-ink)] font-semibold shadow-sm'
                    : 'text-[var(--muted)] hover:text-[var(--ink)]'
                }`}
              >
                {lvl === 'all' ? 'همه سطوح' : getLevelLabel(lvl)}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-4 text-xs font-medium text-[var(--muted)] tabular-nums">
          <span>
            کارت{' '}
            <strong className="text-[var(--ink-strong)]">
              {totalCards > 0 ? toPersianDigits(Math.min(currentIndex + 1, totalCards)) : '۰'}
            </strong>{' '}
            از {toPersianDigits(totalCards)}
          </span>
          <span aria-hidden="true">·</span>
          <span className="text-[var(--blue-ink)] font-semibold">
            +{toPersianDigits(sessionXp)} امتیاز جلسه
          </span>
        </div>
      </section>

      {/* Progress Track */}
      <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--sunk-2)]">
        <div
          className="h-full rounded-full bg-[var(--blue)] transition-all duration-300"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* Main Flashcard Stage */}
      {totalCards === 0 ? (
        <section className="glass-card-strong p-8 text-center space-y-2">
          <h2 className="text-lg font-bold text-[var(--ink-strong)]">
            سوالی با این فیلتر پیدا نشد
          </h2>
          <p className="text-sm text-[var(--muted)]">
            سطح سختی یا درس دیگری را انتخاب کنید یا سوال جدیدی اضافه نمایید.
          </p>
        </section>
      ) : completed ? (
        <section
          className="glass-card-strong p-8 text-center space-y-5"
          data-testid="flashcard-complete"
        >
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[var(--ok-tint)] text-[var(--ok)]">
            <Award className="h-8 w-8" />
          </div>
          <div className="space-y-1.5">
            <h2 className="text-2xl font-extrabold text-[var(--ink-strong)]">
              آفرین! مرور فلش‌کارت‌ها تمام شد
            </h2>
            <p className="text-sm text-[var(--muted)] tabular-nums">
              {toPersianDigits(sessionKnown)} کارت را بلد بودید، {toPersianDigits(sessionLearning)} کارت به صف مرور اضافه شد و +{toPersianDigits(sessionXp)} امتیاز گرفتید.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={handleRestart}
              className="btn-secondary-glass inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold cursor-pointer whitespace-nowrap"
            >
              <RotateCcw className="h-4 w-4" />
              <span>مرور دوباره</span>
            </button>
            <button
              type="button"
              onClick={() =>
                onStartExamForLesson(
                  selectedLessonId === 'all'
                    ? lessons[0]?.id ?? ''
                    : lessonMap.get(selectedLessonId)?.id ?? lessons[0]?.id ?? '',
                  selectedChapterId
                )
              }
              className="btn-primary-glass inline-flex items-center gap-2 rounded-full px-6 py-2.5 text-sm font-semibold cursor-pointer whitespace-nowrap"
            >
              <Sparkles className="h-4 w-4" />
              <span>آماده‌ام، شروع آزمون</span>
            </button>
          </div>
        </section>
      ) : currentCard ? (
        <div className="space-y-4">
          <div className="flashcard-scene">
            <div className={`flashcard-inner grid ${flipped ? 'is-flipped' : ''}`}>
              {/* Front Face */}
              <div
                aria-hidden={flipped}
                className={`flashcard-face [grid-area:1/1] glass-card-strong p-6 sm:p-9 min-h-[290px] flex flex-col justify-between gap-6 ${
                  flipped ? 'pointer-events-none' : ''
                }`}
              >
                <div className="flex items-center justify-between gap-3 text-xs text-[var(--muted)]">
                  <span>
                    {currentCard.lessonCategory} · {currentCard.lessonTitle}
                  </span>
                  <span>سطح {getLevelLabel(currentCard.level)}</span>
                </div>

                <div className="space-y-4">
                  <p className="text-xs font-semibold text-[var(--blue-ink)]">پرسش</p>
                  <h2 className="text-xl sm:text-2xl font-bold leading-relaxed text-[var(--ink-strong)]">
                    {currentCard.question}
                  </h2>

                  {currentCard.codeSnippet && (
                    <pre
                      dir="ltr"
                      className="overflow-x-auto rounded-2xl bg-[var(--code-bg)] p-4 text-xs sm:text-[13px] leading-6 text-[var(--code-ink)] font-mono-code"
                    >
                      <code>{currentCard.codeSnippet}</code>
                    </pre>
                  )}
                </div>

                <div className="flex items-center justify-between pt-2">
                  <span className="text-xs text-[var(--faint)]">
                    کلید Space برای برگرداندن کارت
                  </span>
                  <button
                    type="button"
                    onClick={() => setFlipped(true)}
                    disabled={flipped}
                    className="btn-primary-glass rounded-full px-6 py-2.5 text-sm font-semibold cursor-pointer whitespace-nowrap"
                  >
                    نمایش پاسخ
                  </button>
                </div>
              </div>

              {/* Back Face */}
              <div
                aria-hidden={!flipped}
                className={`flashcard-face flashcard-face-back [grid-area:1/1] glass-card-strong p-6 sm:p-9 min-h-[290px] flex flex-col justify-between gap-6 ${
                  !flipped ? 'pointer-events-none' : ''
                }`}
              >
                <div className="flex items-center justify-between gap-3 text-xs text-[var(--muted)]">
                  <span>پاسخ آموزشی</span>
                  <span>{currentCard.lessonTitle}</span>
                </div>

                <div className="space-y-3">
                  <p className="text-sm font-semibold text-[var(--muted)]">
                    {currentCard.question}
                  </p>
                  <div className="rounded-2xl bg-[var(--ok-tint)] p-4 sm:p-5 text-[15px] sm:text-base leading-8 text-[var(--ink-strong)] space-y-2">
                    {currentCard.options[currentCard.correctOptionIndex] && (
                      <p className="font-bold text-[var(--ok-ink)]">
                        پاسخ صحیح: {getOptionLetter(currentCard.correctOptionIndex)}){' '}
                        {currentCard.options[currentCard.correctOptionIndex]}
                      </p>
                    )}
                    {currentCard.answer &&
                      currentCard.answer.trim() !==
                        (currentCard.options[currentCard.correctOptionIndex] ?? '').trim() && (
                        <p className="text-sm sm:text-[15px] leading-7 text-[var(--ink-strong)]">
                          <strong className="font-bold text-[var(--blue-ink)] ml-1.5">دلیل:</strong>
                          <span>{currentCard.answer}</span>
                        </p>
                      )}
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2">
                  <span className="text-xs text-[var(--faint)]">
                    ارزیابی تسلط خود را ثبت کنید
                  </span>
                  <button
                    type="button"
                    onClick={() => setFlipped(false)}
                    disabled={!flipped}
                    className="btn-secondary-glass rounded-full px-4 py-2 text-xs font-semibold cursor-pointer whitespace-nowrap"
                  >
                    بازگشت به سوال
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* DevQuiz Action Bar: Know / Want to Learn / Skip */}
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
            <button
              type="button"
              onClick={() => handleAction('know')}
              className="glass-card flex items-center justify-center gap-2 py-3.5 px-4 text-sm font-bold text-[var(--ok-ink)] hover:bg-[var(--ok-tint)] transition-colors cursor-pointer whitespace-nowrap"
            >
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>بلدم (+۱۰ امتیاز)</span>
            </button>

            <button
              type="button"
              onClick={() => handleAction('want_to_learn')}
              className="glass-card flex items-center justify-center gap-2 py-3.5 px-4 text-sm font-bold text-[var(--peach-ink)] hover:bg-[var(--peach-tint)] transition-colors cursor-pointer whitespace-nowrap"
            >
              <BookmarkPlus className="h-4 w-4 shrink-0" />
              <span>یاد می‌گیرم (صف مرور)</span>
            </button>

            <button
              type="button"
              onClick={() => handleAction('skip')}
              className="glass-card flex items-center justify-center gap-2 py-3.5 px-4 text-sm font-semibold text-[var(--muted)] hover:bg-[var(--sunk)] transition-colors cursor-pointer whitespace-nowrap"
            >
              <SkipForward className="h-4 w-4 shrink-0" />
              <span>رد کن</span>
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
