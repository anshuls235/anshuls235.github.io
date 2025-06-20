// Portfolio Website JavaScript
// Author: Anshul Sharma
// Dynamic content loading and interactive features

class PortfolioApp {
    constructor() {
        this.data = null;
        this.init();
    }

    async init() {
        try {
            await this.loadData();
            this.setupEventListeners();
            this.populateContent();
            this.setupAnimations();
            this.setupTheme();
            this.hideLoading();
        } catch (error) {
            console.error('Error initializing portfolio:', error);
            this.hideLoading();
        }
    }

    async loadData() {
        try {
            const response = await fetch('data.json');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            this.data = await response.json();
        } catch (error) {
            console.error('Error loading data:', error);
            // Fallback data based on resume
            this.data = this.getFallbackData();
        }
    }

    getFallbackData() {
        return {
            basics: {
                name: "Anshul Sharma",
                title: "Full-Stack Data Scientist",
                email: "anshuls235@gmail.com",
                phone: "+91 9871771898",
                image: "profile.jpg",
                summary: "Award-winning Full-Stack Data Scientist with 9+ years of experience in building high-impact AI applications across enterprises. From engineering scalable ML pipelines to fine-tuning LLMs for enterprise productivity, I bring end-to-end ownership—from ideation to deployment—across cloud-native and serverless architectures. I specialize in Generative AI, MLOps, and decision intelligence, and thrive at the intersection of data, business, and impact.",
                profiles: [
                    {
                        network: "GitHub",
                        username: "anshuls235",
                        url: "https://github.com/anshuls235"
                    },
                    {
                        network: "LinkedIn",
                        username: "Anshul Sharma",
                        url: "https://www.linkedin.com/in/anshuls235/"
                    },
                    {
                        network: "Medium",
                        username: "anshuls235",
                        url: "https://medium.com/@anshuls235"
                    },
                    {
                        network: "Kaggle",
                        username: "anshuls235",
                        url: "https://www.kaggle.com/anshuls235"
                    }
                ]
            }
        };
    }

