/**
 * Ticketleo LEO — embeddable popup widget.
 *
 * Drop this on any page:
 *   <script src="https://YOUR-DEPLOYED-SERVER/widget.js"></script>
 *
 * It talks to this same server's real POST /api/chat endpoint (see
 * server.js) — same conversation format, same tools (search_events,
 * search_web), same system prompt, same reply text — just rendered as a
 * floating launcher + panel instead of the full-page site (index.html).
 * Both can run side by side; this file doesn't touch server.js or the
 * full-page site at all.
 *
 * Config (optional, set BEFORE this script tag):
 *   <script>window.TICKETLEO_API_URL = 'https://YOUR-DEPLOYED-SERVER/api/chat';</script>
 *   <script src="https://YOUR-DEPLOYED-SERVER/widget.js"></script>
 * If you don't set TICKETLEO_API_URL, the widget infers it from this
 * script's own src (same origin + "/api/chat") — the common case of
 * hosting the widget file and the API on the same server needs zero config.
 */
(function () {
  if (window.__ticketleoWidgetLoaded) return;
  window.__ticketleoWidgetLoaded = true;

  // ---- config -------------------------------------------------------
  var scriptEl = document.currentScript || (function () {
    var scripts = document.getElementsByTagName('script');
    return scripts[scripts.length - 1];
  })();
  var scriptOrigin = null;
  try { scriptOrigin = new URL(scriptEl.src, window.location.href).origin; } catch (e) {}
  var DEFAULT_API_URL = scriptOrigin ? scriptOrigin + '/api/chat' : '/api/chat';
  var API_URL = window.TICKETLEO_API_URL || DEFAULT_API_URL;

  // ---- fonts + styles -------------------------------------------------
  function injectFontsOnce() {
    if (document.getElementById('tlw-fonts')) return;
    var pre1 = document.createElement('link');
    pre1.rel = 'preconnect'; pre1.href = 'https://fonts.googleapis.com';
    var pre2 = document.createElement('link');
    pre2.rel = 'preconnect'; pre2.href = 'https://fonts.gstatic.com'; pre2.crossOrigin = '';
    var sheet = document.createElement('link');
    sheet.id = 'tlw-fonts';
    sheet.rel = 'stylesheet';
    sheet.href = 'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@600;700&family=Inter:wght@400;500;600;700&display=swap';
    document.head.appendChild(pre1);
    document.head.appendChild(pre2);
    document.head.appendChild(sheet);
  }

  var CSS = ''
    + '.tlw-root{--tlw-card:#ffffff;--tlw-card-soft:#f6f7f9;--tlw-card-hover:#eef0f3;--tlw-border:#e6e7eb;'
    + '--tlw-text:#101218;--tlw-text-muted:#6b7280;--tlw-text-faint:#9aa0ac;'
    + '--tlw-accent:#f2622e;--tlw-accent-bright:#ff7a43;--tlw-accent-dark:#c8501f;'
    + '--tlw-online:#22c55e;--tlw-font-display:\'Space Grotesk\',system-ui,sans-serif;--tlw-font-body:\'Inter\',system-ui,-apple-system,sans-serif;'
    + 'font-family:var(--tlw-font-body);}'
    + '.tlw-root *{box-sizing:border-box;}'
    + '.tlw-launcher{position:fixed;right:24px;bottom:24px;width:58px;height:58px;border-radius:50%;background:linear-gradient(135deg,var(--tlw-accent-bright),var(--tlw-accent-dark));border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:25px;box-shadow:0 16px 32px -10px rgba(242,98,46,.55);z-index:2147483000;transition:transform .18s ease,opacity .18s ease;padding:0;}'
    + '.tlw-launcher:active{transform:scale(.94);}'
    + '.tlw-launcher.tlw-hidden{opacity:0;pointer-events:none;transform:scale(.7);}'
    + '@keyframes tlw-launcher-pulse{0%{box-shadow:0 16px 32px -10px rgba(242,98,46,.55),0 0 0 0 rgba(242,98,46,.45);}70%{box-shadow:0 16px 32px -10px rgba(242,98,46,.55),0 0 0 14px rgba(242,98,46,0);}100%{box-shadow:0 16px 32px -10px rgba(242,98,46,.55),0 0 0 0 rgba(242,98,46,0);}}'
    + '.tlw-launcher.tlw-pulse{animation:tlw-launcher-pulse 2.1s ease-out 2;}'
    + '.tlw-tapme{position:fixed;right:88px;bottom:38px;display:flex;align-items:center;gap:5px;background:#fff;border:1px solid var(--tlw-border);border-radius:999px;padding:6px 12px;font-size:11.5px;font-weight:600;color:var(--tlw-text);white-space:nowrap;z-index:2147483000;box-shadow:0 10px 22px -10px rgba(20,20,30,.2);animation:tlw-tapme-bob 1.6s ease-in-out infinite;transition:opacity .2s ease;font-family:var(--tlw-font-body);}'
    + '.tlw-tapme.tlw-hidden{opacity:0;pointer-events:none;}'
    + '@keyframes tlw-tapme-bob{0%,100%{transform:translateY(0);}50%{transform:translateY(-3px);}}'
    + '.tlw-backdrop{display:none;position:fixed;inset:0;background:rgba(10,10,14,.45);opacity:0;pointer-events:none;transition:opacity .22s ease;z-index:2147482998;}'
    + '.tlw-backdrop.tlw-show{opacity:1;pointer-events:auto;}'
    + '.tlw-panel{position:fixed;right:24px;bottom:96px;width:380px;max-width:calc(100vw - 32px);height:600px;max-height:calc(100vh - 140px);background:var(--tlw-card);border:1px solid var(--tlw-border);border-radius:18px;box-shadow:0 26px 60px -24px rgba(15,15,25,.3);display:flex;flex-direction:column;overflow:hidden;z-index:2147482999;transform:translateY(14px) scale(.97);opacity:0;pointer-events:none;transition:transform .22s cubic-bezier(.22,.9,.32,1.05),opacity .18s ease,border-radius .2s ease;color:var(--tlw-text);}'
    + '.tlw-panel.tlw-open{transform:translateY(0) scale(1);opacity:1;pointer-events:auto;}'
    + '.tlw-panel-handle{display:none;}'
    + '.tlw-panel-header{flex:none;display:flex;align-items:center;gap:7px;padding:14px 12px 12px 14px;border-bottom:1px solid var(--tlw-border);}'
    + '.tlw-back{display:none;width:28px;height:28px;border-radius:9px;border:none;background:transparent;color:var(--tlw-text-muted);align-items:center;justify-content:center;cursor:pointer;flex:none;padding:0;}'
    + '.tlw-back svg{width:17px;height:17px;}'
    + '.tlw-panel[data-view="chat"] .tlw-back{display:flex;}'
    + '.tlw-avatar{width:32px;height:32px;border-radius:50%;flex:none;background:linear-gradient(135deg,var(--tlw-accent-bright),var(--tlw-accent-dark));display:flex;align-items:center;justify-content:center;font-size:15px;}'
    + '.tlw-id{flex:1;min-width:0;}'
    + '.tlw-id b{display:block;font-family:var(--tlw-font-display);font-size:13.5px;color:var(--tlw-text);font-weight:700;}'
    + '.tlw-online{display:flex;align-items:center;gap:4px;font-size:10.5px;color:var(--tlw-online);font-weight:600;}'
    + '.tlw-online::before{content:\'\';width:5px;height:5px;border-radius:50%;background:var(--tlw-online);}'
    + '.tlw-iconbtn{width:28px;height:28px;border-radius:9px;border:none;background:transparent;color:var(--tlw-text-faint);display:flex;align-items:center;justify-content:center;cursor:pointer;flex:none;padding:0;}'
    + '.tlw-iconbtn:hover{background:var(--tlw-card-hover);color:var(--tlw-text);}'
    + '.tlw-iconbtn svg{width:15px;height:15px;}'
    + '.tlw-panel-body{flex:1;overflow-y:auto;min-height:0;}'
    + '.tlw-panel-menu{padding:14px 16px 6px;}'
    + '.tlw-panel[data-view="chat"] .tlw-panel-menu{display:none;}'
    + '.tlw-greet{font-size:13px;line-height:1.55;color:var(--tlw-text);margin:0 0 4px;}'
    + '.tlw-greet b{display:block;font-weight:700;margin-top:2px;}'
    + '.tlw-grid{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin:14px 0 10px;}'
    + '.tlw-cat-btn{display:flex;align-items:center;gap:9px;background:var(--tlw-card-soft);border:1px solid var(--tlw-border);border-radius:14px;padding:11px 10px;cursor:pointer;text-align:left;font-family:inherit;transition:background .15s ease,border-color .15s ease,transform .12s ease;}'
    + '.tlw-cat-btn:hover{background:var(--tlw-card-hover);}'
    + '.tlw-cat-btn:active{transform:scale(.97);}'
    + '.tlw-cat-icon{width:28px;height:28px;border-radius:9px;display:flex;align-items:center;justify-content:center;flex:none;font-size:14px;}'
    + '.tlw-cat-label{font-size:11.5px;font-weight:600;color:var(--tlw-text);line-height:1.25;}'
    + '.tlw-panel-chat{display:none;padding:14px 14px 10px;flex-direction:column;gap:2px;}'
    + '.tlw-panel[data-view="chat"] .tlw-panel-chat{display:flex;}'
    + '.tlw-row{display:flex;align-items:flex-end;gap:7px;margin:4px 0;}'
    + '.tlw-row.tlw-user{justify-content:flex-end;}'
    + '.tlw-row.tlw-assistant{justify-content:flex-start;}'
    + '.tlw-mini-avatar{width:22px;height:22px;border-radius:50%;flex:none;background:linear-gradient(135deg,var(--tlw-accent-bright),var(--tlw-accent-dark));display:flex;align-items:center;justify-content:center;font-size:11px;}'
    + '.tlw-bubble{max-width:80%;padding:9px 13px;border-radius:17px;font-size:12.5px;line-height:1.55;animation:tlw-pop .28s cubic-bezier(.22,.9,.32,1.2) both;}'
    + '@keyframes tlw-pop{0%{opacity:0;transform:scale(.85) translateY(6px);}100%{opacity:1;transform:scale(1) translateY(0);}}'
    + '.tlw-row.tlw-user .tlw-bubble{background:linear-gradient(135deg,var(--tlw-accent-bright),var(--tlw-accent));color:#fff;}'
    + '.tlw-row.tlw-assistant .tlw-bubble{background:var(--tlw-card-soft);border:1px solid var(--tlw-border);color:var(--tlw-text);}'
    + '.tlw-bubble p{margin:0 0 6px;}'
    + '.tlw-bubble p:last-child{margin-bottom:0;}'
    + '.tlw-bubble ul{list-style:none;margin:6px 0 0;padding:0;display:flex;flex-direction:column;gap:4px;}'
    + '.tlw-bubble li{position:relative;padding-left:13px;}'
    + '.tlw-bubble li::before{content:\'\';position:absolute;left:0;top:6px;width:4px;height:4px;border-radius:50%;background:var(--tlw-accent);}'
    + '.tlw-bubble strong{font-weight:700;}'
    + '.tlw-bubble.tlw-typing{display:flex;align-items:center;gap:4px;padding:11px 13px;}'
    + '.tlw-tdot{width:5px;height:5px;border-radius:50%;background:var(--tlw-text-muted);animation:tlw-bounce 1.2s infinite ease-in-out;}'
    + '.tlw-tdot:nth-child(2){animation-delay:.15s;}'
    + '.tlw-tdot:nth-child(3){animation-delay:.3s;}'
    + '@keyframes tlw-bounce{0%,60%,100%{transform:translateY(0);opacity:.5;}30%{transform:translateY(-3px);opacity:1;}}'
    + '.tlw-input-row{flex:none;display:flex;align-items:center;gap:8px;padding:10px 14px 14px;border-top:1px solid var(--tlw-border);}'
    + '.tlw-input-box{flex:1;display:flex;align-items:center;background:var(--tlw-card-soft);border:1px solid var(--tlw-border);border-radius:999px;padding:8px 8px 8px 14px;transition:border-color .15s ease;}'
    + '.tlw-input-box:focus-within{border-color:var(--tlw-accent);}'
    + '.tlw-input-box textarea{flex:1;border:none;background:transparent;outline:none;color:var(--tlw-text);font-family:inherit;font-size:12.5px;resize:none;max-height:80px;line-height:1.4;padding:2px 0;}'
    + '.tlw-input-box textarea::placeholder{color:var(--tlw-text-faint);}'
    + '.tlw-send{width:28px;height:28px;border-radius:50%;border:none;background:linear-gradient(135deg,var(--tlw-accent-bright),var(--tlw-accent-dark));display:flex;align-items:center;justify-content:center;cursor:pointer;flex:none;box-shadow:0 4px 12px -4px rgba(242,98,46,.55);transition:transform .12s ease,opacity .15s ease;padding:0;}'
    + '.tlw-send:active{transform:scale(.92);}'
    + '.tlw-send:disabled{opacity:.5;cursor:default;}'
    + '.tlw-send svg{width:13px;height:13px;margin-left:1px;}'
    + '.tlw-disclaimer{flex:none;padding:0 14px 10px;font-size:9.5px;color:var(--tlw-text-faint);text-align:center;}'
    + '@media (max-width:640px){'
    + '.tlw-panel{left:0;right:0;bottom:0;width:auto;max-width:none;border-radius:20px 20px 0 0;box-shadow:0 -16px 36px -16px rgba(0,0,0,.35);}'
    + '.tlw-panel[data-view="menu"]{height:auto;max-height:74vh;max-height:74dvh;}'
    + '.tlw-panel[data-view="chat"]{top:0;height:100vh;height:100dvh;max-height:100vh;max-height:100dvh;border-radius:0;}'
    + '.tlw-panel.tlw-kb-open{top:0;height:100vh;height:100dvh;max-height:100vh;max-height:100dvh;border-radius:0;}'
    + '.tlw-panel-handle{display:block;flex:none;width:34px;height:4px;border-radius:99px;background:var(--tlw-border);margin:9px auto 0;}'
    + '.tlw-backdrop{display:block;}'
    + '.tlw-launcher{right:18px;bottom:18px;}'
    + '.tlw-input-box textarea{font-size:16px;}'
    + '.tlw-input-row{padding-bottom:calc(14px + env(safe-area-inset-bottom));}'
    + '}';

  function injectStylesOnce() {
    if (document.getElementById('tlw-styles')) return;
    var style = document.createElement('style');
    style.id = 'tlw-styles';
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  // ---- markup ---------------------------------------------------------
  var HTML = ''
    + '<div class="tlw-tapme" id="tlwTapme">Tap me!</div>'
    + '<button class="tlw-launcher tlw-pulse" id="tlwLauncher" aria-label="Open LEO chat" type="button">🦁</button>'
    + '<div class="tlw-backdrop" id="tlwBackdrop"></div>'
    + '<div class="tlw-panel" id="tlwPanel" data-view="menu" role="dialog" aria-label="LEO chat">'
    + '  <div class="tlw-panel-handle"></div>'
    + '  <div class="tlw-panel-header">'
    + '    <button class="tlw-back" id="tlwBack" aria-label="Back" type="button"><svg viewBox="0 0 24 24" fill="none"><path d="M15 5 8 12l7 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>'
    + '    <div class="tlw-avatar">🦁</div>'
    + '    <div class="tlw-id"><b>LEO</b><span class="tlw-online">Online</span></div>'
    + '    <button class="tlw-iconbtn" id="tlwNewChat" aria-label="New chat" title="New chat" type="button"><svg viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>'
    + '    <button class="tlw-iconbtn" id="tlwClose" aria-label="Close" type="button"><svg viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>'
    + '  </div>'
    + '  <div class="tlw-panel-body" id="tlwPanelBody">'
    + '    <div class="tlw-panel-menu" id="tlwPanelMenu">'
    + '      <p class="tlw-greet">👋 Hi! I\'m LEO, your Ticketleo concert assistant.<b>How can I help you today?</b></p>'
    + '      <div class="tlw-grid" id="tlwGrid"></div>'
    + '    </div>'
    + '    <div class="tlw-panel-chat" id="tlwPanelChat"></div>'
    + '  </div>'
    + '  <div class="tlw-input-row">'
    + '    <div class="tlw-input-box"><textarea id="tlwInput" rows="1" placeholder="Message LEO..."></textarea></div>'
    + '    <button class="tlw-send" id="tlwSend" aria-label="Send" type="button"><svg viewBox="0 0 24 24" fill="#fff"><path d="M3.4 20.6 21 12 3.4 3.4 3 10l12 2-12 2 .4 6.6Z"/></svg></button>'
    + '  </div>'
    + '  <div class="tlw-disclaimer">LEO can make mistakes. For order issues, email hello@ticketleo.co.</div>'
    + '</div>';

  // ---- category shortcuts (real questions — sent through the real API,
  // no canned/scripted replies) -----------------------------------------
  var CATEGORIES = [
    { icon: '🎟️', bg: '#fdece3', fg: '#c8501f', label: 'Tickets & Prices', question: 'What are the ticket prices?' },
    { icon: '🚗', bg: '#e4f0ff', fg: '#2563eb', label: 'Getting There', question: 'Is there parking available?' },
    { icon: '⭐', bg: '#fff6df', fg: '#b6890a', label: 'VIP Experience', question: "What's included with VIP?" },
    { icon: '📋', bg: '#eef0f3', fg: '#4b5563', label: 'Entry Rules', question: 'What can I bring inside?' },
    { icon: '🔄', bg: '#e6f7ec', fg: '#16a34a', label: 'Refunds', question: 'Can I get a refund?' },
    { icon: 'ℹ️', bg: '#eef0ff', fg: '#4f46e5', label: 'Event Info', question: 'When and where is the show?' }
  ];

  function init() {
    injectFontsOnce();
    injectStylesOnce();

    var root = document.createElement('div');
    root.className = 'tlw-root';
    root.innerHTML = HTML;
    document.body.appendChild(root);

    var launcher = root.querySelector('#tlwLauncher');
    var tapme = root.querySelector('#tlwTapme');
    var backdrop = root.querySelector('#tlwBackdrop');
    var panel = root.querySelector('#tlwPanel');
    var panelClose = root.querySelector('#tlwClose');
    var panelBack = root.querySelector('#tlwBack');
    var newChatBtn = root.querySelector('#tlwNewChat');
    var grid = root.querySelector('#tlwGrid');
    var panelChat = root.querySelector('#tlwPanelChat');
    var inputEl = root.querySelector('#tlwInput');
    var sendBtn = root.querySelector('#tlwSend');

    CATEGORIES.forEach(function (c) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'tlw-cat-btn';
      btn.innerHTML = '<span class="tlw-cat-icon" style="background:' + c.bg + ';color:' + c.fg + '">' + c.icon + '</span><span class="tlw-cat-label">' + c.label + '</span>';
      btn.addEventListener('click', function () { sendMessage(c.question); });
      grid.appendChild(btn);
    });

    // ---- conversation state (same shape server.js expects) ------------
    var history = [];
    var sessionId = makeSessionId();
    var isOpen = false;
    var inFlight = false;

    function makeSessionId() {
      return (window.crypto && window.crypto.randomUUID)
        ? window.crypto.randomUUID()
        : 'sess-' + Date.now() + '-' + Math.random().toString(36).slice(2);
    }

    function isMobile() { return window.matchMedia('(max-width:640px)').matches; }

    function dismissTapme() { tapme.classList.add('tlw-hidden'); }
    setTimeout(dismissTapme, 4500);

    function lockScroll(lock) {
      document.body.style.overflow = lock ? 'hidden' : '';
    }

    function openPanel() {
      dismissTapme();
      launcher.classList.remove('tlw-pulse');
      launcher.classList.add('tlw-hidden');
      panel.classList.add('tlw-open');
      backdrop.classList.add('tlw-show');
      isOpen = true;
    }

    function closeAll() {
      inputEl.blur();
      panel.classList.remove('tlw-open', 'tlw-kb-open');
      panel.dataset.view = 'menu';
      backdrop.classList.remove('tlw-show');
      launcher.classList.remove('tlw-hidden');
      isOpen = false;
      lockScroll(false);
    }

    function toChatView() {
      panel.dataset.view = 'chat';
      lockScroll(isMobile());
    }

    function backToMenu() {
      panel.dataset.view = 'menu';
      lockScroll(false);
    }

    function startNewChat() {
      history = [];
      sessionId = makeSessionId();
      panelChat.innerHTML = '';
      panel.dataset.view = 'menu';
      lockScroll(false);
      inputEl.value = '';
      autosize();
    }

    launcher.addEventListener('click', function () {
      if (isOpen) { closeAll(); } else { openPanel(); }
    });
    backdrop.addEventListener('click', closeAll);
    panelClose.addEventListener('click', closeAll);
    panelBack.addEventListener('click', backToMenu);
    newChatBtn.addEventListener('click', startNewChat);

    // Keyboard-open detection — see the concept file's notes: watching
    // visualViewport is the reliable cross-browser way to know the
    // on-screen keyboard actually opened, so the panel only expands to
    // full height once that's confirmed, never as a guess made at focus
    // time (which was found to silently block the keyboard on real phones).
    var layoutHeight = window.innerHeight;
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', function () {
        var vv = window.visualViewport;
        var keyboardLikelyOpen = (layoutHeight - vv.height) > 120;
        if (!keyboardLikelyOpen) { layoutHeight = window.innerHeight; }
        if (isMobile() && isOpen && keyboardLikelyOpen) {
          panel.classList.add('tlw-kb-open');
        } else {
          panel.classList.remove('tlw-kb-open');
        }
      });
    }

    // ---- rich text rendering (ported from index.html, same rules: the
    // backend never sends real links, but strip defensively; markdown
    // **bold** and "- "/"• " bullet lists are the only two transforms) ----
    function escapeHtml(str) {
      return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
    function stripLinks(str) {
      return str
        .replace(/\[([^\]]+)\]\((?:https?:\/\/|mailto:)[^\s)]+\)/g, '$1')
        .replace(/(?:https?:\/\/|www\.)[^\s)]+/g, '')
        .replace(/\(\s*\)/g, '')
        .replace(/[ \t]{2,}/g, ' ')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/[ \t]+$/gm, '');
    }
    function inlineFormat(str) {
      return escapeHtml(str).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    }
    function renderRichText(el, text) {
      el.innerHTML = '';
      var lines = stripLinks(String(text)).split('\n');
      var i = 0;
      while (i < lines.length) {
        var bulletMatch = /^\s*[-•]\s+(.*)$/.exec(lines[i]);
        if (bulletMatch) {
          var ul = document.createElement('ul');
          while (i < lines.length) {
            var m = /^\s*[-•]\s+(.*)$/.exec(lines[i]);
            if (!m) break;
            var li = document.createElement('li');
            li.innerHTML = inlineFormat(m[1]);
            ul.appendChild(li);
            i++;
          }
          el.appendChild(ul);
          continue;
        }
        if (lines[i].trim() === '') { i++; continue; }
        var p = document.createElement('p');
        p.innerHTML = inlineFormat(lines[i]);
        el.appendChild(p);
        i++;
      }
    }

    function addUserRow(text) {
      var row = document.createElement('div');
      row.className = 'tlw-row tlw-user';
      var bubble = document.createElement('div');
      bubble.className = 'tlw-bubble';
      bubble.textContent = text;
      row.appendChild(bubble);
      panelChat.appendChild(row);
      panelChat.scrollTop = panelChat.scrollHeight;
    }

    function addTypingRow() {
      var row = document.createElement('div');
      row.className = 'tlw-row tlw-assistant';
      var av = document.createElement('div');
      av.className = 'tlw-mini-avatar';
      av.textContent = '🦁';
      var bubble = document.createElement('div');
      bubble.className = 'tlw-bubble tlw-typing';
      bubble.innerHTML = '<span class="tlw-tdot"></span><span class="tlw-tdot"></span><span class="tlw-tdot"></span>';
      row.appendChild(av);
      row.appendChild(bubble);
      panelChat.appendChild(row);
      panelChat.scrollTop = panelChat.scrollHeight;
      return bubble;
    }

    function addAssistantBubble(text) {
      var row = document.createElement('div');
      row.className = 'tlw-row tlw-assistant';
      var av = document.createElement('div');
      av.className = 'tlw-mini-avatar';
      av.textContent = '🦁';
      var bubble = document.createElement('div');
      bubble.className = 'tlw-bubble';
      renderRichText(bubble, text);
      row.appendChild(av);
      row.appendChild(bubble);
      panelChat.appendChild(row);
      panelChat.scrollTop = panelChat.scrollHeight;
    }

    function autosize() {
      inputEl.style.height = 'auto';
      inputEl.style.height = Math.min(inputEl.scrollHeight, 80) + 'px';
    }
    inputEl.addEventListener('input', autosize);

    // ---- the real backend call, same contract as index.html: POST
    // {messages, sessionId} to /api/chat, expect {reply} back. ------------
    async function sendMessage(text) {
      text = (text || '').trim();
      if (!text || inFlight) return;

      if (panel.dataset.view !== 'chat') { toChatView(); }
      addUserRow(text);
      history.push({ role: 'user', content: text });

      inFlight = true;
      sendBtn.disabled = true;
      var typingBubble = addTypingRow();

      try {
        var res = await fetch(API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: history, sessionId: sessionId }),
        });
        var data = await res.json();
        if (!res.ok) throw new Error(data && data.error ? data.error : 'Request failed');

        typingBubble.parentElement.remove();
        addAssistantBubble(data.reply);
        history.push({ role: 'assistant', content: data.reply });
      } catch (err) {
        typingBubble.parentElement.remove();
        addAssistantBubble('Sorry, something went wrong reaching support. Please try again or email hello@ticketleo.co.');
      } finally {
        inFlight = false;
        sendBtn.disabled = false;
        inputEl.focus();
      }
    }

    // Prevents the send button from stealing/blurring focus before its
    // click handler runs, so the keyboard stays open between messages.
    sendBtn.addEventListener('mousedown', function (e) { e.preventDefault(); });
    sendBtn.addEventListener('click', function () {
      var v = inputEl.value;
      inputEl.value = '';
      autosize();
      sendMessage(v);
    });
    inputEl.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        var v = inputEl.value;
        inputEl.value = '';
        autosize();
        sendMessage(v);
      }
    });

    // Small public API so the host page's own "Chat with us" links/buttons
    // can trigger the widget without duplicating a launcher.
    window.TicketleoWidget = {
      open: openPanel,
      close: closeAll,
      toggle: function () { if (isOpen) { closeAll(); } else { openPanel(); } },
      newChat: startNewChat,
      ask: function (text) { openPanel(); sendMessage(text); },
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
