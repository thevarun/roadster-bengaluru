#!/bin/zsh
# capture each clip in its own Chrome; retry flaky screenshot hangs
cd "$(dirname $0)"
list=($@); (( ${#list} )) || list=(hook wire overhead physics boxes roofhop crash)
for c in $list; do
  for a in 1 2 3; do node footage.mjs $c > logs-$c.txt 2>&1 && break; echo "retry $c"; done
  echo "$c: $(ls clips/$c | wc -l) frames"; grep -v retry logs-$c.txt | tail -1
done
