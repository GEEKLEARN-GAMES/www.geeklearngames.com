/* ═══════════════════════════════════════════
   GEEKLEARN GAMES, data.js
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
const FILMS = [];

/* ── VIDEO GAMES ── */
const GAMES = [
  {
    id:'lumbra', type:'game', cat:'Video Game',
    title:'LUMBRA',
    tagline:'Don’t be afraid of the dark.',
    year:'Q4 2027', price:null, basePrice:null, status:'coming-soon', statusLabel:'Coming Soon',
    platformLabel:'PC', artworks:true,
    i18n:{
      fr:{ tagline:'N’aie pas peur du noir.', description:['Une petite fille s’éveille, seule, dans un monde devenu trop grand pour elle. La nuit s’installe, et quelque chose veille. Quelque chose qui ne voit ni les murs, ni les visages : seulement la lumière. Pour avancer, il faudra pourtant l’apprivoiser. Pour survivre, il faudra apprendre à aimer le noir.','LUMBRA est le premier titre annoncé de GEEKLEARN GAMES : une aventure en noir et blanc développée en France, où chaque plan est composé comme une gravure. Pas de dialogues, pas d’interface superflue, une enfant, l’obscurité, et juste ce qu’il faut de lumière pour continuer.'], features:['Aventure 2D en noir et blanc','Un monde immense, vu à hauteur d’enfant','Une histoire racontée sans un mot','Jouable au clavier ou à la manette'] },
      es:{ tagline:'No temas a la oscuridad.', description:['Una niña despierta, sola, en un mundo que se ha vuelto demasiado grande para ella. Cae la noche y algo vigila : algo que no ve ni los muros ni los rostros: solo la luz. Para avanzar, tendrá que domarla. Para sobrevivir, tendrá que aprender a amar la oscuridad.','LUMBRA es el primer título anunciado de GEEKLEARN GAMES: una aventura en blanco y negro desarrollada en Francia, donde cada plano está compuesto como un grabado. Sin diálogos, sin interfaz superflua, una niña, la oscuridad y justo la luz necesaria para continuar.'], features:['Aventura 2D en blanco y negro','Un mundo inmenso, visto a la altura de una niña','Una historia contada sin una sola palabra','Jugable con teclado o mando'] },
      de:{ tagline:'Hab keine Angst im Dunkeln.', description:['Ein kleines Mädchen erwacht, allein, in einer Welt, die zu groß für sie geworden ist. Die Nacht bricht herein, und etwas wacht : etwas, das weder Wände noch Gesichter sieht: nur Licht. Um voranzukommen, wird sie es zähmen müssen. Um zu überleben, wird sie lernen müssen, das Dunkel zu lieben.','LUMBRA ist der erste angekündigte Titel von GEEKLEARN GAMES: ein Schwarz-Weiß-Abenteuer, entwickelt in Frankreich, in dem jedes Bild wie ein Stich komponiert ist. Keine Dialoge, kein überflüssiges Interface, ein Kind, die Dunkelheit und gerade genug Licht, um weiterzugehen.'], features:['2D-Abenteuer in Schwarz-Weiß','Eine riesige Welt, gesehen auf Augenhöhe eines Kindes','Eine Geschichte, erzählt ohne ein einziges Wort','Spielbar mit Tastatur oder Controller'] },
      ar:{ tagline:'لا تخف من الظلام.', description:['تستيقظ طفلة صغيرة وحيدة في عالم صار أكبر منها بكثير. يحلّ الليل، وثمة شيء يراقب : شيء لا يرى الجدران ولا الوجوه: يرى الضوء فقط. للتقدم، عليها أن تروّضه. وللنجاة، عليها أن تتعلم حبّ العتمة.','LUMBRA هو أول عنوان معلن من GEEKLEARN GAMES: مغامرة بالأبيض والأسود مطوّرة في فرنسا، كل لقطة فيها مؤلّفة كأنها نقش محفور. لا حوارات ولا واجهة زائدة، طفلة، والظلام، وما يكفي من الضوء للمواصلة.'], features:['مغامرة ثنائية الأبعاد بالأبيض والأسود','عالم شاسع يُرى بعينَي طفلة','قصة تُروى دون كلمة واحدة','قابلة للعب بلوحة المفاتيح أو بيد التحكم'] },
      zh:{ tagline:'别怕黑。', description:['一个小女孩独自醒来，世界对她而言已变得过于庞大。夜幕降临，有什么在暗中守望、它看不见墙壁，也看不见面孔：只看得见光。想要前行，就必须驯服光；想要活下去，就必须学会爱上黑暗。','LUMBRA 是 GEEKLEARN GAMES 公布的首部作品：一场在法国开发的黑白冒险，每一帧都如版画般构图。没有对白，没有多余的界面、一个孩子、黑暗，以及恰好够继续前行的光。'], features:['黑白2D冒险','以孩子的视角仰望的辽阔世界','不着一字的叙事','支持键盘或手柄'] },
      ja:{ tagline:'暗闇を、怖がらないで。', description:['小さな少女がひとり、自分には大きくなりすぎた世界で目を覚ます。夜が訪れ、何かが見張っている、壁も顔も見えず、光だけを見るなにかが。前へ進むには、光を手なずけるしかない。生き延びるには、闇を愛することを学ぶしかない。','LUMBRAはGEEKLEARN GAMESが発表した最初のタイトル。フランスで開発されるモノクロのアドベンチャーで、すべての画面が版画のように構図されている。セリフはなく、余計なUIもない、ひとりの子ども、闇、そして進み続けるためのわずかな光だけ。'], features:['白黒の2Dアドベンチャー','子どもの目線で見上げる広大な世界','ひと言も語らずに紡がれる物語','キーボードまたはコントローラーでプレイ可能'] },
      ru:{ tagline:'Не бойся темноты.', description:['Маленькая девочка просыпается одна в мире, который стал для неё слишком большим. Опускается ночь, и что-то наблюдает : что-то, что не видит ни стен, ни лиц: только свет. Чтобы идти вперёд, ей придётся приручить его. Чтобы выжить, научиться любить темноту.','LUMBRA, первый анонсированный проект GEEKLEARN GAMES: чёрно-белое приключение, создаваемое во Франции, где каждый кадр выстроен, как гравюра. Без диалогов, без лишнего интерфейса, ребёнок, темнота и ровно столько света, сколько нужно, чтобы продолжать путь.'], features:['Чёрно-белое 2D-приключение','Огромный мир, увиденный глазами ребёнка','История, рассказанная без единого слова','Играйте на клавиатуре или геймпаде'] },
      pl:{ tagline:'Nie bój się ciemności.', description:['Mała dziewczynka budzi się sama w świecie, który stał się dla niej zbyt wielki. Zapada noc, a coś czuwa : coś, co nie widzi ani ścian, ani twarzy: tylko światło. By iść naprzód, będzie musiała je oswoić. By przetrwać, nauczyć się kochać ciemność.','LUMBRA to pierwszy zapowiedziany tytuł GEEKLEARN GAMES: czarno-biała przygoda tworzona we Francji, w której każdy kadr skomponowano jak rycinę. Bez dialogów, bez zbędnego interfejsu, dziecko, ciemność i akurat tyle światła, by iść dalej.'], features:['Czarno-biała przygodówka 2D','Ogromny świat widziany z wysokości dziecka','Historia opowiedziana bez ani jednego słowa','Gra na klawiaturze lub padzie'] },
      it:{ tagline:'Non avere paura del buio.', description:['Una bambina si sveglia, sola, in un mondo diventato troppo grande per lei. Scende la notte, e qualcosa veglia : qualcosa che non vede né i muri né i volti: soltanto la luce. Per avanzare, dovrà domarla. Per sopravvivere, dovrà imparare ad amare il buio.','LUMBRA è il primo titolo annunciato di GEEKLEARN GAMES: un’avventura in bianco e nero sviluppata in Francia, dove ogni inquadratura è composta come un’incisione. Niente dialoghi, niente interfaccia superflua, una bambina, l’oscurità e appena la luce necessaria per continuare.'], features:['Avventura 2D in bianco e nero','Un mondo immenso, visto all’altezza di una bambina','Una storia raccontata senza una parola','Giocabile con tastiera o controller'] },
    },
    genres:['Adventure','2D','Solo'],
    glow:'c', tint:'#e9e9ee',
    cover:'assets/img/works/games/lumbra.svg',
    logo:null,
    screenshots:[
      'assets/img/works/games/lumbra-art1.svg',
      'assets/img/works/games/lumbra-art2.svg',
      'assets/img/works/games/lumbra-art3.svg',
    ],
    trailer:null,
    platforms:[],
    description:[
      'A little girl wakes up alone in a world that has grown too big for her. Night settles in, and something is watching, something that sees neither walls nor faces: only light. To move forward, she will have to tame it. To survive, she will have to learn to love the dark.',
      'LUMBRA is the first announced title from GEEKLEARN GAMES: a black-and-white adventure developed in France, where every frame is composed like an engraving. No dialogue, no needless interface, a child, the darkness, and just enough light to keep going.',
    ],
    features:[
      'A 2D adventure in black and white',
      'A vast world, seen from a child’s height',
      'A story told without a single word',
      'Playable with keyboard or controller',
    ],
  },
];

const ALL_WORKS = [...FILMS, ...GAMES];

/* ── Per-language currency mapping ── */
const LANG_CURRENCY = {
  fr:'EUR', de:'EUR', it:'EUR', es:'EUR',
  en:'USD', ar:'SAR', zh:'CNY', ja:'JPY', ru:'RUB', pl:'PLN',
};

/* ── TEAM ── */
/* Add a real photo path in `photo` when available (e.g. 'assets/img/team/evan.jpg').
   Leave photo:'' to display an initials placeholder.
   level 0 = founder / root node · level 1 = branch members */
const TEAM = [
  {
    id:       'founder',
    alias:    'GEEKLEARN',    // pseudonyme, affiché en grand sur la photo
    name:     'Evan',         // prénom (vrai nom, affiché sous le pseudo)
    nameLine2:'Preney',       // nom de famille
    role:     'Fondateur · Directeur Artistique',
    roleI18n: {
      fr:'Fondateur · Directeur Artistique', en:'Founder · Art Director',
      es:'Fundador · Director Artístico',    de:'Gründer · Art Director',
      ar:'المؤسس · المدير الفني',            zh:'创始人 · 艺术总监',
      ja:'創設者 · アートディレクター',        ru:'Основатель · Арт-директор',
      pl:'Założyciel · Dyrektor Artystyczny', it:'Fondatore · Direttore Artistico',
    },
    quote:    '« Chaque monde que nous bâtissons commence par une seule question honnête : que voulons-nous faire ressentir ? »',
    quoteI18n:{
      en:'"Every world we build starts with a single honest question: what do we want people to feel?"',
      es:'"Cada mundo que construimos empieza con una sola pregunta honesta: ¿qué queremos hacer sentir?"',
      de:'"Jede Welt, die wir bauen, beginnt mit einer einzigen ehrlichen Frage: Was sollen die Menschen fühlen?"',
      it:'"Ogni mondo che costruiamo nasce da una sola domanda onesta: cosa vogliamo far provare?"',
      ar:'"كل عالم نبنيه يبدأ بسؤال صادق واحد: ماذا نريد أن نجعل الناس يشعرون؟"',
      zh:'"我们构筑的每个世界，都始于一个真诚的问题：我们想让人感受到什么？"',
      ja:'"私たちが築くすべての世界は、たった一つの正直な問いから始まる、人に何を感じさせたいか。"',
      ru:'"Каждый мир, который мы создаём, начинается с одного честного вопроса: что мы хотим, чтобы человек почувствовал?"',
      pl:'"Każdy świat, który tworzymy, zaczyna się od jednego szczerego pytania: co chcemy, by ludzie poczuli?"',
    },
    photo:    'assets/img/team/evan-preney.webp',
    year:     '2026',
    level:    0,
  },
];

