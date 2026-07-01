import { Injectable, signal, computed, effect } from '@angular/core';
import { Song } from './api.service';

@Injectable({
  providedIn: 'root'
})
export class AudioService {
  private audio = new Audio();

  // Playback state signals
  currentSong = signal<Song | null>(null);
  isPlaying = signal<boolean>(false);
  currentTime = signal<number>(0);
  duration = signal<number>(0);
  volume = signal<number>(0.8);
  isMuted = signal<boolean>(false);
  isShuffle = signal<boolean>(false);
  isRepeat = signal<number>(0); // 0: no repeat, 1: repeat queue, 2: repeat track

  // Queue state signals
  playQueue = signal<Song[]>([]);
  queueIndex = signal<number>(-1);
  originalQueue = signal<Song[]>([]);

  // Popup overlay signal
  isPopupOpen = signal<boolean>(false);

  constructor() {
    this.audio.volume = this.volume();
    
    // Bind HTML5 audio events to signals
    this.audio.addEventListener('timeupdate', () => {
      this.currentTime.set(this.audio.currentTime);
    });

    this.audio.addEventListener('loadedmetadata', () => {
      this.duration.set(this.audio.duration || 0);
    });

    this.audio.addEventListener('ended', () => {
      this.handleSongEnded();
    });

    this.audio.addEventListener('play', () => {
      this.isPlaying.set(true);
    });

    this.audio.addEventListener('pause', () => {
      this.isPlaying.set(false);
    });
  }

  playTrack(song: Song, contextList?: Song[]): void {
    // Open the popup detail view
    this.isPopupOpen.set(true);

    // If a new list context is provided, load it
    if (contextList && contextList.length > 0) {
      this.playQueue.set([...contextList]);
      this.originalQueue.set([...contextList]);
    } else if (this.playQueue().length === 0) {
      this.playQueue.set([song]);
      this.originalQueue.set([song]);
    }

    // Set queue index
    const idx = this.playQueue().findIndex(s => s.id === song.id);
    if (idx !== -1) {
      this.queueIndex.set(idx);
    } else {
      this.playQueue.update(q => [...q, song]);
      this.originalQueue.update(q => [...q, song]);
      this.queueIndex.set(this.playQueue().length - 1);
    }

    this.currentSong.set(song);
    this.loadAndPlay(song.streamUrl, song.localPath);
  }

  private loadAndPlay(url: string, fallbackUrl?: string): void {
    this.audio.src = url;
    this.audio.load();
    this.audio.play()
      .then(() => {
        this.isPlaying.set(true);
      })
      .catch(err => {
        console.warn('Playback failed on primary URL, attempting fallback...', err);
        if (fallbackUrl && fallbackUrl !== url) {
          this.audio.src = fallbackUrl;
          this.audio.load();
          this.audio.play()
            .then(() => this.isPlaying.set(true))
            .catch(localErr => console.error('Fallback playback failed:', localErr));
        }
      });
  }

  togglePlay(): void {
    const song = this.currentSong();
    if (!song) return;

    if (this.isPlaying()) {
      this.audio.pause();
    } else {
      this.audio.play().catch(err => console.error('Playback failed', err));
    }
  }

  next(): void {
    const queue = this.playQueue();
    if (queue.length === 0) return;

    let nextIndex = this.queueIndex() + 1;
    if (nextIndex >= queue.length) {
      if (this.isRepeat() === 1) {
        nextIndex = 0; // loop back to start
      } else {
        return; // stop at end of queue
      }
    }

    this.queueIndex.set(nextIndex);
    const nextSong = queue[nextIndex];
    this.currentSong.set(nextSong);
    this.loadAndPlay(nextSong.streamUrl, nextSong.localPath);
  }

  prev(): void {
    const queue = this.playQueue();
    if (queue.length === 0) return;

    let prevIndex = this.queueIndex() - 1;
    if (prevIndex < 0) {
      if (this.isRepeat() === 1) {
        prevIndex = queue.length - 1; // loop to end
      } else {
        prevIndex = 0; // stay on first song
      }
    }

    this.queueIndex.set(prevIndex);
    const prevSong = queue[prevIndex];
    this.currentSong.set(prevSong);
    this.loadAndPlay(prevSong.streamUrl, prevSong.localPath);
  }

