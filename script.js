// GEEKLEARN GAMES - JAVASCRIPT
// Production-ready, bug-free code

/* ===============================================
   CONFIGURATION
=============================================== */
const CONFIG = {
    carousel: {
        autoPlay: true,
        delay: 5000,
        transitionDuration: 800
    }
};

const GAMES_DATA = {
    1: {
        title: "Cyber Legends",
        genre: "Action RPG • Cyberpunk",
        price: "59,99€",
        release: "15 Novembre 2024",
        platforms: "PC, PS5, Xbox Series X/S",
        pegi: "16+",
        image: "https://images.unsplash.com/photo-1538481199705-c710c4e965fc?w=1600&h=900&fit=crop&q=95",
        description: "Plongez dans un univers cyberpunk où la technologie et l'humanité fusionnent. Dans Cyber Legends, incarnez un mercenaire augmenté qui navigue entre les néons de Neo-Tokyo et les zones désolées de la périphérie. Votre choix façonnera l'avenir de l'humanité.",
        features: [
            "Monde ouvert dynamique de 150km²",
            "Système de combat innovant avec augmentations cybernétiques",
            "Plus de 200 heures de contenu avec fins multiples",
            "Ray-tracing et DLSS 3.0",
            "Mode coopératif 4 joueurs"
        ]
    },
    2: {
        title: "Shadow Realm",
        genre: "Survival Horror • Psychologique",
        price: "49,99€",
        release: "31 Octobre 2024",
        platforms: "PC, PS5, Xbox Series X/S",
        pegi: "18+",
        image: "https://images.unsplash.com/photo-1511512578047-dfb367046420?w=1600&h=900&fit=crop&q=95",
        description: "L'horreur psychologique atteint un nouveau sommet avec Shadow Realm. Explorez un manoir hanté où la réalité se déforme et vos peurs prennent vie. Chaque partie est unique grâce à notre système d'IA procédurale qui adapte les horreurs à votre psychologie.",
        features: [
            "Intelligence artificielle adaptative unique",
            "Environnements photorealistic avec Unreal Engine 5",
            "Audio spatial 3D pour une immersion totale",
            "Système de santé mentale affectant le gameplay",
            "Rejouabilité infinie avec niveaux procéduraux"
        ]
    },
    3: {
        title: "Velocity Drift",
        genre: "Racing • Futuriste",
        price: "39,99€",
        release: "20 Septembre 2024",
        platforms: "PC, PS5, Xbox Series X/S, Switch",
        pegi: "7+",
        image: "https://images.unsplash.com/photo-1552820728-8b83bb6b773f?w=1600&h=900&fit=crop&q=95",
        description: "Défoncez le mur du son dans le jeu de course futuriste le plus rapide jamais créé. Velocity Drift vous propulse à des vitesses hallucinantes dans des circuits anti-gravité spectaculaires. Maîtrisez l'art du drift parfait pour dominer la compétition mondiale.",
        features: [
            "60 véhicules entièrement personnalisables",
            "25 circuits dans des environnements futuristes époustouflants",
            "Mode carrière narrative immersive",
            "Multijoueur en ligne jusqu'à 32 joueurs",
            "Performance 4K/120fps sur consoles next-gen"
        ]
    },
    4: {
        title: "Echoes of War",
        genre: "Strategy • Tactical",
        price: "54,99€",
        release: "5 Août 2024",
        platforms: "PC, PS5, Xbox Series X/S",
        pegi: "16+",
        image: "https://images.unsplash.com/photo-1542751371-adc38448a05e?w=1600&h=900&fit=crop&q=95",
        description: "Commandant, l'avenir de l'humanité repose sur vos épaules. Echoes of War redéfinit le genre stratégique avec des batailles épiques à grande échelle, une profondeur tactique sans précédent et des décisions morales qui façonnent l'issue de la guerre.",
        features: [
            "Campagne solo de 60+ heures avec embranchements narratifs",
            "Batailles épiques jusqu'à 10000 unités simultanées",
            "Système de commandement révolutionnaire",
            "Multijoueur compétitif et coopératif",
            "Support modding avec outils de création intégrés"
        ]
    },
    5: {
        title: "Neon Knights",
        genre: "FPS • Cyberpunk",
        price: "29,99€",
        release: "12 Juillet 2024",
        platforms: "PC, PS5, Xbox Series X/S",
        pegi: "18+",
        image: "https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=1600&h=900&fit=crop&q=95",
        description: "Entrez dans l'arène cyberpunk la plus intense jamais créée. Neon Knights est un shooter multijoueur rapide et tactique où les réflexes et la stratégie d'équipe font toute la différence. Chaque seconde compte dans ce ballet mortel de néons et de balles.",
        features: [
            "12 héros uniques avec capacités spéciales",
            "Maps verticales innovantes avec parkour avancé",
            "Modes de jeu compétitifs et classés",
            "Système de progression et customisation profonds",
            "Support esport avec tournois officiels"
        ]
    }
};