    setupEventListeners() {
        // Mobile menu toggle
        const mobileMenuToggle = document.getElementById('mobile-menu-toggle');
        const navMenu = document.getElementById('nav-menu');
        
        if (mobileMenuToggle && navMenu) {
            mobileMenuToggle.addEventListener('click', () => {
                navMenu.classList.toggle('active');
                const icon = mobileMenuToggle.querySelector('.material-icons');
                icon.textContent = navMenu.classList.contains('active') ? 'close' : 'menu';
            });
        }

        // Close mobile menu when clicking on links
        document.querySelectorAll('.nav-link').forEach(link => {
            link.addEventListener('click', () => {
                if (navMenu) {
                    navMenu.classList.remove('active');
                    const icon = mobileMenuToggle?.querySelector('.material-icons');
                    if (icon) icon.textContent = 'menu';
                }
            });
        });

        // Theme toggle
        const themeToggle = document.getElementById('theme-toggle');
        if (themeToggle) {
            themeToggle.addEventListener('click', () => {
                this.toggleTheme();
            });
        }

        // Smooth scrolling for anchor links
        document.querySelectorAll('a[href^="#"]').forEach(anchor => {
            anchor.addEventListener('click', (e) => {
                e.preventDefault();
                const target = document.querySelector(anchor.getAttribute('href'));
                if (target) {
                    target.scrollIntoView({
                        behavior: 'smooth',
                        block: 'start'
                    });
                }
            });
        });

        // Contact form submission
        const contactForm = document.querySelector('.contact-form form');
        if (contactForm) {
            contactForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleContactForm(e.target);
            });
        }

        // Navbar scroll effect
        window.addEventListener('scroll', () => {
            this.handleNavbarScroll();
        });
    }

    populateContent() {
        if (!this.data) return;

        // Basic info
        const nameElement = document.getElementById('name');
        const titleElement = document.getElementById('title');
        const summaryElement = document.getElementById('summary');
        const aboutDescriptionElement = document.getElementById('about-description');
        const contactEmailElement = document.getElementById('contact-email');
        const contactPhoneElement = document.getElementById('contact-phone');

        if (nameElement) nameElement.textContent = this.data.basics.name;
        if (titleElement) titleElement.textContent = this.data.basics.title;
        if (summaryElement) summaryElement.textContent = this.data.basics.summary;
        if (aboutDescriptionElement) aboutDescriptionElement.textContent = this.data.basics.summary;
        if (contactEmailElement) contactEmailElement.textContent = this.data.basics.email;
        if (contactPhoneElement) contactPhoneElement.textContent = this.data.basics.phone;

        // Social links
        this.populateSocialLinks();

        // Experience timeline
        this.populateExperience();

        // Skills
        this.populateSkills();

        // Projects
        this.populateProjects();

        // Education
        this.populateEducation();
    }

    populateSocialLinks() {
        const socialLinksContainer = document.getElementById('social-links');
        const footerSocialContainer = document.getElementById('footer-social');
        
        if (!this.data.basics.profiles) return;

        const socialIconMap = {
            'GitHub': 'fab fa-github',
            'LinkedIn': 'fab fa-linkedin',
            'Medium': 'fab fa-medium',
            'Kaggle': 'fab fa-kaggle',
            'Twitter': 'fab fa-twitter',
            'Instagram': 'fab fa-instagram'
        };

        const socialLinksHTML = this.data.basics.profiles.map(profile => {
            const iconClass = socialIconMap[profile.network] || 'fas fa-link';
            return `
                <a href="${profile.url}" class="social-link" target="_blank" rel="noopener noreferrer" aria-label="${profile.network}">
                    <i class="${iconClass}"></i>
                </a>
            `;
        }).join('');

        if (socialLinksContainer) socialLinksContainer.innerHTML = socialLinksHTML;
        if (footerSocialContainer) footerSocialContainer.innerHTML = socialLinksHTML;
    }

    populateExperience() {
        const timelineContainer = document.getElementById('experience-timeline');
        if (!timelineContainer || !this.data.work) return;

        const timelineHTML = this.data.work.map(job => {
            const highlightsHTML = job.highlights ? job.highlights.map(highlight => 
                `<li>${highlight}</li>`
            ).join('') : '';

            const duration = this.formatDateRange(job.startDate, job.endDate);

            return `
                <div class="timeline-item animate-on-scroll">
                    <div class="timeline-content">
                        <div class="timeline-company">${job.company}</div>
                        <div class="timeline-position">${job.position}</div>
                        <div class="timeline-duration">${duration} • ${job.location}</div>
                        <ul class="timeline-highlights">
                            ${highlightsHTML}
                        </ul>
                    </div>
                    <div class="timeline-marker"></div>
                </div>
            `;
        }).join('');

        timelineContainer.innerHTML = timelineHTML;
    }

    populateSkills() {
        const skillsContainer = document.getElementById('skills-grid');
        if (!skillsContainer || !this.data.skills) return;

        const skillsHTML = this.data.skills.map(skillCategory => {
            const tagsHTML = skillCategory.items.map(skill => 
                `<span class="skill-tag">${skill}</span>`
            ).join('');

            return `
                <div class="skill-category animate-on-scroll">
                    <h3>${skillCategory.category}</h3>
                    <div class="skill-tags">
                        ${tagsHTML}
                    </div>
                </div>
            `;
        }).join('');

        skillsContainer.innerHTML = skillsHTML;
    }

    populateProjects() {
        const projectsContainer = document.getElementById('projects-grid');
        if (!projectsContainer || !this.data.projects) return;

        const projectsHTML = this.data.projects.map(project => {
            const techHTML = project.technologies ? project.technologies.map(tech => 
                `<span class="tech-tag">${tech}</span>`
            ).join('') : '';

            return `
                <div class="project-card animate-on-scroll">
                    <div class="project-content">
                        <h3 class="project-title">${project.name}</h3>
                        <p class="project-description">${project.description}</p>
                        <div class="project-tech">
                            ${techHTML}
                        </div>
                        ${project.link ? `
                            <a href="${project.link}" class="project-link" target="_blank" rel="noopener noreferrer">
                                <span class="material-icons">launch</span>
                                View Project
                            </a>
                        ` : ''}
                    </div>
                </div>
            `;
        }).join('');

        projectsContainer.innerHTML = projectsHTML;
    }

    populateEducation() {
        const educationContainer = document.getElementById('education-grid');
        if (!educationContainer || !this.data.education) return;

        const educationHTML = this.data.education.map(edu => {
            const duration = this.formatDateRange(edu.startDate, edu.endDate);

            return `
                <div class="education-card animate-on-scroll">
                    <div class="education-degree">${edu.degree}</div>
                    <div class="education-institution">${edu.institution}</div>
                    <div class="education-duration">${duration}</div>
                </div>
            `;
        }).join('');

        educationContainer.innerHTML = educationHTML;
    }

    formatDateRange(startDate, endDate) {
        const formatDate = (dateStr) => {
            if (!dateStr) return '';
            if (dateStr.toLowerCase() === 'present') return 'Present';
            
            // Handle YYYY-MM format
            if (dateStr.includes('-')) {
                const [year, month] = dateStr.split('-');
                const monthNames = [
                    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
                ];
                return `${monthNames[parseInt(month) - 1]} ${year}`;
            }
            
            return dateStr;
        };

        const start = formatDate(startDate);
        const end = formatDate(endDate);
        
        return `${start}${end ? ` - ${end}` : ''}`;
    }

    setupAnimations() {
        // Intersection Observer for scroll animations
        const observerOptions = {
            threshold: 0.1,
            rootMargin: '0px 0px -50px 0px'
        };

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('animated');
                }
            });
        }, observerOptions);

        // Observe all elements with animate-on-scroll class
        setTimeout(() => {
            document.querySelectorAll('.animate-on-scroll').forEach(el => {
                observer.observe(el);
            });
        }, 100);
    }

    setupTheme() {
        // Load saved theme or default to light
        const savedTheme = localStorage.getItem('portfolio-theme') || 'light';
        this.setTheme(savedTheme);
    }

    toggleTheme() {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        this.setTheme(newTheme);
    }

    setTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('portfolio-theme', theme);
        
        const themeToggle = document.getElementById('theme-toggle');
        if (themeToggle) {
            const icon = themeToggle.querySelector('.material-icons');
            if (icon) {
                icon.textContent = theme === 'dark' ? 'light_mode' : 'dark_mode';
            }
        }
    }

    handleNavbarScroll() {
        const navbar = document.getElementById('navbar');
        if (!navbar) return;

        if (window.scrollY > 100) {
            navbar.style.background = 'rgba(255, 255, 255, 0.98)';
            navbar.style.boxShadow = '0 2px 20px rgba(0, 0, 0, 0.1)';
        } else {
            navbar.style.background = 'rgba(255, 255, 255, 0.95)';
            navbar.style.boxShadow = 'none';
        }

        // Update for dark theme
        const isDarkTheme = document.documentElement.getAttribute('data-theme') === 'dark';
        if (isDarkTheme) {
            if (window.scrollY > 100) {
                navbar.style.background = 'rgba(15, 23, 42, 0.98)';
            } else {
                navbar.style.background = 'rgba(15, 23, 42, 0.95)';
            }
        }
    }

    handleContactForm(form) {
        const formData = new FormData(form);
        const name = form.querySelector('input[type="text"]')?.value;
        const email = form.querySelector('input[type="email"]')?.value;
        const message = form.querySelector('textarea')?.value;

        // Simple validation
        if (!name || !email || !message) {
            this.showNotification('Please fill in all fields.', 'error');
            return;
        }

        // Create mailto link
        const subject = encodeURIComponent(`Portfolio Contact from ${name}`);
        const body = encodeURIComponent(`Name: ${name}\\nEmail: ${email}\\n\\nMessage:\\n${message}`);
        const mailtoLink = `mailto:${this.data.basics.email}?subject=${subject}&body=${body}`;
        
        window.open(mailtoLink);
        
        // Reset form
        form.reset();
        this.showNotification('Thank you for your message! Your email client should open now.', 'success');
    }

    showNotification(message, type = 'info') {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.innerHTML = `
            <span class="material-icons">${type === 'success' ? 'check_circle' : type === 'error' ? 'error' : 'info'}</span>
            <span>${message}</span>
        `;

        // Add styles
        notification.style.cssText = `
            position: fixed;
            top: 100px;
            right: 20px;
            background: var(--card-color);
            color: var(--text-primary);
            padding: 1rem 1.5rem;
            border-radius: 12px;
            box-shadow: var(--shadow-large);
            display: flex;
            align-items: center;
            gap: 0.5rem;
            z-index: 10000;
            transform: translateX(100%);
            transition: transform 0.3s ease;
            max-width: 300px;
            border-left: 4px solid ${type === 'success' ? 'var(--primary-color)' : type === 'error' ? '#ef4444' : 'var(--accent-color)'};
        `;

        document.body.appendChild(notification);

        // Animate in
        setTimeout(() => {
            notification.style.transform = 'translateX(0)';
        }, 100);

        // Remove after delay
        setTimeout(() => {
            notification.style.transform = 'translateX(100%)';
            setTimeout(() => {
                document.body.removeChild(notification);
            }, 300);
        }, 4000);
    }

    hideLoading() {
        const loadingSpinner = document.getElementById('loading-spinner');
        if (loadingSpinner) {
            loadingSpinner.classList.add('hidden');
            setTimeout(() => {
                loadingSpinner.style.display = 'none';
            }, 300);
        }
    }
}

