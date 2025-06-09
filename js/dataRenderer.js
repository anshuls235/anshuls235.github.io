// Data Renderer Module
export class DataRenderer {
  constructor() {
    this.data = null;
  }

  async loadData() {
    try {
      const response = await fetch('data.json');
      this.data = await response.json();
      this.renderAll();
    } catch (error) {
      console.error('Error loading data:', error);
    }
  }

  renderAll() {
    if (!this.data) return;
    
    this.renderBasicInfo(this.data.basics);
    this.renderSocialLinks(this.data.basics.profiles);
    this.renderExperience(this.data.work);
    this.renderSkills(this.data.skills);
    this.renderProjects(this.data.projects);
    this.renderEducation(this.data.education);
    this.checkResume();
  }

  renderBasicInfo(basics) {
    // Update profile images
    document.querySelectorAll('#profile-image, #about-profile-image').forEach(img => {
      img.src = basics.image;
      img.alt = basics.name;
    });

    // Update text content
    const updates = {
      'navbar-logo': 'AS',
      'hero-name': basics.name,
      'footer-name': basics.name,
      'hero-title': basics.title,
      'hero-summary': basics.summary,
      'about-summary': basics.summary,
      'contact-email': basics.email,
      'contact-phone': basics.phone
    };

    Object.entries(updates).forEach(([id, content]) => {
      const element = document.getElementById(id);
      if (element) {
        element.textContent = content;
        
        // Set additional attributes for contact links
        if (id === 'contact-email') {
          element.href = `mailto:${basics.email}`;
        } else if (id === 'contact-phone') {
          element.href = `tel:${basics.phone.replace(/\s+/g, '')}`;
        }
      }
    });

    // Set navbar logo title
    const navbarLogo = document.getElementById('navbar-logo');
    if (navbarLogo) {
      navbarLogo.title = basics.name;
    }
  }

  renderSocialLinks(profiles) {
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
      if (!container) continue;
      
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

  renderExperience(jobs) {
    const container = document.getElementById('experience-timeline');
    if (!container) return;
    
    container.innerHTML = '';
    
    jobs.forEach(job => {
      const item = document.createElement('div');
      item.className = 'timeline-item fade-in';

      const content = document.createElement('div');
      content.className = 'timeline-content';

      const date = document.createElement('div');
      date.className = 'timeline-date';
      date.textContent = `${this.formatDate(job.startDate)} - ${job.endDate === 'Present' ? 'Present' : this.formatDate(job.endDate)}`;

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

  renderSkills(skills) {
    const container = document.getElementById('skills-grid');
    if (!container) return;
    
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

  renderProjects(projects) {
    const container = document.getElementById('projects-grid');
    if (!container) return;
    
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

  renderEducation(eduList) {
    const container = document.getElementById('education-list');
    if (!container) return;
    
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

  checkResume() {
    fetch('resume.pdf').then(res => {
      if (!res.ok) document.getElementById('resume-btn').style.display = 'none';
    }).catch(() => {
      document.getElementById('resume-btn').style.display = 'none';
    });
  }

  formatDate(ym) {
    if (!ym) return '';
    const [y, m] = ym.split('-');
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                   'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${months[parseInt(m, 10) - 1]} ${y}`;
  }
}
