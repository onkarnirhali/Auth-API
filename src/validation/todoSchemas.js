const isString = (v) => typeof v === 'string';
const isNonEmpty = (s) => isString(s) && s.trim().length > 0;
const inSet = (v, set) => set.includes(v);
const isObject = (v) => v && typeof v === 'object' && !Array.isArray(v);

function parseNotesPayload(raw, errors) {
  if (raw === undefined) return undefined;
  if (!isObject(raw)) {
    errors.push({ path: 'notes', message: 'must be an object' });
    return undefined;
  }

  const out = {};
  if (raw.linkedNoteIds !== undefined) {
    if (!Array.isArray(raw.linkedNoteIds)) {
      errors.push({ path: 'notes.linkedNoteIds', message: 'must be an array of note ids' });
    } else {
      const ids = [];
      for (const [idx, value] of raw.linkedNoteIds.entries()) {
        const parsed = Number(value);
        if (!Number.isFinite(parsed) || parsed <= 0) {
          errors.push({ path: `notes.linkedNoteIds[${idx}]`, message: 'must be a positive number' });
          continue;
        }
        ids.push(parsed);
      }
      out.linkedNoteIds = Array.from(new Set(ids));
    }
  }

  if (raw.newNotes !== undefined) {
    if (!Array.isArray(raw.newNotes)) {
      errors.push({ path: 'notes.newNotes', message: 'must be an array' });
    } else {
      out.newNotes = [];
      for (const [idx, note] of raw.newNotes.entries()) {
        if (!isObject(note)) {
          errors.push({ path: `notes.newNotes[${idx}]`, message: 'must be an object' });
          continue;
        }
        if (!isNonEmpty(note.title)) {
          errors.push({ path: `notes.newNotes[${idx}].title`, message: 'title is required' });
          continue;
        }
        if (isString(note.title) && note.title.length > 200) {
          errors.push({ path: `notes.newNotes[${idx}].title`, message: 'max length 200' });
        }
        if (!isObject(note.content)) {
          errors.push({ path: `notes.newNotes[${idx}].content`, message: 'content must be object JSON' });
          continue;
        }

        const normalized = {
          title: note.title,
          content: note.content,
        };

        if (note.passwordProtection !== undefined) {
          if (!isObject(note.passwordProtection)) {
            errors.push({ path: `notes.newNotes[${idx}].passwordProtection`, message: 'must be object' });
          } else if (note.passwordProtection.enabled !== true && note.passwordProtection.enabled !== false) {
            errors.push({ path: `notes.newNotes[${idx}].passwordProtection.enabled`, message: 'must be boolean' });
          } else {
            const protection = { enabled: note.passwordProtection.enabled };
            if (note.passwordProtection.enabled === true) {
              if (!isString(note.passwordProtection.password) || note.passwordProtection.password.length < 6) {
                errors.push({ path: `notes.newNotes[${idx}].passwordProtection.password`, message: 'must be at least 6 chars' });
              } else {
                protection.password = note.passwordProtection.password;
              }
            }
            normalized.passwordProtection = protection;
          }
        }

        out.newNotes.push(normalized);
      }
    }
  }

  return out;
}

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

  const notes = parseNotesPayload(b.notes, errors);

  const value = { body: {
    title: b.title,
    description: b.description ?? null,
    status: b.status ?? 'pending',
    priority: b.priority ?? 'normal',
    dueDate: b.dueDate ?? null,
    ...(notes !== undefined ? { notes } : {}),
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

  const notes = parseNotesPayload(b.notes, errors);
  if (notes !== undefined) out.notes = notes;

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

