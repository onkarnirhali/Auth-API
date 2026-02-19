'use strict';

const { listInbox } = require('./client');
const outlookSyncCursor = require('../../models/outlookSyncCursorModel');
const emailEmbeddings = require('../../models/emailEmbeddingModel');
const { embedTextWithUsage } = require('../ai/embeddingService');
const { summarizeEmailText } = require('../ai/emailSummaryService');

const MAX_MESSAGES = Number(process.env.AI_OUTLOOK_MAX_MESSAGES || process.env.AI_GMAIL_MAX_MESSAGES || 50) || 50;
const SUMMARY_INPUT_MAX_CHARS = Number(process.env.AI_SUMMARY_MAX_INPUT_CHARS || 12000) || 12000;
const SINGLE_EMAIL_SUMMARY_WORDS = Number(process.env.AI_EMAIL_SUMMARY_MAX_WORDS_SINGLE || 300) || 300;
const TRUNCATED_REASON = {
  MANUAL_CAP: 'MANUAL_CAP',
  TIME_BUDGET: 'TIME_BUDGET',
};

function stripHtml(html) {
  if (!html) return '';
  return String(html)
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeMessage(raw) {
  const received = raw.receivedDateTime ? new Date(raw.receivedDateTime) : null;
  const body = raw.body?.contentType === 'html' ? stripHtml(raw.body.content) : (raw.body?.content || '');
  const plainText = body || raw.bodyPreview || '';
  return {
    outlookMessageId: raw.id,
    outlookThreadId: raw.conversationId || null,
    subject: raw.subject || '',
    plainText,
    snippet: raw.bodyPreview || plainText.slice(0, 200),
    sentAt: received,
  };
}

async function listNewMessages(userId, cursor, options = {}) {
  const results = [];
  let skipToken = undefined;
  const maxMessages = Number.isFinite(Number(options.maxMessages)) && Number(options.maxMessages) > 0
    ? Math.min(Math.floor(Number(options.maxMessages)), MAX_MESSAGES)
    : MAX_MESSAGES;
  const deadlineAt = options.deadlineAt || null;
  let hasMore = false;
  let timedOut = false;

  while (results.length < maxMessages) {
    if (deadlineAt && Date.now() >= Number(deadlineAt)) {
      timedOut = true;
      break;
    }

    const page = await listInbox(userId, { top: Math.min(25, maxMessages - results.length), skipToken });
    const messages = page.value || [];
    if (messages.length === 0) break;
    for (const msg of messages) {
      const received = msg.receivedDateTime ? new Date(msg.receivedDateTime) : null;
      if (cursor?.lastReceivedAt && received && received <= new Date(cursor.lastReceivedAt)) {
        // stop when we reached already ingested messages
        return { messages: results, hasMore, timedOut };
      }
      results.push(msg);
      if (results.length >= maxMessages) {
        if (page['@odata.nextLink']) hasMore = true;
        break;
      }
    }
    if (results.length >= maxMessages) break;
    if (!page['@odata.nextLink']) break;
    const next = page['@odata.nextLink'];
    const tokenMatch = next.match(/\$skiptoken=([^&]+)/);
    skipToken = tokenMatch ? decodeURIComponent(tokenMatch[1]) : null;
    if (!skipToken) break;
  }
  return { messages: results, hasMore, timedOut };
}

async function ingestNewOutlookEmails(userId, options = {}) {
  if (!userId) throw new Error('userId is required for Outlook ingestion');
  const cursor = await outlookSyncCursor.getByUserId(userId);
  const deadlineAt = options.deadlineAt || null;

  const listResult = await listNewMessages(userId, cursor, options);
  const rawMessages = listResult.messages || [];
  if (!rawMessages.length) {
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

  const normalized = rawMessages.map(normalizeMessage).filter((m) => m.plainText);
  const embeddings = [];
  let processedMessages = 0;
  let timedOut = Boolean(listResult.timedOut);

  for (const msg of normalized) {
    if (deadlineAt && Date.now() >= Number(deadlineAt)) {
      timedOut = true;
      break;
    }

    processedMessages += 1;
    const combined = [msg.subject ? `Subject: ${msg.subject}` : null, msg.plainText].filter(Boolean).join('\n');
    const safeText = combined.length > SUMMARY_INPUT_MAX_CHARS ? combined.slice(0, SUMMARY_INPUT_MAX_CHARS) : combined;
    let summary = '';
    try {
      summary = await summarizeEmailText(safeText, { maxWords: SINGLE_EMAIL_SUMMARY_WORDS });
    } catch (_) {
      summary = safeText.slice(0, 8000);
    }
    const embedded = await embedTextWithUsage(summary || safeText, {
      userId,
      source: 'outlook',
      purpose: 'email_ingest',
    });
    const embedding = embedded ? embedded.embedding : null;
    embeddings.push({
      gmailMessageId: `outlook:${msg.outlookMessageId}`,
      gmailThreadId: msg.outlookThreadId ? `outlook:${msg.outlookThreadId}` : null,
      subject: msg.subject,
      snippet: msg.snippet,
      plainText: summary || safeText,
      sentAt: msg.sentAt || null,
      embedding,
      metadata: { provider: 'outlook' },
    });
  }

  const stored = await emailEmbeddings.upsertMany(userId, embeddings);

  if (normalized[0]) {
    const newest = normalized[0]; // list is sorted desc by receivedDateTime
    await outlookSyncCursor.upsertCursor({
      userId,
      lastReceivedAt: newest.sentAt || cursor?.lastReceivedAt || null,
      lastMessageId: newest.outlookMessageId,
    });
  }

  const truncated = Boolean(timedOut || listResult.hasMore);
  return {
    ingested: stored.length,
    embeddings: stored,
    processedMessages,
    truncated,
    truncatedReason: timedOut ? TRUNCATED_REASON.TIME_BUDGET : (listResult.hasMore ? TRUNCATED_REASON.MANUAL_CAP : undefined),
  };
}

module.exports = {
  ingestNewOutlookEmails,
};
