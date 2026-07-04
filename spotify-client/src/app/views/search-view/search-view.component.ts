import { Component, OnInit, OnDestroy, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, ActivatedRoute, Router } from '@angular/router';
import { ApiService, Song } from '../../services/api.service';
import { AudioService } from '../../services/audio.service';
import { AuthService } from '../../services/auth.service';
import { ScrollAnimateDirective } from '../../directives/scroll-animate.directive';
import { Subscription } from 'rxjs';

interface GenreCard {
  title: string;
  icon: string;
  color: string;
}

@Component({
  selector: 'app-search-view',
  standalone: true,
  imports: [CommonModule, RouterModule, ScrollAnimateDirective],
  templateUrl: './search-view.component.html',
  styleUrls: ['./search-view.component.css']
})
export class SearchViewComponent implements OnInit, OnDestroy {
  searchQuery = signal<string>('');
  private routeSub!: Subscription;

  genres: GenreCard[] = [
    { title: "Classic Romances", icon: "fa-heart", color: "#800020" },
    { title: "Epic Dramas", icon: "fa-masks-theater", color: "#58111A" },
    { title: "Rural Folk Hits", icon: "fa-guitar", color: "#d4af37" },
    { title: "Synthesizer Magic", icon: "fa-bolt", color: "#8a2be2" },
    { title: "Melodious Love", icon: "fa-moon", color: "#483d8b" },
    { title: "Retro Hits", icon: "fa-compact-disc", color: "#722f37" },
    { title: "Romantic Melodies", icon: "fa-envelope-open-text", color: "#b91c1c" },
    { title: "Cinematic Themes", icon: "fa-film", color: "#475569" },
    { title: "Viral Hits", icon: "fa-fire", color: "#ea580c" }
  ];

  filteredSongs = computed(() => {
    const q = this.searchQuery().toLowerCase().trim();
    if (!q) return [];
    
    return this.apiService.allSongs().filter(song => 
      song.title.toLowerCase().includes(q) ||
      song.artist.toLowerCase().includes(q) ||
      song.album.toLowerCase().includes(q) ||
      song.category.toLowerCase().includes(q)
    );
  });

  constructor(
    public apiService: ApiService,
    public audioService: AudioService,
    public authService: AuthService,
    private route: ActivatedRoute,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.routeSub = this.route.queryParams.subscribe(params => {
      this.searchQuery.set(params['q'] || '');
    });
  }

  ngOnDestroy(): void {
    if (this.routeSub) {
      this.routeSub.unsubscribe();
    }
  }

  onSearchInput(e: any): void {
    const val = e.target.value;
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { q: val || null },
      queryParamsHandling: 'merge'
    });
  }

  clearSearch(): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { q: null },
      queryParamsHandling: 'merge'
    });
  }

  selectGenre(genreTitle: string): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { q: genreTitle },
      queryParamsHandling: 'merge'
    });
  }

  playTrack(song: Song): void {
    this.audioService.playTrack(song, this.filteredSongs());
  }

  toggleLike(song: Song, e: Event): void {
    e.stopPropagation();
    if (!this.authService.token()) {
      this.router.navigate(['/auth']);
      return;
    }
    this.apiService.toggleLike(song.id).subscribe();
  }

  isLiked(songId: string): boolean {
    return this.apiService.likedSongIds().has(songId);
  }

  showOptions(song: Song, e: Event): void {
    e.stopPropagation();
    const activePlaylists = this.apiService.playlists();
    if (activePlaylists.length === 0) {
      alert("Log in and create a custom playlist first to add songs!");
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
