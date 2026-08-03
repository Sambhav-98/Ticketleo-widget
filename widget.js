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

  // Baked-in PNG of the lion glyph (not a font emoji) so LEO's face looks
  // identical on every OS/browser — emoji glyphs render very differently
  // across Windows, Android, and iOS emoji fonts, which was the whole
  // problem. Background is pre-keyed transparent so it drops onto any of
  // the accent-colored circles below without a visible seam.
  var LION_ICON_B64 = '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';

  var CSS = ''
    + '.tlw-root{--tlw-card:#ffffff;--tlw-card-soft:#f6f7f9;--tlw-card-hover:#eef0f3;--tlw-border:#e6e7eb;'
    + '--tlw-text:#101218;--tlw-text-muted:#6b7280;--tlw-text-faint:#9aa0ac;'
    + '--tlw-accent:#f2622e;--tlw-accent-bright:#ff7a43;--tlw-accent-dark:#c8501f;'
    + '--tlw-online:#22c55e;--tlw-font-display:\'Space Grotesk\',system-ui,sans-serif;--tlw-font-body:\'Inter\',system-ui,-apple-system,sans-serif;'
    + '--tlw-lion:url(data:image/png;base64,' + LION_ICON_B64 + ');'
    + 'font-family:var(--tlw-font-body);}'
    + '.tlw-root *{box-sizing:border-box;}'
    + '.tlw-launcher{position:fixed;right:24px;bottom:24px;width:88px;height:88px;border-radius:50%;background:var(--tlw-accent-dark);border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 16px 32px -10px rgba(242,98,46,.55);z-index:2147483000;transition:transform .18s ease,opacity .18s ease;padding:0;overflow:hidden;}'
    + '.tlw-launcher:active{transform:scale(.94);}'
    + '.tlw-launcher.tlw-hidden{opacity:0;pointer-events:none;transform:scale(.7);}'
    + '@keyframes tlw-launcher-pulse{0%{box-shadow:0 16px 32px -10px rgba(242,98,46,.55),0 0 0 0 rgba(242,98,46,.45);}70%{box-shadow:0 16px 32px -10px rgba(242,98,46,.55),0 0 0 14px rgba(242,98,46,0);}100%{box-shadow:0 16px 32px -10px rgba(242,98,46,.55),0 0 0 0 rgba(242,98,46,0);}}'
    + '.tlw-launcher.tlw-pulse{animation:tlw-launcher-pulse 2.1s ease-out infinite;}'
    + '.tlw-launcher-waves{position:absolute;inset:0;border-radius:50%;overflow:hidden;pointer-events:none;}'
    + '.tlw-launcher-waves i{position:absolute;top:50%;left:50%;width:100%;height:100%;border-radius:50%;font-style:normal;transform:translate(-50%,-50%) scale(.25);opacity:0;animation:tlw-wave-ripple 3.6s ease-out infinite;}'
    + '.tlw-launcher-waves i:nth-child(1){background:radial-gradient(circle,var(--tlw-accent-bright),var(--tlw-accent));animation-delay:0s;}'
    + '.tlw-launcher-waves i:nth-child(2){background:radial-gradient(circle,var(--tlw-accent),var(--tlw-accent-dark));animation-delay:1.2s;}'
    + '.tlw-launcher-waves i:nth-child(3){background:radial-gradient(circle,var(--tlw-accent-dark),#a8410f);animation-delay:2.4s;}'
    + '@keyframes tlw-wave-ripple{0%{transform:translate(-50%,-50%) scale(.2);opacity:.95;}70%{opacity:.35;}100%{transform:translate(-50%,-50%) scale(1);opacity:0;}}'
    + '.tlw-launcher-ring{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;}'
    + '.tlw-launcher-ring text{font-family:var(--tlw-font-display);font-weight:700;font-size:10px;letter-spacing:0.8px;fill:#fff;stroke:#fff;stroke-width:0.3px;paint-order:stroke;}'
    + '.tlw-launcher-icon{position:relative;width:29px;height:29px;pointer-events:none;background-image:var(--tlw-lion);background-size:contain;background-position:center;background-repeat:no-repeat;}'
    + '.tlw-backdrop{display:none;position:fixed;inset:0;background:rgba(10,10,14,.45);opacity:0;pointer-events:none;transition:opacity .22s ease;z-index:2147482998;}'
    + '.tlw-backdrop.tlw-show{opacity:1;pointer-events:auto;}'
    + '.tlw-panel{position:fixed;right:24px;bottom:96px;width:380px;max-width:calc(100vw - 32px);height:600px;max-height:calc(100vh - 140px);background:var(--tlw-card);border:1px solid var(--tlw-border);border-radius:18px;box-shadow:0 26px 60px -24px rgba(15,15,25,.3);display:flex;flex-direction:column;overflow:hidden;z-index:2147482999;transform:translateY(14px) scale(.97);opacity:0;pointer-events:none;transition:transform .22s cubic-bezier(.22,.9,.32,1.05),opacity .18s ease,border-radius .2s ease;color:var(--tlw-text);}'
    + '.tlw-panel.tlw-open{transform:translateY(0) scale(1);opacity:1;pointer-events:auto;}'
    + '.tlw-panel-handle{display:none;}'
    + '.tlw-panel-header{flex:none;display:flex;align-items:center;gap:7px;padding:14px 12px 12px 14px;border-bottom:1px solid var(--tlw-border);}'
    + '.tlw-back{display:none;width:28px;height:28px;border-radius:9px;border:none;background:transparent;color:var(--tlw-text-muted);align-items:center;justify-content:center;cursor:pointer;flex:none;padding:0;}'
    + '.tlw-back svg{width:17px;height:17px;}'
    + '.tlw-panel[data-view="chat"] .tlw-back{display:flex;}'
    + '.tlw-avatar{width:32px;height:32px;border-radius:50%;flex:none;background:var(--tlw-lion) center/62% no-repeat,linear-gradient(135deg,var(--tlw-accent-bright),var(--tlw-accent-dark));display:flex;align-items:center;justify-content:center;}'
    + '.tlw-id{flex:1;min-width:0;}'
    + '.tlw-id b{display:block;font-family:var(--tlw-font-display);font-size:13.5px;color:var(--tlw-text);font-weight:700;}'
    + '.tlw-online{display:flex;align-items:center;gap:4px;font-size:10.5px;color:var(--tlw-online);font-weight:600;}'
    + '.tlw-online::before{content:\'\';width:5px;height:5px;border-radius:50%;background:var(--tlw-online);}'
    + '.tlw-iconbtn{width:28px;height:28px;border-radius:9px;border:none;background:transparent;color:var(--tlw-text-faint);display:flex;align-items:center;justify-content:center;cursor:pointer;flex:none;padding:0;}'
    + '.tlw-iconbtn:hover{background:var(--tlw-card-hover);color:var(--tlw-text);}'
    + '.tlw-header-buy{display:none;align-items:center;gap:5px;height:28px;padding:0 12px;border-radius:999px;border:none;background:linear-gradient(135deg,var(--tlw-accent-bright),var(--tlw-accent-dark));color:#fff;cursor:pointer;flex:none;white-space:nowrap;text-decoration:none;font-family:inherit;font-size:11.5px;font-weight:700;box-shadow:0 4px 10px -4px rgba(242,98,46,.5);transition:transform .12s ease,box-shadow .15s ease;}'
    + '.tlw-header-buy:hover{transform:translateY(-1px);box-shadow:0 6px 14px -4px rgba(242,98,46,.6);}'
    + '.tlw-header-buy:active{transform:translateY(0);}'
    + '.tlw-panel[data-view="chat"] .tlw-header-buy{display:flex;}'
    + '.tlw-header-buy svg{width:13px;height:13px;flex:none;}'
    + '.tlw-iconbtn svg{width:15px;height:15px;}'
    + '.tlw-panel-body{flex:1;overflow-y:auto;min-height:0;overflow-anchor:none;}'
    + '.tlw-panel-menu{padding:14px 16px 6px;}'
    + '.tlw-panel[data-view="chat"] .tlw-panel-menu{display:none;}'
    + '.tlw-greet{font-size:13px;line-height:1.55;color:var(--tlw-text);margin:0 0 4px;}'
    + '.tlw-greet b{display:block;font-weight:700;margin-top:2px;}'
    + '.tlw-buy-btn{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;margin-top:12px;background:linear-gradient(135deg,var(--tlw-accent-bright),var(--tlw-accent-dark));color:#fff;text-decoration:none;font-family:inherit;font-size:13px;font-weight:700;padding:12px 14px;border-radius:14px;box-shadow:0 10px 22px -10px rgba(242,98,46,.55);transition:transform .12s ease,box-shadow .15s ease;}'
    + '.tlw-buy-btn:hover{transform:translateY(-1px);box-shadow:0 12px 26px -8px rgba(242,98,46,.65);}'
    + '.tlw-buy-btn:active{transform:translateY(0);}'
    + '.tlw-buy-btn svg{width:15px;height:15px;flex:none;}'
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
    + '.tlw-mini-avatar{width:22px;height:22px;border-radius:50%;flex:none;background:var(--tlw-lion) center/68% no-repeat,linear-gradient(135deg,var(--tlw-accent-bright),var(--tlw-accent-dark));display:flex;align-items:center;justify-content:center;}'
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
    + '<button class="tlw-launcher tlw-pulse" id="tlwLauncher" aria-label="Talk with LEO" type="button">'
    + '  <span class="tlw-launcher-waves" aria-hidden="true"><i></i><i></i><i></i></span>'
    + '  <svg class="tlw-launcher-ring" viewBox="0 0 88 88" aria-hidden="true">'
    + '    <defs><path id="tlwOrbitPath" d="M10.52,38.1 A34,34 0 0,1 77.48,38.1"/></defs>'
    + '    <text text-anchor="middle"><textPath href="#tlwOrbitPath" startOffset="50%">TALK WITH LEO</textPath></text>'
    + '  </svg>'
    + '  <span class="tlw-launcher-icon" aria-hidden="true"></span>'
    + '</button>'
    + '<div class="tlw-backdrop" id="tlwBackdrop"></div>'
    + '<div class="tlw-panel" id="tlwPanel" data-view="menu" role="dialog" aria-label="LEO chat">'
    + '  <div class="tlw-panel-handle"></div>'
    + '  <div class="tlw-panel-header">'
    + '    <button class="tlw-back" id="tlwBack" aria-label="Back" type="button"><svg viewBox="0 0 24 24" fill="none"><path d="M15 5 8 12l7 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>'
    + '    <div class="tlw-avatar" aria-hidden="true"></div>'
    + '    <div class="tlw-id"><b>LEO</b><span class="tlw-online">Online</span></div>'
    + '    <a class="tlw-header-buy" id="tlwHeaderBuy" href="https://www.ticketleo.co/events/sushant-kc-live-in-sydney" target="_blank" rel="noopener" aria-label="Get Tickets" title="Get Tickets"><svg viewBox="0 0 24 24" fill="none"><path d="M3 8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2a2 2 0 1 0 0 4v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2a2 2 0 1 0 0-4V8Z" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/><path d="M9 6v12" stroke="#fff" stroke-width="1.6" stroke-dasharray="2 3" stroke-linecap="round"/></svg>Get Tickets</a>'
    + '    <button class="tlw-iconbtn" id="tlwNewChat" aria-label="New chat" title="New chat" type="button"><svg viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>'
    + '    <button class="tlw-iconbtn" id="tlwClose" aria-label="Close" type="button"><svg viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>'
    + '  </div>'
    + '  <div class="tlw-panel-body" id="tlwPanelBody">'
    + '    <div class="tlw-panel-menu" id="tlwPanelMenu">'
    + '      <p class="tlw-greet">👋 Hi! I\'m LEO, your Ticketleo concert assistant.<b>How can I help you today?</b></p>'
    + '      <a class="tlw-buy-btn" href="https://www.ticketleo.co/events/sushant-kc-live-in-sydney" target="_blank" rel="noopener"><svg viewBox="0 0 24 24" fill="none"><path d="M3 8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2a2 2 0 1 0 0 4v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2a2 2 0 1 0 0-4V8Z" stroke="#fff" stroke-width="1.7" stroke-linejoin="round"/><path d="M9 6v12" stroke="#fff" stroke-width="1.7" stroke-dasharray="2 3" stroke-linecap="round"/></svg>Get Tickets</a>'
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
    var backdrop = root.querySelector('#tlwBackdrop');
    var panel = root.querySelector('#tlwPanel');
    var panelClose = root.querySelector('#tlwClose');
    var panelBack = root.querySelector('#tlwBack');
    var newChatBtn = root.querySelector('#tlwNewChat');
    var grid = root.querySelector('#tlwGrid');
    var panelChat = root.querySelector('#tlwPanelChat');
    var panelBody = root.querySelector('#tlwPanelBody');
    var inputEl = root.querySelector('#tlwInput');
    var sendBtn = root.querySelector('#tlwSend');

    // ---- Messenger/WhatsApp-style scroll behavior: the conversation
    // always follows the latest message/typing indicator/reply on its
    // own, smoothly, the same way Messenger and WhatsApp keep you pinned
    // to the newest bubble without needing a manual "jump down" tap. ----
    function scrollToBottom(smooth) {
      panelBody.scrollTo({ top: panelBody.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
    }
    function onNewRow() {
      scrollToBottom(true);
    }

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

    function lockScroll(lock) {
      document.body.style.overflow = lock ? 'hidden' : '';
    }

    function openPanel() {
      launcher.classList.remove('tlw-pulse');
      launcher.classList.add('tlw-hidden');
      panel.classList.add('tlw-open');
      backdrop.classList.add('tlw-show');
      isOpen = true;
    }

    function closeAll() {
      inputEl.blur();
      panel.classList.remove('tlw-open', 'tlw-kb-open');
      panel.style.height = '';
      panel.style.top = '';
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
    //
    // On real mobile Chrome the keyboard shrinks the *visual* viewport
    // while the *layout* viewport (what dvh/vh are based on) stays put,
    // and the browser pans the page to keep the focused input on screen.
    // A panel sized purely off dvh can end up taller than what's actually
    // visible, so its header and message list get panned off-screen above
    // the fold while only the input row (next to the focused field) stays
    // visible — a blank-looking chat with just the composer showing. To
    // avoid that, size and position the panel directly from
    // visualViewport's live numbers (which inline styles override) once
    // the keyboard is confirmed open, and drop back to the normal
    // CSS-driven sizing once it closes.
    var layoutHeight = window.innerHeight;
    function syncToViewport() {
      var vv = window.visualViewport;
      if (!vv) return;
      var keyboardLikelyOpen = (layoutHeight - vv.height) > 120;
      if (!keyboardLikelyOpen) { layoutHeight = window.innerHeight; }
      if (isMobile() && isOpen && keyboardLikelyOpen) {
        panel.classList.add('tlw-kb-open');
        panel.style.height = vv.height + 'px';
        panel.style.top = vv.offsetTop + 'px';
      } else {
        panel.classList.remove('tlw-kb-open');
        panel.style.height = '';
        panel.style.top = '';
      }
    }
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', syncToViewport);
      window.visualViewport.addEventListener('scroll', syncToViewport);
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
      onNewRow();
    }

    function addTypingRow() {
      var row = document.createElement('div');
      row.className = 'tlw-row tlw-assistant';
      var av = document.createElement('div');
      av.className = 'tlw-mini-avatar';
      av.setAttribute('aria-hidden', 'true');
      var bubble = document.createElement('div');
      bubble.className = 'tlw-bubble tlw-typing';
      bubble.innerHTML = '<span class="tlw-tdot"></span><span class="tlw-tdot"></span><span class="tlw-tdot"></span>';
      row.appendChild(av);
      row.appendChild(bubble);
      panelChat.appendChild(row);
      onNewRow();
      return bubble;
    }

    function addAssistantBubble(text) {
      var row = document.createElement('div');
      row.className = 'tlw-row tlw-assistant';
      var av = document.createElement('div');
      av.className = 'tlw-mini-avatar';
      av.setAttribute('aria-hidden', 'true');
      var bubble = document.createElement('div');
      bubble.className = 'tlw-bubble';
      renderRichText(bubble, text);
      row.appendChild(av);
      row.appendChild(bubble);
      panelChat.appendChild(row);
      onNewRow();
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
