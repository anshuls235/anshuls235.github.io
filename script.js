document.addEventListener('DOMContentLoaded', () => {
  initializeNavbar();
  loadData();
  setupSmoothScrolling();
  addScrollEffects();
});

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

    const dot = document.createElement('div');
    dot.className = 'timeline-dot';

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

    item.appendChild(dot);
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
      link.className = 'btn btn-primary btn-small';
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

  toggle.addEventListener('click', () => {
    menu.classList.toggle('active');
    overlay.classList.toggle('active');
    toggle.querySelector('i').classList.toggle('fa-bars');
    toggle.querySelector('i').classList.toggle('fa-times');
  });

  overlay.addEventListener('click', () => {
    menu.classList.remove('active');
    overlay.classList.remove('active');
    toggle.querySelector('i').classList.add('fa-bars');
    toggle.querySelector('i').classList.remove('fa-times');
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
