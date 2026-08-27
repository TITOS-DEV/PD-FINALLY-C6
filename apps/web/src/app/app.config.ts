import { ApplicationConfig, inject, provideAppInitializer, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideTranslateService } from '@ngx-translate/core';
import { provideTranslateHttpLoader } from '@ngx-translate/http-loader';

import { routes } from './app.routes';
import { authInterceptor } from './core/auth/auth-interceptor';
import { I18nService } from './core/i18n/i18n.service';
import { environment } from '../environments/environment';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideHttpClient(withInterceptors([authInterceptor])),

    // The initial dictionary (`environment.defaultLang`) is served from
    // /i18n/*.json — see public/i18n/es.json and en.json, and the
    // "prefix" mapping right below.
    provideTranslateService({ lang: environment.defaultLang, fallbackLang: 'es' }),
    provideTranslateHttpLoader({ prefix: '/i18n/', suffix: '.json' }),

    // We wait for the initial language to finish loading BEFORE painting
    // the first component — otherwise the person would see a flash of raw
    // translation keys instead of the real text.
    provideAppInitializer(() => inject(I18nService).initialize()),
  ],
};
