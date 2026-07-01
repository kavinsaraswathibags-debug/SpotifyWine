import { Component, OnInit, OnDestroy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet, RouterModule } from '@angular/router';
import { SidebarComponent } from './components/sidebar/sidebar.component';
import { PlayerBarComponent } from './components/player-bar/player-bar.component';
import { QueueDrawerComponent } from './components/queue-drawer/queue-drawer.component';
import { AuthService } from './services/auth.service';
import { AudioService } from './services/audio.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    RouterOutlet,
    RouterModule,
    SidebarComponent,
    PlayerBarComponent,
    QueueDrawerComponent
  ],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent implements OnInit, OnDestroy {
  title = 'spotify-client';
  
  isQueueOpen = signal<boolean>(false);
  
  // Real-time procedural equalizer visualizer bars (18 bands)
  visualizerBars = signal<number[]>(Array(18).fill(4));
  private visInterval: any;

  constructor(
    public authService: AuthService,
    public audioService: AudioService
  ) {}

  ngOnInit(): void {
    this.startVisualizerAnimation();
  }

  ngOnDestroy(): void {
    if (this.visInterval) {
      clearInterval(this.visInterval);
    }
  }

  // Animates equalizer bar heights procedurally while song plays (and decays to baseline when paused)
  private startVisualizerAnimation(): void {
    this.visInterval = setInterval(() => {
      if (this.audioService.isPlaying()) {
        this.visualizerBars.update(bars => {
          return bars.map((height, idx) => {
            let min = 6;
            let max = 35;
            
            // Simulating bass, mid, and treble groups
            if (idx < 6) { // Bass region
              max = 68;
              min = 14;
            } else if (idx < 12) { // Midrange region
              max = 48;
              min = 8;
            } else { // Treble region
              max = 28;
              min = 4;
            }
            
            const variance = (Math.random() - 0.5) * 16;
            let nextHeight = height + variance;
            if (nextHeight < min) nextHeight = min;
            if (nextHeight > max) nextHeight = max;
            return Math.floor(nextHeight);
          });
        });
      } else {
        // Idle/Paused state decay
        this.visualizerBars.update(bars => {
          return bars.map(h => (h > 4 ? Math.max(4, h - 5) : 4));
        });
      }
    }, 60);
  }

  // Audio seeking / tracking
  seekSong(e: Event): void {
    const input = e.target as HTMLInputElement;
    const seekVal = parseFloat(input.value);
    const duration = this.audioService.duration();
    if (duration > 0) {
      const percent = (seekVal / duration) * 100;
      this.audioService.seek(percent);
    }
  }

  // Duration label formatter
  formatTime(seconds: number): string {
    if (isNaN(seconds) || seconds === null) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  }

  toggleQueue(): void {
    this.isQueueOpen.update(val => !val);
  }

  setVolume(e: Event): void {
    const input = e.target as HTMLInputElement;
    this.audioService.setVolume(parseFloat(input.value));
  }
}
