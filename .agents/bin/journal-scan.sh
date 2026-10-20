#!/usr/bin/env bash
# journal-scan.sh: знаходить журнали сесій, яких немає в main, і після «так» людини переносить їх туди.
#
# Навіщо. Сесія в git worktree (.claude/worktrees/<name>, ~/orca/workspaces/..., хмарна сесія)
# комітить журнал у свою гілку, а гілку потім ніхто не зливає. Запису немає в main, і наступні
# сесії та MemPalace його не бачать. 24.09.2026 так знайшли 11 журналів у двох проєктах.
#
# Використання (скрипт лежить у .agents/bin/ проєкту, запускати можна з будь-якої теки):
#   journal-scan.sh                   звіт, нічого не змінює. Код виходу: 0 усе в main,
#                                     1 є журнали поза main, 2 помилка.
#   journal-scan.sh --quiet           те саме, але мовчить, коли все чисто (для хука на старті сесії)
#   journal-scan.sh --fetch           спершу git fetch origin: побачити гілки хмарних сесій
#   journal-scan.sh --apply [--push]  перенести знайдені журнали в main окремим комітом
#                                     (і запушити). ТІЛЬКИ після «так» людини в чаті.
#
# «У main» означає: той самий файл з тим самим вмістом є в main або в origin/main.
# Скануються теки .agents/journal/ і sessions/ у всіх локальних гілках, origin/* і worktree без
# гілки (detached HEAD), незакомічені журнали в усіх worktree, а також вкладений репозиторій
# site/ (модуль site стандарту _client-template).
# --apply не чіпає: незакомічені журнали (спершу коміт у їхній гілці), файли, чиї версії
# розійшлися (вирішує людина), і файли, які в теці з main уже лежать зміненими чи незакоміченими.
set -uo pipefail

JOURNAL_DIRS=".agents/journal sessions"

QUIET=0 FETCH=0 APPLY=0 PUSH=0
for arg in "$@"; do
  case "$arg" in
    --quiet) QUIET=1 ;;
    --fetch) FETCH=1 ;;
    --apply) APPLY=1 ;;
    --push)  PUSH=1 ;;
    -h|--help) sed -n '2,21p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "journal-scan: невідомий аргумент «$arg» (є --quiet, --fetch, --apply, --push)" >&2; exit 2 ;;
  esac
done
if (( PUSH && !APPLY )); then
  echo "journal-scan: --push працює тільки разом з --apply" >&2
  exit 2
fi

# ROOT: корінь проєкту в поточному checkout (головна тека або worktree). Скрипт лежить у .agents/bin/.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
if ! git -C "$ROOT" rev-parse --git-dir >/dev/null 2>&1; then
  (( QUIET )) || echo "journal-scan: $ROOT не git-репозиторій, гілок немає, перевіряти нічого."
  exit 0
fi

# PROJECT_ROOT: головна тека проєкту. У worktree вона інша, ніж ROOT, а вкладений site/ живе тільки
# в головній теці. Та сама логіка, що в mempalace-refresh.sh.
PROJECT_ROOT="$ROOT"
if git_dir="$(git -C "$ROOT" rev-parse --path-format=absolute --git-dir 2>/dev/null)" \
  && common_dir="$(git -C "$ROOT" rev-parse --path-format=absolute --git-common-dir 2>/dev/null)" \
  && [[ "$git_dir" != "$common_dir" && "$(basename "$common_dir")" == ".git" ]]; then
  prefix="$(git -C "$ROOT" rev-parse --show-prefix 2>/dev/null || true)"
  main_root="$(dirname "$common_dir")${prefix:+/${prefix%/}}"
  [[ -d "$main_root/.agents" ]] && PROJECT_ROOT="$main_root"
fi

TMP="$(mktemp -d "${TMPDIR:-/tmp}/journal-scan.XXXXXX")" || exit 2
trap 'rm -rf "$TMP"' EXIT

FOUND=0     # журналів поза main (усі репозиторії)
LEFT=0      # після --apply: скільки лишилось неперенесеним
ERR=0
REPORT=""
say() { REPORT+="$1"$'\n'; }

# Стан поточного репозиторію, який сканує scan_repo (bash 3.2: без асоціативних масивів).
TOP="" MAIN_NAME="" MAIN_REFS=() SPECS=() TOPSPECS=()

