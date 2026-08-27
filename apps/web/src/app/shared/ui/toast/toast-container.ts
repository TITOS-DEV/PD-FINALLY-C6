import { Component, inject } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { ToastService } from './toast.service';

/**
 * Se monta una sola vez en el shell raíz de la app (ver app.html) y dibuja
 * lo que haya en `ToastService.toasts()`. Fijo abajo a la derecha, apilado,
 * cada uno se puede cerrar a mano o desaparece solo a los 5 segundos.
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
