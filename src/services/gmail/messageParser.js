'use strict';

// Parse Gmail message payloads into clean plaintext + metadata for embeddings
const MAX_TEXT_LENGTH = Number(process.env.AI_EMAIL_MAX_CHARS || 4000) || 4000;

const decodeBase64 = (data) => {
  if (!data) return '';
  const normalized = data.replace(/-/g, '+').replace(/_/g, '/');
  try {
    return Buffer.from(normalized, 'base64').toString('utf8');
  } catch (_) {
    return '';
  }
};

const stripHtml = (html) => {
  if (!html) return '';
  return html
    // remove styles/scripts
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, ' ')
    // strip tags
    .replace(/<\/?[^>]+(>|$)/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
};

const cleanText = (text) => {
  if (!text) return '';
  const trimmed = text.replace(/\r/g, ' ').replace(/\t/g, ' ').replace(/\s+/g, ' ').trim();
  if (trimmed.length > MAX_TEXT_LENGTH) {
    return trimmed.slice(0, MAX_TEXT_LENGTH);
  }
  return trimmed;
};

const findHeader = (headers, name) => {
  if (!Array.isArray(headers)) return null;
  const match = headers.find((h) => (h.name || '').toLowerCase() === name.toLowerCase());
  return match ? match.value : null;
};

function pickTextPart(payload) {
  if (!payload) return null;

  const mime = (payload.mimeType || '').toLowerCase();
  const bodyData = payload.body?.data;

  if (mime === 'text/plain' && bodyData) {
    return decodeBase64(bodyData);
  }
  if (mime === 'text/html' && bodyData) {
    return stripHtml(decodeBase64(bodyData));
  }

  if (Array.isArray(payload.parts)) {
    // Prefer text/plain if present
    for (const part of payload.parts) {
      const partMime = (part.mimeType || '').toLowerCase();
      if (partMime === 'text/plain') {
        const txt = pickTextPart(part);
        if (txt) return txt;
      }
    }
    for (const part of payload.parts) {
      const txt = pickTextPart(part);
      if (txt) return txt;
    }
  }

  if (bodyData) {
    return decodeBase64(bodyData);
  }
  return null;
}

function parseGmailMessage(message) {
  if (!message) return null;
  const payload = message.payload || {};
  const headers = payload.headers || [];

  const subject = findHeader(headers, 'Subject') || '';
  const dateHeader = findHeader(headers, 'Date');
  const sentAt = dateHeader ? new Date(dateHeader) : (message.internalDate ? new Date(Number(message.internalDate)) : null);

  const text = pickTextPart(payload);
  const cleaned = cleanText(text || message.snippet || '');

  return {
    gmailMessageId: message.id,
    gmailThreadId: message.threadId || null,
    subject: cleanText(subject),
    snippet: cleanText(message.snippet || ''),
    plainText: cleaned,
    sentAt: sentAt || null,
    internalDateMs: message.internalDate ? Number(message.internalDate) : null,
    metadata: {
      labelIds: message.labelIds || [],
      sizeEstimate: message.sizeEstimate || null,
    },
  };
}

module.exports = {
  parseGmailMessage,
  cleanText,
};
