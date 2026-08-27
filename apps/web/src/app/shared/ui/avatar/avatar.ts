import { Component, computed, input } from '@angular/core';

/**
 * Paleta fija de colores para los avatares — variada a propósito (no todos
 * azules) para que dos personas se puedan distinguir de un vistazo aunque
 * compartan iniciales. El color de cada quien sale de un hash de su `seed`
 * (normalmente su `userId`), así que siempre es el mismo color para la
 * misma persona en toda la app, sin tener que guardar nada en la BD.
 */
const PALETTE = [
  { bg: '#e0ecfb', fg: '#0e4c85' }, // azul (el color de marca)
  { bg: '#e6e0fb', fg: '#5b3fa0' }, // violeta
  { bg: '#dcf3ea', fg: '#0f7a54' }, // verde azulado
  { bg: '#fbe9e0', fg: '#a5490f' }, // naranja
  { bg: '#fbe0ec', fg: '#a5104f' }, // magenta
  { bg: '#fff6d6', fg: '#8a6d00' }, // amarillo mostaza
] as const;

/** Círculo con las iniciales del nombre — evitamos depender de fotos de perfil que el backend no maneja. */
@Component({
  selector: 'app-avatar',
  imports: [],
  templateUrl: './avatar.html',
  styleUrl: './avatar.css',
})
export class Avatar {
  readonly name = input.required<string>();
  readonly size = input<'sm' | 'md' | 'lg'>('md');
  /** Qué usar para elegir el color — normalmente el userId. Si no se pasa, se usa el nombre. */
  readonly seed = input<string | undefined>(undefined);

  protected readonly initials = computed(() => {
    const parts = this.name().trim().split(/\s+/);
    const first = parts[0]?.[0] ?? '';
    const second = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
    return (first + second).toUpperCase();
  });

  protected readonly colors = computed(() => {
    const key = this.seed() || this.name();
    let hash = 0;
    for (let i = 0; i < key.length; i++) {
      hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
    }
    return PALETTE[hash % PALETTE.length];
  });
}
