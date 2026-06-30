/**
 * Spotify Prototype - Client Application Logic (Wine Edition)
 * Controls playback, API sync, view routing, custom playlists, and responsive UI behaviors.
 */

// ==========================================================================
// STATE MANAGEMENT & GLOBALS
// ==========================================================================
let allSongs = [];            // Catalog of 45 songs fetched from server
let token = localStorage.getItem('jwt_token') || null;
let currentUser = null;
let likedSongIds = new Set();  // Set of track IDs liked by user
let playlists = [];            // User's custom playlists
let activePlaylistId = null;   // Active custom playlist view ID

// Playback Engine state
const audioEngine = document.getElementById('audio-engine');
let playQueue = [];            // Active queue of song objects
let queueIndex = -1;           // Index of currently playing track in queue
let originalQueue = [];        // Backup of queue before shuffle is toggled
let isShuffle = false;
let isRepeat = 0;              // 0: No repeat, 1: Repeat queue, 2: Repeat single track
let isMuted = false;
let prevVolume = 0.8;

// History Navigation Stack (for arrow buttons)
const viewHistory = ['home'];
let historyIndex = 0;

// ==========================================================================
// DOM ELEMENTS REFERENCE
// ==========================================================================
const views = {
  home: document.getElementById('view-home'),
  search: document.getElementById('view-search'),
  liked: document.getElementById('view-liked'),
  playlist: document.getElementById('view-playlist'),
  auth: document.getElementById('view-auth')
};

const navItems = document.querySelectorAll('.nav-item');
const searchInput = document.getElementById('search-input');
const searchClearBtn = document.getElementById('search-clear-btn');
const topSearchBar = document.getElementById('top-search-bar');
const dbIndicator = document.getElementById('db-indicator');
const dbIndicatorText = document.getElementById('db-indicator-text');

// Player Bar Controls
const playerPlayBtn = document.getElementById('player-play-btn');
const playerPrevBtn = document.getElementById('player-prev-btn');
const playerNextBtn = document.getElementById('player-next-btn');
const playerShuffleBtn = document.getElementById('player-shuffle-btn');
const playerRepeatBtn = document.getElementById('player-repeat-btn');
const playerLikeBtn = document.getElementById('player-like-btn');
const playerQueueBtn = document.getElementById('player-queue-btn');
const playerVolumeBtn = document.getElementById('player-volume-btn');

// Player Details
const playerSongCover = document.getElementById('player-song-cover');
const playerSongTitle = document.getElementById('player-song-title');
const playerSongArtist = document.getElementById('player-song-artist');
const playerCurrentTime = document.getElementById('player-current-time');
const playerTotalTime = document.getElementById('player-total-time');

// Sliders
const progressSlider = document.getElementById('progress-slider');
const progressSliderFill = document.getElementById('progress-slider-fill');
const progressSliderThumb = document.getElementById('progress-slider-thumb');
const volumeSlider = document.getElementById('volume-slider');
const volumeSliderFill = document.getElementById('volume-slider-fill');
const volumeSliderThumb = document.getElementById('volume-slider-thumb');

// Sidebar panels
const sidebarPlaylists = document.getElementById('sidebar-playlists');
const sidebarGuestView = document.getElementById('sidebar-guest-view');
const sidebarUserView = document.getElementById('sidebar-user-view');
const userDisplayName = document.getElementById('user-display-name');
const userDbStatus = document.getElementById('user-db-status');
const topLoginBtn = document.getElementById('top-login-btn');

// Lists/Tables
const homeSongsList = document.getElementById('home-songs-list');
const searchSongsList = document.getElementById('search-songs-list');
const likedSongsList = document.getElementById('liked-songs-list');
const playlistSongsList = document.getElementById('playlist-songs-list');
const playlistAddCandidatesList = document.getElementById('playlist-add-candidates-list');
const queueNowPlayingCard = document.getElementById('queue-now-playing-card');
const queueNextUpList = document.getElementById('queue-next-up-list');
const queueDrawer = document.getElementById('app-queue-drawer');

// Context Menu (Right-Click custom playlist addition)
let activeContextMenu = null;

// ==========================================================================
// INITIALIZATION
// ==========================================================================
document.addEventListener('DOMContentLoaded', async () => {
  setupEventListeners();
  updateVolumeUI(volumeSlider.value);
  
  // 1. Fetch entire catalog
  try {
    const response = await fetch('/api/songs');
    allSongs = await response.json();
    document.getElementById('home-total-tracks').textContent = `${allSongs.length} songs`;
  } catch (err) {
    console.error("Failed to fetch songs catalog:", err);
  }

  // 2. Validate token and load user state
  if (token) {
    await fetchUserProfile();
  } else {
    updateAuthUI(null);
  }

  // 3. Render home UI panels
  populateHomeViews();
  showView('home', false); // Start at home view without pushing history twice
});

// ==========================================================================
// VIEW ROUTING (SPA NAVIGATION)
// ==========================================================================
function showView(viewId, pushHistory = true) {
  // Hide all views
  Object.keys(views).forEach(key => {
    views[key].classList.add('d-none');
  });

  // Show active view
  const activeView = views[viewId] || views.home;
  activeView.classList.remove('d-none');

  // Toggle top search bar visibility
  if (viewId === 'search') {
    topSearchBar.classList.remove('d-none');
    searchInput.focus();
  } else {
    topSearchBar.classList.add('d-none');
  }

  // Update navigation highlight states
  navItems.forEach(item => {
    if (item.getAttribute('data-view') === viewId) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });

  // Load view-specific dynamic data
  if (viewId === 'liked') {
    renderLikedSongs();
  } else if (viewId === 'search') {
    renderSearchBrowse();
  }

  // Manage History navigation
  if (pushHistory) {
    if (viewHistory[historyIndex] !== viewId) {
      // Cut off forward history if branched
      viewHistory.splice(historyIndex + 1);
      viewHistory.push(viewId);
      historyIndex = viewHistory.length - 1;
    }
  }
  updateHistoryButtonsUI();
  
  // Close play queue drawer if navigating to another page
  if (viewId !== 'liked' && viewId !== 'playlist') {
    // optional: queueDrawer.classList.add('d-none');
  }
  
  // Scroll main content to top
  document.querySelector('.content-wrapper').scrollTop = 0;
}

