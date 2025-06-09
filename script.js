// Enhanced Interactive Portfolio with Data Science Easter Eggs
// Global variables for animations and effects
let particlesArray = [];
let cursorTrails = [];
let konamiCode = [];
let matrixRain = null;

// Konami Code sequence (Up, Up, Down, Down, Left, Right, Left, Right, B, A)
const konamiSequence = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'KeyB', 'KeyA'];

// Data Science Easter Egg Data
const dataEasterEggs = {
  skills: {
    'Python': { confidence: 95, years: 9 },
    'Machine Learning': { confidence: 90, years: 8 },
    'Deep Learning': { confidence: 85, years: 6 },
    'Data Visualization': { confidence: 88, years: 7 },
    'Statistics': { confidence: 92, years: 8 },
    'SQL': { confidence: 90, years: 9 }
  },
  funFacts: [
    "I've trained over 1000 ML models! 🤖",
    "My largest dataset had 50M+ rows 📊",
    "I can identify overfitting from 100 meters away 👀",
    "Coffee ☕ → Code 💻 → Deploy 🚀 (my data pipeline)",
    "I dream in Python and think in SQL 🐍",
    "I've prevented more data leakage than a plumber 🔧"
  ],
  algorithms: ['Random Forest', 'XGBoost', 'Neural Networks', 'SVM', 'K-means', 'LSTM'],
  modelAccuracy: [0.95, 0.89, 0.92, 0.87, 0.94, 0.91]
};

// Theme Toggle Functionality
function initThemeToggle() {
  const themeToggle = document.getElementById('theme-toggle');
  const html = document.documentElement;
  
  // Check for saved theme preference or default to light mode
  const savedTheme = localStorage.getItem('theme') || 'light';
  html.setAttribute('data-theme', savedTheme);
  
  themeToggle.addEventListener('click', () => {
    const currentTheme = html.getAttribute('data-theme');
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    
    html.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    
    // Add theme transition effect
    document.body.style.transition = 'all 0.5s ease';
    setTimeout(() => {
      document.body.style.transition = '';
    }, 500);
  });
}

// Floating Particles Background
function createParticles() {
  const particlesContainer = document.createElement('div');
  particlesContainer.className = 'particles-container';
  document.body.appendChild(particlesContainer);
  
  function createParticle() {
    const particle = document.createElement('div');
    particle.className = 'particle';
    particle.style.left = Math.random() * 100 + '%';
    particle.style.animationDuration = (Math.random() * 10 + 10) + 's';
    particle.style.animationDelay = Math.random() * 5 + 's';
    particlesContainer.appendChild(particle);
    
    // Remove particle after animation
    setTimeout(() => {
      if (particle.parentNode) {
        particle.parentNode.removeChild(particle);
      }
    }, 20000);
  }
  
  // Create particles periodically
  setInterval(createParticle, 2000);
}

// Cursor Trail Effect
function initCursorTrail() {
  let trails = [];
  
  document.addEventListener('mousemove', (e) => {
    const trail = document.createElement('div');
    trail.className = 'cursor-trail';
    trail.style.left = e.clientX + 'px';
    trail.style.top = e.clientY + 'px';
    document.body.appendChild(trail);
    
    trails.push(trail);
    
    // Animate and remove trail
    setTimeout(() => {
      trail.style.opacity = '0';
      trail.style.transform = 'scale(0)';
    }, 50);
    
    setTimeout(() => {
      if (trail.parentNode) {
        trail.parentNode.removeChild(trail);
      }
      trails = trails.filter(t => t !== trail);
    }, 300);
    
    // Limit number of trails
    if (trails.length > 20) {
      const oldTrail = trails.shift();
      if (oldTrail.parentNode) {
        oldTrail.parentNode.removeChild(oldTrail);
      }
    }
  });
}

