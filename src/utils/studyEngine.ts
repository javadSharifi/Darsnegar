import type {
  AppSettings,
  BackupPayload,
  ClassNote,
  DifficultyLevel,
  ExamAttempt,
  GamificationStats,
  Lesson,
  LessonChapter,
  LessonQuestion,
  QuestionType,
  UserQuestionProgress,
} from '../types/learning';

export function getQuestionType(
  question: Pick<LessonQuestion, 'questionType' | 'options'>
): QuestionType {
  if (question.questionType === 'descriptive') return 'descriptive';
  if (question.questionType === 'mcq') return 'mcq';
  return (question.options?.length ?? 0) === 0 ? 'descriptive' : 'mcq';
}

const PERSIAN_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'] as const;

export const PERSIAN_OPTION_LETTERS = ['الف', 'ب', 'ج', 'د'] as const;

export function getOptionLetter(index: number): string {
  return PERSIAN_OPTION_LETTERS[index] ?? toPersianDigits(index + 1);
}

export function toPersianDigits(value: number | string): string {
  return String(value).replace(/\d/g, (digit) => PERSIAN_DIGITS[Number(digit)] ?? digit);
}

export function getLevelLabel(level: DifficultyLevel): string {
  switch (level) {
    case 'junior':
      return 'مقدماتی';
    case 'mid':
      return 'متوسط';
    case 'senior':
      return 'پیشرفته';
  }
}

