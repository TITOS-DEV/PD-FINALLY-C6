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

    // El diccionario inicial (`environment.defaultLang`) se sirve desde
    // /i18n/*.json — ver public/i18n/es.json y en.json, y el mapeo del
    // "prefix" acá abajo.
    provideTranslateService({ lang: environment.defaultLang, fallbackLang: 'es' }),
    provideTranslateHttpLoader({ prefix: '/i18n/', suffix: '.json' }),

    // Esperamos a que el idioma inicial termine de cargar ANTES de pintar
    // el primer componente — si no, la persona vería un parpadeo con las
    // claves de traducción crudas en vez del texto real.
    provideAppInitializer(() => inject(I18nService).initialize()),
  ],
};
