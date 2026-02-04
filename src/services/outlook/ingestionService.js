'use strict';

const { listInbox } = require('./client');
const outlookSyncCursor = require('../../models/outlookSyncCursorModel');
const emailEmbeddings = require('../../models/emailEmbeddingModel');
const { embedTextWithUsage } = require('../ai/embeddingService');
const { summarizeEmailText } = require('../ai/emailSummaryService');

const MAX_MESSAGES = Number(process.env.AI_OUTLOOK_MAX_MESSAGES || process.env.AI_GMAIL_MAX_MESSAGES || 50) || 50;
const SUMMARY_INPUT_MAX_CHARS = Number(process.env.AI_SUMMARY_MAX_INPUT_CHARS || 12000) || 12000;
const SINGLE_EMAIL_SUMMARY_WORDS = Number(process.env.AI_EMAIL_SUMMARY_MAX_WORDS_SINGLE || 300) || 300;

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

async function listNewMessages(userId, cursor) {
  const results = [];
  let skipToken = undefined;
  while (results.length < MAX_MESSAGES) {
    const page = await listInbox(userId, { top: Math.min(25, MAX_MESSAGES - results.length), skipToken });
    const messages = page.value || [];
    if (messages.length === 0) break;
    for (const msg of messages) {
      const received = msg.receivedDateTime ? new Date(msg.receivedDateTime) : null;
      if (cursor?.lastReceivedAt && received && received <= new Date(cursor.lastReceivedAt)) {
        // stop when we reached already ingested messages
        return results;
      }
      results.push(msg);
    }
    if (!page['@odata.nextLink']) break;
    const next = page['@odata.nextLink'];
    const tokenMatch = next.match(/\$skiptoken=([^&]+)/);
    skipToken = tokenMatch ? decodeURIComponent(tokenMatch[1]) : null;
    if (!skipToken) break;
  }
  return results;
}

async function ingestNewOutlookEmails(userId) {
  if (!userId) throw new Error('userId is required for Outlook ingestion');
  const cursor = await outlookSyncCursor.getByUserId(userId);

  const rawMessages = await listNewMessages(userId, cursor);
  if (!rawMessages.length) {
    return { ingested: 0, cursor: cursor || null, embeddings: [] };
  }

  const normalized = rawMessages.map(normalizeMessage).filter((m) => m.plainText);
  const embeddings = [];

  for (const msg of normalized) {
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

  const newest = normalized[0]; // list is sorted desc by receivedDateTime
  await outlookSyncCursor.upsertCursor({
    userId,
    lastReceivedAt: newest.sentAt || cursor?.lastReceivedAt || null,
    lastMessageId: newest.outlookMessageId,
  });

  return { ingested: stored.length, embeddings: stored };
}

module.exports = {
  ingestNewOutlookEmails,
};
