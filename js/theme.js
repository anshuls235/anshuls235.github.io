// Theme Management Module
export class ThemeManager {
  constructor() {
    this.themeToggle = null;
    this.html = document.documentElement;
    this.init();
  }

  init() {
    this.themeToggle = document.getElementById('theme-toggle');
    
    // Check for saved theme preference or default to light mode
    const savedTheme = localStorage.getItem('theme') || 'light';
    this.html.setAttribute('data-theme', savedTheme);
    
    if (this.themeToggle) {
      this.themeToggle.addEventListener('click', () => this.toggleTheme());
    }
  }

  toggleTheme() {
    const currentTheme = this.html.getAttribute('data-theme');
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    
    this.html.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    
    // Add theme transition effect
    document.body.style.transition = 'all 0.5s ease';
    setTimeout(() => {
      document.body.style.transition = '';
    }, 500);
  }

  getCurrentTheme() {
    return this.html.getAttribute('data-theme');
  }

  setTheme(theme) {
    this.html.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }
}
