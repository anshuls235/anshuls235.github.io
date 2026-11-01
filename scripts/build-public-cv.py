"""Create a public, phone-free CV from the reviewed snapshot.
Requires PyMuPDF. Review content first; this is not the runtime data source.
"""
import json
from pathlib import Path
import fitz

content = json.loads(Path('src/content/fallback.json').read_text())['content']
profile = content['profile'][0]
doc = fitz.open()
INK = (0.09, 0.145, 0.17)
MUTED = (0.3, 0.36, 0.4)
BLUE = (0.15, 0.29, 0.88)
page = None
y = 0

def new_page():
    global page, y
    page = doc.new_page(width=595, height=842)
    y = 48
    page.insert_text((48, 803), profile['name'] + ' | Public CV', fontsize=8, color=MUTED)
    page.insert_text((525, 803), str(len(doc)), fontsize=8, color=MUTED)

def text(value, size=10, bold=False, color=INK, after=8):
    global y
    value = value.replace('\u2014', '-').replace('\u2013', '-').replace('\u2019', "'").replace('\u00b7', '|')
    font = 'hebo' if bold else 'helv'
    lines = []
    for paragraph in value.split('\n'):
        line = ''
        for word in paragraph.split():
            trial = (line + ' ' + word).strip()
            if fitz.get_text_length(trial, fontname=font, fontsize=size) > 499:
                lines.append(line)
                line = word
            else:
                line = trial
        lines.append(line)
    height = len(lines) * size * 1.5
    if y + height > 762:
        new_page()
    for line in lines:
        page.insert_text((48, y + size), line, fontname=font, fontsize=size, color=color)
        y += size * 1.5
    y += after

def heading(value):
    global y
    if y > 700:
        new_page()
    y += 9
    text(value.upper(), 10, True, BLUE, 10)

new_page()
text(profile['name'], 30, True, INK, 6)
text(profile['title'] + ' | ' + profile['location'], 12, False, BLUE, 9)
text(profile['email'] + ' | anshuls235.github.io', 9, False, MUTED, 13)
text(profile['introduction'], 10, after=13)
heading('Professional experience')
for job in content['experiences']:
    # Keep each role together, including the longest current role.
    estimated = 60 + sum(30 if len(h) > 95 else 16 for h in job['highlights'])
    if y + estimated > 760:
        new_page()
        heading('Professional experience - continued')
    text(job['position'] + ' | ' + job['company'], 12, True, after=3)
    start = job['start_date'][:7]
    end = job['end_date'][:7] if job['end_date'] else 'Present'
    text(start + ' - ' + end + ' | ' + job['location'], 9, color=MUTED, after=7)
    for highlight in job['highlights']:
        text('- ' + highlight, 9.5, after=3)
    y += 9
heading('Technical expertise')
for category in dict.fromkeys(s['category'] for s in content['skills']):
    names = ', '.join(s['name'] for s in content['skills'] if s['category'] == category)
    text(category + ': ' + names, 9.5, after=5)
heading('Education and credentials')
for e in content['education']:
    text(e['degree'] + ' | ' + e['institution'] + ' | ' + str(e['start_year']) + '-' + str(e['end_year']), 9.5, after=5)
for c in content['certifications']:
    text(c['title'] + ' | ' + c['issuer'] + ' | ' + (c['issued_on'][:4] if c['issued_on'] else ''), 9.5, after=5)
heading('Public profiles')
text('GitHub: github.com/anshuls235 | LinkedIn: linkedin.com/in/anshuls235\nMedium: anshuls235.medium.com | Kaggle: kaggle.com/anshuls235', 9, color=MUTED)
doc.set_metadata({'title': profile['name'] + ' - Public CV', 'author': profile['name'], 'subject': 'Professional experience and expertise'})
Path('public').mkdir(exist_ok=True)
doc.save('public/resume.pdf', garbage=4, deflate=True)
Path('tmp/pdfs').mkdir(parents=True, exist_ok=True)
for n, p in enumerate(doc):
    p.get_pixmap(matrix=fitz.Matrix(1.4, 1.4)).save(f'tmp/pdfs/public-cv-{n+1}.png')
print(f'Created {len(doc)} public CV pages, without private telephone details.')
