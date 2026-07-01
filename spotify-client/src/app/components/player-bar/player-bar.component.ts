import { Component, ElementRef, ViewChild, computed, signal, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AudioService } from '../../services/audio.service';
import { ApiService, Song } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-player-bar',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './player-bar.component.html',
  styleUrls: ['./player-bar.component.css']
})
export class PlayerBarComponent {
  @Output() toggleQueue = new EventEmitter<void>();

  // Seek and Volume calculation signals
  progressPercent = computed(() => {
    const duration = this.audioService.duration();
    const time = this.audioService.currentTime();
    return duration > 0 ? (time / duration) * 100 : 0;
  });

  volumePercent = computed(() => {
    return this.audioService.isMuted() ? 0 : this.audioService.volume() * 100;
  });

  isLiked = computed(() => {
    const song = this.audioService.currentSong();
    if (!song) return false;
    return this.apiService.likedSongIds().has(song.id);
  });

  constructor(
    public audioService: AudioService,
    public apiService: ApiService,
    public authService: AuthService
  ) {}

  formatTime(seconds: number): string {
    if (isNaN(seconds) || seconds === null) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  }

  onProgressChange(e: any): void {
    const percent = parseFloat(e.target.value);
    this.audioService.seek(percent);
  }

  onVolumeChange(e: any): void {
    const volume = parseFloat(e.target.value) / 100;
    this.audioService.setVolume(volume);
  }

  toggleLike(): void {
    const song = this.audioService.currentSong();
    if (!song) return;
    this.apiService.toggleLike(song.id).subscribe();
  }

  toggleMute(): void {
    this.audioService.toggleMute();
  }

  toggleShuffle(): void {
    this.audioService.toggleShuffle();
  }

  toggleRepeat(): void {
    this.audioService.toggleRepeat();
  }

  playPause(): void {
    this.audioService.togglePlay();
  }

  prev(): void {
    this.audioService.prev();
  }

  next(): void {
    this.audioService.next();
  }
}
