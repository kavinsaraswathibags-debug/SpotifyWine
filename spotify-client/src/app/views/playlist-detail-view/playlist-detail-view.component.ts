import { Component, OnInit, OnDestroy, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, ActivatedRoute, Router } from '@angular/router';
import { ApiService, Song, Playlist } from '../../services/api.service';
import { AudioService } from '../../services/audio.service';
import { AuthService } from '../../services/auth.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-playlist-detail-view',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './playlist-detail-view.component.html',
  styleUrls: ['./playlist-detail-view.component.css']
})
export class PlaylistDetailViewComponent implements OnInit, OnDestroy {
  private routeSub!: Subscription;
  
  playlistId = signal<string>('');
  isFeatured = signal<boolean>(false);

  // Derived playlist metadata
  playlistName = computed(() => {
    if (this.isFeatured()) {
      if (this.playlistId() === 'featured-3') return '3 Movie';
      return 'Featured Album';
    } else {
      const id = this.playlistId().replace('custom-', '');
      const p = this.apiService.playlists().find(x => x.id === id);
      return p ? p.name : 'Custom Playlist';
    }
  });

  playlistOwner = computed(() => {
    if (this.isFeatured()) {
      return 'Anirudh Ravichander';
    } else {
      return this.authService.currentUser()?.username || 'User';
    }
  });

  playlistCover = computed(() => {
    if (this.isFeatured()) {
      if (this.playlistId() === 'featured-3') return '/covers/cover3movie.svg';
      return '/covers/cover1.svg';
    } else {
      return '/covers/cover2.svg'; // default custom playlist icon background
    }
  });

  // Songs currently in the playlist
  playlistSongs = computed(() => {
    const all = this.apiService.allSongs();
    if (this.isFeatured()) {
      if (this.playlistId() === 'featured-3') {
        return all.filter(s => s.album === "3");
      }
      return [];
    } else {
      const id = this.playlistId().replace('custom-', '');
      const p = this.apiService.playlists().find(x => x.id === id);
      if (!p) return [];
      return all.filter(song => p.songIds.includes(song.id));
    }
  });

  // Recommended candidate songs that can be added to custom playlists (limit to 6)
  recommendedSongs = computed(() => {
    if (this.isFeatured()) return [];
    
    const currentSongIds = this.playlistSongs().map(s => s.id);
    // Suggest catalog songs not already in this playlist
    return this.apiService.allSongs()
      .filter(song => !currentSongIds.includes(song.id))
      .slice(0, 6);
  });

  constructor(
    public apiService: ApiService,
    public audioService: AudioService,
    public authService: AuthService,
    private route: ActivatedRoute,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.routeSub = this.route.params.subscribe(params => {
      const id = params['id'] || '';
      this.playlistId.set(id);
      this.isFeatured.set(id.startsWith('featured-'));
    });
  }

  ngOnDestroy(): void {
    if (this.routeSub) {
      this.routeSub.unsubscribe();
    }
  }

  playPlaylist(): void {
    const tracks = this.playlistSongs();
    if (tracks.length > 0) {
      this.audioService.playAll(tracks);
    }
  }

  playTrack(song: Song): void {
    this.audioService.playTrack(song, this.playlistSongs());
  }

  removeTrack(songId: string, e: Event): void {
    e.stopPropagation();
    if (this.isFeatured()) return;
    const realId = this.playlistId().replace('custom-', '');
    this.apiService.removeSongFromPlaylist(realId, songId).subscribe();
  }

  addTrack(songId: string, e: Event): void {
    e.stopPropagation();
    if (this.isFeatured()) return;
    const realId = this.playlistId().replace('custom-', '');
    this.apiService.addSongToPlaylist(realId, songId).subscribe();
  }

  deletePlaylist(): void {
    if (this.isFeatured()) return;
    const conf = confirm(`Are you sure you want to delete the playlist "${this.playlistName()}"?`);
    if (!conf) return;

    const realId = this.playlistId().replace('custom-', '');
    this.apiService.deletePlaylist(realId).subscribe({
      next: () => {
        this.router.navigate(['/']);
      }
    });
  }
}
