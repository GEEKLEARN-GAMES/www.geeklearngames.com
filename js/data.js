/* ═══════════════════════════════════════════
   GEEKLEARN GAMES — data.js
   ═══════════════════════════════════════════ */
'use strict';

/* ── PLATFORMS ── */
const PLATS = {
  steam:  {name:'Steam',           icon:'🎮',bg:'#1b2838',cta:'Buy on Steam'},
  epic:   {name:'Epic Games Store',icon:'⚡',bg:'#202020',cta:'Get on Epic'},
  ps5:    {name:'PlayStation',     icon:'🎯',bg:'#003087',cta:'PlayStation Store'},
  xbox:   {name:'Xbox',            icon:'✦', bg:'#107c10',cta:'Xbox Store'},
  switch: {name:'Nintendo Switch', icon:'🔴',bg:'#e60012',cta:'Nintendo eShop'},
};

/* ── INTERACTIVE FILMS ── */
const FILMS = [
  {
    id:'trick-or-treat', type:'film', cat:'Interactive Film',
    title:'TRICK OR TREAT?',
    tagline:'One night. Two choices. No going back.',
    year:'2022', price:'7.99€', status:'available', statusLabel:'Available',
    glow:'o', tint:'#ff6a00',
    cover:'assets/images/films/trick-or-treat.svg',
    logo:null,
    screenshots:[
      'assets/images/films/trick-or-treat-ss1.svg',
      'assets/images/films/trick-or-treat-ss2.svg',
      'assets/images/films/trick-or-treat-ss3.svg',
      'assets/images/films/trick-or-treat-ss4.svg',
      'assets/images/films/trick-or-treat-ss5.svg',
    ],
    trailer:null, // Set to YouTube URL: 'https://www.youtube.com/embed/XXXX?autoplay=1'
    platforms:['steam','switch'],
    description:[
      'On Halloween night, a seemingly ordinary trick-or-treat evening spirals into a series of moral choices that will determine the fate of an entire neighbourhood. Every door you knock on, every choice you make — it all matters.',
      'TRICK OR TREAT? is GEEKLEARN GAMES\' debut interactive film — a branching narrative experience exploring childhood fear, community, and the fine line between prank and consequence. Available on all major platforms with full interactivity.',
    ],
    features:[
      '12 distinct endings depending on your choices',
      'Full voice cast in French, English and Spanish',
      'Atmospheric Halloween setting hand-crafted over 18 months',
      'Family-friendly horror — recommended ages 12+',
      'Accessible mode with subtitles and audio descriptions',
      'Multiple language support (10 languages)',
    ],
    specs:{
      min:{os:'Windows 10 (64-bit)',cpu:'Intel Core i5-4460 / AMD Ryzen 3 1200',gpu:'NVIDIA GTX 960 / AMD RX 470 (4 GB VRAM)',ram:'8 GB',storage:'15 GB',dx:'DirectX 11'},
      rec:{os:'Windows 11 (64-bit)',cpu:'Intel Core i7-8700K / AMD Ryzen 5 3600',gpu:'NVIDIA GTX 1070 / AMD RX 5700 (8 GB VRAM)',ram:'16 GB',storage:'15 GB',dx:'DirectX 12'},
    },
  },
  {
    id:'a-terrible-wonderful-christmas', type:'film', cat:'Interactive Film',
    title:'A TERRIBLE, WONDERFUL CHRISTMAS',
    tagline:'The holidays are never just what they seem.',
    year:'2022', price:'7.99€', status:'available', statusLabel:'Available',
    glow:'b', tint:'#3a7bd5',
    cover:'assets/images/films/a-terrible-wonderful-christmas.svg',
    logo:null,
    screenshots:[
      'assets/images/films/a-terrible-wonderful-christmas-ss1.svg',
      'assets/images/films/a-terrible-wonderful-christmas-ss2.svg',
      'assets/images/films/a-terrible-wonderful-christmas-ss3.svg',
      'assets/images/films/a-terrible-wonderful-christmas-ss4.svg',
      'assets/images/films/a-terrible-wonderful-christmas-ss5.svg',
    ],
    trailer:null,
    platforms:['steam','switch'],
    description:[
      'Christmas Eve. A family gathering. Old wounds, new secrets, and a blizzard that traps everyone inside. A TERRIBLE, WONDERFUL CHRISTMAS is a bittersweet interactive film about the gap between the holiday we imagine and the one we actually live.',
      'Through shifting perspectives, navigate family tensions, uncover hidden truths, and decide whether reconciliation is worth the cost. A deeply human story with warmth, humour, and ache in equal measure.',
    ],
    features:[
      'Multi-perspective storytelling — play as 4 different family members',
      'Original orchestral score composed exclusively for this title',
      'Branching family drama with over 200 scenes',
      '8 distinct endings based on your choices',
      'Award-winning writing — Best Narrative 2022 (Indie Game Awards)',
    ],
    specs:{
      min:{os:'Windows 10 (64-bit)',cpu:'Intel Core i5-4460 / AMD Ryzen 3 1200',gpu:'NVIDIA GTX 960 / AMD RX 470 (4 GB VRAM)',ram:'8 GB',storage:'12 GB',dx:'DirectX 11'},
      rec:{os:'Windows 11 (64-bit)',cpu:'Intel Core i7-8700K / AMD Ryzen 5 3600',gpu:'NVIDIA GTX 1070 / AMD RX 5700 (8 GB VRAM)',ram:'16 GB',storage:'12 GB',dx:'DirectX 12'},
    },
  },
  {
    id:'easter-my-bunny', type:'film', cat:'Interactive Film',
    title:'EASTER MY BUNNY',
    tagline:'Something in the garden is wrong this year.',
    year:'2023', price:'8.99€', status:'available', statusLabel:'Available',
    glow:'g', tint:'#56ab2f',
    cover:'assets/images/films/easter-my-bunny.svg',
    logo:null,
    screenshots:[
      'assets/images/films/easter-my-bunny-ss1.svg',
      'assets/images/films/easter-my-bunny-ss2.svg',
      'assets/images/films/easter-my-bunny-ss3.svg',
      'assets/images/films/easter-my-bunny-ss4.svg',
      'assets/images/films/easter-my-bunny-ss5.svg',
    ],
    trailer:null,
    platforms:['steam','switch','ps5'],
    description:[
      'Every Easter, the same ritual. The eggs hidden in the same places, the same baskets, the same songs. But this year, your daughter found an egg that wasn\'t supposed to be there — and the bunny that left it isn\'t the one from your childhood.',
      'EASTER MY BUNNY blends cosy Easter traditions with creeping unease — a slow-burn interactive film asking how well you really know your family\'s past. A story about inheritance, myth, and things that return.',
    ],
    features:[
      'Psychological folk horror built on real Easter folklore',
      'Seasonal atmosphere crafted in meticulous detail',
      'Non-linear structure — the same events, seen differently',
      'Original folklore invented exclusively for this title',
      '6 distinct endings, each revealing a different truth',
    ],
    specs:{
      min:{os:'Windows 10 (64-bit)',cpu:'Intel Core i5-6600 / AMD Ryzen 3 1300X',gpu:'NVIDIA GTX 1060 / AMD RX 580 (6 GB VRAM)',ram:'8 GB',storage:'14 GB',dx:'DirectX 11'},
      rec:{os:'Windows 11 (64-bit)',cpu:'Intel Core i7-9700K / AMD Ryzen 5 3600X',gpu:'NVIDIA RTX 2070 / AMD RX 5700 XT (8 GB VRAM)',ram:'16 GB',storage:'14 GB',dx:'DirectX 12'},
    },
  },
  {
    id:'eid-of-light', type:'film', cat:'Interactive Film',
    title:'EID OF LIGHT',
    tagline:'Celebration. Memory. A city that breathes.',
    year:'2024', price:'9.99€', status:'available', statusLabel:'Available',
    glow:'y', tint:'#f7931e',
    cover:'assets/images/films/eid-of-light.svg',
    logo:null,
    screenshots:[
      'assets/images/films/eid-of-light-ss1.svg',
      'assets/images/films/eid-of-light-ss2.svg',
      'assets/images/films/eid-of-light-ss3.svg',
      'assets/images/films/eid-of-light-ss4.svg',
      'assets/images/films/eid-of-light-ss5.svg',
    ],
    trailer:null,
    platforms:['steam','ps5','xbox','switch'],
    description:[
      'The night of Eid al-Fitr in a vibrant North African city. Lights everywhere, the smell of pastries and incense, laughter spilling from every window. You are returning after years abroad — and the city has changed, or perhaps you have.',
      'EID OF LIGHT is our most celebratory and personal interactive film — a love letter to diaspora, to rediscovered heritage, and to the complicated joy of homecoming. Told across a single luminous night.',
    ],
    features:[
      'Cultural celebration narrative set during Eid al-Fitr',
      'Available in Arabic, French, and English with original voice cast',
      'Original music blending traditional and contemporary influences',
      'Non-linear homecoming story across one magical night',
      '10 distinct endings — the most of any title in our catalogue',
    ],
    specs:{
      min:{os:'Windows 10 (64-bit)',cpu:'Intel Core i7-6700K / AMD Ryzen 5 1600',gpu:'NVIDIA GTX 1070 / AMD RX 580 (8 GB VRAM)',ram:'12 GB',storage:'18 GB',dx:'DirectX 11'},
      rec:{os:'Windows 11 (64-bit)',cpu:'Intel Core i9-9900K / AMD Ryzen 7 3700X',gpu:'NVIDIA RTX 2080 / AMD RX 6700 XT (10 GB VRAM)',ram:'16 GB',storage:'18 GB',dx:'DirectX 12'},
    },
  },
];

