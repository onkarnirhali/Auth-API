'use strict';

const tokens = require('../services/tokenService');
const { logEventSafe } = require('../services/eventService');
const { exportUserData, deleteUserAndData } = require('../services/privacyService');

async function exportMyData(req, res) {
  try {
    const payload = await exportUserData(req.user.id);
    if (!payload) {
      return res.status(404).json({ error: 'User not found' });
    }

    await logEventSafe({
      type: 'privacy.export.requested',
      userId: req.user.id,
      requestId: req.id,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      source: 'api',
    });

    return res.json(payload);
  } catch (err) {
    console.error('Failed to export user data', err);
    return res.status(500).json({ error: 'Failed to export user data' });
  }
}

async function deleteMyAccount(req, res) {
  const confirmation = String(req.body?.confirmation || req.body?.confirmText || '').trim();
  if (confirmation !== 'DELETE') {
    return res.status(400).json({ error: 'confirmation must be DELETE' });
  }

  try {
    await logEventSafe({
      type: 'privacy.delete.requested',
      userId: req.user.id,
      requestId: req.id,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      source: 'api',
    });

    await tokens.revokeAllUserTokens(req.user.id);
    const deleted = await deleteUserAndData(req.user.id);

    if (!deleted) {
      return res.status(404).json({ error: 'User not found' });
    }

    await logEventSafe({
      type: 'privacy.delete.completed',
      userId: null,
      requestId: req.id,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      source: 'api',
      metadata: {
        deletedUserId: req.user.id,
      },
    });

    return res
      .clearCookie('accessToken', { path: '/' })
      .clearCookie('refreshToken', { path: '/' })
      .json({
        success: true,
        deletedUserId: deleted.user.id,
        deletedAt: deleted.deletedAt,
      });
  } catch (err) {
    console.error('Failed to delete user account', err);
    return res.status(500).json({ error: 'Failed to delete user account' });
  }
}

module.exports = {
  exportMyData,
  deleteMyAccount,
};