/* ── AWARDS ── */
/* Add entries here as the studio receives recognition.
   photo: path to a conference photo ('assets/img/awards/iga-2026.jpg')
   Leave photo:'' to show a placeholder card.
   Example entry:
   {
     name:  'Best Narrative',
     event: 'Indie Game Awards 2026',
     game:  'A Terrible, Wonderful Christmas',
     photo: '',
     year:  '2026',
   },
*/
const AWARDS = [];

/* ── TROPHIES / SUCCÈS (style PlayStation) ───────────────────────────────
   Définitions PUBLIQUES, écrites par le studio (versionnées avec le site).
   Les DÉBLOCAGES réels sont stockés en base (table user_achievements) et
   accordés par le jeu en production. Tiers : platinum > gold > silver > bronze.
   La PLATINE se débloque automatiquement quand tous les autres trophées d'une
   œuvre sont obtenus (calcul côté client). `hidden:true` masque l'intitulé tant
   que le trophée n'est pas débloqué. i18n : en (base) + fr ; sinon fallback en. */
const TROPHIES = {};

/* ── TAGS / GENRES (pour les fiches "magazine") ──────────────────────────
   Vocabulaire i18n réutilisable + association par œuvre. */
const TAG_LABELS = {
  narrative:  {fr:'Narratif',en:'Narrative',es:'Narrativo',de:'Erzählerisch',it:'Narrativo',ar:'سردي',zh:'叙事',ja:'ナラティブ',ru:'Нарративный',pl:'Narracyjny'},
  horror:     {fr:'Horreur',en:'Horror',es:'Terror',de:'Horror',it:'Horror',ar:'رعب',zh:'恐怖',ja:'ホラー',ru:'Хоррор',pl:'Horror'},
  choices:    {fr:'Choix multiples',en:'Branching',es:'Decisiones',de:'Verzweigt',it:'Scelte multiple',ar:'خيارات متعددة',zh:'多分支',ja:'マルチエンド',ru:'Ветвление',pl:'Wybory'},
  atmospheric:{fr:'Atmosphérique',en:'Atmospheric',es:'Atmosférico',de:'Atmosphärisch',it:'Atmosferico',ar:'أجواء غامرة',zh:'氛围',ja:'アトモスフェリック',ru:'Атмосферный',pl:'Klimatyczny'},
  stealth:    {fr:'Infiltration',en:'Stealth',es:'Sigilo',de:'Stealth',it:'Stealth',ar:'تسلل',zh:'潜行',ja:'ステルス',ru:'Стелс',pl:'Skradanka'},
  thriller:   {fr:'Thriller',en:'Thriller',es:'Thriller',de:'Thriller',it:'Thriller',ar:'إثارة',zh:'惊悚',ja:'スリラー',ru:'Триллер',pl:'Thriller'},
  family:     {fr:'Familial',en:'Family',es:'Familiar',de:'Familienfreundlich',it:'Per famiglie',ar:'عائلي',zh:'家庭',ja:'ファミリー',ru:'Семейный',pl:'Rodzinny'},
  drama:      {fr:'Drame',en:'Drama',es:'Drama',de:'Drama',it:'Dramma',ar:'دراما',zh:'剧情',ja:'ドラマ',ru:'Драма',pl:'Dramat'},
  folk:       {fr:'Horreur folk',en:'Folk horror',es:'Terror folk',de:'Folk-Horror',it:'Folk horror',ar:'رعب فولكلوري',zh:'民俗恐怖',ja:'フォークホラー',ru:'Фолк-хоррор',pl:'Folk horror'},
  celebration:{fr:'Célébration',en:'Celebration',es:'Celebración',de:'Fest',it:'Celebrazione',ar:'احتفال',zh:'节庆',ja:'祝祭',ru:'Праздник',pl:'Święto'},
  emotional:  {fr:'Émotion',en:'Emotional',es:'Emotivo',de:'Emotional',it:'Emozionale',ar:'عاطفي',zh:'情感',ja:'エモーショナル',ru:'Эмоциональный',pl:'Wzruszający'},
  liminal:    {fr:'Liminal',en:'Liminal',es:'Liminal',de:'Liminal',it:'Liminale',ar:'حدّي',zh:'阈限',ja:'リミナル',ru:'Лиминальный',pl:'Liminalny'},
  survival:   {fr:'Survie',en:'Survival',es:'Supervivencia',de:'Survival',it:'Sopravvivenza',ar:'بقاء',zh:'生存',ja:'サバイバル',ru:'Выживание',pl:'Survival'},
  action:     {fr:'Action',en:'Action',es:'Acción',de:'Action',it:'Azione',ar:'أكشن',zh:'动作',ja:'アクション',ru:'Экшен',pl:'Akcja'},
  rpg:        {fr:'RPG',en:'RPG',es:'RPG',de:'RPG',it:'RPG',ar:'آر بي جي',zh:'角色扮演',ja:'RPG',ru:'RPG',pl:'RPG'},
  adventure:  {fr:'Aventure',en:'Adventure',es:'Aventura',de:'Abenteuer',it:'Avventura',ar:'مغامرة',zh:'冒险',ja:'アドベンチャー',ru:'Приключение',pl:'Przygodowa'},
  monochrome: {fr:'Noir & blanc',en:'Black & white',es:'Blanco y negro',de:'Schwarz-Weiß',it:'Bianco e nero',ar:'أبيض وأسود',zh:'黑白',ja:'モノクロ',ru:'Чёрно-белая',pl:'Czarno-biała'},
  soulslike:  {fr:'Souls-like',en:'Souls-like',es:'Souls-like',de:'Souls-like',it:'Souls-like',ar:'سولز لايك',zh:'魂类',ja:'ソウルライク',ru:'Souls-like',pl:'Souls-like'},
};
const WORK_TAGS = {
  'lumbra':['adventure','monochrome','atmospheric','narrative'],
};

/* ── Fonctionnalités par œuvre (badges buybox : manette / cloud / sous-titres).
   `default` s'applique quand une œuvre n'a pas d'entrée dédiée, surcharger
   au besoin : 'mon-jeu': { controller:true, cloud:false, subs:true } ── */
const WORK_CAPS = {
  default: { controller:true, cloud:true, subs:true },
  'lumbra': { controller:true, cloud:false, subs:false },
};

/* ── JOURNAL DES MISES À JOUR (fiches, style Steam) ─────────────────────
   Par œuvre : liste d'actualités { date:'AAAA-MM-JJ', tag:'update|devlog|announce',
   title:{10 langues}, body:{10 langues} }. Une œuvre sans entrée = section
   masquée proprement. Ajouter une news ici = elle apparaît sur la fiche. */
const WORK_NEWS = {
  'lumbra': [
    {
      date:'2026-08-21', tag:'announce',
      title:{
        en:'LUMBRA is announced', fr:'LUMBRA est annoncé',
        es:'LUMBRA ha sido anunciado', de:'LUMBRA ist angekündigt',
        it:'LUMBRA è stato annunciato', ar:'الإعلان عن LUMBRA',
        zh:'LUMBRA 正式公布', ja:'LUMBRA発表',
        ru:'Анонсирован LUMBRA', pl:'LUMBRA zapowiedziana',
      },
      body:{
        en:'Our first world now has a name. LUMBRA is a black-and-white adventure in development for PC, targeted window: Q4 2027. Add it to your wishlist to follow its awakening.',
        fr:'Notre premier monde a désormais un nom. LUMBRA est une aventure en noir et blanc en développement pour PC, fenêtre visée : 4ᵉ trimestre 2027. Ajoute le titre à ta liste de souhaits pour suivre son éveil.',
        es:'Nuestro primer mundo ya tiene nombre. LUMBRA es una aventura en blanco y negro en desarrollo para PC, ventana prevista: cuarto trimestre de 2027. Añádelo a tu lista de deseos para seguir su despertar.',
        de:'Unsere erste Welt hat jetzt einen Namen. LUMBRA ist ein Schwarz-Weiß-Abenteuer in Entwicklung für PC, anvisiertes Fenster: Q4 2027. Setz den Titel auf deine Wunschliste, um sein Erwachen zu verfolgen.',
        it:'Il nostro primo mondo ora ha un nome. LUMBRA è un’avventura in bianco e nero in sviluppo per PC, finestra prevista: quarto trimestre 2027. Aggiungilo alla lista dei desideri per seguirne il risveglio.',
        ar:'صار لعالمنا الأول اسم. LUMBRA مغامرة بالأبيض والأسود قيد التطوير لأجهزة الحاسوب، النافذة المستهدفة: الربع الأخير من 2027. أضِف اللعبة إلى قائمة أمنياتك لتتابع استيقاظها.',
        zh:'我们的第一个世界有名字了。LUMBRA 是一款正在为 PC 开发的黑白冒险游戏、目标窗口：2027年第四季度。将它加入愿望单，见证它的苏醒。',
        ja:'最初の世界に、名前がついた。LUMBRAはPC向けに開発中のモノクロアドベンチャー。目標時期は2027年第4四半期。ウィッシュリストに追加して、その目覚めを見届けてほしい。',
        ru:'У нашего первого мира теперь есть имя. LUMBRA : чёрно-белое приключение в разработке для PC; целевое окно, четвёртый квартал 2027 года. Добавьте игру в список желаемого, чтобы следить за её пробуждением.',
        pl:'Nasz pierwszy świat ma już imię. LUMBRA to czarno-biała przygoda tworzona na PC, planowane okno: czwarty kwartał 2027. Dodaj ją do listy życzeń, by śledzić jej przebudzenie.',
      },
    },
  ],
};

/* ── ÉDITIONS (Standard / Deluxe, style Steam) ───────────────────────────
   Par œuvre : liste d'éditions { key, delta (EUR ajoutés au prix de base),
   perks:[clés _ED_T] }. Œuvre absente = pas de sélecteur (édition unique).
   La promo (promo.pct) s'applique au prix de CHAQUE édition. */
const WORK_EDITIONS = {};

/* ── DLC & CONTENUS LIÉS (bibliothèque launcher, façon Steam) ────────────
   Par œuvre : liste de contenus { id (œuvre liée du catalogue), kind }.
   kind : 'expansion' (extension du jeu de base) | 'base' (jeu requis).
   Œuvre absente = section DLC masquée proprement. */
const GLG_DLC = {};

/* ── JOURNAL DES VERSIONS (« Quoi de neuf », Options → Mises à jour) ────
   Alimenter à chaque déploiement notable. Le launcher standalone lira la
   même structure pour ses notes de mise à jour. */
