import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFlashcardQueue,
  buildLessonFromChapters,
  createBackupPayload,
  estimateReadingMinutes,
  evaluateExam,
  extractLessonHeadings,
  formatAllLessonsForClipboard,
  formatDurationPersian,
  formatLessonForClipboard,
  getLessonMasteryStats,
  getOptionLetter,
  getQuestionType,
  parseFormattedPersianQuestions,
  parseImportedLessonJson,
  parseImportedQuestionsJson,
  parseLessonContent,
  parseMarkdownFileToLessonParts,
  parseRawTextbookToLessonDraft,
  SAMPLE_LESSON_JSON,
  SAMPLE_QUESTIONS_JSON,
  searchLessonsAndQuestions,
  toPersianDigits,
  updateGamificationOnActivity,
  validateBackupPayload,
} from './studyEngine';
import type { Lesson, LessonQuestion, UserQuestionProgress } from '../types/learning';

const sampleQuestions: LessonQuestion[] = [
  {
    id: 'q1',
    question: 'هوک useState چه خروجی برمی‌گرداند؟',
    answer: 'یک آرایه شامل مقدار فعلی و تابع به‌روزرسانی',
    options: ['آرایه دو عضوی', 'یک آبجکت', 'فقط مقدار', 'یک Promise'],
    correctOptionIndex: 0,
    level: 'junior',
  },
  {
    id: 'q2',
    question: 'کلید key در لیست‌های React چه نقشی دارد؟',
    answer: 'شناسایی پایدار عناصر بین رندرها',
    options: ['زیباسازی DOM', 'شناسایی یکتا در آشتی‌دهی', 'کش کردن API', 'مرتب‌سازی خودکار'],
    correctOptionIndex: 1,
    level: 'mid',
  },
  {
    id: 'q3',
    question: 'تفاوت Server Component با Client Component چیست؟',
    answer: 'کامپوننت سرور روی سرور رندر می‌شود و به باندل کلاینت اضافه نمی‌شود',
    options: ['فقط استایل می‌گیرد', 'روی سرور رندر می‌شود', 'هوک useState دارد', 'نیاز به DOM دارد'],
    correctOptionIndex: 1,
    level: 'senior',
  },
];

const sampleLesson: Lesson = {
  id: 'l1',
  title: 'مبانی React و هوک‌ها',
  category: 'React',
  level: 'junior',
  summary: 'آشنایی با State، Props و نحوه کارکرد رندر مجدد در ری‌اکت.',
  keyPoints: ['State تغییرپذیر است', 'Props فقط خواندنی است'],
  content: '## مقدمه\nری‌اکت یک کتابخانه رابط کاربری است.\n\n```tsx\nconst [count, setCount] = useState(0);\n```',
  questions: sampleQuestions,
  createdAt: 1000,
  updatedAt: 1000,
};

test('toPersianDigits converts Latin digits to Persian digits', () => {
  assert.equal(toPersianDigits('1234567890'), '۱۲۳۴۵۶۷۸۹۰');
  assert.equal(toPersianDigits(85), '۸۵');
});

test('updateGamificationOnActivity increments streak on consecutive day and resets after gap', () => {
  const initial = { xp: 20, streak: 2, lastActiveDate: '2026-11-10', examsCompleted: 0 };
  const sameDay = updateGamificationOnActivity(initial, 10, '2026-11-10', false);
  assert.equal(sameDay.xp, 30);
  assert.equal(sameDay.streak, 2);

  const nextDay = updateGamificationOnActivity(initial, 15, '2026-11-11', true);
  assert.equal(nextDay.xp, 35);
  assert.equal(nextDay.streak, 3);
  assert.equal(nextDay.examsCompleted, 1);

  const afterGap = updateGamificationOnActivity(initial, 10, '2026-11-14', false);
  assert.equal(afterGap.streak, 1);
});

test('buildFlashcardQueue prioritizes want_to_learn and unseen before know', () => {
  const progress: Record<string, UserQuestionProgress> = {
    q1: { state: 'know', updatedAt: 1 },
    q3: { state: 'want_to_learn', updatedAt: 2 },
  };
  const ordered = buildFlashcardQueue(sampleQuestions, progress);
  assert.deepEqual(
    ordered.map((q) => q.id),
    ['q3', 'q2', 'q1']
  );

  const seniorOnly = buildFlashcardQueue(sampleQuestions, progress, 'senior');
  assert.deepEqual(
    seniorOnly.map((q) => q.id),
    ['q3']
  );
});

