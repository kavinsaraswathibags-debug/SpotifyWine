import { Component, Output, EventEmitter, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AudioService } from '../../services/audio.service';
import { ApiService, Song } from '../../services/api.service';

@Component({
  selector: 'app-queue-drawer',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './queue-drawer.component.html',
  styleUrls: ['./queue-drawer.component.css']
})
export class QueueDrawerComponent {
  @Output() close = new EventEmitter<void>();

  // Filter queue for "Next Up" songs (songs after queueIndex)
  nextUpSongs = computed(() => {
    const queue = this.audioService.playQueue();
    const idx = this.audioService.queueIndex();
    if (idx === -1 || idx >= queue.length - 1) return [];
    return queue.slice(idx + 1);
  });

  constructor(
    public audioService: AudioService,
    private apiService: ApiService
  ) {}

  playQueueTrack(song: Song): void {
    this.audioService.playTrack(song);
  }

  removeFromQueue(songId: string, e: Event): void {
    e.stopPropagation();
    this.audioService.removeFromQueue(songId);
  }
}
