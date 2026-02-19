'use strict';

const { getAuthorizedGmail } = require('./client');
const { parseGmailMessage } = require('./messageParser');
const gmailSyncCursor = require('../../models/gmailSyncCursorModel');
const emailEmbeddings = require('../../models/emailEmbeddingModel');
const { embedTextWithUsage } = require('../ai/embeddingService');
const { summarizeEmailText } = require('../ai/emailSummaryService');

const MAX_MESSAGES = Number(process.env.AI_GMAIL_MAX_MESSAGES || 50) || 50;
const LOOKBACK_DAYS = Number(process.env.AI_GMAIL_LOOKBACK_DAYS || 30) || 30;
const EXCLUDE_CATEGORIES = process.env.AI_GMAIL_EXCLUDE_CATEGORIES || 'promotions,social';
const EXCLUDE_LABEL_IDS = process.env.AI_GMAIL_EXCLUDE_LABELS || 'CATEGORY_PROMOTIONS,CATEGORY_SOCIAL';
const SINGLE_EMAIL_SUMMARY_WORDS = Number(process.env.AI_EMAIL_SUMMARY_MAX_WORDS_SINGLE || 300) || 300;
const THREAD_SUMMARY_WORDS = Number(process.env.AI_EMAIL_SUMMARY_MAX_WORDS_THREAD || 1000) || 1000;
const SUMMARY_INPUT_MAX_CHARS = Number(process.env.AI_SUMMARY_MAX_INPUT_CHARS || 12000) || 12000;
const TRUNCATED_REASON = {
  MANUAL_CAP: 'MANUAL_CAP',
  TIME_BUDGET: 'TIME_BUDGET',
};

function buildAfterQuery(cursor) {
  if (cursor?.lastInternalDateMs) {
    const seconds = Math.floor(cursor.lastInternalDateMs / 1000);
    return `after:${seconds}`;
  }
  const now = Date.now();
  const ms = LOOKBACK_DAYS * 24 * 60 * 60 * 1000;
  const afterSeconds = Math.floor((now - ms) / 1000);
  return `after:${afterSeconds}`;
}

function isDeadlineExceeded(deadlineAt) {
  return Boolean(deadlineAt && Date.now() >= Number(deadlineAt));
}

async function listMessageIds(gmail, query, maxMessages, options = {}) {
  const ids = [];
  let pageToken = undefined;
  let hasMore = false;
  let timedOut = false;
  while (ids.length < maxMessages) {
    if (isDeadlineExceeded(options.deadlineAt)) {
      timedOut = true;
      break;
    }

    const exclusions = (EXCLUDE_CATEGORIES || '')
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean)
      .map((c) => `-category:${c}`)
      .join(' ');
    const fullQuery = exclusions ? `${query} ${exclusions}` : query;

    const { data } = await gmail.users.messages.list({
      userId: 'me',
      maxResults: Math.min(50, maxMessages - ids.length),
      pageToken,
      labelIds: ['INBOX'],
      q: fullQuery,
      includeSpamTrash: false,
    });
    const batch = data?.messages || [];
    ids.push(...batch.map((m) => m.id));
    if (ids.length >= maxMessages && data?.nextPageToken) {
      hasMore = true;
      break;
    }
    if (!data?.nextPageToken || batch.length === 0) break;
    pageToken = data.nextPageToken;
  }
  return { ids, hasMore, timedOut };
}

async function fetchMessage(gmail, id) {
  const { data } = await gmail.users.messages.get({
    id,
    userId: 'me',
    format: 'full',
  });
  return data;
}

