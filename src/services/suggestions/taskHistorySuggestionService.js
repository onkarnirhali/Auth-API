'use strict';

const pool = require('../../config/db');

const MIN_CREATED_TASKS = Number(process.env.AI_TASK_HISTORY_MIN_CREATED_TASKS || 10);
const MIN_ACCEPTED_SUGGESTIONS = Number(process.env.AI_TASK_HISTORY_MIN_ACCEPTED_SUGGESTIONS || 5);
const MAX_RESULTS = Number(process.env.AI_TASK_HISTORY_MAX_RESULTS || 4);
const RECENT_TODO_SCAN_LIMIT = Number(process.env.AI_TASK_HISTORY_SCAN_LIMIT || 200);
const MIN_RECURRENCE_COUNT = Number(process.env.AI_TASK_HISTORY_MIN_RECURRENCE || 2);

const SOURCE_METADATA = {
  source: 'task_history',
  sourceLabel: 'Learned from previous tasks',
};

function normalizeTitle(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanTitle(value) {
  const title = String(value || '').trim();
  if (!title) return '';
  return title.length > 120 ? title.slice(0, 120).trim() : title;
}

function cleanDetail(value) {
  const detail = String(value || '').trim();
  if (!detail) return null;
  return detail.length > 280 ? `${detail.slice(0, 277).trim()}...` : detail;
}

async function getTaskHistoryStats(userId) {
  const [createdCountResult, acceptedCountResult] = await Promise.all([
    pool.query('SELECT COUNT(*)::int AS count FROM todos WHERE user_id = $1', [userId]),
    pool.query(
      "SELECT COUNT(*)::int AS count FROM ai_suggestions WHERE user_id = $1 AND status = 'accepted'",
      [userId]
    ),
  ]);

  return {
    createdTasks: Number(createdCountResult.rows[0]?.count || 0),
    acceptedSuggestions: Number(acceptedCountResult.rows[0]?.count || 0),
  };
}

function isTaskHistoryEligible(stats) {
  return stats.createdTasks >= MIN_CREATED_TASKS || stats.acceptedSuggestions >= MIN_ACCEPTED_SUGGESTIONS;
}

async function loadRecentTaskHistory(userId) {
  const [todosResult, acceptedSuggestionsResult] = await Promise.all([
    pool.query(
      `
      SELECT id, title, description, status, priority, due_date, created_at, updated_at
      FROM todos
      WHERE user_id = $1
      ORDER BY updated_at DESC
      LIMIT $2;
      `,
      [userId, RECENT_TODO_SCAN_LIMIT]
    ),
    pool.query(
      `
      SELECT id, title, detail, metadata, created_at, updated_at
      FROM ai_suggestions
      WHERE user_id = $1 AND status = 'accepted'
      ORDER BY updated_at DESC
      LIMIT $2;
      `,
      [userId, RECENT_TODO_SCAN_LIMIT]
    ),
  ]);

  return {
    todos: todosResult.rows || [],
    acceptedSuggestions: acceptedSuggestionsResult.rows || [],
  };
}

function buildRecurringTitleSuggestions(history) {
  const map = new Map();

  const pushTitle = (rawTitle, contextType) => {
    const title = cleanTitle(rawTitle);
    if (!title) return;
    const key = normalizeTitle(title);
    if (!key) return;
    const entry = map.get(key) || {
      displayTitle: title,
      count: 0,
      sources: new Set(),
    };
    entry.count += 1;
    entry.sources.add(contextType);
    if (entry.displayTitle.length < title.length) {
      entry.displayTitle = title;
    }
    map.set(key, entry);
  };

  for (const todo of history.todos || []) {
    pushTitle(todo.title, 'todo');
  }
  for (const suggestion of history.acceptedSuggestions || []) {
    pushTitle(suggestion.title, 'accepted_suggestion');
  }

  const recurring = Array.from(map.values())
    .filter((entry) => entry.count >= MIN_RECURRENCE_COUNT)
    .sort((a, b) => b.count - a.count)
    .slice(0, MAX_RESULTS)
    .map((entry) => ({
      title: cleanTitle(entry.displayTitle),
      detail: cleanDetail(`You have repeated this ${entry.count} times. Consider scheduling it proactively.`),
      sourceMessageIds: [],
      confidence: null,
      status: 'suggested',
      metadata: {
        ...SOURCE_METADATA,
        historyType: 'recurring_title',
        recurrenceCount: entry.count,
      },
    }));

  return recurring;
}

function buildCadenceSuggestion(history) {
  const dueByWeekday = new Map();
  for (const todo of history.todos || []) {
    if (!todo?.due_date) continue;
    const date = new Date(todo.due_date);
    if (Number.isNaN(date.getTime())) continue;
    const weekday = date.toLocaleDateString('en-US', { weekday: 'long' });
    dueByWeekday.set(weekday, (dueByWeekday.get(weekday) || 0) + 1);
  }

  const ranked = Array.from(dueByWeekday.entries()).sort((a, b) => b[1] - a[1]);
  const top = ranked[0];
  if (!top || top[1] < 3) return null;

  return {
    title: `Plan your ${top[0]} priorities`,
    detail: cleanDetail(`Many tasks land on ${top[0]}. Prepare a checklist in advance.`),
    sourceMessageIds: [],
    confidence: null,
    status: 'suggested',
    metadata: {
      ...SOURCE_METADATA,
      historyType: 'due_date_cadence',
      weekday: top[0],
      recurrenceCount: top[1],
    },
  };
}

function buildBacklogSuggestion(history) {
  const openStatuses = new Set(['pending', 'todo', 'in_progress', 'blocked', 'open']);
  const pendingTodos = (history.todos || []).filter((todo) => openStatuses.has(String(todo.status || '').toLowerCase()));
  if (pendingTodos.length < 5) return null;

  return {
    title: 'Review and triage pending tasks',
    detail: cleanDetail(`You currently have ${pendingTodos.length} open tasks. Re-prioritize your backlog.`),
    sourceMessageIds: [],
    confidence: null,
    status: 'suggested',
    metadata: {
      ...SOURCE_METADATA,
      historyType: 'backlog_triage',
      pendingCount: pendingTodos.length,
    },
  };
}

function buildTaskHistorySuggestions(history) {
  const recurring = buildRecurringTitleSuggestions(history);
  const extras = [buildCadenceSuggestion(history), buildBacklogSuggestion(history)].filter(Boolean);

  const all = [...recurring, ...extras];
  const deduped = [];
  const seen = new Set();
  for (const suggestion of all) {
    const key = normalizeTitle(suggestion.title);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    deduped.push(suggestion);
    if (deduped.length >= MAX_RESULTS) break;
  }
  return deduped;
}

async function generateTaskHistorySuggestions(userId) {
  const stats = await getTaskHistoryStats(userId);
  const historyReady = isTaskHistoryEligible(stats);
  if (!historyReady) {
    return {
      suggestions: [],
      stats,
      historyReady: false,
      reasonCode: 'INSUFFICIENT_HISTORY',
    };
  }

  const history = await loadRecentTaskHistory(userId);
  const suggestions = buildTaskHistorySuggestions(history);
  return {
    suggestions,
    stats,
    historyReady: true,
  };
}

module.exports = {
  MIN_CREATED_TASKS,
  MIN_ACCEPTED_SUGGESTIONS,
  isTaskHistoryEligible,
  getTaskHistoryStats,
  generateTaskHistorySuggestions,
};
