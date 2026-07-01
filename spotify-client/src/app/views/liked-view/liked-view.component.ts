import { Component, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { ApiService, Song } from '../../services/api.service';
import { AudioService } from '../../services/audio.service';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-liked-view',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './liked-view.component.html',
  styleUrls: ['./liked-view.component.css']
})
export class LikedViewComponent {
  likedSongs = computed(() => {
    return this.apiService.allSongs().filter(song => 
      this.apiService.likedSongIds().has(song.id)
    );
  });

  constructor(
    public apiService: ApiService,
    public audioService: AudioService,
    public authService: AuthService,
    private router: Router
  ) {}

  playLikedSongs(): void {
    const tracks = this.likedSongs();
    if (tracks.length > 0) {
      this.audioService.playAll(tracks);
    }
  }

  playTrack(song: Song): void {
    this.audioService.playTrack(song, this.likedSongs());
  }

  toggleLike(song: Song, e: Event): void {
    e.stopPropagation();
    this.apiService.toggleLike(song.id).subscribe();
  }

  showOptions(song: Song, e: Event): void {
    e.stopPropagation();
    const activePlaylists = this.apiService.playlists();
    if (activePlaylists.length === 0) {
      alert("Create a custom playlist first to add songs!");
      return;
    }

    const playlistOptions = activePlaylists.map((p, idx) => `${idx + 1}. ${p.name}`).join('\n');
    const choice = prompt(`Add "${song.title}" to a playlist:\n\n${playlistOptions}\n\nEnter the number:`);
    
    if (choice) {
      const idx = parseInt(choice) - 1;
      if (idx >= 0 && idx < activePlaylists.length) {
        const selectedPlaylist = activePlaylists[idx];
        this.apiService.addSongToPlaylist(selectedPlaylist.id, song.id).subscribe({
          next: () => alert(`Added "${song.title}" to playlist "${selectedPlaylist.name}"!`)
        });
      }
    }
  }
}
