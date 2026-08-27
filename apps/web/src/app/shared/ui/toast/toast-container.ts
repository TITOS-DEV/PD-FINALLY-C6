import { Component, inject } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { ToastService } from './toast.service';

/**
 * Toast container mounted once in root application shell (app.html).
 * Subscribes to `ToastService.toasts()`, rendering stacked notifications
 * fixed to the bottom right with auto-dismiss (5s) and manual dismiss handlers.
 */
@Component({
  selector: 'app-toast-container',
  imports: [TranslatePipe],
  templateUrl: './toast-container.html',
  styleUrl: './toast-container.css',
})
export class ToastContainer {
  protected readonly toastService = inject(ToastService);
}
