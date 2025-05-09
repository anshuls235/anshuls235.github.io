// Wait for the DOM to be fully loaded
document.addEventListener('DOMContentLoaded', function() {
  // Get current year for footer
  document.getElementById('current-year').textContent = new Date().getFullYear();
  
  // Load data from data.json
  fetch('data.json')
    .then(response => response.json())
    .then(data => {
      // Initialize the site with the loaded data
      initializeSite(data);
    })
    .catch(error => {
      console.error('Error loading data:', error);
    });
  
  // Setup mobile menu toggle
  const menuToggle = document.getElementById('menu-toggle');
  const navbar = document.getElementById('navbar');
  const navbarMenu = document.getElementById('navbar-menu');
  const menuOverlay = document.getElementById('menu-overlay');
  
  menuToggle.addEventListener('click', function() {
    navbarMenu.classList.toggle('active');
    menuOverlay.classList.toggle('active');
    const icon = menuToggle.querySelector('i');
    icon.classList.toggle('fa-bars');
    icon.classList.toggle('fa-times');
  });
  
  menuOverlay.addEventListener('click', function() {
    navbarMenu.classList.remove('active');
    menuOverlay.classList.remove('active');
    const icon = menuToggle.querySelector('i');
    icon.classList.add('fa-bars');
    icon.classList.remove('fa-times');
  });
  
  // Close menu when clicking on menu items
  document.querySelectorAll('.navbar-link').forEach(link => {
    link.addEventListener('click', function() {
      navbarMenu.classList.remove('active');
      menuOverlay.classList.remove('active');
      const icon = menuToggle.querySelector('i');
      icon.classList.add('fa-bars');
      icon.classList.remove('fa-times');
    });
  });
  
  // Add scroll event listener for navbar
  window.addEventListener('scroll', function() {
    if (window.scrollY > 50) {
      navbar.classList.add('scrolled');
    } else {
      navbar.classList.remove('scrolled');
    }
    
    // Add active class to navbar links based on scroll position
    activateMenuAtScroll();
  });
  
  // Smooth scrolling for navigation links
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
      e.preventDefault();
      
      const targetId = this.getAttribute('href');
      
      if (targetId === '#') return;
      
      const targetElement = document.querySelector(targetId);
      
      window.scrollTo({
        top: targetElement.offsetTop - 70,
        behavior: 'smooth'
      });
    });
  });
});

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
  document.getElementById('hero-name').textContent = basics.name;
  document.getElementById('footer-name').textContent = basics.name;
  
  // Set title and summary
  document.getElementById('hero-title').textContent = basics.title;
  document.getElementById('hero-summary').textContent = basics.summary;
  document.getElementById('about-summary').textContent = basics.summary;
  
  // Set contact information
  document.getElementById('contact-email').textContent = basics.email;
  document.getElementById('contact-email').href = `mailto:${basics.email}`;
  
  document.getElementById('contact-phone').textContent = basics.phone;
  document.getElementById('contact-phone').href = `tel:${basics.phone.replace(/\s+/g, '')}`;
  
  // Set social profiles
  const socialIcons = {
    'GitHub': 'fab fa-github',
    'LinkedIn': 'fab fa-linkedin-in',
    'Medium': 'fab fa-medium-m',
    'Kaggle': 'fab fa-kaggle',
    'Twitter': 'fab fa-twitter',
    'Facebook': 'fab fa-facebook-f',
    'Instagram': 'fab fa-instagram'
  };
  
  const heroSocial = document.getElementById('hero-social');
  const footerSocial = document.getElementById('footer-social');
  const aboutProfiles = document.getElementById('about-profiles');
  
  basics.profiles.forEach(profile => {
    // Hero social
    const socialLink = document.createElement('a');
    socialLink.href = profile.url;
    socialLink.className = 'social-link';
    socialLink.target = '_blank';
    socialLink.rel = 'noopener noreferrer';
    socialLink.setAttribute('aria-label', profile.network);
    
    const socialIcon = document.createElement('i');
    socialIcon.className = socialIcons[profile.network] || 'fas fa-link';
    
    socialLink.appendChild(socialIcon);
    heroSocial.appendChild(socialLink);
    
    // Footer social
    const footerLink = document.createElement('a');
    footerLink.href = profile.url;
    footerLink.className = 'footer-social-link';
    footerLink.target = '_blank';
    footerLink.rel = 'noopener noreferrer';
    footerLink.setAttribute('aria-label', profile.network);
    
    const footerIcon = document.createElement('i');
    footerIcon.className = socialIcons[profile.network] || 'fas fa-link';
    
    footerLink.appendChild(footerIcon);
    footerSocial.appendChild(footerLink);
    
    // About profiles
    const profileBtn = document.createElement('a');
    profileBtn.href = profile.url;
    profileBtn.className = 'btn btn-outline';
    profileBtn.target = '_blank';
    profileBtn.rel = 'noopener noreferrer';
    profileBtn.style.marginRight = '0.5rem';
    profileBtn.style.marginBottom = '0.5rem';
    
    const profileIcon = document.createElement('i');
    profileIcon.className = socialIcons[profile.network] || 'fas fa-link';
    profileIcon.style.marginRight = '0.5rem';
    
    profileBtn.appendChild(profileIcon);
    profileBtn.appendChild(document.createTextNode(profile.network));
    aboutProfiles.appendChild(profileBtn);
  });
  
  // Set work experience
  const experienceTimeline = document.getElementById('experience-timeline');
  
  data.work.forEach((job, index) => {
    const timelineItem = document.createElement('div');
    timelineItem.className = 'timeline-item';
    
    const timelineDot = document.createElement('div');
    timelineDot.className = 'timeline-dot';
    
    const timelineContent = document.createElement('div');
    timelineContent.className = 'timeline-content';
    
    const dateRange = document.createElement('div');
    dateRange.className = 'timeline-date';
    
    // Format date
    const startDate = formatDate(job.startDate);
    const endDate = job.endDate === 'Present' ? 'Present' : formatDate(job.endDate);
    dateRange.textContent = `${startDate} - ${endDate}`;
    
    const jobTitle = document.createElement('h3');
    jobTitle.className = 'timeline-title';
    jobTitle.textContent = job.position;
    
    const company = document.createElement('h4');
    company.className = 'timeline-subtitle';
    company.textContent = `${job.company} | ${job.location}`;
    
    const highlights = document.createElement('div');
    highlights.className = 'timeline-body';
    
    const highlightsList = document.createElement('ul');
    
    job.highlights.forEach(highlight => {
      const item = document.createElement('li');
      item.textContent = highlight;
      highlightsList.appendChild(item);
    });
    
    highlights.appendChild(highlightsList);
    
    timelineContent.appendChild(dateRange);
    timelineContent.appendChild(jobTitle);
    timelineContent.appendChild(company);
    timelineContent.appendChild(highlights);
    
    timelineItem.appendChild(timelineDot);
    timelineItem.appendChild(timelineContent);
    
    experienceTimeline.appendChild(timelineItem);
  });
  
  // Set skills
  const skillsGrid = document.getElementById('skills-grid');
  
  data.skills.forEach(skillCategory => {
    const skillCard = document.createElement('div');
    skillCard.className = 'skill-card';
    
    const skillTitle = document.createElement('h3');
    skillTitle.className = 'skill-title';
    skillTitle.textContent = skillCategory.category;
    
    const skillList = document.createElement('div');
    skillList.className = 'skill-list';
    
    skillCategory.items.forEach(skill => {
      const skillItem = document.createElement('span');
      skillItem.className = 'skill-item';
      skillItem.textContent = skill;
      skillList.appendChild(skillItem);
    });
    
    skillCard.appendChild(skillTitle);
    skillCard.appendChild(skillList);
    
    skillsGrid.appendChild(skillCard);
  });
  
  // Set projects
  const projectsGrid = document.getElementById('projects-grid');
  
  data.projects.forEach(project => {
    const projectCard = document.createElement('div');
    projectCard.className = 'project-card';
    
    const projectBody = document.createElement('div');
    projectBody.className = 'project-body';
    
    const projectTitle = document.createElement('h3');
    projectTitle.className = 'project-title';
    projectTitle.textContent = project.name;
    
    const projectDescription = document.createElement('p');
    projectDescription.className = 'project-description';
    projectDescription.textContent = project.description;
    
    const projectTech = document.createElement('div');
    projectTech.className = 'project-tech';
    
    project.technologies.forEach(tech => {
      const techItem = document.createElement('span');
      techItem.className = 'project-tech-item';
      techItem.textContent = tech;
      projectTech.appendChild(techItem);
    });
    
    const projectFooter = document.createElement('div');
    projectFooter.className = 'project-footer';
    
    if (project.link) {
      const projectLink = document.createElement('a');
      projectLink.href = project.link;
      projectLink.className = 'btn btn-primary btn-small';
      projectLink.target = '_blank';
      projectLink.rel = 'noopener noreferrer';
      projectLink.textContent = 'View Project';
      projectFooter.appendChild(projectLink);
    }
    
    projectBody.appendChild(projectTitle);
    projectBody.appendChild(projectDescription);
    projectBody.appendChild(projectTech);
    projectBody.appendChild(projectFooter);
    
    projectCard.appendChild(projectBody);
    
    projectsGrid.appendChild(projectCard);
  });
  
  // Set education
  const educationList = document.getElementById('education-list');
  
  data.education.forEach(edu => {
    const educationItem = document.createElement('div');
    educationItem.className = 'education-item';
    
    const educationInfo = document.createElement('div');
    educationInfo.className = 'education-info';
    
    const educationDate = document.createElement('div');
    educationDate.className = 'education-date';
    educationDate.textContent = `${edu.startDate} - ${edu.endDate}`;
    
    const educationDegree = document.createElement('div');
    educationDegree.className = 'education-degree';
    educationDegree.textContent = edu.degree;
    
    const educationSchool = document.createElement('div');
    educationSchool.className = 'education-school';
    educationSchool.textContent = edu.institution;
    
    educationInfo.appendChild(educationDate);
    educationInfo.appendChild(educationDegree);
    educationInfo.appendChild(educationSchool);
    
    educationItem.appendChild(educationInfo);
    
    educationList.appendChild(educationItem);
  });
  
  // Check if resume.pdf exists, if not hide the download button
  fetch('resume.pdf')
    .then(response => {
      if (!response.ok) {
        document.getElementById('resume-btn').style.display = 'none';
      }
    })
    .catch(() => {
      document.getElementById('resume-btn').style.display = 'none';
    });
}

