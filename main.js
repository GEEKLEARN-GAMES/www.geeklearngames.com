/* ============================================================
   GEEKLEARN GAMES — CORE JAVASCRIPT
   Auth, Navigation, Games data, Interactions
   ============================================================ */

'use strict';

// ── GAMES DATABASE ─────────────────────────────────────────────
const GAMES_DB = [
  {
    id: 'backrooms-liminal',
    title: 'BACKROOMS: LIMINAL',
    subtitle: 'Jeu de survie-horreur',
    type: 'game',
    genre: ['Horror', 'Survival'],
    rating: '18+',
    releaseDate: '2023',
    releaseDateFull: '2023-06-15',
    description: "Plongez dans les profondeurs des Backrooms, un espace liminaire infini et cauchemardesque. Seul, sans ressources, avec pour seul objectif : trouver une sortie qui n'existe peut-être pas.",
    platforms: ['steam', 'playstation', 'xbox'],
    price: '14.99',
    posterBg: '#0a0a0a',
    posterLetter: 'BL',
    steamUrl: 'https://store.steampowered.com/',
    psUrl: 'https://store.playstation.com/',
    xboxUrl: 'https://www.xbox.com/',
    switchUrl: null,
    screenshots: [],
    trailer: null,
    featured: true,
  },
  {
    id: 'the-mothers-eyes',
    title: "THE MOTHER'S EYES",
    subtitle: 'Film interactif / Horreur psychologique',
    type: 'interactive-film',
    genre: ['Horror', 'Psychological', 'Interactive'],
    rating: '18+',
    releaseDate: '2023',
    releaseDateFull: '2023-09-01',
    description: "Un film interactif d'horreur psychologique aux choix lourds de conséquences. Qui est vraiment votre mère ? Chaque décision vous rapproche de la vérité — ou vous en éloigne à jamais.",
    platforms: ['steam'],
    price: '9.99',
    posterBg: '#060606',
    posterLetter: 'ME',
    steamUrl: 'https://store.steampowered.com/',
    psUrl: null, xboxUrl: null, switchUrl: null,
    screenshots: [],
    trailer: null,
    featured: false,
  },
  {
    id: 'soul-redemption',
    title: 'SOUL REDEMPTION',
    subtitle: 'Action-RPG / Dark Fantasy',
    type: 'game',
    genre: ['Action-RPG', 'Dark Fantasy'],
    rating: 'Tous',
    releaseDate: '2022',
    releaseDateFull: '2022-11-10',
    description: "Un voyage sombre au cœur d'un monde fantastique ravagé par la corruption. Rachetez votre âme, ou sombrez dans les ténèbres pour l'éternité. Le choix vous appartient.",
    platforms: ['steam', 'playstation', 'xbox', 'nintendo'],
    price: '19.99',
    posterBg: '#080808',
    posterLetter: 'SR',
    steamUrl: 'https://store.steampowered.com/',
    psUrl: 'https://store.playstation.com/',
    xboxUrl: 'https://www.xbox.com/',
    switchUrl: 'https://www.nintendo.com/',
    screenshots: [],
    trailer: null,
    featured: true,
  },
  {
    id: 'soul-redemption-frenzy-fest',
    title: 'SOUL REDEMPTION: FRENZY FEST',
    subtitle: 'Standalone DLC / Action',
    type: 'game',
    genre: ['Action', 'Dark Fantasy', 'DLC'],
    rating: '16+',
    releaseDate: '2023',
    releaseDateFull: '2023-10-31',
    description: "Une extension explosive de Soul Redemption. Le festival du chaos et de la frénésie. Nouveaux boss, nouvelles arènes, nouveau carnage. Les âmes damnées n'ont jamais autant souffert.",
    platforms: ['steam', 'playstation', 'xbox'],
    price: '7.99',
    posterBg: '#090909',
    posterLetter: 'FF',
    steamUrl: 'https://store.steampowered.com/',
    psUrl: 'https://store.playstation.com/',
    xboxUrl: 'https://www.xbox.com/',
    switchUrl: null,
    screenshots: [],
    trailer: null,
    featured: false,
  },
  {
    id: 'trick-or-treat',
    title: 'TRICK OR TREAT?',
    subtitle: 'Film interactif / Halloween',
    type: 'interactive-film',
    genre: ['Horror', 'Interactive', 'Halloween'],
    rating: '12+',
    releaseDate: '2022',
    releaseDateFull: '2022-10-28',
    description: "Une nuit d'Halloween qui tourne mal. Faites vos choix, assumez les conséquences. Dans cette ville, trick or treat n'est pas qu'un jeu d'enfants.",
    platforms: ['steam'],
    price: '5.99',
    posterBg: '#060606',
    posterLetter: 'TOT',
    steamUrl: 'https://store.steampowered.com/',
    psUrl: null, xboxUrl: null, switchUrl: null,
    screenshots: [],
    trailer: null,
    featured: false,
  },
  {
    id: 'a-terrible-wonderful-christmas',
    title: 'A TERRIBLE, WONDERFUL CHRISTMAS',
    subtitle: 'Film interactif / Comédie noire',
    type: 'interactive-film',
    genre: ['Comedy', 'Dark', 'Interactive', 'Christmas'],
    rating: 'Tous',
    releaseDate: '2022',
    releaseDateFull: '2022-12-20',
    description: "Noël ne se passe jamais comme prévu. Un film interactif entre comédie noire et chaleur familiale, qui vous mettra face à des décisions absurdes et touchantes.",
    platforms: ['steam'],
    price: '5.99',
    posterBg: '#050505',
    posterLetter: 'TWC',
    steamUrl: 'https://store.steampowered.com/',
    psUrl: null, xboxUrl: null, switchUrl: null,
    screenshots: [],
    trailer: null,
    featured: false,
  },
  {
    id: 'easter-my-bunny',
    title: 'EASTER MY BUNNY',
    subtitle: 'Film interactif / Mystère',
    type: 'interactive-film',
    genre: ['Mystery', 'Interactive', 'Easter'],
    rating: 'Tous',
    releaseDate: '2023',
    releaseDateFull: '2023-04-08',
    description: "Pâques cache toujours quelque chose. Une histoire de lapins, de secrets et de choix inattendus qui transforment une journée anodine en aventure.",
    platforms: ['steam'],
    price: '4.99',
    posterBg: '#050505',
    posterLetter: 'EMB',
    steamUrl: 'https://store.steampowered.com/',
    psUrl: null, xboxUrl: null, switchUrl: null,
    screenshots: [],
    trailer: null,
    featured: false,
  },
  {
    id: 'eid-of-light',
    title: 'EID OF LIGHT',
    subtitle: 'Film interactif / Dramaturgie',
    type: 'interactive-film',
    genre: ['Drama', 'Interactive', 'Cultural'],
    rating: 'Tous',
    releaseDate: '2023',
    releaseDateFull: '2023-04-22',
    description: "Une histoire de lumière, de partage et de décisions familiales lors de l'Aïd. Un film interactif touchant qui célèbre la communauté et les liens entre générations.",
    platforms: ['steam'],
    price: '4.99',
    posterBg: '#050505',
    posterLetter: 'EOL',
    steamUrl: 'https://store.steampowered.com/',
    psUrl: null, xboxUrl: null, switchUrl: null,
    screenshots: [],
    trailer: null,
    featured: false,
  },
];

