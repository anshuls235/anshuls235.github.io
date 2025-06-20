async function loadData() {
    const response = await fetch('data.json');
    const data = await response.json();
    render(data);
}

function render(data) {
    document.title = data.basics.name + ' - ' + data.basics.title;
    document.getElementById('name').textContent = data.basics.name;
    document.getElementById('title').textContent = data.basics.title;
    document.getElementById('year').textContent = new Date().getFullYear();
    document.getElementById('name-footer').textContent = data.basics.name;

    renderNav();
    renderAbout(data.basics.summary);
    renderWork(data.work);
    renderEducation(data.education);
    renderSkills(data.skills);
    renderProjects(data.projects);
    renderContact(data.basics);
}

function renderNav() {
    const nav = document.getElementById('nav');
    const items = ['about','work','education','skills','projects','contact'];
    items.forEach(id => {
        const a = document.createElement('a');
        a.href = '#' + id;
        a.textContent = id.charAt(0).toUpperCase() + id.slice(1);
        nav.appendChild(a);
    });
    const resume = document.createElement('a');
    resume.href = 'resume.pdf';
    resume.textContent = 'Resume';
    resume.target = '_blank';
    nav.appendChild(resume);
}

function renderAbout(summary) {
    const about = document.getElementById('about');
    about.innerHTML = `<h3>About</h3><p>${summary}</p>`;
}

function renderWork(jobs) {
    const work = document.getElementById('work');
    work.innerHTML = '<h3>Work Experience</h3>';
    jobs.forEach(job => {
        const div = document.createElement('div');
        div.className = 'job';
        const range = job.endDate ? `${job.startDate} - ${job.endDate}` : `${job.startDate} - Present`;
        div.innerHTML = `<h4>${job.position} @ ${job.company}</h4><small>${range} | ${job.location}</small>`;
        const ul = document.createElement('ul');
        job.highlights.forEach(h => {
            const li = document.createElement('li');
            li.textContent = h;
            ul.appendChild(li);
        });
        div.appendChild(ul);
        work.appendChild(div);
    });
}

function renderEducation(edu) {
    const el = document.getElementById('education');
    el.innerHTML = '<h3>Education</h3>';
    edu.forEach(item => {
        const div = document.createElement('div');
        const range = item.endDate ? `${item.startDate} - ${item.endDate}` : item.startDate;
        div.innerHTML = `<h4>${item.degree} - ${item.institution}</h4><small>${range}</small>`;
        el.appendChild(div);
    });
}

function renderSkills(skills) {
    const section = document.getElementById('skills');
    section.innerHTML = '<h3>Skills</h3>';
    skills.forEach(cat => {
        const div = document.createElement('div');
        div.innerHTML = `<h4>${cat.category}</h4>`;
        const ul = document.createElement('ul');
        cat.items.forEach(skill => {
            const li = document.createElement('li');
            li.textContent = skill;
            ul.appendChild(li);
        });
        div.appendChild(ul);
        section.appendChild(div);
    });
}

function renderProjects(projects) {
    const section = document.getElementById('projects');
    section.innerHTML = '<h3>Projects</h3>';
    projects.forEach(proj => {
        const div = document.createElement('div');
        div.innerHTML = `<h4><a href="${proj.link}" target="_blank">${proj.name}</a></h4><p>${proj.description}</p>`;
        const ul = document.createElement('ul');
        proj.technologies.forEach(tech => {
            const li = document.createElement('li');
            li.textContent = tech;
            ul.appendChild(li);
        });
        div.appendChild(ul);
        section.appendChild(div);
    });
}

function renderContact(basics) {
    const section = document.getElementById('contact');
    section.innerHTML = `<h3>Contact</h3>
        <p>Email: <a href="mailto:${basics.email}">${basics.email}</a></p>
        <p>Phone: <a href="tel:${basics.phone}">${basics.phone}</a></p>`;
    const list = document.createElement('ul');
    basics.profiles.forEach(p => {
        const li = document.createElement('li');
        li.innerHTML = `<a href="${p.url}" target="_blank">${p.network}</a>`;
        list.appendChild(li);
    });
    section.appendChild(list);
}

loadData();
