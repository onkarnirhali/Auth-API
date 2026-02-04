'use strict';

jest.mock('../src/services/todoService', () => ({
  create: jest.fn(),
  findById: jest.fn(),
  update: jest.fn(),
}));
jest.mock('../src/services/eventService', () => ({
  logEventSafe: jest.fn(),
}));

const todos = require('../src/services/todoService');
const { logEventSafe } = require('../src/services/eventService');
const ctrl = require('../src/controllers/todoController');

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  return res;
}

describe('todo controller events', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('logs todo.created on create', async () => {
    todos.create.mockResolvedValue({ id: 10, status: 'pending' });
    const req = { user: { id: 1 }, body: { title: 'x' }, id: 'req-1', ip: '127.0.0.1', get: () => 'ua' };
    const res = mockRes();
    await ctrl.create(req, res);
    expect(logEventSafe).toHaveBeenCalledWith(expect.objectContaining({ type: 'todo.created', userId: 1 }));
  });

  it('logs todo.completed when status transitions to done', async () => {
    todos.findById.mockResolvedValue({ id: 5, status: 'pending' });
    todos.update.mockResolvedValue({ id: 5, status: 'done' });
    const req = { user: { id: 1 }, params: { id: '5' }, body: { status: 'done' }, id: 'req-2', ip: '127.0.0.1', get: () => 'ua' };
    const res = mockRes();
    await ctrl.update(req, res);
    expect(logEventSafe).toHaveBeenCalledWith(expect.objectContaining({ type: 'todo.completed', userId: 1 }));
  });
});