async function ingestNewEmailsForUser(userId, options = {}) {
  const { gmail } = await getAuthorizedGmail(userId);
  const cursor = await gmailSyncCursor.getByUserId(userId);
  const requestedMaxMessages = Number(options.maxMessages);
  const maxMessages = Number.isFinite(requestedMaxMessages) && requestedMaxMessages > 0
    ? Math.min(Math.floor(requestedMaxMessages), MAX_MESSAGES)
    : MAX_MESSAGES;
  const query = buildAfterQuery(cursor);
  const deadlineAt = options.deadlineAt || null;

  const listResult = await listMessageIds(gmail, query, maxMessages, { deadlineAt });
  const messageIds = listResult.ids;
  if (messageIds.length === 0) {
    const truncated = Boolean(listResult.timedOut || listResult.hasMore);
    return {
      ingested: 0,
      cursor: cursor || null,
      embeddings: [],
      processedMessages: 0,
      truncated,
      truncatedReason: listResult.timedOut ? TRUNCATED_REASON.TIME_BUDGET : (listResult.hasMore ? TRUNCATED_REASON.MANUAL_CAP : undefined),
    };
  }

  // Fetch + parse messages and track newest internal date for cursor advancement
  const parsedArray = [];
  let newestInternalMs = cursor?.lastInternalDateMs || 0;
  let newestId = cursor?.lastGmailMessageId || null;
  let timedOut = Boolean(listResult.timedOut);

  const excludedLabels = (EXCLUDE_LABEL_IDS || '').split(',').map((s) => s.trim()).filter(Boolean);

  for (const id of messageIds) {
    if (isDeadlineExceeded(deadlineAt)) {
      timedOut = true;
      break;
    }

    try {
      const message = await fetchMessage(gmail, id);
      const labels = message?.labelIds || [];
      if (labels.some((l) => excludedLabels.includes(l))) continue;
      const parsedMessage = parseGmailMessage(message);
      if (!parsedMessage || !parsedMessage.plainText) continue;
      parsedArray.push(parsedMessage);
      if (parsedMessage.internalDateMs && parsedMessage.internalDateMs > newestInternalMs) {
        newestInternalMs = parsedMessage.internalDateMs;
        newestId = parsedMessage.gmailMessageId;
      }
    } catch (err) {
      console.error('Failed to fetch/parse Gmail message', { userId, id, error: err?.message });
    }
  }

  // Summarize (store in plain_text) then embed
  const embeddings = [];
  const threadBuckets = new Map();
  for (const msg of parsedArray) {
    const key = msg.gmailThreadId || msg.gmailMessageId;
    const existing = threadBuckets.get(key) || [];
    existing.push(msg);
    threadBuckets.set(key, existing);
  }

  for (const bucket of threadBuckets.values()) {
    if (isDeadlineExceeded(deadlineAt)) {
      timedOut = true;
      break;
    }

    const isThread = bucket.length > 1;
    const maxWords = isThread ? THREAD_SUMMARY_WORDS : SINGLE_EMAIL_SUMMARY_WORDS;
    const combinedText = bucket
      .map((m) => [m.subject ? `Subject: ${m.subject}` : null, m.plainText].filter(Boolean).join('\n'))
      .join('\n----\n');
    const safeCombinedText = combinedText.length > SUMMARY_INPUT_MAX_CHARS ? combinedText.slice(0, SUMMARY_INPUT_MAX_CHARS) : combinedText;

    let summary = '';
    try {
      summary = await summarizeEmailText(safeCombinedText, {
        maxWords,
        contextLabel: isThread ? 'email thread' : 'email',
      });
    } catch (err) {
      console.error('Failed to summarize Gmail message(s)', {
        userId,
        threadId: bucket[0]?.gmailThreadId || bucket[0]?.gmailMessageId,
        error: err?.message,
      });
    }

    const summaryText = summary || safeCombinedText;

    for (const msg of bucket) {
      if (isDeadlineExceeded(deadlineAt)) {
        timedOut = true;
        break;
      }
      try {
        const embedded = await embedTextWithUsage(summaryText, {
          userId,
          source: 'gmail',
          purpose: 'email_ingest',
        });
        const embedding = embedded ? embedded.embedding : null;
        if (!embedding) continue;
        embeddings.push({
          gmailMessageId: msg.gmailMessageId,
          gmailThreadId: msg.gmailThreadId,
          subject: msg.subject,
          snippet: msg.snippet,
          plainText: summaryText,
          sentAt: msg.sentAt,
          embedding,
          metadata: {
            ...msg.metadata,
            summarySource: isThread ? 'thread' : 'message',
            summaryWordCap: maxWords,
            usedSummary: Boolean(summary),
          },
        });
      } catch (err) {
        console.error('Failed to embed Gmail message', { userId, messageId: msg.gmailMessageId, error: err?.message });
      }
    }
  }

  const saved = await emailEmbeddings.upsertMany(userId, embeddings);
  if (newestInternalMs) {
    await gmailSyncCursor.upsertCursor({
      userId,
      lastHistoryId: cursor?.lastHistoryId || null,
      lastInternalDateMs: newestInternalMs,
      lastGmailMessageId: newestId,
    });
  }

  const truncated = Boolean(timedOut || listResult.hasMore);
  return {
    ingested: saved.length,
    cursor: cursor || null,
    embeddings: saved,
    processedMessages: parsedArray.length,
    truncated,
    truncatedReason: timedOut ? TRUNCATED_REASON.TIME_BUDGET : (listResult.hasMore ? TRUNCATED_REASON.MANUAL_CAP : undefined),
  };
}

module.exports = {
  ingestNewEmailsForUser,
};
