import { DOCUMENT } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  SwUpdate,
  UnrecoverableStateEvent,
  VersionEvent,
} from '@angular/service-worker';
import { ToastrService } from 'ngx-toastr';
import { Subject } from 'rxjs';
import { UtilsService } from '../utils/utils.service';
import { AppUpdateService } from './app-update.service';

const VERSION = { hash: 'abc' };
const VERSION_READY: VersionEvent = {
  type: 'VERSION_READY',
  currentVersion: VERSION,
  latestVersion: { hash: 'def' },
};

describe('AppUpdateService', () => {
  let versionUpdates: Subject<VersionEvent>;
  let unrecoverable: Subject<UnrecoverableStateEvent>;
  let toastTaps: Subject<void>;
  let toastrService: { info: jest.Mock };
  let reload: jest.Mock;

  /** Creates the service with a worker that is on when `isEnabled` holds. */
  function setup(isEnabled = true): AppUpdateService {
    versionUpdates = new Subject();
    unrecoverable = new Subject();
    toastTaps = new Subject();
    toastrService = { info: jest.fn(() => ({ onTap: toastTaps })) };
    reload = jest.fn();
    TestBed.configureTestingModule({
      providers: [
        {
          provide: SwUpdate,
          useValue: { isEnabled, versionUpdates, unrecoverable },
        },
        { provide: ToastrService, useValue: toastrService },
        {
          provide: UtilsService,
          useValue: { translate: jest.fn(async (key: string) => key) },
        },
        { provide: DOCUMENT, useValue: { location: { reload } } },
      ],
    });
    return TestBed.inject(AppUpdateService);
  }

  /** Lets the awaited translation resolve. */
  const flush = () => new Promise(resolve => setTimeout(resolve));

  it('offers a reload once the worker holds a new version', async () => {
    setup().watch();

    versionUpdates.next(VERSION_READY);
    await flush();

    expect(toastrService.info).toHaveBeenCalledWith(
      'TOASTS.APP_UPDATE_READY',
      '',
      { disableTimeOut: true }
    );
  });

  it('offers a reload once the worker cache breaks', async () => {
    setup().watch();

    unrecoverable.next({ type: 'UNRECOVERABLE_STATE', reason: 'gone' });
    await flush();

    expect(toastrService.info).toHaveBeenCalledWith(
      'TOASTS.APP_UPDATE_BROKEN',
      '',
      { disableTimeOut: true }
    );
  });

  it('reloads the page when the visitor clicks the toast', async () => {
    setup().watch();
    versionUpdates.next(VERSION_READY);
    await flush();

    toastTaps.next();

    expect(reload).toHaveBeenCalled();
  });

  it('ignores a version the worker is still downloading', async () => {
    setup().watch();

    versionUpdates.next({ type: 'VERSION_DETECTED', version: VERSION });
    await flush();

    expect(toastrService.info).not.toHaveBeenCalled();
  });

  it('does nothing without a worker', async () => {
    setup(false).watch();

    versionUpdates.next(VERSION_READY);
    await flush();

    expect(toastrService.info).not.toHaveBeenCalled();
  });
});