/* ── VIDEO GAMES ── */
const GAMES = [
  {
    id:'backrooms-liminal', type:'game', cat:'Video Game',
    title:'BACKROOMS: LIMINAL',
    tagline:'You noclipped out of reality. Now find your way back.',
    year:'2023', price:'14.99€', status:'available', statusLabel:'Available',
    glow:'y', tint:'#f5e642',
    cover:'assets/images/games/backrooms-liminal.svg',
    logo:null,
    screenshots:[
      'assets/images/games/backrooms-liminal-ss1.svg',
      'assets/images/games/backrooms-liminal-ss2.svg',
      'assets/images/games/backrooms-liminal-ss3.svg',
      'assets/images/games/backrooms-liminal-ss4.svg',
      'assets/images/games/backrooms-liminal-ss5.svg',
    ],
    trailer:null,
    platforms:['steam','epic'],
    description:[
      'You are in the Backrooms. Endless yellowed corridors, the wet hum of fluorescent lights, the certainty that something else is here with you. BACKROOMS: LIMINAL is a first-person survival horror built on the pure terror of liminal space.',
      'Navigate procedurally assembled levels following the internal logic of the original lore. Resources are scarce, entities are relentless, and the only way forward is deeper in. Every session generates a unique topology — you will never walk the same hallway twice.',
    ],
    features:[
      'Procedurally generated levels — no two runs are the same',
      'Entity AI with persistent memory across levels',
      'Audio-driven immersion — wear headphones',
      'Solo + co-op mode (up to 2 players)',
      'No checkpoints mode for hardcore players',
      'Community level editor with Steam Workshop support',
    ],
    specs:{
      min:{os:'Windows 10 (64-bit)',cpu:'Intel Core i5-8400 / AMD Ryzen 5 2600',gpu:'NVIDIA GTX 1060 / AMD RX 580 (6 GB VRAM)',ram:'8 GB',storage:'10 GB',dx:'DirectX 11'},
      rec:{os:'Windows 11 (64-bit)',cpu:'Intel Core i7-9700K / AMD Ryzen 7 3700X',gpu:'NVIDIA RTX 2070 Super / AMD RX 6700 XT (8 GB VRAM)',ram:'16 GB',storage:'10 GB',dx:'DirectX 12'},
    },
  },
  {
    id:'soul-redemption', type:'game', cat:'Video Game',
    title:'SOUL REDEMPTION',
    tagline:'Die. Learn. Rise. Redeem.',
    year:'2023', price:'19.99€', status:'available', statusLabel:'Available',
    glow:'p', tint:'#8b44ff',
    cover:'assets/images/games/soul-redemption.svg',
    logo:null,
    screenshots:[
      'assets/images/games/soul-redemption-ss1.svg',
      'assets/images/games/soul-redemption-ss2.svg',
      'assets/images/games/soul-redemption-ss3.svg',
      'assets/images/games/soul-redemption-ss4.svg',
      'assets/images/games/soul-redemption-ss5.svg',
    ],
    trailer:null,
    platforms:['steam','ps5','xbox','switch'],
    description:[
      'SOUL REDEMPTION is an action-roguelite in which you play a condemned soul fighting through seven chambers of a purgatory that adapts to your sins. Every run ends in death — but death is the teacher, and you carry forward its lessons.',
      'A deep combat system rooted in parry timing and elemental soul abilities, layered over procedurally ordered chambers and a permadeath narrative that branches based on how you die. The story only makes sense after many deaths.',
    ],
    features:[
      'Parry-based combat with satisfying depth and skill ceiling',
      'Permadeath narrative — your death choices shape the lore',
      '7 chamber types, each with unique rules and aesthetics',
      '60+ soul abilities to discover and combine',
      'Procedural lore fragments revealed across multiple runs',
      'New Game+ mode overhauls the entire experience',
    ],
    specs:{
      min:{os:'Windows 10 (64-bit)',cpu:'Intel Core i5-8600K / AMD Ryzen 5 3600',gpu:'NVIDIA GTX 1070 / AMD RX 5700 (8 GB VRAM)',ram:'8 GB',storage:'12 GB',dx:'DirectX 11'},
      rec:{os:'Windows 11 (64-bit)',cpu:'Intel Core i9-9900K / AMD Ryzen 7 5800X',gpu:'NVIDIA RTX 3070 / AMD RX 6800 XT (8 GB VRAM)',ram:'16 GB',storage:'12 GB',dx:'DirectX 12'},
    },
  },
  {
    id:'soul-redemption-frenzy-fest', type:'game', cat:'Video Game',
    title:'SOUL REDEMPTION: FRENZY FEST',
    tagline:'The festival of excess. The chambers run red.',
    year:'2024', price:'14.99€', status:'available', statusLabel:'Available',
    glow:'r', tint:'#ff3a3a',
    cover:'assets/images/games/soul-redemption-frenzy-fest.svg',
    logo:null,
    screenshots:[
      'assets/images/games/soul-redemption-frenzy-fest-ss1.svg',
      'assets/images/games/soul-redemption-frenzy-fest-ss2.svg',
      'assets/images/games/soul-redemption-frenzy-fest-ss3.svg',
      'assets/images/games/soul-redemption-frenzy-fest-ss4.svg',
      'assets/images/games/soul-redemption-frenzy-fest-ss5.svg',
    ],
    trailer:null,
    platforms:['steam','ps5','xbox','switch'],
    description:[
      'FRENZY FEST is a standalone expansion to Soul Redemption set during the Chamber\'s one annual festival — when the rules break down and chaos reigns. New enemies, new biomes, new narrative paths, and an entirely new endgame.',
      'The combat system has been overhauled with combo multipliers and crowd mechanics. For the first time, up to 4 players can descend together. The festival lasts three in-game nights. What happens on the third is something we will not spoil.',
    ],
    features:[
      'Standalone — Soul Redemption not required to play',
      'Multiplayer co-op up to 4 players (online + local split-screen)',
      'New combo system with crowd multipliers',
      '3-night festival structure with escalating chaos',
      'Secret fourth night unlock for completionists',
      'Cross-save support with the original Soul Redemption',
    ],
    specs:{
      min:{os:'Windows 10 (64-bit)',cpu:'Intel Core i7-8700K / AMD Ryzen 5 3600X',gpu:'NVIDIA GTX 1070 Ti / AMD RX 5700 (8 GB VRAM)',ram:'12 GB',storage:'15 GB',dx:'DirectX 11'},
      rec:{os:'Windows 11 (64-bit)',cpu:'Intel Core i9-10900K / AMD Ryzen 9 5900X',gpu:'NVIDIA RTX 3080 / AMD RX 6800 XT (10 GB VRAM)',ram:'16 GB',storage:'15 GB',dx:'DirectX 12'},
    },
  },
  {
    id:'hush', type:'game', cat:'Video Game',
    title:'HUSH!',
    tagline:'You must not make a sound.',
    year:'2024', price:'12.99€', status:'available', statusLabel:'Available',
    glow:'c', tint:'#00d4ff',
    cover:'assets/images/games/hush.svg',
    logo:null,
    screenshots:[
      'assets/images/games/hush-ss1.svg',
      'assets/images/games/hush-ss2.svg',
      'assets/images/games/hush-ss3.svg',
      'assets/images/games/hush-ss4.svg',
      'assets/images/games/hush-ss5.svg',
    ],
    trailer:null,
    platforms:['steam','ps5','xbox','switch'],
    description:[
      'HUSH! is a stealth puzzle game in which silence is the only rule. Something lurks that cannot see — only hear. Every footstep, every knocked object, every breath at the wrong moment is a death sentence.',
      'Across 40 handcrafted levels set in a creaking Victorian manor, a flooded library, and a brutalist apartment block at night, HUSH! builds a language of tension and silence that is unlike anything else in the genre.',
    ],
    features:[
      '40 handcrafted levels across 4 distinct environments',
      'Real microphone support — your voice can trigger enemies (optional)',
      'No music — entirely procedural sound design',
      'Accessibility mode with visual audio cues for deaf players',
      'Global speedrun leaderboards with ghost replay',
      'Level editor (PC only) with Steam Workshop sharing',
    ],
    specs:{
      min:{os:'Windows 10 (64-bit)',cpu:'Intel Core i5-8400 / AMD Ryzen 5 2600X',gpu:'NVIDIA GTX 1060 / AMD RX 580 (6 GB VRAM)',ram:'8 GB',storage:'8 GB',dx:'DirectX 11'},
      rec:{os:'Windows 11 (64-bit)',cpu:'Intel Core i7-10700K / AMD Ryzen 7 5800X',gpu:'NVIDIA RTX 2080 / AMD RX 6700 XT (8 GB VRAM)',ram:'16 GB',storage:'8 GB',dx:'DirectX 12'},
    },
  },
];

