'use strict';

const axios = require('axios');
const outlookTokens = require('../../models/outlookTokenModel');
const { refreshAccessToken, decodeIdToken } = require('./oauthService');
const logger = require('../../utils/logger');

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';

function isExpiringSoon(expiresAt) {
  if (!expiresAt) return false;
  const ms = new Date(expiresAt).getTime();
  return ms - Date.now() < 5 * 60 * 1000; // 5 minutes
}

async function ensureValidAccess(userId) {
  const token = await outlookTokens.findByUserId(userId);
  if (!token) throw new Error('No Outlook tokens found for user');
  let current = token;
  if (isExpiringSoon(token.expiresAt)) {
    try {
      const refreshed = await refreshAccessToken(token.refreshToken);
      const expiresAt = refreshed.expires_in ? new Date(Date.now() + refreshed.expires_in * 1000) : null;
      current = await outlookTokens.updateAccessToken({
        userId,
        accessToken: refreshed.access_token,
        refreshToken: refreshed.refresh_token || token.refreshToken,
        expiresAt,
        scope: refreshed.scope || token.scope,
        tokenType: refreshed.token_type || token.tokenType,
      });
    } catch (err) {
      logger.error('Failed to refresh Outlook token', { userId, message: err?.message });
      throw err;
    }
  }
  return current;
}

async function graphRequest(userId, path, config = {}) {
  const token = await ensureValidAccess(userId);
  const url = `${GRAPH_BASE}${path}`;
  const headers = {
    Authorization: `Bearer ${token.accessToken}`,
    ConsistencyLevel: 'eventual',
    ...config.headers,
  };
  const resp = await axios({
    method: config.method || 'get',
    url,
    headers,
    params: config.params,
  });
  return resp.data;
}

async function listInbox(userId, { top = 10, skipToken } = {}) {
  const params = {
    $top: Math.min(top, 50),
    $orderby: 'receivedDateTime desc',
    $select: 'id,subject,from,receivedDateTime,bodyPreview,conversationId,isRead,body',
    ...(skipToken ? { $skiptoken: skipToken } : {}),
  };
  return graphRequest(userId, '/me/mailFolders/Inbox/messages', { params });
}

async function listCalendarView(userId, { startDateTime, endDateTime, top = 25 }) {
  const params = {
    startDateTime,
    endDateTime,
    $top: Math.min(top, 50),
    $orderby: 'start/dateTime',
    $select: 'id,subject,start,end,organizer,attendees,location',
  };
  return graphRequest(userId, '/me/calendarView', { params });
}

module.exports = {
  listInbox,
  listCalendarView,
  graphRequest,
  decodeIdToken,
};