/* ===============================================
   STATE
=============================================== */
let state = {
    currentSlide: 0,
    isAutoPlaying: CONFIG.carousel.autoPlay,
    autoPlayTimer: null
};

/* ===============================================
   NAVIGATION
=============================================== */
function initNavigation() {
    const navItems = document.querySelectorAll('.nav__item');
    const sections = document.querySelectorAll('.section');
    const logo = document.querySelector('.logo');
    
    // Navigation items
    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            
            const target = item.dataset.target;
            
            // Update active states
            navItems.forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            
            // Show target section
            sections.forEach(section => {
                if (section.id === target) {
                    section.classList.add('section--active');
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                } else {
                    section.classList.remove('section--active');
                }
            });
            
            // Reset carousel if navigating to games
            if (target === 'jeux') {
                setTimeout(() => {
                    resetCarousel();
                }, 100);
            }
        });
    });
    
    // Logo click
    logo.addEventListener('click', (e) => {
        e.preventDefault();
        const accueilLink = document.querySelector('[data-target="accueil"]');
        accueilLink.click();
    });
}

/* ===============================================
   CAROUSEL
=============================================== */
function initCarousel() {
    const track = document.querySelector('.carousel__track');
    const slides = document.querySelectorAll('.game');
    const prevBtn = document.querySelector('.carousel__btn--prev');
    const nextBtn = document.querySelector('.carousel__btn--next');
    const dotsContainer = document.querySelector('.carousel__dots');
    
    // Create dots
    slides.forEach((_, index) => {
        const dot = document.createElement('div');
        dot.classList.add('carousel__dot');
        if (index === 0) dot.classList.add('active');
        
        dot.addEventListener('click', () => {
            goToSlide(index);
            stopAutoPlay();
        });
        
        dotsContainer.appendChild(dot);
    });
    
    // Navigation buttons
    prevBtn.addEventListener('click', () => {
        previousSlide();
        stopAutoPlay();
    });
    
    nextBtn.addEventListener('click', () => {
        nextSlide();
        stopAutoPlay();
    });
    
    // Click on slide to open modal
    slides.forEach(slide => {
        slide.addEventListener('click', () => {
            const gameId = slide.dataset.id;
            openGameModal(gameId);
        });
    });
    
    // Auto-play
    if (CONFIG.carousel.autoPlay) {
        startAutoPlay();
    }
    
    // Pause on hover
    track.addEventListener('mouseenter', stopAutoPlay);
    track.addEventListener('mouseleave', () => {
        if (CONFIG.carousel.autoPlay) {
            startAutoPlay();
        }
    });
}

function goToSlide(index) {
    const track = document.querySelector('.carousel__track');
    const dots = document.querySelectorAll('.carousel__dot');
    const slides = document.querySelectorAll('.game');
    
    if (!track || !slides.length) return;
    
    state.currentSlide = index;
    
    // Calculate offset
    const slideWidth = slides[0].offsetWidth;
    const gap = 32; // 2rem = 32px
    const offset = -(slideWidth + gap) * state.currentSlide;
    
    // Apply transform
    track.style.transform = `translateX(${offset}px)`;
    
    // Update dots
    dots.forEach((dot, i) => {
        dot.classList.toggle('active', i === state.currentSlide);
    });
}

function nextSlide() {
    const slides = document.querySelectorAll('.game');
    state.currentSlide = (state.currentSlide + 1) % slides.length;
    goToSlide(state.currentSlide);
}

function previousSlide() {
    const slides = document.querySelectorAll('.game');
    state.currentSlide = (state.currentSlide - 1 + slides.length) % slides.length;
    goToSlide(state.currentSlide);
}

function startAutoPlay() {
    if (state.autoPlayTimer) return;
    
    state.autoPlayTimer = setInterval(() => {
        nextSlide();
    }, CONFIG.carousel.delay);
    
    state.isAutoPlaying = true;
}

function stopAutoPlay() {
    if (state.autoPlayTimer) {
        clearInterval(state.autoPlayTimer);
        state.autoPlayTimer = null;
    }
    state.isAutoPlaying = false;
}