// Matrix Rain Effect
function createMatrixRain() {
  const matrixContainer = document.createElement('div');
  matrixContainer.className = 'matrix-rain';
  document.body.appendChild(matrixContainer);
  
  const characters = '01アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン';
  
  function createColumn() {
    const column = document.createElement('div');
    column.className = 'matrix-column';
    column.style.left = Math.random() * 100 + '%';
    column.style.animationDuration = (Math.random() * 5 + 10) + 's';
    
    let text = '';
    for (let i = 0; i < 20; i++) {
      text += characters.charAt(Math.floor(Math.random() * characters.length)) + '<br>';
    }
    column.innerHTML = text;
    
    matrixContainer.appendChild(column);
    
    setTimeout(() => {
      if (column.parentNode) {
        column.parentNode.removeChild(column);
      }
    }, 15000);
  }
  
  // Create columns periodically
  const interval = setInterval(createColumn, 500);
  
  return {
    start: () => {
      matrixContainer.classList.add('active');
    },
    stop: () => {
      matrixContainer.classList.remove('active');
      clearInterval(interval);
      setTimeout(() => {
        if (matrixContainer.parentNode) {
          matrixContainer.parentNode.removeChild(matrixContainer);
        }
      }, 1000);
    }
  };
}

// Konami Code Easter Egg
function initKonamiCode() {
  document.addEventListener('keydown', (e) => {
    konamiCode.push(e.code);
    
    // Keep only last 10 keys
    if (konamiCode.length > 10) {
      konamiCode.shift();
    }
    
    // Check if sequence matches
    if (konamiCode.length === 10 && 
        konamiCode.every((key, index) => key === konamiSequence[index])) {
      triggerKonamiEasterEgg();
      konamiCode = [];
    }
  });
}

function triggerKonamiEasterEgg() {
  // Rainbow animation
  document.body.classList.add('konami-active');
  
  // Matrix rain
  if (!matrixRain) {
    matrixRain = createMatrixRain();
  }
  matrixRain.start();
  
  // Show special message
  showEasterEggModal('🎉 Konami Code Activated! 🎉', 
    'You found the secret! As a fellow data scientist, you know that finding patterns is what we do best. Enjoy the matrix rain effect!', 
    'konami');
  
  setTimeout(() => {
    document.body.classList.remove('konami-active');
    if (matrixRain) {
      matrixRain.stop();
      matrixRain = null;
    }
  }, 10000);
}

// Data Science Easter Eggs
function initDataScienceEasterEggs() {
  // Triple click on skills triggers skill confidence chart
  document.addEventListener('click', handleTripleClick);
  
  // Double click on profile image shows fun facts
  const profileImage = document.getElementById('profile-image');
  if (profileImage) {
    let clickCount = 0;
    profileImage.addEventListener('click', () => {
      clickCount++;
      if (clickCount === 2) {
        showDataScienceFacts();
        clickCount = 0;
      }
      setTimeout(() => { clickCount = 0; }, 500);
    });
  }
  
  // Secret data science quiz (click 5 times on navbar logo)
  const navbarLogo = document.getElementById('navbar-logo');
  if (navbarLogo) {
    let logoClicks = 0;
    navbarLogo.addEventListener('click', (e) => {
      e.preventDefault();
      logoClicks++;
      if (logoClicks === 5) {
        startDataScienceQuiz();
        logoClicks = 0;
      }
      setTimeout(() => { logoClicks = 0; }, 2000);
    });
  }
}

let clickTimes = [];
function handleTripleClick(e) {
  if (e.target.classList.contains('skill-item')) {
    clickTimes.push(Date.now());
    
    // Keep only last 3 clicks
    if (clickTimes.length > 3) {
      clickTimes.shift();
    }
    
    // Check if 3 clicks within 1 second
    if (clickTimes.length === 3 && 
        clickTimes[2] - clickTimes[0] < 1000) {
      showSkillConfidenceChart();
      clickTimes = [];
    }
  }
}