test('evaluateExam scores answers, flags wrong IDs, and awards XP', () => {
  const result = evaluateExam(sampleQuestions, {
    q1: 0,
    q2: 1,
    q3: 0,
  });
  assert.equal(result.totalQuestions, 3);
  assert.equal(result.correctCount, 2);
  assert.equal(result.wrongCount, 1);
  assert.deepEqual(result.wrongQuestionIds, ['q3']);
  assert.equal(result.scorePercent, 67);
  assert.equal(result.passed, true);
  assert.equal(result.xpEarned, 50);
});

test('searchLessonsAndQuestions matches lessons and questions accurately', () => {
  const all = searchLessonsAndQuestions([sampleLesson], 'React');
  assert.equal(all.some((m) => m.type === 'lesson' && m.lessonId === 'l1'), true);
  assert.equal(all.some((m) => m.type === 'question' && m.questionId === 'q2'), true);

  const filteredOut = searchLessonsAndQuestions([sampleLesson], 'React', 'Next.js');
  assert.equal(filteredOut.length, 0);
});

test('getLessonMasteryStats computes percentage of known questions', () => {
  const stats = getLessonMasteryStats(sampleLesson, {
    q1: { state: 'know', updatedAt: 1 },
    q2: { state: 'want_to_learn', updatedAt: 2 },
  });
  assert.equal(stats.total, 3);
  assert.equal(stats.known, 1);
  assert.equal(stats.learning, 1);
  assert.equal(stats.percent, 33);
});

test('parseLessonContent extracts headings, paragraphs, blockquotes, and code blocks', () => {
  const blocks = parseLessonContent(`${sampleLesson.content}\n\n> پاورقی: نکته علمی`);
  assert.equal(blocks[0]?.type, 'heading');
  assert.equal(blocks[0]?.text, 'مقدمه');
  assert.equal(blocks[1]?.type, 'paragraph');
  assert.equal(blocks[2]?.type, 'code');
  assert.equal(blocks[2]?.language, 'tsx');
  assert.equal(blocks[3]?.type, 'blockquote');
  assert.equal(blocks[3]?.text, 'پاورقی: نکته علمی');
});

test('parseRawTextbookToLessonDraft strips page markers and promotes headings', () => {
  const raw = `صفحه ۹ (صفحه اول)\n\nارزیابی بالینی کودک\n\nمفهوم رشد همه‌جانبه\nاین فصل به ارزیابی عمومی و رشد همه‌جانبه کودک در بافت خانواده و محیط اجتماعی می‌پردازد.\n\nپاورقی صفحه ۹: 1- Prenatal`;
  const draft = parseRawTextbookToLessonDraft(raw);
  assert.equal(draft.title, 'ارزیابی بالینی کودک');
  assert.equal(draft.content.includes('صفحه ۹ (صفحه اول)'), false);
  assert.equal(draft.content.includes('## ارزیابی بالینی کودک'), true);
  assert.equal(draft.content.includes('## مفهوم رشد همه‌جانبه'), true);
  assert.equal(draft.content.includes('> پاورقی صفحه ۹: 1- Prenatal'), true);
});

test('parseImportedLessonJson accepts single lesson object and rejects invalid JSON', () => {
  const single = parseImportedLessonJson(
    JSON.stringify({
      title: 'رشد دلبستگی در کودکی',
      category: 'روانشناسی رشد',
      summary: 'بررسی الگوهای دلبستگی ایمن و ناایمن.',
      content: '## دلبستگی ایمن\nکودک در حضور مراقب آرامش می‌یابد.',
    })
  );
  assert.equal(single.ok, true);
  if (single.ok) {
    assert.equal(single.lessons.length, 1);
    assert.equal(single.lessons[0]?.questions.length, 0);
  }

  const invalid = parseImportedLessonJson('{broken');
  assert.equal(invalid.ok, false);
});

test('formatDurationPersian formats mm:ss with Persian digits', () => {
  assert.equal(formatDurationPersian(125), '۰۲:۰۵');
});

test('validateBackupPayload validates exported payloads and rejects malformed input', () => {
  const payload = createBackupPayload({
    lessons: [sampleLesson],
    progress: {},
    gamification: { xp: 0, streak: 1, lastActiveDate: '', examsCompleted: 0 },
    examHistory: [],
    settings: { theme: 'auto', fontSize: 'medium', examTimerMinutes: 5 },
  });
  assert.equal(validateBackupPayload(payload), true);
  assert.equal(validateBackupPayload({ foo: 'bar' }), false);
});

