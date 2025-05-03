// Wait for the DOM to be fully loaded
document.addEventListener('DOMContentLoaded', function() {
    // Add smooth scrolling for navigation links
    document.querySelectorAll('nav a').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            e.preventDefault();
            
            const targetId = this.getAttribute('href');
            const targetElement = document.querySelector(targetId);
            
            window.scrollTo({
                top: targetElement.offsetTop - 70,
                behavior: 'smooth'
            });
        });
    });

    // Add animation to project cards
    const projectCards = document.querySelectorAll('.project-card');
    
    // Intersection Observer for revealing elements when they enter the viewport
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                observer.unobserve(entry.target);
            }
        });
    }, {
        threshold: 0.1
    });
    
    // Observe each project card
    projectCards.forEach(card => {
        observer.observe(card);
        card.classList.add('fade-in');
    });

    // Add active class to navigation items based on scroll position
    window.addEventListener('scroll', function() {
        const scrollPosition = window.scrollY;
        
        // Get all sections
        const sections = document.querySelectorAll('section');
        
        sections.forEach(section => {
            const sectionTop = section.offsetTop - 100;
            const sectionBottom = sectionTop + section.offsetHeight;
            
            if (scrollPosition >= sectionTop && scrollPosition < sectionBottom) {
                // Remove active class from all nav links
                document.querySelectorAll('nav a').forEach(link => {
                    link.classList.remove('active');
                });
                
                // Add active class to corresponding nav link
                const correspondingLink = document.querySelector('nav a[href="#' + section.id + '"]');
                if (correspondingLink) {
                    correspondingLink.classList.add('active');
                }
            }
        });
    });

    // Initialize any animations or effects
    const initAnimations = () => {
        // Add a small delay to each section for a staggered animation effect
        document.querySelectorAll('section').forEach((section, index) => {
            section.style.animationDelay = `${index * 0.2}s`;
        });
    };

    initAnimations();
});

// Add CSS class for animations
const addCSS = css => {
    const style = document.createElement('style');
    style.textContent = css;
    document.head.append(style);
    return style;
};

// Add some animation styles
addCSS(`
    .fade-in {
        opacity: 0;
        transform: translateY(20px);
        transition: opacity 0.6s ease, transform 0.6s ease;
    }
    
    .fade-in.visible {
        opacity: 1;
        transform: translateY(0);
    }
    
    nav a.active {
        color: #3498db;
    }
    
    nav a.active::after {
        width: 100%;
    }
`);
