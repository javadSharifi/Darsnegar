export interface CloudLessonItem {
  id: string;
  title: string;
  updatedAt: number;
  [key: string]: unknown;
}

export interface DeletedLessonRecord {
  id: string;
  deletedAt: number;
}

export interface CloudSyncBody {
  lessons?: CloudLessonItem[];
  deletedLessons?: DeletedLessonRecord[];
  progress?: Record<string, { state: string; updatedAt: number }>;
  gamification?: {
    streak: number;
    xp: number;
    lastActiveDate: string;
    examsCompleted?: number;
  };
  examHistory?: Array<{ id: string; completedAt: number; [key: string]: unknown }>;
}

export async function getUserCloudData(db: D1Database, userId: string) {
  const lessonsRows = await db
    .prepare('SELECT id, data_json, updated_at, deleted_at FROM user_lessons WHERE user_id = ?')
    .bind(userId)
    .all<{ id: string; data_json: string; updated_at: number; deleted_at: number | null }>();

  const lessons: CloudLessonItem[] = [];
  const deletedLessons: DeletedLessonRecord[] = [];

  for (const row of lessonsRows.results ?? []) {
    if (row.deleted_at && row.deleted_at >= row.updated_at) {
      deletedLessons.push({ id: row.id, deletedAt: row.deleted_at });
      continue;
    }
    try {
      const parsed = JSON.parse(row.data_json) as CloudLessonItem;
      lessons.push(parsed);
    } catch {
      // Skip malformed row safely
    }
  }

  const statesRows = await db
    .prepare('SELECT question_id, state, updated_at FROM user_states WHERE user_id = ?')
    .bind(userId)
    .all<{ question_id: string; state: string; updated_at: number }>();

  const progress: Record<string, { state: string; updatedAt: number }> = {};
  for (const row of statesRows.results ?? []) {
    progress[row.question_id] = {
      state: row.state,
      updatedAt: row.updated_at,
    };
  }

  const gamRow = await db
    .prepare(
      'SELECT streak, xp, last_active_date, exams_completed FROM user_gamification WHERE user_id = ?'
    )
    .bind(userId)
    .first<{
      streak: number;
      xp: number;
      last_active_date: string;
      exams_completed: number;
    }>();

  const gamification = gamRow
    ? {
        streak: gamRow.streak,
        xp: gamRow.xp,
        lastActiveDate: gamRow.last_active_date,
        examsCompleted: gamRow.exams_completed ?? 0,
      }
    : { streak: 1, xp: 0, lastActiveDate: '', examsCompleted: 0 };

  const examsRows = await db
    .prepare(
      'SELECT data_json FROM user_exams WHERE user_id = ? ORDER BY completed_at DESC LIMIT 30'
    )
    .bind(userId)
    .all<{ data_json: string }>();

  const examHistory: unknown[] = [];
  for (const row of examsRows.results ?? []) {
    try {
      examHistory.push(JSON.parse(row.data_json));
    } catch {
      // Skip malformed exam record
    }
  }

  return { lessons, deletedLessons, progress, gamification, examHistory };
}