function showSkillConfidenceChart() {
  const chartHTML = `
    <h3>🧠 My Data Science Skill Confidence Levels</h3>
    <div class="chart-container">
      <div class="bar-chart">
        ${Object.entries(dataEasterEggs.skills).map(([skill, data]) => 
          `<div class="bar" style="height: ${data.confidence}%" data-value="${data.confidence}%"></div>`
        ).join('')}
      </div>
    </div>
    <div style="display: flex; justify-content: space-between; margin-top: 1rem; font-size: 0.8rem;">
      ${Object.keys(dataEasterEggs.skills).map(skill => 
        `<span>${skill}</span>`
      ).join('')}
    </div>
    <p style="margin-top: 1rem; font-size: 0.9rem; color: var(--accent);">
      Built from ${Object.values(dataEasterEggs.skills).reduce((sum, s) => sum + s.years, 0)} years of combined experience! 📊
    </p>
  `;
  
  showEasterEggModal('📊 Skill Analytics Dashboard', chartHTML, 'chart');
}

function showDataScienceFacts() {
  const randomFact = dataEasterEggs.funFacts[Math.floor(Math.random() * dataEasterEggs.funFacts.length)];
  const factHTML = `
    <h3>🤓 Data Science Fun Fact</h3>
    <p style="font-size: 1.2rem; margin: 2rem 0;">${randomFact}</p>
    <div style="display: flex; justify-content: space-around; margin-top: 2rem;">
      <div style="text-align: center;">
        <div style="font-size: 2rem;">🤖</div>
        <div>1000+ Models</div>
      </div>
      <div style="text-align: center;">
        <div style="font-size: 2rem;">📊</div>
        <div>50M+ Rows</div>
      </div>
      <div style="text-align: center;">
        <div style="font-size: 2rem;">☕</div>
        <div>∞ Coffee</div>
      </div>
    </div>
  `;
  
  showEasterEggModal('🎯 Data Detective Stats', factHTML, 'facts');
}

function startDataScienceQuiz() {
  const questions = [
    {
      question: "What's the best way to prevent overfitting?",
      options: ["More data", "Cross-validation", "Regularization", "All of the above"],
      correct: 3,
      explanation: "All methods help prevent overfitting! More data provides better generalization, cross-validation helps detect overfitting, and regularization constrains model complexity."
    },
    {
      question: "Which metric is best for imbalanced datasets?",
      options: ["Accuracy", "Precision", "F1-Score", "ROC-AUC"],
      correct: 2,
      explanation: "F1-Score balances precision and recall, making it ideal for imbalanced datasets where accuracy can be misleading."
    },
    {
      question: "What does 'data leakage' mean?",
      options: ["Missing data", "Future info in training", "Too much data", "Bad data quality"],
      correct: 1,
      explanation: "Data leakage occurs when future information accidentally gets into your training data, leading to unrealistically good performance that won't generalize."
    }
  ];
  
  let currentQuestion = 0;
  let score = 0;
  
  function showQuestion() {
    const q = questions[currentQuestion];
    const quizHTML = `
      <h3>🧪 Data Science Pop Quiz</h3>
      <p><strong>Question ${currentQuestion + 1}/${questions.length}:</strong></p>
      <p style="margin: 1rem 0; font-size: 1.1rem;">${q.question}</p>
      <div style="display: grid; gap: 0.5rem; margin: 1rem 0;">
        ${q.options.map((option, index) => 
          `<button class="quiz-option" data-index="${index}" style="padding: 0.75rem; border: 1px solid var(--border-color); border-radius: var(--radius); background: var(--background); cursor: pointer; transition: var(--transition);">
            ${String.fromCharCode(65 + index)}. ${option}
          </button>`
        ).join('')}
      </div>
      <div style="margin-top: 1rem; font-size: 0.9rem; color: var(--accent);">
        Score: ${score}/${currentQuestion}
      </div>
    `;
    
    showEasterEggModal('🎓 Test Your Data Science Knowledge', quizHTML, 'quiz');
    
    // Add click handlers for quiz options
    document.querySelectorAll('.quiz-option').forEach(button => {
      button.addEventListener('click', (e) => {
        const selectedIndex = parseInt(e.target.dataset.index);
        handleQuizAnswer(selectedIndex, q);
      });
      
      button.addEventListener('mouseenter', (e) => {
        e.target.style.background = 'var(--primary-color)';
        e.target.style.color = 'white';
      });
      
      button.addEventListener('mouseleave', (e) => {
        e.target.style.background = 'var(--background)';
        e.target.style.color = 'var(--text-color)';
      });
    });
  }
  
  function handleQuizAnswer(selectedIndex, question) {
    const isCorrect = selectedIndex === question.correct;
    if (isCorrect) score++;
    
    const resultHTML = `
      <h3>${isCorrect ? '✅ Correct!' : '❌ Not quite!'}</h3>
      <p style="margin: 1rem 0;">${question.explanation}</p>
      <div style="margin-top: 2rem;">
        ${currentQuestion < questions.length - 1 ? 
          '<button id="next-question" class="btn">Next Question</button>' :
          `<div>
            <h4>🎉 Quiz Complete!</h4>
            <p>Final Score: ${score}/${questions.length}</p>
            <p>${score === questions.length ? 'Perfect! You\'re a data science wizard! 🧙‍♂️' : 
                score >= questions.length * 0.7 ? 'Great job! You know your stuff! 👏' : 
                'Keep learning! Data science is a journey! 📚'}</p>
          </div>`
        }
      </div>
    `;
    
    showEasterEggModal('📊 Quiz Result', resultHTML, 'quiz-result');
    
    if (currentQuestion < questions.length - 1) {
      document.getElementById('next-question')?.addEventListener('click', () => {
        currentQuestion++;
        showQuestion();
      });
    }
  }
  
  showQuestion();
}

