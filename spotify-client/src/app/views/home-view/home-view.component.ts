import { Component, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ApiService, Song } from '../../services/api.service';
import { AudioService } from '../../services/audio.service';
import { AuthService } from '../../services/auth.service';

interface Category {
  title: string;
  desc: string;
  icon: string;
  color: string;
  cover: string;
}

@Component({
  selector: 'app-home-view',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './home-view.component.html',
  styleUrls: ['./home-view.component.css']
})
export class HomeViewComponent {
  categories: Category[] = [
    { title: "Classic Romances", desc: "Timeless retro love duets", icon: "fa-heart", color: "#800020", cover: "/covers/cover1.svg" },
    { title: "Epic Dramas", desc: "Powerful cinematic hits", icon: "fa-masks-theater", color: "#58111A", cover: "/covers/cover2.svg" },
    { title: "Rural Folk Hits", desc: "Earthy traditional rhythms", icon: "fa-guitar", color: "#d4af37", cover: "/covers/cover3.svg" },
    { title: "Synthesizer Magic", desc: "Illayaraja's electronic breakthroughs", icon: "fa-bolt", color: "#8a2be2", cover: "/covers/cover4.svg" },
    { title: "Melodious Love", desc: "Soft midnight memories", icon: "fa-moon", color: "#483d8b", cover: "/covers/cover5.svg" },
    { title: "Retro Hits", desc: "Timeless tunes from the 80s", icon: "fa-compact-disc", color: "#722f37", cover: "/covers/cover6.svg" }
  ];

  // Tab Filtering Catalog
  activeFilter = signal<'all' | 'maestro' | 'movie3' | 'uploads'>('all');

  filteredSongs = computed(() => {
    const all = this.apiService.allSongs();
    const filter = this.activeFilter();
    
    if (filter === 'maestro') {
      return all.filter(s => s.artist === "Ilaiyaraaja");
    } else if (filter === 'movie3') {
      return all.filter(s => s.album === "3");
    } else if (filter === 'uploads') {
      return all.filter(s => s.uploadedBy !== "system");
    }
    return all;
  });

  // Song Upload form state
  isUploadModalOpen = signal<boolean>(false);
  isUploading = signal<boolean>(false);
  uploadError = signal<string>('');
  uploadStatus = signal<string>('');
  
  songTitle = '';
  songArtist = '';
  songAlbum = '';
  songCategory = 'Shared Tracks';
  songCoverUrl = '';
  songStreamUrl = '';
  
  coverFile: File | null = null;
  audioFiles: File[] = [];

  constructor(
    public apiService: ApiService,
    public audioService: AudioService,
    public authService: AuthService,
    private router: Router
  ) {}

  setFilter(filter: 'all' | 'maestro' | 'movie3' | 'uploads'): void {
    this.activeFilter.set(filter);
  }

  playAllHero(): void {
    const maestroSongs = this.apiService.allSongs().filter(s => s.artist === "Ilaiyaraaja");
    this.audioService.playAll(maestroSongs);
  }

  playCategory(categoryTitle: string, e: Event): void {
    e.stopPropagation();
    const songs = this.apiService.allSongs().filter(s => s.category === categoryTitle);
    this.audioService.playAll(songs);
  }

