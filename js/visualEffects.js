// Visual Effects Module
export class VisualEffects {
  constructor() {
    this.particlesArray = [];
    this.cursorTrails = [];
    this.matrixRain = null;
    this.init();
  }

  init() {
    this.createParticles();
    this.initCursorTrail();
    this.initScrollAnimations();
  }

  createParticles() {
    const particlesContainer = document.createElement('div');
    particlesContainer.className = 'particles-container';
    document.body.appendChild(particlesContainer);
    
    const createParticle = () => {
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
    };
    
    // Create particles periodically
    setInterval(createParticle, 2000);
  }

  initCursorTrail() {
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

  createMatrixRain() {
    const matrixContainer = document.createElement('div');
    matrixContainer.className = 'matrix-rain';
    document.body.appendChild(matrixContainer);
    
    const characters = '01アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロ';
    
    const createColumn = () => {
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
    };
    
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

  initScrollAnimations() {
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

  triggerMatrixEffect() {
    if (!this.matrixRain) {
      this.matrixRain = this.createMatrixRain();
    }
    this.matrixRain.start();
    
    setTimeout(() => {
      if (this.matrixRain) {
        this.matrixRain.stop();
        this.matrixRain = null;
      }
    }, 10000);
  }
}
