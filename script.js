// script.js - Modular, enhanced for readability and scalability

document.addEventListener('DOMContentLoaded', () => {
  initializeNavbar();
  loadData();
  setupSmoothScrolling();
  addScrollEffects();
});

<<<<<<< HEAD
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

function renderBasicInfo(basics) {
  document.querySelectorAll('#profile-image, #about-profile-image').forEach(img => {
    img.src = basics.image;
    img.alt = basics.name;
  });
  document.getElementById('navbar-logo').textContent = 'AS';
  document.getElementById('navbar-logo').title = basics.name;
=======
// Function to initialize the site with data
function initializeSite(data) {
  // Set basic information
  const basics = data.basics;
  
  // Set profile image (only hero section now)
  const profileImage = document.getElementById('profile-image');
  if (profileImage) {
    profileImage.src = basics.image;
    profileImage.alt = basics.name;
  }
  
  // Set name in various places
  document.getElementById('navbar-logo').textContent = "AS"; // Use initials for a clean look
  document.getElementById('navbar-logo').setAttribute('title', basics.name); // Add tooltip with full name
>>>>>>> 340dc218388b48275fe651e336d3eb37c5729397
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

  ['hero-social', 'footer-social', 'about-profiles'].forEach(id => document.getElementById(id).innerHTML = '');

  profiles.forEach(p => {
    const icon = iconMap[p.network] || 'fas fa-link';
    const linkHTML = `<a href="${p.url}" class="${id => id.includes('footer') ? 'footer-social-link' : 'social-link'}" target="_blank" aria-label="${p.network}"><i class="${icon}"></i></a>`;
    document.getElementById('hero-social').insertAdjacentHTML('beforeend', linkHTML);
    document.getElementById('footer-social').insertAdjacentHTML('beforeend', linkHTML);
    const aboutBtn = `<a href="${p.url}" class="btn btn-outline" target="_blank"><i class="${icon}"></i> ${p.network}</a>`;
    document.getElementById('about-profiles').insertAdjacentHTML('beforeend', aboutBtn);
  });
}

function renderExperience(jobs) {
  const timeline = document.getElementById('experience-timeline');
  timeline.innerHTML = '';
  jobs.forEach(job => {
    const start = formatDate(job.startDate);
    const end = job.endDate === 'Present' ? 'Present' : formatDate(job.endDate);
    const highlights = job.highlights.map(item => `<li>${item}</li>`).join('');
    const html = `
      <div class="timeline-item fade-in">
        <div class="timeline-dot"></div>
        <div class="timeline-content">
          <div class="timeline-date">${start} - ${end}</div>
          <h3 class="timeline-title">${job.position}</h3>
          <h4 class="timeline-subtitle">${job.company} | ${job.location}</h4>
          <div class="timeline-body"><ul>${highlights}</ul></div>
        </div>
      </div>`;
    timeline.insertAdjacentHTML('beforeend', html);
  });
}

function renderSkills(skills) {
  const container = document.getElementById('skills-grid');
  container.innerHTML = '';
  skills.forEach(cat => {
    const items = cat.items.map(skill => `<span class="skill-item">${skill}</span>`).join('');
    container.insertAdjacentHTML('beforeend', `
      <div class="skill-card fade-in">
        <h3 class="skill-title">${cat.category}</h3>
        <div class="skill-list">${items}</div>
      </div>`);
  });
}

function renderProjects(projects) {
  const container = document.getElementById('projects-grid');
  container.innerHTML = '';
  projects.forEach(project => {
    const tech = project.technologies.map(t => `<span class="project-tech-item">${t}</span>`).join('');
    const link = project.link ? `<a href="${project.link}" class="btn btn-primary btn-small" target="_blank">View Project</a>` : '';
    container.insertAdjacentHTML('beforeend', `
      <div class="project-card fade-in">
        <div class="project-body">
          <h3 class="project-title">${project.name}</h3>
          <p class="project-description">${project.description}</p>
          <div class="project-tech">${tech}</div>
          <div class="project-footer">${link}</div>
        </div>
      </div>`);
  });
}

function renderEducation(edus) {
  const container = document.getElementById('education-list');
  container.innerHTML = '';
  edus.forEach(edu => {
    container.insertAdjacentHTML('beforeend', `
      <div class="education-item fade-in">
        <div class="education-info">
          <div class="education-date">${edu.startDate} - ${edu.endDate}</div>
          <div class="education-degree">${edu.degree}</div>
          <div class="education-school">${edu.institution}</div>
        </div>
      </div>`);
  });
}

function checkResume() {
  fetch('resume.pdf').then(res => {
    if (!res.ok) document.getElementById('resume-btn').style.display = 'none';
  }).catch(() => document.getElementById('resume-btn').style.display = 'none');
}

function formatDate(ym) {
  if (!ym) return '';
  const [y, m] = ym.split('-');
  return `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][parseInt(m)-1]} ${y}`;
}

function initializeNavbar() {
  const toggle = document.getElementById('menu-toggle');
  const menu = document.getElementById('navbar-menu');
  const overlay = document.getElementById('menu-overlay');
  toggle.addEventListener('click', () => {
    menu.classList.toggle('active');
    overlay.classList.toggle('active');
    const icon = toggle.querySelector('i');
    icon.classList.toggle('fa-bars');
    icon.classList.toggle('fa-times');
  });
  overlay.addEventListener('click', () => {
    menu.classList.remove('active');
    overlay.classList.remove('active');
    const icon = toggle.querySelector('i');
    icon.classList.add('fa-bars');
    icon.classList.remove('fa-times');
  });
  document.querySelectorAll('.navbar-link').forEach(link => {
    link.addEventListener('click', () => {
      menu.classList.remove('active');
      overlay.classList.remove('active');
    });
  });
}

function setupSmoothScrolling() {
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', e => {
      e.preventDefault();
      const el = document.querySelector(anchor.getAttribute('href'));
      window.scrollTo({ top: el.offsetTop - 70, behavior: 'smooth' });
    });
  });
}

function addScrollEffects() {
  const navbar = document.getElementById('navbar');
  const sections = document.querySelectorAll('section');
  const links = document.querySelectorAll('.navbar-link');
  window.addEventListener('scroll', () => {
    navbar.classList.toggle('scrolled', window.scrollY > 50);
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