// Helper function to format date (YYYY-MM to Month Year)
function formatDate(dateString) {
  if (!dateString) return '';
  
  const [year, month] = dateString.split('-');
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  
  return `${months[parseInt(month) - 1] || ''} ${year}`;
}

// Function to activate the correct menu item based on scroll position
function activateMenuAtScroll() {
  const sections = document.querySelectorAll('section');
  const navLinks = document.querySelectorAll('.navbar-link');
  
  let currentSection = '';
  
  sections.forEach(section => {
    const sectionTop = section.offsetTop - 100;
    const sectionHeight = section.offsetHeight;
    const sectionId = section.getAttribute('id');
    
    if (window.scrollY >= sectionTop && window.scrollY < sectionTop + sectionHeight) {
      currentSection = sectionId;
    }
  });
  
  navLinks.forEach(link => {
    link.classList.remove('active');
    if (link.getAttribute('href') === `#${currentSection}`) {
      link.classList.add('active');
    }
  });
}

// Add intersection observer to animate elements when they come into view
document.addEventListener('DOMContentLoaded', function() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('fade-in');
        observer.unobserve(entry.target);
      }
    });
  }, {
    threshold: 0.1
  });
  
  document.querySelectorAll('.timeline-item, .skill-card, .project-card, .education-item').forEach(element => {
    observer.observe(element);
  });
});