  onCategoryClick(cat: Category): void {
    this.router.navigate(['/search'], { queryParams: { q: cat.title } });
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

  // Ownership Check: User can delete song only if they uploaded it (or are admin)
  canDeleteSong(song: Song): boolean {
    if (!this.authService.isLoggedIn()) return false;
    if (this.authService.isAdmin()) return true;
    return song.uploadedBy === this.authService.currentUser()?.id;
  }

  deleteSong(song: Song, e: Event): void {
    e.stopPropagation();
    const conf = confirm(`Are you sure you want to delete "${song.title}"?`);
    if (!conf) return;
    
    this.apiService.deleteSong(song.id).subscribe({
      next: () => {
        alert(`Deleted "${song.title}" successfully.`);
      },
      error: (err) => {
        alert(err.error?.error || 'Failed to delete song.');
      }
    });
  }

  // Upload modal handlers
  openUploadModal(): void {
    if (!this.authService.token()) {
      this.router.navigate(['/auth']);
      return;
    }
    this.isUploadModalOpen.set(true);
    this.uploadError.set('');
    this.uploadStatus.set('');
  }

  closeUploadModal(): void {
    this.isUploadModalOpen.set(false);
    this.resetUploadForm();
  }

  onCoverFileSelected(e: any): void {
    const files = e.target.files;
    if (files && files.length > 0) {
      this.coverFile = files[0];
    }
  }

  onAudioFileSelected(e: any): void {
    const files = e.target.files;
    if (files && files.length > 0) {
      this.audioFiles = Array.from(files);
    }
  }

  private readFileAsBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (error) => reject(error);
    });
  }

  async handleSongUpload(): Promise<void> {
    this.uploadError.set('');
    this.uploadStatus.set('');
    
    const album = this.songAlbum.trim();
    const category = this.songCategory.trim();

    if (!album) {
      this.uploadError.set('Album/Movie is required.');
      return;
    }

    if (this.audioFiles.length === 0 && !this.songStreamUrl) {
      this.uploadError.set('Please select local audio files or provide a stream URL.');
      return;
    }

    this.isUploading.set(true);

    try {
      let coverData: string | null = null;
      if (this.coverFile) {
        coverData = await this.readFileAsBase64(this.coverFile);
      }

      // If multiple local files are selected, we perform sequential bulk uploads
      if (this.audioFiles.length > 1) {
        let successCount = 0;
        
        for (let i = 0; i < this.audioFiles.length; i++) {
          const file = this.audioFiles[i];
          const filename = file.name.replace(/\.[^/.]+$/, ""); // strip extension
          
          let title = filename;
          let artist = this.songArtist.trim() || 'Unknown Artist';

          // Guess artist and title if filename contains a dash, e.g. "Artist - Title.mp3"
          if (filename.includes('-')) {
            const parts = filename.split('-');
            artist = parts[0].trim();
            title = parts[1].trim();
          }

          this.uploadStatus.set(`Uploading song ${i + 1} of ${this.audioFiles.length}: "${title}"...`);
          
          const audioData = await this.readFileAsBase64(file);

          try {
            await new Promise<void>((resolve, reject) => {
              this.apiService.uploadSong({
                title,
                artist,
                album,
                category,
                coverData,
                coverUrl: this.songCoverUrl || undefined,
                audioData,
                streamUrl: undefined
              }).subscribe({
                next: () => {
                  successCount++;
                  resolve();
                },
                error: (err) => reject(err)
              });
            });
          } catch (uploadErr: any) {
            console.warn(`Bulk upload failed for "${title}":`, uploadErr);
          }
        }

        alert(`Bulk upload complete! Successfully uploaded ${successCount} of ${this.audioFiles.length} songs.`);
        this.closeUploadModal();
      } else {
        // Standard single track upload
        let title = this.songTitle.trim();
        let artist = this.songArtist.trim() || 'Unknown Artist';

        if (this.audioFiles[0]) {
          const filename = this.audioFiles[0].name.replace(/\.[^/.]+$/, "");
          if (!title) {
            title = filename;
          }
          if (!this.songArtist.trim() && filename.includes('-')) {
            const parts = filename.split('-');
            artist = parts[0].trim();
            title = parts[1].trim();
          }
        }

        if (!title) {
          this.uploadError.set('Title is required.');
          this.isUploading.set(false);
          return;
        }

        let audioData: string | null = null;
        if (this.audioFiles[0]) {
          audioData = await this.readFileAsBase64(this.audioFiles[0]);
        }

        this.apiService.uploadSong({
          title,
          artist,
          album,
          category,
          coverData,
          coverUrl: this.songCoverUrl || undefined,
          audioData,
          streamUrl: this.songStreamUrl || undefined
        }).subscribe({
          next: () => {
            alert(`Song "${title}" uploaded successfully!`);
            this.closeUploadModal();
          },
          error: (err) => {
            this.uploadError.set(err.error?.error || 'Failed to upload song.');
            this.isUploading.set(false);
          }
        });
      }
    } catch (e) {
      console.error(e);
      this.uploadError.set('Error parsing selected files.');
      this.isUploading.set(false);
    }
  }

  private resetUploadForm(): void {
    this.songTitle = '';
    this.songArtist = '';
    this.songAlbum = '';
    this.songCategory = 'Shared Tracks';
    this.songCoverUrl = '';
    this.songStreamUrl = '';
    this.coverFile = null;
    this.audioFiles = [];
    this.isUploading.set(false);
    this.uploadStatus.set('');
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