// Initialize the portfolio app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new PortfolioApp();
});

// Add additional utility functions
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Performance optimized scroll handler
window.addEventListener('scroll', debounce(() => {
    // Additional scroll-based animations can be added here
}, 10));

// Add keyboard navigation support
document.addEventListener('keydown', (e) => {
    // ESC key closes mobile menu
    if (e.key === 'Escape') {
        const navMenu = document.getElementById('nav-menu');
        const mobileMenuToggle = document.getElementById('mobile-menu-toggle');
        if (navMenu && navMenu.classList.contains('active')) {
            navMenu.classList.remove('active');
            const icon = mobileMenuToggle?.querySelector('.material-icons');
            if (icon) icon.textContent = 'menu';
        }
    }
});

// Add window resize handler for responsive adjustments
window.addEventListener('resize', debounce(() => {
    // Close mobile menu on resize to desktop
    if (window.innerWidth > 768) {
        const navMenu = document.getElementById('nav-menu');
        const mobileMenuToggle = document.getElementById('mobile-menu-toggle');
        if (navMenu && navMenu.classList.contains('active')) {
            navMenu.classList.remove('active');
            const icon = mobileMenuToggle?.querySelector('.material-icons');
            if (icon) icon.textContent = 'menu';
        }
    }
}, 250));

// Preload critical images
function preloadImages() {
    const criticalImages = ['profile.jpg'];
    criticalImages.forEach(src => {
        const img = new Image();
        img.src = src;
    });
}

// Call preload on page load
preloadImages();