() => {
  /*
    layout-text-check / check-text.js

    ЯК ЗАПУСКАТИ. Файл уже в потрібній обгортці «() => { ... }»: беремо його вміст
    цілком і кладемо в поле «function» інструмента mcp__playwright__browser_evaluate.
    Обгортати додатково НЕ треба, різати теж: скрипт самодостатній, зовнішніх
    залежностей немає.

    БРАУЗЕР У НАС СПІЛЬНИЙ. Playwright MCP тримає одну вкладку на кілька сесій, і між
    двома окремими викликами (navigate, потім resize, потім evaluate) інша сесія може
    перемкнути вкладку на свій сайт. Це вже ставалося. Тому надійний спосіб один:
    goto, setViewportSize і evaluate в ОДНОМУ виклику browser_run_code_unsafe, а
    hostname читати з результату ТОГО САМОГО виклику, який дав числа. Приклад у SKILL.md.

    ЩО РОБИТЬ. Тільки читає: DOM, обчислені стилі і геометрію. Нічого не клікає,
    нічого не вводить, нічого не змінює. Безпечно на живому сайті.

    ПЕРЕД ПРОГОНОМ прокрути сторінку до низу і дай шрифтам догрузитися. Блоки з
    анімацією появи (наприклад Elementor .elementor-invisible) до появи стоять
    visibility:hidden і чесно не рахуються, а шрифт, який ще не приїхав, ламає
    рядки інакше, ніж бачить людина.

    ПОВЕРТАЄ об'єкт:
      {
        href, hostname, innerWidth,
        findings: [{level, severity, rule, selector, text, detail}],
        summary: {дефект, попередження, підказка, усього, правила, обрізано,
                  перевірено, залишок бюджету}
      }
      level     1 | 2 | 3 (рівень з плану скіла)
      severity  "дефект" | "попередження" | "підказка"
      rule      машинне ім'я перевірки, латиницею
      selector  короткий шлях до елемента, щоб знайти його в DevTools
      text      уривок тексту до 40 символів, щоб людина знайшла місце очима
      detail    числа перевірки: відсотки, кегль, трекінг, знайдені символи

    ПОРОЖНІЙ СПИСОК ЗНАХІДОК САМ ПО СОБІ НІЧОГО НЕ ДОВОДИТЬ. Дивись
    summary.перевірено: скільки блоків, кнопок і форм скрипт реально подивився.
    Нулі там означають, що сторінка не догрузилася або весь вміст прихований,
    а не що верстка чиста. Дивись і summary.обрізано: там з'являється запис, коли
    кандидатів більше за MAX_CANDIDATES або коли вичерпано CHAR_BUDGET (тоді
    visualLines() повертає порожньо і правила про рядки мовчать без жодного знака).

    ВІЗУАЛЬНІ РЯДКИ рахуються через Range і getBoundingClientRect по кожному символу,
    а не діленням тексту по символах чи по <br>. Символи групуються в рядок за
    вертикальним перекриттям прямокутників, тому робота йде з тим, що реально на екрані.

    ЩО ВВАЖАЄМО ПРИХОВАНИМ (перевірено на живих сайтах, кожна умова через
    негативний контроль на фікстурі): display:none, visibility:hidden, content-visibility,
    атрибут hidden, aria-hidden="true", класи для скрінрідерів, винесене за екран
    (right <= 0), нульовий розмір, і предок з overflow:hidden, який ріже блок більш
    ніж наполовину. Два свідомі винятки: opacity:0 НЕ ховає (це передумова анімації
    появи, і самотнє слово в такому блоці це такий самий дефект), а хіт-тест
    document.elementFromPoint не робимо взагалі: фіксовані шапки і точки нижче згину
    дають хибний вирок «перекрито».

    ДЕДУПЛІКАЦІЯ ДВОРІВНЕВА:
    1) Блок, де вже спрацював lone-word, правило short-line пропускає ЦІЛКОМ. Інакше
       заголовок «Часті | запитання» давав дві знахідки про одне місце.
    2) Однакові знахідки зливаються за ШАБЛОНОМ СЕЛЕКТОРА, а не за уривком тексту:
       десять карток каталогу з однаковим класом і різними назвами це одна знахідка
       з приміткою «таких самих місць: N». Ціна: два різні заголовки з однаковим
       шаблоном теж зіллються, і другий у список не потрапить.

    МЕЖІ ПРАВИЛ.
    - line-end-preposition, lone-word і short-line не працюють на <p>: абзац у
      кандидати не береться, навіть якщо на ньому висить клас заголовка (Elementor
      вішає elementor-heading-title і на абзаци).
    - tracking міряється в em (поріг 0.02em при кеглі більше 16px), а не в пікселях:
      0.56px при кеглі 56px це 0.01em, тобто нормальна типографіка.
    - display-leading спрацьовує тільки коли рядків справді два і більше і в тексті
      є літери: в одному рядку інтерліньяжу немає, а лічильник «223» це не набір.
    - ui-symbols прощає крапку-роздільник «·» у підвалі і в юридичному рядку
      (© , ТОВ, ЄДРПОУ, «Політика»). Буліт, стрілка, галочка і емодзі не прощаються ніде.

    ЧОРНИЙ СПИСОК КНОПОК свідомо короткий: тільки явно беззмістовні фрази з плану.
    Односкладні кнопки магазину («Купити», «В кошик») це норма каталогу, їх не чіпаємо.
    Список можна розширювати, він у змінній BAD_BUTTONS.
  */
  'use strict';

  var CAP = 25;              // більше знахідок одного правила не показуємо
  var MAX_TEXT = 600;        // довший блок на візуальні рядки не розбиваємо
  var MAX_ELEMENTS = 12000;  // стеля обходу елементів для трекінгу і інтерліньяжу
  var MAX_CANDIDATES = 600;  // стеля заголовків, кнопок і назв карток
  var CHAR_BUDGET = 20000;   // стеля виміряних символів на весь прогін

  var findings = [];
  var counts = {};
  var truncated = {};
  var seenKey = {};          // однакові знахідки зливаємо в одну з лічильником
  var checked = { 'блоків': 0, 'кнопок': 0, 'форм': 0, 'елементів': 0 };
  var budget = CHAR_BUDGET;

  /* ---------- дрібні помічники ---------------------------------------- */

  function cls(el) {
    var v = el && el.getAttribute ? el.getAttribute('class') : '';
    return typeof v === 'string' ? v : '';
  }

  function norm(t) {
    return String(t == null ? '' : t).replace(/[ \s]+/g, ' ').trim();
  }

  function snip(t) {
    var s = norm(t);
    return s.length > 40 ? s.slice(0, 40) + '…' : s;
  }

  function words(t) {
    var s = norm(t);
    return s ? s.split(' ') : [];
  }

  // Вкладений елемент і <br> це межа слів. Без пробілу на цій межі
  // «Системний<br>Pest» злипається в «СистемнийPest», і людина такого уривка
  // на сторінці очима не знайде.
  function ownText(el) {
    var out = '';
    for (var n = el.firstChild; n; n = n.nextSibling) {
      if (n.nodeType === 3) out += n.nodeValue; else out += ' ';
    }
    return norm(out);
  }

  // Увесь текст блоку разом із вкладеними, з тим самим пробілом на межах.
  function blockText(el) {
    var out = '';
    var w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, null);
    var n;
    while ((n = w.nextNode())) out += (n.nodeType === 3 ? (n.nodeValue || '') : ' ');
    return norm(out);
  }

  function selectorFor(el) {
    if (!el || el.nodeType !== 1) return '';
    var parts = [];
    var node = el;
    for (var i = 0; i < 3 && node && node.nodeType === 1; i++) {
      var tag = (node.tagName || '').toLowerCase();
      if (tag === 'body' || tag === 'html') break;
      var s = tag;
      if (node.id) { parts.unshift(s + '#' + node.id); break; }
      var list = cls(node).trim().split(/\s+/).filter(Boolean).slice(0, 2);
      if (list.length) {
        s += '.' + list.join('.');
      } else {
        var idx = 1, sib = node;
        while ((sib = sib.previousElementSibling)) if (sib.tagName === node.tagName) idx++;
        if (idx > 1) s += ':nth-of-type(' + idx + ')';
      }
      parts.unshift(s);
      node = node.parentElement;
    }
    return parts.join(' > ');
  }

  // Каталог дає десятки однакових карток: 20 рядків «Дивитися →» це не звіт, а шум.
  // Однакові знахідки (те саме правило і той самий уривок) зливаємо в одну,
  // а кількість місць дописуємо в detail у кінці прогону.
  function add(level, severity, rule, el, text, detail) {
    counts[rule] = (counts[rule] || 0) + 1;
    var sel = selectorFor(el);
    // Ключ злиття це ШАБЛОН СЕЛЕКТОРА, а не уривок тексту: десять карток каталогу
    // з різними назвами і однаковим класом дають одну знахідку, а не десять рядків.
    // Ціна рішення названа в SKILL.md: два різні заголовки з однаковим шаблоном
    // теж зіллються, і другий у список не потрапить.
    var pat = sel.replace(/:nth-of-type\(\d+\)/g, '');
    var key = rule + '|' + severity + '|' + pat +
      ((pat.indexOf('.') === -1 && pat.indexOf('#') === -1) ? '|' + snip(text) : '');
    if (seenKey[key]) { seenKey[key].repeats++; return; }
    if (counts[rule] > CAP) { truncated[rule] = counts[rule]; return; }
    var f = {
      level: level,
      severity: severity,
      rule: rule,
      selector: sel,
      text: snip(text),
      detail: detail
    };
    seenKey[key] = { f: f, repeats: 1 };
    findings.push(f);
  }

  /* ---------- видимість: одна функція на всі проходи -------------------- */

  var SKIP_TAGS = {
    SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, TEMPLATE: 1, SVG: 1,
    CANVAS: 1, IFRAME: 1, HEAD: 1, TITLE: 1, META: 1, LINK: 1, OPTION: 1
  };

  var SR_ONLY = /(^|\s)(screen-reader-text|sr-only|sr-only-focusable|visually-hidden|visuallyhidden|elementor-screen-only|hidden-text)(\s|$)/i;

  // Іконка це: сімейство шрифту зі списку нижче, АБО гліф приватної зони Юнікоду,
  // АБО іконковий клас разом з текстом не довшим за 3 символи.
  var ICON_FONTS = /font\s*awesome|fontawesome|dashicons|icomoon|material\s*icons|glyphicons|simple-line|themify|eicons|elementor\s*icons|woodmart-font|xts-icon|ionicons|feather|bootstrap-icons|linearicons/i;
  // Голої хвостової альтернативи |icon тут свідомо немає, і кожен клас перевіряється
  // окремим токеном з відсівом ICON_NOT. Причина: «elementor-icon-box-title» це НАЗВА
  // КАРТКИ, а не іконка, і в парі з умовою «текст не довший за 3 символи» вона мовчки
  // ковтала будь-яку коротку назву («IPM», «ISO», «BRC»).
  var ICON_CLASS = /(^|[\s\-_])(fa|fas|far|fab|fal|fad|icon|icons|eicon|dashicons|glyphicon|mdi|bi|ti)([\s\-_]|$)/i;
  var ICON_NOT = /(title|text|label|head|name|caption|desc|link|btn|button)/i;
  // Приватна зона Юнікоду: іконкові шрифти малюють свої гліфи саме там
  var PUA_RE = /[\ue000-\uf8ff]/;

  function iconClass(c) {
    var toks = String(c || '').split(/\s+/);
    for (var i = 0; i < toks.length; i++) {
      if (toks[i] && ICON_CLASS.test(toks[i]) && !ICON_NOT.test(toks[i])) return true;
    }
    return false;
  }

  function iconish(el, text) {
    if (!el || el.nodeType !== 1) return false;
    var ff = '';
    try { ff = getComputedStyle(el).fontFamily || ''; } catch (e) { ff = ''; }
    if (ICON_FONTS.test(ff)) return true;
    var t = norm(text == null ? el.textContent : text);
    if (PUA_RE.test(t)) return true;
    return t.length <= 3 && iconClass(cls(el));
  }

  function hiddenChain(el) {
    var node = el;
    while (node && node.nodeType === 1) {
      var tag = (node.tagName || '').toUpperCase();
      if (SKIP_TAGS[tag]) return true;
      if (node.getAttribute && node.getAttribute('aria-hidden') === 'true') return true;
      if (node.hasAttribute && node.hasAttribute('hidden')) return true;
      if (SR_ONLY.test(cls(node))) return true;
      var cs = null;
      try { cs = getComputedStyle(node); } catch (e) { return true; }
      if (!cs) return true;
      if (cs.display === 'none') return true;
      if (cs.visibility === 'hidden' || cs.visibility === 'collapse') return true;
      if (cs.contentVisibility === 'hidden') return true;
      node = node.parentElement;
    }
    return false;
  }

  // Предок з overflow:hidden обрізає власний вміст, і текст під зрізом людина
  // не бачить узагалі. Реальний випадок зі стейджу: контейнер clientHeight 451
  // при scrollHeight 775, заголовок нижче зрізу, а скрипт міряв у ньому рядки.
  // html і body свідомо пропущені: body{overflow:hidden} стоїть на кожному сайті
  // з відкритим меню чи модалкою, і без винятку зникло б усе нижче першого екрана.
  // Прокручувані предки (auto, scroll) теж не рахуються: там вміст досяжний.
  function clippedByAncestor(el, r) {
    if (!r || r.height <= 0 || r.width <= 0) return false;
    var node = el.parentElement;
    for (var g = 0; node && node.nodeType === 1 && g < 40; g++) {
      var tag = (node.tagName || '').toUpperCase();
      if (tag === 'BODY' || tag === 'HTML') break;
      var cs;
      try { cs = getComputedStyle(node); } catch (e) { return false; }
      // прокручуваний предок (кастомний скрол, off-canvas макет): вміст нижче
      // згину доступний прокруткою, тому обрізання вище по дереву не рахуємо
      if (cs.overflowY === 'auto' || cs.overflowY === 'scroll' ||
          cs.overflowX === 'auto' || cs.overflowX === 'scroll') break;
      var clipY = (cs.overflowY === 'hidden' || cs.overflowY === 'clip');
      var clipX = (cs.overflowX === 'hidden' || cs.overflowX === 'clip');
      if (clipY || clipX) {
        var ar = node.getBoundingClientRect();
        // видно менше половини елемента по будь-якій осі = вважаємо прихованим
        if (clipY && (Math.min(r.bottom, ar.bottom) - Math.max(r.top, ar.top)) < 0.5 * r.height) return true;
        if (clipX && (Math.min(r.right, ar.right) - Math.max(r.left, ar.left)) < 0.5 * r.width) return true;
      }
      node = node.parentElement;
    }
    return false;
  }

  // opacity:0 свідомо НЕ ховає: блок з анімацією появи до скролу стоїть саме так,
  // і самотнє слово в ньому це такий самий дефект.
  function visible(el) {
    if (!el || el.nodeType !== 1) return false;
    if (hiddenChain(el)) return false;
    var r;
    try { r = el.getBoundingClientRect(); } catch (e) { return false; }
    if (!r || r.width < 2 || r.height < 2) return false;
    if (r.right <= 0 || r.left >= window.innerWidth) return false; // винесене за екран меню
    if (clippedByAncestor(el, r)) return false;
    return true;
  }

  /* ---------- візуальні рядки ------------------------------------------ */

  function visualLines(el) {
    var whole = el.textContent || '';
    if (!norm(whole) || whole.length > MAX_TEXT || budget <= 0) return [];
    var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
    var range = document.createRange();
    var lines = [];
    var last = null;
    var node;
    while ((node = walker.nextNode())) {
      var parent = node.parentElement;
      if (!parent) continue;
      if (hiddenChain(parent)) continue;
      if (iconish(parent, node.nodeValue)) continue;
      var s = node.nodeValue || '';
      for (var i = 0; i < s.length; i++) {
        if (budget-- <= 0) break;
        var ch = s[i];
        var r = null;
        try {
          range.setStart(node, i);
          range.setEnd(node, i + 1);
          r = range.getBoundingClientRect();
        } catch (e) { continue; }
        var space = /\s/.test(ch);
        if (!r || (r.width === 0 && r.height === 0)) {
          // пробіл у точці переносу власного прямокутника не має: тримаємо його
          // при попередньому рядку, інакше склеяться сусідні слова
          if (space && last) last.text += ' ';
          continue;
        }
        var line = null;
        for (var k = 0; k < lines.length; k++) {
          var L = lines[k];
          var ov = Math.min(r.bottom, L.bottom) - Math.max(r.top, L.top);
          if (ov > 0.5 * Math.min(r.height, L.bottom - L.top)) { line = L; break; }
        }
        if (!line) {
          line = { top: r.top, bottom: r.bottom, left: Infinity, right: -Infinity, text: '' };
          lines.push(line);
        } else {
          line.top = Math.min(line.top, r.top);
          line.bottom = Math.max(line.bottom, r.bottom);
        }
        // ширину рядка міряємо тільки по видимих символах, без хвостових пробілів
        if (!space) {
          line.left = Math.min(line.left, r.left);
          line.right = Math.max(line.right, r.right);
        }
        line.text += ch;
        last = line;
      }
    }
    lines.sort(function (a, b) { return a.top - b.top; });
    var out = [];
    for (var j = 0; j < lines.length; j++) {
      var t = norm(lines[j].text);
      if (!t) continue;
      var w = (lines[j].right > lines[j].left) ? Math.round(lines[j].right - lines[j].left) : 0;
      out.push({ text: t, width: w, top: Math.round(lines[j].top) });
    }
    return out;
  }

  /* ---------- словники -------------------------------------------------- */

  var BAD_BUTTONS = [
    'надіслати', 'відправити', 'докладніше', 'детальніше', 'дізнатися більше',
    'читати далі', 'отправить', 'подробнее', 'узнать больше', 'submit', 'learn more'
  ];

  // Прийменники, сполучники і частки, яким не можна лишатися в кінці рядка:
  // між ними і наступним словом потрібен нерозривний пробіл.
  var STICKY = ('в у во на з із зі с со до від от при для про за над під под перед між между без по о об та і й и а но не ні же ж як как що что к ко из ' +
    'the a an of in on to for and or with at by').split(' ');

  var STICKY_MAP = {};
  for (var si = 0; si < STICKY.length; si++) STICKY_MAP[STICKY[si]] = 1;

  // Маркери, стрілки, галочки. Емодзі окремим правилом нижче.
  var SYM_RE = /[·•‣⁃▪●◦←-⇿✓✔✅➔-➿⬀-⯿]/g;
  var EMOJI_RE;
  try {
    EMOJI_RE = new RegExp('\\p{Extended_Pictographic}', 'gu');
  } catch (e) {
    EMOJI_RE = /[\ud83c-\udbff][\udc00-\udfff]/g;
  }
  // ©, ®, ™, ℹ формально емодзі, але в підвалі сайту це норма
  var EMOJI_OK = /[©®™ℹ]/;

  function foundSymbols(text) {
    var hits = [];
    var m;
    SYM_RE.lastIndex = 0;
    while ((m = SYM_RE.exec(text))) if (hits.indexOf(m[0]) === -1) hits.push(m[0]);
    EMOJI_RE.lastIndex = 0;
    while ((m = EMOJI_RE.exec(text))) {
      if (EMOJI_OK.test(m[0])) continue;
      if (hits.indexOf(m[0]) === -1) hits.push(m[0]);
    }
    return hits;
  }

  // Службовий рядок підвалу: там крапка-роздільник це конвенція, а не буліт.
  var LEGAL_RE = /©|ЄДРПОУ|ЕГРПОУ|ТОВ\s|ФОП\s|політик|политик|privacy|всі права|все права|all rights/i;

  function serviceLine(host, text) {
    if (LEGAL_RE.test(text)) return true;
    var node = host;
    for (var g = 0; node && node.nodeType === 1 && g < 40; g++) {
      var tag = (node.tagName || '').toUpperCase();
      if (tag === 'BODY') break;
      if (tag === 'FOOTER' || node.getAttribute('role') === 'contentinfo') return true;
      node = node.parentElement;
    }
    return false;
  }

  function forBlacklist(t) {
    return norm(t)
      .toLowerCase()
      .replace(SYM_RE, ' ')
      .replace(/[.,!?:;"'«»“”‘’()\[\]…–\-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function isButtonish(el) {
    var tag = (el.tagName || '').toUpperCase();
    if (tag === 'BUTTON') return true;
    if (tag === 'INPUT' && /^(submit|button)$/i.test(el.getAttribute('type') || '')) return true;
    if (el.getAttribute('role') === 'button') return true;
    return /(^|[\s\-_])(btn|button)([\s\-_]|$)|btn-|button--|elementor-button|wp-block-button__link/i.test(cls(el));
  }

  function buttonText(el) {
    return (el.tagName || '').toUpperCase() === 'INPUT' ? (el.value || '') : blockText(el);
  }

  /* ---------- прохід 1: заголовки, кнопки, назви карток ----------------- */

  var DISPLAY_SEL = [
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'button', '[role="button"]', 'input[type="submit"]', 'input[type="button"]',
    'a.button', 'a[class*="btn"]', 'a[class*="button"]',
    '[class*="title"]', '[class*="heading"]', '[class*="headline"]',
    '.wp-block-button__link', '.elementor-button'
  ].join(',');

  var raw = [];
  try { raw = Array.prototype.slice.call(document.querySelectorAll(DISPLAY_SEL)); } catch (e) { raw = []; }

  var candidates = [];
  for (var ci = 0; ci < raw.length && candidates.length < MAX_CANDIDATES; ci++) {
    var cand = raw[ci];
    if (!norm(cand.textContent) && !norm(cand.value || '')) continue;
    // <p> у кандидати не беремо. Elementor вішає клас elementor-heading-title на
    // будь-який вивід віджета заголовка, у тому числі на абзац, і тоді правила
    // для заголовків міряли суцільний текст: на стейджі це дало 4 хибні знахідки.
    var ctag = (cand.tagName || '').toUpperCase();
    if (ctag === 'P' && cand.getAttribute('role') !== 'heading' && !isButtonish(cand)) continue;
    if (!visible(cand)) continue;
    candidates.push(cand);
  }
  if (ci < raw.length) {
    truncated['кандидати'] = 'узято ' + candidates.length + ' з ' + raw.length +
      ' збігів селектора (стеля MAX_CANDIDATES = ' + MAX_CANDIDATES + ')';
  }

  // Вкладені кандидати. Зовнішній виграє завжди, крім випадку, коли він чиста
  // обгортка з тим самим текстом (div.title навколо h2). Інакше акцентний span
  // усередині заголовка підмінив би собою весь заголовок.
  var display = candidates.filter(function (el) {
    var mine = norm(el.textContent);
    for (var k = 0; k < candidates.length; k++) {
      var other = candidates[k];
      if (other === el) continue;
      if (other.contains(el) && norm(other.textContent) !== mine) return false;
      if (el.contains(other) && norm(other.textContent) === mine) return false;
    }
    return true;
  });

  checked['блоків'] = display.length;

  for (var di = 0; di < display.length; di++) {
    var el = display[di];
    var btn = isButtonish(el);
    if (btn) checked['кнопок']++;

    // 3. Кнопка з чорного списку
    if (btn) {
      var bt = forBlacklist(buttonText(el));
      if (BAD_BUTTONS.indexOf(bt) !== -1) {
        add(1, 'дефект', 'button-blacklist', el, buttonText(el),
          'текст кнопки «' + norm(buttonText(el)) + '» нічого не обіцяє: напиши, що людина отримає');
      }
    }

    var lines = visualLines(el);
    if (lines.length < 2) continue;

    var lastLine = lines[lines.length - 1];
    var loneWord = words(lastLine.text).length === 1;

    // 1. Самотнє слово в останньому візуальному рядку
    if (loneWord) {
      add(1, 'дефект', 'lone-word', el, lines.map(function (x) { return x.text; }).join(' '),
        'рядків: ' + lines.length + ', в останньому одне слово «' + lastLine.text + '»');
    }

    // 2. Рядок помітно коротший за найдовший у блоці (найгірший рядок на блок).
    // Спрацював lone-word - тут мовчимо на ВСЬОМУ блоці, а не лише на останньому
    // рядку. Двослівний заголовок «Часті | запитання» інакше давав дві знахідки
    // про одне місце: самотнє слово в кінці і короткий перший рядок 48%.
    var longest = 0;
    for (var li = 0; li < lines.length; li++) longest = Math.max(longest, lines[li].width);
    if (!loneWord && longest >= 60) {
      var worst = null, worstRatio = 1;
      for (var lj = 0; lj < lines.length; lj++) {
        if (!lines[lj].width) continue;
        var ratio = lines[lj].width / longest;
        if (ratio < worstRatio) { worstRatio = ratio; worst = lj; }
      }
      if (worst !== null && worstRatio < 0.85) {
        var pct = Math.round(worstRatio * 100);
        // уривок з двох символів («4.») на сторінці не знайти: тоді беремо весь блок
        var shortSnip = lines[worst].text.length >= 4 ? lines[worst].text : blockText(el);
        add(1, worstRatio < 0.60 ? 'дефект' : 'попередження', 'short-line', el, shortSnip,
          'рядок ' + (worst + 1) + ' з ' + lines.length + ' це ' + pct + '% найдовшого (' +
          lines[worst].width + 'px проти ' + longest + 'px)');
      }
    }

    // 7. Прийменник у кінці рядка (перший випадок на блок)
    for (var lk = 0; lk < lines.length - 1; lk++) {
      var ws = words(lines[lk].text);
      var tail = ws.length ? ws[ws.length - 1].toLowerCase().replace(/[^0-9a-zа-яіїєґё]/gi, '') : '';
      if (tail && STICKY_MAP[tail]) {
        add(2, 'попередження', 'line-end-preposition', el, lines[lk].text,
          'рядок ' + (lk + 1) + ' закінчується на «' + tail + '»: потрібен &nbsp; перед наступним словом');
        break;
      }
    }
  }

  /* ---------- прохід 2: символи і емодзі в тексті інтерфейсу ------------ */

  var symSeen = [];
  var symWalker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
  var tn;
  while ((tn = symWalker.nextNode())) {
    var val = tn.nodeValue || '';
    if (!val || !norm(val)) continue;
    var hits = foundSymbols(val);           // спершу дешевий тест, потім дорога перевірка видимості
    if (!hits.length) continue;
    var host = tn.parentElement;
    if (!host || symSeen.indexOf(host) !== -1) continue;
    if (iconish(host, val) || !visible(host)) continue;
    if (serviceLine(host, val)) {
      hits = hits.filter(function (h) { return h !== '\u00b7'; });
      if (!hits.length) continue;
    }
    symSeen.push(host);
    add(1, 'дефект', 'ui-symbols', host, val, 'у тексті: ' + hits.join(' '));
  }

  /* ---------- прохід 3: трекінг і інтерліньяж --------------------------- */

  var all = document.body.getElementsByTagName('*');
  var limit = Math.min(all.length, MAX_ELEMENTS);
  if (all.length > MAX_ELEMENTS) truncated['обхід елементів'] = all.length;
  for (var ai = 0; ai < limit; ai++) {
    var node2 = all[ai];
    var own = ownText(node2);
    if (!own) continue;
    if (iconish(node2, own) || !visible(node2)) continue;
    var cs2;
    try { cs2 = getComputedStyle(node2); } catch (e) { continue; }
    checked['елементів']++;
    var fs = parseFloat(cs2.fontSize) || 0;

    // 5. Плюсовий letter-spacing на тексті більше 16px.
    // Міряємо у em, а не в абсолютних пікселях: 0.56px при кеглі 56px це 0.01em,
    // тобто нормальна типографіка, а старий поріг у пікселях бачив у ній дефект.
    var ls = cs2.letterSpacing;
    var lsPx = (ls && ls !== 'normal') ? (parseFloat(ls) || 0) : 0;
    var lsEm = fs ? lsPx / fs : 0;
    if (fs > 16 && lsEm >= 0.02) {
      add(2, 'дефект', 'tracking', node2, own,
        'letter-spacing ' + ls + ' це ' + (Math.round(lsEm * 100) / 100) + 'em при кеглі ' +
        Math.round(fs) + 'px: розріджений великий текст читається гірше');
    }

    // 6. line-height більше 1.0 при кеглі від 40px.
    // Тільки коли рядків справді два і більше: в одному рядку піджимати нічого,
    // міжрядкового інтервалу там фізично немає. Лічильники («223», «116+») теж повз:
    // це числа, а не набір. Обидва випадки зі стейджу, разом 8 хибних з 17.
    if (fs >= 40 && /[A-Za-zА-Яа-яЁёІіЇїЄєҐґ]/.test(own)) {
      var lh = cs2.lineHeight;
      var ratio2 = (lh === 'normal') ? 1.2 : (parseFloat(lh) / fs);
      if (ratio2 > 1.005) {
        var r2 = node2.getBoundingClientRect();   // дешевий відсів однорядкових
        if (r2.height >= 1.6 * fs && visualLines(node2).length >= 2) {
          add(2, 'попередження', 'display-leading', node2, own,
            'line-height ' + (Math.round(ratio2 * 100) / 100) + ' при кеглі ' + Math.round(fs) +
            'px' + (lh === 'normal' ? ' (normal, узято 1.2)' : '') + ': великому кеглю потрібен щільніший інтерліньяж');
        }
      }
    }
  }

  /* ---------- прохід 4: рядок-заспокоєння біля головної кнопки ---------- */

  var forms = document.querySelectorAll('form');
  for (var fi = 0; fi < forms.length; fi++) {
    var form = forms[fi];
    if (!visible(form)) continue;
    var mark = cls(form) + ' ' + (form.getAttribute('id') || '') + ' ' + (form.getAttribute('role') || '');
    if (/search/i.test(mark) || form.querySelector('input[type="search"]')) continue; // пошук заспокоювати нема чого
    var sub = form.querySelector('button[type="submit"], input[type="submit"], [class*="submit"], button');
    if (!sub || !visible(sub)) continue;
    checked['форм']++;
    var br = sub.getBoundingClientRect();

    var pool = Array.prototype.slice.call(form.querySelectorAll('p,small,span,div,li,em'));
    var next = form.nextElementSibling;
    if (next) {
      pool.push(next);
      pool = pool.concat(Array.prototype.slice.call(next.querySelectorAll('p,small,span,em')));
    }
    var calm = null;
    for (var pi = 0; pi < pool.length; pi++) {
      var cand2 = pool[pi];
      var txt = ownText(cand2);
      if (!txt || txt.length < 10 || txt.length > 200) continue;
      if (!visible(cand2)) continue;
      var cr = cand2.getBoundingClientRect();
      if (cr.top < br.bottom - 6 || cr.top - br.bottom > 160) continue; // тільки під кнопкою і поруч
      var cfs = parseFloat(getComputedStyle(cand2).fontSize) || 0;
      if (cfs > 17) continue;
      calm = txt;
      break;
    }
    if (!calm) {
      add(3, 'підказка', 'no-reassurance', sub, buttonText(sub),
        "під кнопкою немає рядка-заспокоєння (скільки чекати дзвінка, що не буде спаму, чи можна відмовитися)");
    }
  }

  /* ---------- вихід ----------------------------------------------------- */

  for (var key in seenKey) {
    if (seenKey[key].repeats > 1) {
      seenKey[key].f.detail += '; таких самих місць на сторінці: ' + seenKey[key].repeats;
    }
  }

  // Мовчазне обрізання гірше за помилку: вичерпаний бюджет робить visualLines()
  // німим, і правила про рядки просто перестають спрацьовувати без жодного знака.
  if (budget <= 0) {
    truncated['бюджет символів'] = 'вичерпано ' + CHAR_BUDGET +
      ': частина блоків не розбита на візуальні рядки, правила про рядки там мовчать';
  }

  var rank = { 'дефект': 0, 'попередження': 1, 'підказка': 2 };
  findings.sort(function (a, b) {
    return (rank[a.severity] - rank[b.severity]) || (a.level - b.level) ||
      (a.rule < b.rule ? -1 : a.rule > b.rule ? 1 : 0);
  });

  var summary = { 'дефект': 0, 'попередження': 0, 'підказка': 0 };
  for (var qi = 0; qi < findings.length; qi++) summary[findings[qi].severity]++;
  summary['усього'] = findings.length;
  summary['правила'] = counts;     // скільки разів спрацювало кожне правило, включно з обрізаним
  summary['обрізано'] = truncated;   // правила, де знахідок більше за стелю CAP
  summary['перевірено'] = checked;   // що саме подивилися: нулі знецінюють порожній звіт
  summary['залишок бюджету'] = Math.max(0, budget) + ' з ' + CHAR_BUDGET + ' символів';

  return {
    href: location.href,
    hostname: location.hostname,
    innerWidth: window.innerWidth,
    findings: findings,
    summary: summary
  };
}
