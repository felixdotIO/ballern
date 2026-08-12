"""Tile the roster renders into a labelled contact sheet.

    python3 blender/contact.py
"""

import os

from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
NAMES = [('newone', 'The new one'), ('facilities', 'Facilities'),
         ('dog', 'The office dog'), ('intern', 'The intern'),
         ('boss', 'The boss'), ('sales', 'The sales guy'),
         ('designer', 'The designer')]
COLS, PAD, LABEL = 4, 18, 48


def main():
    src = os.path.join(HERE, 'out', 'roster')
    imgs = [Image.open(os.path.join(src, f'{k}.png')).convert('RGB')
            for k, _ in NAMES]
    w, h = imgs[0].size
    rows = (len(imgs) + COLS - 1) // COLS
    sheet = Image.new('RGB', (COLS * w + (COLS + 1) * PAD,
                              rows * (h + LABEL) + (rows + 1) * PAD),
                      (238, 238, 240))
    d = ImageDraw.Draw(sheet)
    try:
        font = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 28)
    except OSError:
        font = ImageFont.load_default()
    for i, (im, (_, title)) in enumerate(zip(imgs, NAMES)):
        r, c = divmod(i, COLS)
        x, y = PAD + c * (w + PAD), PAD + r * (h + LABEL + PAD)
        sheet.paste(im, (x, y))
        d.text((x + 4, y + h + 11), title, fill=(48, 48, 52), font=font)
    out = os.path.join(src, 'sheet.png')
    sheet.save(out)
    print('SHEET', out, sheet.size)


main()
