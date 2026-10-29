import { InjectionToken } from '@angular/core';

/** Whether the app keeps its maps in the browser instead of on a backend. */
export const OFFLINE_MODE = new InjectionToken<boolean>('OFFLINE_MODE');
