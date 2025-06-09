// Main Application Entry Point
import { ThemeManager } from './js/theme.js';
import { NavigationManager } from './js/navigation.js';
import { VisualEffects } from './js/visualEffects.js';
import { EasterEggs } from './js/easterEggs.js';
import { DataRenderer } from './js/dataRenderer.js';
import { Utils } from './js/utils.js';

class PortfolioApp {
  constructor() {
    this.themeManager = null;
    this.navigationManager = null;
    this.visualEffects = null;
    this.easterEggs = null;
    this.dataRenderer = null;
    this.isLoaded = false;
  }

  async init() {
    try {
      // Show loading state
      this.showLoadingState();

      // Initialize core utilities first
      Utils.setCurrentYear();
      Utils.initializeAccessibility();
      Utils.setupPerformanceOptimizations();

      // Initialize theme management
      this.themeManager = new ThemeManager();

      // Initialize navigation
      this.navigationManager = new NavigationManager();

      // Initialize visual effects
      this.visualEffects = new VisualEffects();

      // Initialize Easter eggs (depends on visual effects)
      this.easterEggs = new EasterEggs(this.visualEffects);

      // Initialize data renderer and load content
      this.dataRenderer = new DataRenderer();
      await this.dataRenderer.loadData();

      // Setup additional utilities
      Utils.addBackToTopButton();

      // Mark as loaded and hide loading state
      this.isLoaded = true;
      this.hideLoadingState();

      // Track page load
      Utils.trackAnalytics('page_load', 'engagement', 'portfolio_loaded', 'homepage');

      console.log('✅ Portfolio application initialized successfully!');
      
    } catch (error) {
      console.error('❌ Error initializing portfolio:', error);
      Utils.showNotification('Failed to load portfolio. Please refresh the page.', 'error');
    }
  }

  showLoadingState() {
    // Add smooth fade-in effect
    document.body.style.opacity = '0';
    document.body.style.transition = 'opacity 0.5s ease';
  }

  hideLoadingState() {
    // Reveal the page with animation
    setTimeout(() => {
      document.body.style.opacity = '1';
    }, 100);

    // Add subtle entrance animation to hero section
    const hero = document.querySelector('.hero');
    if (hero) {
      hero.style.transform = 'translateY(20px)';
      hero.style.opacity = '0';
      hero.style.transition = 'all 0.8s ease';
      
      setTimeout(() => {
        hero.style.transform = 'translateY(0)';
        hero.style.opacity = '1';
      }, 200);
    }
  }

  // Public methods for external access
  getTheme() {
    return this.themeManager?.getCurrentTheme();
  }

  setTheme(theme) {
    this.themeManager?.setTheme(theme);
  }

  triggerMatrixEffect() {
    this.visualEffects?.triggerMatrixEffect();
  }

  showNotification(message, type, duration) {
    return Utils.showNotification(message, type, duration);
  }

  // Handle application errors gracefully
  handleError(error, context = 'Unknown') {
    console.error(`Portfolio Error [${context}]:`, error);
    
    // Don't overwhelm user with notifications
    if (!this.lastErrorTime || Date.now() - this.lastErrorTime > 5000) {
      Utils.showNotification(
        'Something went wrong. The page should still work normally.', 
        'warning',
        4000
      );
      this.lastErrorTime = Date.now();
    }
  }

  // Cleanup method for SPA navigation (if needed in future)
  destroy() {
    // Remove event listeners and clean up resources
    if (this.visualEffects) {
      // Stop any running animations
    }
    
    if (this.easterEggs) {
      // Clean up easter egg listeners
    }
    
    console.log('Portfolio application cleaned up');
  }
}

// Global error handler
window.addEventListener('error', (event) => {
  if (window.portfolioApp) {
    window.portfolioApp.handleError(event.error, 'Global');
  }
});

// Handle unhandled promise rejections
window.addEventListener('unhandledrejection', (event) => {
  if (window.portfolioApp) {
    window.portfolioApp.handleError(event.reason, 'Promise');
  }
  event.preventDefault();
});

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', async () => {
  try {
    window.portfolioApp = new PortfolioApp();
    await window.portfolioApp.init();
  } catch (error) {
    console.error('Failed to initialize portfolio application:', error);
    
    // Fallback: at least show the basic content
    document.body.style.opacity = '1';
    Utils.showNotification(
      'Portfolio loaded with limited functionality. Some features may not work.', 
      'warning',
      5000
    );
  }
});

// Make app available globally for debugging/external access
window.Portfolio = PortfolioApp;

// Service Worker registration (for future PWA features)
if ('serviceWorker' in navigator && window.location.protocol === 'https:') {
  navigator.serviceWorker.register('/sw.js')
    .then(registration => {
      console.log('Service Worker registered:', registration);
    })
    .catch(error => {
      console.log('Service Worker registration failed:', error);
    });
}

export default PortfolioApp;
