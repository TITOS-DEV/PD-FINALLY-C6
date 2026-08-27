import { Component } from '@angular/core';

/**
 * Placeholder animado mientras se carga la primera página de mensajes de un
 * canal. Mostrar esto en vez de una pantalla en blanco (o un spinner
 * suelto) le da a la persona una idea de qué va a aparecer ahí, y hace que
 * la carga se sienta más rápida de lo que en realidad es.
 */
@Component({
  selector: 'app-message-skeleton',
  imports: [],
  templateUrl: './message-skeleton.html',
  styleUrl: './message-skeleton.css',
})
export class MessageSkeleton {
  /** Alterna el lado (izquierda/derecha) de cada barra para que se parezca a una conversación real. */
  protected readonly rows = [0, 1, 2, 3, 4, 5];
}