function showEasterEggModal(title, content, type) {
  // Remove existing modal
  const existingModal = document.querySelector('.easter-egg-modal');
  if (existingModal) {
    existingModal.remove();
  }
  
  const modal = document.createElement('div');
  modal.className = 'easter-egg-modal';
  modal.innerHTML = `
    <div class="easter-egg-content">
      <button class="close-btn">&times;</button>
      <div class="easter-egg-body">
        ${typeof content === 'string' ? content : content.outerHTML || content}
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  // Show modal with animation
  setTimeout(() => modal.classList.add('active'), 10);
  
  // Close functionality
  const closeBtn = modal.querySelector('.close-btn');
  const closeModal = () => {
    modal.classList.remove('active');
    setTimeout(() => modal.remove(), 300);
  };
  
  closeBtn.addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });
  
  // Auto-close after 15 seconds (except quiz)
  if (type !== 'quiz' && type !== 'quiz-result') {
    setTimeout(closeModal, 15000);
  }
}

// Intersection Observer for animations
function initScrollAnimations() {
  const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
  };
  
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
      }
    });
  }, observerOptions);
  
  // Observe all fade-in elements
  document.querySelectorAll('.fade-in').forEach(el => {
    observer.observe(el);
  });
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  initThemeToggle();
  initializeNavbar();
  loadData();
  setupSmoothScrolling();
  addScrollEffects();
  setCurrentYear();
  
  // Initialize enhanced features
  createParticles();
  initCursorTrail();
  initKonamiCode();
  initDataScienceEasterEggs();
  initScrollAnimations();
  
  // Add some flair to the loading
  document.body.style.opacity = '0';
  setTimeout(() => {
    document.body.style.transition = 'opacity 0.5s ease';
    document.body.style.opacity = '1';
  }, 100);
});

function setCurrentYear() {
  const yearElement = document.getElementById('current-year');
  if (yearElement) {
    yearElement.textContent = new Date().getFullYear();
  }
}

function loadData() {
  fetch('data.json')
    .then(res => res.json())
    .then(data => renderSite(data))
    .catch(err => console.error('Error loading data:', err));
}

function renderSite(data) {
  renderBasicInfo(data.basics);
  renderSocialLinks(data.basics.profiles);
  renderExperience(data.work);
  renderSkills(data.skills);
  renderProjects(data.projects);
  renderEducation(data.education);
  checkResume();
}

// ========== Render Functions ==========

function renderBasicInfo(basics) {
  document.querySelectorAll('#profile-image, #about-profile-image').forEach(img => {
    img.src = basics.image;
    img.alt = basics.name;
  });

  document.getElementById('navbar-logo').textContent = 'AS';
  document.getElementById('navbar-logo').title = basics.name;
  document.getElementById('hero-name').textContent = basics.name;
  document.getElementById('footer-name').textContent = basics.name;
  document.getElementById('hero-title').textContent = basics.title;
  document.getElementById('hero-summary').textContent = basics.summary;
  document.getElementById('about-summary').textContent = basics.summary;
  document.getElementById('contact-email').textContent = basics.email;
  document.getElementById('contact-email').href = `mailto:${basics.email}`;
  document.getElementById('contact-phone').textContent = basics.phone;
  document.getElementById('contact-phone').href = `tel:${basics.phone.replace(/\s+/g, '')}`;
}

function renderSocialLinks(profiles) {
  const iconMap = {
    GitHub: 'fab fa-github',
    LinkedIn: 'fab fa-linkedin-in',
    Medium: 'fab fa-medium-m',
    Kaggle: 'fab fa-kaggle'
  };

  const socialTargets = {
    'hero-social': 'social-link',
    'footer-social': 'footer-social-link',
    'about-profiles': 'btn btn-outline'
  };

  for (const id in socialTargets) {
    const container = document.getElementById(id);
    container.innerHTML = '';

    profiles.forEach(profile => {
      const icon = iconMap[profile.network] || 'fas fa-link';
      const link = document.createElement('a');
      link.href = profile.url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.setAttribute('aria-label', profile.network);
      link.className = socialTargets[id];

      const i = document.createElement('i');
      i.className = icon;
      if (id === 'about-profiles') {
        i.style.marginRight = '0.5rem';
        link.appendChild(i);
        link.appendChild(document.createTextNode(profile.network));
        link.style.marginRight = '0.5rem';
        link.style.marginBottom = '0.5rem';
      } else {
        link.appendChild(i);
      }

      container.appendChild(link);
    });
  }
}

function renderExperience(jobs) {
  const container = document.getElementById('experience-timeline');
  container.innerHTML = '';
  jobs.forEach(job => {
    const item = document.createElement('div');
    item.className = 'timeline-item fade-in';

    const content = document.createElement('div');
    content.className = 'timeline-content';

    const date = document.createElement('div');
    date.className = 'timeline-date';
    date.textContent = `${formatDate(job.startDate)} - ${job.endDate === 'Present' ? 'Present' : formatDate(job.endDate)}`;

    const title = document.createElement('h3');
    title.className = 'timeline-title';
    title.textContent = job.position;

    const subtitle = document.createElement('h4');
    subtitle.className = 'timeline-subtitle';
    subtitle.textContent = `${job.company} | ${job.location}`;

    const body = document.createElement('div');
    body.className = 'timeline-body';
    const ul = document.createElement('ul');
    job.highlights.forEach(point => {
      const li = document.createElement('li');
      li.textContent = point;
      ul.appendChild(li);
    });
    body.appendChild(ul);

    content.appendChild(date);
    content.appendChild(title);
    content.appendChild(subtitle);
    content.appendChild(body);

    item.appendChild(content);
    container.appendChild(item);
  });
}

function renderSkills(skills) {
  const container = document.getElementById('skills-grid');
  container.innerHTML = '';
  skills.forEach(cat => {
    const card = document.createElement('div');
    card.className = 'skill-card fade-in';

    const title = document.createElement('h3');
    title.className = 'skill-title';
    title.textContent = cat.category;

    const list = document.createElement('div');
    list.className = 'skill-list';
    cat.items.forEach(skill => {
      const span = document.createElement('span');
      span.className = 'skill-item';
      span.textContent = skill;
      span.title = 'Triple-click for surprise! 🎯';
      list.appendChild(span);
    });

    card.appendChild(title);
    card.appendChild(list);
    container.appendChild(card);
  });
}

function renderProjects(projects) {
  const container = document.getElementById('projects-grid');
  container.innerHTML = '';
  projects.forEach(project => {
    const card = document.createElement('div');
    card.className = 'project-card fade-in';

    const body = document.createElement('div');
    body.className = 'project-body';

    const title = document.createElement('h3');
    title.className = 'project-title';
    title.textContent = project.name;

    const desc = document.createElement('p');
    desc.className = 'project-description';
    desc.textContent = project.description;

    const tech = document.createElement('div');
    tech.className = 'project-tech';
    project.technologies.forEach(t => {
      const tag = document.createElement('span');
      tag.className = 'project-tech-item';
      tag.textContent = t;
      tech.appendChild(tag);
    });

    const footer = document.createElement('div');
    footer.className = 'project-footer';
    if (project.link) {
      const link = document.createElement('a');
      link.href = project.link;
      link.className = 'btn';
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = 'View Project';
      footer.appendChild(link);
    }

    body.appendChild(title);
    body.appendChild(desc);
    body.appendChild(tech);
    body.appendChild(footer);
    card.appendChild(body);
    container.appendChild(card);
  });
}

function renderEducation(eduList) {
  const container = document.getElementById('education-list');
  container.innerHTML = '';
  eduList.forEach(edu => {
    const item = document.createElement('div');
    item.className = 'education-item fade-in';

    const info = document.createElement('div');
    info.className = 'education-info';

    const date = document.createElement('div');
    date.className = 'education-date';
    date.textContent = `${edu.startDate} - ${edu.endDate}`;

    const degree = document.createElement('div');
    degree.className = 'education-degree';
    degree.textContent = edu.degree;

    const school = document.createElement('div');
    school.className = 'education-school';
    school.textContent = edu.institution;

    info.appendChild(date);
    info.appendChild(degree);
    info.appendChild(school);
    item.appendChild(info);
    container.appendChild(item);
  });
}

function checkResume() {
  fetch('resume.pdf').then(res => {
    if (!res.ok) document.getElementById('resume-btn').style.display = 'none';
  }).catch(() => {
    document.getElementById('resume-btn').style.display = 'none';
  });
}

function formatDate(ym) {
  if (!ym) return '';
  const [y, m] = ym.split('-');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[parseInt(m, 10) - 1]} ${y}`;
}

