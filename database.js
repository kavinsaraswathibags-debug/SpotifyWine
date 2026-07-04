const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const os = require('os');

// Helper to check if a directory has write permissions
function hasWritePermission(dir) {
  try {
    const testFile = path.join(dir, '.write_test');
    fs.writeFileSync(testFile, '');
    fs.unlinkSync(testFile);
    return true;
  } catch (e) {
    return false;
  }
}

// In serverless environments, the local task folder is read-only.
let FALLBACK_FILE = path.join(__dirname, 'db_fallback.json');
try {
  if (process.env.VERCEL || process.env.NOW_BUILDER || !hasWritePermission(__dirname)) {
    FALLBACK_FILE = path.join(os.tmpdir(), 'db_fallback.json');
  }
} catch (e) {
  FALLBACK_FILE = path.join(os.tmpdir(), 'db_fallback.json');
}

let useFallback = false;

// Initialize Fallback JSON DB if it doesn't exist
function initFallbackDB() {
  if (!fs.existsSync(FALLBACK_FILE)) {
    const defaultData = {
      users: [],
      likedSongs: {}, // userId -> array of songIds
      playlists: [],   // array of { id, userId, name, songIds: [] }
      songs: []        // array of dynamic songs
    };
    fs.writeFileSync(FALLBACK_FILE, JSON.stringify(defaultData, null, 2), 'utf-8');
  } else {
    // Migrate existing fallback files
    try {
      const data = JSON.parse(fs.readFileSync(FALLBACK_FILE, 'utf-8'));
      let migrated = false;
      if (!data.songs) {
        data.songs = [];
        migrated = true;
      }
      if (migrated) {
        fs.writeFileSync(FALLBACK_FILE, JSON.stringify(data, null, 2), 'utf-8');
      }
    } catch (e) {
      console.error("Migration fallback error:", e);
    }
  }
}

// Fallback DB Helper functions
function readFallbackData() {
  initFallbackDB();
  try {
    const data = fs.readFileSync(FALLBACK_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (e) {
    console.error("Error reading fallback database file, resetting:", e);
    return { users: [], likedSongs: {}, playlists: [], songs: [] };
  }
}

function writeFallbackData(data) {
  try {
    fs.writeFileSync(FALLBACK_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (e) {
    console.error("Error writing fallback database file:", e);
  }
}

// Mongoose Schemas (if MongoDB is available)
const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  email: { type: String, unique: true, sparse: true },
  resetToken: { type: String },
  resetTokenExpires: { type: Date }
});

const LikedSongsSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  songIds: { type: [String], default: [] }
});

const PlaylistSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name: { type: String, required: true },
  songIds: { type: [String], default: [] }
});

const SongSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  title: { type: String, required: true },
  artist: { type: String, required: true },
  album: { type: String, required: true },
  year: { type: String },
  category: { type: String },
  cover: { type: String, default: '/covers/cover1.svg' },
  localPath: { type: String },
  streamUrl: { type: String, required: true },
  uploadedBy: { type: String, default: 'system' } // 'system' or userId
});

let UserModel, LikedSongsModel, PlaylistModel, SongModel;

let dbConnectionPromise = null;
let dbStatus = {
  connected: false,
  uri: 'Unknown',
  error: null
};

function maskMongoUri(uri) {
  if (!uri) return 'None';
  try {
    return uri.replace(/(mongodb(?:\+srv)?:\/\/[^:]+:)([^@]+)(@)/, '$1******$3');
  } catch (e) {
    return 'Masking Error';
  }
}