export function getLocalDateKey(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function updateGamificationOnActivity(
  current: GamificationStats,
  xpDelta: number,
  todayKey: string = getLocalDateKey(),
  completedExam: boolean = false
): GamificationStats {
  let nextStreak = current.streak;

  if (!current.lastActiveDate) {
    nextStreak = 1;
  } else if (current.lastActiveDate !== todayKey) {
    const prev = new Date(`${current.lastActiveDate}T00:00:00`);
    const today = new Date(`${todayKey}T00:00:00`);
    const diffDays = Math.round((today.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24));
    nextStreak = diffDays === 1 ? current.streak + 1 : 1;
  }

  return {
    xp: Math.max(0, current.xp + xpDelta),
    streak: Math.max(1, nextStreak),
    lastActiveDate: todayKey,
    examsCompleted: current.examsCompleted + (completedExam ? 1 : 0),
  };
}

export function buildFlashcardQueue(
  questions: LessonQuestion[],
  progress: Record<string, UserQuestionProgress>,
  levelFilter: DifficultyLevel | 'all' = 'all'
): LessonQuestion[] {
  const filtered =
    levelFilter === 'all' ? questions : questions.filter((q) => q.level === levelFilter);

  const priorityRank = (id: string): number => {
    const state = progress[id]?.state ?? 'unseen';
    switch (state) {
      case 'want_to_learn':
        return 0;
      case 'unseen':
        return 1;
      case 'skip':
        return 2;
      case 'know':
        return 3;
    }
  };

  return [...filtered].sort((a, b) => priorityRank(a.id) - priorityRank(b.id));
}

export interface ExamEvaluation {
  totalQuestions: number;
  correctCount: number;
  wrongCount: number;
  unansweredCount: number;
  wrongQuestionIds: string[];
  scorePercent: number;
  passed: boolean;
  xpEarned: number;
}

export function evaluateExam(
  questions: LessonQuestion[],
  selectedAnswers: Record<string, number>,
  descriptiveSelfGrades?: Record<string, boolean>
): ExamEvaluation {
  const totalQuestions = questions.length;
  if (totalQuestions === 0) {
    return {
      totalQuestions: 0,
      correctCount: 0,
      wrongCount: 0,
      unansweredCount: 0,
      wrongQuestionIds: [],
      scorePercent: 0,
      passed: false,
      xpEarned: 0,
    };
  }

  let correctCount = 0;
  let unansweredCount = 0;
  const wrongQuestionIds: string[] = [];

  for (const question of questions) {
    if (getQuestionType(question) === 'descriptive') {
      const selfGrade = descriptiveSelfGrades?.[question.id];
      if (selfGrade === undefined) {
        unansweredCount += 1;
        wrongQuestionIds.push(question.id);
      } else if (selfGrade === true) {
        correctCount += 1;
      } else {
        wrongQuestionIds.push(question.id);
      }
      continue;
    }

    const chosen = selectedAnswers[question.id];
    if (chosen === undefined || chosen === null || chosen < 0) {
      unansweredCount += 1;
      wrongQuestionIds.push(question.id);
    } else if (chosen === question.correctOptionIndex) {
      correctCount += 1;
    } else {
      wrongQuestionIds.push(question.id);
    }
  }

  const wrongCount = totalQuestions - correctCount;
  const scorePercent = Math.round((correctCount / totalQuestions) * 100);
  const passed = scorePercent >= 60;
  const xpEarned = correctCount * 15 + (passed ? 20 : 5);

  return {
    totalQuestions,
    correctCount,
    wrongCount,
    unansweredCount,
    wrongQuestionIds,
    scorePercent,
    passed,
    xpEarned,
  };
}

export interface SearchMatch {
  type: 'lesson' | 'question';
  lessonId: string;
  lessonTitle: string;
  category: string;
  questionId?: string;
  title: string;
  snippet: string;
  level: DifficultyLevel;
}

export function searchLessonsAndQuestions(
  lessons: Lesson[],
  rawQuery: string,
  categoryFilter: string = 'all'
): SearchMatch[] {
  const query = rawQuery.trim().toLowerCase();
  const results: SearchMatch[] = [];

  for (const lesson of lessons) {
    if (categoryFilter !== 'all' && lesson.category !== categoryFilter) {
      continue;
    }

    const lessonMatches =
      query === '' ||
      lesson.title.toLowerCase().includes(query) ||
      lesson.category.toLowerCase().includes(query) ||
      (lesson.courseOverview?.toLowerCase().includes(query) ?? false) ||
      lesson.summary.toLowerCase().includes(query) ||
      lesson.content.toLowerCase().includes(query) ||
      lesson.keyPoints.some((point) => point.toLowerCase().includes(query)) ||
      (lesson.classNotes ?? []).some(
        (note) =>
          note.title.toLowerCase().includes(query) ||
          note.content.toLowerCase().includes(query)
      );

    if (lessonMatches) {
      results.push({
        type: 'lesson',
        lessonId: lesson.id,
        lessonTitle: lesson.title,
        category: lesson.category,
        title: lesson.title,
        snippet: lesson.summary,
        level: lesson.level,
      });
    }

    for (const q of lesson.questions) {
      const qMatches =
        query !== '' &&
        (q.question.toLowerCase().includes(query) ||
          q.answer.toLowerCase().includes(query) ||
          (q.codeSnippet?.toLowerCase().includes(query) ?? false));

      if (qMatches) {
        results.push({
          type: 'question',
          lessonId: lesson.id,
          lessonTitle: lesson.title,
          category: lesson.category,
          questionId: q.id,
          title: q.question,
          snippet: q.answer,
          level: q.level,
        });
      }
    }
  }

  return results;
}

export function getLessonMasteryStats(
  lesson: Lesson,
  progress: Record<string, UserQuestionProgress>
): { total: number; known: number; learning: number; percent: number } {
  const total = lesson.questions.length;
  if (total === 0) {
    return { total: 0, known: 0, learning: 0, percent: 0 };
  }

  let known = 0;
  let learning = 0;
  for (const q of lesson.questions) {
    const state = progress[q.id]?.state;
    if (state === 'know') known += 1;
    else if (state === 'want_to_learn') learning += 1;
  }

  return {
    total,
    known,
    learning,
    percent: Math.round((known / total) * 100),
  };
}

export function formatDurationPersian(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  const padded = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  return toPersianDigits(padded);
}

export interface ContentBlock {
  type: 'heading' | 'paragraph' | 'code' | 'list' | 'blockquote';
  text?: string;
  language?: string;
  items?: string[];
}

export function parseLessonContent(raw: string): ContentBlock[] {
  const lines = raw.replace(/\r\n/g, '\n').split('\n');
  const blocks: ContentBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      i += 1;
      continue;
    }

    if (trimmed.startsWith('```')) {
      const language = trimmed.slice(3).trim() || 'text';
      const codeLines: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i += 1;
      }
      blocks.push({
        type: 'code',
        language,
        text: codeLines.join('\n'),
      });
      i += 1;
      continue;
    }

    if (trimmed.startsWith('# ') || trimmed.startsWith('## ') || trimmed.startsWith('### ')) {
      blocks.push({
        type: 'heading',
        text: trimmed.replace(/^#{1,3}\s+/, ''),
      });
      i += 1;
      continue;
    }

    if (trimmed.startsWith('> ')) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('> ')) {
        quoteLines.push(lines[i].trim().slice(2).trim());
        i += 1;
      }
      blocks.push({
        type: 'blockquote',
        text: quoteLines.join('\n'),
      });
      continue;
    }

    if (trimmed.startsWith('- ') || trimmed.startsWith('* ') || trimmed.startsWith('• ')) {
      const items: string[] = [];
      while (
        i < lines.length &&
        (lines[i].trim().startsWith('- ') ||
          lines[i].trim().startsWith('* ') ||
          lines[i].trim().startsWith('• '))
      ) {
        items.push(lines[i].trim().slice(2).trim());
        i += 1;
      }
      blocks.push({ type: 'list', items });
      continue;
    }

    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !lines[i].trim().startsWith('```') &&
      !lines[i].trim().startsWith('# ') &&
      !lines[i].trim().startsWith('## ') &&
      !lines[i].trim().startsWith('### ') &&
      !lines[i].trim().startsWith('> ') &&
      !lines[i].trim().startsWith('- ') &&
      !lines[i].trim().startsWith('* ') &&
      !lines[i].trim().startsWith('• ')
    ) {
      paraLines.push(lines[i].trim());
      i += 1;
    }
    if (paraLines.length > 0) {
      blocks.push({ type: 'paragraph', text: paraLines.join(' ') });
    }
  }

  return blocks;
}

export interface LessonHeadingItem {
  id: string;
  text: string;
}

