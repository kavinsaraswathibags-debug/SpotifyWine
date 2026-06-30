const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const FALLBACK_FILE = path.join(__dirname, 'db_fallback.json');
let useFallback = false;

// Initialize Fallback JSON DB if it doesn't exist
function initFallbackDB() {
  if (!fs.existsSync(FALLBACK_FILE)) {
    const defaultData = {
      users: [],
      likedSongs: {}, // userId -> array of songIds
      playlists: []   // array of { id, userId, name, songIds: [] }
    };
    fs.writeFileSync(FALLBACK_FILE, JSON.stringify(defaultData, null, 2), 'utf-8');
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
    return { users: [], likedSongs: {}, playlists: [] };
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
  password: { type: String, required: true }
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

let UserModel, LikedSongsModel, PlaylistModel;

// Connect to Database
async function connectDB(mongoUri) {
  const uri = mongoUri || process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/spotify_prototype';
  console.log(`Attempting to connect to MongoDB at: ${uri}`);
  
  try {
    // Set connection timeout to 4 seconds so it falls back quickly if MongoDB isn't running
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 4000
    });
    console.log("Successfully connected to MongoDB!");
    
    UserModel = mongoose.model('User', UserSchema);
    LikedSongsModel = mongoose.model('LikedSongs', LikedSongsSchema);
    PlaylistModel = mongoose.model('Playlist', PlaylistSchema);
    useFallback = false;
  } catch (error) {
    console.warn("\n========================================================");
    console.warn("WARNING: Could not connect to MongoDB server.");
    console.warn("Reason:", error.message);
    console.warn(`Falling back to local file storage: ${FALLBACK_FILE}`);
    console.warn("========================================================\n");
    
    useFallback = true;
    initFallbackDB();
  }
}

// Unified Database API
const db = {
  connect: connectDB,
  isFallback: () => useFallback,

  // User Auth
  async createUser(username, password) {
    const cleanUsername = username.trim().toLowerCase();
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    if (useFallback) {
      const data = readFallbackData();
      const existing = data.users.find(u => u.username === cleanUsername);
      if (existing) {
        throw new Error("Username already exists");
      }
      const userId = 'user_' + Date.now();
      const newUser = { id: userId, username: cleanUsername, password: hashedPassword };
      data.users.push(newUser);
      data.likedSongs[userId] = [];
      writeFallbackData(data);
      return { id: userId, username: cleanUsername };
    } else {
      const existing = await UserModel.findOne({ username: cleanUsername });
      if (existing) {
        throw new Error("Username already exists");
      }
      const user = new UserModel({ username: cleanUsername, password: hashedPassword });
      await user.save();
      // Initialize empty liked songs document
      const liked = new LikedSongsModel({ userId: user._id, songIds: [] });
      await liked.save();
      return { id: user._id.toString(), username: cleanUsername };
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
      return { id: user.id, username: user.username };
    } else {
      const user = await UserModel.findOne({ username: cleanUsername });
      if (!user) return null;
      
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) return null;
      return { id: user._id.toString(), username: user.username };
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
