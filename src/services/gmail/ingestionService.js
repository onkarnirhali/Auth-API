'use strict';

const { getAuthorizedGmail } = require('./client');
const { parseGmailMessage } = require('./messageParser');
const gmailSyncCursor = require('../../models/gmailSyncCursorModel');
const emailEmbeddings = require('../../models/emailEmbeddingModel');
const { embedText } = require('../ai/embeddingService');

const MAX_MESSAGES = Number(process.env.AI_GMAIL_MAX_MESSAGES || 50) || 50;
const LOOKBACK_DAYS = Number(process.env.AI_GMAIL_LOOKBACK_DAYS || 30) || 30;
const EXCLUDE_CATEGORIES = process.env.AI_GMAIL_EXCLUDE_CATEGORIES || 'promotions,social';

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

async function listMessageIds(gmail, query, maxMessages) {
  const ids = [];
  let pageToken = undefined;
  while (ids.length < maxMessages) {
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
    if (!data?.nextPageToken || batch.length === 0) break;
    pageToken = data.nextPageToken;
  }
  return ids;
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
  const maxMessages = Math.min(options.maxMessages || MAX_MESSAGES, MAX_MESSAGES);
  const query = buildAfterQuery(cursor);

  const messageIds = await listMessageIds(gmail, query, maxMessages);
  if (messageIds.length === 0) {
    return { ingested: 0, cursor: cursor || null, embeddings: [] };
  }

  // Fetch + parse messages and track newest internal date for cursor advancement
  const parsedArray = [];
  let newestInternalMs = cursor?.lastInternalDateMs || 0;
  let newestId = cursor?.lastGmailMessageId || null;

  for (const id of messageIds) {
    try {
      const message = await fetchMessage(gmail, id);
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

  // Embed cleaned plaintext for vector storage
  const embeddings = [];
  for (const msg of parsedArray) {
    try {
      const embedding = await embedText(msg.plainText);
      if (!embedding) continue;
      embeddings.push({
        gmailMessageId: msg.gmailMessageId,
        gmailThreadId: msg.gmailThreadId,
        subject: msg.subject,
        snippet: msg.snippet,
        plainText: msg.plainText,
        sentAt: msg.sentAt,
        embedding,
        metadata: msg.metadata,
      });
    } catch (err) {
      console.error('Failed to embed Gmail message', { userId, messageId: msg.gmailMessageId, error: err?.message });
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

  return { ingested: saved.length, cursor: cursor || null, embeddings: saved };
}

module.exports = {
  ingestNewEmailsForUser,
};