// ── AUTH / USER SYSTEM ────────────────────────────────────────
const Auth = {
  FOUNDER_USERNAME: 'GEEKLEARN',
  FOUNDER_BADGE: '⭐',

  getUsers() {
    return JSON.parse(localStorage.getItem('glg_users') || '[]');
  },

  saveUsers(users) {
    localStorage.setItem('glg_users', JSON.stringify(users));
  },

  getCurrentUser() {
    const id = localStorage.getItem('glg_current_user');
    if (!id) return null;
    return this.getUsers().find(u => u.id === id) || null;
  },

  setCurrentUser(user) {
    if (user) {
      localStorage.setItem('glg_current_user', user.id);
    } else {
      localStorage.removeItem('glg_current_user');
    }
    updateAuthUI();
  },

  isUsernameTaken(username, excludeId = null) {
    return this.getUsers().some(u =>
      u.username.toLowerCase() === username.toLowerCase() &&
      u.id !== excludeId
    );
  },

  isEmailTaken(email, excludeId = null) {
    return this.getUsers().some(u =>
      u.email.toLowerCase() === email.toLowerCase() &&
      u.id !== excludeId
    );
  },

  createUser({ username, email, password, gender }) {
    const users = this.getUsers();
    const id = 'usr_' + Date.now() + '_' + Math.random().toString(36).slice(2,8);
    const isFounder = username.toUpperCase() === this.FOUNDER_USERNAME;
    const user = {
      id,
      username,
      email,
      passwordHash: btoa(password),
      gender: gender || '',
      avatar: null,
      avatarInitial: username[0].toUpperCase(),
      isFounder,
      badge: isFounder ? this.FOUNDER_BADGE : null,
      bio: '',
      connectedAccounts: { steam: null, playstation: null, discord: null },
      library: isFounder ? GAMES_DB.map(g => g.id) : [],
      joinedAt: new Date().toISOString(),
      emailVerified: false,
    };
    users.push(user);
    this.saveUsers(users);
    return user;
  },

  loginUser(emailOrUsername, password) {
    const users = this.getUsers();
    const user = users.find(u =>
      (u.email.toLowerCase() === emailOrUsername.toLowerCase() ||
       u.username.toLowerCase() === emailOrUsername.toLowerCase()) &&
      u.passwordHash === btoa(password)
    );
    return user || null;
  },

  updateUser(id, updates) {
    const users = this.getUsers();
    const idx = users.findIndex(u => u.id === id);
    if (idx === -1) return null;
    users[idx] = { ...users[idx], ...updates };
    this.saveUsers(users);
    if (this.getCurrentUser()?.id === id) {
      updateAuthUI();
    }
    return users[idx];
  },

  logout() {
    this.setCurrentUser(null);
    showPage('home');
    notify('success', 'Déconnexion', 'À bientôt sur GEEKLEARN GAMES !');
  },
};

// ── EMAIL SIMULATION ──────────────────────────────────────────
async function sendWelcomeEmail(user) {
  // In production, this would call a backend email endpoint
  // Here we simulate with a confirmation dialog showing the email content
  const emailContent = `
De: geeklearngames.studio@gmail.com
À: ${user.email}
Objet: Bienvenue sur GEEKLEARN GAMES — Confirmez votre compte

─────────────────────────────────────
GEEKLEARN GAMES — CONFIRMATION D'INSCRIPTION
─────────────────────────────────────

Bonjour ${user.username},

Bienvenue dans l'univers GEEKLEARN GAMES ! 🎮

Votre compte a été créé avec succès sur notre plateforme.
Vous faites maintenant partie d'une communauté passionnée de joueurs.

Pseudonyme: ${user.username}
Email: ${user.email}
Date d'inscription: ${new Date(user.joinedAt).toLocaleDateString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric' })}

Vous pouvez dès à présent :
• Accéder à votre bibliothèque de jeux
• Lier vos comptes Steam, PlayStation et Discord
• Partager vos créations dans notre forum communautaire
• Découvrir tous nos jeux et films interactifs

Pour toute question : geeklearngames.studio@gmail.com

© 2024 GEEKLEARN GAMES STUDIO — Tous droits réservés
─────────────────────────────────────
  `.trim();

  console.log('[EMAIL SIMULATION]\n' + emailContent);
  // Show in notification
  notify('info', 'Email envoyé', `Email de confirmation envoyé à ${user.email}`);
}

// ── UI UPDATE ─────────────────────────────────────────────────
function updateAuthUI() {
  const user = Auth.getCurrentUser();
  const authBtn = document.getElementById('nav-auth-btn');
  const userMenuWrapper = document.getElementById('user-menu-wrapper');
  const avatarBtn = document.getElementById('user-avatar-btn');
  const badgeEl = document.getElementById('user-badge');
  const ddUsername = document.getElementById('dd-username');
  const ddEmail = document.getElementById('dd-email');

  if (user) {
    if (authBtn) authBtn.style.display = 'none';
    if (userMenuWrapper) userMenuWrapper.style.display = 'block';
    if (avatarBtn) {
      if (user.avatar) {
        avatarBtn.innerHTML = `<img src="${user.avatar}" alt="avatar">`;
      } else {
        avatarBtn.textContent = user.avatarInitial || user.username[0].toUpperCase();
      }
    }
    if (badgeEl) badgeEl.textContent = user.badge || '';
    if (ddUsername) {
      ddUsername.innerHTML = user.username + (user.badge ? ` <span>${user.badge}</span>` : '');
    }
    if (ddEmail) ddEmail.textContent = user.email;
  } else {
    if (authBtn) authBtn.style.display = '';
    if (userMenuWrapper) userMenuWrapper.style.display = 'none';
  }
}

// ── NAVIGATION ────────────────────────────────────────────────
let currentPage = 'home';
let currentGameId = null;

function showPage(pageId, data = null) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const page = document.getElementById('page-' + pageId);
  if (page) {
    page.classList.add('active');
    currentPage = pageId;
    window.scrollTo({ top: 0, behavior: 'instant' });

    // Update nav active state
    document.querySelectorAll('.nav-links a, .mobile-menu-link').forEach(a => {
      a.classList.remove('active');
      if (a.dataset.page === pageId) a.classList.add('active');
    });
  }

  if (pageId === 'game-detail' && data) {
    currentGameId = data;
    renderGameDetail(data);
  }
  if (pageId === 'profile') {
    renderProfile();
  }
  if (pageId === 'library') {
    renderLibrary();
  }
}

// ── GAMES RENDERING ───────────────────────────────────────────
function renderGamesCarousel() {
  const container = document.getElementById('games-carousel');
  if (!container) return;

  const sorted = [...GAMES_DB].sort((a, b) =>
    new Date(a.releaseDateFull) - new Date(b.releaseDateFull)
  );

  container.innerHTML = sorted.map(game => `
    <div class="game-card" data-game="${game.id}" onclick="showPage('game-detail', '${game.id}')">
      <div class="game-card-poster placeholder">
        <div class="game-card-poster-letter">${game.posterLetter}</div>
        <div class="game-card-overlay"></div>
        <span class="game-card-badge rating-${game.rating.replace('+','').replace(' ','')}">${game.rating}</span>
      </div>
      <div class="game-card-info">
        <div class="game-card-type">${game.type === 'game' ? '🎮 JEU' : '🎬 FILM INTERACTIF'}</div>
        <div class="game-card-title">${game.title}</div>
        <div class="game-card-meta">
          <span class="game-card-date">${game.releaseDate}</span>
          <div class="game-card-arrow">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M2 6h8M6 2l4 4-4 4"/>
            </svg>
          </div>
        </div>
      </div>
    </div>
  `).join('');

  renderGamesMosaic();
  initCarouselDrag();
}

function renderGamesMosaic(filter = '') {
  const container = document.getElementById('games-mosaic');
  if (!container) return;

  let games = [...GAMES_DB].sort((a, b) =>
    new Date(a.releaseDateFull) - new Date(b.releaseDateFull)
  );

  if (filter.trim()) {
    games = games.filter(g =>
      g.title.toLowerCase().includes(filter.toLowerCase()) ||
      g.genre.some(genre => genre.toLowerCase().includes(filter.toLowerCase()))
    );
  }

  container.innerHTML = games.map(game => `
    <div class="game-card" data-game="${game.id}" onclick="showPage('game-detail', '${game.id}')">
      <div class="game-card-poster placeholder" style="aspect-ratio:2/3">
        <div class="game-card-poster-letter" style="font-size:3rem">${game.posterLetter}</div>
        <div class="game-card-overlay"></div>
        <span class="game-card-badge">${game.rating}</span>
      </div>
      <div class="game-card-info">
        <div class="game-card-type">${game.type === 'game' ? '🎮 JEU' : '🎬 FILM'}</div>
        <div class="game-card-title" style="font-size:1.1rem">${game.title}</div>
      </div>
    </div>
  `).join('');

  if (games.length === 0) {
    container.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:60px;color:var(--gray-600);font-family:var(--font-mono);font-size:0.7rem;letter-spacing:0.15em">AUCUN JEU TROUVÉ</div>';
  }
}