blob_at() { git -C "$TOP" rev-parse -q --verify "$1:$2" 2>/dev/null; }   # <ref> <шлях> -> blob або ""
in_main_any() {   # <шлях>: шлях є в main або origin/main (з будь-яким вмістом)
  local r; for r in "${MAIN_REFS[@]}"; do [[ -n "$(blob_at "$r" "$1")" ]] && return 0; done; return 1
}
was_in_history() {  # <ref> <шлях> <blob>: цей вміст колись лежав за цим шляхом в історії ref
  local c
  while IFS= read -r c; do
    [[ "$(blob_at "$c" "$2")" == "$3" ]] && return 0
  done < <(git -C "$TOP" rev-list "$1" -- "$2" 2>/dev/null)
  return 1
}
rel() {  # шлях worktree для звіту: коротко, якщо він усередині головної теки проєкту
  local p="$1"
  if [[ "$p" == "$PROJECT_ROOT" ]]; then p="головна тека"
  elif [[ "$p" == "$PROJECT_ROOT/"* ]]; then p="${p#"$PROJECT_ROOT/"}"; fi
  printf '%s' "$p"
}
has_origin() { git -C "$TOP" remote get-url origin >/dev/null 2>&1; }

scan_repo() {  # <тека репозиторію> <назва для звіту>
  local dir="$1" label="$2" prefix d ref name wt head det skip m
  TOP="$(git -C "$dir" rev-parse --show-toplevel 2>/dev/null)" || return 0
  prefix="$(git -C "$dir" rev-parse --show-prefix 2>/dev/null)"
  rm -f "$TMP"/cand "$TMP"/cls "$TMP"/final "$TMP"/unc "$TMP"/refs
  : > "$TMP/cand"; : > "$TMP/cls"; : > "$TMP/final"; : > "$TMP/unc"

  if (( FETCH )) && has_origin; then
    git -C "$TOP" fetch -q origin 2>/dev/null || say "  $label: git fetch origin не вдався, гілки origin/* можуть бути старими."
  fi

  MAIN_NAME=""
  for m in main master; do
    if git -C "$TOP" show-ref --verify -q "refs/heads/$m" || git -C "$TOP" show-ref --verify -q "refs/remotes/origin/$m"; then
      MAIN_NAME="$m"; break
    fi
  done
  if [[ -z "$MAIN_NAME" ]]; then
    say "journal-scan: $label: немає гілки main чи master, перевірити не можу."
    ERR=1; return
  fi
  MAIN_REFS=()
  git -C "$TOP" show-ref --verify -q "refs/heads/$MAIN_NAME" && MAIN_REFS+=("refs/heads/$MAIN_NAME")
  git -C "$TOP" show-ref --verify -q "refs/remotes/origin/$MAIN_NAME" && MAIN_REFS+=("refs/remotes/origin/$MAIN_NAME")
  SPECS=(); TOPSPECS=()
  for d in $JOURNAL_DIRS; do SPECS+=("$prefix$d/"); TOPSPECS+=(":(top)$prefix$d/"); done

  # Кандидати: гілки (локальні й origin/*) і HEAD worktree без гілки. Рядок: ref \t назва.
  # Гілка і її копія в origin часто вказують на той самий коміт: такий дубль скануємо один раз.
  local seen=" " sha
  git -C "$TOP" for-each-ref --format='%(objectname) %(refname)' refs/heads refs/remotes/origin |
  while read -r sha ref; do
    case "$ref" in
      "refs/heads/$MAIN_NAME"|"refs/remotes/origin/$MAIN_NAME"|refs/remotes/origin/HEAD) continue ;;
    esac
    [[ "$seen" == *" $sha "* ]] && continue
    seen="$seen$sha "
    name="${ref#refs/heads/}"; name="${name#refs/remotes/}"
    printf '%s\t%s\n' "$ref" "$name"
  done > "$TMP/refs"
  git -C "$TOP" worktree list --porcelain -z | tr '\0' '\n' | awk '
    /^worktree /{w=substr($0,10)} /^HEAD /{h=substr($0,6)} /^detached$/{print h "\t" w}' > "$TMP/detached"
  while IFS=$'\t' read -r head wt; do
    printf '%s\t%s\n' "$head" "HEAD у worktree $(basename "$wt") (без гілки)" >> "$TMP/refs"
  done < "$TMP/detached"

  # Вміст main одним проходом: «шлях \t blob» для main і origin/main разом.
  # Порівнюємо з ним усі гілки в awk, а не окремою командою git на кожен файл: у проєкті
  # сотні журналів у кожній гілці, і пофайлова перевірка йшла майже хвилину (24.09.2026).
  : > "$TMP/main"
  for m in "${MAIN_REFS[@]}"; do
    git -C "$TOP" ls-tree -r -z "$m" -- "${SPECS[@]}" 2>/dev/null | tr '\0' '\n' |
      awk -F'\t' '{split($1, a, " "); print $2 "\t" a[3]}' >> "$TMP/main"
  done

  while IFS=$'\t' read -r ref name; do
    skip=0
    for m in "${MAIN_REFS[@]}"; do
      if git -C "$TOP" merge-base --is-ancestor "$ref" "$m" 2>/dev/null; then skip=1; break; fi
    done
    (( skip )) && continue   # гілка вже цілком у main
    # ls-tree -z: «<mode> blob <sha>\t<шлях>»; -z, щоб кирилиця в шляхах не бралась у лапки.
    git -C "$TOP" ls-tree -r -z "$ref" -- "${SPECS[@]}" 2>/dev/null | tr '\0' '\n' |
      awk -F'\t' -v ref="$ref" -v name="$name" '{split($1, a, " "); print $2 "\t" a[3] "\t" ref "\t" name}'
  done < "$TMP/refs" > "$TMP/cand"

  # Відсіяти те, що вже лежить у main з тим самим вмістом (переважна більшість).
  # Порівнюємо ім’я файла: NR == FNR пропускає кандидатів, якщо список main порожній.
  awk -F'\t' 'FILENAME == ARGV[1] { same[$1 "\t" $2] = 1; next } !(($1 "\t" $2) in same)' \
    "$TMP/main" "$TMP/cand" > "$TMP/pre"

  # Стан решти відносно main. Тут уже одиниці файлів, тож історію можна дивитись пофайлово.
  local path blob st mb newer old gone r
  while IFS=$'\t' read -r path blob ref name; do
    old=0
    for r in "${MAIN_REFS[@]}"; do was_in_history "$r" "$path" "$blob" && { old=1; break; }; done
    (( old )) && continue      # цей вміст уже побував у main: у гілці стара версія або його видалили навмисно
    if ! in_main_any "$path"; then
      gone=0
      for r in "${MAIN_REFS[@]}"; do [[ -n "$(git -C "$TOP" rev-list -1 "$r" -- "$path" 2>/dev/null)" ]] && { gone=1; break; }; done
      # шлях колись був у main і його прибрали, а в гілці інша версія: вирішує людина
      if (( gone )); then st=div; else st=new; fi
    else
      newer=0
      for r in "${MAIN_REFS[@]}"; do
        mb="$(blob_at "$r" "$path")"
        [[ -n "$mb" ]] && was_in_history "$ref" "$path" "$mb" && { newer=1; break; }
      done
      if (( newer )); then st=upd; else st=div; fi
    fi
    printf '%s\t%s\t%s\t%s\t%s\n' "$st" "$path" "$blob" "$ref" "$name" >> "$TMP/cls"
  done < "$TMP/pre"

  # Один шлях може бути в кількох гілках. Кілька різних версій: береться та, чия історія містить
  # усі інші (типово локальна гілка новіша за свою копію в origin). Такої немає: вирішує людина.
  local blobs nb names w x hit all wrefs winner wref
  cut -f2 "$TMP/cls" | sort -u > "$TMP/paths"
  while IFS= read -r path; do
    awk -F'\t' -v p="$path" '$2 == p' "$TMP/cls" > "$TMP/rows"
    blobs="$(cut -f3 "$TMP/rows" | sort -u)"
    nb="$(printf '%s\n' "$blobs" | grep -c .)"
    names="$(cut -f5 "$TMP/rows" | sort -u | paste -sd, - | sed 's/,/, /g')"
    winner=""
    if grep -q '^div' "$TMP/rows"; then
      st=div
    elif (( nb == 1 )); then
      st="$(head -1 "$TMP/rows" | cut -f1)"; winner="$blobs"
    else
      for w in $blobs; do
        wrefs="$(awk -F'\t' -v b="$w" '$3 == b {print $4}' "$TMP/rows")"
        all=1
        for x in $blobs; do
          [[ "$x" == "$w" ]] && continue
          hit=0
          for r in $wrefs; do was_in_history "$r" "$path" "$x" && { hit=1; break; }; done
          (( hit )) || { all=0; break; }
        done
        (( all )) && { winner="$w"; break; }
      done
      if [[ -n "$winner" ]]; then
        st="$(awk -F'\t' -v b="$winner" '$3 == b {print $1; exit}' "$TMP/rows")"
      else
        st=div
      fi
    fi
    wref=""
    [[ -n "$winner" ]] && wref="$(awk -F'\t' -v b="$winner" '$3 == b {print $4; exit}' "$TMP/rows")"
    # Порожнє поле пишемо як «-»: read з IFS=таб склеює два таби поспіль і зсуває поля.
    printf '%s\t%s\t%s\t%s\t%s\n' "$st" "$path" "${winner:--}" "${wref:--}" "$names" >> "$TMP/final"
  done < "$TMP/paths"

  # Незакомічені журнали в усіх worktree (зокрема в головній теці).
  git -C "$TOP" worktree list --porcelain -z | tr '\0' '\n' | sed -n 's/^worktree //p' > "$TMP/wts"
  local e xy
  while IFS= read -r wt; do
    [[ -d "$wt" ]] || continue
    git -C "$wt" status --porcelain=v1 -z --untracked-files=all -- "${TOPSPECS[@]}" 2>/dev/null |
      while IFS= read -r -d '' e; do
        xy="${e:0:2}"
        case "$xy" in R*|C*) IFS= read -r -d '' _ ;; esac   # у перейменування наступне поле: старий шлях
        printf '%s\t%s\t%s\n' "$wt" "$xy" "${e:3}"
      done >> "$TMP/unc"
  done < "$TMP/wts"

  # Звіт.
  local n_new n_upd n_div n_unc total
  n_new="$(grep -c '^new' "$TMP/final")"; n_upd="$(grep -c '^upd' "$TMP/final")"
  n_div="$(grep -c '^div' "$TMP/final")"; n_unc="$(grep -c . "$TMP/unc")"
  total=$(( n_new + n_upd + n_div + n_unc ))
  FOUND=$(( FOUND + total ))
  if (( total == 0 )); then
    (( QUIET )) || say "journal-scan: $label: усі журнали в $MAIN_NAME."
  else
    say "journal-scan: $label: журналів поза $MAIN_NAME: $total"
    if (( n_new )); then
      say "  Немає в $MAIN_NAME ($n_new):"
      while IFS=$'\t' read -r st path blob wref names; do say "    $path  <- $names"; done < <(grep '^new' "$TMP/final")
    fi
    if (( n_upd )); then
      say "  Новіша версія в гілці, ніж у $MAIN_NAME ($n_upd):"
      while IFS=$'\t' read -r st path blob wref names; do say "    $path  <- $names"; done < <(grep '^upd' "$TMP/final")
    fi
    if (( n_div )); then
      say "  Версії розійшлися, вирішує людина ($n_div), порівняти: git diff $MAIN_NAME:<шлях> <гілка>:<шлях>"
      while IFS=$'\t' read -r st path blob wref names; do say "    $path  <- $names"; done < <(grep '^div' "$TMP/final")
    fi
    if (( n_unc )); then
      say "  Незакомічені у worktree ($n_unc), спершу коміт у їхній гілці:"
      while IFS=$'\t' read -r wt xy path; do say "    $(rel "$wt"): $xy $path"; done < "$TMP/unc"
    fi
    if (( !APPLY && n_new + n_upd )); then
      if has_origin; then
        say "  Перенести в $MAIN_NAME (тільки після «так» людини в чаті): .agents/bin/journal-scan.sh --apply --push"
      else
        say "  Перенести в $MAIN_NAME (тільки після «так» людини в чаті): .agents/bin/journal-scan.sh --apply"
      fi
    fi
  fi
  if (( !FETCH )) && has_origin; then
    local fh
    fh="$(git -C "$TOP" rev-parse --path-format=absolute --git-common-dir)/FETCH_HEAD"
    if [[ -f "$fh" ]]; then
      (( total )) && say "  (гілки origin/* станом на $(date -r "$fh" '+%d.%m.%Y %H:%M'); свіжіші: --fetch)"
    fi
  fi

  (( APPLY )) && apply_repo "$label" "$n_div" "$n_unc"
}