export function extractLessonHeadings(
  raw: string,
  idPrefix: string = 'lesson-sec'
): LessonHeadingItem[] {
  const blocks = parseLessonContent(raw);
  const headings: LessonHeadingItem[] = [];
  for (const block of blocks) {
    if (block.type === 'heading' && block.text?.trim()) {
      headings.push({
        id: `${idPrefix}-${headings.length}`,
        text: block.text.trim(),
      });
    }
  }
  return headings;
}

export function estimateReadingMinutes(raw: string): number {
  const plain = raw
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[#>*`\-]/g, ' ')
    .trim();
  if (!plain) return 1;
  const words = plain.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 180));
}

export function parseMarkdownFileToLessonParts(rawMarkdown: string): {
  suggestedTitle: string;
  content: string;
} {
  let text = rawMarkdown.replace(/\r\n/g, '\n').trim();
  // Strip YAML frontmatter if present
  if (text.startsWith('---\n')) {
    const endIdx = text.indexOf('\n---', 4);
    if (endIdx !== -1) {
      text = text.slice(endIdx + 4).trim();
    }
  }

  const lines = text.split('\n');
  let suggestedTitle = '';
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^#{1,2}\s+/.test(trimmed)) {
      suggestedTitle = trimmed.replace(/^#{1,2}\s+/, '').trim();
      break;
    }
  }

  return {
    suggestedTitle,
    content: text,
  };
}

export function mapOptionMarkerToIndex(rawMarker: string): number {
  const token = rawMarker.trim().toLowerCase();
  if (!token) return -1;
  if (token.startsWith('الف') || token === 'ا' || token === '1' || token === '۱' || token === 'a') {
    return 0;
  }
  if (token.startsWith('ب') || token === '2' || token === '۲' || token === 'b') {
    return 1;
  }
  if (token.startsWith('ج') || token === '3' || token === '۳' || token === 'c') {
    return 2;
  }
  if (token.startsWith('د') || token === '4' || token === '۴' || token === 'd') {
    return 3;
  }
  return -1;
}