function renderGameDetail(gameId) {
  const game = GAMES_DB.find(g => g.id === gameId);
  if (!game) return;

  const container = document.getElementById('page-game-detail');
  if (!container) return;

  const platformIcons = {
    steam: `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M11.979 0C5.678 0 .511 4.86.022 11.037l6.432 2.658c.545-.371 1.203-.59 1.912-.59.063 0 .125.004.188.006l2.861-4.142V8.91c0-2.495 2.028-4.524 4.524-4.524 2.494 0 4.524 2.031 4.524 4.527s-2.03 4.525-4.524 4.525h-.105l-4.076 2.911c0 .052.004.105.004.159 0 1.875-1.515 3.396-3.39 3.396-1.635 0-3.016-1.173-3.331-2.727L.436 15.27C1.862 20.307 6.486 24 11.979 24c6.627 0 11.999-5.373 11.999-12S18.607 0 11.979 0z"/></svg>`,
    playstation: `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M9.5 3.5C9.5 3.5 8.5 3.6 8.3 4.4v14.1l2.7 1V6.9c0-.5.2-.9.6-.9.5 0 .7.5.7 1V17.7l2.6-1.1V4.7c0-1.2-1.1-1.7-2.4-1.7L9.5 3.5zM5.2 19.4c-1.8.5-3.3-.1-3.3-1.4 0-1.2 1.4-2.5 3.3-3v-2c-2.5.5-5.2 2-5.2 5 0 2.9 3 4.4 5.2 3.7v-2.3zm12.3-2.8c1.8.6 3.3 1.4 3.3 2.8 0 1.4-1.4 2.3-3.3 1.7v2.1c2.3.7 5.5-.4 5.5-3.7 0-2.9-2.7-4.3-5.5-5.1v2.2z"/></svg>`,
    xbox: `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M4.102 21.033C6.211 22.881 8.977 24 12 24c3.026 0 5.789-1.119 7.902-2.967 1.877-1.912-4.316-8.709-7.902-11.417-3.582 2.708-9.779 9.505-7.898 11.417zM12 0C8.606 0 5.53 1.374 3.33 3.593c-.463.463-.15 1.183.446 1.183.264 0 .498-.114.695-.307 0 0 2.378-2.362 7.53-2.362 5.154 0 7.533 2.358 7.533 2.358.189.199.428.307.691.307.597 0 .906-.717.45-1.182C18.471 1.374 15.394 0 12 0zm-7.529 4.928C2.246 6.88.002 9.87.002 12.015c0 2.678 1.009 5.131 2.657 6.98.811.895 2.32.136 2.32-.982a1.24 1.24 0 0 0-.245-.743S2.395 14.748 2.395 12c0-2.749 2.342-5.27 2.342-5.27a1.241 1.241 0 0 0 .245-.744c0-1.12-1.512-1.879-2.511-.058zm15.057 0c-1 1.82-2.511 1.062-2.511-.058 0-.265.088-.52.245-.744 0 0 2.342 2.521 2.342 5.27 0 2.748-2.339 5.27-2.339 5.27-.156.221-.245.479-.245.744 0 1.117 1.509 1.876 2.32.982C21 16.146 22 13.693 22 11.015c0-2.145-2.246-5.135-4.472-6.087z"/></svg>`,
    nintendo: `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M7.97 0h8.05A7.97 7.97 0 0 1 24 7.97v8.05a7.97 7.97 0 0 1-7.97 7.97H7.97A7.97 7.97 0 0 1 0 16.03V7.97A7.97 7.97 0 0 1 7.97 0zm-.63 3.61A4.38 4.38 0 0 0 3 7.99v8.02a4.38 4.38 0 0 0 4.34 4.38h3.6V3.61h-3.6zm4.93 4.19l2.08 3.49-2.08 3.49V7.8zm2.46 0h.87a4.38 4.38 0 0 1 4.37 4.38 4.38 4.38 0 0 1-4.37 4.38h-.87l-2.08-3.49 2.08-3.27z"/></svg>`,
  };

  const platformLabels = {
    steam: 'Steam', playstation: 'PlayStation', xbox: 'Xbox', nintendo: 'Nintendo Switch'
  };

  container.innerHTML = `
    <div class="game-detail-hero">
      <div class="game-detail-bg">
        <div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-family:var(--font-display);font-size:20vw;color:rgba(255,255,255,0.02);letter-spacing:0.05em;user-select:none">${game.posterLetter}</div>
        <div style="position:absolute;inset:0;background:linear-gradient(0deg,#000 0%,rgba(0,0,0,0.5) 60%,transparent 100%)"></div>
      </div>
      <div class="game-detail-content container">
        <div style="display:inline-block;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);padding:4px 12px;font-family:var(--font-mono);font-size:0.55rem;letter-spacing:0.2em;text-transform:uppercase;color:var(--gray-400);margin-bottom:16px;">${game.type === 'game' ? '🎮 JEU VIDÉO' : '🎬 FILM INTERACTIF'} &nbsp;·&nbsp; ${game.rating}</div>
        <h1 style="font-size:clamp(3rem,8vw,7rem);margin-bottom:16px;line-height:0.9">${game.title}</h1>
        <p style="font-size:0.85rem;color:var(--gray-400);font-family:var(--font-mono);letter-spacing:0.15em;text-transform:uppercase;margin-bottom:20px">${game.subtitle}</p>
        <p style="max-width:580px;color:var(--gray-200);font-size:0.95rem;margin-bottom:32px">${game.description}</p>
        <div style="display:flex;align-items:center;gap:20px;flex-wrap:wrap">
          <button class="btn btn-primary" onclick="openBuyPopup('${game.id}')">
            ACHETER — ${game.price}€
          </button>
          <div style="font-family:var(--font-mono);font-size:0.6rem;color:var(--gray-600);letter-spacing:0.12em">SORTIE: ${game.releaseDate}</div>
        </div>
        <div class="game-platforms">
          ${game.platforms.map(p => `<span class="platform-pill">${platformIcons[p] || ''} ${platformLabels[p] || p}</span>`).join('')}
        </div>
      </div>
    </div>

    <div class="section" style="padding-top:80px">
      <div class="container">
        <div style="display:flex;gap:32px;flex-wrap:wrap">
          <div style="flex:1;min-width:280px">
            <h3 style="margin-bottom:20px">À PROPOS</h3>
            <p>${game.description}</p>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:32px">
              <div>
                <div class="label">Genre</div>
                <div style="margin-top:6px;font-weight:600">${game.genre.join(', ')}</div>
              </div>
              <div>
                <div class="label">Classification</div>
                <div style="margin-top:6px;font-weight:600">${game.rating}</div>
              </div>
              <div>
                <div class="label">Sortie</div>
                <div style="margin-top:6px;font-weight:600">${game.releaseDate}</div>
              </div>
              <div>
                <div class="label">Prix</div>
                <div style="margin-top:6px;font-weight:600">${game.price}€</div>
              </div>
            </div>
          </div>
          <div style="flex:1;min-width:280px">
            <h3 style="margin-bottom:20px">DISPONIBLE SUR</h3>
            <div style="display:flex;flex-direction:column;gap:12px">
              ${game.platforms.map(p => `
                <a href="${game[p+'Url'] || '#'}" target="_blank" class="platform-btn" style="text-decoration:none">
                  ${platformIcons[p] || ''}
                  <span>${platformLabels[p] || p}</span>
                  <svg style="margin-left:auto;opacity:0.4" width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 7h10M7 2l5 5-5 5"/></svg>
                </a>
              `).join('')}
            </div>
          </div>
        </div>

        <div class="divider"></div>

        <div>
          <h3 style="margin-bottom:32px">AUTRES JEUX</h3>
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:16px">
            ${GAMES_DB.filter(g => g.id !== gameId).slice(0, 4).map(g => `
              <div class="game-card" onclick="showPage('game-detail','${g.id}')" style="cursor:pointer">
                <div class="game-card-poster placeholder" style="aspect-ratio:2/3">
                  <div class="game-card-poster-letter" style="font-size:2.5rem">${g.posterLetter}</div>
                  <div class="game-card-overlay"></div>
                </div>
                <div class="game-card-info">
                  <div class="game-card-title" style="font-size:1rem">${g.title}</div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    </div>
  `;
}

// ── BUY POPUP ─────────────────────────────────────────────────
function openBuyPopup(gameId) {
  const game = GAMES_DB.find(g => g.id === gameId);
  if (!game) return;

  const platformIcons = {
    steam: `<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M11.979 0C5.678 0 .511 4.86.022 11.037l6.432 2.658c.545-.371 1.203-.59 1.912-.59.063 0 .125.004.188.006l2.861-4.142V8.91c0-2.495 2.028-4.524 4.524-4.524 2.494 0 4.524 2.031 4.524 4.527s-2.03 4.525-4.524 4.525h-.105l-4.076 2.911c0 .052.004.105.004.159 0 1.875-1.515 3.396-3.39 3.396-1.635 0-3.016-1.173-3.331-2.727L.436 15.27C1.862 20.307 6.486 24 11.979 24c6.627 0 11.999-5.373 11.999-12S18.607 0 11.979 0z"/></svg>`,
    playstation: `<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M9.5 3.5C9.5 3.5 8.5 3.6 8.3 4.4v14.1l2.7 1V6.9c0-.5.2-.9.6-.9.5 0 .7.5.7 1V17.7l2.6-1.1V4.7c0-1.2-1.1-1.7-2.4-1.7L9.5 3.5z"/></svg>`,
    xbox: `<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M4.102 21.033C6.211 22.881 8.977 24 12 24c3.026 0 5.789-1.119 7.902-2.967 1.877-1.912-4.316-8.709-7.902-11.417-3.582 2.708-9.779 9.505-7.898 11.417z"/></svg>`,
    nintendo: `<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M7.97 0h8.05A7.97 7.97 0 0 1 24 7.97v8.05a7.97 7.97 0 0 1-7.97 7.97H7.97A7.97 7.97 0 0 1 0 16.03V7.97A7.97 7.97 0 0 1 7.97 0z"/></svg>`,
  };
  const platformLabels = { steam: 'Steam', playstation: 'PlayStation Store', xbox: 'Xbox Store', nintendo: 'Nintendo eShop' };
  const platformUrls = { steam: game.steamUrl, playstation: game.psUrl, xbox: game.xboxUrl, nintendo: game.switchUrl };

  const popup = document.getElementById('buy-popup');
  popup.innerHTML = `
    <button class="popup-close" onclick="closeBuyPopup()">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 2l12 12M14 2L2 14"/></svg>
    </button>
    <div class="buy-popup-title">${game.title}</div>
    <div class="buy-popup-subtitle">CHOISISSEZ VOTRE PLATEFORME — ${game.price}€</div>
    <div class="platform-buttons">
      ${game.platforms.map(p => `
        <a href="${platformUrls[p] || '#'}" target="_blank" rel="noopener" class="platform-btn">
          ${platformIcons[p] || ''}
          <span>${platformLabels[p] || p}</span>
        </a>
      `).join('')}
    </div>
    <p style="font-family:var(--font-mono);font-size:0.55rem;color:var(--gray-600);text-align:center;margin-top:20px;letter-spacing:0.1em">EN CLIQUANT, VOUS SEREZ REDIRIGÉ VERS LA BOUTIQUE OFFICIELLE</p>
  `;
  popup.parentElement.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeBuyPopup() {
  document.getElementById('buy-popup-overlay').classList.remove('open');
  document.body.style.overflow = '';
}

