import Events from './events.js';

describe('Events', () => {
  const selection = { id: 'a', parent: null, k: 1 };
  let events: Events;

  beforeEach(() => {
    events = new Events();
  });

  it('calls every callback of one event with the payload', () => {
    const first = jest.fn();
    const second = jest.fn();
    events.on('nodeSelect', first);
    events.on('nodeSelect', second);

    events.emit('nodeSelect', selection);

    expect(first).toHaveBeenCalledWith(selection);
    expect(second).toHaveBeenCalledWith(selection);
  });

  it('stops calling a callback after its remove function ran', () => {
    const removed = jest.fn();
    const kept = jest.fn();
    const remove = events.on('nodeSelect', removed);
    events.on('nodeSelect', kept);

    remove();
    events.emit('nodeSelect', selection);

    expect(removed).not.toHaveBeenCalled();
    expect(kept).toHaveBeenCalledWith(selection);
  });

  it('calls the next callback when one removes itself during emit', () => {
    const next = jest.fn();
    const remove = events.on('nodeSelect', () => remove());
    events.on('nodeSelect', next);

    events.emit('nodeSelect', selection);

    expect(next).toHaveBeenCalledWith(selection);
  });

  describe('a callback that throws', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('does not make emit throw', () => {
      events.on('nodeSelect', () => {
        throw new Error('boom');
      });

      expect(() => events.emit('nodeSelect', selection)).not.toThrow();
    });

    it('still calls the next callback of the same event', () => {
      const next = jest.fn();
      events.on('nodeSelect', () => {
        throw new Error('boom');
      });
      events.on('nodeSelect', next);

      try {
        events.emit('nodeSelect', selection);
      } catch {
        // The assertion below names the failure.
      }

      expect(next).toHaveBeenCalledWith(selection);
    });

    it('rethrows the error asynchronously', () => {
      events.on('nodeSelect', () => {
        throw new Error('boom');
      });

      try {
        events.emit('nodeSelect', selection);
      } catch {
        // The assertion below names the failure.
      }

      expect(() => jest.runAllTimers()).toThrow('boom');
    });
  });

  it('silences every callback after unsubscribeAll', () => {
    const select = jest.fn();
    const deselect = jest.fn();
    events.on('nodeSelect', select);
    events.on('nodeDeselect', deselect);

    events.unsubscribeAll();
    events.emit('nodeSelect', selection);
    events.emit('nodeDeselect', selection);

    expect(select).not.toHaveBeenCalled();
    expect(deselect).not.toHaveBeenCalled();
  });
});
