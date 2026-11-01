"""Prepare an owner's supplied CV for public download without a private phone.
Usage: python3 scripts/redact-cv.py /absolute/path/to/reviewed-cv.pdf
Requires PyMuPDF. Does not modify the source file; visually inspect tmp/pdfs/public-cv-1.png.
"""
import argparse
import re
from pathlib import Path
import fitz

parser=argparse.ArgumentParser()
parser.add_argument('source')
args=parser.parse_args()
doc=fitz.open(args.source)
page=doc[0]
# Replace the reviewed source CV's contact line, removing both the phone text
# and its separator instead of painting over recoverable text.
page.add_redact_annot(fitz.Rect(75,56,530,72),fill=(1,1,1))
page.apply_redactions()
segments=[('anshuls235@gmail.com','mailto:anshuls235@gmail.com'),('Kaggle','https://www.kaggle.com/anshuls235'),('Medium','https://medium.com/@anshuls235'),('GitHub','https://github.com/anshuls235'),('LinkedIn','https://www.linkedin.com/in/anshuls235/')]
font='helv';size=8.5;separator='   |   '
width=sum(fitz.get_text_length(label,fontname=font,fontsize=size) for label,_ in segments)+(len(segments)-1)*fitz.get_text_length(separator,fontname=font,fontsize=size)
x=(page.rect.width-width)/2
for i,(label,url) in enumerate(segments):
    w=fitz.get_text_length(label,fontname=font,fontsize=size)
    page.insert_text((x,66.5),label,fontname=font,fontsize=size,color=(0.13,0.23,0.62))
    page.insert_link({'kind':fitz.LINK_URI,'from':fitz.Rect(x,57,x+w,70),'uri':url})
    x+=w
    if i<len(segments)-1:
        page.insert_text((x,66.5),separator,fontname=font,fontsize=size,color=(0.2,0.2,0.2))
        x+=fitz.get_text_length(separator,fontname=font,fontsize=size)
doc.set_metadata({'title':'Anshul Sharma - Public CV (July 2026)','author':'Anshul Sharma','subject':'Public professional CV; private phone omitted'})
Path('public').mkdir(exist_ok=True)
doc.save('public/resume.pdf',garbage=4,deflate=True)
Path('tmp/pdfs').mkdir(parents=True,exist_ok=True)
for i,p in enumerate(doc):p.get_pixmap(matrix=fitz.Matrix(1.5,1.5)).save(f'tmp/pdfs/public-cv-{i+1}.png')
with fitz.open('public/resume.pdf') as checked:
    text='\n'.join(p.get_text() for p in checked)
    assert not re.search(r'\(\+\d{1,3}\)\s*\d',text)
    assert 'real-time lead scoring' in re.sub(r'\s+',' ',text)
    assert all(not link.get('uri','').startswith('tel:') for p in checked for link in p.get_links())
print(f'Public CV ready: {len(doc)} page; private phone text and links removed.')