// ── AUTH MODAL ────────────────────────────────────────────────
let authMode = 'login';

function openModal(mode = 'login') {
  authMode = mode;
  renderModal();
  document.getElementById('modal-overlay').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('open');
  document.body.style.overflow = '';
}

function switchAuthMode(mode) {
  authMode = mode;
  renderModal();
}

function renderModal() {
  const body = document.getElementById('modal-body');
  const title = document.getElementById('modal-title');
  const subtitle = document.getElementById('modal-subtitle');

  if (authMode === 'login') {
    title.textContent = 'CONNEXION';
    subtitle.textContent = 'Accédez à votre compte GEEKLEARN GAMES';

    body.innerHTML = `
      <div class="form-group">
        <label class="form-label">Email ou Pseudonyme</label>
        <input class="form-input" type="text" id="login-id" placeholder="votre@email.com ou pseudo" autocomplete="username">
        <div class="form-error" id="login-id-err">Identifiant invalide</div>
      </div>
      <div class="form-group">
        <label class="form-label">Mot de passe</label>
        <input class="form-input" type="password" id="login-pass" placeholder="••••••••" autocomplete="current-password">
        <div class="form-error" id="login-pass-err">Identifiants incorrects</div>
      </div>
      <div style="display:flex;justify-content:flex-end;margin-bottom:20px">
        <button class="btn-ghost" style="font-size:0.65rem;padding:4px 0;border:none;color:var(--gray-400)" onclick="switchAuthMode('forgot')">Mot de passe oublié ?</button>
      </div>
      <button class="btn btn-primary btn-full" onclick="handleLogin()">SE CONNECTER</button>
      <div class="modal-switch">
        Pas encore de compte ? <a onclick="switchAuthMode('register')">S'inscrire</a>
      </div>
    `;
  } else if (authMode === 'register') {
    title.textContent = 'INSCRIPTION';
    subtitle.textContent = 'Créez votre compte GEEKLEARN GAMES';

    body.innerHTML = `
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Pseudonyme *</label>
          <input class="form-input" type="text" id="reg-username" placeholder="HunterX_99" autocomplete="username" maxlength="20">
          <div class="form-error" id="reg-username-err">Pseudo déjà pris</div>
          <div class="form-hint">3-20 caractères, unique</div>
        </div>
        <div class="form-group">
          <label class="form-label">Genre</label>
          <select class="form-input form-select" id="reg-gender">
            <option value="">Non renseigné</option>
            <option value="homme">Homme</option>
            <option value="femme">Femme</option>
            <option value="autre">Autre / Non-binaire</option>
            <option value="np">Préfère ne pas dire</option>
          </select>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Adresse Email *</label>
        <input class="form-input" type="email" id="reg-email" placeholder="vous@exemple.com" autocomplete="email">
        <div class="form-error" id="reg-email-err">Email déjà utilisé ou invalide</div>
      </div>
      <div class="form-group">
        <label class="form-label">Mot de passe *</label>
        <input class="form-input" type="password" id="reg-pass" placeholder="Minimum 8 caractères" autocomplete="new-password">
        <div class="form-error" id="reg-pass-err">Minimum 8 caractères requis</div>
      </div>
      <div class="form-group">
        <label class="form-label">Confirmer le mot de passe *</label>
        <input class="form-input" type="password" id="reg-pass2" placeholder="Répétez le mot de passe" autocomplete="new-password">
        <div class="form-error" id="reg-pass2-err">Les mots de passe ne correspondent pas</div>
      </div>
      <div class="form-group">
        <label class="form-check">
          <input type="checkbox" id="reg-terms">
          <span class="form-check-label">J'accepte les <a href="#">Conditions d'utilisation</a> et la <a href="#">Politique de confidentialité</a> de GEEKLEARN GAMES</span>
        </label>
        <div class="form-error" id="reg-terms-err">Veuillez accepter les conditions</div>
      </div>
      <button class="btn btn-primary btn-full" onclick="handleRegister()">CRÉER MON COMPTE</button>
      <div class="modal-switch">
        Déjà un compte ? <a onclick="switchAuthMode('login')">Se connecter</a>
      </div>
    `;
  } else if (authMode === 'forgot') {
    title.textContent = 'MOT DE PASSE';
    subtitle.textContent = 'Réinitialisez votre accès';

    body.innerHTML = `
      <p style="color:var(--gray-400);font-size:0.85rem;margin-bottom:24px">Entrez l'adresse email liée à votre compte. Vous recevrez un lien de réinitialisation.</p>
      <div class="form-group">
        <label class="form-label">Adresse Email</label>
        <input class="form-input" type="email" id="forgot-email" placeholder="vous@exemple.com">
      </div>
      <button class="btn btn-primary btn-full" onclick="handleForgot()">ENVOYER LE LIEN</button>
      <div class="modal-switch">
        <a onclick="switchAuthMode('login')">← Retour à la connexion</a>
      </div>
    `;
  }
}

