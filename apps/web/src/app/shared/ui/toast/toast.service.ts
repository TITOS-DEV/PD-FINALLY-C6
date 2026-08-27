import { Injectable, signal } from '@angular/core';

export type ToastType = 'error' | 'success' | 'info';

export interface Toast {
  id: string;
  type: ToastType;
  /** Clave de traducción, NUNCA texto crudo — así el toast también respeta el idioma activo. */
  messageKey: string;
  params?: Record<string, unknown>;
}

const AUTO_DISMISS_MS = 5000;

/**
 * Cola de notificaciones simple, con un signal como única fuente de
 * verdad. Cualquier parte de la app (interceptores, servicios, componentes)
 * puede llamar `toastService.error('errors.sendFailed')` sin importar el
 * componente visual — `ToastContainer` es el único que lee `toasts()` y los dibuja.
 */
@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly toasts = signal<Toast[]>([]);

  error(messageKey: string, params?: Record<string, unknown>): void {
    this.show('error', messageKey, params);
  }

  success(messageKey: string, params?: Record<string, unknown>): void {
    this.show('success', messageKey, params);
  }

  info(messageKey: string, params?: Record<string, unknown>): void {
    this.show('info', messageKey, params);
  }

  dismiss(id: string): void {
    this.toasts.update((list) => list.filter((toast) => toast.id !== id));
  }

  private show(type: ToastType, messageKey: string, params?: Record<string, unknown>): void {
    const toast: Toast = { id: crypto.randomUUID(), type, messageKey, params };
    this.toasts.update((list) => [...list, toast]);
    setTimeout(() => this.dismiss(toast.id), AUTO_DISMISS_MS);
  }
}
