'use strict';

jest.mock('../src/models/eventModel', () => ({
  insertEvent: jest.fn(),
}));
jest.mock('../src/utils/logger', () => ({
  error: jest.fn(),
  info: jest.fn(),
}));

const events = require('../src/models/eventModel');
const { logEvent, logEventSafe } = require('../src/services/eventService');

describe('eventService', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('logEvent passes through to model', async () => {
    events.insertEvent.mockResolvedValue({ id: 1 });
    const payload = { type: 'test.event', userId: 1 };
    const result = await logEvent(payload);
    expect(events.insertEvent).toHaveBeenCalledWith(payload);
    expect(result).toEqual({ id: 1 });
  });

  it('logEventSafe swallows errors', async () => {
    events.insertEvent.mockRejectedValue(new Error('boom'));
    const result = await logEventSafe({ type: 'test.event', userId: 1 });
    expect(result).toBeNull();
  });
});