const ALL_WORKS = [...FILMS, ...GAMES];

/* ── TEAM ── */
/* Add a real photo path in `photo` when available (e.g. 'assets/images/team/evan.jpg').
   Leave photo:'' to display an initials placeholder.
   level 0 = founder / root node · level 1 = branch members */
const TEAM = [
  {
    id:    'founder',
    name:  'EVAN',
    role:  'CEO · Founder · Art Director',
    quote: '"Every world we build starts with a single honest question: what do we want people to feel?"',
    photo: '',
    level: 0,
  },
  {
    id:    'member-1',
    name:  'ALEX',
    role:  'Game Designer · Narrative Lead',
    quote: '"Good game design is invisible — you only notice it when it\'s gone."',
    photo: '',
    level: 1,
  },
  {
    id:    'member-2',
    name:  'MAYA',
    role:  'Lead Programmer',
    quote: '"Code is the architecture of imagination. Get it wrong and the whole world collapses."',
    photo: '',
    level: 1,
  },
  {
    id:    'member-3',
    name:  'JORDAN',
    role:  'Composer · Sound Designer',
    quote: '"Silence is the most powerful sound in a game. I spend half my time making sure it lands right."',
    photo: '',
    level: 1,
  },
];

/* ── AWARDS ── */
/* Add entries here as the studio receives recognition.
   photo: path to a conference photo ('assets/images/awards/iga-2022.jpg')
   Leave photo:'' to show a placeholder card.
   Example entry:
   {
     name:  'Best Narrative',
     event: 'Indie Game Awards 2022',
     game:  'A Terrible, Wonderful Christmas',
     photo: '',
     year:  '2022',
   },
*/
const AWARDS = [];

/* ── TRANSLATIONS ── */
/* Each key maps to a language code.
   Add/edit translations here to update all text on the site. */
