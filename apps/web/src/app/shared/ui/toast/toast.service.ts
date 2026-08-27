import { Injectable, signal } from '@angular/core';

export type ToastType = 'error' | 'success' | 'info';

export interface Toast {
  id: string;
  type: ToastType;
  /** i18n translation key (never raw strings) to support active locale switching. */
  messageKey: string;
  params?: Record<string, unknown>;
}

const AUTO_DISMISS_MS = 5000;

/**
 * Toast notification service powered by Signals state management.
 * Application services and components trigger toasts via `toastService.error('errors.sendFailed')`
 * independently of visual component rendering.
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