test('parseMarkdownFileToLessonParts strips YAML frontmatter and extracts title', () => {
  const md = `---\ntitle: test\n---\n# فصل اول: دلبستگی\n\nمتن اصلی فصل\n- نکته ۱`;
  const parsed = parseMarkdownFileToLessonParts(md);
  assert.equal(parsed.suggestedTitle, 'فصل اول: دلبستگی');
  assert.equal(parsed.content.startsWith('# فصل اول: دلبستگی'), true);
});

test('parseImportedQuestionsJson parses question arrays and rejects malformed JSON', () => {
  const res = parseImportedQuestionsJson(
    JSON.stringify([
      {
        question: 'نمره آپگار طبیعی چیست؟',
        options: ['۷ تا ۱۰', 'زیر ۳', '۰ تا ۲', '۵'],
        correctOptionIndex: 0,
        answer: 'نمره ۷ تا ۱۰ بهترین وضعیت است.',
      },
    ])
  );
  assert.equal(res.ok, true);
  if (res.ok) {
    assert.equal(res.questions.length, 1);
    assert.equal(res.questions[0]?.correctOptionIndex, 0);
  }

  const bad = parseImportedQuestionsJson('{invalid');
  assert.equal(bad.ok, false);
});

test('buildLessonFromChapters aggregates chapters, summaries, and tagged questions', () => {
  const lesson = buildLessonFromChapters({
    id: 'lesson-ch-test',
    title: 'کتاب روانشناسی رشد',
    category: 'روانشناسی کودک',
    chapters: [
      {
        id: 'ch-1',
        title: 'فصل اول',
        summary: 'خلاصه فصل اول',
        content: 'متن فصل اول',
        questions: [sampleQuestions[0]],
      },
      {
        id: 'ch-2',
        title: 'فصل دوم',
        summary: 'خلاصه فصل دوم',
        content: 'متن فصل دوم',
        questions: [sampleQuestions[1]],
      },
    ],
    createdAt: 1000,
    updatedAt: 2000,
  });

  assert.equal(lesson.chapters?.length, 2);
  assert.equal(lesson.questions.length, 2);
  assert.equal(lesson.questions[0]?.chapterId, 'ch-1');
  assert.equal(lesson.questions[1]?.chapterTitle, 'فصل دوم');
  assert.equal(lesson.content.includes('## فصل دوم'), true);
  assert.equal(lesson.summary.includes('فصل اول: خلاصه فصل اول'), true);
});

test('searchLessonsAndQuestions finds lessons matching classroom notes', () => {
  const withNotes: Lesson = {
    ...sampleLesson,
    classNotes: [
      {
        id: 'note-1',
        title: 'نکات استاد جلسه ۳',
        content: 'استاد مثال دلبستگی ایمن بابی را در کلاس توضیح داد.',
        createdAt: 1000,
        updatedAt: 1000,
      },
    ],
  };
  const matches = searchLessonsAndQuestions([withNotes], 'بابی');
  assert.equal(matches.some((m) => m.type === 'lesson' && m.lessonId === 'l1'), true);
});

test('getOptionLetter maps indices 0..3 to الف، ب، ج، د', () => {
  assert.equal(getOptionLetter(0), 'الف');
  assert.equal(getOptionLetter(1), 'ب');
  assert.equal(getOptionLetter(2), 'ج');
  assert.equal(getOptionLetter(3), 'د');
});

test('parseFormattedPersianQuestions parses single and multiple Persian tests with الف-د, پاسخ صحیح, and دلیل', () => {
  const raw = `بر اساس متن، کدام یک از موارد زیر در مورد افسردگی مادر و تأثیر آن بر کودکان صحیح است؟

الف) شواهد نیرومندی وجود دارد که فرزندان مادران افسرده در تمامی سنین در معرض خطر ابتلاء به انواع آسیبهای روانی قرار دارند
ب) در رشد عاطفی، اجتماعی و شناختیشان تأخیر و نقص نشان میدهند
ج) هر دو مورد الف و ب
د) هیچکدام

پاسخ صحیح: ج
دلیل: متن صفحه ۴۹ بیان میکند: «شواهد نیرومندی وجود دارد که نشان میدهند فرزندان مادران افسرده در تمامی سنین در معرض خطر ابتلاء به انواع آسیبهای روانی قرار دارند و در رشد عاطفی، اجتماعی و شناختیشان تأخیر و نقص نشان میدهند.»

۲. مدل یکپارچه‌نگر گودمن و گوتلیب چند مکانیسم انتقال خطر معرفی می‌کند؟
الف) ۲ مکانیسم
ب) ۴ مکانیسم
ج) ۶ مکانیسم
د) ۸ مکانیسم
پاسخ صحیح: ب
دلیل: در فصل سوم کتاب به ۴ مکانیسم اصلی اشاره شده است.`;

  const res = parseFormattedPersianQuestions(raw);
  assert.equal(res.ok, true);
  if (res.ok) {
    assert.equal(res.questions.length, 2);
    assert.equal(res.questions[0]?.correctOptionIndex, 2);
    assert.equal(res.questions[0]?.options.length, 4);
    assert.equal(res.questions[0]?.options[2], 'هر دو مورد الف و ب');
    assert.equal(res.questions[0]?.answer.includes('متن صفحه ۴۹ بیان میکند'), true);

    assert.equal(res.questions[1]?.question, 'مدل یکپارچه‌نگر گودمن و گوتلیب چند مکانیسم انتقال خطر معرفی می‌کند؟');
    assert.equal(res.questions[1]?.correctOptionIndex, 1);
    assert.equal(res.questions[1]?.answer, 'در فصل سوم کتاب به ۴ مکانیسم اصلی اشاره شده است.');
  }
});

