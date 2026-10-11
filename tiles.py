# Builds a clean tile atlas from the symbols in src/assets/dungeon-tiles.svg.
# The file's own preview places <use> without width/height, so symbols render at the
# full canvas size; here every symbol gets an explicit cell.
import re, pathlib
SRC = pathlib.Path(__file__).parent / 'src/assets/dungeon-tiles.svg'
FLOORS = ['floor-stone', 'floor-cracked', 'floor-moss', 'floor-rune', 'floor-blood', 'floor-rubble', 'floor-edge']
WALLS = ['wall-straight', 'wall-moss', 'wall-arch', 'wall-corner']
def atlas():
    s = SRC.read_text()
    defs = re.search(r'<defs>.*</defs>', s, re.S).group(0)
    uses, cells = [], {}
    for i, n in enumerate(FLOORS):
        x, y = (i % 4) * 128, (i // 4) * 64
        uses.append(f'<use href="#{n}" xlink:href="#{n}" x="{x}" y="{y}" width="128" height="64"/>'); cells[n] = [x, y, 128, 64]
    for i, n in enumerate(WALLS):
        x, y = i * 128, 128
        uses.append(f'<use href="#{n}" xlink:href="#{n}" x="{x}" y="{y}" width="128" height="96"/>'); cells[n] = [x, y, 128, 96]
    svg = ('<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="512" height="224" viewBox="0 0 512 224">'
           + defs + ''.join(uses) + '</svg>')
    return svg, cells
if __name__ == '__main__':
    svg, cells = atlas(); pathlib.Path('/tmp/claude-0/-home-claude/8fab2a96-98c3-56dd-b041-fbe1e52f0afb/scratchpad/atlas2.svg').write_text(svg); print(cells)