function handleLogin() {
  const id = document.getElementById('login-id').value.trim();
  const pass = document.getElementById('login-pass').value;

  let valid = true;
  document.querySelectorAll('.form-error').forEach(e => e.classList.remove('visible'));

  if (!id) {
    document.getElementById('login-id-err').textContent = 'Veuillez entrer un identifiant';
    document.getElementById('login-id-err').classList.add('visible');
    valid = false;
  }
  if (!pass) {
    document.getElementById('login-pass-err').textContent = 'Veuillez entrer un mot de passe';
    document.getElementById('login-pass-err').classList.add('visible');
    valid = false;
  }
  if (!valid) return;

  const user = Auth.loginUser(id, pass);
  if (!user) {
    document.getElementById('login-pass-err').textContent = 'Identifiants incorrects';
    document.getElementById('login-pass-err').classList.add('visible');
    return;
  }

  Auth.setCurrentUser(user);
  closeModal();
  notify('success', 'Connexion réussie', `Bienvenue, ${user.username}${user.badge ? ' ' + user.badge : ''} !`);
}

function handleRegister() {
  const username = document.getElementById('reg-username').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const pass = document.getElementById('reg-pass').value;
  const pass2 = document.getElementById('reg-pass2').value;
  const gender = document.getElementById('reg-gender').value;
  const terms = document.getElementById('reg-terms').checked;

  let valid = true;
  document.querySelectorAll('.form-error').forEach(e => e.classList.remove('visible'));

  if (username.length < 3 || username.length > 20) {
    document.getElementById('reg-username-err').textContent = '3 à 20 caractères requis';
    document.getElementById('reg-username-err').classList.add('visible');
    valid = false;
  } else if (Auth.isUsernameTaken(username)) {
    document.getElementById('reg-username-err').textContent = 'Ce pseudo est déjà pris';
    document.getElementById('reg-username-err').classList.add('visible');
    valid = false;
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    document.getElementById('reg-email-err').textContent = 'Email invalide';
    document.getElementById('reg-email-err').classList.add('visible');
    valid = false;
  } else if (Auth.isEmailTaken(email)) {
    document.getElementById('reg-email-err').textContent = 'Email déjà utilisé';
    document.getElementById('reg-email-err').classList.add('visible');
    valid = false;
  }

  if (pass.length < 8) {
    document.getElementById('reg-pass-err').textContent = 'Minimum 8 caractères';
    document.getElementById('reg-pass-err').classList.add('visible');
    valid = false;
  }
  if (pass !== pass2) {
    document.getElementById('reg-pass2-err').textContent = 'Les mots de passe ne correspondent pas';
    document.getElementById('reg-pass2-err').classList.add('visible');
    valid = false;
  }
  if (!terms) {
    document.getElementById('reg-terms-err').textContent = 'Veuillez accepter les conditions';
    document.getElementById('reg-terms-err').classList.add('visible');
    valid = false;
  }

  if (!valid) return;

  const user = Auth.createUser({ username, email, password: pass, gender });
  Auth.setCurrentUser(user);
  closeModal();
  sendWelcomeEmail(user);
  notify('success', 'Compte créé !', `Bienvenue ${user.username}${user.badge ? ' ' + user.badge : ''} !`);
}

function handleForgot() {
  const email = document.getElementById('forgot-email').value.trim();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    notify('error', 'Email invalide', 'Veuillez entrer une adresse email valide');
    return;
  }
  closeModal();
  notify('info', 'Email envoyé', 'Si ce compte existe, un email de réinitialisation a été envoyé');
}

// ── PROFILE PAGE ──────────────────────────────────────────────
let profileTab = 'settings';

function renderProfile() {
  const user = Auth.getCurrentUser();
  if (!user) { showPage('home'); openModal('login'); return; }

  const container = document.getElementById('page-profile');
  if (!container) return;

  container.innerHTML = `
    <div class="profile-hero" style="padding-top: calc(var(--nav-h) + 32px)">
      <div class="container">
        <div style="display:flex;align-items:flex-start;gap:24px;flex-wrap:wrap">
          <div class="profile-avatar-wrap">
            <div class="profile-avatar" id="profile-avatar-display">
              ${user.avatar ? `<img src="${user.avatar}" alt="avatar" style="width:100%;height:100%;object-fit:cover">` : user.avatarInitial}
            </div>
            <label class="profile-avatar-upload" title="Changer l'avatar">
              <input type="file" accept="image/*" style="display:none" onchange="handleAvatarUpload(event)">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M1 10v2h2l7-7-2-2-7 7zm11.3-8.3a1 1 0 0 0 0-1.4L11 .7a1 1 0 0 0-1.4 0L8.3 2l2 2 1-1z"/></svg>
            </label>
          </div>
          <div class="profile-info">
            <div class="profile-name">${user.username} ${user.badge ? `<span class="profile-badge">${user.badge}</span>` : ''}</div>
            <div class="profile-joined">Membre depuis ${new Date(user.joinedAt).toLocaleDateString('fr-FR', { year: 'numeric', month: 'long' })}</div>
            ${user.bio ? `<p style="margin-top:8px;color:var(--gray-400);font-size:0.85rem;max-width:400px">${user.bio}</p>` : ''}
          </div>
        </div>
      </div>
      <div class="profile-nav container" style="padding:0">
        <div class="container" style="display:flex;gap:0;overflow-x:auto">
          <div class="profile-nav-tab ${profileTab==='settings'?'active':''}" onclick="switchProfileTab('settings')">Paramètres</div>
          <div class="profile-nav-tab ${profileTab==='accounts'?'active':''}" onclick="switchProfileTab('accounts')">Comptes liés</div>
          <div class="profile-nav-tab ${profileTab==='security'?'active':''}" onclick="switchProfileTab('security')">Sécurité</div>
        </div>
      </div>
    </div>

    <div id="profile-tab-content" class="section" style="padding-top:48px">
      <div class="container" style="max-width:680px">
        ${renderProfileTab(profileTab, user)}
      </div>
    </div>
  `;
}

function switchProfileTab(tab) {
  const user = Auth.getCurrentUser();
  if (!user) return;
  profileTab = tab;

  document.querySelectorAll('.profile-nav-tab').forEach(t => {
    t.classList.toggle('active', t.textContent.toLowerCase().includes(tab.substring(0,4)));
  });

  const content = document.getElementById('profile-tab-content');
  if (content) {
    content.innerHTML = `
      <div class="container" style="max-width:680px;animation:fadeIn 0.3s ease">
        ${renderProfileTab(tab, user)}
      </div>
    `;
  }
}

