import { Injectable, signal, effect } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, tap, catchError, of } from 'rxjs';
import { AuthService } from './auth.service';

export interface Song {
  id: string;
  title: string;
  artist: string;
  album: string;
  year: string;
  category: string;
  cover: string;
  localPath: string;
  streamUrl: string;
  uploadedBy?: string;
}

export interface Playlist {
  id: string;
  userId: string;
  name: string;
  songIds: string[];
}

@Injectable({
  providedIn: 'root'
})
export class ApiService {
  allSongs = signal<Song[]>([]);
  likedSongIds = signal<Set<string>>(new Set());
  playlists = signal<Playlist[]>([]);

  constructor(private http: HttpClient, private authService: AuthService) {
    effect(() => {
      const loggedIn = this.authService.isLoggedIn();
      if (loggedIn) {
        this.loadLikedSongs();
        this.loadPlaylists();
      } else {
        this.likedSongIds.set(new Set());
        this.playlists.set([]);
      }
    }, { allowSignalWrites: true });

    this.fetchSongsCatalog();
  }

  fetchSongsCatalog(): void {
    this.http.get<Song[]>('/api/songs').subscribe({
      next: (songs) => this.allSongs.set(songs),
      error: (err) => console.error('Failed to load songs catalog', err)
    });
  }

  loadLikedSongs(): void {
    const headers = this.authService.getAuthHeaders();
    this.http.get<{ songIds: string[] }>('/api/library/likes', { headers }).subscribe({
      next: (res) => this.likedSongIds.set(new Set(res.songIds)),
      error: (err) => console.error('Failed to load liked songs', err)
    });
  }

  loadPlaylists(): void {
    const headers = this.authService.getAuthHeaders();
    this.http.get<{ playlists: Playlist[] }>('/api/library/playlists', { headers }).subscribe({
      next: (res) => this.playlists.set(res.playlists),
      error: (err) => console.error('Failed to load playlists', err)
    });
  }

  toggleLike(songId: string): Observable<any> {
    if (!this.authService.token()) {
      return of({ error: "Log in to like songs" });
    }
    const headers = this.authService.getAuthHeaders();
    return this.http.post<{ isLiked: boolean; songIds: string[] }>('/api/library/likes/toggle', { songId }, { headers }).pipe(
      tap(res => {
        this.likedSongIds.set(new Set(res.songIds));
      }),
      catchError(err => {
        console.error('Failed to toggle like', err);
        return of(null);
      })
    );
  }

  uploadSong(songData: {
    title: string;
    artist: string;
    album: string;
    category?: string;
    coverData?: string | null;
    coverUrl?: string;
    audioData?: string | null;
    streamUrl?: string;
  }): Observable<Song | null> {
    const headers = this.authService.getAuthHeaders();
    return this.http.post<Song>('/api/songs/upload', songData, { headers }).pipe(
      tap(newSong => {
        this.allSongs.update(songs => [...songs, newSong]);
      }),
      catchError(err => {
        console.error('Failed to upload song', err);
        throw err;
      })
    );
  }

  getPresignedUrl(prefix: 'audio' | 'cover', mimeType: string): Observable<{ usePresignedUrl: boolean; uploadUrl?: string; publicUrl?: string }> {
    const headers = this.authService.getAuthHeaders();
    return this.http.post<{ usePresignedUrl: boolean; uploadUrl?: string; publicUrl?: string }>(
      '/api/uploads/presign',
      { prefix, mimeType },
      { headers }
    );
  }

  uploadToStorage(uploadUrl: string, file: File): Observable<any> {
    const headers = new HttpHeaders({
      'Content-Type': file.type
    });
    return this.http.put(uploadUrl, file, { headers });
  }

  deleteSong(songId: string): Observable<any> {
    const headers = this.authService.getAuthHeaders();
    return this.http.delete<{ success: boolean }>(`/api/songs/${songId}`, { headers }).pipe(
      tap(() => {
        this.allSongs.update(songs => songs.filter(s => s.id !== songId));
      }),
      catchError(err => {
        console.error('Failed to delete song', err);
        throw err;
      })
    );
  }

  updateAdminCredentials(credentials: { newUsername: string; newPassword: string }): Observable<any> {
    const headers = this.authService.getAuthHeaders();
    return this.http.post('/api/admin/credentials', credentials, { headers });
  }

  createPlaylist(name: string): Observable<Playlist | null> {
    const headers = this.authService.getAuthHeaders();
    return this.http.post<Playlist>('/api/library/playlists', { name }, { headers }).pipe(
      tap(newPlaylist => {
        this.playlists.update(pList => [...pList, newPlaylist]);
      }),
      catchError(err => {
        console.error('Failed to create playlist', err);
        return of(null);
      })
    );
  }

  addSongToPlaylist(playlistId: string, songId: string): Observable<Playlist | null> {
    const headers = this.authService.getAuthHeaders();
    return this.http.post<Playlist>(`/api/library/playlists/${playlistId}/add`, { songId }, { headers }).pipe(
      tap(updatedPlaylist => {
        this.playlists.update(pList => pList.map(p => p.id === playlistId ? updatedPlaylist : p));
      }),
      catchError(err => {
        console.error('Failed to add song to playlist', err);
        return of(null);
      })
    );
  }

  removeSongFromPlaylist(playlistId: string, songId: string): Observable<Playlist | null> {
    const headers = this.authService.getAuthHeaders();
    return this.http.post<Playlist>(`/api/library/playlists/${playlistId}/remove`, { songId }, { headers }).pipe(
      tap(updatedPlaylist => {
        this.playlists.update(pList => pList.map(p => p.id === playlistId ? updatedPlaylist : p));
      }),
      catchError(err => {
        console.error('Failed to remove song from playlist', err);
        return of(null);
      })
    );
  }

  deletePlaylist(playlistId: string): Observable<any> {
    const headers = this.authService.getAuthHeaders();
    return this.http.delete<{ success: boolean }>(`/api/library/playlists/${playlistId}`, { headers }).pipe(
      tap(res => {
        if (res.success) {
          this.playlists.update(pList => pList.filter(p => p.id !== playlistId));
        }
      }),
      catchError(err => {
        console.error('Failed to delete playlist', err);
        return of(null);
      })
    );
  }
}
