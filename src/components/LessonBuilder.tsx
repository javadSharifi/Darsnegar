import { useEffect, useState } from 'react';
import {
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  Code2,
  Copy,
  FileText,
  FileUp,
  Layers,
  Pencil,
  Plus,
  Save,
  Sparkles,
  Trash2,
} from 'lucide-react';
import type {
  DifficultyLevel,
  Lesson,
  LessonChapter,
  LessonQuestion,
  QuestionType,
} from '../types/learning';
import {
  SAMPLE_LESSON_JSON,
  SAMPLE_QUESTIONS_JSON,
  buildLessonFromChapters,
  getOptionLetter,
  getQuestionType,
  parseFormattedPersianQuestions,
  parseImportedLessonJson,
  parseImportedQuestionsJson,
  parseMarkdownFileToLessonParts,
  parseRawTextbookToLessonDraft,
  toPersianDigits,
} from '../utils/studyEngine';
import { ConfirmDeleteModal } from './ConfirmDeleteModal';

type BuilderTab = 'lesson' | 'quick-question' | 'import';

interface LessonBuilderProps {
  lessons: Lesson[];
  editingLesson: Lesson | null;
  initialTab?: BuilderTab;
  initialTargetLessonId?: string;
  initialTargetChapterId?: string;
  onSaveLesson: (lesson: Lesson, isEdit: boolean) => void;
  onSelectLessonForEdit: (lesson: Lesson) => void;
  onImportLessons: (lessons: Lesson[]) => void;
  onAddQuickQuestion: (lessonId: string, question: LessonQuestion) => void;
  onCancelEdit: () => void;
}

interface DraftQuestion {
  id: string;
  questionType: QuestionType;
  question: string;
  answer: string;
  options: [string, string, string, string];
  correctOptionIndex: number;
  level: DifficultyLevel;
  codeSnippet: string;
}

interface DraftChapter {
  id: string;
  title: string;
  summary: string;
  content: string;
  questions: DraftQuestion[];
}

function createEmptyQuestion(index: number, questionType: QuestionType = 'mcq'): DraftQuestion {
  return {
    id: `q-custom-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 6)}`,
    questionType,
    question: '',
    answer: '',
    options: ['', '', '', ''],
    correctOptionIndex: 0,
    level: 'mid',
    codeSnippet: '',
  };
}

function createEmptyChapter(index: number): DraftChapter {
  return {
    id: `ch-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 6)}`,
    title: `فصل ${toPersianDigits(index)}`,
    summary: '',
    content: '',
    questions: [createEmptyQuestion(1)],
  };
}

function toDraftQuestion(q: LessonQuestion): DraftQuestion {
  return {
    id: q.id,
    questionType: getQuestionType(q),
    question: q.question,
    answer: q.answer,
    options: [
      q.options[0] ?? '',
      q.options[1] ?? '',
      q.options[2] ?? '',
      q.options[3] ?? '',
    ],
    correctOptionIndex: q.correctOptionIndex,
    level: q.level ?? 'mid',
    codeSnippet: q.codeSnippet ?? '',
  };
}

function isQuestionBlank(q: DraftQuestion): boolean {
  if (q.questionType === 'descriptive') {
    return q.question.trim() === '' && q.answer.trim() === '';
  }
  return (
    q.question.trim() === '' &&
    q.answer.trim() === '' &&
    q.options.every((opt) => opt.trim() === '')
  );
}