function renderProfileTab(tab, user) {
  if (tab === 'settings') {
    return `
      <h3 style="margin-bottom:32px">INFORMATIONS DU PROFIL</h3>
      <div class="form-group">
        <label class="form-label">Pseudonyme</label>
        <input class="form-input" type="text" id="edit-username" value="${user.username}" maxlength="20">
      </div>
      <div class="form-group">
        <label class="form-label">Bio</label>
        <textarea class="form-input" id="edit-bio" rows="3" placeholder="Présentez-vous..." style="resize:vertical">${user.bio || ''}</textarea>
      </div>
      <div class="form-group">
        <label class="form-label">Genre</label>
        <select class="form-input form-select" id="edit-gender">
          <option value="" ${!user.gender?'selected':''}>Non renseigné</option>
          <option value="homme" ${user.gender==='homme'?'selected':''}>Homme</option>
          <option value="femme" ${user.gender==='femme'?'selected':''}>Femme</option>
          <option value="autre" ${user.gender==='autre'?'selected':''}>Autre / Non-binaire</option>
          <option value="np" ${user.gender==='np'?'selected':''}>Préfère ne pas dire</option>
        </select>
        <div class="form-hint">Non visible publiquement</div>
      </div>
      <div class="form-group">
        <label class="form-label">Email</label>
        <input class="form-input" type="email" value="${user.email}" disabled style="opacity:0.5">
        <div class="form-hint">L'email n'est pas modifiable</div>
      </div>
      <button class="btn btn-primary" onclick="saveProfileSettings()">SAUVEGARDER</button>
    `;
  }

  if (tab === 'accounts') {
    const accounts = user.connectedAccounts || {};
    return `
      <h3 style="margin-bottom:8px">COMPTES LIÉS</h3>
      <p style="color:var(--gray-600);font-size:0.85rem;margin-bottom:32px">Liez vos comptes externes pour synchroniser votre bibliothèque de jeux.</p>

      <div class="connected-account-card platform-steam">
        <div class="connected-account-info">
          <div class="connected-account-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M11.979 0C5.678 0 .511 4.86.022 11.037l6.432 2.658c.545-.371 1.203-.59 1.912-.59.063 0 .125.004.188.006l2.861-4.142V8.91c0-2.495 2.028-4.524 4.524-4.524 2.494 0 4.524 2.031 4.524 4.527s-2.03 4.525-4.524 4.525h-.105l-4.076 2.911c0 .052.004.105.004.159 0 1.875-1.515 3.396-3.39 3.396-1.635 0-3.016-1.173-3.331-2.727L.436 15.27C1.862 20.307 6.486 24 11.979 24c6.627 0 11.999-5.373 11.999-12S18.607 0 11.979 0z"/></svg>
          </div>
          <div>
            <div class="connected-account-name">Steam</div>
            <div class="connected-account-status ${accounts.steam ? 'linked' : 'unlinked'}">
              ${accounts.steam ? '● Connecté — ' + accounts.steam : '○ Non connecté'}
            </div>
          </div>
        </div>
        <button class="connect-btn ${accounts.steam ? 'connected' : ''}" onclick="linkSteam()">
          ${accounts.steam ? 'DÉCONNECTER' : 'CONNECTER'}
        </button>
      </div>

      <div class="connected-account-card platform-playstation">
        <div class="connected-account-info">
          <div class="connected-account-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M9.5 3.5C9.5 3.5 8.5 3.6 8.3 4.4v14.1l2.7 1V6.9c0-.5.2-.9.6-.9.5 0 .7.5.7 1V17.7l2.6-1.1V4.7c0-1.2-1.1-1.7-2.4-1.7L9.5 3.5zM5.2 19.4c-1.8.5-3.3-.1-3.3-1.4 0-1.2 1.4-2.5 3.3-3v-2c-2.5.5-5.2 2-5.2 5 0 2.9 3 4.4 5.2 3.7v-2.3zm12.3-2.8c1.8.6 3.3 1.4 3.3 2.8 0 1.4-1.4 2.3-3.3 1.7v2.1c2.3.7 5.5-.4 5.5-3.7 0-2.9-2.7-4.3-5.5-5.1v2.2z"/></svg>
          </div>
          <div>
            <div class="connected-account-name">PlayStation Network</div>
            <div class="connected-account-status ${accounts.playstation ? 'linked' : 'unlinked'}">
              ${accounts.playstation ? '● Connecté — ' + accounts.playstation : '○ Non connecté'}
            </div>
          </div>
        </div>
        <button class="connect-btn ${accounts.playstation ? 'connected' : ''}" onclick="linkPlaystation()">
          ${accounts.playstation ? 'DÉCONNECTER' : 'CONNECTER'}
        </button>
      </div>

      <div class="connected-account-card platform-discord">
        <div class="connected-account-info">
          <div class="connected-account-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z"/></svg>
          </div>
          <div>
            <div class="connected-account-name">Discord</div>
            <div class="connected-account-status ${accounts.discord ? 'linked' : 'unlinked'}">
              ${accounts.discord ? '● Connecté — ' + accounts.discord : '○ Non connecté'}
            </div>
          </div>
        </div>
        <button class="connect-btn ${accounts.discord ? 'connected' : ''}" onclick="linkDiscord()">
          ${accounts.discord ? 'DÉCONNECTER' : 'CONNECTER'}
        </button>
      </div>

      <div style="margin-top:24px;padding:20px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:2px">
        <p style="font-family:var(--font-mono);font-size:0.6rem;color:var(--gray-600);letter-spacing:0.08em;line-height:1.7">
          ⚠️ La liaison des comptes utilise les protocoles OAuth officiels de chaque plateforme. 
          En production, vous seriez redirigé vers la page d'autorisation officielle de Steam / PlayStation / Discord. 
          Vos identifiants ne transitent jamais par nos serveurs.
        </p>
      </div>
    `;
  }

  if (tab === 'security') {
    return `
      <h3 style="margin-bottom:32px">SÉCURITÉ</h3>
      <div class="form-group">
        <label class="form-label">Mot de passe actuel</label>
        <input class="form-input" type="password" id="sec-current" placeholder="••••••••">
      </div>
      <div class="form-group">
        <label class="form-label">Nouveau mot de passe</label>
        <input class="form-input" type="password" id="sec-new" placeholder="Minimum 8 caractères">
      </div>
      <div class="form-group">
        <label class="form-label">Confirmer le nouveau mot de passe</label>
        <input class="form-input" type="password" id="sec-new2" placeholder="Répétez le nouveau mot de passe">
        <div class="form-error" id="sec-err">Erreur de vérification</div>
      </div>
      <button class="btn btn-primary" onclick="changePassword()">MODIFIER LE MOT DE PASSE</button>

      <div class="divider" style="margin:40px 0"></div>

      <h3 style="margin-bottom:16px">DANGER ZONE</h3>
      <button class="btn" style="border:1px solid rgba(255,80,80,0.3);color:#ff5050;background:rgba(255,80,80,0.05)" onclick="Auth.logout()">SE DÉCONNECTER</button>
    `;
  }

  return '';
}

function saveProfileSettings() {
  const user = Auth.getCurrentUser();
  if (!user) return;
  const username = document.getElementById('edit-username').value.trim();
  const bio = document.getElementById('edit-bio').value.trim();
  const gender = document.getElementById('edit-gender').value;

  if (username.length < 3) { notify('error', 'Erreur', 'Pseudo trop court'); return; }
  if (Auth.isUsernameTaken(username, user.id)) { notify('error', 'Pseudo pris', 'Ce pseudo est déjà utilisé'); return; }

  Auth.updateUser(user.id, { username, bio, gender, avatarInitial: username[0].toUpperCase() });
  notify('success', 'Profil mis à jour', 'Vos modifications ont été sauvegardées');
  renderProfile();
}

function changePassword() {
  const user = Auth.getCurrentUser();
  const current = document.getElementById('sec-current').value;
  const newPass = document.getElementById('sec-new').value;
  const newPass2 = document.getElementById('sec-new2').value;
  const errEl = document.getElementById('sec-err');

  errEl.classList.remove('visible');

  if (user.passwordHash !== btoa(current)) {
    errEl.textContent = 'Mot de passe actuel incorrect';
    errEl.classList.add('visible');
    return;
  }
  if (newPass.length < 8) {
    errEl.textContent = 'Nouveau mot de passe trop court';
    errEl.classList.add('visible');
    return;
  }
  if (newPass !== newPass2) {
    errEl.textContent = 'Les mots de passe ne correspondent pas';
    errEl.classList.add('visible');
    return;
  }

  Auth.updateUser(user.id, { passwordHash: btoa(newPass) });
  notify('success', 'Mot de passe modifié', 'Votre mot de passe a été mis à jour');
  document.getElementById('sec-current').value = '';
  document.getElementById('sec-new').value = '';
  document.getElementById('sec-new2').value = '';
}

function handleAvatarUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) { notify('error', 'Fichier invalide', 'Veuillez sélectionner une image'); return; }
  if (file.size > 5 * 1024 * 1024) { notify('error', 'Fichier trop lourd', 'Maximum 5MB'); return; }

  const reader = new FileReader();
  reader.onload = e => {
    const user = Auth.getCurrentUser();
    if (!user) return;
    Auth.updateUser(user.id, { avatar: e.target.result });
    const display = document.getElementById('profile-avatar-display');
    if (display) display.innerHTML = `<img src="${e.target.result}" alt="avatar" style="width:100%;height:100%;object-fit:cover">`;
    updateAuthUI();
    notify('success', 'Avatar mis à jour', 'Votre photo de profil a changé');
  };
  reader.readAsDataURL(file);
}

