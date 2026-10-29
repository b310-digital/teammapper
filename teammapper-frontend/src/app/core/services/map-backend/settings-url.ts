import { InjectionToken } from '@angular/core';

/** The address SettingsService fetches the default settings from. */
export const SETTINGS_URL = new InjectionToken<string>('SETTINGS_URL');
