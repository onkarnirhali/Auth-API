const isString = (v) => typeof v === 'string';
const isNonEmpty = (s) => isString(s) && s.trim().length > 0;
const inSet = (v, set) => set.includes(v);

function validateCreate(req) {
  const b = req.body || {};
  const errors = [];

  if (!isNonEmpty(b.title)) errors.push({ path: 'title', message: 'title is required (1-200 chars)' });
  if (isString(b.title) && b.title.length > 200) errors.push({ path: 'title', message: 'max length 200' });

  if (b.description !== undefined && !isString(b.description)) errors.push({ path: 'description', message: 'must be string' });

  const allowedStatus = ['pending', 'done'];
  if (b.status !== undefined && !inSet(b.status, allowedStatus)) errors.push({ path: 'status', message: `must be one of ${allowedStatus.join(', ')}` });

  const allowedPriority = ['low', 'normal', 'high'];
  if (b.priority !== undefined && !inSet(b.priority, allowedPriority)) errors.push({ path: 'priority', message: `must be one of ${allowedPriority.join(', ')}` });

  if (b.dueDate !== undefined && b.dueDate !== null) {
    const d = new Date(b.dueDate);
    if (isNaN(d.getTime())) errors.push({ path: 'dueDate', message: 'must be ISO date or null' });
  }

  const value = { body: {
    title: b.title,
    description: b.description ?? null,
    status: b.status ?? 'pending',
    priority: b.priority ?? 'normal',
    dueDate: b.dueDate ?? null,
  }};

  return { errors, value };
}

function validateUpdate(req) {
  const b = req.body || {};
  const errors = [];
  const out = {};

  if (b.title !== undefined) {
    if (!isNonEmpty(b.title)) errors.push({ path: 'title', message: 'must be non-empty string (1-200 chars)' });
    if (isString(b.title) && b.title.length > 200) errors.push({ path: 'title', message: 'max length 200' });
    out.title = b.title;
  }
  if (b.description !== undefined) {
    if (!isString(b.description)) errors.push({ path: 'description', message: 'must be string' });
    out.description = b.description;
  }
  const allowedStatus = ['pending', 'done'];
  if (b.status !== undefined) {
    if (!inSet(b.status, allowedStatus)) errors.push({ path: 'status', message: `must be one of ${allowedStatus.join(', ')}` });
    out.status = b.status;
  }
  const allowedPriority = ['low', 'normal', 'high'];
  if (b.priority !== undefined) {
    if (!inSet(b.priority, allowedPriority)) errors.push({ path: 'priority', message: `must be one of ${allowedPriority.join(', ')}` });
    out.priority = b.priority;
  }
  if (b.dueDate !== undefined) {
    if (b.dueDate !== null) {
      const d = new Date(b.dueDate);
      if (isNaN(d.getTime())) errors.push({ path: 'dueDate', message: 'must be ISO date or null' });
    }
    out.dueDate = b.dueDate;
  }

  return { errors, value: { body: out } };
}

function validateListQuery(req) {
  const q = req.query || {};
  const errors = [];
  const out = {};
  if (q.status !== undefined) {
    const allowed = ['pending', 'done'];
    if (!inSet(q.status, allowed)) errors.push({ path: 'status', message: `must be one of ${allowed.join(', ')}` });
    else out.status = q.status;
  }
  if (q.q !== undefined) {
    if (!isString(q.q)) errors.push({ path: 'q', message: 'must be string' });
    else out.q = q.q;
  }
  if (q.dueFrom !== undefined) {
    const d = new Date(q.dueFrom);
    if (isNaN(d.getTime())) errors.push({ path: 'dueFrom', message: 'must be ISO date' });
    else out.dueFrom = q.dueFrom;
  }
  if (q.dueTo !== undefined) {
    const d = new Date(q.dueTo);
    if (isNaN(d.getTime())) errors.push({ path: 'dueTo', message: 'must be ISO date' });
    else out.dueTo = q.dueTo;
  }
  return { errors, value: { query: out } };
}

module.exports = { validateCreate, validateUpdate, validateListQuery };

