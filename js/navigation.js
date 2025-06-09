// Navigation Management Module
export class NavigationManager {
  constructor() {
    this.navbar = null;
    this.menuToggle = null;
    this.menu = null;
    this.overlay = null;
    this.init();
  }

  init() {
    this.navbar = document.getElementById('navbar');
    this.menuToggle = document.getElementById('menu-toggle');
    this.menu = document.getElementById('navbar-menu');
    this.overlay = document.getElementById('menu-overlay');

    this.initMobileMenu();
    this.initSmoothScrolling();
    this.initScrollEffects();
  }

  initMobileMenu() {
    if (this.menuToggle && this.menu) {
      this.menuToggle.addEventListener('click', () => {
        this.menu.classList.toggle('active');
        if (this.overlay) this.overlay.classList.toggle('active');
        this.menuToggle.querySelector('i').classList.toggle('fa-bars');
        this.menuToggle.querySelector('i').classList.toggle('fa-times');
      });
    }

    if (this.overlay) {
      this.overlay.addEventListener('click', () => {
        this.menu.classList.remove('active');
        this.overlay.classList.remove('active');
        this.menuToggle.querySelector('i').classList.add('fa-bars');
        this.menuToggle.querySelector('i').classList.remove('fa-times');
      });
    }

    // Close menu when clicking nav links
    document.querySelectorAll('.navbar-link').forEach(link => {
      link.addEventListener('click', () => {
        if (this.menu) this.menu.classList.remove('active');
        if (this.overlay) this.overlay.classList.remove('active');
      });
    });
  }

  initSmoothScrolling() {
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

  initScrollEffects() {
    const sections = document.querySelectorAll('section');
    const links = document.querySelectorAll('.navbar-link');

    window.addEventListener('scroll', () => {
      // Navbar scroll effect
      if (this.navbar) {
        this.navbar.classList.toggle('scrolled', window.scrollY > 50);
      }
      
      // Active section highlighting
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
}