const I18N = {
  fr:{
    langName:'Français',
    nav:['Accueil','Nos Œuvres','Boutique','À Propos','Contact'],
    navSub:'Studio Indé',
    heroEye:'Studio Indépendant · Fondé en 2022 · France',
    heroDesc:'Nous sommes GEEKLEARN GAMES — un studio convaincu que la narration interactive peut être plus qu\'un divertissement. Elle peut changer votre façon de voir le monde.',
    heroBtn1:'Explorer nos œuvres',heroBtn2:'Travailler avec nous',
    showcaseBtn:'Découvrir toutes les œuvres →',
    catFilmsLabel:'Catégorie 01',catFilmsTitle:'FILMS\nINTERACTIFS',
    catGamesLabel:'Catégorie 02',catGamesTitle:'JEUX\nVIDÉO',
    seeFBtn:'Voir tous les films →',seeGBtn:'Voir tous les jeux →',
    studioQuote:'"Nous ne développons pas des jeux.<br>Nous construisons des mondes qui<br><em>laissent des traces.</em>"',
    studioBody1:'GEEKLEARN GAMES est un studio indépendant dédié à la création d\'expériences interactives qui font réfléchir, qui émeuvent, et qui restent en vous longtemps après que l\'écran s\'est éteint.',
    studioBody2:'Des films d\'horreur d\'Halloween aux célébrations de l\'Aïd, des couloirs liminaux aux combats pour l\'âme — nous explorons le spectre complet de l\'expérience humaine par le jeu.',
    ctaTitle:'CONSTRUISONS\nENSEMBLE',ctaDesc:'Éditeurs, distributeurs, collaborateurs — nous sommes ouverts aux partenariats qui ont du sens. Si vous croyez aux expériences qui comptent, parlons-en.',
    ctaBtn1:'Nous contacter',ctaBtn2:'Voir nos œuvres',
    worksTitle:'NOS\nŒUVRES',worksDesc:'Huit titres. Quatre films interactifs. Quatre jeux vidéo. Chacun d\'eux un monde forgé avec intention.',
    tabAll:'Tout',tabFilms:'Films Interactifs',tabGames:'Jeux Vidéo',
    contactTitle:'CONTACT',contactDesc:'Éditeurs, collaborateurs, presse ou joueurs — chaque message reçoit une réponse sous 48h.',
    formTitle:'Envoyez-nous un message',
    lblFirst:'Prénom',lblLast:'Nom',lblEmail:'Adresse email *',lblCompany:'Société / Studio',lblSubject:'Objet *',lblMessage:'Message *',lblLink:'Lien portfolio / dossier de presse',
    subjectOpts:['Partenariat éditeur / Distribution','Collaboration créative','Presse & Médias','Candidature','Support joueur','Licence & Droits','Autre'],
    formSubmit:'Envoyer le message',formLegal:'En envoyant ce formulaire, vous acceptez que vos données soient utilisées pour traiter votre demande. Réponse sous 24–48h (jours ouvrés).',
    buyNow:'Acheter',buyModal:'Disponible sur',
    detailBack:'← Retour aux œuvres',trailerBtn:'▶ Trailer',
    aboutHead:'À propos',featuresHead:'Caractéristiques clés',ssHead:'Captures d\'écran',specsHead:'Configuration requise',infoHead:'Informations',platHead:'Plateformes',
    specMin:'Minimum',specRec:'Recommandée',
    specOs:'Système d\'exploitation',specCpu:'Processeur',specGpu:'Carte graphique',specRam:'Mémoire vive',specStorage:'Stockage',specDx:'DirectX',
    statTitles:'Titres',statFilms:'Films Interactifs',statGames:'Jeux Vidéo',statPlatforms:'Plateformes',
    infoType:'Type',infoGenre:'Genre',infoDuration:'Durée',infoYear:'Année',infoStudio:'Studio',infoStatus:'Statut',infoPrice:'Prix',
    contactInfoTitle:'Contact direct',
    footerDesc:'Studio de développement de jeux vidéo indépendant. Nous créons des expériences qui enseignent, émeuvent et hantent l\'esprit. Fondé en 2022, France.',
    footerNavTitle:'Navigation',footerWorksTitle:'Nos Œuvres',footerFollowTitle:'Suivez-nous',
    copyright:'Tous droits réservés',
  },
  en:{
    langName:'English',
    nav:['Home','Our Works','Shop','About Us','Contact'],
    navSub:'Indie Studio',
    heroEye:'Independent Studio · Est. 2022 · France',
    heroDesc:'We are GEEKLEARN GAMES — a studio built on the belief that interactive storytelling can be more than entertainment. It can change the way you see the world.',
    heroBtn1:'Explore Our Works',heroBtn2:'Work With Us',
    showcaseBtn:'Discover all works →',
    catFilmsLabel:'Category 01',catFilmsTitle:'INTERACTIVE\nFILMS',
    catGamesLabel:'Category 02',catGamesTitle:'VIDEO\nGAMES',
    seeFBtn:'See all films →',seeGBtn:'See all games →',
    studioQuote:'"We don\'t develop games.<br>We build worlds that<br><em>leave marks.</em>"',
    studioBody1:'GEEKLEARN GAMES is an independent studio dedicated to creating interactive experiences that make you think, move you deeply, and stay with you long after the screen goes dark.',
    studioBody2:'From Halloween horror films to Eid celebrations, from liminal dread to soul-driven combat — we explore the full spectrum of human experience through play.',
    ctaTitle:'LET\'S BUILD\nTOGETHER',ctaDesc:'Publishers, distributors, collaborators — we are open to meaningful partnerships. If you believe in experiences that matter, let\'s talk.',
    ctaBtn1:'Get In Touch',ctaBtn2:'Explore Our Works',
    worksTitle:'OUR\nWORKS',worksDesc:'Eight titles. Four interactive films. Four video games. Every one of them a world built with intention.',
    tabAll:'All Works',tabFilms:'Interactive Films',tabGames:'Video Games',
    contactTitle:'CONTACT',contactDesc:'Publishers, collaborators, press, or players — every message gets a response within 48 hours.',
    formTitle:'Send us a message',
    lblFirst:'First name',lblLast:'Last name',lblEmail:'Email address *',lblCompany:'Company / Studio',lblSubject:'Subject *',lblMessage:'Message *',lblLink:'Portfolio / press kit link',
    subjectOpts:['Publisher / Distribution Partnership','Creative Collaboration','Press & Media','Job Application','Player Support','Licensing & Rights','Other'],
    formSubmit:'Send message',formLegal:'By submitting this form you agree to your data being used solely to process your inquiry. Response within 24–48 hours on business days.',
    buyNow:'Buy Now',buyModal:'Available on',
    detailBack:'← Back to Works',trailerBtn:'▶ Trailer',
    aboutHead:'About',featuresHead:'Key Features',ssHead:'Screenshots',specsHead:'System Requirements',infoHead:'Info',platHead:'Platforms',
    specMin:'Minimum',specRec:'Recommended',
    specOs:'OS',specCpu:'Processor',specGpu:'Graphics',specRam:'Memory',specStorage:'Storage',specDx:'DirectX',
    statTitles:'Titles',statFilms:'Interactive Films',statGames:'Video Games',statPlatforms:'Platforms',
    infoType:'Type',infoGenre:'Genre',infoDuration:'Duration',infoYear:'Year',infoStudio:'Studio',infoStatus:'Status',infoPrice:'Price',
    contactInfoTitle:'Direct contact',
    footerDesc:'An independent game studio creating interactive experiences that teach, move, and haunt your mind. Est. 2022, France.',
    footerNavTitle:'Navigate',footerWorksTitle:'Our Works',footerFollowTitle:'Follow Us',
    copyright:'All rights reserved',
  },
  es:{
    langName:'Español',nav:['Inicio','Nuestras Obras','Tienda','Sobre Nosotros','Contacto'],navSub:'Estudio Indie',
    heroEye:'Estudio Independiente · Fund. 2022 · Francia',
    heroDesc:'Somos GEEKLEARN GAMES — un estudio convencido de que la narración interactiva puede ser más que entretenimiento. Puede cambiar la forma en que ves el mundo.',
    heroBtn1:'Explorar Nuestras Obras',heroBtn2:'Trabaja Con Nosotros',
    catFilmsLabel:'Categoría 01',catFilmsTitle:'FILMS\nINTERACTIVOS',catGamesLabel:'Categoría 02',catGamesTitle:'VIDEOJUEGOS',
    seeFBtn:'Ver todos los films →',seeGBtn:'Ver todos los juegos →',
    studioQuote:'"No desarrollamos juegos.<br>Construimos mundos que<br><em>dejan huella.</em>"',
    studioBody1:'GEEKLEARN GAMES es un estudio independiente dedicado a crear experiencias interactivas que hacen pensar, conmueven y permanecen mucho después de que la pantalla se apague.',
    studioBody2:'Desde películas de terror de Halloween hasta celebraciones de Eid, desde espacios liminales hasta el combate del alma — exploramos el espectro completo de la experiencia humana a través del juego.',
    ctaTitle:'CONSTRUYAMOS\nJUNTOS',ctaDesc:'Editores, distribuidores y colaboradores — estamos abiertos a asociaciones significativas.',
    ctaBtn1:'Contactar',ctaBtn2:'Ver Nuestras Obras',
    worksTitle:'NUESTRAS\nOBRAS',worksDesc:'Ocho títulos. Cuatro películas interactivas. Cuatro videojuegos.',
    tabAll:'Todo',tabFilms:'Films Interactivos',tabGames:'Videojuegos',
    contactTitle:'CONTACTO',contactDesc:'Editoras, colaboradores, prensa o jugadores — respondemos en 48 horas.',
    formTitle:'Envíanos un mensaje',
    lblFirst:'Nombre',lblLast:'Apellido',lblEmail:'Correo electrónico *',lblCompany:'Empresa / Estudio',lblSubject:'Asunto *',lblMessage:'Mensaje *',lblLink:'Enlace portfolio / dossier de prensa',
    subjectOpts:['Asociación editorial / Distribución','Colaboración creativa','Prensa y Medios','Solicitud de empleo','Soporte al jugador','Licencias y Derechos','Otro'],
    formSubmit:'Enviar mensaje',formLegal:'Al enviar este formulario, acepta que sus datos se utilicen únicamente para procesar su consulta.',
    buyNow:'Comprar',buyModal:'Disponible en',detailBack:'← Volver',trailerBtn:'▶ Tráiler',
    aboutHead:'Acerca de',featuresHead:'Características clave',ssHead:'Capturas de pantalla',specsHead:'Requisitos del sistema',infoHead:'Información',platHead:'Plataformas',
    specMin:'Mínimo',specRec:'Recomendado',specOs:'Sistema operativo',specCpu:'Procesador',specGpu:'Tarjeta gráfica',specRam:'Memoria',specStorage:'Almacenamiento',specDx:'DirectX',
    statTitles:'Títulos',statFilms:'Films Interactivos',statGames:'Videojuegos',statPlatforms:'Plataformas',
    infoType:'Tipo',infoGenre:'Género',infoDuration:'Duración',infoYear:'Año',infoStudio:'Estudio',infoStatus:'Estado',infoPrice:'Precio',
    contactInfoTitle:'Contacto directo',
    footerDesc:'Estudio de videojuegos independiente. Creamos experiencias interactivas que enseñan, emocionan y persiguen tu mente.',
    footerNavTitle:'Navegación',footerWorksTitle:'Nuestras Obras',footerFollowTitle:'Síguenos',copyright:'Todos los derechos reservados',
  },
  de:{
    langName:'Deutsch',nav:['Startseite','Unsere Werke','Shop','Über Uns','Kontakt'],navSub:'Indie Studio',
    heroEye:'Unabhängiges Studio · Gegr. 2022 · Frankreich',
    heroDesc:'Wir sind GEEKLEARN GAMES — ein Studio, das überzeugt ist, dass interaktives Geschichtenerzählen mehr sein kann als Unterhaltung. Es kann die Art, wie Sie die Welt sehen, verändern.',
    heroBtn1:'Unsere Werke entdecken',heroBtn2:'Mit uns arbeiten',
    catFilmsLabel:'Kategorie 01',catFilmsTitle:'INTERAKTIVE\nFILME',catGamesLabel:'Kategorie 02',catGamesTitle:'VIDEO\nSPIELE',
    seeFBtn:'Alle Filme →',seeGBtn:'Alle Spiele →',
    studioQuote:'"Wir entwickeln keine Spiele.<br>Wir bauen Welten,<br><em>die Spuren hinterlassen.</em>"',
    studioBody1:'GEEKLEARN GAMES ist ein unabhängiges Studio, das interaktive Erlebnisse schafft, die zum Nachdenken anregen, bewegen und noch lange nach dem Ausschalten des Bildschirms nachwirken.',
    studioBody2:'Von Halloween-Horrorfilmen bis zu Eid-Feiern, von liminalen Räumen bis zu Seelenkämpfen — wir erkunden das gesamte Spektrum menschlicher Erfahrung durch das Spiel.',
    ctaTitle:'GEMEINSAM\nBAUEN',ctaDesc:'Verlage, Distributoren und Mitarbeiter — wir sind offen für bedeutungsvolle Partnerschaften.',
    ctaBtn1:'Kontakt aufnehmen',ctaBtn2:'Werke entdecken',
    worksTitle:'UNSERE\nWERKE',worksDesc:'Acht Titel. Vier interaktive Filme. Vier Videospiele.',
    tabAll:'Alle',tabFilms:'Interaktive Filme',tabGames:'Videospiele',
    contactTitle:'KONTAKT',contactDesc:'Verlage, Partner, Presse oder Spieler — jede Nachricht wird innerhalb von 48 Stunden beantwortet.',
    formTitle:'Schreib uns',
    lblFirst:'Vorname',lblLast:'Nachname',lblEmail:'E-Mail-Adresse *',lblCompany:'Unternehmen / Studio',lblSubject:'Betreff *',lblMessage:'Nachricht *',lblLink:'Portfolio / Pressemappe Link',
    subjectOpts:['Verlagspartnerschaft / Vertrieb','Kreative Zusammenarbeit','Presse & Medien','Bewerbung','Spieler-Support','Lizenzierung & Rechte','Sonstiges'],
    formSubmit:'Nachricht senden',formLegal:'Mit dem Absenden dieses Formulars stimmen Sie zu, dass Ihre Daten nur zur Bearbeitung Ihrer Anfrage verwendet werden.',
    buyNow:'Kaufen',buyModal:'Verfügbar auf',detailBack:'← Zurück',trailerBtn:'▶ Trailer',
    aboutHead:'Über das Spiel',featuresHead:'Hauptmerkmale',ssHead:'Screenshots',specsHead:'Systemanforderungen',infoHead:'Informationen',platHead:'Plattformen',
    specMin:'Minimum',specRec:'Empfohlen',specOs:'Betriebssystem',specCpu:'Prozessor',specGpu:'Grafik',specRam:'Arbeitsspeicher',specStorage:'Speicher',specDx:'DirectX',
    statTitles:'Titel',statFilms:'Interaktive Filme',statGames:'Videospiele',statPlatforms:'Plattformen',
    infoType:'Typ',infoGenre:'Genre',infoDuration:'Dauer',infoYear:'Jahr',infoStudio:'Studio',infoStatus:'Status',infoPrice:'Preis',
    contactInfoTitle:'Direktkontakt',
    footerDesc:'Ein unabhängiges Spielestudio, das interaktive Erlebnisse schafft, die lehren, bewegen und verfolgen.',
    footerNavTitle:'Navigation',footerWorksTitle:'Unsere Werke',footerFollowTitle:'Folge uns',copyright:'Alle Rechte vorbehalten',
  },
  ar:{
    langName:'العربية',nav:['الرئيسية','أعمالنا','المتجر','من نحن','تواصل معنا'],navSub:'استوديو مستقل',
    heroEye:'استوديو مستقل · تأسس 2022 · فرنسا',
    heroDesc:'نحن GEEKLEARN GAMES — استوديو مبني على الإيمان بأن سرد القصص التفاعلي يمكن أن يكون أكثر من مجرد ترفيه. يمكنه تغيير طريقة رؤيتك للعالم.',
    heroBtn1:'استكشف أعمالنا',heroBtn2:'اعمل معنا',
    catFilmsLabel:'الفئة 01',catFilmsTitle:'أفلام\nتفاعلية',catGamesLabel:'الفئة 02',catGamesTitle:'ألعاب\nفيديو',
    seeFBtn:'عرض جميع الأفلام ←',seeGBtn:'عرض جميع الألعاب ←',
    studioQuote:'"نحن لا نطور ألعاباً.<br>نبني عوالم<br><em>تترك أثراً.</em>"',
    studioBody1:'GEEKLEARN GAMES استوديو مستقل مكرس لإنشاء تجارب تفاعلية تجعلك تفكر وتحرك مشاعرك وتبقى معك طويلاً بعد إطفاء الشاشة.',
    studioBody2:'من أفلام الرعب في الهالوين إلى احتفالات العيد، ومن الفضاءات الوسيطة إلى معارك الروح — نستكشف الطيف الكامل للتجربة الإنسانية من خلال اللعب.',
    ctaTitle:'لنبنِ\nمعاً',ctaDesc:'الناشرون والموزعون والمتعاونون — نحن منفتحون على الشراكات ذات المعنى.',
    ctaBtn1:'تواصل معنا',ctaBtn2:'استكشف أعمالنا',
    worksTitle:'أعمالنا',worksDesc:'ثمانية عناوين. أربعة أفلام تفاعلية. أربعة ألعاب فيديو.',
    tabAll:'الكل',tabFilms:'أفلام تفاعلية',tabGames:'ألعاب فيديو',
    contactTitle:'تواصل',contactDesc:'الناشرون أو المتعاونون أو الصحافة أو اللاعبون — كل رسالة تحصل على رد في غضون 48 ساعة.',
    formTitle:'أرسل لنا رسالة',
    lblFirst:'الاسم الأول',lblLast:'اسم العائلة',lblEmail:'البريد الإلكتروني *',lblCompany:'الشركة / الاستوديو',lblSubject:'الموضوع *',lblMessage:'الرسالة *',lblLink:'رابط المحفظة / حقيبة الصحافة',
    subjectOpts:['شراكة ناشر / توزيع','تعاون إبداعي','صحافة وإعلام','طلب وظيفة','دعم اللاعبين','الترخيص والحقوق','أخرى'],
    formSubmit:'إرسال الرسالة',formLegal:'بإرسال هذا النموذج توافق على استخدام بياناتك لمعالجة طلبك فقط.',
    buyNow:'شراء',buyModal:'متاح على',detailBack:'→ العودة إلى الأعمال',trailerBtn:'▶ إعلان',
    aboutHead:'حول',featuresHead:'الميزات الرئيسية',ssHead:'لقطات الشاشة',specsHead:'متطلبات النظام',infoHead:'معلومات',platHead:'المنصات',
    specMin:'الحد الأدنى',specRec:'الموصى به',specOs:'نظام التشغيل',specCpu:'المعالج',specGpu:'كرت الشاشة',specRam:'الذاكرة',specStorage:'التخزين',specDx:'DirectX',
    statTitles:'العناوين',statFilms:'أفلام تفاعلية',statGames:'ألعاب فيديو',statPlatforms:'منصات',
    infoType:'النوع',infoGenre:'الصنف',infoDuration:'المدة',infoYear:'السنة',infoStudio:'الاستوديو',infoStatus:'الحالة',infoPrice:'السعر',
    contactInfoTitle:'الاتصال المباشر',
    footerDesc:'استوديو ألعاب فيديو مستقل يصنع تجارب تفاعلية تعلم وتحرك وتسكن الذاكرة.',
    footerNavTitle:'التنقل',footerWorksTitle:'أعمالنا',footerFollowTitle:'تابعنا',copyright:'جميع الحقوق محفوظة',
  },
  zh:{
    langName:'中文',nav:['首页','我们的作品','商店','关于我们','联系我们'],navSub:'独立游戏工作室',
    heroEye:'独立工作室 · 创立于2022年 · 法国',
    heroDesc:'我们是GEEKLEARN GAMES——一个坚信互动叙事不仅仅是娱乐的工作室。它可以改变您看待世界的方式。',
    heroBtn1:'探索我们的作品',heroBtn2:'与我们合作',
    catFilmsLabel:'类别 01',catFilmsTitle:'互动\n电影',catGamesLabel:'类别 02',catGamesTitle:'电子\n游戏',
    seeFBtn:'查看所有电影 →',seeGBtn:'查看所有游戏 →',
    studioQuote:'"我们不开发游戏。<br>我们构建<br><em>留下痕迹的世界。</em>"',
    studioBody1:'GEEKLEARN GAMES是一家独立工作室，致力于创造互动体验——让您思考、深受感动，并在屏幕熄灭后很久仍萦绕心头。',
    studioBody2:'从万圣节恐怖电影到开斋节庆典，从灵界空间到灵魂战斗——我们通过游戏探索人类体验的全部光谱。',
    ctaTitle:'共同\n创造',ctaDesc:'发行商、分销商、合作者——我们对有意义的合作持开放态度。',
    ctaBtn1:'联系我们',ctaBtn2:'探索作品',
    worksTitle:'我们的\n作品',worksDesc:'八部作品。四部互动电影。四款电子游戏。每一部都是精心构建的世界。',
    tabAll:'全部',tabFilms:'互动电影',tabGames:'电子游戏',
    contactTitle:'联系',contactDesc:'发行商、合作者、媒体或玩家——每条消息都将在48小时内得到回复。',
    formTitle:'给我们留言',
    lblFirst:'名字',lblLast:'姓氏',lblEmail:'电子邮箱 *',lblCompany:'公司/工作室',lblSubject:'主题 *',lblMessage:'消息 *',lblLink:'作品集/新闻资料包链接',
    subjectOpts:['发行商合作/发行','创意合作','媒体公关','求职申请','玩家支持','许可与版权','其他'],
    formSubmit:'发送消息',formLegal:'提交此表格即表示您同意您的数据仅用于处理您的查询。',
    buyNow:'购买',buyModal:'可在以下平台购买',detailBack:'← 返回作品',trailerBtn:'▶ 预告片',
    aboutHead:'关于',featuresHead:'主要特色',ssHead:'截图',specsHead:'系统需求',infoHead:'信息',platHead:'平台',
    specMin:'最低配置',specRec:'推荐配置',specOs:'操作系统',specCpu:'处理器',specGpu:'显卡',specRam:'内存',specStorage:'存储',specDx:'DirectX',
    statTitles:'作品数量',statFilms:'互动电影',statGames:'电子游戏',statPlatforms:'平台',
    infoType:'类型',infoGenre:'游戏类型',infoDuration:'时长',infoYear:'年份',infoStudio:'工作室',infoStatus:'状态',infoPrice:'价格',
    contactInfoTitle:'直接联系',
    footerDesc:'独立游戏工作室，创造教育、感动并萦绕心头的互动体验。2022年创立于法国。',
    footerNavTitle:'导航',footerWorksTitle:'我们的作品',footerFollowTitle:'关注我们',copyright:'版权所有',
  },
  ja:{
    langName:'日本語',nav:['ホーム','作品一覧','ショップ','私たちについて','お問い合わせ'],navSub:'インディースタジオ',
    heroEye:'インディースタジオ · 2022年設立 · フランス',
    heroDesc:'私たちはGEEKLEARN GAMES——インタラクティブなストーリーテリングが娯楽以上のものになれると信じるスタジオです。それは世界の見方を変えることができます。',
    heroBtn1:'作品を見る',heroBtn2:'一緒に働く',
    catFilmsLabel:'カテゴリー01',catFilmsTitle:'インタラクティブ\nフィルム',catGamesLabel:'カテゴリー02',catGamesTitle:'ビデオ\nゲーム',
    seeFBtn:'全フィルムを見る →',seeGBtn:'全ゲームを見る →',
    studioQuote:'"ゲームを開発するのではない。<br>痕跡を残す<br><em>世界を作る。</em>"',
    studioBody1:'GEEKLEARN GAMESは、考えさせ、深く感動させ、画面が消えた後も長く残るインタラクティブ体験を創るインディースタジオです。',
    studioBody2:'ハロウィンホラーフィルムからイード祭りの祝典まで、リミナルな恐怖から魂の戦いまで——私たちは遊びを通じて人間体験の全スペクトルを探求します。',
    ctaTitle:'共に\n作ろう',ctaDesc:'パブリッシャー、ディストリビューター、コラボレーター——意味のある提携を歓迎します。',
    ctaBtn1:'お問い合わせ',ctaBtn2:'作品を見る',
    worksTitle:'私たちの\n作品',worksDesc:'8タイトル。4つのインタラクティブフィルム。4つのビデオゲーム。',
    tabAll:'すべて',tabFilms:'インタラクティブフィルム',tabGames:'ビデオゲーム',
    contactTitle:'お問い合わせ',contactDesc:'パブリッシャー、コラボレーター、プレス、プレイヤー——すべてのメッセージに48時間以内に返信します。',
    formTitle:'メッセージを送る',
    lblFirst:'名前',lblLast:'苗字',lblEmail:'メールアドレス *',lblCompany:'会社・スタジオ',lblSubject:'件名 *',lblMessage:'メッセージ *',lblLink:'ポートフォリオ・プレスキットリンク',
    subjectOpts:['パブリッシャーパートナーシップ・流通','クリエイティブコラボレーション','プレス・メディア','求職応募','プレイヤーサポート','ライセンスと権利','その他'],
    formSubmit:'メッセージを送信',formLegal:'このフォームを送信することで、お問い合わせの処理のみにデータが使用されることに同意します。',
    buyNow:'購入する',buyModal:'利用可能なプラットフォーム',detailBack:'← 作品一覧に戻る',trailerBtn:'▶ トレーラー',
    aboutHead:'ゲームについて',featuresHead:'主な特徴',ssHead:'スクリーンショット',specsHead:'動作環境',infoHead:'情報',platHead:'対応プラットフォーム',
    specMin:'最低動作環境',specRec:'推奨動作環境',specOs:'OS',specCpu:'プロセッサー',specGpu:'グラフィックス',specRam:'メモリ',specStorage:'ストレージ',specDx:'DirectX',
    statTitles:'タイトル数',statFilms:'インタラクティブフィルム',statGames:'ビデオゲーム',statPlatforms:'対応プラットフォーム',
    infoType:'タイプ',infoGenre:'ジャンル',infoDuration:'プレイ時間',infoYear:'年',infoStudio:'スタジオ',infoStatus:'ステータス',infoPrice:'価格',
    contactInfoTitle:'直接連絡',
    footerDesc:'インタラクティブ体験を作るインディーゲームスタジオ。2022年フランスにて設立。',
    footerNavTitle:'ナビゲーション',footerWorksTitle:'作品一覧',footerFollowTitle:'フォロー',copyright:'全著作権所有',
  },
  ru:{
    langName:'Русский',nav:['Главная','Наши Работы','Магазин','О нас','Контакт'],navSub:'Инди Студия',
    heroEye:'Независимая студия · Основана в 2022 · Франция',
    heroDesc:'Мы GEEKLEARN GAMES — студия, убеждённая в том, что интерактивное повествование может быть больше, чем развлечение. Оно может изменить то, как вы видите мир.',
    heroBtn1:'Наши Работы',heroBtn2:'Работать с нами',
    catFilmsLabel:'Категория 01',catFilmsTitle:'ИНТЕРАКТИВНЫЕ\nФИЛЬМЫ',catGamesLabel:'Категория 02',catGamesTitle:'ВИДЕО\nИГРЫ',
    seeFBtn:'Все фильмы →',seeGBtn:'Все игры →',
    studioQuote:'"Мы не создаём игры.<br>Мы строим миры,<br><em>которые оставляют след.</em>"',
    studioBody1:'GEEKLEARN GAMES — независимая студия, создающая интерактивные переживания, которые заставляют думать, глубоко волнуют и остаются надолго после того, как экран гаснет.',
    studioBody2:'От хэллоуинских фильмов ужасов до праздника Ид, от лиминальных пространств до поединков душ — мы исследуем весь спектр человеческого опыта через игру.',
    ctaTitle:'СОЗДАДИМ\nВМЕСТЕ',ctaDesc:'Издатели, дистрибьюторы, сотрудники — мы открыты для значимых партнёрств.',
    ctaBtn1:'Связаться',ctaBtn2:'Наши работы',
    worksTitle:'НАШИ\nРАБОТЫ',worksDesc:'Восемь проектов. Четыре интерактивных фильма. Четыре видеоигры.',
    tabAll:'Все',tabFilms:'Интерактивные фильмы',tabGames:'Видеоигры',
    contactTitle:'КОНТАКТ',contactDesc:'Издатели, коллаборации, пресса или игроки — каждое сообщение получает ответ в течение 48 часов.',
    formTitle:'Напишите нам',
    lblFirst:'Имя',lblLast:'Фамилия',lblEmail:'Электронная почта *',lblCompany:'Компания / Студия',lblSubject:'Тема *',lblMessage:'Сообщение *',lblLink:'Ссылка на портфолио / пресс-кит',
    subjectOpts:['Партнёрство с издателем / Дистрибуция','Творческое сотрудничество','Пресса и СМИ','Заявка на работу','Поддержка игроков','Лицензирование и права','Другое'],
    formSubmit:'Отправить сообщение',formLegal:'Отправляя эту форму, вы соглашаетесь на использование ваших данных для обработки запроса.',
    buyNow:'Купить',buyModal:'Доступно на',detailBack:'← Назад к работам',trailerBtn:'▶ Трейлер',
    aboutHead:'Об игре',featuresHead:'Основные особенности',ssHead:'Скриншоты',specsHead:'Системные требования',infoHead:'Информация',platHead:'Платформы',
    specMin:'Минимальные',specRec:'Рекомендуемые',specOs:'ОС',specCpu:'Процессор',specGpu:'Видеокарта',specRam:'Память',specStorage:'Хранилище',specDx:'DirectX',
    statTitles:'Проектов',statFilms:'Интерактивных фильмов',statGames:'Видеоигр',statPlatforms:'Платформ',
    infoType:'Тип',infoGenre:'Жанр',infoDuration:'Продолжительность',infoYear:'Год',infoStudio:'Студия',infoStatus:'Статус',infoPrice:'Цена',
    contactInfoTitle:'Прямой контакт',
    footerDesc:'Независимая игровая студия, создающая интерактивные переживания, которые учат, трогают и преследуют разум.',
    footerNavTitle:'Навигация',footerWorksTitle:'Наши работы',footerFollowTitle:'Следите за нами',copyright:'Все права защищены',
  },
  pl:{
    langName:'Polski',nav:['Strona główna','Nasze Prace','Sklep','O Nas','Kontakt'],navSub:'Studio Indie',
    heroEye:'Niezależne Studio · Założone 2022 · Francja',
    heroDesc:'Jesteśmy GeekLearn Games — studio przekonane, że interaktywne opowiadanie może być czymś więcej niż rozrywką. Może zmienić sposób, w jaki postrzegasz świat.',
    heroBtn1:'Odkryj nasze prace',heroBtn2:'Współpracuj z nami',
    catFilmsLabel:'Kategoria 01',catFilmsTitle:'FILMY\nINTERAKTYWNE',catGamesLabel:'Kategoria 02',catGamesTitle:'GRY\nWIDEO',
    seeFBtn:'Wszystkie filmy →',seeGBtn:'Wszystkie gry →',
    studioQuote:'"Nie tworzymy gier.<br>Budujemy światy,<br><em>które zostawiają ślad.</em>"',
    studioBody1:'GEEKLEARN GAMES to niezależne studio tworzące interaktywne doświadczenia, które skłaniają do refleksji, wzruszają i pozostają z tobą długo po wyłączeniu ekranu.',
    studioBody2:'Od halloweenowych filmów grozy po świętowanie Eid, od przestrzeni liminalnych po walki o duszę — badamy pełne spektrum ludzkiego doświadczenia przez zabawę.',
    ctaTitle:'BUDUJMY\nRAZEM',ctaDesc:'Wydawcy, dystrybutorzy, współpracownicy — jesteśmy otwarci na wartościowe partnerstwa.',
    ctaBtn1:'Skontaktuj się',ctaBtn2:'Nasze prace',
    worksTitle:'NASZE\nPRACE',worksDesc:'Osiem tytułów. Cztery filmy interaktywne. Cztery gry wideo.',
    tabAll:'Wszystko',tabFilms:'Filmy interaktywne',tabGames:'Gry wideo',
    contactTitle:'KONTAKT',contactDesc:'Wydawcy, współpracownicy, prasa lub gracze — każda wiadomość otrzymuje odpowiedź w ciągu 48 godzin.',
    formTitle:'Wyślij nam wiadomość',
    lblFirst:'Imię',lblLast:'Nazwisko',lblEmail:'Adres e-mail *',lblCompany:'Firma / Studio',lblSubject:'Temat *',lblMessage:'Wiadomość *',lblLink:'Link do portfolio / press kit',
    subjectOpts:['Partnerstwo z wydawcą / Dystrybucja','Współpraca twórcza','Prasa i media','Aplikacja o pracę','Wsparcie gracza','Licencjonowanie i prawa','Inne'],
    formSubmit:'Wyślij wiadomość',formLegal:'Wysyłając ten formularz, wyrażasz zgodę na przetwarzanie danych w celu obsługi zapytania.',
    buyNow:'Kup',buyModal:'Dostępne na',detailBack:'← Powrót do prac',trailerBtn:'▶ Zwiastun',
    aboutHead:'O tytule',featuresHead:'Kluczowe cechy',ssHead:'Zrzuty ekranu',specsHead:'Wymagania systemowe',infoHead:'Informacje',platHead:'Platformy',
    specMin:'Minimalne',specRec:'Zalecane',specOs:'System operacyjny',specCpu:'Procesor',specGpu:'Karta graficzna',specRam:'Pamięć',specStorage:'Magazyn',specDx:'DirectX',
    statTitles:'Tytułów',statFilms:'Filmy interaktywne',statGames:'Gry wideo',statPlatforms:'Platform',
    infoType:'Typ',infoGenre:'Gatunek',infoDuration:'Czas trwania',infoYear:'Rok',infoStudio:'Studio',infoStatus:'Status',infoPrice:'Cena',
    contactInfoTitle:'Bezpośredni kontakt',
    footerDesc:'Niezależne studio gier tworzące interaktywne doświadczenia, które uczą, wzruszają i prześladują umysł.',
    footerNavTitle:'Nawigacja',footerWorksTitle:'Nasze prace',footerFollowTitle:'Obserwuj nas',copyright:'Wszelkie prawa zastrzeżone',
  },
  it:{
    langName:'Italiano',nav:['Home','Le Nostre Opere','Negozio','Chi Siamo','Contatto'],navSub:'Studio Indie',
    heroEye:'Studio Indipendente · Fondato nel 2022 · Francia',
    heroDesc:'Siamo GEEKLEARN GAMES — uno studio convinto che la narrazione interattiva possa essere più dell\'intrattenimento. Può cambiare il modo in cui vedi il mondo.',
    heroBtn1:'Esplora le Nostre Opere',heroBtn2:'Lavora con Noi',
    catFilmsLabel:'Categoria 01',catFilmsTitle:'FILM\nINTERATTIVI',catGamesLabel:'Categoria 02',catGamesTitle:'VIDEOGIOCHI',
    seeFBtn:'Tutti i film →',seeGBtn:'Tutti i giochi →',
    studioQuote:'"Non sviluppiamo giochi.<br>Costruiamo mondi che<br><em>lasciano il segno.</em>"',
    studioBody1:'GEEKLEARN GAMES è uno studio indipendente dedicato alla creazione di esperienze interattive che fanno riflettere, commuovono e rimangono con te molto dopo che lo schermo si spegne.',
    studioBody2:'Dai film horror di Halloween alle celebrazioni dell\'Eid, dagli spazi liminali ai combattimenti dell\'anima — esploriamo l\'intero spettro dell\'esperienza umana attraverso il gioco.',
    ctaTitle:'COSTRUIAMO\nINSIEME',ctaDesc:'Editori, distributori, collaboratori — siamo aperti a partnership significative.',
    ctaBtn1:'Contattaci',ctaBtn2:'Le nostre opere',
    worksTitle:'LE NOSTRE\nOPERE',worksDesc:'Otto titoli. Quattro film interattivi. Quattro videogiochi.',
    tabAll:'Tutto',tabFilms:'Film Interattivi',tabGames:'Videogiochi',
    contactTitle:'CONTATTO',contactDesc:'Editori, collaboratori, stampa o giocatori — ogni messaggio riceve risposta entro 48 ore.',
    formTitle:'Inviaci un messaggio',
    lblFirst:'Nome',lblLast:'Cognome',lblEmail:'Indirizzo email *',lblCompany:'Azienda / Studio',lblSubject:'Oggetto *',lblMessage:'Messaggio *',lblLink:'Link portfolio / cartella stampa',
    subjectOpts:['Partnership editore / Distribuzione','Collaborazione creativa','Stampa e Media','Candidatura','Supporto giocatore','Licenze e Diritti','Altro'],
    formSubmit:'Invia messaggio',formLegal:'Inviando questo modulo accetti che i tuoi dati vengano utilizzati esclusivamente per elaborare la tua richiesta.',
    buyNow:'Acquista',buyModal:'Disponibile su',detailBack:'← Torna alle opere',trailerBtn:'▶ Trailer',
    aboutHead:'Informazioni',featuresHead:'Caratteristiche principali',ssHead:'Screenshot',specsHead:'Requisiti di sistema',infoHead:'Informazioni',platHead:'Piattaforme',
    specMin:'Minimi',specRec:'Consigliati',specOs:'Sistema operativo',specCpu:'Processore',specGpu:'Scheda grafica',specRam:'Memoria',specStorage:'Archiviazione',specDx:'DirectX',
    statTitles:'Titoli',statFilms:'Film Interattivi',statGames:'Videogiochi',statPlatforms:'Piattaforme',
    infoType:'Tipo',infoGenre:'Genere',infoDuration:'Durata',infoYear:'Anno',infoStudio:'Studio',infoStatus:'Stato',infoPrice:'Prezzo',
    contactInfoTitle:'Contatto diretto',
    footerDesc:'Studio di videogiochi indipendente che crea esperienze interattive che insegnano, commuovono e ossessionano la mente.',
    footerNavTitle:'Navigazione',footerWorksTitle:'Le Nostre Opere',footerFollowTitle:'Seguici',copyright:'Tutti i diritti riservati',
  },
};