function updateHistoryButtonsUI() {
  document.getElementById('history-back-btn').disabled = (historyIndex <= 0);
  document.getElementById('history-forward-btn').disabled = (historyIndex >= viewHistory.length - 1);
}

// ==========================================================================
// DATA RENDERING
// ==========================================================================
function populateHomeViews() {
  // 1. Populate category mood cards
  const categories = [
    { title: "Classic Romances", desc: "Timeless retro love duets", icon: "fa-heart", color: "#800020" },
    { title: "Epic Dramas", desc: "Powerful cinematic hits", icon: "fa-masks-theater", color: "#58111A" },
    { title: "Rural Folk Hits", desc: "Earthy traditional rhythms", icon: "fa-guitar", color: "#d4af37" },
    { title: "Synthesizer Magic", desc: "Illayaraja's electronic breakthroughs", icon: "fa-bolt", color: "#8a2be2" },
    { title: "Melodious Love", desc: "Soft midnight memories", icon: "fa-moon", color: "#483d8b" },
    { title: "Retro Hits", desc: "Timeless tunes from the 80s", icon: "fa-compact-disc", color: "#722f37" }
  ];

  const categoriesContainer = document.getElementById('categories-container');
  const browseGridContainer = document.getElementById('browse-grid-container');
  categoriesContainer.innerHTML = '';
  browseGridContainer.innerHTML = '';

  // Get distinct album cover images to display on category cards
  const defaultCovers = [
    "/covers/cover1.svg",
    "/covers/cover2.svg",
    "/covers/cover3.svg",
    "/covers/cover4.svg",
    "/covers/cover5.svg",
    "/covers/cover6.svg"
  ];

  categories.forEach((cat, index) => {
    // Category Card on Home
    const card = document.createElement('div');
    card.className = 'category-card';
    card.innerHTML = `
      <div class="category-cover-wrapper">
        <img src="${defaultCovers[index % defaultCovers.length]}" alt="${cat.title}">
        <button class="card-play-btn" data-category="${cat.title}">
          <i class="fa-solid fa-play"></i>
        </button>
      </div>
      <h3>${cat.title}</h3>
      <p>${cat.desc}</p>
    `;
    // Click category card to filter / load playlist
    card.addEventListener('click', (e) => {
      if (e.target.closest('.card-play-btn')) {
        e.stopPropagation();
        playCategory(cat.title);
      } else {
        // Go to search and perform query
        showView('search');
        searchInput.value = cat.title;
        performSearch(cat.title);
      }
    });
    categoriesContainer.appendChild(card);

    // Browse Genre Card on Search View
    const bCard = document.createElement('div');
    bCard.className = 'browse-card';
    bCard.style.backgroundColor = cat.color;
    bCard.innerHTML = `
      <h4>${cat.title}</h4>
      <div class="browse-card-bg">
        <i class="fa-solid ${cat.icon}"></i>
      </div>
    `;
    bCard.addEventListener('click', () => {
      searchInput.value = cat.title;
      performSearch(cat.title);
    });
    browseGridContainer.appendChild(bCard);
  });

  // 2. Populate All Songs table on Home
  renderSongsTable(allSongs, homeSongsList);
}

function renderSongsTable(songsList, containerElement, contextQueue = null) {
  containerElement.innerHTML = '';
  
  if (songsList.length === 0) {
    containerElement.innerHTML = `
      <tr>
        <td colspan="5" style="text-align: center; color: var(--text-muted); padding: 32px 0;">
          No songs found.
        </td>
      </tr>
    `;
    return;
  }

  const activeQueue = contextQueue || songsList;

  songsList.forEach((song, index) => {
    const isPlaying = (playQueue[queueIndex] && playQueue[queueIndex].id === song.id);
    const rowClass = isPlaying ? 'active-playing' : '';
    const isLiked = likedSongIds.has(song.id);
    const heartIcon = isLiked ? 'fa-solid fa-heart liked' : 'fa-regular fa-heart';
    
    const tr = document.createElement('tr');
    tr.className = rowClass;
    tr.setAttribute('data-id', song.id);
    
    tr.innerHTML = `
      <td class="col-num">
        <div class="song-row-num">
          <span class="row-num-text">${index + 1}</span>
          <span class="row-play-icon"><i class="fa-solid fa-play"></i></span>
        </div>
      </td>
      <td class="col-title">
        <div class="song-title-cell">
          <img class="song-cover-mini" src="${song.cover}" alt="cover">
          <div class="song-title-meta">
            <span class="song-title-text">${song.title}</span>
            <span class="song-artist-text">${song.artist}</span>
          </div>
        </div>
      </td>
      <td class="col-album">${song.album}</td>
      <td class="col-category">${song.category}</td>
      <td class="col-action">
        <button class="song-row-like-btn" title="Like song"><i class="${heartIcon}"></i></button>
        <button class="song-row-action-btn" title="More options"><i class="fa-solid fa-ellipsis"></i></button>
      </td>
    `;

    // Click row anywhere (except buttons) to play song
    tr.addEventListener('click', (e) => {
      if (e.target.closest('.song-row-like-btn') || e.target.closest('.song-row-action-btn')) {
        return;
      }
      playTrack(song.id, activeQueue);
    });

    // Like button handler
    const likeBtn = tr.querySelector('.song-row-like-btn');
    likeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleLikeTrack(song.id);
    });

    // Action/Options button handler
    const actionBtn = tr.querySelector('.song-row-action-btn');
    actionBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      showContextMenu(e, song.id);
    });

    containerElement.appendChild(tr);
  });
}