apply_repo() {  # <назва> <скільки розійшлось> <скільки незакомічених>
  local label="$1" mw tmpwt="" path st blob wref names applied=() skipped=0
  LEFT=$(( LEFT + $2 + $3 ))
  grep -E '^(new|upd)' "$TMP/final" > "$TMP/todo"
  [[ -s "$TMP/todo" ]] || return 0
  if ! git -C "$TOP" show-ref --verify -q "refs/heads/$MAIN_NAME"; then
    say "  --apply: локальної гілки $MAIN_NAME немає, переносити нікуди."
    ERR=1; return
  fi

  # Працюємо там, де зачекаутено main. Ніде (головна тека на іншій гілці): тимчасовий worktree.
  mw="$(git -C "$TOP" worktree list --porcelain -z | tr '\0' '\n' | awk -v b="branch refs/heads/$MAIN_NAME" '
    /^worktree /{w=substr($0,10)} $0 == b {print w; exit}')"
  if [[ -z "$mw" ]]; then
    tmpwt="$(mktemp -d "${TMPDIR:-/tmp}/journal-scan-main.XXXXXX")" || { ERR=1; return; }
    if ! git -C "$TOP" worktree add -q "$tmpwt" "$MAIN_NAME" 2>"$TMP/err"; then
      say "  --apply: не вдалося відкрити $MAIN_NAME у тимчасовому worktree: $(head -1 "$TMP/err")"
      rmdir "$tmpwt" 2>/dev/null; ERR=1; return
    fi
    mw="$tmpwt"
  fi

  while IFS=$'\t' read -r st path blob wref names; do
    if [[ -n "$(git -C "$mw" status --porcelain -- ":(top)$path")" ]]; then
      say "  пропущено $path: у теці з $MAIN_NAME ($(rel "$mw")) цей файл уже змінено або не закомічено, вирішує людина."
      skipped=$(( skipped + 1 )); continue
    fi
    mkdir -p "$mw/$(dirname "$path")"
    if ! git -C "$TOP" cat-file blob "$blob" > "$mw/$path"; then
      say "  пропущено $path: не вдалося прочитати версію з гілки $names."
      skipped=$(( skipped + 1 )); continue
    fi
    git -C "$mw" add -- ":(top)$path"
    applied+=("$path")
  done < "$TMP/todo"
  LEFT=$(( LEFT + skipped ))

  if (( ${#applied[@]} )); then
    # --only: у коміт іде тільки перенесене, чужі staged зміни в головній теці лишаються як були.
    if git -C "$mw" commit -q --only -m "Журнали: ${#applied[@]} з гілок перенесено в $MAIN_NAME (journal-scan --apply)" -- "${applied[@]}" 2>"$TMP/err"; then
      say "  Перенесено в $MAIN_NAME: ${#applied[@]}, коміт $(git -C "$mw" rev-parse --short HEAD)"
      for path in "${applied[@]}"; do say "    $path"; done
      if (( PUSH )); then
        if ! has_origin; then
          say "  origin немає, push пропущено."
        elif git -C "$mw" push -q origin "$MAIN_NAME" 2>"$TMP/err"; then
          say "  Запушено в origin/$MAIN_NAME."
        else
          say "  push не вдався, коміт лишився локально: $(head -1 "$TMP/err")"; ERR=1
        fi
      fi
      # Повний шлях до скрипта ГОЛОВНОЇ теки: відносний з worktree запускав його копію в гілці
      # worktree, а та могла бути старою і брала файли гілки без перенесеного журналу (2026-09-26).
      say "  Далі онови памʼять: \"$PROJECT_ROOT/.agents/bin/mempalace-refresh.sh\""
      # Refresh бере основу з головної теки. Main відкрито не в ній (тимчасовий чи інший worktree),
      # тож головна тека не на main, і перенесене туди в памʼять поки не потрапить.
      [[ "$mw" != "$(git -C "$TOP" worktree list --porcelain -z | tr '\0' '\n' | sed -n '1s/^worktree //p')" ]] \
        && say "  Головна тека не на $MAIN_NAME: перенесене потрапить у памʼять, коли $MAIN_NAME буде в головній теці."
    else
      say "  --apply: коміт не вдався: $(head -1 "$TMP/err")"
      ERR=1
    fi
  fi

  if [[ -n "$tmpwt" ]] && ! git -C "$TOP" worktree remove "$tmpwt" 2>/dev/null; then
    say "  тимчасовий worktree лишився, прибрати вручну: git worktree remove $tmpwt"
  fi
}

LABEL="$(basename "$PROJECT_ROOT")"
scan_repo "$ROOT" "$LABEL"
if [[ -e "$PROJECT_ROOT/site/.git" && -d "$PROJECT_ROOT/site/.agents/journal" ]]; then
  scan_repo "$PROJECT_ROOT/site" "$LABEL/site"
fi

if (( APPLY )); then
  printf '%s' "$REPORT"
  (( ERR )) && exit 2
  (( LEFT )) && exit 1
  exit 0
fi
if (( ERR )); then printf '%s' "$REPORT"; exit 2; fi
if (( FOUND == 0 )); then
  (( QUIET )) || printf '%s' "$REPORT"
  exit 0
fi
printf '%s' "$REPORT"
exit 1