  seek(percent: number): void {
    if (!this.audio.duration) return;
    const seekTime = (percent / 100) * this.audio.duration;
    this.audio.currentTime = seekTime;
    this.currentTime.set(seekTime);
  }

  setVolume(vol: number): void {
    const v = Math.max(0, Math.min(1, vol));
    this.volume.set(v);
    this.audio.volume = v;
    if (v > 0) {
      this.isMuted.set(false);
      this.audio.muted = false;
    }
  }

  toggleMute(): void {
    const currentMute = this.isMuted();
    this.isMuted.set(!currentMute);
    this.audio.muted = !currentMute;
  }

  toggleShuffle(): void {
    const shuffleVal = !this.isShuffle();
    this.isShuffle.set(shuffleVal);

    const queue = [...this.playQueue()];
    const current = this.currentSong();

    if (shuffleVal) {
      // Backup original order
      this.originalQueue.set([...queue]);
      if (current) {
        // Keep current playing song at the top of queue, shuffle other songs
        const otherSongs = queue.filter(s => s.id !== current.id);
        this.shuffleArray(otherSongs);
        this.playQueue.set([current, ...otherSongs]);
        this.queueIndex.set(0);
      } else {
        this.shuffleArray(queue);
        this.playQueue.set(queue);
        this.queueIndex.set(-1);
      }
    } else {
      // Revert to original queue order
      const original = [...this.originalQueue()];
      this.playQueue.set(original);
      if (current) {
        const idx = original.findIndex(s => s.id === current.id);
        this.queueIndex.set(idx);
      }
    }
  }

  toggleRepeat(): void {
    // Cycles 0 -> 1 -> 2 -> 0
    this.isRepeat.update(r => (r + 1) % 3);
  }

  playAll(tracks: Song[]): void {
    if (tracks.length === 0) return;
    this.playQueue.set([...tracks]);
    this.originalQueue.set([...tracks]);
    
    if (this.isShuffle()) {
      const firstIndex = Math.floor(Math.random() * tracks.length);
      const firstSong = tracks[firstIndex];
      const otherSongs = tracks.filter((_, idx) => idx !== firstIndex);
      this.shuffleArray(otherSongs);
      this.playQueue.set([firstSong, ...otherSongs]);
      this.queueIndex.set(0);
      this.currentSong.set(firstSong);
      this.loadAndPlay(firstSong.streamUrl, firstSong.localPath);
    } else {
      this.queueIndex.set(0);
      this.currentSong.set(tracks[0]);
      this.loadAndPlay(tracks[0].streamUrl, tracks[0].localPath);
    }
  }

  addToQueue(song: Song): void {
    const queue = this.playQueue();
    if (queue.some(s => s.id === song.id)) return;
    this.playQueue.update(q => [...q, song]);
    this.originalQueue.update(q => [...q, song]);
  }

  removeFromQueue(songId: string): void {
    const queue = this.playQueue();
    const idx = queue.findIndex(s => s.id === songId);
    if (idx === -1) return;

    this.playQueue.update(q => q.filter(s => s.id !== songId));
    this.originalQueue.update(q => q.filter(s => s.id !== songId));

    const currentIdx = this.queueIndex();
    if (currentIdx === idx) {
      this.next();
    } else if (currentIdx > idx) {
      this.queueIndex.update(i => i - 1);
    }
  }

  clearQueue(): void {
    this.audio.pause();
    this.playQueue.set([]);
    this.originalQueue.set([]);
    this.currentSong.set(null);
    this.queueIndex.set(-1);
    this.currentTime.set(0);
    this.duration.set(0);
    this.isPlaying.set(false);
  }

  private handleSongEnded(): void {
    const repeatMode = this.isRepeat();
    if (repeatMode === 2) {
      // Repeat current track
      this.audio.currentTime = 0;
      this.audio.play().catch(err => console.error('Repeat playback failed', err));
    } else {
      // Go to next song
      this.next();
    }
  }

  private shuffleArray(array: any[]): void {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
  }
}