// ==========================================================================
// SEARCH LOGIC
// ==========================================================================
function renderSearchBrowse() {
  const searchVal = searchInput.value.trim();
  if (!searchVal) {
    document.getElementById('search-results-container').classList.add('d-none');
    document.getElementById('search-browse-all').classList.remove('d-none');
    document.getElementById('search-prompt-text').classList.remove('d-none');
    searchClearBtn.classList.add('d-none');
  } else {
    document.getElementById('search-results-container').classList.remove('d-none');
    document.getElementById('search-browse-all').classList.add('d-none');
    document.getElementById('search-prompt-text').classList.add('d-none');
    searchClearBtn.classList.remove('d-none');
  }
}

function performSearch(query) {
  const q = query.toLowerCase().trim();
  if (!q) {
    renderSearchBrowse();
    return;
  }
  
  // Filter search matches across title, album, and category
  const filtered = allSongs.filter(song => 
    song.title.toLowerCase().includes(q) ||
    song.album.toLowerCase().includes(q) ||
    song.category.toLowerCase().includes(q)
  );

  renderSearchBrowse();
  renderSongsTable(filtered, searchSongsList);
}

// ==========================================================================
// LIKED SONGS VIEW
// ==========================================================================
function renderLikedSongs() {
  const likedSongs = allSongs.filter(song => likedSongIds.has(song.id));
  
  document.getElementById('liked-songs-count').textContent = `${likedSongs.length} songs`;
  
  const playLikedBtn = document.getElementById('play-liked-btn');
  const emptyMsg = document.getElementById('liked-empty-msg');
  
  if (likedSongs.length > 0) {
    playLikedBtn.removeAttribute('disabled');
    emptyMsg.classList.add('d-none');
  } else {
    playLikedBtn.setAttribute('disabled', 'true');
    emptyMsg.classList.remove('d-none');
  }
  
  renderSongsTable(likedSongs, likedSongsList);
}

// ==========================================================================
// PLAYLISTS DETAIL VIEW
// ==========================================================================
function showPlaylistDetail(playlistId) {
  activePlaylistId = playlistId;
  const playlist = playlists.find(p => p.id === playlistId);
  if (!playlist) return;

  showView('playlist');

  document.getElementById('playlist-detail-title').textContent = playlist.name;
  document.getElementById('playlist-detail-owner').textContent = currentUser ? currentUser.username : "User";
  
  const playlistSongs = allSongs.filter(song => playlist.songIds.includes(song.id));
  document.getElementById('playlist-detail-count').textContent = `${playlistSongs.length} songs`;

  const playPlaylistBtn = document.getElementById('play-playlist-btn');
  if (playlistSongs.length > 0) {
    playPlaylistBtn.removeAttribute('disabled');
  } else {
    playPlaylistBtn.setAttribute('disabled', 'true');
  }

  // Render current songs in playlist
  renderPlaylistSongsTable(playlistSongs, playlistId);

  // Render recommended candidates to add
  renderPlaylistAddCandidates(playlist);
}

function renderPlaylistSongsTable(playlistSongs, playlistId) {
  playlistSongsList.innerHTML = '';
  
  if (playlistSongs.length === 0) {
    playlistSongsList.innerHTML = `
      <tr>
        <td colspan="5" style="text-align: center; color: var(--text-muted); padding: 32px 0;">
          No songs in this playlist. Add recommended songs below!
        </td>
      </tr>
    `;
    return;
  }

  playlistSongs.forEach((song, index) => {
    const isPlaying = (playQueue[queueIndex] && playQueue[queueIndex].id === song.id);
    const rowClass = isPlaying ? 'active-playing' : '';
    
    const tr = document.createElement('tr');
    tr.className = rowClass;
    tr.setAttribute('data-id', song.id);
    tr.innerHTML = `
      <td class="col-num">
        <div class="song-row-num">
          <span class="row-num-text">${index + 1}</span>
          <span class="row-play-icon"><i class="fa-solid fa-play"></i></span>
        </div>
      </td>
      <td class="col-title">
        <div class="song-title-cell">
          <img class="song-cover-mini" src="${song.cover}" alt="cover">
          <div class="song-title-meta">
            <span class="song-title-text">${song.title}</span>
            <span class="song-artist-text">${song.artist}</span>
          </div>
        </div>
      </td>
      <td class="col-album">${song.album}</td>
      <td class="col-category">${song.category}</td>
      <td class="col-action">
        <button class="btn-remove-from-playlist" title="Remove from playlist" style="color: var(--text-sub);">
          <i class="fa-solid fa-circle-minus"></i>
        </button>
      </td>
    `;

    tr.addEventListener('click', (e) => {
      if (e.target.closest('.btn-remove-from-playlist')) return;
      playTrack(song.id, playlistSongs);
    });

    tr.querySelector('.btn-remove-from-playlist').addEventListener('click', (e) => {
      e.stopPropagation();
      removeSongFromPlaylist(playlistId, song.id);
    });

    playlistSongsList.appendChild(tr);
  });
}