/* Language gate config */
const LANG_GATE = [
  {code:'fr', flag:'🇫🇷', label:'Français'},
  {code:'en', flag:'🇬🇧', label:'English'},
  {code:'es', flag:'🇪🇸', label:'Español'},
  {code:'de', flag:'🇩🇪', label:'Deutsch'},
  {code:'ar', flag:'🇸🇦', label:'العربية'},
  {code:'zh', flag:'🇨🇳', label:'中文'},
  {code:'ja', flag:'🇯🇵', label:'日本語'},
  {code:'ru', flag:'🇷🇺', label:'Русский'},
  {code:'pl', flag:'🇵🇱', label:'Polski'},
  {code:'it', flag:'🇮🇹', label:'Italiano'},
];

/* ══════════════════════════════════════════════
   GLG PATTERN — COLOR & ANIMATION CONFIGURATION
   ══════════════════════════════════════════════

   To customize the repeating GLG logo pattern on each section,
   use these CSS custom properties inline on the element, or
   override them in a <style> tag:

   PROPERTY                DEFAULT     DESCRIPTION
   ─────────────────────────────────────────────────────────────
   --glg-size              180px       Tile size (logo width)
   --glg-angle             25deg       Rotation of the pattern grid
   --glg-speed             20s         Drift animation duration
   --glg-opacity           .04         Base opacity of the pattern

   CLASSES (cumulative — combine freely):
   ─────────────────────────────────────────────────────────────
   .glg-pattern            Required — enables the pattern
   .glg-pat-subtle         --glg-opacity: .03  (very discreet)
   .glg-pat-visible        --glg-opacity: .08  (stronger)
   .glg-pat-large          bigger tiles (280px)
   .glg-pat-tight          small tiles (110px)
   .glg-pat-fast           10s drift (quick)
   .glg-pat-slow           36s drift (calm)
   .glg-pat-pulse          opacity breathes slowly
   .glg-pat-tint-anim      animated warm-to-cold color tint
   .glg-line-after         1px white line at bottom edge
   .glg-line-before        1px white line at top edge
   .glg-line-both          lines on both edges

   INLINE COLOR TINT:
   ─────────────────────────────────────────────────────────────
   To shift the GLG mark to any hue, add:
     style="--glg-filter: hue-rotate(200deg)"
   on any .glg-pattern element.

   Examples:
     hue-rotate(0deg)    → white (default)
     hue-rotate(45deg)   → warm gold
     hue-rotate(200deg)  → icy blue
     hue-rotate(280deg)  → purple
     brightness(0)       → fully dark (invisible — don't use)
     sepia(1) brightness(1.3) → warm amber

   FULL INLINE EXAMPLE:
   ─────────────────────────────────────────────────────────────
   <div class="glg-pattern glg-pat-visible glg-pat-pulse glg-line-both"
        style="--glg-size:220px; --glg-angle:18deg; --glg-filter:hue-rotate(45deg)">
     ... content ...
   </div>

   ══════════════════════════════════════════════ */
