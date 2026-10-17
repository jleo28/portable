"""Assemble src/ into the app.

index.html     full page for Vercel (or any static host) — /api/track works there
artifact.html  the same page without the document skeleton, for a claude.ai artifact preview
"""
import os

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(ROOT, 'src')


def read(name):
    with open(os.path.join(SRC, name), encoding='utf-8') as f:
        return f.read()


scripts = ''.join('<script>\n' + read(n) + '\n</script>\n' for n in ('data.js', 'engine.js', 'app.js'))
inner = read('style.css') + read('body.html') + scripts

page = ('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
        + read('head.html')
        + '<style>[hidden]{display:none!important}body{margin:0}:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}</style>\n'
        '</head>\n<body>\n' + inner + '</body>\n</html>\n')
with open(os.path.join(ROOT, 'index.html'), 'w', encoding='utf-8') as f:
    f.write(page)
with open(os.path.join(ROOT, 'artifact.html'), 'w', encoding='utf-8') as f:
    f.write(read('head.html') + inner)
print('wrote index.html', len(page), 'bytes; artifact.html')