// ========== Navigation Features ==========

function initializeNavbar() {
  const toggle = document.getElementById('menu-toggle');
  const menu = document.getElementById('navbar-menu');
  const overlay = document.getElementById('menu-overlay');

  if (toggle && menu) {
    toggle.addEventListener('click', () => {
      menu.classList.toggle('active');
      if (overlay) overlay.classList.toggle('active');
      toggle.querySelector('i').classList.toggle('fa-bars');
      toggle.querySelector('i').classList.toggle('fa-times');
    });
  }

  if (overlay) {
    overlay.addEventListener('click', () => {
      menu.classList.remove('active');
      overlay.classList.remove('active');
      toggle.querySelector('i').classList.add('fa-bars');
      toggle.querySelector('i').classList.remove('fa-times');
    });
  }

  document.querySelectorAll('.navbar-link').forEach(link => {
    link.addEventListener('click', () => {
      if (menu) menu.classList.remove('active');
      if (overlay) overlay.classList.remove('active');
    });
  });
}

function setupSmoothScrolling() {
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', e => {
      e.preventDefault();
      const el = document.querySelector(anchor.getAttribute('href'));
      if (el) {
        window.scrollTo({
          top: el.offsetTop - 70,
          behavior: 'smooth'
        });
      }
    });
  });
}

function addScrollEffects() {
  const navbar = document.getElementById('navbar');
  const sections = document.querySelectorAll('section');
  const links = document.querySelectorAll('.navbar-link');

  window.addEventListener('scroll', () => {
    if (navbar) {
      navbar.classList.toggle('scrolled', window.scrollY > 50);
    }
    
    let current = '';
    sections.forEach(section => {
      const top = section.offsetTop - 100;
      const bottom = top + section.offsetHeight;
      if (window.scrollY >= top && window.scrollY < bottom) {
        current = section.getAttribute('id');
      }
    });
    
    links.forEach(link => {
      link.classList.remove('active');
      if (link.getAttribute('href') === `#${current}`) {
        link.classList.add('active');
      }
    });
  });
}