import { Component, input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

/**
 * Generic reusable empty state component — used in chat ("no messages yet"),
 * copilot ("ask a question about your channels"), and channel list.
 * Receives translated keys via `input()` to avoid hardcoded UI strings.
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
  /** 'dark' when rendered over dark navigation sidebar (channels), 'light' elsewhere. */
  readonly variant = input<'light' | 'dark'>('light');
}
