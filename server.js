const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');

// Load environment variables from config.env
const envPath = path.join(__dirname, 'config.env');
if (fs.existsSync(envPath)) {
  require('dotenv').config({ path: envPath });
} else {
  require('dotenv').config();
}

const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'wine_spotify_secret_2026';

// Middleware
app.use(cors());
// Set body payload limits to 100MB to allow large base64 file uploads
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));

// Serve frontend static files
app.use(express.static(path.join(__dirname, 'public', 'browser')));

// Serve audio files statically under '/songs' path
app.use('/songs', express.static(path.join(__dirname, 'illayaraja hits')));

// Serve dynamically uploaded songs under '/uploads' path
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Authenticate JWT Middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: "Access denied. No token provided." });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: "Invalid or expired token." });
    }
    req.user = user;
    next();
  });
}

// Helper to save base64 string to a file on disk
function saveBase64File(base64Data, prefix, defaultExt) {
  if (!base64Data) return null;
  // Format: data:audio/mp3;base64,AAAA...
  const matches = base64Data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
  if (!matches || matches.length !== 3) {
    throw new Error("Invalid uploaded file format");
  }

  const mimeType = matches[1];
  const buffer = Buffer.from(matches[2], 'base64');
  
  // Resolve file extension
  let ext = defaultExt;
  if (mimeType.includes('jpeg') || mimeType.includes('jpg')) ext = 'jpg';
  else if (mimeType.includes('png')) ext = 'png';
  else if (mimeType.includes('svg')) ext = 'svg';
  else if (mimeType.includes('mpeg') || mimeType.includes('mp3')) ext = 'mp3';
  else if (mimeType.includes('wav')) ext = 'wav';
  else if (mimeType.includes('ogg')) ext = 'ogg';

  const filename = `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1000)}.${ext}`;
  const filepath = path.join(__dirname, 'uploads', filename);
  
  fs.writeFileSync(filepath, buffer);
  return `/uploads/${filename}`;
}

// 1. API: Get all songs from Database
app.get('/api/songs', async (req, res) => {
  try {
    const songs = await db.getSongs();
    res.json(songs);
  } catch (error) {
    res.status(500).json({ error: "Failed to load songs from database" });
  }
});

// 2. API: Register User (with email)
app.post('/api/auth/register', async (req, res) => {
  const { username, password, email } = req.body;
  if (!username || !password || !email) {
    return res.status(400).json({ error: "Username, password, and email are required" });
  }
  
  // Reserve admin username check
  const adminUser = (process.env.ADMIN_USERNAME || 'kavin').trim().toLowerCase();
  if (username.trim().toLowerCase() === adminUser) {
    return res.status(400).json({ error: "Cannot register using reserved admin username" });
  }

  try {
    const user = await db.createUser(username, password, email);
    const token = jwt.sign({ id: user.id, username: user.username, email: user.email, isAdmin: false }, JWT_SECRET, { expiresIn: '7d' });
    res.status(201).json({ token, user: { id: user.id, username: user.username, email: user.email, isAdmin: false } });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// 3. API: Login User (handles Admin and Normal user)
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: "Username and password are required" });
  }

  // Check admin login
  const adminUser = (process.env.ADMIN_USERNAME || 'kavin').trim().toLowerCase();
  const adminPass = process.env.ADMIN_PASSWORD || 'kavinkumar@2002';

  if (username.trim().toLowerCase() === adminUser && password === adminPass) {
    const user = { id: 'admin', username: adminUser, isAdmin: true };
    const token = jwt.sign({ id: user.id, username: user.username, isAdmin: true }, JWT_SECRET, { expiresIn: '7d' });
    return res.json({ token, user });
  }

  try {
    const user = await db.authenticateUser(username, password);
    if (!user) {
      return res.status(400).json({ error: "Invalid username or password" });
    }
    const token = jwt.sign({ id: user.id, username: user.username, email: user.email, isAdmin: false }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user.id, username: user.username, email: user.email, isAdmin: false } });
  } catch (error) {
    res.status(500).json({ error: "Server error during login" });
  }
});