function renderPlaylistAddCandidates(playlist) {
  playlistAddCandidatesList.innerHTML = '';
  
  // Candidates are songs NOT in the current playlist
  const candidates = allSongs.filter(song => !playlist.songIds.includes(song.id)).slice(0, 8);

  if (candidates.length === 0) {
    playlistAddCandidatesList.innerHTML = `
      <tr>
        <td colspan="4" style="text-align: center; color: var(--text-muted); padding: 12px 0;">
          All catalog songs have been added to this playlist.
        </td>
      </tr>
    `;
    return;
  }

  candidates.forEach((song, index) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="col-num">${index + 1}</td>
      <td class="col-title">
        <div class="song-title-cell">
          <img class="song-cover-mini" src="${song.cover}" alt="cover" style="width:30px;height:30px;">
          <div class="song-title-meta">
            <span class="song-title-text" style="font-size:12px;">${song.title}</span>
            <span class="song-artist-text">${song.artist}</span>
          </div>
        </div>
      </td>
      <td class="col-album" style="font-size:12px;">${song.album}</td>
      <td class="col-action">
        <button class="btn-add-to-playlist btn" style="background-color: var(--border-color); color: var(--text-main); font-size:11px; padding: 4px 10px;">
          Add
        </button>
      </td>
    `;

    tr.querySelector('.btn-add-to-playlist').addEventListener('click', (e) => {
      e.stopPropagation();
      addSongToPlaylist(playlist.id, song.id);
    });

    playlistAddCandidatesList.appendChild(tr);
  });
}

// ==========================================================================
// PLAYBACK ENGINE
// ==========================================================================
function playTrack(trackId, contextList = null) {
  const song = allSongs.find(s => s.id === trackId);
  if (!song) return;

  // Determine the active queue
  if (contextList && contextList.length > 0) {
    playQueue = [...contextList];
    originalQueue = [...contextList];
  } else if (playQueue.length === 0) {
    playQueue = [song];
    originalQueue = [song];
  }

  // Find index in play queue
  queueIndex = playQueue.findIndex(s => s.id === trackId);
  if (queueIndex === -1) {
    playQueue.push(song);
    originalQueue.push(song);
    queueIndex = playQueue.length - 1;
  }

  // Load track source (Using streaming URL with fallback)
  audioEngine.src = song.streamUrl;
  audioEngine.play()
    .then(() => {
      updatePlaybackUI(true);
    })
    .catch(err => {
      console.warn("Failed to play from stream URL, attempting local path fallback...", err);
      audioEngine.src = song.localPath;
      audioEngine.play()
        .then(() => {
          updatePlaybackUI(true);
        })
        .catch(localErr => {
          console.error("Local path fallback playback failed:", localErr);
        });
    });

  // Sync details in player bar
  playerSongCover.src = song.cover;
  playerSongTitle.textContent = song.title;
  playerSongArtist.textContent = song.artist;
  
  // Enable heart like button in player
  playerLikeBtn.removeAttribute('disabled');
  updatePlayerLikeBtnUI(song.id);

  // Sync highlight rows across tables
  syncActivePlayingRows();
  
  // Update Play Queue Drawer
  renderPlayQueueDrawer();
}

function togglePlay() {
  if (audioEngine.src === "" && allSongs.length > 0) {
    // If no song loaded, play the first song on home
    playTrack(allSongs[0].id, allSongs);
    return;
  }

  if (audioEngine.paused) {
    audioEngine.play()
      .then(() => updatePlaybackUI(true))
      .catch(e => console.error("Playback error:", e));
  } else {
    audioEngine.pause();
    updatePlaybackUI(false);
  }
}

function nextTrack() {
  if (playQueue.length === 0) return;

  if (isRepeat === 2) {
    // Repeat single track
    audioEngine.currentTime = 0;
    audioEngine.play();
    return;
  }

  queueIndex++;
  if (queueIndex >= playQueue.length) {
    if (isRepeat === 1) {
      queueIndex = 0; // Loop back to start
    } else {
      queueIndex = playQueue.length - 1;
      audioEngine.pause();
      updatePlaybackUI(false);
      return;
    }
  }

  const nextSong = playQueue[queueIndex];
  playTrack(nextSong.id);
}

function prevTrack() {
  if (playQueue.length === 0) return;

  // If song played more than 3 seconds, reset track instead of going previous
  if (audioEngine.currentTime > 3) {
    audioEngine.currentTime = 0;
    return;
  }

  queueIndex--;
  if (queueIndex < 0) {
    if (isRepeat === 1) {
      queueIndex = playQueue.length - 1; // Wrap around to end
    } else {
      queueIndex = 0;
      audioEngine.currentTime = 0;
      return;
    }
  }

  const prevSong = playQueue[queueIndex];
  playTrack(prevSong.id);
}

function playCategory(categoryName) {
  const filtered = allSongs.filter(s => s.category === categoryName);
  if (filtered.length > 0) {
    playTrack(filtered[0].id, filtered);
  }
}

// Player controls states
function toggleShuffle() {
  isShuffle = !isShuffle;
  playerShuffleBtn.classList.toggle('active', isShuffle);
  
  if (isShuffle && playQueue.length > 0) {
    // Shuffle the queue, keeping current playing track at its place
    const currentTrack = playQueue[queueIndex];
    const remaining = playQueue.filter((_, idx) => idx !== queueIndex);
    
    // Fisher-Yates shuffle remaining
    for (let i = remaining.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [remaining[i], remaining[j]] = [remaining[j], remaining[i]];
    }
    
    playQueue = [currentTrack, ...remaining];
    queueIndex = 0;
  } else {
    // Restore original queue order and find the new index
    const currentTrack = playQueue[queueIndex];
    playQueue = [...originalQueue];
    queueIndex = playQueue.findIndex(s => s.id === currentTrack.id);
  }
  
  renderPlayQueueDrawer();
}

function toggleRepeat() {
  isRepeat = (isRepeat + 1) % 3; // Cycle: 0 -> 1 -> 2 -> 0
  
  // Update Repeat Icon UI
  playerRepeatBtn.classList.remove('active');
  const repeatIcon = playerRepeatBtn.querySelector('i');
  
  if (isRepeat === 0) {
    // No repeat
    playerRepeatBtn.title = "Repeat Off";
    repeatIcon.className = "fa-solid fa-repeat";
  } else if (isRepeat === 1) {
    // Repeat all
    playerRepeatBtn.classList.add('active');
    playerRepeatBtn.title = "Repeat All";
    repeatIcon.className = "fa-solid fa-repeat";
  } else if (isRepeat === 2) {
    // Repeat one
    playerRepeatBtn.classList.add('active');
    playerRepeatBtn.title = "Repeat One";
    repeatIcon.className = "fa-solid fa-repeat-1"; // Custom repeated one icon
    if (!repeatIcon.classList.contains('fa-repeat-1')) {
      // Fallback custom text/styling if class not found
      playerRepeatBtn.innerHTML = '<i class="fa-solid fa-repeat"></i><span style="font-size:8px;position:absolute;margin-top:8px;">1</span>';
    }
  }
}

// ==========================================================================
// PLAYBACK UTILITIES (VOLUME, PROGRESS BAR)
// ==========================================================================
function updatePlaybackUI(playing) {
  const playIcon = playerPlayBtn.querySelector('i');
  if (playing) {
    playIcon.className = "fa-solid fa-pause";
    playerPlayBtn.title = "Pause";
  } else {
    playIcon.className = "fa-solid fa-play";
    playerPlayBtn.title = "Play";
  }
}

function updatePlayerLikeBtnUI(songId) {
  const heart = playerLikeBtn.querySelector('i');
  if (likedSongIds.has(songId)) {
    heart.className = "fa-solid fa-heart";
    playerLikeBtn.classList.add('liked');
  } else {
    heart.className = "fa-regular fa-heart";
    playerLikeBtn.classList.remove('liked');
  }
}

function syncActivePlayingRows() {
  const activeTrack = playQueue[queueIndex];
  if (!activeTrack) return;

  // Clear active classes in all tables
  document.querySelectorAll('.songs-table tbody tr').forEach(tr => {
    const trId = tr.getAttribute('data-id');
    if (trId === activeTrack.id) {
      tr.classList.add('active-playing');
    } else {
      tr.classList.remove('active-playing');
    }
  });
}

function formatTime(seconds) {
  if (isNaN(seconds) || seconds === Infinity) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

function handleProgressScrub(percent) {
  if (!audioEngine.duration) return;
  const seekTime = (percent / 100) * audioEngine.duration;
  audioEngine.currentTime = seekTime;
}

function updateVolumeUI(value) {
  const fillVal = `${value}%`;
  volumeSliderFill.style.width = fillVal;
  volumeSliderThumb.style.left = fillVal;
  audioEngine.volume = value / 100;
  
  // Sync volume icon
  const volIcon = playerVolumeBtn.querySelector('i');
  if (value == 0 || isMuted) {
    volIcon.className = "fa-solid fa-volume-xmark";
  } else if (value < 40) {
    volIcon.className = "fa-solid fa-volume-low";
  } else {
    volIcon.className = "fa-solid fa-volume-high";
  }
}

function toggleMute() {
  isMuted = !isMuted;
  if (isMuted) {
    prevVolume = volumeSlider.value;
    updateVolumeUI(0);
    volumeSlider.value = 0;
  } else {
    updateVolumeUI(prevVolume);
    volumeSlider.value = prevVolume;
  }
}

// ==========================================================================
// PLAY QUEUE DRAWER RENDERING
// ==========================================================================
function renderPlayQueueDrawer() {
  queueNowPlayingCard.innerHTML = '';
  queueNextUpList.innerHTML = '';

  const activeTrack = playQueue[queueIndex];
  
  if (!activeTrack) {
    queueNowPlayingCard.innerHTML = `
      <div style="font-size: 12px; color: var(--text-muted);">No track selected</div>
    `;
    return;
  }

  // 1. Render Now Playing
  queueNowPlayingCard.innerHTML = `
    <img src="${activeTrack.cover}" alt="cover" style="width:40px;height:40px;border-radius:4px;object-fit:cover;">
    <div class="queue-item-info">
      <div class="queue-item-title" style="color: var(--accent-gold);">${activeTrack.title}</div>
      <div class="queue-item-artist">${activeTrack.artist}</div>
    </div>
    <div style="font-size:12px;color:var(--accent-gold);animation: pulse 1s infinite alternate;">
      <i class="fa-solid fa-volume-high"></i>
    </div>
  `;

  // 2. Render Upcoming Tracks
  const nextUp = playQueue.slice(queueIndex + 1);
  if (nextUp.length === 0) {
    queueNextUpList.innerHTML = `
      <div style="text-align: center; color: var(--text-muted); font-size:12px; padding: 24px 0;">
        End of Play Queue
      </div>
    `;
    return;
  }

  nextUp.forEach((song, idx) => {
    const qIndex = queueIndex + 1 + idx;
    const item = document.createElement('div');
    item.className = 'queue-item';
    item.innerHTML = `
      <img src="${song.cover}" alt="cover" style="width:32px;height:32px;border-radius:4px;object-fit:cover;">
      <div class="queue-item-info">
        <div class="queue-item-title">${song.title}</div>
        <div class="queue-item-artist">${song.artist}</div>
      </div>
    `;
    item.addEventListener('click', () => {
      playTrack(song.id);
    });
    queueNextUpList.appendChild(item);
  });
}

// ==========================================================================
// AUTHENTICATION INTERACTION (LOGIN/REGISTER)
// ==========================================================================
async function fetchUserProfile() {
  if (!token) return;

  try {
    const response = await fetch('/api/auth/me', {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (response.ok) {
      const data = await response.json();
      currentUser = data.user;
      
      // Update DB Indicator
      dbIndicator.className = data.isDatabaseFallback ? 'db-indicator-online' : 'db-indicator-online';
      dbIndicatorText.textContent = data.isDatabaseFallback ? 'JSON Fallback' : 'MongoDB Connected';
      
      updateAuthUI(currentUser);
      await syncLibraryData();
    } else {
      // Token expired or invalid
      logout();
    }
  } catch (err) {
    console.error("Connection failed verifying session token:", err);
    // Offline / Connection error - keep token and switch to fallback visualization
    dbIndicator.className = 'db-indicator-offline';
    dbIndicatorText.textContent = 'Server Offline';
  }
}

async function syncLibraryData() {
  if (!token) return;

  try {
    // 1. Fetch liked songs
    const likesRes = await fetch('/api/library/likes', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (likesRes.ok) {
      const data = await likesRes.json();
      likedSongIds = new Set(data.songIds);
      // Sync like icons on player and active columns
      if (playQueue[queueIndex]) {
        updatePlayerLikeBtnUI(playQueue[queueIndex].id);
      }
      syncActivePlayingRows();
    }

    // 2. Fetch playlists
    const playlistsRes = await fetch('/api/library/playlists', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (playlistsRes.ok) {
      const data = await playlistsRes.json();
      playlists = data.playlists;
      renderSidebarPlaylists();
    }
  } catch (err) {
    console.error("Library sync failed:", err);
  }
}

function updateAuthUI(user) {
  if (user) {
    sidebarGuestView.classList.add('d-none');
    sidebarUserView.classList.remove('d-none');
    topLoginBtn.classList.add('d-none');
    userDisplayName.textContent = user.username;
    
    // Enable heart button likes
    if (playQueue[queueIndex]) {
      playerLikeBtn.removeAttribute('disabled');
    }
  } else {
    sidebarGuestView.classList.remove('d-none');
    sidebarUserView.classList.add('d-none');
    topLoginBtn.classList.remove('d-none');
    sidebarPlaylists.innerHTML = `
      <div class="sidebar-placeholder-text">Log in to create custom playlists.</div>
    `;
    
    // Clear custom user assets
    currentUser = null;
    likedSongIds.clear();
    playlists = [];
    activePlaylistId = null;

    dbIndicator.className = 'db-indicator-offline';
    dbIndicatorText.textContent = 'Not Logged In';
    
    // Un-highlight liked songs UI
    syncActivePlayingRows();
  }
}

function logout() {
  localStorage.removeItem('jwt_token');
  token = null;
  updateAuthUI(null);
  showView('home');
}

// ==========================================================================
// LIBRARY CRUD OPERATIONS (LIKES, PLAYLISTS)
// ==========================================================================
async function toggleLikeTrack(songId) {
  if (!token) {
    showView('auth');
    return;
  }

  try {
    const response = await fetch('/api/library/likes/toggle', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ songId })
    });

    if (response.ok) {
      const data = await response.json();
      if (data.isLiked) {
        likedSongIds.add(songId);
      } else {
        likedSongIds.delete(songId);
      }

      // Update UI row likes and player bar
      updateLikesUI(songId, data.isLiked);
    }
  } catch (err) {
    console.error("Failed to toggle liked song status:", err);
  }
}

function updateLikesUI(songId, isLiked) {
  // Sync in active playing lists
  document.querySelectorAll(`.songs-table tbody tr[data-id="${songId}"] .song-row-like-btn`).forEach(btn => {
    const icon = btn.querySelector('i');
    if (isLiked) {
      icon.className = 'fa-solid fa-heart liked';
      btn.classList.add('liked');
    } else {
      icon.className = 'fa-regular fa-heart';
      btn.classList.remove('liked');
    }
  });

  // Sync player bar
  if (playQueue[queueIndex] && playQueue[queueIndex].id === songId) {
    updatePlayerLikeBtnUI(songId);
  }

  // Refresh Liked songs view if current view is Liked Songs
  if (!views.liked.classList.contains('d-none')) {
    renderLikedSongs();
  }
}

async function createPlaylist() {
  if (!token) {
    showView('auth');
    return;
  }

  const playlistName = prompt("Enter a name for your custom playlist:");
  if (!playlistName || !playlistName.trim()) return;

  try {
    const response = await fetch('/api/library/playlists', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ name: playlistName })
    });

    if (response.ok) {
      const newPlaylist = await response.json();
      playlists.push(newPlaylist);
      renderSidebarPlaylists();
      showPlaylistDetail(newPlaylist.id);
    } else {
      const err = await response.json();
      alert(`Error creating playlist: ${err.error}`);
    }
  } catch (error) {
    console.error("Failed to create playlist:", error);
  }
}

function renderSidebarPlaylists() {
  sidebarPlaylists.innerHTML = '';
  
  if (playlists.length === 0) {
    sidebarPlaylists.innerHTML = `
      <div class="sidebar-placeholder-text">Create your first custom playlist by clicking the plus icon!</div>
    `;
    return;
  }

  playlists.forEach(playlist => {
    const item = document.createElement('div');
    item.className = `playlist-sidebar-item ${activePlaylistId === playlist.id ? 'active' : ''}`;
    item.innerHTML = `
      <div class="playlist-sidebar-cover">
        <i class="fa-solid fa-music"></i>
      </div>
      <div class="playlist-sidebar-info">
        <span class="playlist-sidebar-name">${playlist.name}</span>
        <span class="playlist-sidebar-meta">${playlist.songIds.length} tracks</span>
      </div>
    `;

    item.addEventListener('click', () => {
      // Remove other active highlights
      document.querySelectorAll('.playlist-sidebar-item').forEach(el => el.classList.remove('active'));
      item.classList.add('active');
      showPlaylistDetail(playlist.id);
    });

    sidebarPlaylists.appendChild(item);
  });
}

async function addSongToPlaylist(playlistId, songId) {
  try {
    const response = await fetch(`/api/library/playlists/${playlistId}/add`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ songId })
    });

    if (response.ok) {
      const updatedPlaylist = await response.json();
      
      // Update local cache
      const index = playlists.findIndex(p => p.id === playlistId);
      if (index !== -1) {
        playlists[index] = updatedPlaylist;
      }

      // Re-render views
      renderSidebarPlaylists();
      showPlaylistDetail(playlistId);
    }
  } catch (error) {
    console.error("Error adding song to playlist:", error);
  }
}

async function removeSongFromPlaylist(playlistId, songId) {
  try {
    const response = await fetch(`/api/library/playlists/${playlistId}/remove`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ songId })
    });

    if (response.ok) {
      const updatedPlaylist = await response.json();
      
      // Update local cache
      const index = playlists.findIndex(p => p.id === playlistId);
      if (index !== -1) {
        playlists[index] = updatedPlaylist;
      }

      // Re-render views
      renderSidebarPlaylists();
      showPlaylistDetail(playlistId);
    }
  } catch (error) {
    console.error("Error removing song from playlist:", error);
  }
}

async function deletePlaylist(playlistId) {
  const confirmDel = confirm("Are you sure you want to delete this playlist? This action cannot be undone.");
  if (!confirmDel) return;

  try {
    const response = await fetch(`/api/library/playlists/${playlistId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (response.ok) {
      playlists = playlists.filter(p => p.id !== playlistId);
      renderSidebarPlaylists();
      showView('home');
    }
  } catch (error) {
    console.error("Error deleting playlist:", error);
  }
}

// ==========================================================================
// CONTEXT MENU LOGIC (Add to playlist dropdown)
// ==========================================================================
function showContextMenu(event, songId) {
  // Remove existing menu if any
  hideContextMenu();

  if (!token || playlists.length === 0) {
    return; // Don't show if guest or no playlists
  }

  const menu = document.createElement('div');
  menu.className = 'playlist-context-menu';
  menu.style.left = `${event.clientX}px`;
  menu.style.top = `${event.clientY}px`;
  
  let optionsHtml = '<div style="padding: 6px 12px; font-size:10px; color: var(--text-muted);">ADD TO PLAYLIST</div>';
  
  playlists.forEach(playlist => {
    const alreadyAdded = playlist.songIds.includes(songId);
    optionsHtml += `
      <div class="context-menu-item" data-playlist-id="${playlist.id}" data-added="${alreadyAdded}">
        <i class="fa-solid ${alreadyAdded ? 'fa-check' : 'fa-plus'}" style="color: ${alreadyAdded ? 'var(--accent-gold)' : 'inherit'}"></i>
        <span>${playlist.name}</span>
      </div>
    `;
  });

  menu.innerHTML = optionsHtml;
  document.body.appendChild(menu);
  activeContextMenu = menu;

  // Prevent menu overflow off bottom screen
  const rect = menu.getBoundingClientRect();
  if (rect.bottom > window.innerHeight) {
    menu.style.top = `${event.clientY - rect.height}px`;
  }

  // Click handler for menu items
  menu.querySelectorAll('.context-menu-item').forEach(item => {
    item.addEventListener('click', (e) => {
      const pId = item.getAttribute('data-playlist-id');
      const isAdded = item.getAttribute('data-added') === 'true';
      
      if (isAdded) {
        removeSongFromPlaylist(pId, songId);
      } else {
        addSongToPlaylist(pId, songId);
      }
      hideContextMenu();
    });
  });
}

function hideContextMenu() {
  if (activeContextMenu) {
    activeContextMenu.remove();
    activeContextMenu = null;
  }
}

// ==========================================================================
// EVENT LISTENERS & SETUP
// ==========================================================================
function setupEventListeners() {
  // Navigation
  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const view = item.getAttribute('data-view');
      showView(view);
    });
  });

  // History arrows
  document.getElementById('history-back-btn').addEventListener('click', () => {
    if (historyIndex > 0) {
      historyIndex--;
      showView(viewHistory[historyIndex], false);
    }
  });
  document.getElementById('history-forward-btn').addEventListener('click', () => {
    if (historyIndex < viewHistory.length - 1) {
      historyIndex++;
      showView(viewHistory[historyIndex], false);
    }
  });

  // Search
  searchInput.addEventListener('input', () => {
    performSearch(searchInput.value);
  });
  searchClearBtn.addEventListener('click', () => {
    searchInput.value = '';
    performSearch('');
    searchInput.focus();
  });

  // Playlist actions
  document.getElementById('create-playlist-btn').addEventListener('click', createPlaylist);
  
  document.getElementById('play-all-hero-btn').addEventListener('click', () => {
    if (allSongs.length > 0) playTrack(allSongs[0].id, allSongs);
  });
  
  document.getElementById('play-liked-btn').addEventListener('click', () => {
    const likedSongs = allSongs.filter(song => likedSongIds.has(song.id));
    if (likedSongs.length > 0) playTrack(likedSongs[0].id, likedSongs);
  });

  document.getElementById('play-playlist-btn').addEventListener('click', () => {
    if (activePlaylistId) {
      const playlist = playlists.find(p => p.id === activePlaylistId);
      const playlistSongs = allSongs.filter(song => playlist.songIds.includes(song.id));
      if (playlistSongs.length > 0) playTrack(playlistSongs[0].id, playlistSongs);
    }
  });

  document.getElementById('delete-playlist-btn').addEventListener('click', () => {
    if (activePlaylistId) deletePlaylist(activePlaylistId);
  });

  // Sidebar Login
  document.getElementById('sidebar-login-btn').addEventListener('click', () => showView('auth'));
  topLoginBtn.addEventListener('click', () => showView('auth'));
  
  document.getElementById('logout-btn').addEventListener('click', logout);

  // Auth Card Tab Toggles
  const tabLogin = document.getElementById('tab-login');
  const tabRegister = document.getElementById('tab-register');
  const loginForm = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');
  const loginErrorMsg = document.getElementById('login-error-msg');
  const registerErrorMsg = document.getElementById('register-error-msg');

  tabLogin.addEventListener('click', () => {
    tabLogin.classList.add('active');
    tabRegister.classList.remove('active');
    loginForm.classList.remove('d-none');
    registerForm.classList.add('d-none');
    loginErrorMsg.textContent = '';
  });

  tabRegister.addEventListener('click', () => {
    tabRegister.classList.add('active');
    tabLogin.classList.remove('active');
    registerForm.classList.remove('d-none');
    loginForm.classList.add('d-none');
    registerErrorMsg.textContent = '';
  });

  // Login Submit
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginErrorMsg.textContent = '';
    const username = document.getElementById('login-username').value;
    const password = document.getElementById('login-password').value;

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      if (res.ok) {
        const data = await res.json();
        token = data.token;
        localStorage.setItem('jwt_token', token);
        await fetchUserProfile();
        showView('home');
        // Reset inputs
        loginForm.reset();
      } else {
        const err = await res.json();
        loginErrorMsg.textContent = err.error || "Login failed.";
      }
    } catch (error) {
      loginErrorMsg.textContent = "Unable to connect to database server.";
    }
  });

  // Register Submit
  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    registerErrorMsg.textContent = '';
    const username = document.getElementById('register-username').value;
    const password = document.getElementById('register-password').value;

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      if (res.ok) {
        const data = await res.json();
        token = data.token;
        localStorage.setItem('jwt_token', token);
        await fetchUserProfile();
        showView('home');
        registerForm.reset();
      } else {
        const err = await res.json();
        registerErrorMsg.textContent = err.error || "Registration failed.";
      }
    } catch (error) {
      registerErrorMsg.textContent = "Unable to connect to database server.";
    }
  });

  // Player Engine Events
  playerPlayBtn.addEventListener('click', togglePlay);
  playerPrevBtn.addEventListener('click', prevTrack);
  playerNextBtn.addEventListener('click', nextTrack);
  playerShuffleBtn.addEventListener('click', toggleShuffle);
  playerRepeatBtn.addEventListener('click', toggleRepeat);

  playerLikeBtn.addEventListener('click', () => {
    const curTrack = playQueue[queueIndex];
    if (curTrack) toggleLikeTrack(curTrack.id);
  });

  // Volume
  playerVolumeBtn.addEventListener('click', toggleMute);
  volumeSlider.addEventListener('input', () => {
    isMuted = false;
    updateVolumeUI(volumeSlider.value);
  });

  // Audio Playback Events
  audioEngine.addEventListener('timeupdate', () => {
    if (audioEngine.duration) {
      const pct = (audioEngine.currentTime / audioEngine.duration) * 100;
      progressSlider.value = pct;
      progressSliderFill.style.width = `${pct}%`;
      progressSliderThumb.style.left = `${pct}%`;
      playerCurrentTime.textContent = formatTime(audioEngine.currentTime);
    }
  });

  audioEngine.addEventListener('durationchange', () => {
    playerTotalTime.textContent = formatTime(audioEngine.duration);
  });

  audioEngine.addEventListener('ended', nextTrack);

  // Scrubber Seeking
  progressSlider.addEventListener('input', () => {
    handleProgressScrub(progressSlider.value);
  });

  // Queue Drawer toggles
  playerQueueBtn.addEventListener('click', () => {
    queueDrawer.classList.toggle('d-none');
    renderPlayQueueDrawer();
  });
  
  document.getElementById('close-queue-btn').addEventListener('click', () => {
    queueDrawer.classList.add('d-none');
  });

  // Global click context menu remover
  document.addEventListener('click', hideContextMenu);
  document.addEventListener('contextmenu', (e) => {
    if (e.target.closest('.songs-table tbody tr')) {
      e.preventDefault();
      const tr = e.target.closest('.songs-table tbody tr');
      const sId = tr.getAttribute('data-id');
      showContextMenu(e, sId);
    }
  });
}