export async function saveUserCloudData(
  db: D1Database,
  userId: string,
  payload: CloudSyncBody
) {
  let syncedLessons = 0;

  if (Array.isArray(payload.lessons) && payload.lessons.length > 0) {
    const chunkSize = 25;
    for (let i = 0; i < payload.lessons.length; i += chunkSize) {
      const chunk = payload.lessons.slice(i, i + chunkSize);
      const stmts = chunk
        .filter((lesson) => lesson && typeof lesson.id === 'string')
        .map((lesson) => {
          const updatedAt = typeof lesson.updatedAt === 'number' ? lesson.updatedAt : Date.now();
          return db
            .prepare(
              `INSERT INTO user_lessons (user_id, id, data_json, updated_at, deleted_at)
               VALUES (?, ?, ?, ?, NULL)
               ON CONFLICT(user_id, id) DO UPDATE SET
                 data_json = excluded.data_json,
                 updated_at = excluded.updated_at,
                 deleted_at = NULL
               WHERE excluded.updated_at >= user_lessons.updated_at`
            )
            .bind(userId, lesson.id, JSON.stringify(lesson), updatedAt);
        });
      if (stmts.length > 0) {
        await db.batch(stmts);
        syncedLessons += stmts.length;
      }
    }
  }

  if (Array.isArray(payload.deletedLessons) && payload.deletedLessons.length > 0) {
    const stmts = payload.deletedLessons
      .filter((rec) => rec && typeof rec.id === 'string')
      .map((rec) => {
        const delAt = typeof rec.deletedAt === 'number' ? rec.deletedAt : Date.now();
        return db
          .prepare(
            `INSERT INTO user_lessons (user_id, id, data_json, updated_at, deleted_at)
             VALUES (?, ?, '{}', 0, ?)
             ON CONFLICT(user_id, id) DO UPDATE SET
               deleted_at = excluded.deleted_at
             WHERE excluded.deleted_at >= user_lessons.updated_at`
          )
          .bind(userId, rec.id, delAt);
      });
    if (stmts.length > 0) {
      await db.batch(stmts);
    }
  }

  if (payload.progress && typeof payload.progress === 'object') {
    const entries = Object.entries(payload.progress);
    const chunkSize = 50;
    for (let i = 0; i < entries.length; i += chunkSize) {
      const chunk = entries.slice(i, i + chunkSize);
      const stmts = chunk.map(([qId, val]) =>
        db
          .prepare(
            `INSERT INTO user_states (user_id, question_id, state, updated_at)
             VALUES (?, ?, ?, ?)
             ON CONFLICT(user_id, question_id) DO UPDATE SET
               state = excluded.state,
               updated_at = excluded.updated_at
             WHERE excluded.updated_at >= user_states.updated_at`
          )
          .bind(userId, qId, val.state, val.updatedAt || Date.now())
      );
      if (stmts.length > 0) {
        await db.batch(stmts);
      }
    }
  }

  if (payload.gamification) {
    const g = payload.gamification;
    await db
      .prepare(
        `INSERT INTO user_gamification (user_id, streak, xp, last_active_date, exams_completed, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET
           streak = MAX(user_gamification.streak, excluded.streak),
           xp = MAX(user_gamification.xp, excluded.xp),
           exams_completed = MAX(user_gamification.exams_completed, excluded.exams_completed),
           last_active_date = CASE WHEN excluded.last_active_date > user_gamification.last_active_date THEN excluded.last_active_date ELSE user_gamification.last_active_date END,
           updated_at = excluded.updated_at`
      )
      .bind(
        userId,
        g.streak || 1,
        g.xp || 0,
        g.lastActiveDate || '',
        g.examsCompleted || 0,
        Date.now()
      )
      .run();
  }

  if (Array.isArray(payload.examHistory) && payload.examHistory.length > 0) {
    const stmts = payload.examHistory
      .slice(0, 30)
      .filter((ex) => ex && typeof ex.id === 'string')
      .map((ex) =>
        db
          .prepare(
            `INSERT INTO user_exams (user_id, id, data_json, completed_at)
             VALUES (?, ?, ?, ?)
             ON CONFLICT(user_id, id) DO NOTHING`
          )
          .bind(userId, ex.id, JSON.stringify(ex), ex.completedAt || Date.now())
      );
    if (stmts.length > 0) {
      await db.batch(stmts);
    }
  }

  return { success: true, syncedLessons };
}

export async function upsertSingleLesson(
  db: D1Database,
  userId: string,
  lesson: CloudLessonItem
) {
  const updatedAt = typeof lesson.updatedAt === 'number' ? lesson.updatedAt : Date.now();
  const normalized = { ...lesson, updatedAt };
  await db
    .prepare(
      `INSERT INTO user_lessons (user_id, id, data_json, updated_at, deleted_at)
       VALUES (?, ?, ?, ?, NULL)
       ON CONFLICT(user_id, id) DO UPDATE SET
         data_json = excluded.data_json,
         updated_at = excluded.updated_at,
         deleted_at = NULL`
    )
    .bind(userId, lesson.id, JSON.stringify(normalized), updatedAt)
    .run();
  return normalized;
}

export async function softDeleteLesson(db: D1Database, userId: string, lessonId: string) {
  const deletedAt = Date.now();
  await db
    .prepare(
      `INSERT INTO user_lessons (user_id, id, data_json, updated_at, deleted_at)
       VALUES (?, ?, '{}', 0, ?)
       ON CONFLICT(user_id, id) DO UPDATE SET
         deleted_at = excluded.deleted_at`
    )
    .bind(userId, lessonId, deletedAt)
    .run();
  return { success: true, deletedAt };
}
