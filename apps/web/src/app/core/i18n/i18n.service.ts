import { Injectable, computed, inject } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { firstValueFrom } from 'rxjs';

export type AppLang = 'es' | 'en';

const STORAGE_KEY = 'riwi_lang';
const SUPPORTED_LANGS: AppLang[] = ['es', 'en'];
const FALLBACK_LANG: AppLang = 'es';

/**
 * Wrapper over `@ngx-translate/core` — everything else in the app
 * depends on THIS service to know/change the language, never on
 * `TranslateService` directly. That's what makes the "zero hardcoded
 * text" rule explicit: no component decides a Spanish or English string
 * on its own, everything comes from `assets/i18n/es.json` / `en.json`
 * through the `translate` pipe (`{{ 'chat.empty.title' | translate }}`),
 * and this service is the only one that decides WHICH of the two
 * dictionaries is active.
 *
 * We store the preference in localStorage so reloading the page (or
 * coming back another day) doesn't reset the language the person already chose.
 */
@Injectable({ providedIn: 'root' })
export class I18nService {
  private readonly translate = inject(TranslateService);

  /**
   * `TranslateService.currentLang` is already a Signal in this version of
   * ngx-translate — we just re-expose it typed as `AppLang` so the rest
   * of the app doesn't have to deal with `string | null`.
   */
  readonly currentLang = computed<AppLang>(() => (this.translate.currentLang() as AppLang) ?? FALLBACK_LANG);

  constructor() {
    this.translate.addLangs(SUPPORTED_LANGS);
  }

  /**
   * Called once when the app starts (see the `provideAppInitializer` in
   * app.config.ts) to load the initial dictionary BEFORE the first
   * component renders. Without this, the person would see a flash of raw
   * translation keys (`chat.empty.title`) instead of the real text for that first instant.
   */
  async initialize(): Promise<void> {
    await firstValueFrom(this.translate.use(this.resolveInitialLang()));
  }

  /** Changes the active language and persists the choice for the next visit. */
  async setLanguage(lang: AppLang): Promise<void> {
    await firstValueFrom(this.translate.use(lang));
    localStorage.setItem(STORAGE_KEY, lang);
  }

  private resolveInitialLang(): AppLang {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (this.isSupported(stored)) return stored;

    const browserLang = this.translate.getBrowserLang();
    if (this.isSupported(browserLang)) return browserLang;

    return FALLBACK_LANG;
  }

  private isSupported(lang: string | null | undefined): lang is AppLang {
    return !!lang && SUPPORTED_LANGS.includes(lang as AppLang);
  }
}