// Connection and Seeding
async function connectDB(mongoUri) {
  if (mongoose.connection.readyState === 1) {
    useFallback = false;
    dbStatus.connected = true;
    dbStatus.error = null;
    return;
  }

  if (dbConnectionPromise) {
    await dbConnectionPromise;
    return;
  }

  const uri = mongoUri || process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/spotify_prototype';
  dbStatus.uri = maskMongoUri(uri);
  console.log(`Attempting to connect to MongoDB at: ${dbStatus.uri}`);
  
  dbConnectionPromise = (async () => {
    try {
      await mongoose.connect(uri, {
        serverSelectionTimeoutMS: 6000
      });
      console.log("Successfully connected to MongoDB!");
      
      UserModel = mongoose.models.User || mongoose.model('User', UserSchema);
      LikedSongsModel = mongoose.models.LikedSongs || mongoose.model('LikedSongs', LikedSongsSchema);
      PlaylistModel = mongoose.models.Playlist || mongoose.model('Playlist', PlaylistSchema);
      SongModel = mongoose.models.Song || mongoose.model('Song', SongSchema);
      useFallback = false;
      
      dbStatus.connected = true;
      dbStatus.error = null;

      // Seed catalog in Mongo
      await seedSongs();
    } catch (error) {
      console.warn("\n========================================================");
      console.warn("WARNING: Could not connect to MongoDB server.");
      console.warn("Reason:", error.message);
      console.warn("--------------------------------------------------------");
      console.warn("TO AVOID LOCAL DATABASE FALLBACK:");
      console.warn("1. Set up a free cloud database on MongoDB Atlas.");
      console.warn("2. Whitelist '0.0.0.0/0' (allow access from anywhere) in Atlas.");
      console.warn("3. Configure 'MONGODB_URI' in your config.env or host environment.");
      console.warn(`\nCurrently falling back to local file storage: ${FALLBACK_FILE}`);
      console.warn("========================================================\n");
      
      useFallback = true;
      dbStatus.connected = false;
      dbStatus.error = error.message;

      initFallbackDB();
      await seedSongs();
      
      // Clear promise on failure to allow retrying on subsequent requests
      dbConnectionPromise = null;
    }
  })();

  await dbConnectionPromise;
}

async function seedSongs() {
  const seedFile = path.join(__dirname, 'songs.json');
  if (!fs.existsSync(seedFile)) {
    console.warn("Warning: songs.json seed file not found. Skipping seeding.");
    return;
  }

  const defaultSongs = JSON.parse(fs.readFileSync(seedFile, 'utf-8'));

  if (useFallback) {
    const data = readFallbackData();
    if (data.songs.length === 0) {
      console.log(`Seeding ${defaultSongs.length} songs into fallback database...`);
      data.songs = defaultSongs.map(s => ({ ...s, uploadedBy: 'system' }));
      writeFallbackData(data);
    }
  } else {
    try {
      const count = await SongModel.countDocuments();
      if (count === 0) {
        console.log(`Seeding ${defaultSongs.length} songs into MongoDB...`);
        const songsWithUpload = defaultSongs.map(s => ({ ...s, uploadedBy: 'system' }));
        await SongModel.insertMany(songsWithUpload);
        console.log("Seeding complete in MongoDB.");
      }
    } catch (e) {
      console.error("Error seeding MongoDB:", e);
    }
  }
}

