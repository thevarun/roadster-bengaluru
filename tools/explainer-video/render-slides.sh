#!/bin/zsh
# render every slide state used in script.json to slides/<id>-<step>.png
cd "$(dirname $0)"; mkdir -p slides
for k in $(node -e "const s=require('./script.json');console.log([...new Set(s.scenes.flatMap(x=>x.beats).filter(b=>b.v.startsWith('slide:')).map(b=>b.v.slice(6)))].join(' '))"); do
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --user-data-dir=$PWD/prof-slides --hide-scrollbars --force-device-scale-factor=1 --window-size=1280,720 \
    --screenshot="$PWD/slides/${k%/*}-${k#*/}.png" "file://$PWD/slides.html?s=${k%/*}&step=${k#*/}" >/dev/null 2>&1
done
ls slides | wc -l
