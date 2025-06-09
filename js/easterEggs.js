// Easter Eggs Module
export class EasterEggs {
  constructor(visualEffects) {
    this.visualEffects = visualEffects;
    this.konamiCode = [];
    this.konamiSequence = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'KeyB', 'KeyA'];
    this.dataEasterEggs = {
      skills: {
        'Python': { confidence: 95, years: 9 },
        'Machine Learning': { confidence: 90, years: 8 },
        'Deep Learning': { confidence: 85, years: 6 },
        'Data Visualization': { confidence: 88, years: 7 },
        'Statistics': { confidence: 92, years: 8 },
        'SQL': { confidence: 90, years: 9 }
      },
      funFacts: [
        "I've trained over 1000 ML models! 🤖",
        "My largest dataset had 50M+ rows 📊",
        "I can identify overfitting from 100 meters away 👁",
        "Coffee ☕ → Code 💻 → Deploy 🚀 (my data pipeline)",
        "I dream in Python and think in SQL 🐍",
        "I've prevented more data leakage than a plumber 🔧"
      ],
      algorithms: ['Random Forest', 'XGBoost', 'Neural Networks', 'SVM', 'K-means', 'LSTM'],
      modelAccuracy: [0.95, 0.89, 0.92, 0.87, 0.94, 0.91]
    };
    this.init();
  }

  init() {
    this.initKonamiCode();
    this.initDataScienceEasterEggs();
  }

  initKonamiCode() {
    document.addEventListener('keydown', (e) => {
      this.konamiCode.push(e.code);
      
      // Keep only last 10 keys
      if (this.konamiCode.length > 10) {
        this.konamiCode.shift();
      }
      
      // Check if sequence matches
      if (this.konamiCode.length === 10 && 
          this.konamiCode.every((key, index) => key === this.konamiSequence[index])) {
        this.triggerKonamiEasterEgg();
        this.konamiCode = [];
      }
    });
  }

  triggerKonamiEasterEgg() {
    // Rainbow animation
    document.body.classList.add('konami-active');
    
    // Matrix rain
    this.visualEffects.triggerMatrixEffect();
    
    // Show special message
    this.showEasterEggModal('🎉 Konami Code Activated! 🎉', 
      'You found the secret! As a fellow data scientist, you know that finding patterns is what we do best. Enjoy the matrix rain effect!', 
      'konami');
    
    setTimeout(() => {
      document.body.classList.remove('konami-active');
    }, 10000);
  }

  initDataScienceEasterEggs() {
    // Triple click on skills triggers skill confidence chart
    document.addEventListener('click', this.handleTripleClick.bind(this));
    
    // Double click on profile image shows fun facts
    const profileImage = document.getElementById('profile-image');
    if (profileImage) {
      let clickCount = 0;
      profileImage.addEventListener('click', () => {
        clickCount++;
        if (clickCount === 2) {
          this.showDataScienceFacts();
          clickCount = 0;
        }
        setTimeout(() => { clickCount = 0; }, 500);
      });
    }
    
    // Secret data science quiz (click 5 times on navbar logo)
    const navbarLogo = document.getElementById('navbar-logo');
    if (navbarLogo) {
      let logoClicks = 0;
      navbarLogo.addEventListener('click', (e) => {
        e.preventDefault();
        logoClicks++;
        if (logoClicks === 5) {
          this.startDataScienceQuiz();
          logoClicks = 0;
        }
        setTimeout(() => { logoClicks = 0; }, 2000);
      });
    }
  }

  clickTimes = [];
  handleTripleClick(e) {
    if (e.target.classList.contains('skill-item')) {
      this.clickTimes.push(Date.now());
      
      // Keep only last 3 clicks
      if (this.clickTimes.length > 3) {
        this.clickTimes.shift();
      }
      
      // Check if 3 clicks within 1 second
      if (this.clickTimes.length === 3 && 
          this.clickTimes[2] - this.clickTimes[0] < 1000) {
        this.showSkillConfidenceChart();
        this.clickTimes = [];
      }
    }
  }

  showSkillConfidenceChart() {
    const chartHTML = `
      <h3>🧠 My Data Science Skill Confidence Levels</h3>
      <div class="chart-container">
        <div class="bar-chart">
          ${Object.entries(this.dataEasterEggs.skills).map(([skill, data]) => 
            `<div class="bar" style="height: ${data.confidence}%" data-value="${data.confidence}%"></div>`
          ).join('')}
        </div>
      </div>
      <div style="display: flex; justify-content: space-between; margin-top: 1rem; font-size: 0.8rem;">
        ${Object.keys(this.dataEasterEggs.skills).map(skill => 
          `<span>${skill}</span>`
        ).join('')}
      </div>
      <p style="margin-top: 1rem; font-size: 0.9rem; color: var(--accent);">
        Built from ${Object.values(this.dataEasterEggs.skills).reduce((sum, s) => sum + s.years, 0)} years of combined experience! 📊
      </p>
    `;
    
    this.showEasterEggModal('📊 Skill Analytics Dashboard', chartHTML, 'chart');
  }

  showDataScienceFacts() {
    const randomFact = this.dataEasterEggs.funFacts[Math.floor(Math.random() * this.dataEasterEggs.funFacts.length)];
    const factHTML = `
      <h3>📔 Data Science Fun Fact</h3>
      <p style="font-size: 1.2rem; margin: 2rem 0;">${randomFact}</p>
      <div style="display: flex; justify-content: space-around; margin-top: 2rem;">
        <div style="text-align: center;">
          <div style="font-size: 2rem;">🤖</div>
          <div>1000+ Models</div>
        </div>
        <div style="text-align: center;">
          <div style="font-size: 2rem;">📊</div>
          <div>50M+ Rows</div>
        </div>
        <div style="text-align: center;">
          <div style="font-size: 2rem;">☕</div>
          <div>∞ Coffee</div>
        </div>
      </div>
    `;
    
    this.showEasterEggModal('🎯 Data Detective Stats', factHTML, 'facts');
  }

  startDataScienceQuiz() {
    const questions = [
      {
        question: "What's the best way to prevent overfitting?",
        options: ["More data", "Cross-validation", "Regularization", "All of the above"],
        correct: 3,
        explanation: "All methods help prevent overfitting! More data provides better generalization, cross-validation helps detect overfitting, and regularization constrains model complexity."
      },
      {
        question: "Which metric is best for imbalanced datasets?",
        options: ["Accuracy", "Precision", "F1-Score", "ROC-AUC"],
        correct: 2,
        explanation: "F1-Score balances precision and recall, making it ideal for imbalanced datasets where accuracy can be misleading."
      },
      {
        question: "What does 'data leakage' mean?",
        options: ["Missing data", "Future info in training", "Too much data", "Bad data quality"],
        correct: 1,
        explanation: "Data leakage occurs when future information accidentally gets into your training data, leading to unrealistically good performance that won't generalize."
      }
    ];
    
    let currentQuestion = 0;
    let score = 0;
    
    const showQuestion = () => {
      const q = questions[currentQuestion];
      const quizHTML = `
        <h3>🧩 Data Science Pop Quiz</h3>
        <p><strong>Question ${currentQuestion + 1}/${questions.length}:</strong></p>
        <p style="margin: 1rem 0; font-size: 1.1rem;">${q.question}</p>
        <div style="display: grid; gap: 0.5rem; margin: 1rem 0;">
          ${q.options.map((option, index) => 
            `<button class="quiz-option" data-index="${index}" style="padding: 0.75rem; border: 1px solid var(--border-color); border-radius: var(--radius); background: var(--background); cursor: pointer; transition: var(--transition);">
              ${String.fromCharCode(65 + index)}. ${option}
            </button>`
          ).join('')}
        </div>
        <div style="margin-top: 1rem; font-size: 0.9rem; color: var(--accent);">
          Score: ${score}/${currentQuestion}
        </div>
      `;
      
      this.showEasterEggModal('🏆 Test Your Data Science Knowledge', quizHTML, 'quiz');
      
      // Add click handlers for quiz options
      document.querySelectorAll('.quiz-option').forEach(button => {
        button.addEventListener('click', (e) => {
          const selectedIndex = parseInt(e.target.dataset.index);
          this.handleQuizAnswer(selectedIndex, q);
        });
        
        button.addEventListener('mouseenter', (e) => {
          e.target.style.background = 'var(--primary-color)';
          e.target.style.color = 'white';
        });
        
        button.addEventListener('mouseleave', (e) => {
          e.target.style.background = 'var(--background)';
          e.target.style.color = 'var(--text-color)';
        });
      });
    };
    
    const handleQuizAnswer = (selectedIndex, question) => {
      const isCorrect = selectedIndex === question.correct;
      if (isCorrect) score++;
      
      const resultHTML = `
        <h3>${isCorrect ? '✅ Correct!' : '❌ Not quite!'}</h3>
        <p style="margin: 1rem 0;">${question.explanation}</p>
        <div style="margin-top: 2rem;">
          ${currentQuestion < questions.length - 1 ? 
            '<button id="next-question" class="btn">Next Question</button>' :
            `<div>
              <h4>🎉 Quiz Complete!</h4>
              <p>Final Score: ${score}/${questions.length}</p>
              <p>${score === questions.length ? 'Perfect! You\'re a data science wizard! 🧙‍♂️' : 
                  score >= questions.length * 0.7 ? 'Great job! You know your stuff! 👏' : 
                  'Keep learning! Data science is a journey! 📚'}</p>
            </div>`
          }
        </div>
      `;
      
      this.showEasterEggModal('📊 Quiz Result', resultHTML, 'quiz-result');
      
      if (currentQuestion < questions.length - 1) {
        document.getElementById('next-question')?.addEventListener('click', () => {
          currentQuestion++;
          showQuestion();
        });
      }
    };
    
    this.handleQuizAnswer = handleQuizAnswer.bind(this);
    showQuestion();
  }

  showEasterEggModal(title, content, type) {
    // Remove existing modal
    const existingModal = document.querySelector('.easter-egg-modal');
    if (existingModal) {
      existingModal.remove();
    }
    
    const modal = document.createElement('div');
    modal.className = 'easter-egg-modal';
    modal.innerHTML = `
      <div class="easter-egg-content">
        <button class="close-btn">&times;</button>
        <div class="easter-egg-body">
          ${typeof content === 'string' ? content : content.outerHTML || content}
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    
    // Show modal with animation
    setTimeout(() => modal.classList.add('active'), 10);
    
    // Close functionality
    const closeBtn = modal.querySelector('.close-btn');
    const closeModal = () => {
      modal.classList.remove('active');
      setTimeout(() => modal.remove(), 300);
    };
    
    closeBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });
    
    // Auto-close after 15 seconds (except quiz)
    if (type !== 'quiz' && type !== 'quiz-result') {
      setTimeout(closeModal, 15000);
    }
  }
}
