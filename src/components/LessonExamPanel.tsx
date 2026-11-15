import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  BookOpenCheck,
  Check,
  CheckCircle2,
  Clock,
  Eye,
  EyeOff,
  FileQuestion,
  GraduationCap,
  Layers,
  Plus,
  RotateCcw,
  XCircle,
} from 'lucide-react';
import type {
  ExamAttempt,
  Lesson,
  LessonChapter,
  LessonQuestion,
} from '../types/learning';
import {
  evaluateExam,
  formatDurationPersian,
  getOptionLetter,
  getQuestionType,
  toPersianDigits,
} from '../utils/studyEngine';

interface LessonExamPanelProps {
  lesson: Lesson;
  chapters: LessonChapter[];
  selectedChapterId: string | 'all';
  onSelectChapterId: (chapterId: string | 'all') => void;
  onRecordExam: (attempt: ExamAttempt) => void;
  onAddQuestionForLesson: (lessonId: string, chapterId?: string) => void;
}

type PanelMode = 'bank' | 'exam';
type ExamPhase = 'setup' | 'running' | 'results';
type QuestionTypeFilter = 'all' | 'mcq' | 'descriptive';

export function LessonExamPanel({
  lesson,
  chapters,
  selectedChapterId,
  onSelectChapterId,
  onRecordExam,
  onAddQuestionForLesson,
}: LessonExamPanelProps) {
  const [panelMode, setPanelMode] = useState<PanelMode>('bank');
  const [typeFilter, setTypeFilter] = useState<QuestionTypeFilter>('all');
  const [revealedBankIds, setRevealedBankIds] = useState<Record<string, boolean>>({});
  const [bankAnswerMode, setBankAnswerMode] = useState<'options' | 'single'>('options');
  const [bankSelected, setBankSelected] = useState<Record<string, number>>({});

  // Interactive Exam State
  const [examPhase, setExamPhase] = useState<ExamPhase>('setup');
  const [timerMinutes, setTimerMinutes] = useState<number>(0);
  const [examQuestions, setExamQuestions] = useState<LessonQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, number>>({});
  const [descriptiveTexts, setDescriptiveTexts] = useState<Record<string, string>>({});
  const [descriptiveRevealed, setDescriptiveRevealed] = useState<Record<string, boolean>>({});
  const [descriptiveSelfGrades, setDescriptiveSelfGrades] = useState<Record<string, boolean>>({});
  const [secondsLeft, setSecondsLeft] = useState<number>(0);
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const [lastAttempt, setLastAttempt] = useState<ExamAttempt | null>(null);

  // Reset exam session cleanly when switching lessons
  useEffect(() => {
    setPanelMode('bank');
    setTypeFilter('all');
    setRevealedBankIds({});
    setBankSelected({});
    setExamPhase('setup');
    setExamQuestions([]);
    setSelectedAnswers({});
    setDescriptiveTexts({});
    setDescriptiveRevealed({});
    setDescriptiveSelfGrades({});
    setCurrentIndex(0);
    setLastAttempt(null);
  }, [lesson.id]);

  // Deduplicated pool of questions preserving chapter association
  const allLessonQuestions = useMemo(() => {
    if (chapters.length > 0) {
      const fromChapters = chapters.flatMap((ch) =>
        ch.questions.map((q) => ({
          ...q,
          chapterId: q.chapterId || ch.id,
          chapterTitle: q.chapterTitle || ch.title,
        }))
      );
      const seenIds = new Set(fromChapters.map((q) => q.id));
      const extras = lesson.questions.filter((q) => !seenIds.has(q.id));
      return [...fromChapters, ...extras];
    }
    return lesson.questions;
  }, [chapters, lesson.questions]);

  const chapterScopedQuestions = useMemo(() => {
    if (selectedChapterId === 'all' || chapters.length <= 1) {
      return allLessonQuestions;
    }
    return allLessonQuestions.filter((q) => q.chapterId === selectedChapterId);
  }, [allLessonQuestions, chapters.length, selectedChapterId]);

  const filteredQuestions = useMemo(() => {
    if (typeFilter === 'all') return chapterScopedQuestions;
    return chapterScopedQuestions.filter((q) => getQuestionType(q) === typeFilter);
  }, [chapterScopedQuestions, typeFilter]);

  const questionTypeCounts = useMemo(() => {
    let mcq = 0;
    let descriptive = 0;
    for (const q of chapterScopedQuestions) {
      if (getQuestionType(q) === 'descriptive') descriptive += 1;
      else mcq += 1;
    }
    return { mcq, descriptive, total: chapterScopedQuestions.length };
  }, [chapterScopedQuestions]);

  // Group questions by chapter when viewing "همه فصل‌ها"
  const groupedByChapter = useMemo(() => {
    if (chapters.length <= 1 || selectedChapterId !== 'all') {
      return null;
    }
    const groups: { id: string; title: string; questions: LessonQuestion[] }[] = [];
    const mappedIds = new Set<string>();

    for (const ch of chapters) {
      const items = filteredQuestions.filter((q) => q.chapterId === ch.id);
      for (const item of items) mappedIds.add(item.id);
      if (items.length > 0) {
        groups.push({ id: ch.id, title: ch.title, questions: items });
      }
    }

    const ungrouped = filteredQuestions.filter((q) => !mappedIds.has(q.id));
    if (ungrouped.length > 0) {
      groups.push({ id: 'general', title: 'سوالات عمومی درس', questions: ungrouped });
    }
    return groups;
  }, [chapters, selectedChapterId, filteredQuestions]);

  const allRevealedInView =
    filteredQuestions.length > 0 &&
    filteredQuestions.every((q) => Boolean(revealedBankIds[q.id]));

  const toggleRevealAll = () => {
    if (allRevealedInView) {
      setRevealedBankIds({});
    } else {
      const next: Record<string, boolean> = {};
      for (const q of filteredQuestions) next[q.id] = true;
      setRevealedBankIds(next);
    }
  };

  const finishExam = useCallback(
    (
      questionsToGrade: LessonQuestion[],
      mcqAnswers: Record<string, number>,
      descGrades: Record<string, boolean>,
      spent: number
    ) => {
      const evaluation = evaluateExam(questionsToGrade, mcqAnswers, descGrades);
      const selectedChapterObj =
        selectedChapterId !== 'all'
          ? chapters.find((c) => c.id === selectedChapterId)
          : undefined;
      const attemptTitle = selectedChapterObj
        ? `${lesson.title} — ${selectedChapterObj.title}`
        : lesson.title;

      const attempt: ExamAttempt = {
        id: `exam-${Date.now()}`,
        lessonId: lesson.id,
        lessonTitle: attemptTitle,
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
      setExamPhase('results');
    },
    [chapters, lesson.id, lesson.title, onRecordExam, selectedChapterId]
  );

  // Exam timer tick
  useEffect(() => {
    if (panelMode !== 'exam' || examPhase !== 'running') return;
    const interval = window.setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
      if (timerMinutes > 0) {
        setSecondsLeft((prev) => {
          if (prev <= 1) {
            window.clearInterval(interval);
            finishExam(
              examQuestions,
              selectedAnswers,
              descriptiveSelfGrades,
              timerMinutes * 60
            );
            return 0;
          }
          return prev - 1;
        });
      }
    }, 1000);
    return () => window.clearInterval(interval);
  }, [
    panelMode,
    examPhase,
    timerMinutes,
    examQuestions,
    selectedAnswers,
    descriptiveSelfGrades,
    finishExam,
  ]);

  // Keyboard shortcuts 1-4 for MCQ during running exam
  useEffect(() => {
    if (panelMode !== 'exam' || examPhase !== 'running') return;
    const currentQ = examQuestions[currentIndex];
    if (!currentQ || getQuestionType(currentQ) !== 'mcq') return;

    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'TEXTAREA' || tag === 'INPUT') return;
      if (selectedAnswers[currentQ.id] !== undefined) return;
      const index = ['1', '2', '3', '4'].indexOf(e.key);
      if (index !== -1 && index < currentQ.options.length) {
        setSelectedAnswers((prev) => ({ ...prev, [currentQ.id]: index }));
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [panelMode, examPhase, examQuestions, currentIndex, selectedAnswers]);

  const startExam = (customPool?: LessonQuestion[]) => {
    const pool = customPool ?? filteredQuestions;
    if (pool.length === 0) return;
    setExamQuestions(pool);
    setSelectedAnswers({});
    setDescriptiveTexts({});
    setDescriptiveRevealed({});
    setDescriptiveSelfGrades({});
    setCurrentIndex(0);
    setElapsedSeconds(0);
    setSecondsLeft(timerMinutes * 60);
    setLastAttempt(null);
    setPanelMode('exam');
    setExamPhase('running');
  };

  const renderBankQuestionCard = (q: LessonQuestion, displayIndex: number) => {
    const qType = getQuestionType(q);
    const isRevealed = Boolean(revealedBankIds[q.id]);

    return (
      <article
        key={q.id}
        data-testid={`bank-question-${q.id}`}
        className="rounded-[22px] border border-[var(--line)] bg-[var(--sunk)] p-4 sm:p-5 space-y-3.5"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
            <span className="font-extrabold text-[var(--blue-ink)] tabular-nums">
              سوال {toPersianDigits(displayIndex + 1)}
            </span>
            <span aria-hidden="true">·</span>
            <span
              className={`font-bold ${
                qType === 'descriptive'
                  ? 'text-[var(--purple-ink)]'
                  : 'text-[var(--ink-2)]'
              }`}
            >
              {qType === 'descriptive' ? 'سوال تشریحی' : 'سوال تستی'}
            </span>
            {q.chapterTitle && selectedChapterId === 'all' && chapters.length <= 1 && (
              <>
                <span aria-hidden="true">·</span>
                <span>{q.chapterTitle}</span>
              </>
            )}
          </div>

          <button
            type="button"
            onClick={() =>
              setRevealedBankIds((prev) => ({ ...prev, [q.id]: !prev[q.id] }))
            }
            className="btn-secondary-glass inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold cursor-pointer whitespace-nowrap"
          >
            {isRevealed ? (
              <>
                <EyeOff className="h-3.5 w-3.5" />
                <span>پنهان کردن پاسخ</span>
              </>
            ) : (
              <>
                <Eye className="h-3.5 w-3.5" />
                <span>نمایش پاسخ درست</span>
              </>
            )}
          </button>
        </div>

        <p className="text-[15px] sm:text-base font-bold text-[var(--ink-strong)] leading-7">
          {q.question}
        </p>

        {q.codeSnippet && (
          <pre
            dir="ltr"
            className="overflow-x-auto rounded-xl bg-[var(--code-bg)] p-3.5 text-xs leading-6 text-[var(--code-ink)] font-mono-code"
          >
            <code>{q.codeSnippet}</code>
          </pre>
        )}

        {qType === 'mcq' && q.options.length > 0 && bankAnswerMode === 'options' && (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {q.options.map((opt, optIdx) => {
              const isCorrectOpt = optIdx === q.correctOptionIndex;
              const picked = bankSelected[q.id];
              const answered = picked !== undefined;
              const showState = isRevealed || answered;
              const isPicked = picked === optIdx;

              return (
                <button
                  key={optIdx}
                  type="button"
                  onClick={() =>
                    setBankSelected((prev) =>
                      prev[q.id] === undefined ? { ...prev, [q.id]: optIdx } : prev
                    )
                  }
                  disabled={answered}
                  className={`flex items-start gap-2 rounded-xl border px-3 py-2 text-right text-xs sm:text-sm leading-6 transition-colors ${
                    showState && isCorrectOpt
                      ? 'border-[var(--ok)] bg-[var(--ok-tint)] text-[var(--ink-strong)] font-semibold'
                      : showState && isPicked
                        ? 'border-[var(--danger)] bg-[var(--danger-tint)] text-[var(--ink-strong)] font-semibold'
                        : answered
                          ? 'border-[var(--line)] bg-[var(--glass)] text-[var(--muted)] opacity-65'
                          : 'border-[var(--line)] bg-[var(--glass)] text-[var(--ink)] hover:bg-[var(--glass-strong)] hover:border-[var(--line-2)] cursor-pointer'
                  }`}
                >
                  <span className="font-bold text-[var(--blue-ink)] shrink-0">
                    {getOptionLetter(optIdx)})
                  </span>
                  <span>{opt}</span>
                </button>
              );
            })}
          </div>
        )}

        {isRevealed && (
          <div
            data-testid={`bank-answer-${q.id}`}
            className="rounded-2xl border border-[var(--ok)] bg-[var(--ok-tint)] p-3.5 sm:p-4 space-y-1.5 text-xs sm:text-sm leading-7"
          >
            {qType === 'mcq' ? (
              <>
                <p className="font-extrabold text-[var(--ok-ink)]">
                  پاسخ صحیح: {getOptionLetter(q.correctOptionIndex)}){' '}
                  {q.options[q.correctOptionIndex] ?? ''}
                </p>
                <p className="text-[var(--ink-strong)]">
                  <strong className="font-bold text-[var(--blue-ink)] ml-1.5">دلیل:</strong>
                  <span className="whitespace-pre-line">{q.answer}</span>
                </p>
              </>
            ) : (
              <>
                <p className="font-extrabold text-[var(--ok-ink)]">
                  پاسخ درست سوال تشریحی:
                </p>
                <p className="text-[var(--ink-strong)] whitespace-pre-line">{q.answer}</p>
              </>
            )}
          </div>
        )}
      </article>
    );
  };

  // Running Exam UI
  if (panelMode === 'exam' && examPhase === 'running' && examQuestions.length > 0) {
    const currentQ = examQuestions[currentIndex];
    const currentType = getQuestionType(currentQ);
    const chosenOption = selectedAnswers[currentQ.id];
    const isMcqAnswered = currentType === 'mcq' && chosenOption !== undefined;
    const isMcqCorrect = isMcqAnswered && chosenOption === currentQ.correctOptionIndex;

    const isDescRevealed = Boolean(descriptiveRevealed[currentQ.id]);
    const descGrade = descriptiveSelfGrades[currentQ.id];
    const answeredCount = examQuestions.reduce((acc, q) => {
      if (getQuestionType(q) === 'descriptive') {
        return descriptiveSelfGrades[q.id] !== undefined ? acc + 1 : acc;
      }
      return selectedAnswers[q.id] !== undefined ? acc + 1 : acc;
    }, 0);

    return (
      <div className="space-y-4" data-testid="lesson-exam-running">
        {/* Top Exam Status Bar */}
        <section className="glass-card px-5 py-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 text-sm font-semibold text-[var(--ink-strong)] tabular-nums">
            <span>
              سوال {toPersianDigits(currentIndex + 1)} از{' '}
              {toPersianDigits(examQuestions.length)}
            </span>
            <span className="text-xs font-normal text-[var(--muted)]">
              ({toPersianDigits(answeredCount)} ارزیابی‌شده)
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {timerMinutes > 0 && (
              <div className="inline-flex items-center gap-1.5 rounded-full bg-[var(--blue-tint)] px-3.5 py-1.5 text-xs font-bold text-[var(--blue-ink)] tabular-nums">
                <Clock className="h-3.5 w-3.5" />
                <span>{formatDurationPersian(secondsLeft)}</span>
              </div>
            )}
            <button
              type="button"
              onClick={() => setExamPhase('setup')}
              className="btn-secondary-glass rounded-full px-4 py-2 text-xs font-semibold cursor-pointer whitespace-nowrap"
            >
              انصراف
            </button>
            <button
              type="button"
              onClick={() =>
                finishExam(
                  examQuestions,
                  selectedAnswers,
                  descriptiveSelfGrades,
                  elapsedSeconds
                )
              }
              className="btn-primary-glass rounded-full px-5 py-2 text-xs font-bold cursor-pointer whitespace-nowrap"
            >
              پایان و ثبت آزمون
            </button>
          </div>
        </section>

        {/* Question Stepper */}
        <div className="flex flex-wrap items-center gap-2">
          {examQuestions.map((q, idx) => {
            const isCurrent = idx === currentIndex;
            const qType = getQuestionType(q);
            const qAnswered =
              qType === 'descriptive'
                ? descriptiveSelfGrades[q.id] !== undefined
                : selectedAnswers[q.id] !== undefined;
            const qCorrect =
              qType === 'descriptive'
                ? descriptiveSelfGrades[q.id] === true
                : selectedAnswers[q.id] === q.correctOptionIndex;

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
        <section className="glass-card-strong p-5 sm:p-8 space-y-6">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
              <span className="font-bold text-[var(--blue-ink)]">
                {currentType === 'descriptive' ? 'سوال تشریحی' : 'سوال تستی'}
              </span>
              {currentQ.chapterTitle && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>{currentQ.chapterTitle}</span>
                </>
              )}
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

          {currentType === 'mcq' ? (
            <>
              <div className="space-y-2.5" role="radiogroup" aria-label="گزینه‌های پاسخ">
                {currentQ.options.map((opt, idx) => {
                  const isSelected = chosenOption === idx;
                  const isCorrectOpt = idx === currentQ.correctOptionIndex;
                  const optionLetter = getOptionLetter(idx);

                  let containerStyle =
                    'border-[var(--line-2)] bg-[var(--sunk)] text-[var(--ink)] hover:bg-[var(--glass-strong)] cursor-pointer';
                  let badgeStyle = 'bg-[var(--sunk-2)] text-[var(--muted)]';

                  if (isMcqAnswered) {
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
                  }

                  return (
                    <button
                      key={idx}
                      type="button"
                      role="radio"
                      aria-checked={isSelected}
                      disabled={isMcqAnswered}
                      onClick={() =>
                        setSelectedAnswers((prev) =>
                          prev[currentQ.id] === undefined
                            ? { ...prev, [currentQ.id]: idx }
                            : prev
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

                      {isMcqAnswered && isCorrectOpt && (
                        <CheckCircle2 className="h-5 w-5 shrink-0 text-[var(--ok)]" />
                      )}
                      {isMcqAnswered && isSelected && !isCorrectOpt && (
                        <XCircle className="h-5 w-5 shrink-0 text-[var(--danger)]" />
                      )}
                    </button>
                  );
                })}
              </div>

              {isMcqAnswered && (
                <div
                  data-testid="exam-immediate-feedback"
                  role="status"
                  className={`rounded-2xl border p-4 sm:p-5 space-y-2.5 ${
                    isMcqCorrect
                      ? 'border-[var(--ok)] bg-[var(--ok-tint)]'
                      : 'border-[var(--danger)] bg-[var(--danger-tint)]'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span
                      className={`inline-flex items-center gap-1.5 text-sm font-extrabold ${
                        isMcqCorrect ? 'text-[var(--ok-ink)]' : 'text-[var(--danger)]'
                      }`}
                    >
                      {isMcqCorrect ? (
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
                    <strong className="font-bold text-[var(--blue-ink)] ml-1.5">
                      دلیل:
                    </strong>
                    <span>{currentQ.answer}</span>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label
                  htmlFor="descriptive-exam-textarea"
                  className="block text-xs font-semibold text-[var(--muted)]"
                >
                  پاسخ تشریحی خود را بنویسید (یا پس از مرور ذهنی، پاسخ درست را ببینید):
                </label>
                <textarea
                  id="descriptive-exam-textarea"
                  data-testid="descriptive-user-answer"
                  rows={4}
                  value={descriptiveTexts[currentQ.id] ?? ''}
                  onChange={(e) =>
                    setDescriptiveTexts((prev) => ({
                      ...prev,
                      [currentQ.id]: e.target.value,
                    }))
                  }
                  placeholder="پاسخ خود را اینجا بنویسید تا با پاسخ درست مقایسه کنید..."
                  className="glass-field w-full p-3.5 text-sm leading-7"
                />
              </div>

              {!isDescRevealed ? (
                <div className="flex justify-end">
                  <button
                    type="button"
                    data-testid="reveal-descriptive-answer-btn"
                    onClick={() =>
                      setDescriptiveRevealed((prev) => ({
                        ...prev,
                        [currentQ.id]: true,
                      }))
                    }
                    className="btn-primary-glass inline-flex items-center gap-1.5 rounded-full px-5 py-2.5 text-xs sm:text-sm font-bold cursor-pointer whitespace-nowrap"
                  >
                    <Eye className="h-4 w-4" />
                    <span>ثبت و مشاهده پاسخ درست</span>
                  </button>
                </div>
              ) : (
                <div
                  data-testid="descriptive-model-answer"
                  className="rounded-2xl border border-[var(--blue)] bg-[var(--blue-tint)] p-4 sm:p-5 space-y-4"
                >
                  <div className="space-y-1.5">
                    <p className="text-xs sm:text-sm font-extrabold text-[var(--blue-ink)]">
                      پاسخ درست سوال تشریحی:
                    </p>
                    <p className="rounded-xl bg-[var(--glass-strong)] p-3.5 text-sm leading-8 text-[var(--ink-strong)] whitespace-pre-line">
                      {currentQ.answer}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line)] pt-3">
                    <span className="text-xs font-semibold text-[var(--ink-2)]">
                      پاسخ خودتان را با جواب درست مقایسه کنید:
                    </span>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        data-testid="self-grade-correct-btn"
                        onClick={() =>
                          setDescriptiveSelfGrades((prev) => ({
                            ...prev,
                            [currentQ.id]: true,
                          }))
                        }
                        className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-bold cursor-pointer whitespace-nowrap transition-all border ${
                          descGrade === true
                            ? 'bg-[var(--ok)] text-white border-transparent'
                            : 'bg-[var(--glass-strong)] text-[var(--ok-ink)] border-[var(--ok)]/40 hover:bg-[var(--ok-tint)]'
                        }`}
                      >
                        <Check className="h-3.5 w-3.5" />
                        <span>پاسخ من درست بود</span>
                      </button>
                      <button
                        type="button"
                        data-testid="self-grade-wrong-btn"
                        onClick={() =>
                          setDescriptiveSelfGrades((prev) => ({
                            ...prev,
                            [currentQ.id]: false,
                          }))
                        }
                        className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-bold cursor-pointer whitespace-nowrap transition-all border ${
                          descGrade === false
                            ? 'bg-[var(--danger)] text-white border-transparent'
                            : 'bg-[var(--glass-strong)] text-[var(--danger)] border-[var(--danger)]/40 hover:bg-[var(--danger-tint)]'
                        }`}
                      >
                        <XCircle className="h-3.5 w-3.5" />
                        <span>نیاز به مرور بیشتر</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}
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
                onClick={() =>
                  finishExam(
                    examQuestions,
                    selectedAnswers,
                    descriptiveSelfGrades,
                    elapsedSeconds
                  )
                }
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

  // Exam Results View
  if (panelMode === 'exam' && examPhase === 'results') {
    const evaluation = evaluateExam(
      examQuestions,
      selectedAnswers,
      descriptiveSelfGrades
    );
    const wrongItems = examQuestions.filter((q) =>
      evaluation.wrongQuestionIds.includes(q.id)
    );

    return (
      <div className="space-y-5" data-testid="lesson-exam-results">
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
              {evaluation.passed ? 'نتیجه: تسلط مطلوب' : 'نتیجه: نیاز به مرور بیشتر'}
            </p>
            <h2 className="text-3xl font-extrabold text-[var(--ink-strong)] tabular-nums">
              نمره شما: {toPersianDigits(evaluation.scorePercent)}٪
            </h2>
            <div className="flex flex-wrap items-center justify-center gap-2 text-sm text-[var(--muted)] tabular-nums">
              <span>
                {toPersianDigits(evaluation.correctCount)} پاسخ درست از{' '}
                {toPersianDigits(evaluation.totalQuestions)} سوال
              </span>
              <span aria-hidden="true">·</span>
              <span>
                مدت {formatDurationPersian(lastAttempt?.durationSeconds ?? elapsedSeconds)}
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-semibold text-[var(--blue-ink)]">
                +{toPersianDigits(evaluation.xpEarned)} امتیاز
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2.5 pt-2">
            <button
              type="button"
              onClick={() => startExam(examQuestions)}
              className="btn-secondary-glass inline-flex items-center gap-1.5 rounded-full px-5 py-2.5 text-xs sm:text-sm font-semibold cursor-pointer whitespace-nowrap"
            >
              <RotateCcw className="h-4 w-4" />
              <span>آزمون مجدد</span>
            </button>

            {wrongItems.length > 0 && (
              <button
                type="button"
                onClick={() => startExam(wrongItems)}
                className="btn-primary-glass rounded-full px-5 py-2.5 text-xs sm:text-sm font-semibold cursor-pointer whitespace-nowrap"
              >
                مرور و آزمون مجدد غلط‌ها ({toPersianDigits(wrongItems.length)})
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                setExamPhase('setup');
                setPanelMode('bank');
              }}
              className="btn-secondary-glass rounded-full px-5 py-2.5 text-xs sm:text-sm font-semibold cursor-pointer whitespace-nowrap"
            >
              بازگشت به بانک فصلی
            </button>
          </div>
        </section>

        <section className="glass-card p-5 sm:p-7 space-y-4">
          <h3 className="text-base font-bold text-[var(--ink-strong)]">
            تشریح کامل پاسخ‌ها
          </h3>
          <div className="space-y-3.5">
            {examQuestions.map((q, idx) => {
              const qType = getQuestionType(q);
              const isCorrect =
                qType === 'descriptive'
                  ? descriptiveSelfGrades[q.id] === true
                  : selectedAnswers[q.id] === q.correctOptionIndex;

              return (
                <div
                  key={q.id}
                  className="rounded-2xl border border-[var(--line)] bg-[var(--sunk)] p-4 sm:p-5 space-y-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <span className="text-xs font-bold text-[var(--blue-ink)]">
                        {qType === 'descriptive' ? 'تشریحی' : 'تستی'}
                        {q.chapterTitle ? ` · ${q.chapterTitle}` : ''}
                      </span>
                      <p className="text-sm sm:text-base font-bold text-[var(--ink-strong)] leading-relaxed">
                        <span className="tabular-nums text-[var(--muted)] ml-1.5">
                          {toPersianDigits(idx + 1)}.
                        </span>
                        {q.question}
                      </p>
                    </div>

                    <span
                      className={`inline-flex items-center gap-1 text-xs font-bold shrink-0 ${
                        isCorrect ? 'text-[var(--ok-ink)]' : 'text-[var(--danger)]'
                      }`}
                    >
                      {isCorrect ? (
                        <>
                          <CheckCircle2 className="h-4 w-4" />
                          <span>درست</span>
                        </>
                      ) : (
                        <>
                          <XCircle className="h-4 w-4" />
                          <span>نیاز به مرور</span>
                        </>
                      )}
                    </span>
                  </div>

                  {qType === 'mcq' ? (
                    <div className="space-y-1.5 text-xs sm:text-sm">
                      <p className="text-[var(--muted)]">
                        انتخاب شما:{' '}
                        <span className="font-semibold text-[var(--ink)]">
                          {selectedAnswers[q.id] !== undefined
                            ? `${getOptionLetter(selectedAnswers[q.id])}) ${q.options[selectedAnswers[q.id]] ?? ''}`
                            : 'پاسخ داده نشده'}
                        </span>
                      </p>
                      <p className="text-[var(--ok-ink)] font-bold">
                        پاسخ صحیح: {getOptionLetter(q.correctOptionIndex)}){' '}
                        {q.options[q.correctOptionIndex] ?? ''}
                      </p>
                      <div className="rounded-xl bg-[var(--glass)] p-3 text-xs sm:text-sm leading-7 text-[var(--ink-2)]">
                        <strong className="font-bold text-[var(--blue-ink)] ml-1.5">
                          دلیل:
                        </strong>
                        <span>{q.answer}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2 text-xs sm:text-sm">
                      {descriptiveTexts[q.id]?.trim() && (
                        <div className="rounded-xl bg-[var(--glass)] p-3 text-[var(--ink)] leading-7">
                          <strong className="font-bold text-[var(--muted)] ml-1.5">
                            پاسخ شما:
                          </strong>
                          <span className="whitespace-pre-line">
                            {descriptiveTexts[q.id]}
                          </span>
                        </div>
                      )}
                      <div className="rounded-xl bg-[var(--ok-tint)] p-3 text-[var(--ink-strong)] leading-7">
                        <strong className="font-bold text-[var(--ok-ink)] ml-1.5">
                          پاسخ درست سوال تشریحی:
                        </strong>
                        <span className="whitespace-pre-line">{q.answer}</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      </div>
    );
  }

  return (
    <section className="glass-card-strong p-5 sm:p-7 space-y-6" data-testid="lesson-exam-panel">
      {/* Header + Sub-mode Switcher + Quick Add CTA */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] pb-4">
        <div className="space-y-1">
          <h2 className="text-lg sm:text-xl font-extrabold text-[var(--ink-strong)]">
            آزمون و بانک سوالات فصلی
          </h2>
          <p className="text-xs sm:text-sm text-[var(--muted)] tabular-nums">
            {toPersianDigits(questionTypeCounts.total)} سوال در{' '}
            {selectedChapterId === 'all' ? 'کل درس' : 'این فصل'} (
            {toPersianDigits(questionTypeCounts.mcq)} تستی ·{' '}
            {toPersianDigits(questionTypeCounts.descriptive)} تشریحی)
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div
            role="tablist"
            aria-label="حالت نمایش سوالات درس"
            className="inline-flex items-center gap-1 rounded-2xl bg-[var(--sunk)] p-1"
          >
            <button
              type="button"
              role="tab"
              aria-selected={panelMode === 'bank'}
              onClick={() => setPanelMode('bank')}
              className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold cursor-pointer whitespace-nowrap transition-all ${
                panelMode === 'bank'
                  ? 'bg-[var(--glass-strong)] text-[var(--blue-ink)] shadow-sm'
                  : 'text-[var(--muted)] hover:text-[var(--ink)]'
              }`}
            >
              <Layers className="h-3.5 w-3.5" />
              <span>مشاهده فصلی سوالات</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={panelMode === 'exam'}
              onClick={() => {
                setPanelMode('exam');
                setExamPhase('setup');
              }}
              className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold cursor-pointer whitespace-nowrap transition-all ${
                panelMode === 'exam'
                  ? 'bg-[var(--glass-strong)] text-[var(--blue-ink)] shadow-sm'
                  : 'text-[var(--muted)] hover:text-[var(--ink)]'
              }`}
            >
              <GraduationCap className="h-3.5 w-3.5" />
              <span>حالت آزمون</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() =>
              onAddQuestionForLesson(
                lesson.id,
                selectedChapterId === 'all' ? undefined : selectedChapterId
              )
            }
            className="btn-secondary-glass inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold cursor-pointer whitespace-nowrap"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>افزودن سوال (تستی / تشریحی)</span>
          </button>
        </div>
      </div>

      {/* Chapter + Question Type Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {chapters.length > 1 ? (
          <div className="flex flex-wrap items-center gap-1.5" aria-label="فیلتر فصلی سوالات">
            <button
              type="button"
              onClick={() => onSelectChapterId('all')}
              className={`rounded-xl px-3 py-1.5 text-xs font-semibold cursor-pointer whitespace-nowrap transition-colors ${
                selectedChapterId === 'all'
                  ? 'bg-[var(--blue-tint)] text-[var(--blue-ink)]'
                  : 'bg-[var(--sunk)] text-[var(--muted)] hover:text-[var(--ink)]'
              }`}
            >
              همه فصل‌ها ({toPersianDigits(allLessonQuestions.length)})
            </button>
            {chapters.map((ch) => {
              const count = allLessonQuestions.filter((q) => q.chapterId === ch.id).length;
              return (
                <button
                  key={ch.id}
                  type="button"
                  onClick={() => onSelectChapterId(ch.id)}
                  className={`rounded-xl px-3 py-1.5 text-xs font-semibold cursor-pointer whitespace-nowrap transition-colors ${
                    selectedChapterId === ch.id
                      ? 'bg-[var(--blue-tint)] text-[var(--blue-ink)]'
                      : 'bg-[var(--sunk)] text-[var(--muted)] hover:text-[var(--ink)]'
                  }`}
                >
                  {ch.title} ({toPersianDigits(count)})
                </button>
              );
            })}
          </div>
        ) : (
          <span className="text-xs font-semibold text-[var(--muted)]">
            همه سوالات این درس
          </span>
        )}

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <div className="inline-flex items-center gap-1 rounded-xl bg-[var(--sunk)] p-1 text-xs">
            {(
              [
                { id: 'all', label: 'همه' },
                { id: 'mcq', label: 'تستی' },
                { id: 'descriptive', label: 'تشریحی' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setTypeFilter(opt.id)}
                className={`rounded-lg px-2.5 py-1 font-semibold cursor-pointer whitespace-nowrap transition-colors ${
                  typeFilter === opt.id
                    ? 'bg-[var(--glass-strong)] text-[var(--blue-ink)] shadow-sm'
                    : 'text-[var(--muted)] hover:text-[var(--ink)]'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {panelMode === 'bank' && (
            <button
              type="button"
              data-testid="toggle-bank-answer-mode"
              onClick={() => {
                setBankAnswerMode((prev) => (prev === 'options' ? 'single' : 'options'));
                setBankSelected({});
              }}
              aria-pressed={bankAnswerMode === 'single'}
              className="btn-secondary-glass inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold cursor-pointer whitespace-nowrap"
            >
              {bankAnswerMode === 'single' ? (
                <>
                  <Layers className="h-3.5 w-3.5" />
                  <span>حالت چهارگزینه‌ای</span>
                </>
              ) : (
                <>
                  <FileQuestion className="h-3.5 w-3.5" />
                  <span>حالت تک‌پاسخ</span>
                </>
              )}
            </button>
          )}

          {panelMode === 'bank' && filteredQuestions.length > 0 && (
            <button
              type="button"
              onClick={toggleRevealAll}
              className="btn-secondary-glass inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold cursor-pointer whitespace-nowrap"
            >
              {allRevealedInView ? (
                <>
                  <EyeOff className="h-3.5 w-3.5" />
                  <span>پنهان کردن همه پاسخ‌ها</span>
                </>
              ) : (
                <>
                  <Eye className="h-3.5 w-3.5" />
                  <span>نمایش همه پاسخ‌ها</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Empty State */}
      {filteredQuestions.length === 0 ? (
        <div className="rounded-[22px] bg-[var(--sunk)] p-8 text-center space-y-3">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--blue-tint)] text-[var(--blue-ink)]">
            <FileQuestion className="h-6 w-6" />
          </div>
          <div className="space-y-1">
            <p className="text-base font-bold text-[var(--ink-strong)]">
              هنوز سوالی با این فیلتر ثبت نشده است
            </p>
            <p className="text-xs sm:text-sm text-[var(--muted)] max-w-md mx-auto leading-6">
              می‌توانید سوالات تستی (چهارگزینه‌ای) یا تشریحی همراه با جواب درست برای هر فصل اضافه کنید.
            </p>
          </div>
          <button
            type="button"
            onClick={() =>
              onAddQuestionForLesson(
                lesson.id,
                selectedChapterId === 'all' ? undefined : selectedChapterId
              )
            }
            className="btn-primary-glass inline-flex items-center gap-1.5 rounded-full px-5 py-2.5 text-xs font-bold cursor-pointer whitespace-nowrap"
          >
            <Plus className="h-4 w-4" />
            <span>افزودن سوال تستی یا تشریحی</span>
          </button>
        </div>
      ) : panelMode === 'exam' ? (
        /* Exam Setup View */
        <div className="rounded-[22px] border border-[var(--line)] bg-[var(--sunk)] p-5 sm:p-6 space-y-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <h3 className="text-base sm:text-lg font-extrabold text-[var(--ink-strong)]">
                آماده شروع آزمون از{' '}
                {selectedChapterId === 'all'
                  ? 'کل درس'
                  : chapters.find((c) => c.id === selectedChapterId)?.title ?? 'این فصل'}
              </h3>
              <p className="text-xs sm:text-sm text-[var(--muted)] leading-6">
                در سوالات تستی بلافاصله پاسخ صحیح و دلیل نمایش داده می‌شود؛ در سوالات تشریحی پاسخ خود را می‌نویسید و با پاسخ درست مقایسه می‌کنید.
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <label
                htmlFor="lesson-exam-timer"
                className="text-xs font-semibold text-[var(--muted)] whitespace-nowrap"
              >
                زمان آزمون:
              </label>
              <select
                id="lesson-exam-timer"
                value={timerMinutes}
                onChange={(e) => setTimerMinutes(Number(e.target.value))}
                className="glass-field px-3 py-2 text-xs sm:text-sm font-medium"
              >
                <option value={0}>بدون محدودیت زمان</option>
                <option value={5}>۵ دقیقه</option>
                <option value={10}>۱۰ دقیقه</option>
                <option value={20}>۲۰ دقیقه</option>
              </select>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line)] pt-4">
            <span className="text-xs sm:text-sm font-semibold text-[var(--ink-2)] tabular-nums">
              تعداد سوالات انتخاب‌شده: {toPersianDigits(filteredQuestions.length)} سوال
            </span>
            <button
              type="button"
              data-testid="start-lesson-exam-btn"
              onClick={() => startExam(filteredQuestions)}
              className="btn-primary-glass inline-flex items-center gap-2 rounded-full px-6 py-2.5 text-sm font-bold cursor-pointer whitespace-nowrap"
            >
              <BookOpenCheck className="h-4 w-4" />
              <span>شروع آزمون ({toPersianDigits(filteredQuestions.length)} سوال)</span>
            </button>
          </div>
        </div>
      ) : groupedByChapter ? (
        /* Chapter-by-Chapter Grouped View */
        <div className="space-y-6">
          {groupedByChapter.map((group) => (
            <div key={group.id} className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--line)] pb-2">
                <h3 className="text-sm sm:text-base font-extrabold text-[var(--blue-ink)]">
                  {group.title}{' '}
                  <span className="text-xs font-semibold text-[var(--muted)] tabular-nums">
                    ({toPersianDigits(group.questions.length)} سوال)
                  </span>
                </h3>
                <button
                  type="button"
                  onClick={() => startExam(group.questions)}
                  className="text-xs font-bold text-[var(--blue-ink)] hover:underline cursor-pointer whitespace-nowrap"
                >
                  آزمون از همین فصل ←
                </button>
              </div>
              <div className="space-y-3">
                {group.questions.map((q, idx) => renderBankQuestionCard(q, idx))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* Single Chapter / Flat Question Bank View */
        <div className="space-y-3.5">
          {filteredQuestions.map((q, idx) => renderBankQuestionCard(q, idx))}
          <div className="flex justify-end pt-2">
            <button
              type="button"
              onClick={() => startExam(filteredQuestions)}
              className="btn-primary-glass inline-flex items-center gap-2 rounded-full px-6 py-2.5 text-xs sm:text-sm font-bold cursor-pointer whitespace-nowrap"
            >
              <BookOpenCheck className="h-4 w-4" />
              <span>شروع آزمون از این سوالات</span>
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