test('parseImportedQuestionsJson supports correctOption letter and reason field aliases', () => {
  const res = parseImportedQuestionsJson(
    JSON.stringify([
      {
        question: 'کدام گزینه صحیح است؟',
        options: ['الف اول', 'ب دوم', 'ج سوم', 'د چهارم'],
        correctOption: 'ج',
        reason: 'بر اساس صفحه ۴۹ کتاب.',
      },
    ])
  );
  assert.equal(res.ok, true);
  if (res.ok) {
    assert.equal(res.questions[0]?.correctOptionIndex, 2);
    assert.equal(res.questions[0]?.answer, 'بر اساس صفحه ۴۹ کتاب.');
  }
});

test('formatLessonForClipboard and formatAllLessonsForClipboard include all chapters, summaries, and class notes', () => {
  const lessonWithChaptersAndNotes: Lesson = {
    ...sampleLesson,
    chapters: [
      {
        id: 'ch-1',
        title: 'فصل اول: مبانی',
        summary: 'خلاصه فصل اول',
        content: 'متن کامل فصل اول',
        questions: [],
      },
      {
        id: 'ch-2',
        title: 'فصل دوم: تکمیلی',
        summary: 'خلاصه فصل دوم',
        content: 'متن کامل فصل دوم',
        questions: [],
      },
    ],
    classNotes: [
      {
        id: 'n-1',
        title: 'جزوه جلسه چهارم استاد',
        content: 'نکته خارج از کتاب درباره ارزیابی کودک.',
        chapterId: 'ch-2',
        chapterTitle: 'فصل دوم: تکمیلی',
        createdAt: 1000,
        updatedAt: 1000,
      },
    ],
  };

  const single = formatLessonForClipboard(lessonWithChaptersAndNotes);
  assert.equal(single.includes('فصل اول: مبانی'), true);
  assert.equal(single.includes('متن کامل فصل دوم'), true);
  assert.equal(single.includes('جزوه سر کلاس و نکات استاد'), true);
  assert.equal(single.includes('نکته خارج از کتاب درباره ارزیابی کودک.'), true);

  const all = formatAllLessonsForClipboard([lessonWithChaptersAndNotes, sampleLesson]);
  assert.equal(all.includes('========================================'), true);
  assert.equal(all.includes('مبانی React و هوک‌ها'), true);
});

test('extractLessonHeadings and estimateReadingMinutes extract deterministic section IDs and word-based reading time', () => {
  const md = `## بخش اول: مقدمه\nمتن کوتاه درباره ارزیابی کودک.\n\n### زیربخش دوم\n${'واژه '.repeat(220)}`;
  const headings = extractLessonHeadings(md, 'sec');
  assert.deepEqual(headings, [
    { id: 'sec-0', text: 'بخش اول: مقدمه' },
    { id: 'sec-1', text: 'زیربخش دوم' },
  ]);
  assert.equal(estimateReadingMinutes(md), 2);
  assert.equal(estimateReadingMinutes(''), 1);
});