export function parseFormattedPersianQuestions(
  rawText: string,
  defaultLevel: DifficultyLevel = 'mid'
): { ok: true; questions: LessonQuestion[] } | { ok: false; error: string } {
  const text = rawText.replace(/\r\n/g, '\n').trim();
  if (!text) {
    return { ok: false, error: 'لطفاً متن تست‌ها را وارد کنید.' };
  }

  const lines = text.split('\n');

  interface PendingQuestion {
    questionLines: string[];
    options: string[];
    correctIndex: number;
    hasAnswer: boolean;
    reasonLines: string[];
    hasReason: boolean;
    inReason: boolean;
    sawBlankAfterMeta: boolean;
  }

  const createPending = (): PendingQuestion => ({
    questionLines: [],
    options: [],
    correctIndex: 0,
    hasAnswer: false,
    reasonLines: [],
    hasReason: false,
    inReason: false,
    sawBlankAfterMeta: false,
  });

  const collected: PendingQuestion[] = [];
  let current = createPending();

  const flushCurrent = () => {
    if (current.questionLines.length > 0 || current.options.length > 0) {
      collected.push(current);
    }
    current = createPending();
  };

  const persianOptRegex = /^(?:[-*•]\s*)?(الف|ب|ج|د)\s*[).:\-–]\s*(.+)$/;
  const alphaNumOptRegex = /^(?:[-*•]\s*)?([1-4]|[۱-۴]|[a-dA-D])\s*[).:\-–]\s*(.+)$/;
  const answerRegex = /^(?:پاسخ\s*صحیح|گزینه\s*صحیح|جواب\s*صحیح|پاسخ|جواب)\s*[:：\-]?\s*(.+)$/;
  const reasonRegex = /^(?:دلیل|توضیح|تشریح|پاسخ\s*تشریحی)\s*[:：\-]?\s*(.*)$/;
  const questionHeaderRegex = /^(?:سوال\s*[۰-۹0-9]*\s*[:：\-]\s*|پرسش\s*[۰-۹0-9]*\s*[:：\-]\s*|[۰-۹0-9]+\s*[).\-–]\s+)(.+)$/;

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();

    if (!trimmed) {
      if (current.hasAnswer || current.hasReason || current.options.length >= 4) {
        current.sawBlankAfterMeta = true;
        current.inReason = false;
      }
      continue;
    }

    const answerMatch = trimmed.match(answerRegex);
    if (answerMatch) {
      current.inReason = false;
      current.hasAnswer = true;
      current.sawBlankAfterMeta = false;
      const mapped = mapOptionMarkerToIndex(answerMatch[1]);
      if (mapped !== -1) {
        current.correctIndex = mapped;
      }
      continue;
    }

    const reasonMatch = trimmed.match(reasonRegex);
    if (reasonMatch) {
      current.hasReason = true;
      current.inReason = true;
      current.sawBlankAfterMeta = false;
      const body = reasonMatch[1].trim();
      if (body) {
        current.reasonLines.push(body);
      }
      continue;
    }

    const persianOptMatch = trimmed.match(persianOptRegex);
    if (persianOptMatch) {
      if (current.hasAnswer || current.hasReason) {
        flushCurrent();
      }
      current.inReason = false;
      current.sawBlankAfterMeta = false;
      const idx = mapOptionMarkerToIndex(persianOptMatch[1]);
      const optText = persianOptMatch[2].trim();
      if (idx >= 0) {
        current.options[idx] = optText;
      } else {
        current.options.push(optText);
      }
      continue;
    }

    // Numeric / Latin option markers only count as options if we already have a question stem and haven't hit answer/reason
    const alphaNumOptMatch = trimmed.match(alphaNumOptRegex);
    if (
      alphaNumOptMatch &&
      current.questionLines.length > 0 &&
      !current.hasAnswer &&
      !current.hasReason &&
      current.options.length < 4
    ) {
      current.inReason = false;
      current.sawBlankAfterMeta = false;
      const idx = mapOptionMarkerToIndex(alphaNumOptMatch[1]);
      const optText = alphaNumOptMatch[2].trim();
      if (idx >= 0) {
        current.options[idx] = optText;
      } else {
        current.options.push(optText);
      }
      continue;
    }

    // Start of a new question after completing the previous one
    const qHeaderMatch = trimmed.match(questionHeaderRegex);
    const shouldStartNewQuestion =
      (current.options.length >= 2 && (current.hasAnswer || current.hasReason) && current.sawBlankAfterMeta) ||
      (current.options.length >= 2 && (current.hasAnswer || current.hasReason) && Boolean(qHeaderMatch)) ||
      (current.options.length >= 4 && current.sawBlankAfterMeta && !current.inReason);

    if (shouldStartNewQuestion) {
      flushCurrent();
    }

    if (current.inReason) {
      current.reasonLines.push(trimmed);
      continue;
    }

    const stemLine =
      current.questionLines.length === 0 && qHeaderMatch ? qHeaderMatch[1].trim() : trimmed;
    current.questionLines.push(stemLine);
  }

  flushCurrent();

  if (collected.length === 0) {
    return {
      ok: false,
      error: 'هیچ سوال معتبری شناسایی نشد. مطمئن شوید گزینه‌ها با «الف) ... ب) ...» نوشته شده‌اند.',
    };
  }

  const now = Date.now();
  const normalized: LessonQuestion[] = [];

  for (let i = 0; i < collected.length; i++) {
    const item = collected[i];
    const questionText = item.questionLines.join(' ').trim();
    const cleanOptions = item.options.map((opt) => (opt ?? '').trim()).filter(Boolean);

    if (!questionText) {
      return {
        ok: false,
        error: `سوال شماره ${toPersianDigits(i + 1)} فاقد متن پرسش است.`,
      };
    }

    if (cleanOptions.length < 2) {
      return {
        ok: false,
        error: `در سوال شماره ${toPersianDigits(i + 1)} حداقل دو گزینه (الف، ب، ...) لازم است.`,
      };
    }

    const correctOptionIndex =
      item.correctIndex >= 0 && item.correctIndex < cleanOptions.length ? item.correctIndex : 0;
    const reasonText = item.reasonLines.join(' ').trim();

    normalized.push({
      id: `q-txt-${now}-${i}`,
      question: questionText,
      answer: reasonText || cleanOptions[correctOptionIndex] || cleanOptions[0],
      options: cleanOptions,
      correctOptionIndex,
      level: defaultLevel,
      isCustom: true,
    });
  }

  return { ok: true, questions: normalized };
}

