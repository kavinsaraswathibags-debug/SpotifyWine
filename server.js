const express = require('express');
const cors = require('cors');
const path = require('path');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const db = require('./database');
const songsData = require('./songs.json');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'wine_spotify_secret_2026';

// Middleware
app.use(cors());
app.use(express.json());

// Serve frontend static files
app.use(express.static(path.join(__dirname, 'public')));

// Serve audio files statically under '/songs' path
app.use('/songs', express.static(path.join(__dirname, 'illayaraja hits')));

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

// 1. API: Get all songs
app.get('/api/songs', (req, res) => {
  res.json(songsData);
});

// 2. API: Register User
app.post('/api/auth/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: "Username and password are required" });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: "Password must be at least 6 characters long" });
  }

  try {
    const user = await db.createUser(username, password);
    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
    res.status(201).json({ token, user });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// 3. API: Login User
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: "Username and password are required" });
  }

  try {
    const user = await db.authenticateUser(username, password);
    if (!user) {
      return res.status(400).json({ error: "Invalid username or password" });
    }
    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user });
  } catch (error) {
    res.status(500).json({ error: "Server error during login" });
  }
});

// 4. API: Get current user info
app.get('/api/auth/me', authenticateToken, (req, res) => {
  res.json({ user: req.user, isDatabaseFallback: db.isFallback() });
});

// 5. API: Get liked songs
app.get('/api/library/likes', authenticateToken, async (req, res) => {
  try {
    const songIds = await db.getLikedSongs(req.user.id);
    res.json({ songIds });
  } catch (error) {
    res.status(500).json({ error: "Could not fetch liked songs" });
  }
});

// 6. API: Toggle liked song
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

// 7. API: Get all playlists
app.get('/api/library/playlists', authenticateToken, async (req, res) => {
  try {
    const playlists = await db.getPlaylists(req.user.id);
    res.json({ playlists });
  } catch (error) {
    res.status(500).json({ error: "Could not fetch playlists" });
  }
});

// 8. API: Create playlist
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

// 9. API: Add song to playlist
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

// 10. API: Remove song from playlist
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

// 11. API: Delete playlist
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
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start Server
async function startServer() {
  // Try connecting to DB first
  await db.connect();
  
  app.listen(PORT, () => {
    console.log(`======================================================`);
    console.log(`Spotify Prototype server is running on port ${PORT}`);
    console.log(`Open http://localhost:${PORT} in your web browser`);
    console.log(`======================================================`);
  });
}

startServer();