// Unified Database API
const db = {
  connect: connectDB,
  isFallback: () => useFallback,
  getStatus: () => dbStatus,

  // User Auth
  async createUser(username, password, email) {
    const cleanUsername = username.trim().toLowerCase();
    const cleanEmail = email ? email.trim().toLowerCase() : null;
    
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    if (useFallback) {
      const data = readFallbackData();
      const existingUser = data.users.find(u => u.username === cleanUsername);
      if (existingUser) {
        throw new Error("Username already exists");
      }
      if (cleanEmail) {
        const existingEmail = data.users.find(u => u.email === cleanEmail);
        if (existingEmail) {
          throw new Error("Email already registered");
        }
      }
      
      const userId = 'user_' + Date.now();
      const newUser = { 
        id: userId, 
        username: cleanUsername, 
        password: hashedPassword, 
        email: cleanEmail,
        resetToken: null,
        resetTokenExpires: null
      };
      
      data.users.push(newUser);
      data.likedSongs[userId] = [];
      writeFallbackData(data);
      return { id: userId, username: cleanUsername, email: cleanEmail };
    } else {
      const existingUser = await UserModel.findOne({ username: cleanUsername });
      if (existingUser) {
        throw new Error("Username already exists");
      }
      if (cleanEmail) {
        const existingEmail = await UserModel.findOne({ email: cleanEmail });
        if (existingEmail) {
          throw new Error("Email already registered");
        }
      }

      const user = new UserModel({ 
        username: cleanUsername, 
        password: hashedPassword, 
        email: cleanEmail 
      });
      await user.save();

      // Initialize empty liked songs document
      const liked = new LikedSongsModel({ userId: user._id, songIds: [] });
      await liked.save();

      return { id: user._id.toString(), username: cleanUsername, email: cleanEmail };
    }
  },

  async authenticateUser(username, password) {
    const cleanUsername = username.trim().toLowerCase();
    if (useFallback) {
      const data = readFallbackData();
      const user = data.users.find(u => u.username === cleanUsername);
      if (!user) return null;
      
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) return null;
      return { id: user.id, username: user.username, email: user.email };
    } else {
      const user = await UserModel.findOne({ username: cleanUsername });
      if (!user) return null;
      
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) return null;
      return { id: user._id.toString(), username: user.username, email: user.email };
    }
  },

  // Password Recovery Flow
  async generateResetToken(email) {
    const cleanEmail = email.trim().toLowerCase();
    const token = 'token_' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
    const expires = new Date(Date.now() + 3600000); // 1 hour validity

    if (useFallback) {
      const data = readFallbackData();
      const user = data.users.find(u => u.email === cleanEmail);
      if (!user) throw new Error("No user found with that email address.");

      user.resetToken = token;
      user.resetTokenExpires = expires.toISOString();
      writeFallbackData(data);
      return token;
    } else {
      const user = await UserModel.findOne({ email: cleanEmail });
      if (!user) throw new Error("No user found with that email address.");

      user.resetToken = token;
      user.resetTokenExpires = expires;
      await user.save();
      return token;
    }
  },

  async resetPassword(token, newPassword) {
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    if (useFallback) {
      const data = readFallbackData();
      const user = data.users.find(u => u.resetToken === token);
      if (!user) throw new Error("Invalid or expired reset token.");
      
      const expires = new Date(user.resetTokenExpires);
      if (expires.getTime() < Date.now()) {
        throw new Error("Password reset token has expired.");
      }

      user.password = hashedPassword;
      user.resetToken = null;
      user.resetTokenExpires = null;
      writeFallbackData(data);
      return { success: true };
    } else {
      const user = await UserModel.findOne({
        resetToken: token,
        resetTokenExpires: { $gt: new Date() }
      });
      if (!user) throw new Error("Invalid or expired reset token.");

      user.password = hashedPassword;
      user.resetToken = undefined;
      user.resetTokenExpires = undefined;
      await user.save();
      return { success: true };
    }
  },

  // Dynamic Songs Catalog
  async getSongs() {
    if (useFallback) {
      const data = readFallbackData();
      return data.songs;
    } else {
      return await SongModel.find({});
    }
  },

  async addSong(songData) {
    const songId = 'track-' + Date.now();
    const newSong = {
      id: songId,
      title: songData.title,
      artist: songData.artist,
      album: songData.album,
      year: songData.year || '2026',
      category: songData.category || 'Uploaded Hits',
      cover: songData.cover || '/covers/cover1.svg',
      localPath: songData.localPath || '',
      streamUrl: songData.streamUrl,
      uploadedBy: songData.uploadedBy || 'system'
    };

    if (useFallback) {
      const data = readFallbackData();
      data.songs.push(newSong);
      writeFallbackData(data);
      return newSong;
    } else {
      const song = new SongModel(newSong);
      await song.save();
      return song;
    }
  },

  async deleteSong(songId) {
    if (useFallback) {
      const data = readFallbackData();
      const initialLength = data.songs.length;
      const song = data.songs.find(s => s.id === songId);
      if (!song) throw new Error("Song not found");

      data.songs = data.songs.filter(s => s.id !== songId);
      writeFallbackData(data);
      return song;
    } else {
      const song = await SongModel.findOne({ id: songId });
      if (!song) throw new Error("Song not found");
      await SongModel.deleteOne({ id: songId });
      return song;
    }
  },

  // Liked Songs
  async getLikedSongs(userId) {
    if (useFallback) {
      const data = readFallbackData();
      return data.likedSongs[userId] || [];
    } else {
      const liked = await LikedSongsModel.findOne({ userId });
      return liked ? liked.songIds : [];
    }
  },

  async toggleLikeSong(userId, songId) {
    if (useFallback) {
      const data = readFallbackData();
      if (!data.likedSongs[userId]) {
        data.likedSongs[userId] = [];
      }
      
      const index = data.likedSongs[userId].indexOf(songId);
      let isLiked = false;
      if (index === -1) {
        data.likedSongs[userId].push(songId);
        isLiked = true;
      } else {
        data.likedSongs[userId].splice(index, 1);
        isLiked = false;
      }
      
      writeFallbackData(data);
      return { isLiked, songIds: data.likedSongs[userId] };
    } else {
      let liked = await LikedSongsModel.findOne({ userId });
      if (!liked) {
        liked = new LikedSongsModel({ userId, songIds: [] });
      }
      
      const index = liked.songIds.indexOf(songId);
      let isLiked = false;
      if (index === -1) {
        liked.songIds.push(songId);
        isLiked = true;
      } else {
        liked.songIds.splice(index, 1);
        isLiked = false;
      }
      
      await liked.save();
      return { isLiked, songIds: liked.songIds };
    }
  },

  // Playlists
  async getPlaylists(userId) {
    if (useFallback) {
      const data = readFallbackData();
      return data.playlists.filter(p => p.userId === userId);
    } else {
      const playlists = await PlaylistModel.find({ userId });
      return playlists.map(p => ({
        id: p._id.toString(),
        userId: p.userId.toString(),
        name: p.name,
        songIds: p.songIds
      }));
    }
  },

  async createPlaylist(userId, name) {
    const cleanName = name.trim();
    if (!cleanName) throw new Error("Playlist name cannot be empty");

    if (useFallback) {
      const data = readFallbackData();
      const playlistId = 'playlist_' + Date.now();
      const newPlaylist = { id: playlistId, userId, name: cleanName, songIds: [] };
      data.playlists.push(newPlaylist);
      writeFallbackData(data);
      return newPlaylist;
    } else {
      const playlist = new PlaylistModel({ userId, name: cleanName, songIds: [] });
      await playlist.save();
      return {
        id: playlist._id.toString(),
        userId: playlist.userId.toString(),
        name: playlist.name,
        songIds: playlist.songIds
      };
    }
  },

  async addSongToPlaylist(userId, playlistId, songId) {
    if (useFallback) {
      const data = readFallbackData();
      const playlist = data.playlists.find(p => p.id === playlistId && p.userId === userId);
      if (!playlist) throw new Error("Playlist not found");
      
      if (!playlist.songIds.includes(songId)) {
        playlist.songIds.push(songId);
        writeFallbackData(data);
      }
      return playlist;
    } else {
      const playlist = await PlaylistModel.findOne({ _id: playlistId, userId });
      if (!playlist) throw new Error("Playlist not found");
      
      if (!playlist.songIds.includes(songId)) {
        playlist.songIds.push(songId);
        await playlist.save();
      }
      return {
        id: playlist._id.toString(),
        userId: playlist.userId.toString(),
        name: playlist.name,
        songIds: playlist.songIds
      };
    }
  },

  async removeSongFromPlaylist(userId, playlistId, songId) {
    if (useFallback) {
      const data = readFallbackData();
      const playlist = data.playlists.find(p => p.id === playlistId && p.userId === userId);
      if (!playlist) throw new Error("Playlist not found");
      
      const idx = playlist.songIds.indexOf(songId);
      if (idx !== -1) {
        playlist.songIds.splice(idx, 1);
        writeFallbackData(data);
      }
      return playlist;
    } else {
      const playlist = await PlaylistModel.findOne({ _id: playlistId, userId });
      if (!playlist) throw new Error("Playlist not found");
      
      const idx = playlist.songIds.indexOf(songId);
      if (idx !== -1) {
        playlist.songIds.splice(idx, 1);
        await playlist.save();
      }
      return {
        id: playlist._id.toString(),
        userId: playlist.userId.toString(),
        name: playlist.name,
        songIds: playlist.songIds
      };
    }
  },

  async deletePlaylist(userId, playlistId) {
    if (useFallback) {
      const data = readFallbackData();
      const initialLength = data.playlists.length;
      data.playlists = data.playlists.filter(p => !(p.id === playlistId && p.userId === userId));
      if (data.playlists.length === initialLength) throw new Error("Playlist not found");
      writeFallbackData(data);
      return { success: true };
    } else {
      const result = await PlaylistModel.deleteOne({ _id: playlistId, userId });
      if (result.deletedCount === 0) throw new Error("Playlist not found");
      return { success: true };
    }
  }
};

module.exports = db;