export function parseImportedQuestionsJson(
  rawJson: string,
  defaultLevel: DifficultyLevel = 'mid'
): { ok: true; questions: LessonQuestion[] } | { ok: false; error: string } {
  try {
    const parsed: unknown = JSON.parse(rawJson);
    if (!parsed || typeof parsed !== 'object') {
      return { ok: false, error: 'ساختار JSON سوالات معتبر نیست.' };
    }

    let rawItems: unknown[] = [];
    if (Array.isArray(parsed)) {
      rawItems = parsed;
    } else if ('questions' in parsed && Array.isArray((parsed as { questions: unknown }).questions)) {
      rawItems = (parsed as { questions: unknown[] }).questions;
    } else {
      rawItems = [parsed];
    }

    if (rawItems.length === 0) {
      return { ok: false, error: 'هیچ سوالی در JSON یافت نشد.' };
    }

    const now = Date.now();
    const normalized: LessonQuestion[] = [];

    for (let i = 0; i < rawItems.length; i++) {
      const raw = rawItems[i] as Record<string, unknown>;
      if (!raw || typeof raw !== 'object') {
        return {
          ok: false,
          error: `سوال شماره ${toPersianDigits(i + 1)} ساختار معتبری ندارد.`,
        };
      }

      const questionText = typeof raw.question === 'string' ? raw.question.trim() : '';
      if (!questionText) {
        return {
          ok: false,
          error: `سوال شماره ${toPersianDigits(i + 1)} فاقد متن پرسش (question) است.`,
        };
      }

      const optionsRaw = Array.isArray(raw.options) ? raw.options : [];
      const cleanOptions = optionsRaw.map((opt) => String(opt ?? '').trim()).filter(Boolean);

      const rawAnswer =
        typeof raw.answer === 'string' && raw.answer.trim()
          ? raw.answer.trim()
          : typeof raw.correctAnswer === 'string' && raw.correctAnswer.trim()
            ? raw.correctAnswer.trim()
            : typeof raw.modelAnswer === 'string' && raw.modelAnswer.trim()
              ? raw.modelAnswer.trim()
              : typeof raw.reason === 'string' && raw.reason.trim()
                ? raw.reason.trim()
                : typeof raw.explanation === 'string' && raw.explanation.trim()
                  ? raw.explanation.trim()
                  : '';

      const isDescriptive =
        raw.questionType === 'descriptive' ||
        raw.type === 'descriptive' ||
        (cleanOptions.length === 0 && rawAnswer.length > 0);

      const level: DifficultyLevel =
        raw.level === 'junior' || raw.level === 'mid' || raw.level === 'senior'
          ? raw.level
          : defaultLevel;

      if (isDescriptive) {
        if (!rawAnswer) {
          return {
            ok: false,
            error: `در سوال تشریحی شماره ${toPersianDigits(i + 1)} متن پاسخ درست (answer) الزامی است.`,
          };
        }

        normalized.push({
          id:
            typeof raw.id === 'string' && raw.id.trim()
              ? `${raw.id.trim()}-${now}-${i}`
              : `q-json-${now}-${i}`,
          questionType: 'descriptive',
          question: questionText,
          answer: rawAnswer,
          options: [],
          correctOptionIndex: 0,
          level,
          codeSnippet:
            typeof raw.codeSnippet === 'string' && raw.codeSnippet.trim()
              ? raw.codeSnippet.trim()
              : undefined,
          isCustom: true,
        });
        continue;
      }

      if (cleanOptions.length < 2) {
        return {
          ok: false,
          error: `در سوال شماره ${toPersianDigits(i + 1)} حداقل دو گزینه (options) لازم است یا نوع سوال را descriptive قرار دهید.`,
        };
      }

      let rawIdx = 0;
      if (typeof raw.correctOptionIndex === 'number') {
        rawIdx = raw.correctOptionIndex;
      } else if (typeof raw.correctIndex === 'number') {
        rawIdx = raw.correctIndex;
      } else if (typeof raw.correctOption === 'string') {
        const mapped = mapOptionMarkerToIndex(raw.correctOption);
        if (mapped !== -1) rawIdx = mapped;
      }

      const correctOptionIndex =
        rawIdx >= 0 && rawIdx < cleanOptions.length ? rawIdx : 0;

      const answerText = rawAnswer || cleanOptions[correctOptionIndex] || cleanOptions[0];

      normalized.push({
        id:
          typeof raw.id === 'string' && raw.id.trim()
            ? `${raw.id.trim()}-${now}-${i}`
            : `q-json-${now}-${i}`,
        questionType: 'mcq',
        question: questionText,
        answer: answerText,
        options: cleanOptions.slice(0, 4),
        correctOptionIndex,
        level,
        codeSnippet:
          typeof raw.codeSnippet === 'string' && raw.codeSnippet.trim()
            ? raw.codeSnippet.trim()
            : undefined,
        isCustom: true,
      });
    }

    return { ok: true, questions: normalized };
  } catch {
    return { ok: false, error: 'فرمت JSON قابل خواندن نیست. لطفاً نحو JSON را بررسی کنید.' };
  }
}

export function buildLessonFromChapters(params: {
  id: string;
  title: string;
  category: string;
  level?: DifficultyLevel;
  courseOverview?: string;
  chapters: LessonChapter[];
  classNotes?: ClassNote[];
  createdAt: number;
  updatedAt: number;
  isCustom?: boolean;
}): Lesson {
  const cleanChapters: LessonChapter[] = params.chapters.map((ch, idx) => {
    const chapterTitle = ch.title.trim() || `فصل ${toPersianDigits(idx + 1)}`;
    const taggedQuestions: LessonQuestion[] = ch.questions.map((q) => ({
      ...q,
      chapterId: ch.id,
      chapterTitle,
    }));
    return {
      id: ch.id,
      title: chapterTitle,
      summary: ch.summary.trim(),
      content: ch.content.trim(),
      questions: taggedQuestions,
    };
  });

  const combinedSummary =
    cleanChapters
      .map((ch) =>
        ch.summary
          ? cleanChapters.length > 1
            ? `${ch.title}: ${ch.summary}`
            : ch.summary
          : ''
      )
      .filter(Boolean)
      .join('\n\n') ||
    cleanChapters[0]?.content.slice(0, 180) ||
    '';

  const combinedContent = cleanChapters
    .map((ch) => {
      if (cleanChapters.length === 1) {
        return ch.content || ch.summary;
      }
      const body = ch.content || ch.summary;
      return `## ${ch.title}\n${body}`;
    })
    .filter(Boolean)
    .join('\n\n');

  const flattenedQuestions = cleanChapters.flatMap((ch) => ch.questions);
  const cleanOverview = params.courseOverview?.trim() || undefined;

  return {
    id: params.id,
    title: params.title.trim(),
    category: params.category.trim(),
    level: params.level ?? 'mid',
    courseOverview: cleanOverview,
    summary: combinedSummary,
    keyPoints: [],
    content: combinedContent,
    chapters: cleanChapters,
    classNotes: params.classNotes,
    questions: flattenedQuestions,
    createdAt: params.createdAt,
    updatedAt: params.updatedAt,
    isCustom: params.isCustom,
  };
}