test('evaluateExam scores mixed MCQ and descriptive questions using descriptiveSelfGrades', () => {
  const descriptiveQ: LessonQuestion = {
    id: 'q-desc-1',
    questionType: 'descriptive',
    question: 'عوامل خطر افسردگی مادر بر رشد کودک چیست؟',
    answer: 'تأخیر در رشد عاطفی، اجتماعی و شناختی و آسیب‌پذیری روانی در همه سنین.',
    options: [],
    correctOptionIndex: 0,
    level: 'mid',
  };
  const mixed = [sampleQuestions[0], descriptiveQ];

  assert.equal(getQuestionType(sampleQuestions[0]), 'mcq');
  assert.equal(getQuestionType(descriptiveQ), 'descriptive');

  const bothCorrect = evaluateExam(mixed, { q1: 0 }, { 'q-desc-1': true });
  assert.equal(bothCorrect.totalQuestions, 2);
  assert.equal(bothCorrect.correctCount, 2);
  assert.equal(bothCorrect.wrongQuestionIds.length, 0);
  assert.equal(bothCorrect.scorePercent, 100);
  assert.equal(bothCorrect.passed, true);

  const descMissed = evaluateExam(mixed, { q1: 0 }, { 'q-desc-1': false });
  assert.equal(descMissed.correctCount, 1);
  assert.deepEqual(descMissed.wrongQuestionIds, ['q-desc-1']);
  assert.equal(descMissed.scorePercent, 50);
  assert.equal(descMissed.passed, false);
});

test('parseImportedQuestionsJson supports descriptive questions alongside MCQ', () => {
  const res = parseImportedQuestionsJson(
    JSON.stringify([
      {
        questionType: 'descriptive',
        question: 'چرا ارزیابی محیط خانواده در کودک مهم است؟',
        answer: 'زیرا رفتار کودک بدون توجه به بافت خانواده قابل درک نیست.',
      },
      {
        question: 'کدام گزینه صحیح است؟',
        options: ['الف', 'ب', 'ج', 'د'],
        correctOptionIndex: 1,
        answer: 'گزینه ب صحیح است.',
      },
    ])
  );

  assert.equal(res.ok, true);
  if (res.ok) {
    assert.equal(res.questions.length, 2);
    assert.equal(res.questions[0]?.questionType, 'descriptive');
    assert.equal(res.questions[0]?.options.length, 0);
    assert.equal(
      res.questions[0]?.answer,
      'زیرا رفتار کودک بدون توجه به بافت خانواده قابل درک نیست.'
    );
    assert.equal(res.questions[1]?.questionType, 'mcq');
  }
});

test('courseOverview persists in buildLessonFromChapters, search, and clipboard formatting', () => {
  const lesson = buildLessonFromChapters({
    id: 'lesson-ov',
    title: 'آسیب‌شناسی روانی کودک',
    category: 'روانشناسی کودک',
    courseOverview: 'تاریخ میان‌ترم: ۲۵ آذر ساعت ۱۰ صبح — استاد دکتر رضایی',
    chapters: [
      {
        id: 'ch-1',
        title: 'فصل اول',
        summary: 'خلاصه',
        content: 'متن',
        questions: [],
      },
    ],
    createdAt: 1000,
    updatedAt: 2000,
  });

  assert.equal(
    lesson.courseOverview,
    'تاریخ میان‌ترم: ۲۵ آذر ساعت ۱۰ صبح — استاد دکتر رضایی'
  );
  const clip = formatLessonForClipboard(lesson);
  assert.equal(clip.includes('توضیحات کلی درباره درس'), true);
  assert.equal(clip.includes('۲۵ آذر'), true);

  const searchRes = searchLessonsAndQuestions([lesson], 'میان‌ترم');
  assert.equal(searchRes.some((m) => m.type === 'lesson' && m.lessonId === 'lesson-ov'), true);
});

test('SAMPLE_QUESTIONS_JSON and SAMPLE_LESSON_JSON parse cleanly with mixed MCQ and descriptive questions', () => {
  const qRes = parseImportedQuestionsJson(SAMPLE_QUESTIONS_JSON);
  assert.equal(qRes.ok, true);
  if (qRes.ok) {
    assert.equal(qRes.questions.length, 2);
    assert.equal(getQuestionType(qRes.questions[0]), 'mcq');
    assert.equal(getQuestionType(qRes.questions[1]), 'descriptive');
  }

  const lRes = parseImportedLessonJson(SAMPLE_LESSON_JSON);
  assert.equal(lRes.ok, true);
  if (lRes.ok) {
    assert.equal(lRes.lessons.length, 1);
    const parsedLesson = lRes.lessons[0];
    assert.equal(Boolean(parsedLesson.courseOverview), true);
    assert.equal(parsedLesson.chapters?.length, 1);
    assert.equal(parsedLesson.questions.length, 2);
    assert.equal(getQuestionType(parsedLesson.questions[0]), 'mcq');
    assert.equal(getQuestionType(parsedLesson.questions[1]), 'descriptive');
  }
});
