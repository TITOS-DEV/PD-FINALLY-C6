import { Component, computed, input } from '@angular/core';

/**
 * Fixed color palette for avatars — intentionally varied to allow quick visual
 * distinction between users sharing initials. Each user's color derives from a
 * hash of their `seed` (typically `userId`), ensuring consistent colors across the app.
 */
const PALETTE = [
  { bg: '#e0ecfb', fg: '#0e4c85' }, // brand blue
  { bg: '#e6e0fb', fg: '#5b3fa0' }, // violet
  { bg: '#dcf3ea', fg: '#0f7a54' }, // teal green
  { bg: '#fbe9e0', fg: '#a5490f' }, // orange
  { bg: '#fbe0ec', fg: '#a5104f' }, // magenta
  { bg: '#fff6d6', fg: '#8a6d00' }, // mustard yellow
] as const;

/** Name initials circle component — eliminates reliance on external profile images. */
@Component({
  selector: 'app-avatar',
  imports: [],
  templateUrl: './avatar.html',
  styleUrl: './avatar.css',
})
export class Avatar {
  readonly name = input.required<string>();
  readonly size = input<'sm' | 'md' | 'lg'>('md');
  /** Seed value for palette selection — defaults to userId, falls back to name. */
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