const GLG_CHANGELOG = [
  {
    v:'1.0.5', date:'2026-08-21', tag:'update',
    notes:[
      { fr:'Nos Œuvres fait peau neuve : LUMBRA est annoncé, et trois projets restent gardés dans l’ombre.',
        en:'Our Works reborn: LUMBRA is announced, and three projects remain kept in the dark.',
        es:'Nuestras Obras se renueva: LUMBRA ha sido anunciado y tres proyectos siguen guardados en la sombra.',
        de:'Unsere Werke, neu gedacht: LUMBRA ist angekündigt, drei Projekte bleiben im Schatten.',
        it:'Le Nostre Opere si rinnova: LUMBRA è annunciato e tre progetti restano custoditi nell’ombra.',
        ar:'صفحة أعمالنا بحلة جديدة: تم الإعلان عن LUMBRA وتبقى ثلاثة مشاريع في الظل.',
        zh:'「我们的作品」焕然一新：LUMBRA 正式公布，另有三个项目仍藏于暗处。',
        ja:'作品ページを一新：LUMBRAを発表。3つのプロジェクトは、まだ影の中に。',
        ru:'«Наши работы» обновлены: анонсирован LUMBRA, ещё три проекта остаются в тени.',
        pl:'Nasze Dzieła po nowemu: zapowiedziana LUMBRA, a trzy projekty wciąż pozostają w cieniu.' },
      { fr:'Démarrage avec Windows (optionnel) : le launcher peut s’ouvrir en réduit à l’ouverture de session, Options → Launcher.',
        en:'Start with Windows (optional): the launcher can open minimized at sign-in, Options → Launcher.',
        es:'Inicio con Windows (opcional): el launcher puede abrirse minimizado al iniciar sesión, Opciones → Launcher.',
        de:'Start mit Windows (optional): der Launcher kann beim Anmelden minimiert starten, Optionen → Launcher.',
        it:'Avvio con Windows (opzionale): il launcher può aprirsi ridotto a icona all’accesso, Opzioni → Launcher.',
        ar:'التشغيل مع Windows (اختياري): يمكن للمشغّل أن يبدأ مصغّراً عند تسجيل الدخول، الخيارات ← المشغّل.',
        zh:'随 Windows 启动（可选）：launcher 可在登录时以最小化方式启动、选项 → 启动器。',
        ja:'Windowsと同時に起動（オプション）：サインイン時にランチャーを最小化で起動可能に。オプション→ランチャーから。',
        ru:'Запуск вместе с Windows (по желанию): лаунчер может открываться свёрнутым при входе в систему, Настройки → Лаунчер.',
        pl:'Uruchamianie z systemem Windows (opcjonalnie): launcher może startować zminimalizowany przy logowaniu, Opcje → Launcher.' },
      { fr:'Mentions légales, politique de confidentialité et conditions d’utilisation : trois nouvelles pages, reliées au pied de page.',
        en:'Legal notice, privacy policy and terms of use: three new pages, linked from the footer.',
        es:'Aviso legal, política de privacidad y condiciones de uso: tres páginas nuevas, enlazadas desde el pie de página.',
        de:'Impressum, Datenschutzerklärung und Nutzungsbedingungen: drei neue Seiten, verlinkt im Footer.',
        it:'Note legali, informativa sulla privacy e condizioni d’uso: tre nuove pagine, collegate dal piè di pagina.',
        ar:'الإشعار القانوني وسياسة الخصوصية وشروط الاستخدام: ثلاث صفحات جديدة مرتبطة بأسفل الموقع.',
        zh:'法律声明、隐私政策与使用条款：新增三个页面，可从页脚访问。',
        ja:'法的表記・プライバシーポリシー・利用規約：フッターから開ける3つの新ページを追加。',
        ru:'Правовая информация, политика конфиденциальности и условия использования: три новые страницы, ссылки в подвале сайта.',
        pl:'Nota prawna, polityka prywatności i warunki korzystania: trzy nowe strony, dostępne ze stopki.' },
    ],
  },
  {
    v:'1.0.0', date:'2026-07-05', tag:'release',
    notes:[
      { fr:'Bibliothèque façon launcher : tes jeux possédés, bouton Jouer/Installer et passage de relais vers l’application de bureau (glg://).',
        en:'Launcher-grade library: your owned games, Play/Install buttons and hand-off to the desktop app (glg://).',
        es:'Biblioteca estilo launcher: tus juegos, botones Jugar/Instalar y traspaso a la aplicación de escritorio (glg://).',
        de:'Launcher-Bibliothek: deine Spiele, Spielen/Installieren-Buttons und Übergabe an die Desktop-App (glg://).',
        it:'Libreria in stile launcher: i tuoi giochi, pulsanti Gioca/Installa e passaggio all\'app desktop (glg://).',
        ar:'مكتبة بأسلوب المشغّل: ألعابك، أزرار اللعب/التثبيت والتسليم إلى تطبيق سطح المكتب (glg://).',
        zh:'启动器级游戏库：你拥有的游戏、开始/安装按钮，以及与桌面应用的衔接（glg://）。',
        ja:'ランチャー級のライブラリ：所有ゲーム、プレイ/インストールボタン、デスクトップアプリへの受け渡し（glg://）。',
        ru:'Библиотека уровня лаунчера: ваши игры, кнопки «Играть/Установить» и передача в настольное приложение (glg://).',
        pl:'Biblioteka w stylu launchera: twoje gry, przyciski Graj/Zainstaluj i przekazanie do aplikacji desktopowej (glg://).' },
      { fr:'Profil enrichi : jeux récents avec temps de jeu, galerie de captures d’écran et activité publique maîtrisée.',
        en:'Richer profile: recent games with playtime, screenshot gallery and privacy-controlled public activity.',
        es:'Perfil enriquecido: juegos recientes con tiempo de juego, galería de capturas y actividad pública controlada.',
        de:'Erweitertes Profil: letzte Spiele mit Spielzeit, Screenshot-Galerie und kontrollierte öffentliche Aktivität.',
        it:'Profilo arricchito: giochi recenti con tempo di gioco, galleria di screenshot e attività pubblica controllata.',
        ar:'ملف أغنى: الألعاب الأخيرة مع وقت اللعب، ومعرض لقطات الشاشة، ونشاط عام خاضع للخصوصية.',
        zh:'更丰富的个人资料：带游戏时长的最近游戏、截图画廊，以及可控的公开动态。',
        ja:'充実したプロフィール：プレイ時間つきの最近のゲーム、スクリーンショットギャラリー、公開範囲を管理できるアクティビティ。',
        ru:'Расширенный профиль: недавние игры со временем в игре, галерея скриншотов и управляемая публичная активность.',
        pl:'Bogatszy profil: ostatnie gry z czasem gry, galeria zrzutów ekranu i kontrolowana aktywność publiczna.' },
      { fr:'Sécurité renforcée : double authentification (2FA) à la Steam Guard, protégée par ton application d’authentification.',
        en:'Hardened security: Steam Guard-style two-factor authentication backed by your authenticator app.',
        es:'Seguridad reforzada: autenticación en dos pasos al estilo Steam Guard con tu app de autenticación.',
        de:'Verstärkte Sicherheit: Zwei-Faktor-Authentifizierung im Steam-Guard-Stil mit deiner Authenticator-App.',
        it:'Sicurezza rafforzata: autenticazione a due fattori in stile Steam Guard con la tua app di autenticazione.',
        ar:'أمان معزّز: مصادقة ثنائية على طريقة Steam Guard عبر تطبيق المصادقة.',
        zh:'安全加固：Steam 令牌式两步验证，由你的身份验证器应用保护。',
        ja:'セキュリティ強化：認証アプリによるSteam Guard式の二段階認証。',
        ru:'Усиленная безопасность: двухфакторная аутентификация в стиле Steam Guard через приложение-аутентификатор.',
        pl:'Wzmocnione bezpieczeństwo: uwierzytelnianie dwuskładnikowe w stylu Steam Guard z aplikacją uwierzytelniającą.' },
      { fr:'Journal des mises à jour sur chaque fiche d’œuvre.',
        en:'An update journal on every game page.',
        es:'Diario de novedades en cada ficha.',
        de:'Update-Journal auf jeder Spielseite.',
        it:'Diario aggiornamenti su ogni scheda.',
        ar:'سجل التحديثات في كل صفحة لعبة.',
        zh:'每个游戏页面的更新日志。',
        ja:'各ゲームページのアップデートジャーナル。',
        ru:'Журнал обновлений на страницах игр.',
        pl:'Dziennik aktualizacji na stronie każdej gry.' },
    ],
  },
  {
    v:'0.9.0', date:'2026-06-20', tag:'update',
    notes:[
      { fr:'Évaluations des joueurs sur les fiches et trophées façon PlayStation avec rareté en temps réel.',
        en:'Player reviews on game pages and PlayStation-style trophies with live rarity.',
        es:'Reseñas de jugadores en las fichas y trofeos al estilo PlayStation con rareza en tiempo real.',
        de:'Spielerbewertungen auf den Spielseiten und Trophäen im PlayStation-Stil mit Live-Seltenheit.',
        it:'Recensioni dei giocatori sulle schede e trofei in stile PlayStation con rarità in tempo reale.',
        ar:'تقييمات اللاعبين في صفحات الألعاب وجوائز بأسلوب PlayStation مع نُدرة فورية.',
        zh:'游戏页面的玩家评测，以及带实时稀有度的 PlayStation 风格奖杯。',
        ja:'ゲームページのプレイヤーレビューと、リアルタイム希少度つきPlayStation式トロフィー。',
        ru:'Отзывы игроков на страницах игр и трофеи в стиле PlayStation с редкостью в реальном времени.',
        pl:'Recenzje graczy na stronach gier i trofea w stylu PlayStation z rzadkością na żywo.' },
      { fr:'Amis en direct : présence en ligne, notifications instantanées et liens d’invitation.',
        en:'Friends, live: online presence, instant notifications and invite links.',
        es:'Amigos en directo: presencia en línea, notificaciones instantáneas y enlaces de invitación.',
        de:'Freunde live: Online-Präsenz, Sofortbenachrichtigungen und Einladungslinks.',
        it:'Amici in diretta: presenza online, notifiche istantanee e link di invito.',
        ar:'أصدقاء مباشرةً: حضور متصل، إشعارات فورية وروابط دعوة.',
        zh:'实时好友：在线状态、即时通知与邀请链接。',
        ja:'フレンドのライブ化：オンライン表示、即時通知、招待リンク。',
        ru:'Друзья в реальном времени: онлайн-статус, мгновенные уведомления и пригласительные ссылки.',
        pl:'Znajomi na żywo: obecność online, natychmiastowe powiadomienia i linki z zaproszeniem.' },
      { fr:'Dix langues, prix dans ta devise, polices auto-hébergées : plus rapide et plus respectueux de ta vie privée.',
        en:'Ten languages, prices in your currency, self-hosted fonts: faster and more private.',
        es:'Diez idiomas, precios en tu moneda y fuentes autoalojadas: más rápido y más privado.',
        de:'Zehn Sprachen, Preise in deiner Währung, selbst gehostete Schriften: schneller und privater.',
        it:'Dieci lingue, prezzi nella tua valuta, font auto-ospitati: più veloce e più privato.',
        ar:'عشر لغات، وأسعار بعملتك، وخطوط مستضافة ذاتياً: أسرع وأكثر خصوصية.',
        zh:'十种语言、本地货币价格、自托管字体：更快，也更保护隐私。',
        ja:'10言語、現地通貨の価格、セルフホストフォント：より速く、よりプライベートに。',
        ru:'Десять языков, цены в вашей валюте, собственные шрифты: быстрее и приватнее.',
        pl:'Dziesięć języków, ceny w twojej walucie, fonty hostowane lokalnie: szybciej i prywatniej.' },
    ],
  },
];

/* ── Journal du studio ─────────────────────────────────────────────────────
   Uniquement des faits datés et vérifiables (annonces, versions, site).
   Entrée : { id, date ISO, tag: studio|lumbra|launcher|site,
              title {×10}, body [ {×10}, ... ], link: lumbra|launcher|press|null }.
   Les plus récentes d'abord. Rendu par buildJournalPage() (app.js). ── */
