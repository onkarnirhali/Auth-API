'use strict';

const { listInbox, listCalendarView } = require('../services/outlook/client');

async function getInbox(req, res) {
  try {
    const top = Number(req.query.top || 10);
    const skipToken = req.query.skipToken || undefined;
    const data = await listInbox(req.user.id, { top, skipToken });
    res.json({ data });
  } catch (err) {
    const status = err.response?.status || 500;
    const message = err.response?.data?.error?.message || err.message || 'Failed to fetch Outlook inbox';
    res.status(status).json({ error: { message } });
  }
}

async function getCalendar(req, res) {
  try {
    const { start, end } = req.query;
    if (!start || !end) return res.status(400).json({ error: { message: 'start and end are required' } });
    const top = Number(req.query.top || 25);
    const data = await listCalendarView(req.user.id, { startDateTime: start, endDateTime: end, top });
    res.json({ data });
  } catch (err) {
    const status = err.response?.status || 500;
    const message = err.response?.data?.error?.message || err.message || 'Failed to fetch Outlook calendar';
    res.status(status).json({ error: { message } });
  }
}

module.exports = {
  getInbox,
  getCalendar,
};