// ── PLATFORM LINKING ──────────────────────────────────────────
function linkSteam() {
  const user = Auth.getCurrentUser();
  if (!user) return;

  const accounts = user.connectedAccounts || {};
  if (accounts.steam) {
    if (confirm('Déconnecter votre compte Steam ?')) {
      accounts.steam = null;
      Auth.updateUser(user.id, { connectedAccounts: accounts });
      notify('info', 'Steam déconnecté', 'Votre compte Steam a été délié');
      switchProfileTab('accounts');
    }
    return;
  }

  // Open Steam OAuth popup (in production this would be the real OAuth flow)
  const w = 600, h = 700;
  const left = (screen.width - w) / 2;
  const top = (screen.height - h) / 2;
  const popup = window.open(
    'https://store.steampowered.com/openid/login?openid.ns=http%3A%2F%2Fspecs.openid.net%2Fauth%2F2.0&openid.mode=checkid_setup&openid.return_to=https%3A%2F%2Fgeeklearngames.com%2Fauth%2Fsteam&openid.realm=https%3A%2F%2Fgeeklearngames.com&openid.identity=http%3A%2F%2Fspecs.openid.net%2Fauth%2F2.0%2Fidentifier_select&openid.claimed_id=http%3A%2F%2Fspecs.openid.net%2Fauth%2F2.0%2Fidentifier_select',
    'steam_oauth',
    `width=${w},height=${h},left=${left},top=${top},toolbar=no,menubar=no`
  );

  // Simulate successful link for demo (in prod, callback would set this)
  notify('info', 'Steam OAuth', 'Fenêtre de connexion Steam ouverte (OAuth réel en production)');
  setTimeout(() => {
    accounts.steam = 'DemoUser#' + Math.random().toString(36).slice(2,8).toUpperCase();
    Auth.updateUser(user.id, { connectedAccounts: accounts });
    switchProfileTab('accounts');
    notify('success', 'Steam lié', 'Votre compte Steam a été connecté');
  }, 3000);
}

function linkPlaystation() {
  const user = Auth.getCurrentUser();
  if (!user) return;

  const accounts = user.connectedAccounts || {};
  if (accounts.playstation) {
    if (confirm('Déconnecter votre compte PlayStation Network ?')) {
      accounts.playstation = null;
      Auth.updateUser(user.id, { connectedAccounts: accounts });
      notify('info', 'PSN déconnecté', 'Votre compte PlayStation a été délié');
      switchProfileTab('accounts');
    }
    return;
  }

  const w = 600, h = 700;
  const left = (screen.width - w) / 2;
  const top = (screen.height - h) / 2;
  window.open(
    'https://ca.account.sony.com/api/v1/oauth/authorize?response_type=code&client_id=0a00000003000100&redirect_uri=https%3A%2F%2Fgeeklearngames.com%2Fauth%2Fpsn&scope=openid+email+profile',
    'psn_oauth',
    `width=${w},height=${h},left=${left},top=${top},toolbar=no,menubar=no`
  );

  notify('info', 'PlayStation OAuth', 'Fenêtre de connexion PlayStation ouverte (OAuth réel en production)');
  setTimeout(() => {
    accounts.playstation = 'PSN_' + Math.random().toString(36).slice(2,8).toUpperCase();
    Auth.updateUser(user.id, { connectedAccounts: accounts });
    switchProfileTab('accounts');
    notify('success', 'PSN lié', 'Votre compte PlayStation a été connecté');
  }, 3000);
}

function linkDiscord() {
  const user = Auth.getCurrentUser();
  if (!user) return;

  const accounts = user.connectedAccounts || {};
  if (accounts.discord) {
    if (confirm('Déconnecter votre compte Discord ?')) {
      accounts.discord = null;
      Auth.updateUser(user.id, { connectedAccounts: accounts });
      notify('info', 'Discord déconnecté', 'Votre compte Discord a été délié');
      switchProfileTab('accounts');
    }
    return;
  }

  const clientId = 'VOTRE_CLIENT_ID_DISCORD';
  const redirectUri = encodeURIComponent('https://geeklearngames.com/auth/discord');
  const w = 500, h = 700;
  const left = (screen.width - w) / 2;
  const top = (screen.height - h) / 2;
  window.open(
    `https://discord.com/api/oauth2/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=identify+email`,
    'discord_oauth',
    `width=${w},height=${h},left=${left},top=${top},toolbar=no,menubar=no`
  );

  notify('info', 'Discord OAuth', 'Fenêtre de connexion Discord ouverte (OAuth réel en production)');
  setTimeout(() => {
    accounts.discord = 'User#' + Math.floor(1000 + Math.random() * 9000);
    Auth.updateUser(user.id, { connectedAccounts: accounts });
    switchProfileTab('accounts');
    notify('success', 'Discord lié', 'Votre compte Discord a été connecté');
  }, 3000);
}

// ── LIBRARY PAGE ──────────────────────────────────────────────
function renderLibrary() {
  const user = Auth.getCurrentUser();
  if (!user) { showPage('home'); openModal('login'); return; }

  const container = document.getElementById('page-library');
  if (!container) return;

  const libraryGames = GAMES_DB.filter(g => user.library.includes(g.id));

  container.innerHTML = `
    <div style="padding-top:calc(var(--nav-h) + 32px);min-height:100vh">
      <div class="container" style="padding-top:48px">
        <div style="margin-bottom:48px">
          <div class="section-label">📚 BIBLIOTHÈQUE</div>
          <h2 style="margin-top:8px">MES JEUX</h2>
          <p style="color:var(--gray-600);font-size:0.85rem;margin-top:8px">${libraryGames.length} jeu${libraryGames.length !== 1 ? 'x' : ''} dans votre collection</p>
        </div>

        ${libraryGames.length > 0 ? `
          <div class="library-grid">
            ${libraryGames.map(game => `
              <div class="library-game-card" onclick="showPage('game-detail','${game.id}')">
                <div class="library-poster placeholder">
                  <span style="font-family:var(--font-display);font-size:1.8rem;color:rgba(255,255,255,0.15)">${game.posterLetter}</span>
                </div>
                <div class="library-game-title">${game.title}</div>
              </div>
            `).join('')}
          </div>
        ` : `
          <div style="text-align:center;padding:80px 20px">
            <div style="font-family:var(--font-display);font-size:4rem;color:rgba(255,255,255,0.05);margin-bottom:24px">VIDE</div>
            <p style="color:var(--gray-600);font-size:0.85rem;margin-bottom:24px">Votre bibliothèque est vide. Achetez des jeux ou liez votre compte Steam.</p>
            <button class="btn btn-outline" onclick="showPage('games')">DÉCOUVRIR LES JEUX</button>
          </div>
        `}
      </div>
    </div>
  `;
}

// ── FORUM POSTS ───────────────────────────────────────────────
const FORUM_POSTS = [
  { id: 1, title: "Fan Art — Backrooms: Liminal (dessin au fusain)", author: "ArtByMara", date: "Il y a 2 jours", category: "Fan Art", tags: ["Fan Art", "Backrooms", "Dessin"], img: null, excerpt: "Voici mon interprétation du niveau 0 des Backrooms, réalisée au fusain sur papier kraft." },
  { id: 2, title: "Discussion — La fin de Soul Redemption expliquée", author: "NightOwlGamer", date: "Il y a 4 jours", category: "Discussion", tags: ["Discussion", "Soul Redemption", "Théorie"], img: null, excerpt: "Je pense avoir compris tous les indices cachés dans la cinématique finale. Analysons ensemble..." },
  { id: 3, title: "Cosplay — The Mother's Eyes (Charlotte)", author: "CosplayKitsune", date: "Il y a 1 semaine", category: "Cosplay", tags: ["Cosplay", "The Mother's Eyes"], img: null, excerpt: "Premier cosplay d'un jeu GEEKLEARN Games ! Voici Charlotte avec ses yeux qui ne regardent nulle part..." },
  { id: 4, title: "Fan Fiction — Trick or Treat: What if you said neither?", author: "StoryTeller99", date: "Il y a 2 semaines", category: "Fan Fiction", tags: ["Fan Fiction", "Trick or Treat"], img: null, excerpt: "Et si on n'avait ni donné ni refusé ? Une exploration de la troisième voie que le jeu ne propose pas..." },
];

function renderForum() {
  const container = document.getElementById('forum-posts-grid');
  if (!container) return;

  const filter = document.querySelector('.forum-category.active')?.dataset.cat || '';
  const posts = filter ? FORUM_POSTS.filter(p => p.category === filter) : FORUM_POSTS;

  container.innerHTML = posts.map(post => `
    <div class="post-card">
      <div class="post-image" style="background:var(--gray-800);display:flex;align-items:center;justify-content:center">
        <span style="font-family:var(--font-display);font-size:3rem;color:rgba(255,255,255,0.06)">${post.tags[0]?.charAt(0) || '?'}</span>
      </div>
      <div class="post-body">
        <div class="post-tags">
          ${post.tags.map(t => `<span class="post-tag">${t}</span>`).join('')}
        </div>
        <div class="post-title">${post.title}</div>
        <p style="font-size:0.8rem;color:var(--gray-600);line-height:1.6">${post.excerpt}</p>
        <div class="post-meta">
          <div class="post-author">
            <div class="post-author-avatar">${post.author[0]}</div>
            <span class="post-author-name">${post.author}</span>
          </div>
          <span class="post-date">${post.date}</span>
        </div>
      </div>
    </div>
  `).join('');
}