function resetCarousel() {
    state.currentSlide = 0;
    goToSlide(0);
    
    if (CONFIG.carousel.autoPlay) {
        stopAutoPlay();
        startAutoPlay();
    }
}

/* ===============================================
   MODALS
=============================================== */
function openGameModal(gameId) {
    const modal = document.getElementById('gameModal');
    const game = GAMES_DATA[gameId];
    
    if (!game) {
        console.error('Game not found:', gameId);
        return;
    }
    
    // Populate modal
    document.getElementById('modalImg').src = game.image;
    document.getElementById('modalTitle').textContent = game.title;
    document.getElementById('modalGenre').textContent = game.genre;
    document.getElementById('modalDesc').textContent = game.description;
    document.getElementById('modalPrice').textContent = game.price;
    document.getElementById('modalRelease').textContent = game.release;
    document.getElementById('modalPlatforms').textContent = game.platforms;
    document.getElementById('modalPegi').textContent = game.pegi;
    
    // Features
    const featuresList = document.getElementById('modalFeatures');
    featuresList.innerHTML = '';
    game.features.forEach(feature => {
        const li = document.createElement('li');
        li.textContent = feature;
        featuresList.appendChild(li);
    });
    
    // Open modal
    openModal(modal);
}

function openModal(modal) {
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeModal(modal) {
    modal.classList.remove('active');
    document.body.style.overflow = '';
}

function initModals() {
    const gameModal = document.getElementById('gameModal');
    const platformModal = document.getElementById('platformModal');
    const buyBtn = document.getElementById('buyBtn');
    
    // Close buttons
    document.querySelectorAll('.modal__close').forEach(btn => {
        btn.addEventListener('click', () => {
            const modal = btn.closest('.modal');
            closeModal(modal);
        });
    });
    
    // Close on overlay click
    document.querySelectorAll('.modal__overlay').forEach(overlay => {
        overlay.addEventListener('click', () => {
            const modal = overlay.closest('.modal');
            closeModal(modal);
        });
    });
    
    // Buy button
    buyBtn.addEventListener('click', () => {
        closeModal(gameModal);
        setTimeout(() => {
            openModal(platformModal);
        }, 300);
    });
    
    // ESC key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const activeModal = document.querySelector('.modal.active');
            if (activeModal) {
                closeModal(activeModal);
            }
        }
    });
}

/* ===============================================
   FORMS
=============================================== */
function initForms() {
    const form = document.getElementById('contactForm');
    
    form.addEventListener('submit', (e) => {
        e.preventDefault();
        
        const name = document.getElementById('name').value;
        const email = document.getElementById('email').value;
        const message = document.getElementById('message').value;
        
        // Simulation
        console.log('Form submitted:', { name, email, message });
        
        alert(`Merci ${name} ! Votre message a été envoyé avec succès. Nous vous répondrons à ${email} dans les plus brefs délais.`);
        
        form.reset();
    });
}

/* ===============================================
   JOBS
=============================================== */
function initJobs() {
    const applyButtons = document.querySelectorAll('[data-job]');
    
    applyButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const job = btn.dataset.job;
            alert(`Candidature pour le poste de ${job} enregistrée ! Notre équipe RH vous contactera sous 48h.`);
        });
    });
}

/* ===============================================
   KEYBOARD NAVIGATION
=============================================== */
function initKeyboard() {
    document.addEventListener('keydown', (e) => {
        const jeuxSection = document.getElementById('jeux');
        if (!jeuxSection.classList.contains('section--active')) return;
        
        const activeModal = document.querySelector('.modal.active');
        if (activeModal) return;
        
        if (e.key === 'ArrowLeft') {
            previousSlide();
            stopAutoPlay();
        } else if (e.key === 'ArrowRight') {
            nextSlide();
            stopAutoPlay();
        }
    });
}

/* ===============================================
   PERFORMANCE
=============================================== */
function optimizePerformance() {
    // Debounce resize
    let resizeTimer;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            goToSlide(state.currentSlide);
        }, 250);
    });
    
    // Preload images
    Object.values(GAMES_DATA).forEach(game => {
        const img = new Image();
        img.src = game.image;
    });
}

/* ===============================================
   INITIALIZATION
=============================================== */
document.addEventListener('DOMContentLoaded', () => {
    initNavigation();
    initCarousel();
    initModals();
    initForms();
    initJobs();
    initKeyboard();
    optimizePerformance();
    
    console.log('GeekLearn Games - Site initialized');
});

// Cleanup
window.addEventListener('beforeunload', () => {
    stopAutoPlay();
});