// 4. API: Get current user info
app.get('/api/auth/me', authenticateToken, (req, res) => {
  res.json({ user: req.user, isDatabaseFallback: db.isFallback() });
});

// 5. API: Forgot Password (recovery link simulation)
app.post('/api/auth/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: "Email address is required" });
  }

  try {
    const token = await db.generateResetToken(email);
    // Simulate sending email: log link to terminal and reply link in JSON
    const resetUrl = `${req.protocol}://${req.get('host')}/auth?resetToken=${token}`;
    
    console.log("\n========================================================");
    console.log("PASSWORD RESET EMAIL LOG SIMULATION");
    console.log(`To: ${email}`);
    console.log(`Reset URL: ${resetUrl}`);
    console.log("========================================================\n");

    res.json({ 
      success: true, 
      message: "Reset link simulated. Check backend server console logs or click the debug link.",
      debugLink: resetUrl 
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// 6. API: Reset Password
app.post('/api/auth/reset-password', async (req, res) => {
  const { token, newPassword } = req.body;
  if (!token || !newPassword) {
    return res.status(400).json({ error: "Token and new password are required" });
  }

  try {
    await db.resetPassword(token, newPassword);
    res.json({ success: true, message: "Password successfully reset" });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// 7. API: Upload Song (via files or stream links)
app.post('/api/songs/upload', authenticateToken, async (req, res) => {
  const { title, artist, album, category, coverData, coverUrl, audioData, streamUrl } = req.body;
  
  if (!title || !artist || !album) {
    return res.status(400).json({ error: "Title, artist, and album are required" });
  }

  try {
    let finalAudioUrl = streamUrl;
    let finalCoverUrl = coverUrl || '/covers/cover1.svg';

    // Decode and save files locally if raw upload content is provided
    if (audioData) {
      finalAudioUrl = saveBase64File(audioData, 'audio', 'mp3');
    }
    if (coverData) {
      finalCoverUrl = saveBase64File(coverData, 'cover', 'png');
    }

    if (!finalAudioUrl) {
      return res.status(400).json({ error: "Must provide either an audio file upload or a valid stream link URL." });
    }

    const song = await db.addSong({
      title,
      artist,
      album,
      category,
      cover: finalCoverUrl,
      localPath: finalAudioUrl,
      streamUrl: finalAudioUrl,
      uploadedBy: req.user.id
    });

    res.status(201).json(song);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// 8. API: Delete Song (Ownership-locked or Admin-accessible)
app.delete('/api/songs/:id', authenticateToken, async (req, res) => {
  const songId = req.params.id;

  try {
    const songs = await db.getSongs();
    const song = songs.find(s => s.id === songId);
    
    if (!song) {
      return res.status(404).json({ error: "Song not found" });
    }

    // Owner or admin auth check
    if (!req.user.isAdmin && song.uploadedBy !== req.user.id) {
      return res.status(403).json({ error: "Access denied. You can only delete songs you uploaded yourself." });
    }

    await db.deleteSong(songId);

    // Delete disk storage entries if local files are hosted
    if (song.streamUrl && song.streamUrl.startsWith('/uploads/')) {
      try {
        const filepath = path.join(__dirname, song.streamUrl);
        if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
      } catch (e) {
        console.error("Audio deletion error:", e);
      }
    }
    if (song.cover && song.cover.startsWith('/uploads/')) {
      try {
        const filepath = path.join(__dirname, song.cover);
        if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
      } catch (e) {
        console.error("Cover deletion error:", e);
      }
    }

    res.json({ success: true, message: "Song successfully deleted" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 9. API: Update Admin Credentials in config.env
app.post('/api/admin/credentials', authenticateToken, async (req, res) => {
  if (!req.user.isAdmin) {
    return res.status(403).json({ error: "Access denied. Admin status required." });
  }

  const { newUsername, newPassword } = req.body;
  if (!newUsername || !newPassword) {
    return res.status(400).json({ error: "New username and password are required" });
  }

  try {
    const configPath = path.join(__dirname, 'config.env');
    let content = '';
    if (fs.existsSync(configPath)) {
      content = fs.readFileSync(configPath, 'utf-8');
    }

    let lines = content.split(/\r?\n/);
    let userUpdated = false;
    let passUpdated = false;

    lines = lines.map(line => {
      if (line.startsWith('ADMIN_USERNAME=')) {
        userUpdated = true;
        return `ADMIN_USERNAME=${newUsername.trim()}`;
      }
      if (line.startsWith('ADMIN_PASSWORD=')) {
        passUpdated = true;
        return `ADMIN_PASSWORD=${newPassword.trim()}`;
      }
      return line;
    });

    if (!userUpdated) lines.push(`ADMIN_USERNAME=${newUsername.trim()}`);
    if (!passUpdated) lines.push(`ADMIN_PASSWORD=${newPassword.trim()}`);

    fs.writeFileSync(configPath, lines.join('\n'), 'utf-8');

    // Dynamically apply variables at runtime
    process.env.ADMIN_USERNAME = newUsername.trim();
    process.env.ADMIN_PASSWORD = newPassword.trim();

    console.log(`Admin credentials updated! Username is now: "${newUsername}"`);
    res.json({ success: true, message: "Admin credentials successfully updated" });
  } catch (error) {
    res.status(500).json({ error: "Failed to update configuration file: " + error.message });
  }
});

// 10. API: Liked songs
app.get('/api/library/likes', authenticateToken, async (req, res) => {
  try {
    const songIds = await db.getLikedSongs(req.user.id);
    res.json({ songIds });
  } catch (error) {
    res.status(500).json({ error: "Could not fetch liked songs" });
  }
});

app.post('/api/library/likes/toggle', authenticateToken, async (req, res) => {
  const { songId } = req.body;
  if (!songId) {
    return res.status(400).json({ error: "Song ID is required" });
  }

  try {
    const result = await db.toggleLikeSong(req.user.id, songId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: "Could not toggle like status" });
  }
});

// 11. API: Playlists
app.get('/api/library/playlists', authenticateToken, async (req, res) => {
  try {
    const playlists = await db.getPlaylists(req.user.id);
    res.json({ playlists });
  } catch (error) {
    res.status(500).json({ error: "Could not fetch playlists" });
  }
});

app.post('/api/library/playlists', authenticateToken, async (req, res) => {
  const { name } = req.body;
  if (!name) {
    return res.status(400).json({ error: "Playlist name is required" });
  }

  try {
    const playlist = await db.createPlaylist(req.user.id, name);
    res.status(201).json(playlist);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/library/playlists/:id/add', authenticateToken, async (req, res) => {
  const playlistId = req.params.id;
  const { songId } = req.body;
  if (!songId) {
    return res.status(400).json({ error: "Song ID is required" });
  }

  try {
    const playlist = await db.addSongToPlaylist(req.user.id, playlistId, songId);
    res.json(playlist);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/library/playlists/:id/remove', authenticateToken, async (req, res) => {
  const playlistId = req.params.id;
  const { songId } = req.body;
  if (!songId) {
    return res.status(400).json({ error: "Song ID is required" });
  }

  try {
    const playlist = await db.removeSongFromPlaylist(req.user.id, playlistId, songId);
    res.json(playlist);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.delete('/api/library/playlists/:id', authenticateToken, async (req, res) => {
  const playlistId = req.params.id;
  try {
    const result = await db.deletePlaylist(req.user.id, playlistId);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Serve frontend SPA fallback for all other routes (HTML5 history API)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'browser', 'index.html'));
});

// Start Server
async function startServer() {
  await db.connect();
  
  if (process.env.NODE_ENV !== 'test' && !process.env.VERCEL && !process.env.NOW_BUILDER) {
    app.listen(PORT, () => {
      console.log(`======================================================`);
      console.log(`Spotify Prototype server is running on port ${PORT}`);
      console.log(`Open http://localhost:${PORT} in your web browser`);
      console.log(`======================================================`);
    });
  }
}

startServer();

module.exports = app;