const GLG_JOURNAL = [
  {
    id: 'presse-ouverte', date: '2026-08-22', tag: 'studio', link: 'press',
    title: { fr:'L’espace presse est ouvert', en:'The press room is open', es:'La sala de prensa está abierta', de:'Der Pressebereich ist eröffnet', it:'L’area stampa è aperta', ar:'افتُتح الركن الصحفي', zh:'媒体专区上线', ja:'プレスルーム開設', ru:'Пресс-центр открыт', pl:'Strefa prasowa otwarta' },
    body: [
      { fr:'Journalistes, créateurs et partenaires disposent désormais d’une page dédiée : faits vérifiés du studio, kit presse complet (jaquette, artworks, logo, fiche technique) et description officielle à copier. Le tout téléchargeable en un clic.', en:'Journalists, creators and partners now have a dedicated page: verified studio facts, a complete press kit (key art, artworks, logo, factsheet) and an official boilerplate ready to copy. All downloadable in one click.', es:'Periodistas, creadores y socios cuentan ahora con una página dedicada: datos verificados del estudio, un kit de prensa completo (arte principal, ilustraciones, logotipo, ficha técnica) y una descripción oficial lista para copiar. Todo descargable en un clic.', de:'Journalisten, Creator und Partner haben jetzt eine eigene Seite: geprüfte Studio-Fakten, ein komplettes Pressekit (Key-Art, Artworks, Logo, Factsheet) und eine offizielle Kurzbeschreibung zum Kopieren. Alles mit einem Klick herunterladbar.', it:'Giornalisti, creator e partner hanno ora una pagina dedicata: fatti verificati dello studio, un kit stampa completo (key art, artwork, logo, scheda tecnica) e una descrizione ufficiale pronta da copiare. Tutto scaricabile in un clic.', ar:'أصبح للصحافيين والمبدعين والشركاء صفحة مخصصة: حقائق موثوقة عن الاستوديو، وملف صحفي كامل (الغلاف والأعمال الفنية والشعار والبطاقة التقنية)، ووصف رسمي جاهز للنسخ. كل ذلك قابل للتنزيل بنقرة.', zh:'记者、创作者与合作伙伴现在拥有专属页面：经核实的工作室资料、完整媒体资料包（主视觉、艺术图、标志、资料表）以及可直接复制的官方简介。一键即可全部下载。', ja:'報道関係者、クリエイター、パートナー向けの専用ページができました。確認済みのスタジオ情報、完全なプレスキット（キーアート、アートワーク、ロゴ、ファクトシート）、コピーしてそのまま使える公式ボイラープレート。すべてワンクリックでダウンロードできます。', ru:'У журналистов, авторов и партнёров теперь есть отдельная страница: проверенные факты о студии, полный пресс-кит (ключевой арт, иллюстрации, логотип, факт-лист) и официальное описание для копирования. Всё скачивается в один клик.', pl:'Dziennikarze, twórcy i partnerzy mają teraz dedykowaną stronę: zweryfikowane fakty o studiu, kompletny zestaw prasowy (grafika główna, ilustracje, logo, karta informacyjna) i oficjalny opis gotowy do skopiowania. Wszystko do pobrania jednym kliknięciem.' },
    ],
  },
  {
    id: 'identite-v2', date: '2026-08-22', tag: 'site', link: 'lumbra',
    title: { fr:'Une nouvelle identité pour le site', en:'A new identity for the website', es:'Una nueva identidad para el sitio', de:'Eine neue Identität für die Website', it:'Una nuova identità per il sito', ar:'هوية جديدة للموقع', zh:'网站焕新登场', ja:'サイトが新しい姿に', ru:'Новый облик сайта', pl:'Nowa tożsamość strony' },
    body: [
      { fr:'Le site fait peau neuve : typographies Archivo, Inter et JetBrains Mono auto-hébergées, boutons redessinés, navigation affinée, et une fiche LUMBRA où la lumière suit votre curseur. Dix langues, comme toujours.', en:'The website has a new skin: self-hosted Archivo, Inter and JetBrains Mono typefaces, redesigned buttons, refined navigation, and a LUMBRA page where the light follows your cursor. Ten languages, as always.', es:'El sitio se renueva: tipografías Archivo, Inter y JetBrains Mono alojadas localmente, botones rediseñados, navegación afinada y una ficha de LUMBRA donde la luz sigue tu cursor. Diez idiomas, como siempre.', de:'Die Website hat ein neues Gesicht: selbst gehostete Schriften Archivo, Inter und JetBrains Mono, neu gestaltete Buttons, verfeinerte Navigation und eine LUMBRA-Seite, auf der das Licht dem Cursor folgt. Zehn Sprachen, wie immer.', it:'Il sito si rinnova: caratteri Archivo, Inter e JetBrains Mono ospitati localmente, pulsanti ridisegnati, navigazione rifinita e una scheda LUMBRA dove la luce segue il cursore. Dieci lingue, come sempre.', ar:'الموقع بحُلّة جديدة: خطوط Archivo وInter وJetBrains Mono مستضافة محلياً، وأزرار معاد تصميمها، وتنقّل أدق، وصفحة LUMBRA يتبع فيها الضوء مؤشرك. عشر لغات كالعادة.', zh:'网站全面焕新：本地托管的 Archivo、Inter 与 JetBrains Mono 字体、重新设计的按钮、更精细的导航，以及光会跟随光标的 LUMBRA 页面。一如既往支持十种语言。', ja:'サイトを一新しました。セルフホストのArchivo、Inter、JetBrains Monoフォント、再設計されたボタン、洗練されたナビゲーション、そして光がカーソルを追うLUMBRAページ。いつも通り10言語対応です。', ru:'Сайт обновился: самостоятельно размещённые шрифты Archivo, Inter и JetBrains Mono, перерисованные кнопки, отточенная навигация и страница LUMBRA, где свет следует за курсором. Десять языков, как всегда.', pl:'Strona w nowej odsłonie: lokalnie hostowane kroje Archivo, Inter i JetBrains Mono, przeprojektowane przyciski, dopracowana nawigacja i strona LUMBRA, na której światło podąża za kursorem. Dziesięć języków, jak zawsze.' },
    ],
  },
  {
    id: 'launcher-1-0-5', date: '2026-08-21', tag: 'launcher', link: 'launcher',
    title: { fr:'Launcher 1.0.5 : démarrage avec Windows', en:'Launcher 1.0.5: start with Windows', es:'Launcher 1.0.5: inicio con Windows', de:'Launcher 1.0.5: Start mit Windows', it:'Launcher 1.0.5: avvio con Windows', ar:'المشغّل 1.0.5: التشغيل مع Windows', zh:'启动器 1.0.5：随 Windows 启动', ja:'ランチャー1.0.5：Windowsと同時起動', ru:'Лаунчер 1.0.5: запуск вместе с Windows', pl:'Launcher 1.0.5: start z systemem Windows' },
    body: [
      { fr:'La version 1.0.5 du launcher de bureau est disponible. Nouveauté principale : le démarrage automatique avec Windows, en option et désactivé par défaut. Les mises à jour restent automatiques et signées.', en:'Version 1.0.5 of the desktop launcher is out. Main addition: automatic start with Windows, optional and off by default. Updates remain automatic and signed.', es:'Ya está disponible la versión 1.0.5 del launcher de escritorio. Novedad principal: el inicio automático con Windows, opcional y desactivado por defecto. Las actualizaciones siguen siendo automáticas y firmadas.', de:'Version 1.0.5 des Desktop-Launchers ist da. Wichtigste Neuerung: der automatische Start mit Windows, optional und standardmäßig deaktiviert. Updates bleiben automatisch und signiert.', it:'La versione 1.0.5 del launcher desktop è disponibile. Novità principale: l’avvio automatico con Windows, opzionale e disattivato di default. Gli aggiornamenti restano automatici e firmati.', ar:'الإصدار 1.0.5 من مشغّل سطح المكتب متاح الآن. الإضافة الرئيسية: التشغيل التلقائي مع Windows، اختياري ومعطّل افتراضياً. التحديثات تبقى تلقائية وموقَّعة.', zh:'桌面启动器 1.0.5 版现已推出。主要新功能：随 Windows 自动启动，可选且默认关闭。更新依旧自动进行并经过签名。', ja:'デスクトップランチャーのバージョン1.0.5が公開されました。主な追加点はWindowsとの同時起動。任意設定で、初期状態ではオフです。アップデートは引き続き自動かつ署名付き。', ru:'Вышла версия 1.0.5 настольного лаунчера. Главное новшество: автозапуск вместе с Windows, опциональный и выключенный по умолчанию. Обновления остаются автоматическими и подписанными.', pl:'Wersja 1.0.5 launchera jest już dostępna. Główna nowość: automatyczny start z systemem Windows, opcjonalny i domyślnie wyłączony. Aktualizacje pozostają automatyczne i podpisane.' },
    ],
  },
  {
    id: 'lumbra-annonce', date: '2026-08-21', tag: 'lumbra', link: 'lumbra',
    title: { fr:'LUMBRA sort de l’ombre', en:'LUMBRA steps out of the dark', es:'LUMBRA sale de la sombra', de:'LUMBRA tritt aus dem Schatten', it:'LUMBRA esce dall’ombra', ar:'LUMBRA تخرج من الظل', zh:'LUMBRA 走出黑暗', ja:'LUMBRA、闇から姿を現す', ru:'LUMBRA выходит из тени', pl:'LUMBRA wychodzi z cienia' },
    body: [
      { fr:'Notre premier titre a désormais un nom : LUMBRA, une aventure narrative en noir et blanc prévue pour le Q4 2027 sur PC. Sa fiche est ouverte, avec trois artworks et une liste de souhaits. N’aie pas peur du noir.', en:'Our first title now has a name: LUMBRA, a black-and-white narrative adventure planned for Q4 2027 on PC. Its page is open, with three artworks and a wishlist. Don’t be afraid of the dark.', es:'Nuestro primer título ya tiene nombre: LUMBRA, una aventura narrativa en blanco y negro prevista para el Q4 de 2027 en PC. Su ficha está abierta, con tres ilustraciones y una lista de deseos. No tengas miedo de la oscuridad.', de:'Unser erster Titel hat jetzt einen Namen: LUMBRA, ein Erzähl-Abenteuer in Schwarz-Weiß, geplant für Q4 2027 auf PC. Die Spielseite ist offen, mit drei Artworks und einer Wunschliste. Hab keine Angst vor der Dunkelheit.', it:'Il nostro primo titolo ha finalmente un nome: LUMBRA, un’avventura narrativa in bianco e nero prevista per il Q4 2027 su PC. La sua scheda è aperta, con tre artwork e una lista dei desideri. Non avere paura del buio.', ar:'أول عنوان لنا صار له اسم: LUMBRA، مغامرة سردية بالأبيض والأسود متوقعة في الربع الأخير من 2027 على PC. صفحتها مفتوحة مع ثلاثة أعمال فنية وقائمة أمنيات. لا تخف من الظلام.', zh:'我们的首款作品正式定名：《LUMBRA》，一款黑白叙事冒险游戏，计划于 2027 年第四季度登陆 PC。游戏页面已开放，含三张艺术图与愿望单。别怕黑。', ja:'私たちの第1作に名前がつきました。『LUMBRA』、モノクロのナラティブアドベンチャー。2027年第4四半期にPC向けリリース予定。ゲームページは公開中で、3枚のアートワークとウィッシュリストがあります。暗闇を恐れないで。', ru:'У нашего первого проекта теперь есть имя: LUMBRA, чёрно-белое повествовательное приключение, запланированное на четвёртый квартал 2027 года на PC. Его страница открыта: три иллюстрации и список желаемого. Не бойся темноты.', pl:'Nasz pierwszy tytuł ma już nazwę: LUMBRA, czarno-biała przygoda narracyjna planowana na Q4 2027 na PC. Jego strona jest otwarta, z trzema grafikami i listą życzeń. Nie bój się ciemności.' },
    ],
  },
];

/* ── TRANSLATIONS ── */
/* Each key maps to a language code.
   Add/edit translations here to update all text on the site. */