export interface RawLessonDraft {
  title: string;
  summary: string;
  keyPoints: string[];
  content: string;
}

export function parseRawTextbookToLessonDraft(rawText: string): RawLessonDraft {
  const rawLines = rawText.replace(/\r\n/g, '\n').split('\n');
  const cleanedLines: string[] = [];

  for (const rawLine of rawLines) {
    const trimmed = rawLine.trim();
    if (!trimmed) {
      if (cleanedLines[cleanedLines.length - 1] !== '') {
        cleanedLines.push('');
      }
      continue;
    }
    // Strip standalone page headers and page transition notes from scanned textbook pastes
    if (/^صفحه\s+[۰-۹0-9]+(\s*\(.*\))?$/.test(trimmed)) continue;
    if (/^متن صفحات به ترتیب شماره صفحه/.test(trimmed)) continue;

    if (/^پاورقی(‌|‌های)?\s+صفحه/.test(trimmed)) {
      cleanedLines.push(`> ${trimmed}`);
      continue;
    }

    if (trimmed.startsWith('• ')) {
      cleanedLines.push(`- ${trimmed.slice(2).trim()}`);
      continue;
    }

    cleanedLines.push(trimmed);
  }

  const nonEmpty = cleanedLines.filter(Boolean);
  const firstLine = nonEmpty[0] ?? '';
  const inferredTitle =
    firstLine.replace(/^#{1,3}\s+/, '').slice(0, 80).trim() || 'درس جدید';

  const bodyLines = cleanedLines.map((line, index) => {
    if (!line) return '';
    if (line.startsWith('#') || line.startsWith('>') || line.startsWith('- ') || line.startsWith('```')) {
      return line;
    }
    // Promote short standalone lines (not ending with sentence punctuation) to headings
    const prevEmpty = index === 0 || cleanedLines[index - 1] === '';
    const nextLine = index < cleanedLines.length - 1 ? cleanedLines[index + 1] : '';
    const nextEmpty = nextLine === '';
    const nextIsBodyBlock = nextLine.startsWith('- ') || nextLine.startsWith('>') || nextLine.length > 55;
    if (
      prevEmpty &&
      (nextEmpty || nextIsBodyBlock) &&
      line.length <= 75 &&
      !/[.؟!؛،]$/.test(line)
    ) {
      return `## ${line}`;
    }
    return line;
  });

  const content = bodyLines.join('\n').replace(/\n{3,}/g, '\n\n').trim();

  const proseLines = nonEmpty.filter(
    (l) => !l.startsWith('>') && !l.startsWith('#') && l.length > 25
  );
  const summarySource = proseLines.slice(0, 2).join(' ');
  const summary =
    summarySource.length > 260 ? `${summarySource.slice(0, 257).trim()}...` : summarySource;

  const headingPoints = bodyLines
    .filter((l) => l.startsWith('## '))
    .map((l) => l.replace(/^##\s+/, '').trim())
    .filter((l) => l !== inferredTitle)
    .slice(0, 6);

  return {
    title: inferredTitle,
    summary,
    keyPoints: headingPoints,
    content,
  };
}

export function parseImportedLessonJson(
  rawJson: string,
  defaultCategory: string = 'روانشناسی کودک'
): { ok: true; lessons: Lesson[] } | { ok: false; error: string } {
  try {
    const parsed: unknown = JSON.parse(rawJson);
    if (!parsed || typeof parsed !== 'object') {
      return { ok: false, error: 'ساختار JSON معتبر نیست.' };
    }

    let rawItems: unknown[] = [];
    if (Array.isArray(parsed)) {
      rawItems = parsed;
    } else if ('lessons' in parsed && Array.isArray((parsed as { lessons: unknown }).lessons)) {
      rawItems = (parsed as { lessons: unknown[] }).lessons;
    } else {
      rawItems = [parsed];
    }

    if (rawItems.length === 0) {
      return { ok: false, error: 'هیچ درسی در فایل JSON پیدا نشد.' };
    }

    const now = Date.now();
    const normalized: Lesson[] = [];

    for (let i = 0; i < rawItems.length; i++) {
      const item = rawItems[i] as Partial<Lesson>;
      if (!item || typeof item !== 'object' || typeof item.title !== 'string' || !item.title.trim()) {
        return {
          ok: false,
          error: `درس شماره ${toPersianDigits(i + 1)} فاقد عنوان معتبر (title) است.`,
        };
      }

      const content = typeof item.content === 'string' ? item.content.trim() : '';
      const summary = typeof item.summary === 'string' ? item.summary.trim() : '';
      const rawChapters = Array.isArray(item.chapters) ? item.chapters : [];

      if (!content && !summary && rawChapters.length === 0) {
        return {
          ok: false,
          error: `درس «${item.title}» باید حداقل دارای متن درس (content)، خلاصه (summary) یا فصل‌ها (chapters) باشد.`,
        };
      }

      const level: DifficultyLevel =
        item.level === 'junior' || item.level === 'mid' || item.level === 'senior'
          ? item.level
          : 'mid';

      const keyPoints = Array.isArray(item.keyPoints)
        ? item.keyPoints.filter((p): p is string => typeof p === 'string' && p.trim().length > 0)
        : [];

      const mapQuestions = (
        qs: unknown[],
        prefix: string,
        chapterId?: string,
        chapterTitle?: string
      ): LessonQuestion[] =>
        qs
          .filter((q): q is LessonQuestion => {
            if (!q || typeof q !== 'object') return false;
            const candidate = q as LessonQuestion;
            if (typeof candidate.question !== 'string' || !candidate.question.trim()) return false;
            const isDesc =
              candidate.questionType === 'descriptive' ||
              (!Array.isArray(candidate.options) || candidate.options.length === 0);
            if (isDesc) {
              return typeof candidate.answer === 'string' && candidate.answer.trim().length > 0;
            }
            return Array.isArray(candidate.options) && candidate.options.length >= 2;
          })
          .map((q, qIdx) => {
            const isDesc =
              q.questionType === 'descriptive' ||
              (!Array.isArray(q.options) || q.options.length === 0);
            if (isDesc) {
              return {
                id: typeof q.id === 'string' && q.id ? q.id : `${prefix}-${qIdx}`,
                questionType: 'descriptive',
                question: q.question.trim(),
                answer: q.answer.trim(),
                options: [],
                correctOptionIndex: 0,
                level:
                  q.level === 'junior' || q.level === 'mid' || q.level === 'senior'
                    ? q.level
                    : level,
                codeSnippet: typeof q.codeSnippet === 'string' ? q.codeSnippet : undefined,
                chapterId,
                chapterTitle,
                isCustom: true,
              };
            }
            const opts = q.options.map((o) => String(o).trim());
            const correctIdx =
              typeof q.correctOptionIndex === 'number' &&
              q.correctOptionIndex >= 0 &&
              q.correctOptionIndex < opts.length
                ? q.correctOptionIndex
                : 0;
            return {
              id: typeof q.id === 'string' && q.id ? q.id : `${prefix}-${qIdx}`,
              questionType: 'mcq',
              question: q.question.trim(),
              answer:
                typeof q.answer === 'string' && q.answer.trim()
                  ? q.answer.trim()
                  : opts[correctIdx] ?? opts[0] ?? '',
              options: opts,
              correctOptionIndex: correctIdx,
              level:
                q.level === 'junior' || q.level === 'mid' || q.level === 'senior'
                  ? q.level
                  : level,
              codeSnippet: typeof q.codeSnippet === 'string' ? q.codeSnippet : undefined,
              chapterId,
              chapterTitle,
              isCustom: true,
            };
          });

      const courseOverview =
        typeof item.courseOverview === 'string' && item.courseOverview.trim()
          ? item.courseOverview.trim()
          : undefined;

      if (rawChapters.length > 0) {
        const chapters: LessonChapter[] = rawChapters.map((ch, cIdx) => {
          const chId =
            typeof ch?.id === 'string' && ch.id.trim()
              ? `${ch.id.trim()}-${now}-${cIdx}`
              : `ch-imp-${now}-${i}-${cIdx}`;
          const chTitle =
            typeof ch?.title === 'string' && ch.title.trim()
              ? ch.title.trim()
              : `فصل ${toPersianDigits(cIdx + 1)}`;
          return {
            id: chId,
            title: chTitle,
            summary: typeof ch?.summary === 'string' ? ch.summary.trim() : '',
            content: typeof ch?.content === 'string' ? ch.content.trim() : '',
            questions: Array.isArray(ch?.questions)
              ? mapQuestions(ch.questions, `q-imp-${now}-${i}-${cIdx}`, chId, chTitle)
              : [],
          };
        });

        normalized.push(
          buildLessonFromChapters({
            id:
              typeof item.id === 'string' && item.id.trim()
                ? `${item.id.trim()}-${now}-${i}`
                : `lesson-imp-${now}-${i}`,
            title: item.title.trim(),
            category:
              typeof item.category === 'string' && item.category.trim()
                ? item.category.trim()
                : defaultCategory,
            level,
            courseOverview,
            chapters,
            createdAt: typeof item.createdAt === 'number' ? item.createdAt : now,
            updatedAt: now,
            isCustom: true,
          })
        );
        continue;
      }

      const questions = Array.isArray(item.questions)
        ? mapQuestions(item.questions, `q-imp-${now}-${i}`)
        : [];

      normalized.push({
        id:
          typeof item.id === 'string' && item.id.trim()
            ? `${item.id.trim()}-${now}-${i}`
            : `lesson-imp-${now}-${i}`,
        title: item.title.trim(),
        category:
          typeof item.category === 'string' && item.category.trim()
            ? item.category.trim()
            : defaultCategory,
        level,
        courseOverview,
        summary: summary || content.slice(0, 200),
        keyPoints,
        content: content || summary,
        questions,
        createdAt: typeof item.createdAt === 'number' ? item.createdAt : now,
        updatedAt: now,
        isCustom: true,
      });
    }

    return { ok: true, lessons: normalized };
  } catch {
    return { ok: false, error: 'فرمت JSON قابل خواندن نیست. لطفاً نحو JSON را بررسی کنید.' };
  }
}

export function validateBackupPayload(data: unknown): data is BackupPayload {
  if (!data || typeof data !== 'object') return false;
  const candidate = data as Partial<BackupPayload>;
  if (!Array.isArray(candidate.lessons)) return false;
  if (!candidate.gamification || typeof candidate.gamification.xp !== 'number') return false;
  if (!candidate.progress || typeof candidate.progress !== 'object') return false;
  if (!candidate.settings || typeof candidate.settings !== 'object') return false;

  for (const lesson of candidate.lessons) {
    if (
      !lesson ||
      typeof lesson.id !== 'string' ||
      typeof lesson.title !== 'string' ||
      typeof lesson.content !== 'string' ||
      !Array.isArray(lesson.questions)
    ) {
      return false;
    }
  }

  return true;
}

export function createBackupPayload(params: {
  lessons: Lesson[];
  progress: Record<string, UserQuestionProgress>;
  gamification: GamificationStats;
  examHistory: ExamAttempt[];
  settings: AppSettings;
}): BackupPayload {
  return {
    version: 1,
    exportedAt: Date.now(),
    ...params,
  };
}

export function formatLessonForClipboard(lesson: Lesson): string {
  const sections: string[] = [];

  sections.push(`# ${lesson.title}\nموضوع: ${lesson.category}`);

  if (lesson.courseOverview && lesson.courseOverview.trim()) {
    sections.push(`## توضیحات کلی درباره درس\n${lesson.courseOverview.trim()}`);
  }

  if (lesson.chapters && lesson.chapters.length > 0) {
    for (const ch of lesson.chapters) {
      const chParts: string[] = [];
      chParts.push(`## ${ch.title}`);
      if (ch.summary.trim()) {
        chParts.push(`### خلاصه فصل\n${ch.summary.trim()}`);
      }
      if (ch.content.trim()) {
        chParts.push(ch.content.trim());
      }
      sections.push(chParts.join('\n\n'));
    }
  } else {
    if (lesson.summary.trim()) {
      sections.push(`## خلاصه درس\n${lesson.summary.trim()}`);
    }
    if (lesson.content.trim()) {
      sections.push(lesson.content.trim());
    }
  }

  if (lesson.classNotes && lesson.classNotes.length > 0) {
    const notesBlock: string[] = ['## جزوه سر کلاس و نکات استاد'];
    for (const note of lesson.classNotes) {
      const noteHeader = note.chapterTitle
        ? `### ${note.title} (${note.chapterTitle})`
        : `### ${note.title}`;
      notesBlock.push(`${noteHeader}\n${note.content.trim()}`);
    }
    sections.push(notesBlock.join('\n\n'));
  }

  return sections.filter(Boolean).join('\n\n').trim();
}

export function formatAllLessonsForClipboard(lessons: Lesson[]): string {
  return lessons
    .map((lesson) => formatLessonForClipboard(lesson))
    .filter(Boolean)
    .join('\n\n========================================\n\n');
}

export const SAMPLE_QUESTIONS_JSON = JSON.stringify(
  [
    {
      questionType: 'mcq',
      question: 'بر اساس متن فصل، کدام مورد درباره رشد کودک صحیح است؟',
      options: ['گزینه الف', 'گزینه ب', 'گزینه ج', 'گزینه د'],
      correctOptionIndex: 0,
      answer: 'دلیل: متن صفحه ... بیان می‌کند که ...',
    },
    {
      questionType: 'descriptive',
      question: 'دو عامل اصلی مؤثر بر ارزیابی بالینی کودک را توضیح دهید.',
      answer: 'پاسخ درست سوال تشریحی: ۱) بررسی تاریخچه رشدی و خانوادگی، ۲) مشاهده تعامل والد و کودک.',
    },
  ],
  null,
  2
);

export const SAMPLE_LESSON_JSON = JSON.stringify(
  {
    title: 'عنوان درس (مثلاً: روانشناسی رشد کودک)',
    category: 'موضوع یا دسته‌بندی درس',
    courseOverview: 'توضیحات کلی درس (تاریخ میان‌ترم، نام استاد، بارم‌بندی...)',
    chapters: [
      {
        title: 'فصل اول: مبانی و مفاهیم پایه',
        summary: 'خلاصه نکات کلیدی این فصل...',
        content: '## تیتر بخش اول\nمتن کامل فصل...\n\n- نکته مهم اول\n- نکته مهم دوم',
        questions: [
          {
            questionType: 'mcq',
            question: 'متن سوال تستی چهارگزینه‌ای؟',
            options: ['گزینه الف', 'گزینه ب', 'گزینه ج', 'گزینه د'],
            correctOptionIndex: 2,
            answer: 'دلیل پاسخ صحیح بر اساس متن فصل...',
          },
          {
            questionType: 'descriptive',
            question: 'متن سوال تشریحی؟',
            answer: 'پاسخ کامل و درست سوال تشریحی...',
          },
        ],
      },
    ],
  },
  null,
  2
);

