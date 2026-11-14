import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  GraduationCap,
  RotateCcw,
  XCircle,
} from 'lucide-react';
import type {
  DifficultyLevel,
  ExamAttempt,
  Lesson,
  LessonQuestion,
} from '../types/learning';
import {
  evaluateExam,
  formatDurationPersian,
  getLevelLabel,
  getOptionLetter,
  toPersianDigits,
} from '../utils/studyEngine';

interface ExamArenaProps {
  lessons: Lesson[];
  initialLessonId: string | 'all';
  initialChapterId?: string | 'all';
  defaultTimerMinutes: number;
  examHistory: ExamAttempt[];
  onRecordExam: (attempt: ExamAttempt) => void;
  onGoToReview: () => void;
}

type ExamPhase = 'setup' | 'running' | 'results';

interface ExamQuestionItem extends LessonQuestion {
  lessonTitle: string;
}

export function ExamArena({
  lessons,
  initialLessonId,
  initialChapterId = 'all',
  defaultTimerMinutes,
  examHistory,
  onRecordExam,
  onGoToReview,
}: ExamArenaProps) {
  const [phase, setPhase] = useState<ExamPhase>('setup');
  const [selectedLessonId, setSelectedLessonId] = useState<string | 'all'>(initialLessonId);
  const [selectedChapterId, setSelectedChapterId] = useState<string | 'all'>(initialChapterId);
  const [levelFilter, setLevelFilter] = useState<DifficultyLevel | 'all'>('all');
  const [timerMinutes, setTimerMinutes] = useState<number>(defaultTimerMinutes);

  const [examQuestions, setExamQuestions] = useState<ExamQuestionItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, number>>({});
  const [secondsLeft, setSecondsLeft] = useState<number>(0);
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const [lastAttempt, setLastAttempt] = useState<ExamAttempt | null>(null);

  useEffect(() => {
    setSelectedLessonId(initialLessonId);
    setSelectedChapterId(initialChapterId);
    setPhase('setup');
  }, [initialLessonId, initialChapterId]);

  const selectedLessonObj = useMemo(
    () => (selectedLessonId === 'all' ? null : lessons.find((l) => l.id === selectedLessonId) ?? null),
    [lessons, selectedLessonId]
  );

  const availableChapters = selectedLessonObj?.chapters ?? [];

  const availablePool = useMemo<ExamQuestionItem[]>(() => {
    const source =
      selectedLessonId === 'all'
        ? lessons
        : lessons.filter((l) => l.id === selectedLessonId);

    const list: ExamQuestionItem[] = [];
    for (const lesson of source) {
      for (const q of lesson.questions) {
        if (
          selectedLessonId !== 'all' &&
          selectedChapterId !== 'all' &&
          q.chapterId &&
          q.chapterId !== selectedChapterId
        ) {
          continue;
        }
        if (levelFilter === 'all' || q.level === levelFilter) {
          list.push({ ...q, lessonTitle: lesson.title });
        }
      }
    }
    return list;
  }, [lessons, selectedLessonId, selectedChapterId, levelFilter]);

  const finishExam = useCallback(
    (questionsToGrade: ExamQuestionItem[], answersMap: Record<string, number>, spent: number) => {
      const evaluation = evaluateExam(questionsToGrade, answersMap);
      const lessonLabel =
        selectedLessonId === 'all'
          ? 'آزمون جامع همه درس‌ها'
          : lessons.find((l) => l.id === selectedLessonId)?.title ?? 'آزمون درس';

      const attempt: ExamAttempt = {
        id: `exam-${Date.now()}`,
        lessonId: selectedLessonId,
        lessonTitle: lessonLabel,
        totalQuestions: evaluation.totalQuestions,
        correctCount: evaluation.correctCount,
        wrongQuestionIds: evaluation.wrongQuestionIds,
        scorePercent: evaluation.scorePercent,
        xpEarned: evaluation.xpEarned,
        durationSeconds: spent,
        completedAt: Date.now(),
      };

      setLastAttempt(attempt);
      onRecordExam(attempt);
      setPhase('results');
    },
    [selectedLessonId, lessons, onRecordExam]
  );

  // Timer tick while exam is running
  useEffect(() => {
    if (phase !== 'running') return;
    const interval = window.setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
      if (timerMinutes > 0) {
        setSecondsLeft((prev) => {
          if (prev <= 1) {
            window.clearInterval(interval);
            finishExam(examQuestions, selectedAnswers, timerMinutes * 60);
            return 0;
          }
          return prev - 1;
        });
      }
    }, 1000);
    return () => window.clearInterval(interval);
  }, [phase, timerMinutes, examQuestions, selectedAnswers, finishExam]);

  const startExam = (customQuestions?: ExamQuestionItem[]) => {
    const pool = customQuestions ?? availablePool;
    if (pool.length === 0) return;
    setExamQuestions(pool);
    setSelectedAnswers({});
    setCurrentIndex(0);
    setElapsedSeconds(0);
    setSecondsLeft(timerMinutes * 60);
    setPhase('running');
  };

  // Keyboard 1-4 selection in running mode (only before the question is answered)
  useEffect(() => {
    if (phase !== 'running') return;
    const currentQ = examQuestions[currentIndex];
    if (!currentQ) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (selectedAnswers[currentQ.id] !== undefined) return;
      const index = ['1', '2', '3', '4'].indexOf(e.key);
      if (index !== -1 && index < currentQ.options.length) {
        setSelectedAnswers((prev) => ({ ...prev, [currentQ.id]: index }));
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [phase, examQuestions, currentIndex, selectedAnswers]);

  if (phase === 'setup') {
    return (
      <div className="space-y-6">
        <section className="glass-card-strong p-6 sm:p-8 space-y-6">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--blue-tint)] text-[var(--blue-ink)]">
              <GraduationCap className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-extrabold text-[var(--ink-strong)]">
                حالت امتحانی و ارزیابی
              </h1>
              <p className="text-sm text-[var(--muted)] mt-1">
                آزمون تستی با کارنامه دقیق، ثبت خودکار غلط‌ها در صف مرور و کسب امتیاز.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <label htmlFor="exam-lesson-select" className="block text-xs font-semibold text-[var(--muted)]">
                انتخاب درس
              </label>
              <select
                id="exam-lesson-select"
                value={selectedLessonId}
                onChange={(e) => {
                  setSelectedLessonId(e.target.value);
                  setSelectedChapterId('all');
                }}
                className="glass-field w-full px-3.5 py-2.5 text-sm font-medium"
              >
                <option value="all">آزمون جامع (همه درس‌ها)</option>
                {lessons.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.title}
                  </option>
                ))}
              </select>
            </div>

            {availableChapters.length > 1 ? (
              <div className="space-y-2">
                <label htmlFor="exam-chapter-select" className="block text-xs font-semibold text-[var(--muted)]">
                  انتخاب فصل
                </label>
                <select
                  id="exam-chapter-select"
                  value={selectedChapterId}
                  onChange={(e) => setSelectedChapterId(e.target.value)}
                  className="glass-field w-full px-3.5 py-2.5 text-sm font-medium"
                >
                  <option value="all">همه فصل‌های این درس</option>
                  {availableChapters.map((ch) => (
                    <option key={ch.id} value={ch.id}>
                      {ch.title}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="space-y-2">
                <label htmlFor="exam-level-select" className="block text-xs font-semibold text-[var(--muted)]">
                  سطح سوالات
                </label>
                <select
                  id="exam-level-select"
                  value={levelFilter}
                  onChange={(e) => setLevelFilter(e.target.value as DifficultyLevel | 'all')}
                  className="glass-field w-full px-3.5 py-2.5 text-sm font-medium"
                >
                  <option value="all">همه سطوح</option>
                  <option value="junior">مقدماتی</option>
                  <option value="mid">متوسط</option>
                  <option value="senior">پیشرفته</option>
                </select>
              </div>
            )}

            <div className="space-y-2">
              <label htmlFor="exam-timer-select" className="block text-xs font-semibold text-[var(--muted)]">
                زمان آزمون
              </label>
              <select
                id="exam-timer-select"
                value={timerMinutes}
                onChange={(e) => setTimerMinutes(Number(e.target.value))}
                className="glass-field w-full px-3.5 py-2.5 text-sm font-medium"
              >
                <option value={0}>بدون محدودیت زمان</option>
                <option value={3}>۳ دقیقه</option>
                <option value={5}>۵ دقیقه</option>
                <option value={10}>۱۰ دقیقه</option>
              </select>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-t border-[var(--line)] pt-5">
            <div className="text-sm text-[var(--muted)] tabular-nums">
              تعداد سوالات آماده برای آزمون:{' '}
              <strong className="text-[var(--ink-strong)]">
                {toPersianDigits(availablePool.length)} سوال
              </strong>
            </div>

            <button
              type="button"
              onClick={() => startExam()}
              disabled={availablePool.length === 0}
              className="btn-primary-glass rounded-full px-7 py-3 text-sm font-bold cursor-pointer whitespace-nowrap disabled:opacity-50"
            >
              شروع آزمون
            </button>
          </div>
        </section>

        {/* Recent Exam History */}
        {examHistory.length > 0 && (
          <section className="glass-card p-5 sm:p-6 space-y-4">
            <h2 className="text-base font-bold text-[var(--ink-strong)]">کارنامه‌های اخیر</h2>
            <div className="space-y-2.5">
              {examHistory.slice(0, 5).map((item) => {
                const passed = item.scorePercent >= 60;
                return (
                  <div
                    key={item.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[var(--sunk)] px-4 py-3 text-sm"
                  >
                    <div className="space-y-0.5">
                      <p className="font-semibold text-[var(--ink-strong)]">{item.lessonTitle}</p>
                      <p className="text-xs text-[var(--muted)] tabular-nums">
                        {toPersianDigits(item.correctCount)} پاسخ صحیح از{' '}
                        {toPersianDigits(item.totalQuestions)} · مدت{' '}
                        {formatDurationPersian(item.durationSeconds)}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 tabular-nums">
                      <span
                        className={`inline-flex items-center gap-1 text-xs font-bold ${
                          passed ? 'text-[var(--ok-ink)]' : 'text-[var(--danger)]'
                        }`}
                      >
                        {passed ? (
                          <CheckCircle2 className="h-4 w-4" />
                        ) : (
                          <AlertCircle className="h-4 w-4" />
                        )}
                        <span>{toPersianDigits(item.scorePercent)}٪</span>
                      </span>
                      <span className="text-xs font-medium text-[var(--blue-ink)]">
                        +{toPersianDigits(item.xpEarned)} XP
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </div>
    );
  }

  if (phase === 'running') {
    const currentQ = examQuestions[currentIndex];
    const answeredCount = Object.keys(selectedAnswers).length;
    const chosenOption = selectedAnswers[currentQ.id];
    const isAnswered = chosenOption !== undefined;
    const isChosenCorrect = isAnswered && chosenOption === currentQ.correctOptionIndex;

    return (
      <div className="space-y-5" data-testid="exam-running">
        {/* Top Exam Status Bar */}
        <section className="glass-card px-5 py-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3 text-sm font-semibold text-[var(--ink-strong)] tabular-nums">
            <span>
              سوال {toPersianDigits(currentIndex + 1)} از {toPersianDigits(examQuestions.length)}
            </span>
            <span className="text-[var(--muted)] font-normal text-xs">
              ({toPersianDigits(answeredCount)} پاسخ‌داده‌شده)
            </span>
          </div>

          <div className="flex items-center gap-3">
            {timerMinutes > 0 && (
              <div className="inline-flex items-center gap-1.5 rounded-full bg-[var(--blue-tint)] px-3.5 py-1.5 text-xs font-bold text-[var(--blue-ink)] tabular-nums">
                <Clock className="h-3.5 w-3.5" />
                <span>{formatDurationPersian(secondsLeft)}</span>
              </div>
            )}
            <button
              type="button"
              onClick={() => finishExam(examQuestions, selectedAnswers, elapsedSeconds)}
              className="btn-primary-glass rounded-full px-5 py-2 text-xs font-bold cursor-pointer whitespace-nowrap"
            >
              پایان و ثبت آزمون
            </button>
          </div>
        </section>

        {/* Question Stepper Pills */}
        <div className="flex flex-wrap items-center gap-2">
          {examQuestions.map((q, idx) => {
            const isCurrent = idx === currentIndex;
            const qChosen = selectedAnswers[q.id];
            const qAnswered = qChosen !== undefined;
            const qCorrect = qAnswered && qChosen === q.correctOptionIndex;
            return (
              <button
                key={q.id}
                type="button"
                onClick={() => setCurrentIndex(idx)}
                aria-label={`رفتن به سوال ${toPersianDigits(idx + 1)}`}
                className={`h-9 min-w-[36px] rounded-xl px-2.5 text-xs font-bold tabular-nums transition-all cursor-pointer border ${
                  isCurrent
                    ? 'bg-[var(--blue)] text-white border-transparent'
                    : qAnswered
                      ? qCorrect
                        ? 'bg-[var(--ok-tint)] text-[var(--ok-ink)] border-transparent'
                        : 'bg-[var(--danger-tint)] text-[var(--danger)] border-transparent'
                      : 'bg-[var(--glass)] text-[var(--muted)] border-[var(--line-2)]'
                }`}
              >
                {toPersianDigits(idx + 1)}
              </button>
            );
          })}
        </div>

        {/* Question Card */}
        <section className="glass-card-strong p-6 sm:p-8 space-y-6">
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs text-[var(--muted)]">
              <span>{currentQ.lessonTitle}</span>
              {currentQ.chapterTitle && currentQ.chapterTitle !== currentQ.lessonTitle && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>{currentQ.chapterTitle}</span>
                </>
              )}
              <span aria-hidden="true">·</span>
              <span>سطح {getLevelLabel(currentQ.level)}</span>
            </div>
            <h2 className="text-lg sm:text-xl font-bold leading-relaxed text-[var(--ink-strong)]">
              {currentQ.question}
            </h2>
            {currentQ.codeSnippet && (
              <pre
                dir="ltr"
                className="overflow-x-auto rounded-2xl bg-[var(--code-bg)] p-4 text-xs sm:text-[13px] leading-6 text-[var(--code-ink)] font-mono-code"
              >
                <code>{currentQ.codeSnippet}</code>
              </pre>
            )}
          </div>

          <div className="space-y-2.5" role="radiogroup" aria-label="گزینه‌های پاسخ">
            {currentQ.options.map((opt, idx) => {
              const isSelected = chosenOption === idx;
              const isCorrectOpt = idx === currentQ.correctOptionIndex;
              const optionLetter = getOptionLetter(idx);

              let containerStyle =
                'border-[var(--line-2)] bg-[var(--sunk)] text-[var(--ink)] hover:bg-[var(--glass-strong)] cursor-pointer';
              let badgeStyle = 'bg-[var(--sunk-2)] text-[var(--muted)]';

              if (isAnswered) {
                if (isCorrectOpt) {
                  containerStyle =
                    'border-[var(--ok)] bg-[var(--ok-tint)] text-[var(--ink-strong)] font-semibold cursor-default';
                  badgeStyle = 'bg-[var(--ok)] text-white';
                } else if (isSelected) {
                  containerStyle =
                    'border-[var(--danger)] bg-[var(--danger-tint)] text-[var(--ink-strong)] font-semibold cursor-default';
                  badgeStyle = 'bg-[var(--danger)] text-white';
                } else {
                  containerStyle =
                    'border-[var(--line)] bg-[var(--sunk)] text-[var(--muted)] opacity-65 cursor-default';
                }
              } else if (isSelected) {
                containerStyle =
                  'border-[var(--blue)] bg-[var(--blue-tint)] text-[var(--ink-strong)] font-semibold cursor-pointer';
                badgeStyle = 'bg-[var(--blue)] text-white';
              }

              return (
                <button
                  key={idx}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  disabled={isAnswered}
                  onClick={() =>
                    setSelectedAnswers((prev) =>
                      prev[currentQ.id] === undefined ? { ...prev, [currentQ.id]: idx } : prev
                    )
                  }
                  className={`w-full rounded-2xl border p-4 text-right text-sm sm:text-[15px] font-medium transition-all flex items-center justify-between gap-3 ${containerStyle}`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className={`flex h-8 min-w-[32px] px-2 shrink-0 items-center justify-center rounded-full text-xs font-bold ${badgeStyle}`}
                    >
                      {optionLetter})
                    </span>
                    <span className="leading-relaxed">{opt}</span>
                  </div>

                  {isAnswered && isCorrectOpt && (
                    <CheckCircle2 className="h-5 w-5 shrink-0 text-[var(--ok)]" />
                  )}
                  {isAnswered && isSelected && !isCorrectOpt && (
                    <XCircle className="h-5 w-5 shrink-0 text-[var(--danger)]" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Immediate Feedback & Reason ("پاسخ صحیح" + "دلیل") right beneath the options */}
          {isAnswered && (
            <div
              data-testid="exam-immediate-feedback"
              role="status"
              className={`rounded-2xl border p-4 sm:p-5 space-y-2.5 ${
                isChosenCorrect
                  ? 'border-[var(--ok)] bg-[var(--ok-tint)]'
                  : 'border-[var(--danger)] bg-[var(--danger-tint)]'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span
                  className={`inline-flex items-center gap-1.5 text-sm font-extrabold ${
                    isChosenCorrect ? 'text-[var(--ok-ink)]' : 'text-[var(--danger)]'
                  }`}
                >
                  {isChosenCorrect ? (
                    <>
                      <CheckCircle2 className="h-4 w-4" />
                      <span>پاسخ شما درست بود</span>
                    </>
                  ) : (
                    <>
                      <XCircle className="h-4 w-4" />
                      <span>پاسخ شما نادرست بود</span>
                    </>
                  )}
                </span>

                <span className="text-xs sm:text-sm font-bold text-[var(--ink-strong)]">
                  پاسخ صحیح: {getOptionLetter(currentQ.correctOptionIndex)}
                </span>
              </div>

              <div className="rounded-xl bg-[var(--glass-strong)] px-4 py-3 text-xs sm:text-sm leading-7 text-[var(--ink-strong)]">
                <strong className="font-bold text-[var(--blue-ink)] ml-1.5">دلیل:</strong>
                <span>{currentQ.answer}</span>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between gap-3 border-t border-[var(--line)] pt-5">
            <button
              type="button"
              onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
              disabled={currentIndex === 0}
              className="btn-secondary-glass rounded-full px-5 py-2.5 text-xs sm:text-sm font-semibold cursor-pointer disabled:opacity-40 whitespace-nowrap"
            >
              سوال قبلی
            </button>

            {currentIndex + 1 < examQuestions.length ? (
              <button
                type="button"
                onClick={() => setCurrentIndex((prev) => prev + 1)}
                className="btn-primary-glass rounded-full px-6 py-2.5 text-xs sm:text-sm font-semibold cursor-pointer whitespace-nowrap"
              >
                سوال بعدی
              </button>
            ) : (
              <button
                type="button"
                onClick={() => finishExam(examQuestions, selectedAnswers, elapsedSeconds)}
                className="btn-primary-glass rounded-full px-6 py-2.5 text-xs sm:text-sm font-bold cursor-pointer whitespace-nowrap"
              >
                ثبت نهایی و مشاهده کارنامه
              </button>
            )}
          </div>
        </section>
      </div>
    );
  }

  // Results Phase
  const evaluation = evaluateExam(examQuestions, selectedAnswers);
  const wrongItems = examQuestions.filter((q) =>
    evaluation.wrongQuestionIds.includes(q.id)
  );

  return (
    <div className="space-y-6" data-testid="exam-results">
      <section className="glass-card-strong p-6 sm:p-8 text-center space-y-5">
        <div
          className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full ${
            evaluation.passed
              ? 'bg-[var(--ok-tint)] text-[var(--ok)]'
              : 'bg-[var(--peach-tint)] text-[var(--peach)]'
          }`}
        >
          {evaluation.passed ? (
            <CheckCircle2 className="h-8 w-8" />
          ) : (
            <AlertCircle className="h-8 w-8" />
          )}
        </div>

        <div className="space-y-1.5">
          <p
            className={`text-xs font-bold ${
              evaluation.passed ? 'text-[var(--ok-ink)]' : 'text-[var(--peach-ink)]'
            }`}
          >
            {evaluation.passed ? 'نتیجه: قبول شدید' : 'نتیجه: نیاز به تمرین بیشتر'}
          </p>
          <h2 className="text-3xl font-extrabold text-[var(--ink-strong)] tabular-nums">
            نمره شما: {toPersianDigits(evaluation.scorePercent)}٪
          </h2>
          <div className="flex flex-wrap items-center justify-center gap-2 text-sm text-[var(--muted)] tabular-nums">
            <span>
              {toPersianDigits(evaluation.correctCount)} صحیح از{' '}
              {toPersianDigits(evaluation.totalQuestions)} سوال
            </span>
            <span aria-hidden="true">·</span>
            <span>
              مدت زمان {formatDurationPersian(lastAttempt?.durationSeconds ?? elapsedSeconds)}
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-semibold text-[var(--blue-ink)]">
              کسب {toPersianDigits(evaluation.xpEarned)} امتیاز
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          <button
            type="button"
            onClick={() => startExam()}
            className="btn-secondary-glass inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold cursor-pointer whitespace-nowrap"
          >
            <RotateCcw className="h-4 w-4" />
            <span>آزمون مجدد</span>
          </button>

          {wrongItems.length > 0 && (
            <>
              <button
                type="button"
                onClick={() => startExam(wrongItems)}
                className="btn-primary-glass rounded-full px-5 py-2.5 text-sm font-semibold cursor-pointer whitespace-nowrap"
              >
                آزمون فقط از غلط‌ها ({toPersianDigits(wrongItems.length)})
              </button>
              <button
                type="button"
                onClick={onGoToReview}
                className="btn-secondary-glass rounded-full px-5 py-2.5 text-sm font-semibold cursor-pointer whitespace-nowrap"
              >
                رفتن به صف مرور
              </button>
            </>
          )}
        </div>
      </section>

      {/* Detailed Answer Breakdown */}
      <section className="glass-card p-5 sm:p-7 space-y-4">
        <h3 className="text-base font-bold text-[var(--ink-strong)]">تشریح پاسخ‌های آزمون</h3>
        <div className="space-y-4">
          {examQuestions.map((q, idx) => {
            const chosen = selectedAnswers[q.id];
            const isCorrect = chosen === q.correctOptionIndex;
            return (
              <div
                key={q.id}
                className="rounded-2xl border border-[var(--line)] bg-[var(--sunk)] p-4 sm:p-5 space-y-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm sm:text-base font-bold text-[var(--ink-strong)] leading-relaxed">
                    <span className="tabular-nums text-[var(--muted)] ml-1.5">
                      {toPersianDigits(idx + 1)}.
                    </span>
                    {q.question}
                  </p>
                  <span
                    className={`inline-flex items-center gap-1 text-xs font-bold shrink-0 ${
                      isCorrect ? 'text-[var(--ok-ink)]' : 'text-[var(--danger)]'
                    }`}
                  >
                    {isCorrect ? (
                      <>
                        <CheckCircle2 className="h-4 w-4" />
                        <span>صحیح</span>
                      </>
                    ) : (
                      <>
                        <XCircle className="h-4 w-4" />
                        <span>نادرست</span>
                      </>
                    )}
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-1.5 text-xs sm:text-sm">
                  <p className="text-[var(--muted)]">
                    انتخاب شما:{' '}
                    <span className="font-semibold text-[var(--ink)]">
                      {chosen !== undefined
                        ? `${getOptionLetter(chosen)}) ${q.options[chosen]}`
                        : 'پاسخ داده نشده'}
                    </span>
                  </p>
                  <p className="text-[var(--ok-ink)]">
                    پاسخ صحیح:{' '}
                    <span className="font-bold">
                      {getOptionLetter(q.correctOptionIndex)}) {q.options[q.correctOptionIndex]}
                    </span>
                  </p>
                </div>

                <div className="rounded-xl bg-[var(--glass)] p-3 text-xs sm:text-sm leading-7 text-[var(--ink-2)]">
                  <strong className="font-bold text-[var(--blue-ink)] ml-1.5">دلیل:</strong>
                  <span>{q.answer}</span>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
