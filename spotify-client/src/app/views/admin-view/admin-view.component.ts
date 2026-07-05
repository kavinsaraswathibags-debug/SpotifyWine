import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { ApiService, Song } from '../../services/api.service';
import { ScrollAnimateDirective } from '../../directives/scroll-animate.directive';

@Component({
  selector: 'app-admin-view',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, ScrollAnimateDirective],
  templateUrl: './admin-view.component.html',
  styleUrls: ['./admin-view.component.css']
})
export class AdminViewComponent implements OnInit {
  // Admin credentials update inputs
  newUsername = '';
  newPassword = '';
  credSuccessMsg = signal<string>('');
  credErrorMsg = signal<string>('');

  // Upload system song inputs
  songTitle = '';
  songArtist = '';
  songAlbum = '';
  songCategory = 'melody song';
  songCoverUrl = '';
  songStreamUrl = '';

  coverFile: File | null = null;
  audioFiles: File[] = [];

  uploadSuccessMsg = signal<string>('');
  uploadErrorMsg = signal<string>('');
  uploadStatus = signal<string>('');
  isUploading = signal<boolean>(false);

  constructor(
    public authService: AuthService,
    public apiService: ApiService,
    private router: Router
  ) {}

  ngOnInit(): void {
    // Access protection: redirect if not admin
    if (!this.authService.isAdmin()) {
      alert("Access denied. Admin authorization required.");
      this.router.navigate(['/auth']);
    }
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

  private async prepareUploadFile(file: File | null, prefix: 'audio' | 'cover'): Promise<{ data: string | null; url: string | undefined }> {
    if (!file) return { data: null, url: undefined };

    try {
      this.uploadStatus.set(`Requesting secure upload permission for ${file.name}...`);
      const presign = await new Promise<any>((resolve, reject) => {
        this.apiService.getPresignedUrl(prefix, file.type).subscribe({
          next: (res) => resolve(res),
          error: (err) => reject(err)
        });
      });

      if (presign && presign.usePresignedUrl && presign.uploadUrl) {
        this.uploadStatus.set(`Uploading ${file.name} directly to storage...`);
        await new Promise<void>((resolve, reject) => {
          this.apiService.uploadToStorage(presign.uploadUrl, file).subscribe({
            next: () => resolve(),
            error: (err) => reject(err)
          });
        });
        return { data: null, url: presign.publicUrl };
      }
    } catch (e) {
      console.warn("Direct upload failed, falling back to legacy base64 upload:", e);
    }

    // Fallback to base64 legacy upload
    this.uploadStatus.set(`Encoding ${file.name} for fallback upload...`);
    const base64Data = await this.readFileAsBase64(file);
    return { data: base64Data, url: undefined };
  }

  async handleSongUpload(): Promise<void> {
    this.uploadSuccessMsg.set('');
    this.uploadErrorMsg.set('');
    this.uploadStatus.set('');

    const album = this.songAlbum.trim();
    const category = this.songCategory.trim();

    if (!album) {
      this.uploadErrorMsg.set('Album/Movie is required.');
      return;
    }

    if (this.audioFiles.length === 0 && !this.songStreamUrl) {
      this.uploadErrorMsg.set('Please select local audio files or provide a stream URL.');
      return;
    }

    // Backend body limit is 100MB. We enforce a 75MB limit to leave room for base64 overhead (~33% increase).
    // Note: Vercel serverless functions have a 4.5MB request body limit. If deploying on Vercel, files should be under 3.2MB.
    const MAX_FILE_SIZE = 75 * 1024 * 1024; // 75MB
    
    if (this.coverFile && this.coverFile.size > MAX_FILE_SIZE) {
      this.uploadErrorMsg.set(`Cover file "${this.coverFile.name}" is too large (${(this.coverFile.size / 1024 / 1024).toFixed(2)}MB). Please choose a cover image under 75MB.`);
      return;
    }

    for (const file of this.audioFiles) {
      if (file.size > MAX_FILE_SIZE) {
        this.uploadErrorMsg.set(`Audio file "${file.name}" is too large (${(file.size / 1024 / 1024).toFixed(2)}MB). The server upload limit is 75MB. Please choose an audio file under 75MB, or use an external Stream URL.`);
        return;
      }
    }

    this.isUploading.set(true);

    try {
      let coverData: string | null = null;
      let finalCoverUrl = this.songCoverUrl || undefined;
      
      if (this.coverFile) {
        const coverUpload = await this.prepareUploadFile(this.coverFile, 'cover');
        coverData = coverUpload.data;
        if (coverUpload.url) {
          finalCoverUrl = coverUpload.url;
        }
      }

      // Bulk Upload files sequentially
      if (this.audioFiles.length > 1) {
        let successCount = 0;
        for (let i = 0; i < this.audioFiles.length; i++) {
          const file = this.audioFiles[i];
          const filename = file.name.replace(/\.[^/.]+$/, "");
          
          let title = filename;
          let artist = this.songArtist.trim() || 'Unknown Artist';

          if (filename.includes('-')) {
            const parts = filename.split('-');
            artist = parts[0].trim();
            title = parts[1].trim();
          }

          this.uploadStatus.set(`Uploading song ${i + 1} of ${this.audioFiles.length}: "${title}"...`);
          
          let audioData: string | null = null;
          let finalAudioUrl = undefined;
          
          const audioUpload = await this.prepareUploadFile(file, 'audio');
          audioData = audioUpload.data;
          if (audioUpload.url) {
            finalAudioUrl = audioUpload.url;
          }

          try {
            await new Promise<void>((resolve, reject) => {
              this.apiService.uploadSong({
                title,
                artist,
                album,
                category,
                coverData,
                coverUrl: finalCoverUrl,
                audioData,
                streamUrl: finalAudioUrl
              }).subscribe({
                next: () => {
                  successCount++;
                  resolve();
                },
                error: (err) => reject(err)
              });
            });
          } catch (uploadErr) {
            console.error(`Bulk upload error on "${title}":`, uploadErr);
          }
        }
        this.uploadSuccessMsg.set(`Bulk upload complete! Successfully uploaded ${successCount} of ${this.audioFiles.length} songs to system library.`);
        this.resetUploadForm();
      } else {
        // Single track upload
        let title = this.songTitle.trim();
        let artist = this.songArtist.trim() || 'Unknown Artist';

        if (this.audioFiles[0]) {
          const filename = this.audioFiles[0].name.replace(/\.[^/.]+$/, "");
          if (!title) title = filename;
          if (!this.songArtist.trim() && filename.includes('-')) {
            const parts = filename.split('-');
            artist = parts[0].trim();
            title = parts[1].trim();
          }
        }

        if (!title) {
          this.uploadErrorMsg.set('Title is required.');
          this.isUploading.set(false);
          return;
        }

        let audioData: string | null = null;
        let finalAudioUrl = this.songStreamUrl || undefined;
        
        if (this.audioFiles[0]) {
          const audioUpload = await this.prepareUploadFile(this.audioFiles[0], 'audio');
          audioData = audioUpload.data;
          if (audioUpload.url) {
            finalAudioUrl = audioUpload.url;
          }
        }

        this.apiService.uploadSong({
          title,
          artist,
          album,
          category,
          coverData,
          coverUrl: finalCoverUrl,
          audioData,
          streamUrl: finalAudioUrl
        }).subscribe({
          next: () => {
            this.uploadSuccessMsg.set(`Song "${title}" successfully uploaded to system library!`);
            this.resetUploadForm();
          },
          error: (err) => {
            this.uploadErrorMsg.set(err.error?.error || 'Failed to upload song.');
            this.isUploading.set(false);
          }
        });
      }
    } catch (e) {
      console.error(e);
      this.uploadErrorMsg.set('FileReader read error during file upload conversion.');
      this.isUploading.set(false);
    }
  }

  private resetUploadForm(): void {
    this.songTitle = '';
    this.songArtist = '';
    this.songAlbum = '';
    this.songCategory = 'System Classics';
    this.songCoverUrl = '';
    this.songStreamUrl = '';
    this.coverFile = null;
    this.audioFiles = [];
    this.isUploading.set(false);
    this.uploadStatus.set('');
    
    // Reset file input DOM elements
    const coverInput = document.getElementById('admin-cover-input') as HTMLInputElement;
    const audioInput = document.getElementById('admin-audio-input') as HTMLInputElement;
    if (coverInput) coverInput.value = '';
    if (audioInput) audioInput.value = '';
  }

  deleteSong(song: Song): void {
    const conf = confirm(`Are you sure you want to delete the song "${song.title}" from the catalog? This is irreversible.`);
    if (!conf) return;

    this.apiService.deleteSong(song.id).subscribe({
      next: () => alert(`Song "${song.title}" deleted successfully!`),
      error: (err) => alert(err.error?.error || 'Failed to delete song.')
    });
  }

  handleCredentialsUpdate(): void {
    this.credSuccessMsg.set('');
    this.credErrorMsg.set('');

    const user = this.newUsername.trim();
    const pass = this.newPassword.trim();

    if (!user || !pass) {
      this.credErrorMsg.set('New username and password cannot be empty.');
      return;
    }

    this.apiService.updateAdminCredentials({
      newUsername: user,
      newPassword: pass
    }).subscribe({
      next: (res: any) => {
        this.credSuccessMsg.set('Admin credentials successfully updated inside config.env! You will be logged out.');
        setTimeout(() => {
          this.authService.logout();
          this.router.navigate(['/auth']);
        }, 2000);
      },
      error: (err) => {
        this.credErrorMsg.set(err.error?.error || 'Failed to update credentials.');
      }
    });
  }
}
