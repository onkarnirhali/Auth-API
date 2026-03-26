'use strict';

jest.mock('../src/config/db', () => ({
  query: jest.fn().mockResolvedValue({ rows: [] }),
  connect: jest.fn().mockResolvedValue({
    query: jest.fn().mockResolvedValue({ rows: [] }),
    release: jest.fn(),
  }),
}));
jest.mock('../src/services/noteService', () => ({
  listLinksForTaskIds: jest.fn(),
  createForTodo: jest.fn(),
  syncTaskLinks: jest.fn(),
}));
jest.mock('../src/services/todoService', () => ({
  create: jest.fn(),
  createWithNotes: jest.fn(),
  findById: jest.fn(),
  list: jest.fn(),
  reorder: jest.fn(),
  remove: jest.fn(),
  update: jest.fn(),
  updateWithNotes: jest.fn(),
}));

const todos = require('../src/services/todoService');
const ctrl = require('../src/controllers/todoController');

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  return res;
}

describe('todo reorder controller', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('reorders the full board when payload is valid', async () => {
    todos.list.mockResolvedValue([{ id: 1 }, { id: 2 }, { id: 3 }]);
    todos.reorder.mockResolvedValue([{ id: 2 }, { id: 1 }, { id: 3 }]);

    const req = {
      user: { id: 1 },
      body: { lanes: { todo: [2, 1], in_progress: [3], done: [] } },
      id: 'req-1',
      ip: '127.0.0.1',
      get: () => 'ua',
    };
    const res = mockRes();

    await ctrl.reorder(req, res);

    expect(todos.list).toHaveBeenCalledWith(1, {});
    expect(todos.reorder).toHaveBeenCalledWith(1, { todo: [2, 1], in_progress: [3], done: [] });
    expect(res.json).toHaveBeenCalledWith({ items: [{ id: 2 }, { id: 1 }, { id: 3 }] });
  });

  it('rejects malformed lane arrays', async () => {
    const req = {
      user: { id: 1 },
      body: { lanes: { todo: 'nope', in_progress: [], done: [] } },
      id: 'req-2',
      ip: '127.0.0.1',
      get: () => 'ua',
    };
    const res = mockRes();

    await ctrl.reorder(req, res);

    expect(todos.list).not.toHaveBeenCalled();
    expect(todos.reorder).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      error: expect.objectContaining({
        code: 'VALIDATION_ERROR',
      }),
    }));
  });

  it('rejects duplicate, missing, and foreign ids', async () => {
    todos.list.mockResolvedValue([{ id: 1 }, { id: 2 }, { id: 3 }]);

    const req = {
      user: { id: 1 },
      body: { lanes: { todo: [1, 1], in_progress: [2], done: [999] } },
      id: 'req-3',
      ip: '127.0.0.1',
      get: () => 'ua',
    };
    const res = mockRes();

    await ctrl.reorder(req, res);

    expect(todos.reorder).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      error: expect.objectContaining({
        code: 'VALIDATION_ERROR',
      }),
    }));
  });
});
