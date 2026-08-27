import { Component } from '@angular/core';

/**
 * Animated skeleton placeholder rendered while loading the initial message page.
 * Provides perceived performance optimization over a blank screen or isolated spinner.
 */
@Component({
  selector: 'app-message-skeleton',
  imports: [],
  templateUrl: './message-skeleton.html',
  styleUrl: './message-skeleton.css',
})
export class MessageSkeleton {
  /** Row array index used to render skeleton bars mimicking realistic conversation flow. */
  protected readonly rows = [0, 1, 2, 3, 4, 5];
}