// ── NOTIFICATIONS ─────────────────────────────────────────────
function notify(type, title, msg) {
  const icons = { success: '✓', error: '✕', info: 'ℹ' };
  const el = document.createElement('div');
  el.className = `notification ${type}`;
  el.innerHTML = `
    <div class="notif-icon">${icons[type] || '·'}</div>
    <div class="notif-content">
      <div class="notif-title">${title}</div>
      ${msg ? `<div class="notif-msg">${msg}</div>` : ''}
    </div>
  `;
  const container = document.getElementById('notifications');
  if (container) {
    container.appendChild(el);
    setTimeout(() => {
      el.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
      el.style.opacity = '0';
      el.style.transform = 'translateX(20px)';
      setTimeout(() => el.remove(), 300);
    }, 4000);
  }
}

// ── NAVBAR SCROLL ─────────────────────────────────────────────
function initNavbar() {
  const navbar = document.getElementById('navbar');
  let ticking = false;

  window.addEventListener('scroll', () => {
    if (!ticking) {
      requestAnimationFrame(() => {
        navbar.classList.toggle('scrolled', window.scrollY > 60);
        ticking = false;
      });
      ticking = true;
    }
  }, { passive: true });

  // Dropdown
  const wrapper = document.getElementById('user-menu-wrapper');
  const dropdown = document.getElementById('user-dropdown');
  if (wrapper && dropdown) {
    wrapper.addEventListener('click', (e) => {
      e.stopPropagation();
      dropdown.classList.toggle('open');
    });
    document.addEventListener('click', () => dropdown.classList.remove('open'));
  }

  // Mobile menu
  const hamburger = document.getElementById('nav-hamburger');
  const mobileMenu = document.getElementById('mobile-menu');
  if (hamburger && mobileMenu) {
    hamburger.addEventListener('click', () => mobileMenu.classList.toggle('open'));
    document.getElementById('mobile-close')?.addEventListener('click', () => mobileMenu.classList.remove('open'));
  }
}

// ── CAROUSEL DRAG ─────────────────────────────────────────────
function initCarouselDrag() {
  const carousel = document.getElementById('games-carousel');
  if (!carousel) return;

  let isDown = false, startX, scrollLeft;

  carousel.addEventListener('mousedown', e => {
    isDown = true;
    carousel.classList.add('dragging');
    startX = e.pageX - carousel.offsetLeft;
    scrollLeft = carousel.scrollLeft;
  });
  carousel.addEventListener('mouseleave', () => { isDown = false; carousel.classList.remove('dragging'); });
  carousel.addEventListener('mouseup', () => { isDown = false; carousel.classList.remove('dragging'); });
  carousel.addEventListener('mousemove', e => {
    if (!isDown) return;
    e.preventDefault();
    const x = e.pageX - carousel.offsetLeft;
    carousel.scrollLeft = scrollLeft - (x - startX) * 1.5;
  });
}

// ── GAMES VIEW TOGGLE ─────────────────────────────────────────
function initGamesToggle() {
  document.querySelectorAll('.view-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const view = btn.dataset.view;
      const carousel = document.getElementById('games-carousel-wrapper');
      const mosaic = document.getElementById('games-mosaic-wrapper');

      if (view === 'carousel') {
        if (carousel) carousel.style.display = '';
        if (mosaic) mosaic.style.display = 'none';
      } else {
        if (carousel) carousel.style.display = 'none';
        if (mosaic) { mosaic.style.display = ''; document.getElementById('games-mosaic')?.classList.add('visible'); }
      }
    });
  });

  // Search
  const searchInput = document.getElementById('games-search');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      const val = e.target.value;
      if (val) {
        // Switch to mosaic if not already
        document.querySelector('.view-btn[data-view="mosaic"]')?.click();
      }
      renderGamesMosaic(val);
    });
  }
}

// ── FORUM FILTER ──────────────────────────────────────────────
function initForumFilter() {
  document.querySelectorAll('.forum-category').forEach(cat => {
    cat.addEventListener('click', () => {
      document.querySelectorAll('.forum-category').forEach(c => c.classList.remove('active'));
      cat.classList.add('active');
      renderForum();
    });
  });
}

// ── LOADING SCREEN ────────────────────────────────────────────
function initLoadingScreen() {
  const screen = document.getElementById('loading-screen');
  const bar = document.getElementById('loading-progress');
  if (!screen) return;

  let progress = 0;
  const interval = setInterval(() => {
    progress += Math.random() * 25;
    if (progress >= 100) {
      progress = 100;
      clearInterval(interval);
      if (bar) bar.style.width = '100%';
      setTimeout(() => {
        screen.classList.add('hidden');
        initAnimations();
      }, 300);
    }
    if (bar) bar.style.width = progress + '%';
  }, 80);
}

// ── SCROLL ANIMATIONS ─────────────────────────────────────────
function initAnimations() {
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.style.opacity = '1';
        entry.target.style.transform = 'translateY(0)';
      }
    });
  }, { threshold: 0.1 });

  document.querySelectorAll('.animate-in').forEach(el => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(30px)';
    el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
    observer.observe(el);
  });
}

// ── NEWSLETTER ────────────────────────────────────────────────
function handleNewsletter(e) {
  if (e) e.preventDefault();
  const input = document.getElementById('newsletter-email');
  if (!input) return;
  const email = input.value.trim();
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!re.test(email)) {
    notify('error', 'Email invalide', 'Veuillez entrer une adresse email valide');
    return;
  }
  input.value = '';
  notify('success', 'Inscription confirmée', `${email} a été ajouté à notre newsletter`);
}

// ── CONTACT FORM ──────────────────────────────────────────────
function handleContactForm() {
  const name = document.getElementById('contact-name')?.value?.trim();
  const email = document.getElementById('contact-email')?.value?.trim();
  const subject = document.getElementById('contact-subject')?.value?.trim();
  const msg = document.getElementById('contact-msg')?.value?.trim();

  if (!name || !email || !msg) {
    notify('error', 'Champs manquants', 'Veuillez remplir tous les champs obligatoires');
    return;
  }

  notify('success', 'Message envoyé', 'Nous vous répondrons dans les plus brefs délais');
  document.getElementById('contact-name').value = '';
  document.getElementById('contact-email').value = '';
  document.getElementById('contact-subject').value = '';
  document.getElementById('contact-msg').value = '';
}

// ── LIGHTBOX ──────────────────────────────────────────────────
function openLightbox(src, isVideo = false) {
  const lightbox = document.getElementById('teaser-lightbox');
  const content = document.getElementById('lightbox-inner');
  if (!lightbox || !content) return;

  if (isVideo) {
    content.innerHTML = `<video class="lightbox-video" controls autoplay><source src="${src}"></video>`;
  } else {
    content.innerHTML = `<img src="${src}" style="width:100%;display:block" alt="Teaser">`;
  }

  lightbox.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeLightbox() {
  const lightbox = document.getElementById('teaser-lightbox');
  if (!lightbox) return;
  lightbox.classList.remove('open');
  document.body.style.overflow = '';
  document.getElementById('lightbox-inner').innerHTML = '';
}

// ── INIT ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initLoadingScreen();
  initNavbar();
  updateAuthUI();
  renderGamesCarousel();
  renderForum();
  initGamesToggle();
  initForumFilter();

  // Close overlays on escape
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      closeModal();
      closeBuyPopup();
      closeLightbox();
    }
  });

  // Close buy popup on overlay click
  document.getElementById('buy-popup-overlay')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) closeBuyPopup();
  });

  // Close modal on overlay click
  document.getElementById('modal-overlay')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) closeModal();
  });

  // Close lightbox on overlay click
  document.getElementById('teaser-lightbox')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) closeLightbox();
  });
});