const I18N = {
  fr:{
    nav:['Accueil','Nos Œuvres','À propos','Contact'],
    heroSlogan:'DES JEUX QUI <span class="hollow">ENSEIGNENT, ÉMEUVENT,</span> HANTENT L’ESPRIT',
    studioQuote:'« Nous ne développons pas de jeux.<br>Nous construisons des mondes qui<br><em>laissent des traces.</em> »',
    studioBody1:'GEEKLEARN GAMES est un studio indépendant dédié à la création d’expériences interactives qui font réfléchir, qui émeuvent, et qui restent en vous longtemps après que l’écran s’est éteint.',
    studioBody2:'Notre premier monde s’appelle LUMBRA, une aventure en noir et blanc où l’ombre protège et où la lumière expose. Les suivants existent déjà, quelque part dans le noir. Chaque chose en son temps.',
    ctaTitle:'CONSTRUISONS\nENSEMBLE',ctaDesc:'Éditeurs, distributeurs, collaborateurs, nous sommes ouverts aux partenariats qui ont du sens. Si vous croyez aux expériences qui comptent, parlons-en.',
    ctaBtn1:'Nous contacter',ctaBtn2:'Voir nos œuvres',
    worksTitle:'NOS\nŒUVRES',worksDesc:'Un titre annoncé. Trois chantiers gardés dans l’ombre. Chaque monde prend le temps qu’il mérite.',
    contactTitle:'CONTACT',contactDesc:'Éditeurs, collaborateurs, presse ou joueurs, chaque message reçoit une réponse sous 48 h.',
    formTitle:'Envoyez-nous un message',
    lblFirst:'Prénom *',lblLast:'Nom *',lblEmail:'Adresse email *',lblCompany:'Société / Studio',lblSubject:'Objet *',lblMessage:'Message *',lblLink:'Lien portfolio / dossier de presse',
    subjectOpts:['Partenariat éditeur / Distribution','Collaboration créative','Presse et médias','Candidature','Support joueur','Signalement de bug','Licence et droits','Autre'],
    formSubmit:'Envoyer le message',formLegal:'En envoyant ce formulaire, vous acceptez que vos données soient utilisées pour traiter votre demande. Réponse sous 48 h (jours ouvrés).',
    buyNow:'Acheter',buyModal:'Disponible sur',
    detailBack:'← Retour aux œuvres',trailerBtn:'▶ Trailer',
    aboutHead:'À propos',featuresHead:'Caractéristiques clés',ssHead:'Captures d’écran',specsHead:'Configuration requise',platHead:'Plateformes',
    specMin:'Minimum',specRec:'Recommandée',
    specOs:'Système d’exploitation',specCpu:'Processeur',specGpu:'Carte graphique',specRam:'Mémoire vive',specStorage:'Stockage',specDx:'DirectX',
    infoType:'Type',infoYear:'Année',infoStudio:'Studio',infoStatus:'Statut',infoPrice:'Prix',
    contactInfoTitle:'Contact direct',
    footerDesc:'Studio de développement de jeux vidéo indépendant. Nous créons des expériences qui enseignent, émeuvent et hantent l’esprit. Fondé en 2026, France.',
    footerNavTitle:'Navigation',footerWorksTitle:'Nos Œuvres',footerFollowTitle:'Suivez-nous',
    copyright:'Tous droits réservés',
    free:'GRATUIT',langChange:'Changer de langue',errRequired:'Requis',errEmail:'Email valide requis',errRateLimit:'Trop de demandes, veuillez patienter quelques minutes.',formSent:'Envoyé !',formOptional:'Facultatif',formMsgHint:'Parlez-nous de votre projet…',
    worksEye:'Catalogue complet',
    ctaEye:'Éditeurs et partenaires',
    contactEye:'Parlons-en',
    aboutTitle:'À PROPOS\nDE NOUS',
    aboutEye:'Le studio',
    aboutDesc:'GEEKLEARN GAMES est un studio indépendant fondé en 2026 à Blyes, en France. Voici qui construit ces mondes, et pourquoi.',
    teamEye:'L’équipe',
    teamTitle:'QUI\nNOUS SOMMES',
    manifestoLabel:'Manifeste du studio',
    manifestoQuote:'« Nous ne faisons pas de jeux.<br>Nous construisons des <em>mondes qui laissent des traces</em> sur les personnes qui y entrent -<br>des expériences qui enseignent, émeuvent et hantent l’esprit longtemps après que l’écran s’est éteint. »',
    awardsEye:'Prix et distinctions',
    awardsTitle:'TRAVAUX\nRECONNUS',
    priceTBA:'Prix à venir',
    artHead:'Artworks',
    trophiesTBA:'Révélés à la sortie',
    navGet:'Obtenir le launcher',
    
    
    shopStatus:'Bientôt disponible',
    available:'Disponible',
    searchLabel:'Rechercher un jeu',
    searchHint:'Commence à taper un titre…',
    searchNoResults:'Aucun résultat pour',
    accessRestricted:'Accès restreint',
    marqueeWords:['GeekLearn Games','Jeux vidéo','Est. 2026','France','Des jeux qui enseignent','Des jeux qui émeuvent','Des jeux qui hantent'],
  },
  en:{
    nav:['Home','Our Works','About Us','Contact'],
    heroSlogan:'GAMES THAT <span class="hollow">TEACH, MOVE,</span> HAUNT YOUR MIND',
    studioQuote:'"We don\'t develop games.<br>We build worlds that<br><em>leave marks.</em>"',
    studioBody1:'GEEKLEARN GAMES is an independent studio dedicated to creating interactive experiences that make you think, move you deeply, and stay with you long after the screen goes dark.',
    studioBody2:'Our first world is called LUMBRA, a black-and-white adventure where shadow protects and light exposes. The next ones already exist, somewhere in the dark. Everything in its own time.',
    ctaTitle:'LET\'S BUILD\nTOGETHER',ctaDesc:'Publishers, distributors, collaborators, we are open to meaningful partnerships. If you believe in experiences that matter, let\'s talk.',
    ctaBtn1:'Get In Touch',ctaBtn2:'Explore Our Works',
    worksTitle:'OUR\nWORKS',worksDesc:'One announced title. Three projects kept in the dark. Every world takes the time it deserves.',
    contactTitle:'CONTACT',contactDesc:'Publishers, collaborators, press, or players, every message gets a response within 48 hours.',
    formTitle:'Send us a message',
    lblFirst:'First name *',lblLast:'Last name *',lblEmail:'Email address *',lblCompany:'Company / Studio',lblSubject:'Subject *',lblMessage:'Message *',lblLink:'Portfolio / press kit link',
    subjectOpts:['Publisher / Distribution Partnership','Creative Collaboration','Press & Media','Job Application','Player Support','Bug Report','Licensing & Rights','Other'],
    formSubmit:'Send message',formLegal:'By submitting this form you agree to your data being used solely to process your inquiry. Response within 48 hours (business days).',
    buyNow:'Buy Now',buyModal:'Available on',
    detailBack:'← Back to Works',trailerBtn:'▶ Trailer',
    aboutHead:'About',featuresHead:'Key Features',ssHead:'Screenshots',specsHead:'System Requirements',platHead:'Platforms',
    specMin:'Minimum',specRec:'Recommended',
    specOs:'OS',specCpu:'Processor',specGpu:'Graphics',specRam:'Memory',specStorage:'Storage',specDx:'DirectX',
    infoType:'Type',infoYear:'Year',infoStudio:'Studio',infoStatus:'Status',infoPrice:'Price',
    contactInfoTitle:'Direct contact',
    footerDesc:'An independent game studio creating interactive experiences that teach, move, and haunt your mind. Est. 2026, France.',
    footerNavTitle:'Navigate',footerWorksTitle:'Our Works',footerFollowTitle:'Follow Us',
    copyright:'All rights reserved',
    free:'FREE',langChange:'Change Language',errRequired:'Required',errEmail:'Valid email required',errRateLimit:'Too many requests, please wait a few minutes.',formSent:'Sent!',formOptional:'Optional',formMsgHint:'Tell us about your project...',
    worksEye:'Complete Catalogue',
    ctaEye:'Publishers & Partners',
    contactEye:'Let\'s talk',
    aboutTitle:'ABOUT\nUS',
    aboutEye:'The Studio',
    aboutDesc:'GEEKLEARN GAMES is an independent studio founded in 2026 in Blyes, France. Here is who builds these worlds, and why.',
    teamEye:'The Team',
    teamTitle:'WHO WE\nARE',
    manifestoLabel:'Studio Manifesto',
    manifestoQuote:'"We don\'t make games.<br>We build <em>worlds that leave marks</em> on the people who enter them -<br>experiences that teach, move, and haunt your mind long after the screen goes dark."',
    awardsEye:'Awards & Distinctions',
    awardsTitle:'RECOGNISED\nWORK',
    priceTBA:'Price to be announced',
    artHead:'Artworks',
    trophiesTBA:'Revealed at launch',
    navGet:'Get the launcher',
    
    
    shopStatus:'Coming Soon',
    available:'Available',
    searchLabel:'Search a game',
    searchHint:'Start typing a title...',
    searchNoResults:'No results for',
    accessRestricted:'Access restricted',
    marqueeWords:['GeekLearn Games','Video Games','Est. 2026','France','Games That Teach','Games That Move','Games That Haunt'],
  },
  es:{
    nav:['Inicio','Nuestras Obras','Sobre Nosotros','Contacto'],
    heroSlogan:'JUEGOS QUE <span class="hollow">ENSEÑAN, EMOCIONAN,</span> PERSIGUEN TU MENTE',
    studioQuote:'"No desarrollamos juegos.<br>Construimos mundos que<br><em>dejan huella.</em>"',
    studioBody1:'GEEKLEARN GAMES es un estudio independiente dedicado a crear experiencias interactivas que hacen pensar, conmueven y permanecen mucho después de que la pantalla se apague.',
    studioBody2:'Nuestro primer mundo se llama LUMBRA, una aventura en blanco y negro donde la sombra protege y la luz expone. Los siguientes ya existen, en algún lugar de la oscuridad. Cada cosa a su tiempo.',
    ctaTitle:'CONSTRUYAMOS\nJUNTOS',ctaDesc:'Editores, distribuidores y colaboradores, estamos abiertos a asociaciones significativas. Si crees en las experiencias que importan, hablemos.',
    ctaBtn1:'Contactar',ctaBtn2:'Ver Nuestras Obras',
    worksTitle:'NUESTRAS\nOBRAS',worksDesc:'Un título anunciado. Tres proyectos guardados en la sombra. Cada mundo se toma el tiempo que merece.',
    contactTitle:'CONTACTO',contactDesc:'Editoras, colaboradores, prensa o jugadores, respondemos en 48 horas.',
    formTitle:'Envíanos un mensaje',
    lblFirst:'Nombre *',lblLast:'Apellido *',lblEmail:'Correo electrónico *',lblCompany:'Empresa / Estudio',lblSubject:'Asunto *',lblMessage:'Mensaje *',lblLink:'Enlace portfolio / dossier de prensa',
    subjectOpts:['Asociación editorial / Distribución','Colaboración creativa','Prensa y Medios','Solicitud de empleo','Soporte al jugador','Informe de error','Licencias y Derechos','Otro'],
    formSubmit:'Enviar mensaje',formLegal:'Al enviar este formulario, acepta que sus datos se utilicen únicamente para procesar su consulta.',
    buyNow:'Comprar',buyModal:'Disponible en',detailBack:'← Volver',trailerBtn:'▶ Tráiler',
    aboutHead:'Acerca de',featuresHead:'Características clave',ssHead:'Capturas de pantalla',specsHead:'Requisitos del sistema',platHead:'Plataformas',
    specMin:'Mínimo',specRec:'Recomendado',specOs:'Sistema operativo',specCpu:'Procesador',specGpu:'Tarjeta gráfica',specRam:'Memoria',specStorage:'Almacenamiento',specDx:'DirectX',
    infoType:'Tipo',infoYear:'Año',infoStudio:'Estudio',infoStatus:'Estado',infoPrice:'Precio',
    contactInfoTitle:'Contacto directo',
    footerDesc:'Estudio de videojuegos independiente. Creamos experiencias interactivas que enseñan, emocionan y persiguen tu mente.',
    footerNavTitle:'Navegación',footerWorksTitle:'Nuestras Obras',footerFollowTitle:'Síguenos',copyright:'Todos los derechos reservados',
    free:'GRATIS',langChange:'Cambiar idioma',errRequired:'Requerido',errEmail:'Email válido requerido',errRateLimit:'Demasiadas solicitudes, espera unos minutos.',formSent:'¡Enviado!',formOptional:'Opcional',formMsgHint:'Cuéntanos sobre tu proyecto...',
    worksEye:'Catálogo Completo',
    ctaEye:'Editores y Socios',
    contactEye:'Hablemos',
    aboutTitle:'SOBRE\nNOSOTROS',
    aboutEye:'El Estudio',
    aboutDesc:'GEEKLEARN GAMES es un estudio independiente fundado en 2026 en Blyes, Francia. Aquí está quién construye estos mundos, y por qué.',
    teamEye:'El Equipo',
    teamTitle:'QUIÉNES\nSOMOS',
    manifestoLabel:'Manifiesto del Estudio',
    manifestoQuote:'"No hacemos juegos.<br>Construimos <em>mundos que dejan huella</em> en las personas que los habitan -<br>experiencias que enseñan, emocionan y persiguen tu mente mucho después de que la pantalla se apague."',
    awardsEye:'Premios y Distinciones',
    awardsTitle:'TRABAJO\nRECONOCIDO',
    priceTBA:'Precio por anunciar',
    artHead:'Artworks',
    trophiesTBA:'Se revelan en el lanzamiento',
    navGet:'Conseguir el launcher',
    
    
    shopStatus:'Próximamente',
    available:'Disponible',
    searchLabel:'Buscar un juego',
    searchHint:'Empieza a escribir un título...',
    searchNoResults:'Sin resultados para',
    accessRestricted:'Acceso restringido',
    marqueeWords:['GeekLearn Games','Videojuegos','Est. 2026','Francia','Juegos Que Enseñan','Juegos Que Emocionan','Juegos Que Persiguen'],
  },
  de:{
    nav:['Startseite','Unsere Werke','Über Uns','Kontakt'],
    heroSlogan:'SPIELE DIE <span class="hollow">LEHREN, BEWEGEN,</span> DEN GEIST VERFOLGEN',
    studioQuote:'"Wir entwickeln keine Spiele.<br>Wir bauen Welten,<br><em>die Spuren hinterlassen.</em>"',
    studioBody1:'GEEKLEARN GAMES ist ein unabhängiges Studio, das interaktive Erlebnisse schafft, die zum Nachdenken anregen, bewegen und noch lange nach dem Ausschalten des Bildschirms nachwirken.',
    studioBody2:'Unsere erste Welt heißt LUMBRA, ein Schwarz-Weiß-Abenteuer, in dem der Schatten schützt und das Licht verrät. Die nächsten existieren bereits, irgendwo im Dunkeln. Alles zu seiner Zeit.',
    ctaTitle:'GEMEINSAM\nBAUEN',ctaDesc:'Verlage, Distributoren und Mitarbeiter, wir sind offen für bedeutungsvolle Partnerschaften. Wenn Sie an Erlebnissen glauben, die zählen, lassen Sie uns reden.',
    ctaBtn1:'Kontakt aufnehmen',ctaBtn2:'Werke entdecken',
    worksTitle:'UNSERE\nWERKE',worksDesc:'Ein angekündigter Titel. Drei Projekte im Schatten. Jede Welt bekommt die Zeit, die sie verdient.',
    contactTitle:'KONTAKT',contactDesc:'Verlage, Partner, Presse oder Spieler, jede Nachricht wird innerhalb von 48 Stunden beantwortet.',
    formTitle:'Schreib uns',
    lblFirst:'Vorname *',lblLast:'Nachname *',lblEmail:'E-Mail-Adresse *',lblCompany:'Unternehmen / Studio',lblSubject:'Betreff *',lblMessage:'Nachricht *',lblLink:'Portfolio / Pressemappe Link',
    subjectOpts:['Verlagspartnerschaft / Vertrieb','Kreative Zusammenarbeit','Presse & Medien','Bewerbung','Spieler-Support','Fehlerbericht','Lizenzierung & Rechte','Sonstiges'],
    formSubmit:'Nachricht senden',formLegal:'Mit dem Absenden dieses Formulars stimmen Sie zu, dass Ihre Daten nur zur Bearbeitung Ihrer Anfrage verwendet werden.',
    buyNow:'Kaufen',buyModal:'Verfügbar auf',detailBack:'← Zurück',trailerBtn:'▶ Trailer',
    aboutHead:'Über das Spiel',featuresHead:'Hauptmerkmale',ssHead:'Screenshots',specsHead:'Systemanforderungen',platHead:'Plattformen',
    specMin:'Minimum',specRec:'Empfohlen',specOs:'Betriebssystem',specCpu:'Prozessor',specGpu:'Grafik',specRam:'Arbeitsspeicher',specStorage:'Speicher',specDx:'DirectX',
    infoType:'Typ',infoYear:'Jahr',infoStudio:'Studio',infoStatus:'Status',infoPrice:'Preis',
    contactInfoTitle:'Direktkontakt',
    footerDesc:'Ein unabhängiges Spielestudio, das interaktive Erlebnisse schafft, die lehren, bewegen und verfolgen.',
    footerNavTitle:'Navigation',footerWorksTitle:'Unsere Werke',footerFollowTitle:'Folge uns',copyright:'Alle Rechte vorbehalten',
    free:'KOSTENLOS',langChange:'Sprache wechseln',errRequired:'Pflichtfeld',errEmail:'Gültige E-Mail erforderlich',errRateLimit:'Zu viele Anfragen, bitte warte einige Minuten.',formSent:'Gesendet!',formOptional:'Optional',formMsgHint:'Erzähl uns von deinem Projekt...',
    worksEye:'Vollständiger Katalog',
    ctaEye:'Verlage & Partner',
    contactEye:'Lass uns reden',
    aboutTitle:'ÜBER\nUNS',
    aboutEye:'Das Studio',
    aboutDesc:'GEEKLEARN GAMES ist ein unabhängiges Studio, 2026 in Blyes, Frankreich, gegründet. Hier steht, wer diese Welten baut, und warum.',
    teamEye:'Das Team',
    teamTitle:'WER WIR\nSIND',
    manifestoLabel:'Studio-Manifest',
    manifestoQuote:'"Wir entwickeln keine Spiele.<br>Wir bauen <em>Welten, die Spuren hinterlassen</em> in den Menschen, die sie betreten -<br>Erlebnisse, die lehren, bewegen und verfolgen, lange nachdem der Bildschirm dunkel wird."',
    awardsEye:'Auszeichnungen',
    awardsTitle:'ANERKANNTE\nARBEIT',
    priceTBA:'Preis wird noch bekannt gegeben',
    artHead:'Artworks',
    trophiesTBA:'Enthüllung zum Release',
    navGet:'Launcher holen',
    
    
    shopStatus:'Demnächst',
    available:'Verfügbar',
    searchLabel:'Ein Spiel suchen',
    searchHint:'Titel eingeben...',
    searchNoResults:'Keine Ergebnisse für',
    accessRestricted:'Zugang eingeschränkt',
    marqueeWords:['GeekLearn Games','Videospiele','Gegr. 2026','Frankreich','Lehrende Spiele','Bewegende Spiele','Verfolgende Spiele'],
  },
  ar:{
    nav:['الرئيسية','أعمالنا','من نحن','تواصل معنا'],
    heroSlogan:'ألعاب <span class="hollow">تُعلِّم، تُحرِّك،</span> تَسكُن عقلك',
    studioQuote:'"نحن لا نطور ألعاباً.<br>نبني عوالم<br><em>تترك أثراً.</em>"',
    studioBody1:'GEEKLEARN GAMES استوديو مستقل مكرس لإنشاء تجارب تفاعلية تجعلك تفكر وتحرك مشاعرك وتبقى معك طويلاً بعد إطفاء الشاشة.',
    studioBody2:'عالمنا الأول اسمه LUMBRA، مغامرة بالأبيض والأسود حيث يحمي الظل ويفضح الضوء. أما العوالم التالية فموجودة بالفعل، في مكان ما من العتمة. لكل شيء وقته.',
    ctaTitle:'لنبنِ\nمعاً',ctaDesc:'الناشرون والموزعون والمتعاونون، نحن منفتحون على الشراكات ذات المعنى. إذا كنت تؤمن بالتجارب التي تهم، فلنتحدث.',
    ctaBtn1:'تواصل معنا',ctaBtn2:'استكشف أعمالنا',
    worksTitle:'أعمالنا',worksDesc:'عنوان واحد معلن. ثلاثة مشاريع في الظل. كل عالم يأخذ الوقت الذي يستحقه.',
    contactTitle:'تواصل',contactDesc:'الناشرون أو المتعاونون أو الصحافة أو اللاعبون، كل رسالة تحصل على رد في غضون 48 ساعة.',
    formTitle:'أرسل لنا رسالة',
    lblFirst:'الاسم الأول *',lblLast:'اسم العائلة *',lblEmail:'البريد الإلكتروني *',lblCompany:'الشركة / الاستوديو',lblSubject:'الموضوع *',lblMessage:'الرسالة *',lblLink:'رابط المحفظة / حقيبة الصحافة',
    subjectOpts:['شراكة ناشر / توزيع','تعاون إبداعي','صحافة وإعلام','طلب وظيفة','دعم اللاعبين','الإبلاغ عن خطأ','الترخيص والحقوق','أخرى'],
    formSubmit:'إرسال الرسالة',formLegal:'بإرسال هذا النموذج توافق على استخدام بياناتك لمعالجة طلبك فقط.',
    buyNow:'شراء',buyModal:'متاح على',detailBack:'→ العودة إلى الأعمال',trailerBtn:'▶ إعلان',
    aboutHead:'حول',featuresHead:'الميزات الرئيسية',ssHead:'لقطات الشاشة',specsHead:'متطلبات النظام',platHead:'المنصات',
    specMin:'الحد الأدنى',specRec:'الموصى به',specOs:'نظام التشغيل',specCpu:'المعالج',specGpu:'كرت الشاشة',specRam:'الذاكرة',specStorage:'التخزين',specDx:'DirectX',
    infoType:'النوع',infoYear:'السنة',infoStudio:'الاستوديو',infoStatus:'الحالة',infoPrice:'السعر',
    contactInfoTitle:'الاتصال المباشر',
    footerDesc:'استوديو ألعاب فيديو مستقل يصنع تجارب تفاعلية تعلم وتحرك وتسكن الذاكرة.',
    footerNavTitle:'التنقل',footerWorksTitle:'أعمالنا',footerFollowTitle:'تابعنا',copyright:'جميع الحقوق محفوظة',
    free:'مجاني',langChange:'تغيير اللغة',errRequired:'مطلوب',errEmail:'بريد إلكتروني صحيح مطلوب',errRateLimit:'طلبات كثيرة جداً، يرجى الانتظار بضع دقائق.',formSent:'تم الإرسال!',formOptional:'اختياري',formMsgHint:'أخبرنا عن مشروعك...',
    worksEye:'الكتالوج الكامل',
    ctaEye:'الناشرون والشركاء',
    contactEye:'لنتحدث',
    aboutTitle:'من\nنحن',
    aboutEye:'الاستوديو',
    aboutDesc:'GEEKLEARN GAMES استوديو مستقل تأسس عام 2026 في بلييس بفرنسا. هنا تتعرف على من يبني هذه العوالم، ولماذا.',
    teamEye:'الفريق',
    teamTitle:'من\nنكون',
    manifestoLabel:'بيان الاستوديو',
    manifestoQuote:'"نحن لا نطور ألعاباً.<br>نحن نبني <em>عوالم تترك أثراً</em> في الناس الذين يدخلونها -<br>تجارب تعلّم وتحرّك وتسكن عقلك طويلاً بعد إطفاء الشاشة."',
    awardsEye:'الجوائز والتميّز',
    awardsTitle:'أعمال\nمعترف بها',
    priceTBA:'السعر يُعلن لاحقاً',
    artHead:'أعمال فنية',
    trophiesTBA:'تُكشف عند الإصدار',
    navGet:'احصل على المشغّل',
    
    
    shopStatus:'قريباً',
    available:'متوفر',
    searchLabel:'ابحث عن لعبة',
    searchHint:'ابدأ بكتابة عنوان...',
    searchNoResults:'لا نتائج لـ',
    accessRestricted:'الوصول مقيّد',
    marqueeWords:['GeekLearn Games','ألعاب فيديو','تأسست 2026','فرنسا','ألعاب تعلّم','ألعاب تحرّك','ألعاب تسكن'],
  },
  zh:{
    nav:['首页','我们的作品','关于我们','联系我们'],
    heroSlogan:'游戏让你 <span class="hollow">学习、感动，</span> 萦绕心头',
    studioQuote:'"我们不开发游戏。<br>我们构建<br><em>留下痕迹的世界。</em>"',
    studioBody1:'GEEKLEARN GAMES是一家独立工作室，致力于创造互动体验、让您思考、深受感动，并在屏幕熄灭后很久仍萦绕心头。',
    studioBody2:'我们的第一个世界名为 LUMBRA, 一场黑白冒险：阴影庇护你，光芒暴露你。接下来的世界已然存在，就在黑暗深处。一切都有它的时刻。',
    ctaTitle:'共同\n创造',ctaDesc:'发行商、分销商、合作者、我们对有意义的合作持开放态度。',
    ctaBtn1:'联系我们',ctaBtn2:'探索作品',
    worksTitle:'我们的\n作品',worksDesc:'一部已公布的作品。三个仍在暗处的项目。每个世界都值得被从容打磨。',
    contactTitle:'联系',contactDesc:'发行商、合作者、媒体或玩家、每条消息都将在48小时内得到回复。',
    formTitle:'给我们留言',
    lblFirst:'名字 *',lblLast:'姓氏 *',lblEmail:'电子邮箱 *',lblCompany:'公司/工作室',lblSubject:'主题 *',lblMessage:'消息 *',lblLink:'作品集/新闻资料包链接',
    subjectOpts:['发行商合作/发行','创意合作','媒体公关','求职申请','玩家支持','错误反馈','许可与版权','其他'],
    formSubmit:'发送消息',formLegal:'提交此表格即表示您同意您的数据仅用于处理您的查询。',
    buyNow:'购买',buyModal:'可在以下平台购买',detailBack:'← 返回作品',trailerBtn:'▶ 预告片',
    aboutHead:'关于',featuresHead:'主要特色',ssHead:'截图',specsHead:'系统需求',platHead:'平台',
    specMin:'最低配置',specRec:'推荐配置',specOs:'操作系统',specCpu:'处理器',specGpu:'显卡',specRam:'内存',specStorage:'存储',specDx:'DirectX',
    infoType:'类型',infoYear:'年份',infoStudio:'工作室',infoStatus:'状态',infoPrice:'价格',
    contactInfoTitle:'直接联系',
    footerDesc:'独立游戏工作室，创造教育、感动并萦绕心头的互动体验。2026年创立于法国。',
    footerNavTitle:'导航',footerWorksTitle:'我们的作品',footerFollowTitle:'关注我们',copyright:'版权所有',
    free:'免费',langChange:'更换语言',errRequired:'必填',errEmail:'需要有效的电子邮件',errRateLimit:'请求过多、请稍等几分钟。',formSent:'已发送！',formOptional:'可选',formMsgHint:'告诉我们您的项目...',
    worksEye:'完整目录',
    ctaEye:'发行商与合作伙伴',
    contactEye:'联系我们',
    aboutTitle:'关于\n我们',
    aboutEye:'工作室',
    aboutDesc:'GEEKLEARN GAMES 是一家独立工作室，2026年创立于法国布利耶斯。在这里认识构筑这些世界的人、以及背后的初衷。',
    teamEye:'团队',
    teamTitle:'我们\n是谁',
    manifestoLabel:'工作室宣言',
    manifestoQuote:'"我们不开发游戏。<br>我们构建<em>留下痕迹的世界</em>，让进入其中的人铭记、<br>在屏幕熄灭后很久仍萦绕心头的体验。"',
    awardsEye:'奖项与荣誉',
    awardsTitle:'获奖\n作品',
    priceTBA:'价格待公布',
    artHead:'概念艺术',
    trophiesTBA:'发售时揭晓',
    navGet:'获取启动器',
    
    
    shopStatus:'即将开放',
    available:'现已推出',
    searchLabel:'搜索游戏',
    searchHint:'开始输入标题...',
    searchNoResults:'未找到结果：',
    accessRestricted:'访问受限',
    marqueeWords:['GeekLearn Games','电子游戏','创立于2026年','法国','教育游戏','感动游戏','萦绕心头的游戏'],
  },
  ja:{
    nav:['ホーム','作品一覧','私たちについて','お問い合わせ'],
    heroSlogan:'教え <span class="hollow">動かし、</span> 心にとどまるゲーム',
    studioQuote:'"ゲームを開発するのではない。<br>痕跡を残す<br><em>世界を作る。</em>"',
    studioBody1:'GEEKLEARN GAMESは、考えさせ、深く感動させ、画面が消えた後も長く残るインタラクティブ体験を創るインディースタジオです。',
    studioBody2:'最初の世界の名は「LUMBRA」。影が守り、光が暴く白黒のアドベンチャー。次の世界たちは、すでに闇のどこかに存在している。すべては、その時が来たら。',
    ctaTitle:'共に\n作ろう',ctaDesc:'パブリッシャー、ディストリビューター、コラボレーター、意味のある提携を歓迎します。大切な体験を信じるなら、ぜひご連絡ください。',
    ctaBtn1:'お問い合わせ',ctaBtn2:'作品を見る',
    worksTitle:'私たちの\n作品',worksDesc:'発表済みタイトルは1本。影の中で進む3つのプロジェクト。どの世界にも、ふさわしい時間をかける。',
    contactTitle:'お問い合わせ',contactDesc:'パブリッシャー、コラボレーター、プレス、プレイヤー、すべてのメッセージに48時間以内に返信します。',
    formTitle:'メッセージを送る',
    lblFirst:'名前 *',lblLast:'苗字 *',lblEmail:'メールアドレス *',lblCompany:'会社・スタジオ',lblSubject:'件名 *',lblMessage:'メッセージ *',lblLink:'ポートフォリオ・プレスキットリンク',
    subjectOpts:['パブリッシャーパートナーシップ・流通','クリエイティブコラボレーション','プレス・メディア','求職応募','プレイヤーサポート','バグ報告','ライセンスと権利','その他'],
    formSubmit:'メッセージを送信',formLegal:'このフォームを送信することで、お問い合わせの処理のみにデータが使用されることに同意します。',
    buyNow:'購入する',buyModal:'利用可能なプラットフォーム',detailBack:'← 作品一覧に戻る',trailerBtn:'▶ トレーラー',
    aboutHead:'ゲームについて',featuresHead:'主な特徴',ssHead:'スクリーンショット',specsHead:'動作環境',platHead:'対応プラットフォーム',
    specMin:'最低動作環境',specRec:'推奨動作環境',specOs:'OS',specCpu:'プロセッサー',specGpu:'グラフィックス',specRam:'メモリ',specStorage:'ストレージ',specDx:'DirectX',
    infoType:'タイプ',infoYear:'年',infoStudio:'スタジオ',infoStatus:'ステータス',infoPrice:'価格',
    contactInfoTitle:'直接連絡',
    footerDesc:'インタラクティブ体験を作るインディーゲームスタジオ。2026年フランスにて設立。',
    footerNavTitle:'ナビゲーション',footerWorksTitle:'作品一覧',footerFollowTitle:'フォロー',copyright:'全著作権所有',
    free:'無料',langChange:'言語を変更',errRequired:'必須',errEmail:'有効なメールアドレスが必要',errRateLimit:'リクエストが多すぎます、しばらくお待ちください。',formSent:'送信しました！',formOptional:'任意',formMsgHint:'プロジェクトについてお聞かせください...',
    worksEye:'完全カタログ',
    ctaEye:'パブリッシャー & パートナー',
    contactEye:'お話しましょう',
    aboutTitle:'私たちに\nついて',
    aboutEye:'スタジオ',
    aboutDesc:'GEEKLEARN GAMESは2026年、フランスのブリエスで生まれたインディースタジオ。これらの世界を作る人間と、その理由を紹介します。',
    teamEye:'チーム',
    teamTitle:'私たちは\n誰か',
    manifestoLabel:'スタジオ・マニフェスト',
    manifestoQuote:'"ゲームを開発するのではない。<br><em>人々の心に痕跡を残す世界</em>を構築する、<br>画面が消えた後も長く心に残る体験を。"',
    awardsEye:'受賞・評価',
    awardsTitle:'評価された\n作品',
    priceTBA:'価格は後日発表',
    artHead:'アートワーク',
    trophiesTBA:'発売時に公開',
    navGet:'ランチャーを入手',
    
    
    shopStatus:'近日公開',
    available:'発売中',
    searchLabel:'ゲームを検索',
    searchHint:'タイトルを入力してください...',
    searchNoResults:'結果なし：',
    accessRestricted:'アクセス制限中',
    marqueeWords:['GeekLearn Games','ビデオゲーム','2026年設立','フランス','学ぶゲーム','感動するゲーム','心に残るゲーム'],
  },
  ru:{
    nav:['Главная','Наши Работы','О нас','Контакт'],
    heroSlogan:'ИГРЫ КОТОРЫЕ <span class="hollow">УЧАТ, ТРОГАЮТ,</span> ПРЕСЛЕДУЮТ РАЗУМ',
    studioQuote:'"Мы не создаём игры.<br>Мы строим миры,<br><em>которые оставляют след.</em>"',
    studioBody1:'GEEKLEARN GAMES, независимая студия, создающая интерактивные переживания, которые заставляют думать, глубоко волнуют и остаются надолго после того, как экран гаснет.',
    studioBody2:'Наш первый мир называется LUMBRA : чёрно-белое приключение, где тень защищает, а свет выдаёт. Следующие уже существуют, где-то в темноте. Всему своё время.',
    ctaTitle:'СОЗДАДИМ\nВМЕСТЕ',ctaDesc:'Издатели, дистрибьюторы, сотрудники, мы открыты для значимых партнёрств. Если вы верите в опыт, который важен, давайте поговорим.',
    ctaBtn1:'Связаться',ctaBtn2:'Наши работы',
    worksTitle:'НАШИ\nРАБОТЫ',worksDesc:'Один анонсированный проект. Три, в тени. Каждый мир получает столько времени, сколько заслуживает.',
    contactTitle:'КОНТАКТ',contactDesc:'Издатели, коллаборации, пресса или игроки, каждое сообщение получает ответ в течение 48 часов.',
    formTitle:'Напишите нам',
    lblFirst:'Имя *',lblLast:'Фамилия *',lblEmail:'Электронная почта *',lblCompany:'Компания / Студия',lblSubject:'Тема *',lblMessage:'Сообщение *',lblLink:'Ссылка на портфолио / пресс-кит',
    subjectOpts:['Партнёрство с издателем / Дистрибуция','Творческое сотрудничество','Пресса и СМИ','Заявка на работу','Поддержка игроков','Сообщить об ошибке','Лицензирование и права','Другое'],
    formSubmit:'Отправить сообщение',formLegal:'Отправляя эту форму, вы соглашаетесь на использование ваших данных для обработки запроса.',
    buyNow:'Купить',buyModal:'Доступно на',detailBack:'← Назад к работам',trailerBtn:'▶ Трейлер',
    aboutHead:'Об игре',featuresHead:'Основные особенности',ssHead:'Скриншоты',specsHead:'Системные требования',platHead:'Платформы',
    specMin:'Минимальные',specRec:'Рекомендуемые',specOs:'ОС',specCpu:'Процессор',specGpu:'Видеокарта',specRam:'Память',specStorage:'Хранилище',specDx:'DirectX',
    infoType:'Тип',infoYear:'Год',infoStudio:'Студия',infoStatus:'Статус',infoPrice:'Цена',
    contactInfoTitle:'Прямой контакт',
    footerDesc:'Независимая игровая студия, создающая интерактивные переживания, которые учат, трогают и преследуют разум.',
    footerNavTitle:'Навигация',footerWorksTitle:'Наши работы',footerFollowTitle:'Следите за нами',copyright:'Все права защищены',
    free:'БЕСПЛАТНО',langChange:'Сменить язык',errRequired:'Обязательное поле',errEmail:'Требуется действительный email',errRateLimit:'Слишком много запросов, подождите несколько минут.',formSent:'Отправлено!',formOptional:'Необязательно',formMsgHint:'Расскажите о вашем проекте...',
    worksEye:'Полный Каталог',
    ctaEye:'Издатели и Партнёры',
    contactEye:'Поговорим',
    aboutTitle:'О\nНАС',
    aboutEye:'Студия',
    aboutDesc:'GEEKLEARN GAMES : независимая студия, основанная в 2026 году в Блиесе, Франция. Здесь, о том, кто строит эти миры и зачем.',
    teamEye:'Команда',
    teamTitle:'КТО МЫ\nТАКИЕ',
    manifestoLabel:'Манифест Студии',
    manifestoQuote:'"Мы не создаём игры.<br>Мы строим <em>миры, которые оставляют след</em> в людях, которые их посещают -<br>переживания, которые учат, волнуют и преследуют разум ещё долго после того, как экран гаснет."',
    awardsEye:'Награды и Признание',
    awardsTitle:'ПРИЗНАННЫЕ\nРАБОТЫ',
    priceTBA:'Цена будет объявлена позже',
    artHead:'Артворки',
    trophiesTBA:'Откроются на релизе',
    navGet:'Скачать лаунчер',
    
    
    shopStatus:'Скоро',
    available:'Доступно',
    searchLabel:'Найти игру',
    searchHint:'Начните вводить название...',
    searchNoResults:'Нет результатов для',
    accessRestricted:'Доступ ограничен',
    marqueeWords:['GeekLearn Games','Видеоигры','Осн. 2026','Франция','Игры Что Учат','Игры Что Волнуют','Игры Что Преследуют'],
  },
  pl:{
    nav:['Strona główna','Nasze Prace','O Nas','Kontakt'],
    heroSlogan:'GRY KTÓRE <span class="hollow">UCZĄ, WZRUSZAJĄ,</span> NAWIEDZAJĄ UMYSŁ',
    studioQuote:'"Nie tworzymy gier.<br>Budujemy światy,<br><em>które zostawiają ślad.</em>"',
    studioBody1:'GEEKLEARN GAMES to niezależne studio tworzące interaktywne doświadczenia, które skłaniają do refleksji, wzruszają i pozostają z tobą długo po wyłączeniu ekranu.',
    studioBody2:'Nasz pierwszy świat nazywa się LUMBRA, czarno-biała przygoda, w której cień chroni, a światło zdradza. Kolejne już istnieją, gdzieś w ciemności. Wszystko w swoim czasie.',
    ctaTitle:'BUDUJMY\nRAZEM',ctaDesc:'Wydawcy, dystrybutorzy, współpracownicy, jesteśmy otwarci na wartościowe partnerstwa. Jeśli wierzysz w doświadczenia, które mają znaczenie, porozmawiajmy.',
    ctaBtn1:'Skontaktuj się',ctaBtn2:'Nasze prace',
    worksTitle:'NASZE\nPRACE',worksDesc:'Jeden zapowiedziany tytuł. Trzy projekty w cieniu. Każdy świat dostaje tyle czasu, ile zasługuje.',
    contactTitle:'KONTAKT',contactDesc:'Wydawcy, współpracownicy, prasa lub gracze, każda wiadomość otrzymuje odpowiedź w ciągu 48 godzin.',
    formTitle:'Wyślij nam wiadomość',
    lblFirst:'Imię *',lblLast:'Nazwisko *',lblEmail:'Adres e-mail *',lblCompany:'Firma / Studio',lblSubject:'Temat *',lblMessage:'Wiadomość *',lblLink:'Link do portfolio / press kit',
    subjectOpts:['Partnerstwo z wydawcą / Dystrybucja','Współpraca twórcza','Prasa i media','Aplikacja o pracę','Wsparcie gracza','Zgłoszenie błędu','Licencjonowanie i prawa','Inne'],
    formSubmit:'Wyślij wiadomość',formLegal:'Wysyłając ten formularz, wyrażasz zgodę na przetwarzanie danych w celu obsługi zapytania.',
    buyNow:'Kup',buyModal:'Dostępne na',detailBack:'← Powrót do prac',trailerBtn:'▶ Zwiastun',
    aboutHead:'O tytule',featuresHead:'Kluczowe cechy',ssHead:'Zrzuty ekranu',specsHead:'Wymagania systemowe',platHead:'Platformy',
    specMin:'Minimalne',specRec:'Zalecane',specOs:'System operacyjny',specCpu:'Procesor',specGpu:'Karta graficzna',specRam:'Pamięć',specStorage:'Magazyn',specDx:'DirectX',
    infoType:'Typ',infoYear:'Rok',infoStudio:'Studio',infoStatus:'Status',infoPrice:'Cena',
    contactInfoTitle:'Bezpośredni kontakt',
    footerDesc:'Niezależne studio gier tworzące interaktywne doświadczenia, które uczą, wzruszają i prześladują umysł.',
    footerNavTitle:'Nawigacja',footerWorksTitle:'Nasze prace',footerFollowTitle:'Obserwuj nas',copyright:'Wszelkie prawa zastrzeżone',
    free:'BEZPŁATNIE',langChange:'Zmień język',errRequired:'Wymagane',errEmail:'Wymagany prawidłowy adres e-mail',errRateLimit:'Zbyt wiele żądań, poczekaj kilka minut.',formSent:'Wysłano!',formOptional:'Opcjonalnie',formMsgHint:'Opowiedz nam o swoim projekcie...',
    worksEye:'Pełny Katalog',
    ctaEye:'Wydawcy i Partnerzy',
    contactEye:'Porozmawiajmy',
    aboutTitle:'O\nNAS',
    aboutEye:'Studio',
    aboutDesc:'GEEKLEARN GAMES to niezależne studio założone w 2026 roku w Blyes we Francji. Oto kto buduje te światy, i po co.',
    teamEye:'Zespół',
    teamTitle:'KIM\nJESTEŚMY',
    manifestoLabel:'Manifest Studia',
    manifestoQuote:'"Nie tworzymy gier.<br>Budujemy <em>światy, które zostawiają ślad</em> w ludziach, którzy je odwiedzają -<br>doświadczenia, które uczą, wzruszają i prześladują umysł długo po wyłączeniu ekranu."',
    awardsEye:'Nagrody i Wyróżnienia',
    awardsTitle:'DOCENIONA\nPRACA',
    priceTBA:'Cena zostanie podana później',
    artHead:'Grafiki koncepcyjne',
    trophiesTBA:'Ujawnione w dniu premiery',
    navGet:'Pobierz launcher',
    
    
    shopStatus:'Wkrótce',
    available:'Dostępne',
    searchLabel:'Szukaj gry',
    searchHint:'Zacznij wpisywać tytuł...',
    searchNoResults:'Brak wyników dla',
    accessRestricted:'Dostęp ograniczony',
    marqueeWords:['GeekLearn Games','Gry Wideo','Zał. 2026','Francja','Gry Które Uczą','Gry Które Wzruszają','Gry Które Prześladują'],
  },
  it:{
    nav:['Home','Le Nostre Opere','Chi Siamo','Contatto'],
    heroSlogan:'GIOCHI CHE <span class="hollow">INSEGNANO, COMMUOVONO,</span> OSSESSIONANO LA MENTE',
    studioQuote:'"Non sviluppiamo giochi.<br>Costruiamo mondi che<br><em>lasciano il segno.</em>"',
    studioBody1:'GEEKLEARN GAMES è uno studio indipendente dedicato alla creazione di esperienze interattive che fanno riflettere, commuovono e rimangono con te molto dopo che lo schermo si spegne.',
    studioBody2:'Il nostro primo mondo si chiama LUMBRA, un’avventura in bianco e nero dove l’ombra protegge e la luce espone. I prossimi esistono già, da qualche parte nel buio. Ogni cosa a suo tempo.',
    ctaTitle:'COSTRUIAMO\nINSIEME',ctaDesc:'Editori, distributori, collaboratori, siamo aperti a partnership significative. Se credi nelle esperienze che contano, parliamone.',
    ctaBtn1:'Contattaci',ctaBtn2:'Le nostre opere',
    worksTitle:'LE NOSTRE\nOPERE',worksDesc:'Un titolo annunciato. Tre progetti custoditi nell’ombra. Ogni mondo prende il tempo che merita.',
    contactTitle:'CONTATTO',contactDesc:'Editori, collaboratori, stampa o giocatori, ogni messaggio riceve risposta entro 48 ore.',
    formTitle:'Inviaci un messaggio',
    lblFirst:'Nome *',lblLast:'Cognome *',lblEmail:'Indirizzo email *',lblCompany:'Azienda / Studio',lblSubject:'Oggetto *',lblMessage:'Messaggio *',lblLink:'Link portfolio / cartella stampa',
    subjectOpts:['Partnership editore / Distribuzione','Collaborazione creativa','Stampa e Media','Candidatura','Supporto giocatore','Segnalazione bug','Licenze e Diritti','Altro'],
    formSubmit:'Invia messaggio',formLegal:'Inviando questo modulo accetti che i tuoi dati vengano utilizzati esclusivamente per elaborare la tua richiesta.',
    buyNow:'Acquista',buyModal:'Disponibile su',detailBack:'← Torna alle opere',trailerBtn:'▶ Trailer',
    aboutHead:'Descrizione',featuresHead:'Caratteristiche principali',ssHead:'Screenshot',specsHead:'Requisiti di sistema',platHead:'Piattaforme',
    specMin:'Minimi',specRec:'Consigliati',specOs:'Sistema operativo',specCpu:'Processore',specGpu:'Scheda grafica',specRam:'Memoria',specStorage:'Archiviazione',specDx:'DirectX',
    infoType:'Tipo',infoYear:'Anno',infoStudio:'Studio',infoStatus:'Stato',infoPrice:'Prezzo',
    contactInfoTitle:'Contatto diretto',
    footerDesc:'Studio di videogiochi indipendente che crea esperienze interattive che insegnano, commuovono e ossessionano la mente.',
    footerNavTitle:'Navigazione',footerWorksTitle:'Le Nostre Opere',footerFollowTitle:'Seguici',copyright:'Tutti i diritti riservati',
    free:'GRATUITO',langChange:'Cambia lingua',errRequired:'Obbligatorio',errEmail:'Email valida richiesta',errRateLimit:'Troppe richieste, attendi qualche minuto.',formSent:'Inviato!',formOptional:'Facoltativo',formMsgHint:'Raccontaci del tuo progetto...',
    worksEye:'Catalogo Completo',
    ctaEye:'Editori e Partner',
    contactEye:'Parliamo',
    aboutTitle:'CHI\nSIAMO',
    aboutEye:'Lo Studio',
    aboutDesc:'GEEKLEARN GAMES è uno studio indipendente fondato nel 2026 a Blyes, in Francia. Ecco chi costruisce questi mondi, e perché.',
    teamEye:'Il Team',
    teamTitle:'IL NOSTRO\nTEAM',
    manifestoLabel:'Manifesto dello Studio',
    manifestoQuote:'"Non sviluppiamo giochi.<br>Costruiamo <em>mondi che lasciano il segno</em> nelle persone che vi entrano -<br>esperienze che insegnano, commuovono e ossessionano la mente molto dopo che lo schermo si spegne."',
    awardsEye:'Premi e Riconoscimenti',
    awardsTitle:'LAVORO\nRICONOSCIUTO',
    priceTBA:'Prezzo in arrivo',
    artHead:'Artwork',
    trophiesTBA:'Svelati al lancio',
    navGet:'Scarica il launcher',
    
    
    shopStatus:'Prossimamente',
    available:'Disponibile',
    searchLabel:'Cerca un gioco',
    searchHint:'Inizia a digitare un titolo...',
    searchNoResults:'Nessun risultato per',
    accessRestricted:'Accesso limitato',
    marqueeWords:['GeekLearn Games','Videogiochi','Fond. 2026','Francia','Giochi Che Insegnano','Giochi Che Commuovono','Giochi Che Ossessionano'],
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
   GLG PATTERN, COLOR & ANIMATION CONFIGURATION
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

   CLASSES (cumulative, combine freely):
   ─────────────────────────────────────────────────────────────
   .glg-pattern            Required, enables the pattern
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
     brightness(0)       → fully dark (invisible, don't use)
     sepia(1) brightness(1.3) → warm amber

   FULL INLINE EXAMPLE:
   ─────────────────────────────────────────────────────────────
   <div class="glg-pattern glg-pat-visible glg-pat-pulse glg-line-both"
        style="--glg-size:220px; --glg-angle:18deg; --glg-filter:hue-rotate(45deg)">
     ... content ...
   </div>

   ══════════════════════════════════════════════ */