export function LessonBuilder({
  lessons,
  editingLesson,
  initialTab = 'lesson',
  initialTargetLessonId,
  initialTargetChapterId,
  onSaveLesson,
  onSelectLessonForEdit,
  onImportLessons,
  onAddQuickQuestion,
  onCancelEdit,
}: LessonBuilderProps) {
  const [builderTab, setBuilderTab] = useState<BuilderTab>(initialTab);

  // Lesson Form State (no level dropdown, no keyPoints textarea; chapter-by-chapter!)
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('روانشناسی کودک');
  const [courseOverview, setCourseOverview] = useState('');
  const [chapters, setChapters] = useState<DraftChapter[]>(() => [createEmptyChapter(1)]);
  const [activeChapterIdx, setActiveChapterIdx] = useState(0);
  const [pendingChapterDeleteIdx, setPendingChapterDeleteIdx] = useState<number | null>(null);
  const [mobileStep, setMobileStep] = useState<'info' | 'content' | 'questions'>('info');

  // Inline Question Importer (Text الف/ب/ج/د or JSON) inside the chapter questions section
  const [showQuestionImportPanel, setShowQuestionImportPanel] = useState(false);
  const [questionImportMode, setQuestionImportMode] = useState<'text' | 'json'>('text');
  const [questionImportInput, setQuestionImportInput] = useState('');
  const [questionImportError, setQuestionImportError] = useState('');

  const [formError, setFormError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Quick Question State
  const [targetLessonId, setTargetLessonId] = useState(
    initialTargetLessonId || lessons[0]?.id || ''
  );
  const [targetChapterId, setTargetChapterId] = useState(initialTargetChapterId || '');
  const [quickQ, setQuickQ] = useState<DraftQuestion>(() => createEmptyQuestion(99));
  const [quickBatchText, setQuickBatchText] = useState('');
  const [showQuickBatch, setShowQuickBatch] = useState(false);
  const [quickError, setQuickError] = useState('');

  // Quick Import State (Raw Text | JSON)
  const [importMode, setImportMode] = useState<'raw' | 'json'>('raw');
  const [rawImportText, setRawImportText] = useState('');
  const [jsonImportText, setJsonImportText] = useState('');
  const [importError, setImportError] = useState('');
  const [copiedJsonSample, setCopiedJsonSample] = useState<'questions' | 'lesson' | null>(null);

  const handleCopyJsonSample = async (sampleText: string, scope: 'questions' | 'lesson') => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(sampleText);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = sampleText;
        textarea.setAttribute('readonly', 'true');
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = sampleText;
      textarea.setAttribute('readonly', 'true');
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
    setCopiedJsonSample(scope);
    window.setTimeout(() => {
      setCopiedJsonSample((prev) => (prev === scope ? null : prev));
    }, 2200);
  };

  useEffect(() => {
    if (editingLesson) {
      setBuilderTab('lesson');
      setTitle(editingLesson.title);
      setCategory(editingLesson.category);
      setCourseOverview(editingLesson.courseOverview ?? '');

      if (editingLesson.chapters && editingLesson.chapters.length > 0) {
        setChapters(
          editingLesson.chapters.map((ch) => ({
            id: ch.id,
            title: ch.title,
            summary: ch.summary,
            content: ch.content,
            questions:
              ch.questions.length > 0
                ? ch.questions.map(toDraftQuestion)
                : [createEmptyQuestion(1)],
          }))
        );
      } else {
        setChapters([
          {
            id: `ch-${editingLesson.id}-1`,
            title: editingLesson.title || 'فصل اول',
            summary: editingLesson.summary,
            content: editingLesson.content,
            questions:
              editingLesson.questions.length > 0
                ? editingLesson.questions.map(toDraftQuestion)
                : [createEmptyQuestion(1)],
          },
        ]);
      }
      setActiveChapterIdx(0);
      setPendingChapterDeleteIdx(null);
      setMobileStep('info');
      setShowQuestionImportPanel(false);
      setQuestionImportInput('');
      setQuestionImportError('');
      setFormError('');
      setSuccessMessage('');
    }
  }, [editingLesson]);

  useEffect(() => {
    if (!editingLesson) {
      setBuilderTab(initialTab);
    }
  }, [initialTab, editingLesson]);

  useEffect(() => {
    if (initialTargetLessonId && lessons.some((l) => l.id === initialTargetLessonId)) {
      setTargetLessonId(initialTargetLessonId);
    } else if (lessons.length > 0 && !lessons.some((l) => l.id === targetLessonId)) {
      setTargetLessonId(lessons[0].id);
    }
  }, [lessons, targetLessonId, initialTargetLessonId]);

  const selectedQuickLesson = lessons.find((l) => l.id === targetLessonId) ?? null;

  useEffect(() => {
    const chs = selectedQuickLesson?.chapters ?? [];
    if (chs.length === 0) {
      setTargetChapterId('');
      return;
    }
    if (initialTargetChapterId && chs.some((c) => c.id === initialTargetChapterId)) {
      setTargetChapterId(initialTargetChapterId);
    } else if (!chs.some((c) => c.id === targetChapterId)) {
      setTargetChapterId(chs[0].id);
    }
  }, [selectedQuickLesson, targetChapterId, initialTargetChapterId]);

  const safeChapterIdx = Math.min(activeChapterIdx, Math.max(0, chapters.length - 1));
  const currentChapter = chapters[safeChapterIdx] ?? chapters[0];

  const resetLessonForm = () => {
    setTitle('');
    setCategory('روانشناسی کودک');
    setCourseOverview('');
    setChapters([createEmptyChapter(1)]);
    setActiveChapterIdx(0);
    setPendingChapterDeleteIdx(null);
    setMobileStep('info');
    setShowQuestionImportPanel(false);
    setQuestionImportInput('');
    setQuestionImportError('');
    setFormError('');
  };

  const updateCurrentChapter = (updater: (ch: DraftChapter) => DraftChapter) => {
    setChapters((prev) =>
      prev.map((ch, idx) => (idx === safeChapterIdx ? updater(ch) : ch))
    );
  };

  const handleAddChapter = () => {
    const nextIdx = chapters.length;
    setChapters((prev) => [...prev, createEmptyChapter(nextIdx + 1)]);
    setActiveChapterIdx(nextIdx);
    setShowQuestionImportPanel(false);
    setQuestionImportError('');
  };

  const handleDeleteChapter = (idxToDelete: number) => {
    if (chapters.length <= 1) return;
    setChapters((prev) => prev.filter((_, idx) => idx !== idxToDelete));
    setActiveChapterIdx((prev) => {
      if (prev === idxToDelete) return Math.max(0, idxToDelete - 1);
      if (prev > idxToDelete) return prev - 1;
      return prev;
    });
  };

  const handleInsertCodeTemplate = () => {
    updateCurrentChapter((ch) => ({
      ...ch,
      content: `${ch.content}${ch.content.trim() ? '\n\n' : ''}\`\`\`text\nنمونه متن یا الگو\n\`\`\``,
    }));
  };

  const handleMarkdownFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const rawText = typeof reader.result === 'string' ? reader.result : '';
      const parsed = parseMarkdownFileToLessonParts(rawText);
      const isDefaultChapterTitle =
        !currentChapter.title.trim() || /^فصل\s+[۰-۹0-9]+$/.test(currentChapter.title.trim());

      updateCurrentChapter((ch) => ({
        ...ch,
        title:
          isDefaultChapterTitle && parsed.suggestedTitle
            ? parsed.suggestedTitle
            : ch.title,
        content: parsed.content,
      }));

      if (!title.trim() && parsed.suggestedTitle) {
        setTitle(parsed.suggestedTitle);
      }
      setSuccessMessage(`فایل «${file.name}» در متن این فصل بارگذاری شد.`);
      setFormError('');
    };
    reader.readAsText(file, 'utf-8');
    e.target.value = '';
  };

  const updateDraftQuestion = (
    qIdx: number,
    updater: (current: DraftQuestion) => DraftQuestion
  ) => {
    updateCurrentChapter((ch) => ({
      ...ch,
      questions: ch.questions.map((q, i) => (i === qIdx ? updater(q) : q)),
    }));
  };

  const handleQuestionImportFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === 'string' ? reader.result : '';
      setQuestionImportInput(text);
      setQuestionImportError('');
    };
    reader.readAsText(file, 'utf-8');
    e.target.value = '';
  };

  const handleImportQuestionsSubmit = () => {
    setQuestionImportError('');
    setSuccessMessage('');

    if (!questionImportInput.trim()) {
      setQuestionImportError(
        questionImportMode === 'text'
          ? 'لطفاً متن تست را مطابق الگوی الف/ب/ج/د، پاسخ صحیح و دلیل وارد کنید.'
          : 'لطفاً متن JSON سوالات را وارد کنید یا یک فایل .json انتخاب نمایید.'
      );
      return;
    }

    const result =
      questionImportMode === 'text'
        ? parseFormattedPersianQuestions(questionImportInput, 'mid')
        : parseImportedQuestionsJson(questionImportInput, 'mid');

    if (result.ok === false) {
      setQuestionImportError(result.error);
      return;
    }

    const importedDrafts = result.questions.map(toDraftQuestion);
    updateCurrentChapter((ch) => {
      const existingNonBlank = ch.questions.filter((q) => !isQuestionBlank(q));
      return {
        ...ch,
        questions: [...existingNonBlank, ...importedDrafts],
      };
    });

    setQuestionImportInput('');
    setShowQuestionImportPanel(false);
    setSuccessMessage(
      `${toPersianDigits(importedDrafts.length)} سوال با موفقیت به «${currentChapter.title}» اضافه شد.`
    );
  };

  const handleSaveLessonSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setSuccessMessage('');

    const cleanTitle = title.trim();
    const cleanCategory = category.trim();

    if (!cleanTitle) {
      setMobileStep('info');
      setFormError('لطفاً عنوان درس را وارد کنید.');
      return;
    }
    if (!cleanCategory) {
      setMobileStep('info');
      setFormError('لطفاً موضوع یا دسته‌بندی درس را مشخص کنید.');
      return;
    }

    const validatedChapters: LessonChapter[] = [];
    for (let cIdx = 0; cIdx < chapters.length; cIdx++) {
      const ch = chapters[cIdx];
      const chTitle = ch.title.trim() || `فصل ${toPersianDigits(cIdx + 1)}`;
      const chContent = ch.content.trim();
      const chSummary = ch.summary.trim();

      if (!chContent && !chSummary) {
        setActiveChapterIdx(cIdx);
        setMobileStep('content');
        setFormError(
          `در «${chTitle}»، حداقل متن کامل فصل یا خلاصه فصل را وارد کنید.`
        );
        return;
      }

      const nonEmptyQuestions = ch.questions.filter((q) => !isQuestionBlank(q));
      const validatedQuestions: LessonQuestion[] = [];
      for (let qIdx = 0; qIdx < nonEmptyQuestions.length; qIdx++) {
        const q = nonEmptyQuestions[qIdx];
        if (q.questionType === 'descriptive') {
          if (!q.question.trim() || !q.answer.trim()) {
            setActiveChapterIdx(cIdx);
            setMobileStep('questions');
            setFormError(
              `در «${chTitle}» سوال تشریحی شماره ${toPersianDigits(qIdx + 1)}، صورت سوال و پاسخ درست هر دو الزامی هستند.`
            );
            return;
          }
          validatedQuestions.push({
            id: q.id || `q-${Date.now()}-${cIdx}-${qIdx}`,
            questionType: 'descriptive',
            question: q.question.trim(),
            answer: q.answer.trim(),
            options: [],
            correctOptionIndex: 0,
            level: q.level ?? 'mid',
            codeSnippet: q.codeSnippet.trim() || undefined,
            chapterId: ch.id,
            chapterTitle: chTitle,
            isCustom: true,
          });
          continue;
        }

        const nonEmptyOpts = q.options.map((opt) => opt.trim()).filter(Boolean);
        if (!q.question.trim() || !q.answer.trim()) {
          setActiveChapterIdx(cIdx);
          setMobileStep('questions');
          setFormError(
            `در «${chTitle}» سوال شماره ${toPersianDigits(qIdx + 1)}، صورت سوال و دلیل پاسخ صحیح هر دو الزامی هستند.`
          );
          return;
        }
        if (nonEmptyOpts.length < 2) {
          setActiveChapterIdx(cIdx);
          setMobileStep('questions');
          setFormError(
            `در «${chTitle}» سوال شماره ${toPersianDigits(qIdx + 1)}، حداقل دو گزینه (الف و ب) را وارد کنید.`
          );
          return;
        }
        const safeCorrectIdx =
          q.correctOptionIndex >= 0 && q.correctOptionIndex < nonEmptyOpts.length
            ? q.correctOptionIndex
            : 0;
        validatedQuestions.push({
          id: q.id || `q-${Date.now()}-${cIdx}-${qIdx}`,
          questionType: 'mcq',
          question: q.question.trim(),
          answer: q.answer.trim(),
          options: nonEmptyOpts,
          correctOptionIndex: safeCorrectIdx,
          level: q.level ?? 'mid',
          codeSnippet: q.codeSnippet.trim() || undefined,
          chapterId: ch.id,
          chapterTitle: chTitle,
          isCustom: true,
        });
      }

      validatedChapters.push({
        id: ch.id,
        title: chTitle,
        summary: chSummary || chContent.slice(0, 180),
        content: chContent || chSummary,
        questions: validatedQuestions,
      });
    }

    const now = Date.now();
    const lessonPayload = buildLessonFromChapters({
      id: editingLesson ? editingLesson.id : `lesson-${now}`,
      title: cleanTitle,
      category: cleanCategory,
      level: editingLesson?.level ?? 'mid',
      courseOverview,
      chapters: validatedChapters,
      classNotes: editingLesson?.classNotes,
      createdAt: editingLesson ? editingLesson.createdAt : now,
      updatedAt: now,
      isCustom: editingLesson ? editingLesson.isCustom : true,
    });

    onSaveLesson(lessonPayload, Boolean(editingLesson));
    if (!editingLesson) {
      resetLessonForm();
    }
    setSuccessMessage(editingLesson ? 'تغییرات درس ذخیره شد.' : 'درس جدید با موفقیت ساخته شد.');
  };

  const handleQuickQuestionSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setQuickError('');
    setSuccessMessage('');

    if (!targetLessonId) {
      setQuickError('ابتدا یک درس را انتخاب کنید.');
      return;
    }

    const chosenChapter = selectedQuickLesson?.chapters?.find(
      (c) => c.id === targetChapterId
    );

    if (quickQ.questionType === 'descriptive') {
      if (!quickQ.question.trim() || !quickQ.answer.trim()) {
        setQuickError('صورت سوال تشریحی و پاسخ درست آن را وارد کنید.');
        return;
      }

      onAddQuickQuestion(targetLessonId, {
        id: `q-quick-${Date.now()}`,
        questionType: 'descriptive',
        question: quickQ.question.trim(),
        answer: quickQ.answer.trim(),
        options: [],
        correctOptionIndex: 0,
        level: quickQ.level,
        codeSnippet: quickQ.codeSnippet.trim() || undefined,
        chapterId: chosenChapter?.id,
        chapterTitle: chosenChapter?.title,
        isCustom: true,
      });

      setQuickQ(createEmptyQuestion(Date.now(), 'descriptive'));
      setSuccessMessage('سوال تشریحی جدید به درس انتخاب‌شده اضافه شد.');
      return;
    }

    const nonEmptyOpts = quickQ.options.map((opt) => opt.trim()).filter(Boolean);
    if (!quickQ.question.trim() || !quickQ.answer.trim()) {
      setQuickError('صورت سوال و دلیل پاسخ صحیح را وارد کنید.');
      return;
    }
    if (nonEmptyOpts.length < 2) {
      setQuickError('حداقل دو گزینه (الف و ب) را وارد نمایید.');
      return;
    }

    const safeCorrectIdx =
      quickQ.correctOptionIndex >= 0 && quickQ.correctOptionIndex < nonEmptyOpts.length
        ? quickQ.correctOptionIndex
        : 0;

    onAddQuickQuestion(targetLessonId, {
      id: `q-quick-${Date.now()}`,
      questionType: 'mcq',
      question: quickQ.question.trim(),
      answer: quickQ.answer.trim(),
      options: nonEmptyOpts,
      correctOptionIndex: safeCorrectIdx,
      level: quickQ.level,
      codeSnippet: quickQ.codeSnippet.trim() || undefined,
      chapterId: chosenChapter?.id,
      chapterTitle: chosenChapter?.title,
      isCustom: true,
    });

    setQuickQ(createEmptyQuestion(Date.now(), 'mcq'));
    setSuccessMessage('سوال تستی جدید به درس انتخاب‌شده اضافه شد.');
  };

  const handleQuickBatchTextAdd = () => {
    setQuickError('');
    setSuccessMessage('');
    if (!targetLessonId) {
      setQuickError('ابتدا یک درس را انتخاب کنید.');
      return;
    }
    const result = parseFormattedPersianQuestions(quickBatchText, 'mid');
    if (result.ok === false) {
      setQuickError(result.error);
      return;
    }
    const chosenChapter = selectedQuickLesson?.chapters?.find(
      (c) => c.id === targetChapterId
    );
    for (const q of result.questions) {
      onAddQuickQuestion(targetLessonId, {
        ...q,
        chapterId: chosenChapter?.id,
        chapterTitle: chosenChapter?.title,
      });
    }
    setQuickBatchText('');
    setShowQuickBatch(false);
    setSuccessMessage(
      `${toPersianDigits(result.questions.length)} سوال با موفقیت به درس اضافه شد.`
    );
  };

  const handleParseRawText = () => {
    setImportError('');
    setSuccessMessage('');
    if (!rawImportText.trim()) {
      setImportError('لطفاً متن خام درس یا فصل کتاب را در کادر بالا وارد کنید.');
      return;
    }

    const draft = parseRawTextbookToLessonDraft(rawImportText);
    setTitle(draft.title);
    setCategory('روانشناسی کودک');
    setChapters([
      {
        id: `ch-raw-${Date.now()}`,
        title: draft.title || 'فصل اول',
        summary: draft.summary,
        content: draft.content,
        questions: [createEmptyQuestion(1)],
      },
    ]);
    setActiveChapterIdx(0);
    setMobileStep('content');
    setBuilderTab('lesson');
    setSuccessMessage(
      'متن خام ساختاردهی شد و در فرم درس بارگذاری گردید. پس از بررسی دکمه ذخیره را بزنید.'
    );
  };

  const handleImportJsonSubmit = () => {
    setImportError('');
    setSuccessMessage('');
    if (!jsonImportText.trim()) {
      setImportError('لطفاً متن JSON را وارد کنید یا یک فایل .json انتخاب نمایید.');
      return;
    }

    const result = parseImportedLessonJson(jsonImportText, 'روانشناسی کودک');
    if (result.ok === false) {
      setImportError(result.error);
      return;
    }

    onImportLessons(result.lessons);
    setJsonImportText('');
    setSuccessMessage(
      `${toPersianDigits(result.lessons.length)} درس با موفقیت وارد فهرست درس‌ها شد.`
    );
  };

  const handleJsonFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === 'string' ? reader.result : '';
      setJsonImportText(text);
      setImportError('');
    };
    reader.readAsText(file, 'utf-8');
    e.target.value = '';
  };

  const currentChapterQuestionCount = currentChapter
    ? currentChapter.questions.filter((q) => !isQuestionBlank(q)).length
    : 0;

  return (
    <div className="space-y-4 sm:space-y-5 min-w-0">
      {/* Mode Switcher: Compact 3-col segmented bar on mobile, spacious inline bar on desktop */}
      {!editingLesson && (
        <div
          className="glass-card p-1 sm:p-1.5 grid grid-cols-3 sm:inline-flex items-center gap-1 sm:gap-1.5 rounded-2xl w-full sm:w-auto"
          role="tablist"
          aria-label="حالت افزودن"
        >
          <button
            type="button"
            role="tab"
            aria-selected={builderTab === 'lesson'}
            onClick={() => {
              setBuilderTab('lesson');
              setSuccessMessage('');
              setImportError('');
            }}
            className={`min-h-[44px] sm:min-h-0 rounded-xl px-2 sm:px-4 py-2 text-xs sm:text-sm font-semibold transition-all cursor-pointer whitespace-nowrap flex items-center justify-center ${
              builderTab === 'lesson'
                ? 'bg-[var(--glass-strong)] text-[var(--blue-ink)] shadow-sm'
                : 'text-[var(--muted)] hover:text-[var(--ink)]'
            }`}
          >
            <span className="sm:hidden">درس جدید</span>
            <span className="hidden sm:inline">افزودن درس جدید (فصل‌بندی‌شده)</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={builderTab === 'import'}
            onClick={() => {
              setBuilderTab('import');
              setSuccessMessage('');
              setImportError('');
            }}
            className={`min-h-[44px] sm:min-h-0 rounded-xl px-2 sm:px-4 py-2 text-xs sm:text-sm font-semibold transition-all cursor-pointer whitespace-nowrap flex items-center justify-center ${
              builderTab === 'import'
                ? 'bg-[var(--glass-strong)] text-[var(--blue-ink)] shadow-sm'
                : 'text-[var(--muted)] hover:text-[var(--ink)]'
            }`}
          >
            <span className="sm:hidden">ورود سریع</span>
            <span className="hidden sm:inline">ورود سریع (متن خام / JSON)</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={builderTab === 'quick-question'}
            onClick={() => {
              setBuilderTab('quick-question');
              setSuccessMessage('');
              setImportError('');
            }}
            className={`min-h-[44px] sm:min-h-0 rounded-xl px-2 sm:px-4 py-2 text-xs sm:text-sm font-semibold transition-all cursor-pointer whitespace-nowrap flex items-center justify-center ${
              builderTab === 'quick-question'
                ? 'bg-[var(--glass-strong)] text-[var(--blue-ink)] shadow-sm'
                : 'text-[var(--muted)] hover:text-[var(--ink)]'
            }`}
          >
            <span className="sm:hidden">سوال سریع</span>
            <span className="hidden sm:inline">افزودن سریع سوال به درس موجود</span>
          </button>
        </div>
      )}

      {successMessage && (
        <div
          role="status"
          className="rounded-2xl bg-[var(--ok-tint)] px-4 py-3 text-xs sm:text-sm font-semibold text-[var(--ok-ink)]"
        >
          {successMessage}
        </div>
      )}

      {builderTab === 'lesson' ? (
        <form
          onSubmit={handleSaveLessonSubmit}
          className="glass-card-strong p-4 sm:p-7 space-y-5 sm:space-y-6 rounded-[22px] sm:rounded-[26px] min-w-0"
          noValidate
        >
          {/* Form Header */}
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between border-b border-[var(--line)] pb-4">
            <div className="min-w-0">
              <h1 className="text-lg sm:text-xl font-extrabold text-[var(--ink-strong)] leading-snug">
                {editingLesson ? `ویرایش درس: ${editingLesson.title}` : 'ساخت درس جدید (فصل به فصل)'}
              </h1>
              <p className="text-xs text-[var(--muted)] mt-1 leading-6">
                {editingLesson
                  ? 'بخش‌های مورد نظر را ویرایش کنید و در پایان تغییرات را ذخیره نمایید.'
                  : 'مشخصات درس، متن فصل‌ها و سوالات تستی یا تشریحی را در سه بخش مرتب ثبت کنید.'}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {!editingLesson && lessons.length > 0 && (
                <div className="w-full sm:w-auto">
                  <label htmlFor="edit-existing-lesson-select" className="sr-only">
                    انتخاب درس موجود برای ویرایش
                  </label>
                  <select
                    id="edit-existing-lesson-select"
                    value=""
                    onChange={(e) => {
                      const found = lessons.find((l) => l.id === e.target.value);
                      if (found) onSelectLessonForEdit(found);
                    }}
                    className="glass-field w-full sm:w-auto min-h-[44px] sm:min-h-0 px-3.5 py-2 text-xs font-semibold cursor-pointer"
                  >
                    <option value="" disabled>
                      ویرایش یک درس موجود...
                    </option>
                    {lessons.map((l) => (
                      <option key={l.id} value={l.id}>
                        ویرایش: {l.title}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {editingLesson && (
                <button
                  type="button"
                  onClick={onCancelEdit}
                  className="btn-secondary-glass w-full sm:w-auto min-h-[44px] sm:min-h-0 rounded-full px-4 py-2 text-xs font-semibold cursor-pointer whitespace-nowrap"
                >
                  انصراف از ویرایش
                </button>
              )}
            </div>
          </div>

          {/* Mobile 3-Step Studio Switcher (Hidden on Desktop md+) */}
          <div
            className="md:hidden grid grid-cols-3 gap-1 rounded-2xl bg-[var(--sunk)] p-1 border border-[var(--line)]"
            role="tablist"
            aria-label="مراحل ساخت یا ویرایش درس"
            data-testid="mobile-lesson-steps"
          >
            <button
              type="button"
              role="tab"
              aria-selected={mobileStep === 'info'}
              data-testid="mobile-step-info"
              onClick={() => setMobileStep('info')}
              className={`min-h-[44px] rounded-xl px-2 py-2 text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center justify-center ${
                mobileStep === 'info'
                  ? 'bg-[var(--glass-strong)] text-[var(--blue-ink)] shadow-sm'
                  : 'text-[var(--muted)]'
              }`}
            >
              ۱. مشخصات
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mobileStep === 'content'}
              data-testid="mobile-step-content"
              onClick={() => setMobileStep('content')}
              className={`min-h-[44px] rounded-xl px-2 py-2 text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center justify-center ${
                mobileStep === 'content'
                  ? 'bg-[var(--glass-strong)] text-[var(--blue-ink)] shadow-sm'
                  : 'text-[var(--muted)]'
              }`}
            >
              ۲. فصل و متن
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mobileStep === 'questions'}
              data-testid="mobile-step-questions"
              onClick={() => setMobileStep('questions')}
              className={`min-h-[44px] rounded-xl px-2 py-2 text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center justify-center tabular-nums ${
                mobileStep === 'questions'
                  ? 'bg-[var(--glass-strong)] text-[var(--blue-ink)] shadow-sm'
                  : 'text-[var(--muted)]'
              }`}
            >
              {currentChapterQuestionCount > 0
                ? `۳. سوالات (${toPersianDigits(currentChapterQuestionCount)})`
                : '۳. سوالات'}
            </button>
          </div>

          {/* Step 1: Basic Lesson Info (Title + Category + General Course Overview) */}
          <div className={mobileStep === 'info' ? 'space-y-4' : 'hidden md:block space-y-4'}>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <label htmlFor="lesson-title-input" className="block text-xs font-semibold text-[var(--muted)]">
                  عنوان درس *
                </label>
                <input
                  id="lesson-title-input"
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="مثلاً: کتاب روانشناسی رشد کودک یا مجموعه ارزیابی بالینی"
                  className="glass-field w-full min-h-[46px] px-3.5 py-2.5 text-sm"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="lesson-category-input" className="block text-xs font-semibold text-[var(--muted)]">
                  موضوع / دسته‌بندی *
                </label>
                <input
                  id="lesson-category-input"
                  type="text"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="مثلاً: روانشناسی کودک، روانشناسی رشد، بالینی..."
                  className="glass-field w-full min-h-[46px] px-3.5 py-2.5 text-sm"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="lesson-overview-input" className="block text-xs font-semibold text-[var(--muted)] leading-6">
                توضیحات کلی درباره درس (اختیاری — تاریخ میان‌ترم، نام استاد، بارم‌بندی و...)
              </label>
              <textarea
                id="lesson-overview-input"
                rows={3}
                value={courseOverview}
                onChange={(e) => setCourseOverview(e.target.value)}
                placeholder="مثلاً: میان‌ترم ۲۵ آذر از فصل‌های ۱ تا ۳ — استاد دکتر ... — نمره پروژه کلاسی ۴ نمره"
                className="glass-field w-full p-3.5 text-sm leading-7"
              />
            </div>
          </div>

          {/* Chapters Switcher Bar (Visible in Steps 2 & 3 on mobile, always on desktop) */}
          <div
            className={
              mobileStep !== 'info'
                ? 'space-y-3 md:border-t md:border-[var(--line)] md:pt-5'
                : 'hidden md:block space-y-3 border-t border-[var(--line)] pt-5'
            }
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <Layers className="h-4 w-4 text-[var(--blue)] shrink-0" />
                <h2 className="text-sm sm:text-base font-bold text-[var(--ink-strong)] truncate">
                  فصل‌های درس ({toPersianDigits(chapters.length)} فصل)
                </h2>
              </div>
              <button
                type="button"
                onClick={handleAddChapter}
                className="btn-secondary-glass inline-flex items-center gap-1.5 rounded-full min-h-[40px] px-3.5 sm:px-4 py-1.5 sm:py-2 text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>افزودن فصل جدید</span>
              </button>
            </div>

            <div
              className="flex items-center gap-2 overflow-x-auto pb-1 md:flex-wrap md:overflow-visible"
              role="tablist"
              aria-label="فصل‌های درس"
            >
              {chapters.map((ch, cIdx) => {
                const isSelected = cIdx === safeChapterIdx;
                const qCount = ch.questions.filter((q) => !isQuestionBlank(q)).length;
                return (
                  <div
                    key={ch.id}
                    className={`inline-flex items-center gap-1 rounded-2xl border p-1 transition-all shrink-0 ${
                      isSelected
                        ? 'border-[var(--blue)] bg-[var(--blue-tint)]'
                        : 'border-[var(--line)] bg-[var(--sunk)]'
                    }`}
                  >
                    <button
                      type="button"
                      role="tab"
                      aria-selected={isSelected}
                      onClick={() => {
                        setActiveChapterIdx(cIdx);
                        setShowQuestionImportPanel(false);
                        setQuestionImportError('');
                      }}
                      className={`min-h-[38px] px-3 py-1.5 text-xs font-semibold cursor-pointer whitespace-nowrap rounded-xl ${
                        isSelected ? 'text-[var(--blue-ink)]' : 'text-[var(--muted)] hover:text-[var(--ink)]'
                      }`}
                    >
                      {ch.title.trim() || `فصل ${toPersianDigits(cIdx + 1)}`}
                      {qCount > 0 ? ` · ${toPersianDigits(qCount)} سوال` : ''}
                    </button>
                    {chapters.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setPendingChapterDeleteIdx(cIdx)}
                        aria-label={`حذف ${ch.title || `فصل ${toPersianDigits(cIdx + 1)}`}`}
                        className="min-h-[38px] min-w-[38px] inline-flex items-center justify-center rounded-xl text-[var(--danger)] hover:bg-[var(--danger-tint)] cursor-pointer"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Active Chapter Editor (Flat & spacious on mobile, subtle container on desktop) */}
          {currentChapter && (
            <div
              className={
                mobileStep !== 'info'
                  ? 'md:rounded-[24px] md:border md:border-[var(--line-2)] md:bg-[var(--sunk)] md:p-6 space-y-5 min-w-0'
                  : 'hidden md:block rounded-[24px] border border-[var(--line-2)] bg-[var(--sunk)] p-6 space-y-5 min-w-0'
              }
            >
              {/* Step 2: Chapter Title, Summary & Full Text */}
              <div className={mobileStep === 'content' ? 'space-y-4 sm:space-y-5' : 'hidden md:block space-y-5'}>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="space-y-1.5">
                    <label htmlFor="chapter-title-input" className="block text-xs font-semibold text-[var(--muted)]">
                      عنوان فصل {toPersianDigits(safeChapterIdx + 1)} *
                    </label>
                    <input
                      id="chapter-title-input"
                      type="text"
                      value={currentChapter.title}
                      onChange={(e) =>
                        updateCurrentChapter((ch) => ({ ...ch, title: e.target.value }))
                      }
                      placeholder="مثلاً: فصل اول: ارزیابی بالینی کودک"
                      className="glass-field w-full min-h-[46px] px-3.5 py-2.5 text-sm"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="chapter-summary-input" className="block text-xs font-semibold text-[var(--muted)]">
                      خلاصه این فصل
                    </label>
                    <textarea
                      id="chapter-summary-input"
                      rows={3}
                      value={currentChapter.summary}
                      onChange={(e) =>
                        updateCurrentChapter((ch) => ({ ...ch, summary: e.target.value }))
                      }
                      placeholder="خلاصه مفاهیم اصلی و نکات کلیدی این فصل را بنویسید..."
                      className="glass-field w-full p-3.5 text-sm leading-7"
                    />
                  </div>
                </div>

                {/* Full Chapter Text + .md Upload */}
                <div className="space-y-2.5">
                  <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
                    <label htmlFor="lesson-content-input" className="block text-xs font-semibold text-[var(--muted)] leading-6">
                      متن کامل فصل (پشتیبانی از تیتر با ## و لیست با -)
                    </label>
                    <div className="grid grid-cols-2 sm:flex items-center gap-2 shrink-0">
                      <label className="btn-secondary-glass inline-flex items-center justify-center gap-1.5 rounded-xl sm:rounded-full min-h-[42px] sm:min-h-0 px-3 sm:px-3.5 py-2 sm:py-1.5 text-xs font-semibold cursor-pointer whitespace-nowrap">
                        <FileUp className="h-3.5 w-3.5 shrink-0" />
                        <span>بارگذاری فایل .md</span>
                        <input
                          type="file"
                          accept=".md,.markdown,.txt,text/markdown,text/plain"
                          onChange={handleMarkdownFileUpload}
                          className="sr-only"
                        />
                      </label>
                      <button
                        type="button"
                        onClick={handleInsertCodeTemplate}
                        className="btn-secondary-glass inline-flex items-center justify-center gap-1.5 rounded-xl sm:rounded-full min-h-[42px] sm:min-h-0 px-3 sm:px-3.5 py-2 sm:py-1.5 text-xs font-medium cursor-pointer whitespace-nowrap"
                      >
                        <Code2 className="h-3.5 w-3.5 shrink-0" />
                        <span>افزودن بلوک کد</span>
                      </button>
                    </div>
                  </div>
                  <textarea
                    id="lesson-content-input"
                    rows={8}
                    value={currentChapter.content}
                    onChange={(e) =>
                      updateCurrentChapter((ch) => ({ ...ch, content: e.target.value }))
                    }
                    placeholder="## تیتر بخش اول&#10;متن فصل را بنویسید یا فایل .md خود را بارگذاری کنید..."
                    className="glass-field w-full p-3.5 sm:p-4 text-sm leading-8"
                  />
                </div>
              </div>

              {/* Step 3: Chapter Questions + Text & JSON Import Buttons */}
              <div
                className={
                  mobileStep === 'questions'
                    ? 'space-y-4 md:border-t md:border-[var(--line)] md:pt-5'
                    : 'hidden md:block space-y-4 border-t border-[var(--line)] pt-5'
                }
              >
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div className="space-y-0.5 min-w-0">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <h3 className="text-sm sm:text-base font-bold text-[var(--ink-strong)]">
                        سوالات امتحانی این فصل
                      </h3>
                      <span className="text-xs text-[var(--muted)] tabular-nums">
                        {toPersianDigits(
                          currentChapter.questions.filter((q) => !isQuestionBlank(q)).length ||
                            currentChapter.questions.length
                        )}{' '}
                        سوال · تستی و تشریحی
                      </span>
                    </div>
                    <p className="text-xs text-[var(--muted)] leading-5">
                      سوالات تستی (چهارگزینه‌ای) یا تشریحی طراحی کنید یا از متن و JSON وارد نمایید.
                    </p>
                  </div>

                  <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        if (showQuestionImportPanel && questionImportMode === 'text') {
                          setShowQuestionImportPanel(false);
                        } else {
                          setQuestionImportMode('text');
                          setShowQuestionImportPanel(true);
                        }
                        setQuestionImportError('');
                      }}
                      className={`inline-flex items-center justify-center gap-1.5 rounded-xl sm:rounded-full min-h-[42px] sm:min-h-0 px-3 sm:px-4 py-2 text-xs font-semibold cursor-pointer whitespace-nowrap ${
                        showQuestionImportPanel && questionImportMode === 'text'
                          ? 'bg-[var(--blue-tint)] text-[var(--blue-ink)] border border-[var(--blue)]'
                          : 'btn-secondary-glass'
                      }`}
                    >
                      <FileText className="h-3.5 w-3.5 shrink-0" />
                      <span>ورود از متن تست</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        if (showQuestionImportPanel && questionImportMode === 'json') {
                          setShowQuestionImportPanel(false);
                        } else {
                          setQuestionImportMode('json');
                          setShowQuestionImportPanel(true);
                        }
                        setQuestionImportError('');
                      }}
                      className={`inline-flex items-center justify-center gap-1.5 rounded-xl sm:rounded-full min-h-[42px] sm:min-h-0 px-3 sm:px-4 py-2 text-xs font-semibold cursor-pointer whitespace-nowrap ${
                        showQuestionImportPanel && questionImportMode === 'json'
                          ? 'bg-[var(--blue-tint)] text-[var(--blue-ink)] border border-[var(--blue)]'
                          : 'btn-secondary-glass'
                      }`}
                    >
                      <Code2 className="h-3.5 w-3.5 shrink-0" />
                      <span>ورود با JSON</span>
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        updateCurrentChapter((ch) => ({
                          ...ch,
                          questions: [
                            ...ch.questions,
                            createEmptyQuestion(ch.questions.length + 1),
                          ],
                        }))
                      }
                      className="btn-secondary-glass col-span-2 sm:col-span-1 inline-flex items-center justify-center gap-1.5 rounded-xl sm:rounded-full min-h-[42px] sm:min-h-0 px-4 py-2 text-xs font-semibold cursor-pointer whitespace-nowrap"
                    >
                      <Plus className="h-3.5 w-3.5 shrink-0" />
                      <span>افزودن سوال دیگر</span>
                    </button>
                  </div>
                </div>

                {/* Inline Questions Text / JSON Import Panel */}
                {showQuestionImportPanel && (
                  <div
                    className="rounded-2xl border border-[var(--blue)] bg-[var(--sunk)] sm:bg-[var(--glass-strong)] p-3.5 sm:p-5 space-y-3"
                    data-testid="question-json-panel"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <p className="text-xs sm:text-sm font-bold text-[var(--ink-strong)]">
                          {questionImportMode === 'text'
                            ? 'ورود سریع تست از متن (الگوی الف، ب، ج، د + پاسخ صحیح + دلیل)'
                            : 'ورود سریع سوالات این فصل با JSON'}
                        </p>
                        <p className="text-xs text-[var(--muted)] mt-0.5 leading-5">
                          {questionImportMode === 'text'
                            ? 'یک یا چند تست را دقیقاً با ساختار الف) تا د)، «پاسخ صحیح:» و «دلیل:» اینجا بچسبانید.'
                            : 'آرایه‌ای از سوالات یا شیء دارای کلید questions را وارد یا فایل .json انتخاب کنید.'}
                        </p>
                      </div>
                      <div
                        className={`${
                          questionImportMode === 'json' ? 'grid grid-cols-2' : 'flex'
                        } sm:flex sm:flex-wrap items-center gap-2 shrink-0`}
                      >
                        {questionImportMode === 'json' && (
                          <button
                            type="button"
                            data-testid="copy-question-json-sample-btn"
                            onClick={() => handleCopyJsonSample(SAMPLE_QUESTIONS_JSON, 'questions')}
                            className="btn-secondary-glass inline-flex items-center justify-center gap-1.5 rounded-xl sm:rounded-full min-h-[42px] sm:min-h-0 px-2.5 sm:px-3.5 py-2 sm:py-1.5 text-xs font-semibold cursor-pointer whitespace-nowrap"
                          >
                            {copiedJsonSample === 'questions' ? (
                              <>
                                <Check className="h-3.5 w-3.5 text-[var(--ok)] shrink-0" />
                                <span className="text-[var(--ok-ink)] sm:hidden">کپی شد!</span>
                                <span className="text-[var(--ok-ink)] hidden sm:inline">نمونه JSON کپی شد</span>
                              </>
                            ) : (
                              <>
                                <Copy className="h-3.5 w-3.5 shrink-0" />
                                <span className="sm:hidden">نمونه JSON (AI)</span>
                                <span className="hidden sm:inline">کپی نمونه JSON (برای AI)</span>
                              </>
                            )}
                          </button>
                        )}
                        <label className="btn-secondary-glass w-full sm:w-auto inline-flex items-center justify-center gap-1.5 rounded-xl sm:rounded-full min-h-[42px] sm:min-h-0 px-2.5 sm:px-3.5 py-2 sm:py-1.5 text-xs font-semibold cursor-pointer whitespace-nowrap">
                          <FileUp className="h-3.5 w-3.5 shrink-0" />
                          <span>{questionImportMode === 'text' ? 'انتخاب فایل متنی' : 'انتخاب فایل JSON'}</span>
                          <input
                            type="file"
                            accept={questionImportMode === 'text' ? '.txt,.md,text/plain,text/markdown' : '.json,application/json'}
                            onChange={handleQuestionImportFileUpload}
                            className="sr-only"
                          />
                        </label>
                      </div>
                    </div>

                    <textarea
                      id="question-json-textarea"
                      aria-label={questionImportMode === 'text' ? 'ورود متنی سوالات' : 'ورود JSON سوالات'}
                      dir={questionImportMode === 'text' ? 'rtl' : 'ltr'}
                      rows={questionImportMode === 'text' ? 8 : 6}
                      value={questionImportInput}
                      onChange={(e) => setQuestionImportInput(e.target.value)}
                      placeholder={
                        questionImportMode === 'text'
                          ? 'بر اساس متن، کدام یک از موارد زیر در مورد افسردگی مادر صحیح است؟\n\nالف) گزینه اول\nب) گزینه دوم\nج) هر دو مورد الف و ب\nد) هیچکدام\n\nپاسخ صحیح: ج\nدلیل: متن صفحه ۴۹ بیان می‌کند...'
                          : SAMPLE_QUESTIONS_JSON
                      }
                      className={`glass-field w-full p-3.5 text-xs sm:text-sm leading-7 ${
                        questionImportMode === 'json' ? 'font-mono-code leading-6' : ''
                      }`}
                    />

                    {questionImportError && (
                      <p role="alert" className="rounded-xl bg-[var(--danger-tint)] px-3.5 py-2 text-xs font-semibold text-[var(--danger)]">
                        {questionImportError}
                      </p>
                    )}

                    <div className="grid grid-cols-[auto_1fr] sm:flex sm:items-center sm:justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setShowQuestionImportPanel(false);
                          setQuestionImportError('');
                        }}
                        className="btn-secondary-glass min-h-[44px] sm:min-h-0 rounded-xl sm:rounded-full px-4 py-2 text-xs font-semibold cursor-pointer whitespace-nowrap"
                      >
                        بستن
                      </button>
                      <button
                        type="button"
                        onClick={handleImportQuestionsSubmit}
                        className="btn-primary-glass inline-flex items-center justify-center gap-1.5 min-h-[44px] sm:min-h-0 rounded-xl sm:rounded-full px-5 py-2 text-xs font-bold cursor-pointer whitespace-nowrap"
                      >
                        <Plus className="h-3.5 w-3.5 shrink-0" />
                        <span>افزودن سوالات به این فصل</span>
                      </button>
                    </div>
                  </div>
                )}

                <div className="space-y-4">
                  {currentChapter.questions.map((dq, qIdx) => (
                    <div
                      key={dq.id}
                      className="rounded-2xl sm:rounded-[22px] border border-[var(--line-2)] bg-[var(--sunk)] sm:bg-[var(--glass)] p-3.5 sm:p-5 space-y-4 min-w-0"
                    >
                      <div className="space-y-2.5 sm:space-y-0 sm:flex sm:items-center sm:justify-between sm:gap-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-bold text-[var(--blue-ink)] tabular-nums">
                            سوال شماره {toPersianDigits(qIdx + 1)}
                          </span>

                          {currentChapter.questions.length > 1 && (
                            <button
                              type="button"
                              onClick={() =>
                                updateCurrentChapter((ch) => ({
                                  ...ch,
                                  questions: ch.questions.filter((_, i) => i !== qIdx),
                                }))
                              }
                              aria-label={`حذف سوال ${toPersianDigits(qIdx + 1)}`}
                              className="sm:hidden min-h-[40px] min-w-[40px] inline-flex items-center justify-center rounded-xl text-[var(--danger)] hover:bg-[var(--danger-tint)] cursor-pointer"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>

                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className="grid grid-cols-2 sm:inline-flex w-full sm:w-auto items-center gap-1 rounded-xl bg-[var(--glass)] sm:bg-[var(--sunk)] p-1 border border-[var(--line)] sm:border-0"
                            role="group"
                            aria-label={`نوع سوال شماره ${toPersianDigits(qIdx + 1)}`}
                          >
                            <button
                              type="button"
                              onClick={() =>
                                updateDraftQuestion(qIdx, (cur) => ({
                                  ...cur,
                                  questionType: 'mcq',
                                }))
                              }
                              className={`min-h-[38px] sm:min-h-0 rounded-lg px-2 sm:px-2.5 py-1.5 sm:py-1 text-xs font-semibold cursor-pointer whitespace-nowrap transition-colors flex items-center justify-center ${
                                dq.questionType === 'mcq'
                                  ? 'bg-[var(--glass-strong)] text-[var(--blue-ink)] shadow-sm'
                                  : 'text-[var(--muted)] hover:text-[var(--ink)]'
                              }`}
                            >
                              <span className="sm:hidden">تستی (۴ گزینه‌ای)</span>
                              <span className="hidden sm:inline">تستی (چهارگزینه‌ای)</span>
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                updateDraftQuestion(qIdx, (cur) => ({
                                  ...cur,
                                  questionType: 'descriptive',
                                }))
                              }
                              className={`min-h-[38px] sm:min-h-0 rounded-lg px-2 sm:px-2.5 py-1.5 sm:py-1 text-xs font-semibold cursor-pointer whitespace-nowrap transition-colors flex items-center justify-center ${
                                dq.questionType === 'descriptive'
                                  ? 'bg-[var(--glass-strong)] text-[var(--purple-ink)] shadow-sm'
                                  : 'text-[var(--muted)] hover:text-[var(--ink)]'
                              }`}
                            >
                              <span className="sm:hidden">تشریحی (+ جواب)</span>
                              <span className="hidden sm:inline">تشریحی (+ جواب درست)</span>
                            </button>
                          </div>

                          {currentChapter.questions.length > 1 && (
                            <button
                              type="button"
                              onClick={() =>
                                updateCurrentChapter((ch) => ({
                                  ...ch,
                                  questions: ch.questions.filter((_, i) => i !== qIdx),
                                }))
                              }
                              aria-label={`حذف سوال ${toPersianDigits(qIdx + 1)}`}
                              className="hidden sm:inline-flex rounded-full p-1.5 text-[var(--danger)] hover:bg-[var(--danger-tint)] cursor-pointer shrink-0"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </div>

                      {dq.questionType === 'descriptive' ? (
                        <div className="space-y-3">
                          <div className="space-y-1.5">
                            <label
                              htmlFor={`dq-prompt-${qIdx}`}
                              className="block text-xs font-medium text-[var(--muted)]"
                            >
                              صورت سوال تشریحی *
                            </label>
                            <input
                              id={`dq-prompt-${qIdx}`}
                              type="text"
                              value={dq.question}
                              onChange={(e) =>
                                updateDraftQuestion(qIdx, (cur) => ({
                                  ...cur,
                                  question: e.target.value,
                                }))
                              }
                              placeholder="مثلاً: مکانیسم‌های اثرگذاری افسردگی مادر بر رشد کودک را توضیح دهید..."
                              className="glass-field w-full min-h-[44px] px-3.5 py-2.5 text-sm"
                            />
                          </div>

                          <div className="space-y-1.5">
                            <label
                              htmlFor={`dq-answer-${qIdx}`}
                              className="block text-xs font-medium text-[var(--muted)]"
                            >
                              پاسخ درست سوال تشریحی *
                            </label>
                            <textarea
                              id={`dq-answer-${qIdx}`}
                              rows={3}
                              value={dq.answer}
                              onChange={(e) =>
                                updateDraftQuestion(qIdx, (cur) => ({
                                  ...cur,
                                  answer: e.target.value,
                                }))
                              }
                              placeholder="پاسخ کامل و درست سوال تشریحی را اینجا بنویسید..."
                              className="glass-field w-full p-3.5 text-sm leading-7"
                            />
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                            <div className="space-y-1.5">
                              <label
                                htmlFor={`dq-prompt-${qIdx}`}
                                className="block text-xs font-medium text-[var(--muted)]"
                              >
                                صورت سوال تستی
                              </label>
                              <input
                                id={`dq-prompt-${qIdx}`}
                                type="text"
                                value={dq.question}
                                onChange={(e) =>
                                  updateDraftQuestion(qIdx, (cur) => ({
                                    ...cur,
                                    question: e.target.value,
                                  }))
                                }
                                placeholder="پرسش خود را بنویسید..."
                                className="glass-field w-full min-h-[44px] px-3.5 py-2.5 text-sm"
                              />
                            </div>

                            <div className="space-y-1.5">
                              <label
                                htmlFor={`dq-answer-${qIdx}`}
                                className="block text-xs font-medium text-[var(--muted)]"
                              >
                                دلیل پاسخ صحیح (نمایش زیر سوال پس از پاسخ)
                              </label>
                              <input
                                id={`dq-answer-${qIdx}`}
                                type="text"
                                value={dq.answer}
                                onChange={(e) =>
                                  updateDraftQuestion(qIdx, (cur) => ({
                                    ...cur,
                                    answer: e.target.value,
                                  }))
                                }
                                placeholder="مثلاً: متن صفحه ۴۹ بیان می‌کند که..."
                                className="glass-field w-full min-h-[44px] px-3.5 py-2.5 text-sm"
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-1 gap-2 sm:gap-2.5 sm:grid-cols-2">
                            {dq.options.map((opt, optIdx) => {
                              const letter = getOptionLetter(optIdx);
                              const isCorrectOpt = dq.correctOptionIndex === optIdx;
                              return (
                                <div
                                  key={optIdx}
                                  className={`flex items-center gap-2.5 rounded-xl px-3 min-h-[46px] py-2 border transition-colors ${
                                    isCorrectOpt
                                      ? 'border-[var(--blue)]/50 bg-[var(--blue-tint)]'
                                      : 'border-[var(--line)] bg-[var(--field)] sm:bg-[var(--sunk)]'
                                  }`}
                                >
                                  <input
                                    type="radio"
                                    name={`correct-opt-${dq.id}`}
                                    aria-label={`انتخاب گزینه ${letter} به عنوان پاسخ صحیح`}
                                    checked={isCorrectOpt}
                                    onChange={() =>
                                      updateDraftQuestion(qIdx, (cur) => ({
                                        ...cur,
                                        correctOptionIndex: optIdx,
                                      }))
                                    }
                                    className="h-5 w-5 accent-[var(--blue)] cursor-pointer shrink-0"
                                  />
                                  <span className="text-xs font-bold text-[var(--blue-ink)] shrink-0">
                                    {letter})
                                  </span>
                                  <input
                                    type="text"
                                    aria-label={`متن گزینه ${letter} سوال ${toPersianDigits(qIdx + 1)}`}
                                    value={opt}
                                    onChange={(e) =>
                                      updateDraftQuestion(qIdx, (cur) => {
                                        const nextOpts: [string, string, string, string] = [
                                          ...cur.options,
                                        ];
                                        nextOpts[optIdx] = e.target.value;
                                        return { ...cur, options: nextOpts };
                                      })
                                    }
                                    placeholder={`متن گزینه ${letter}`}
                                    className="w-full min-w-0 bg-transparent text-xs sm:text-sm text-[var(--ink)] focus:outline-none"
                                  />
                                </div>
                              );
                            })}
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {formError && (
            <p role="alert" className="rounded-xl bg-[var(--danger-tint)] px-4 py-2.5 text-xs font-semibold text-[var(--danger)] leading-6">
              {formError}
            </p>
          )}

          {/* Mobile Step Navigation + Form Submit Footer */}
          <div className="space-y-3 border-t border-[var(--line)] pt-4 md:border-t-0 md:pt-2">
            {/* Mobile Next/Prev Step Controls */}
            <div className="flex items-center justify-between gap-2 md:hidden">
              {mobileStep === 'info' ? (
                <button
                  type="button"
                  onClick={() => setMobileStep('content')}
                  className="btn-secondary-glass w-full min-h-[44px] inline-flex items-center justify-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold cursor-pointer whitespace-nowrap"
                >
                  <span>مرحله بعد: فصل‌ها و متن درس</span>
                  <ChevronLeft className="h-4 w-4 shrink-0" />
                </button>
              ) : mobileStep === 'content' ? (
                <>
                  <button
                    type="button"
                    onClick={() => setMobileStep('info')}
                    className="btn-secondary-glass min-h-[44px] inline-flex items-center justify-center gap-1 rounded-xl px-3.5 py-2 text-xs font-semibold cursor-pointer whitespace-nowrap"
                  >
                    <ChevronRight className="h-4 w-4 shrink-0" />
                    <span>مشخصات</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setMobileStep('questions')}
                    className="btn-secondary-glass flex-1 min-h-[44px] inline-flex items-center justify-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold cursor-pointer whitespace-nowrap"
                  >
                    <span>مرحله بعد: سوالات فصل</span>
                    <ChevronLeft className="h-4 w-4 shrink-0" />
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setMobileStep('content')}
                  className="btn-secondary-glass w-full min-h-[44px] inline-flex items-center justify-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold cursor-pointer whitespace-nowrap"
                >
                  <ChevronRight className="h-4 w-4 shrink-0" />
                  <span>بازگشت به متن فصل</span>
                </button>
              )}
            </div>

            <div className="flex flex-col-reverse gap-2.5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center justify-center sm:justify-start gap-2 text-xs text-[var(--muted)]">
                <BookOpen className="h-4 w-4 shrink-0" />
                <span>
                  در مجموع {toPersianDigits(chapters.length)} فصل برای این درس ثبت خواهد شد.
                </span>
              </div>
              <button
                type="submit"
                className="btn-primary-glass w-full sm:w-auto min-h-[48px] sm:min-h-0 inline-flex items-center justify-center gap-2 rounded-2xl sm:rounded-full px-7 py-3 text-sm font-bold cursor-pointer whitespace-nowrap"
              >
                <Save className="h-4 w-4 shrink-0" />
                <span>{editingLesson ? 'ذخیره تغییرات درس' : 'ذخیره و انتشار درس'}</span>
              </button>
            </div>
          </div>
        </form>
      ) : builderTab === 'import' ? (
        <section className="glass-card-strong p-4 sm:p-7 space-y-5 sm:space-y-6 rounded-[22px] sm:rounded-[26px] min-w-0">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between border-b border-[var(--line)] pb-4">
            <div>
              <h1 className="text-lg sm:text-xl font-extrabold text-[var(--ink-strong)]">
                ورود سریع درس (متن خام یا JSON)
              </h1>
              <p className="text-xs text-[var(--muted)] mt-1 leading-6">
                متن اسکن یا پیوست کتاب را مستقیم بچسبانید تا تیترها و پاورقی‌ها مرتب شوند، یا فایل JSON درس‌ها را وارد کنید.
              </p>
            </div>

            <div className="grid grid-cols-2 sm:inline-flex items-center gap-1 rounded-xl bg-[var(--sunk)] p-1 w-full sm:w-auto">
              <button
                type="button"
                onClick={() => {
                  setImportMode('raw');
                  setImportError('');
                }}
                className={`min-h-[42px] sm:min-h-0 inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold cursor-pointer whitespace-nowrap ${
                  importMode === 'raw'
                    ? 'bg-[var(--glass-strong)] text-[var(--blue-ink)] shadow-sm'
                    : 'text-[var(--muted)] hover:text-[var(--ink)]'
                }`}
              >
                <FileText className="h-3.5 w-3.5 shrink-0" />
                <span>چسباندن متن خام</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setImportMode('json');
                  setImportError('');
                }}
                className={`min-h-[42px] sm:min-h-0 inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold cursor-pointer whitespace-nowrap ${
                  importMode === 'json'
                    ? 'bg-[var(--glass-strong)] text-[var(--blue-ink)] shadow-sm'
                    : 'text-[var(--muted)] hover:text-[var(--ink)]'
                }`}
              >
                <Code2 className="h-3.5 w-3.5 shrink-0" />
                <span>ورود با JSON</span>
              </button>
            </div>
          </div>

          {importMode === 'raw' ? (
            <div className="space-y-4">
              <div className="rounded-2xl bg-[var(--blue-tint)] p-3.5 sm:p-4 text-xs sm:text-sm leading-7 text-[var(--blue-ink)]">
                خطوط «صفحه ۱، صفحه ۲...» به‌صورت خودکار حذف می‌شوند، پاورقی‌ها به نقل‌قول تبدیل می‌شوند و تیترهای کوتاه با «##» قالب‌بندی شده و در فرم فصل اول بارگذاری می‌شوند.
              </div>
              <div className="space-y-1.5">
                <label htmlFor="raw-import-textarea" className="block text-xs font-semibold text-[var(--muted)]">
                  متن خام کتاب یا جزوه *
                </label>
                <textarea
                  id="raw-import-textarea"
                  rows={9}
                  value={rawImportText}
                  onChange={(e) => setRawImportText(e.target.value)}
                  placeholder={'صفحه ۹\nفصل اول: عنوان فصل\n\nتیتر بخش اول\nمتن پاراگراف درس را اینجا بچسبانید...\nپاورقی صفحه ۹: توضیح پاورقی...'}
                  className="glass-field w-full p-3.5 sm:p-4 text-sm leading-8"
                />
              </div>

              {importError && (
                <p role="alert" className="rounded-xl bg-[var(--danger-tint)] px-4 py-2.5 text-xs font-semibold text-[var(--danger)]">
                  {importError}
                </p>
              )}

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleParseRawText}
                  className="btn-primary-glass w-full sm:w-auto min-h-[48px] sm:min-h-0 inline-flex items-center justify-center gap-2 rounded-2xl sm:rounded-full px-6 py-2.5 text-sm font-bold cursor-pointer whitespace-nowrap"
                >
                  <Sparkles className="h-4 w-4 shrink-0" />
                  <span>تبدیل و بارگذاری در فرم</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-2xl bg-[var(--sunk)] p-3.5 sm:p-4">
                <p className="text-xs text-[var(--muted)] leading-6">
                  پشتیبانی از یک شیء درس، آرایه‌ای از درس‌ها، درس‌های دارای chapters و سوالات تستی/تشریحی.
                </p>
                <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    data-testid="copy-lesson-json-sample-btn"
                    onClick={() => handleCopyJsonSample(SAMPLE_LESSON_JSON, 'lesson')}
                    className="btn-secondary-glass inline-flex items-center justify-center gap-1.5 rounded-xl sm:rounded-full min-h-[42px] sm:min-h-0 px-2.5 sm:px-4 py-2 text-xs font-semibold cursor-pointer whitespace-nowrap"
                  >
                    {copiedJsonSample === 'lesson' ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-[var(--ok)] shrink-0" />
                        <span className="text-[var(--ok-ink)] sm:hidden">کپی شد!</span>
                        <span className="text-[var(--ok-ink)] hidden sm:inline">نمونه JSON کپی شد</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5 shrink-0" />
                        <span className="sm:hidden">نمونه JSON (AI)</span>
                        <span className="hidden sm:inline">کپی نمونه JSON (برای AI)</span>
                      </>
                    )}
                  </button>

                  <label className="btn-secondary-glass inline-flex items-center justify-center gap-1.5 rounded-xl sm:rounded-full min-h-[42px] sm:min-h-0 px-2.5 sm:px-4 py-2 text-xs font-semibold cursor-pointer whitespace-nowrap">
                    <FileUp className="h-3.5 w-3.5 shrink-0" />
                    <span>انتخاب فایل JSON</span>
                    <input
                      type="file"
                      accept=".json,application/json"
                      onChange={handleJsonFileUpload}
                      className="sr-only"
                    />
                  </label>
                </div>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="json-import-textarea" className="block text-xs font-semibold text-[var(--muted)]">
                  محتوای JSON درس‌ها *
                </label>
                <textarea
                  id="json-import-textarea"
                  dir="ltr"
                  rows={9}
                  value={jsonImportText}
                  onChange={(e) => setJsonImportText(e.target.value)}
                  placeholder={SAMPLE_LESSON_JSON}
                  className="glass-field w-full p-3.5 sm:p-4 text-xs sm:text-sm font-mono-code leading-6"
                />
              </div>

              {importError && (
                <p role="alert" className="rounded-xl bg-[var(--danger-tint)] px-4 py-2.5 text-xs font-semibold text-[var(--danger)]">
                  {importError}
                </p>
              )}

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleImportJsonSubmit}
                  className="btn-primary-glass w-full sm:w-auto min-h-[48px] sm:min-h-0 inline-flex items-center justify-center gap-2 rounded-2xl sm:rounded-full px-6 py-2.5 text-sm font-bold cursor-pointer whitespace-nowrap"
                >
                  <Plus className="h-4 w-4 shrink-0" />
                  <span>وارد کردن و افزودن درس</span>
                </button>
              </div>
            </div>
          )}
        </section>
      ) : (
        <form
          onSubmit={handleQuickQuestionSubmit}
          className="glass-card-strong p-4 sm:p-7 space-y-5 rounded-[22px] sm:rounded-[26px] min-w-0"
          noValidate
        >
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-lg sm:text-xl font-extrabold text-[var(--ink-strong)]">
                افزودن سوال جدید به درس موجود
              </h1>
              <p className="text-xs text-[var(--muted)] mt-1 leading-6">
                سوال تستی یا تشریحی بلافاصله به بانک سوالات و حالت آزمون درس (و فصل انتخابی) اضافه می‌شود.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:flex sm:flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setShowQuickBatch((prev) => !prev);
                  setQuickError('');
                }}
                className={`min-h-[42px] sm:min-h-0 inline-flex items-center justify-center gap-1.5 rounded-xl sm:rounded-full px-4 py-2 text-xs font-semibold cursor-pointer whitespace-nowrap ${
                  showQuickBatch
                    ? 'bg-[var(--blue-tint)] text-[var(--blue-ink)] border border-[var(--blue)]'
                    : 'btn-secondary-glass'
                }`}
              >
                <FileText className="h-3.5 w-3.5 shrink-0" />
                <span>چسباندن متن تست (الف، ب، ج، د)</span>
              </button>

              {selectedQuickLesson && (
                <button
                  type="button"
                  onClick={() => onSelectLessonForEdit(selectedQuickLesson)}
                  className="btn-secondary-glass min-h-[42px] sm:min-h-0 inline-flex items-center justify-center gap-1.5 rounded-xl sm:rounded-full px-4 py-2 text-xs font-semibold cursor-pointer whitespace-nowrap"
                >
                  <Pencil className="h-3.5 w-3.5 shrink-0" />
                  <span>ویرایش کامل این درس</span>
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor="quick-lesson-select" className="block text-xs font-semibold text-[var(--muted)]">
                انتخاب درس مقصد
              </label>
              <select
                id="quick-lesson-select"
                value={targetLessonId}
                onChange={(e) => setTargetLessonId(e.target.value)}
                className="glass-field w-full min-h-[46px] px-3.5 py-2.5 text-sm"
              >
                {lessons.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.title}
                  </option>
                ))}
              </select>
            </div>

            {selectedQuickLesson?.chapters && selectedQuickLesson.chapters.length > 0 && (
              <div className="space-y-1.5">
                <label htmlFor="quick-chapter-select" className="block text-xs font-semibold text-[var(--muted)]">
                  انتخاب فصل مقصد
                </label>
                <select
                  id="quick-chapter-select"
                  value={targetChapterId}
                  onChange={(e) => setTargetChapterId(e.target.value)}
                  className="glass-field w-full min-h-[46px] px-3.5 py-2.5 text-sm"
                >
                  {selectedQuickLesson.chapters.map((ch) => (
                    <option key={ch.id} value={ch.id}>
                      {ch.title}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {showQuickBatch && (
            <div
              data-testid="quick-batch-text-panel"
              className="rounded-2xl border border-[var(--blue)] bg-[var(--sunk)] p-3.5 sm:p-4 space-y-3"
            >
              <div className="space-y-1">
                <p className="text-xs sm:text-sm font-bold text-[var(--ink-strong)]">
                  چسباندن مستقیم یک یا چند تست آماده
                </p>
                <p className="text-xs text-[var(--muted)]">
                  متن تست شامل الف)، ب)، ج)، د)، «پاسخ صحیح:» و «دلیل:» را اینجا وارد کنید.
                </p>
              </div>
              <textarea
                id="quick-batch-textarea"
                rows={8}
                value={quickBatchText}
                onChange={(e) => setQuickBatchText(e.target.value)}
                placeholder={'بر اساس متن، کدام یک از موارد زیر در مورد افسردگی مادر صحیح است؟\n\nالف) گزینه اول\nب) گزینه دوم\nج) هر دو مورد الف و ب\nد) هیچکدام\n\nپاسخ صحیح: ج\nدلیل: متن صفحه ۴۹ بیان می‌کند...'}
                className="glass-field w-full p-3.5 text-xs sm:text-sm leading-7"
              />
              <div className="grid grid-cols-[auto_1fr] sm:flex sm:justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowQuickBatch(false)}
                  className="btn-secondary-glass min-h-[44px] sm:min-h-0 rounded-xl sm:rounded-full px-4 py-2 text-xs font-semibold cursor-pointer whitespace-nowrap"
                >
                  بستن
                </button>
                <button
                  type="button"
                  onClick={handleQuickBatchTextAdd}
                  className="btn-primary-glass min-h-[44px] sm:min-h-0 inline-flex items-center justify-center gap-1.5 rounded-xl sm:rounded-full px-5 py-2 text-xs font-bold cursor-pointer whitespace-nowrap"
                >
                  <Plus className="h-3.5 w-3.5 shrink-0" />
                  <span>تحلیل و افزودن تست‌ها</span>
                </button>
              </div>
            </div>
          )}

          {/* Question Type Toggle (MCQ vs Descriptive) */}
          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between rounded-2xl bg-[var(--sunk)] p-3 border border-[var(--line)]">
            <span className="text-xs font-bold text-[var(--ink-2)]">نوع سوال:</span>
            <div
              className="grid grid-cols-2 sm:inline-flex w-full sm:w-auto items-center gap-1 rounded-xl bg-[var(--glass)] p-1"
              role="group"
              aria-label="نوع سوال جدید"
            >
              <button
                type="button"
                data-testid="quick-type-mcq"
                onClick={() => {
                  setQuickQ((prev) => ({ ...prev, questionType: 'mcq' }));
                  setQuickError('');
                }}
                className={`min-h-[40px] sm:min-h-0 rounded-lg px-2 sm:px-3.5 py-1.5 text-xs font-semibold cursor-pointer whitespace-nowrap transition-colors flex items-center justify-center ${
                  quickQ.questionType === 'mcq'
                    ? 'bg-[var(--glass-strong)] text-[var(--blue-ink)] shadow-sm'
                    : 'text-[var(--muted)] hover:text-[var(--ink)]'
                }`}
              >
                <span className="sm:hidden">تستی (۴ گزینه‌ای)</span>
                <span className="hidden sm:inline">سوال تستی (چهارگزینه‌ای)</span>
              </button>
              <button
                type="button"
                data-testid="quick-type-descriptive"
                onClick={() => {
                  setQuickQ((prev) => ({ ...prev, questionType: 'descriptive' }));
                  setQuickError('');
                }}
                className={`min-h-[40px] sm:min-h-0 rounded-lg px-2 sm:px-3.5 py-1.5 text-xs font-semibold cursor-pointer whitespace-nowrap transition-colors flex items-center justify-center ${
                  quickQ.questionType === 'descriptive'
                    ? 'bg-[var(--glass-strong)] text-[var(--purple-ink)] shadow-sm'
                    : 'text-[var(--muted)] hover:text-[var(--ink)]'
                }`}
              >
                <span className="sm:hidden">تشریحی (+ جواب)</span>
                <span className="hidden sm:inline">سوال تشریحی (+ جواب درست)</span>
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="quick-question-input" className="block text-xs font-semibold text-[var(--muted)]">
              {quickQ.questionType === 'descriptive' ? 'صورت سوال تشریحی *' : 'صورت سوال تستی *'}
            </label>
            <input
              id="quick-question-input"
              type="text"
              value={quickQ.question}
              onChange={(e) => setQuickQ((prev) => ({ ...prev, question: e.target.value }))}
              placeholder={
                quickQ.questionType === 'descriptive'
                  ? 'مثلاً: تأثیر افسردگی مادر بر رشد شناختی و عاطفی کودک را شرح دهید...'
                  : 'متن پرسش تستی...'
              }
              className="glass-field w-full min-h-[46px] px-3.5 py-2.5 text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="quick-answer-input" className="block text-xs font-semibold text-[var(--muted)]">
              {quickQ.questionType === 'descriptive'
                ? 'پاسخ درست سوال تشریحی *'
                : 'دلیل پاسخ صحیح (نمایش زیر سوال هنگام پاسخگویی) *'}
            </label>
            <textarea
              id="quick-answer-input"
              rows={quickQ.questionType === 'descriptive' ? 4 : 3}
              value={quickQ.answer}
              onChange={(e) => setQuickQ((prev) => ({ ...prev, answer: e.target.value }))}
              placeholder={
                quickQ.questionType === 'descriptive'
                  ? 'پاسخ کامل و درست سوال تشریحی را وارد کنید...'
                  : 'دلیل: متن صفحه ... بیان می‌کند ...'
              }
              className="glass-field w-full p-3.5 text-sm leading-7"
            />
          </div>

          {quickQ.questionType === 'mcq' && (
            <div className="grid grid-cols-1 gap-2 sm:gap-2.5 sm:grid-cols-2">
              {quickQ.options.map((opt, optIdx) => {
                const letter = getOptionLetter(optIdx);
                const isCorrectOpt = quickQ.correctOptionIndex === optIdx;
                return (
                  <div
                    key={optIdx}
                    className={`flex items-center gap-2.5 rounded-xl px-3 min-h-[46px] py-2 border transition-colors ${
                      isCorrectOpt
                        ? 'border-[var(--blue)]/50 bg-[var(--blue-tint)]'
                        : 'border-[var(--line)] bg-[var(--sunk)]'
                    }`}
                  >
                    <input
                      type="radio"
                      name="quick-correct-opt"
                      aria-label={`گزینه ${letter} صحیح است`}
                      checked={isCorrectOpt}
                      onChange={() =>
                        setQuickQ((prev) => ({ ...prev, correctOptionIndex: optIdx }))
                      }
                      className="h-5 w-5 accent-[var(--blue)] cursor-pointer shrink-0"
                    />
                    <span className="text-xs font-bold text-[var(--blue-ink)] shrink-0">
                      {letter})
                    </span>
                    <input
                      type="text"
                      aria-label={`متن گزینه ${letter}`}
                      value={opt}
                      onChange={(e) =>
                        setQuickQ((prev) => {
                          const nextOpts: [string, string, string, string] = [...prev.options];
                          nextOpts[optIdx] = e.target.value;
                          return { ...prev, options: nextOpts };
                        })
                      }
                      placeholder={`متن گزینه ${letter}`}
                      className="w-full min-w-0 bg-transparent text-xs sm:text-sm text-[var(--ink)] focus:outline-none"
                    />
                  </div>
                );
              })}
            </div>
          )}

          {quickError && (
            <p role="alert" className="rounded-xl bg-[var(--danger-tint)] px-4 py-2.5 text-xs font-semibold text-[var(--danger)]">
              {quickError}
            </p>
          )}

          <div className="flex justify-end">
            <button
              type="submit"
              className="btn-primary-glass w-full sm:w-auto min-h-[48px] sm:min-h-0 inline-flex items-center justify-center gap-2 rounded-2xl sm:rounded-full px-6 py-2.5 text-sm font-bold cursor-pointer whitespace-nowrap"
            >
              <Plus className="h-4 w-4 shrink-0" />
              <span>افزودن سوال به درس</span>
            </button>
          </div>
        </form>
      )}

      {(() => {
        const targetChapter =
          pendingChapterDeleteIdx !== null ? chapters[pendingChapterDeleteIdx] : undefined;
        const chapterQCount = targetChapter
          ? targetChapter.questions.filter((q) => !isQuestionBlank(q)).length
          : 0;
        const chapterTitleLabel = targetChapter
          ? targetChapter.title.trim() || `فصل ${toPersianDigits((pendingChapterDeleteIdx ?? 0) + 1)}`
          : '';
        return (
          <ConfirmDeleteModal
            open={Boolean(targetChapter) && chapters.length > 1}
            title="تایید حذف فصل"
            itemName={chapterTitleLabel}
            description={
              chapterQCount > 0
                ? `با تایید حذف، این فصل همراه با متن، خلاصه و ${toPersianDigits(chapterQCount)} سوال ثبت‌شده در آن حذف می‌شود.`
                : 'با تایید حذف، این فصل همراه با متن و خلاصه آن از فرم درس حذف می‌شود.'
            }
            confirmLabel="بله، فصل حذف شود"
            onConfirm={() => {
              if (pendingChapterDeleteIdx !== null) {
                handleDeleteChapter(pendingChapterDeleteIdx);
                setPendingChapterDeleteIdx(null);
              }
            }}
            onCancel={() => setPendingChapterDeleteIdx(null)}
          />
        );
      })()}
    </div>
  );
}
