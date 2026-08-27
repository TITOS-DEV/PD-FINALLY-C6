import { Component, input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

/**
 * Estado vacío genérico y reutilizable — lo usamos en el chat ("todavía no
 * hay mensajes, ¡escribe el primero!"), en el copiloto ("hazme una
 * pregunta sobre tus canales") y en el listado de canales. Recibe todo por
 * `input()` para no repetir el mismo markup con textos hardcodeados en
 * cada lugar donde hace falta un estado vacío.
 */
@Component({
  selector: 'app-empty-state',
  imports: [TranslatePipe],
  templateUrl: './empty-state.html',
  styleUrl: './empty-state.css',
})
export class EmptyState {
  readonly icon = input('💬');
  readonly titleKey = input.required<string>();
  readonly descriptionKey = input<string | undefined>(undefined);
  /** 'dark' para cuando este estado vacío cae sobre el sidebar oscuro (canales), 'light' para el resto. */
  readonly variant = input<'light' | 'dark'>('light');
}
