import { Injectable, computed, inject } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { firstValueFrom } from 'rxjs';

export type AppLang = 'es' | 'en';

const STORAGE_KEY = 'riwi_lang';
const SUPPORTED_LANGS: AppLang[] = ['es', 'en'];
const FALLBACK_LANG: AppLang = 'es';

/**
 * Wrapper sobre `@ngx-translate/core` — todo el resto de la app depende de
 * ESTE servicio para saber/cambiar el idioma, nunca de `TranslateService`
 * directo. Eso es lo que hace explícita la regla de "cero texto
 * hardcodeado": ningún componente decide un string en español o inglés por
 * su cuenta, todo sale de `assets/i18n/es.json` / `en.json` a través del
 * pipe `translate` (`{{ 'chat.empty.title' | translate }}`), y este
 * servicio es el único que decide CUÁL de los dos diccionarios está activo.
 *
 * Guardamos la preferencia en localStorage para que recargar la página (o
 * volver otro día) no resetee el idioma que la persona ya eligió.
 */
@Injectable({ providedIn: 'root' })
export class I18nService {
  private readonly translate = inject(TranslateService);

  /**
   * `TranslateService.currentLang` ya es un Signal en esta versión de
   * ngx-translate — simplemente lo re-exponemos tipado a `AppLang` para que
   * el resto de la app no tenga que lidiar con `string | null`.
   */
  readonly currentLang = computed<AppLang>(() => (this.translate.currentLang() as AppLang) ?? FALLBACK_LANG);

  constructor() {
    this.translate.addLangs(SUPPORTED_LANGS);
  }

  /**
   * Se llama una sola vez al arrancar la app (ver el `provideAppInitializer`
   * en app.config.ts) para cargar el diccionario inicial ANTES de que se
   * renderice el primer componente. Sin esto, la persona vería un
   * parpadeo con las claves de traducción crudas (`chat.empty.title`) en
   * vez del texto real durante el primer instante.
   */
  async initialize(): Promise<void> {
    await firstValueFrom(this.translate.use(this.resolveInitialLang()));
  }

  /** Cambia el idioma activo y persiste la elección para la próxima visita. */
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
