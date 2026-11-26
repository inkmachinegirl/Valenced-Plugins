package dev.ketsuyumi.loopbox.sync

/**
 * Injected into every sync page before it runs; passes the site's own data to the app.
 *
 * - fetch / XMLHttpRequest responses that mention a sound or video URL, and the JSON embedded in
 *   the page, go to LoopboxBridge.found(text, page, requestUrl). It answers false to stop
 *   following that list.
 * - Following a list: the saved list comes a page (~30) at a time. When a page says there's
 *   more, the next one is asked for straight away with the same request and the new cursor
 *   (old signatures dropped; the site's own script signs the new request). A refused page is
 *   retried with growing waits, then reported as "stuck".
 * - LoopboxBridge.paging(n) counts pages; LoopboxBridge.done(why) says a list ended ("end"),
 *   was cut short ("enough") or couldn't go on ("stuck:<status>").
 * - window.__loopboxList(url): follow a remembered list request from its first page.
 * - window.__loopboxDrive('sounds' | 'videos'): click Favorites › Sounds / Posts like a person
 *   would, then keep scrolling, so the site loads (and signs) the list itself.
 * - window.__loopboxScroll(on): keep scrolling to the bottom.
 */
internal val CAPTURE_JS = """
(function(){
  if (window.__loopbox) return; window.__loopbox = true;
  var KEYS = /playUrl|play_url|playAddr|play_addr|progressive_download_url|video_versions/;
  var LIST = /collect|favorite|favourite|music_list|musiclist|saved|audio|clips/i;
  var CURSORS = ['cursor','max_cursor','maxCursor','min_cursor','offset','max_id'];
  function done(why){ try { LoopboxBridge.done(String(why)); } catch(e){} }
  function send(t, from){
    try {
      if (!t || t.length > 8e6 || !KEYS.test(t)) return;
      var go = LoopboxBridge.found(t, location.href, from || '');
      if (go === false) { if (/^https?:/.test(from || '') && LIST.test(from)) done('enough'); return; }
      more(t, from);
    } catch(e){}
  }
  var paged = {};
  function clean(u){ ['X-Bogus','X-Gnarly','_signature'].forEach(function(k){ u.searchParams.delete(k); }); }
  function more(t, from){
    if (!/^https?:/.test(from || '') || !LIST.test(from)) return;
    var j; try { j = JSON.parse(t); } catch(e){ return; }
    var has = j.hasMore || j.has_more || j.more_available || j.hasMorePage;
    var c = j.cursor != null ? j.cursor : j.max_cursor != null ? j.max_cursor : j.maxCursor != null ? j.maxCursor : j.next_max_id;
    if (!has || c == null || c === '') { done('end'); return; }
    var u; try { u = new URL(from, location.href); } catch(e){ return; }
    clean(u);
    var key = u.pathname + '|' + c; if (paged[key]) return; paged[key] = 1;
    var set = false;
    CURSORS.forEach(function(k){ if (u.searchParams.has(k)) { u.searchParams.set(k, String(c)); set = true; } });
    if (!set) u.searchParams.set(j.next_max_id != null ? 'max_id' : 'cursor', String(c));
    try { LoopboxBridge.paging(Object.keys(paged).length); } catch(e){}
    setTimeout(function(){ get(u.toString(), 0); }, 700);
  }
  function get(url, tries){
    var x = new XMLHttpRequest(); x.open('GET', url); x.withCredentials = true;
    if (/instagram\.com/.test(location.host)) {
      var m = document.cookie.match(/csrftoken=([^;]+)/);
      x.setRequestHeader('X-IG-App-ID', '936619743392459');
      x.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
      if (m) x.setRequestHeader('X-CSRFToken', m[1]);
    }
    x.addEventListener('loadend', function(){
      if (x.status === 200 && KEYS.test(x.responseText || '')) return; // the send() hook took it
      if (tries < 4) setTimeout(function(){ get(url, tries + 1); }, 2000 * Math.pow(2, tries));
      else done('stuck:' + x.status);
    });
    x.send();
  }
  window.__loopboxList = function(url){
    var u; try { u = new URL(url, location.href); } catch(e){ return; }
    clean(u); u.searchParams.delete('max_id');
    CURSORS.forEach(function(k){ if (u.searchParams.has(k)) u.searchParams.set(k, '0'); });
    paged = {}; get(u.toString(), 0);
  };
  function clickText(re, e2e){
    var el = e2e && document.querySelector(e2e);
    if (el) { el.click(); return true; }
    var els = document.querySelectorAll('[role="tab"], button, a, p, span, div');
    for (var i = 0; i < els.length; i++){
      var t = (els[i].textContent || '').trim();
      if (t.length < 30 && re.test(t)) { els[i].click(); return true; }
    }
    return false;
  }
  window.__loopboxDrive = function(kind){
    var steps = [[/^(Favorites|Favourites)$/i, '[data-e2e="favorites-tab"]'],
                 kind === 'sounds' ? [/^Sounds?$/i, null] : [/^(Posts|Videos)$/i, null]];
    var i = 0;
    var t = setInterval(function(){
      if (i >= steps.length) { clearInterval(t); window.__loopboxScroll(true); return; }
      if (clickText(steps[i][0], steps[i][1])) i++;
    }, 1500);
    setTimeout(function(){ clearInterval(t); window.__loopboxScroll(true); }, 20000);
  };
  var f = window.fetch;
  if (f) window.fetch = function(input){ var u = typeof input === 'string' ? input : (input && input.url) || '';
    return f.apply(window, arguments).then(function(r){ try { r.clone().text().then(function(t){ send(t, r.url || u); }); } catch(e){} return r; }); };
  var s = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function(){ var x = this; x.addEventListener('load', function(){ try { if (!x.responseType || x.responseType === 'text') send(x.responseText, x.responseURL); } catch(e){} }); return s.apply(this, arguments); };
  var seen = {};
  function scan(){
    var els = document.querySelectorAll('script[type="application/json"], script#__UNIVERSAL_DATA_FOR_REHYDRATION__, script#SIGI_STATE');
    for (var i = 0; i < els.length; i++){ var t = els[i].textContent || ''; var k = t.length + ':' + t.slice(0, 64); if (!seen[k]) { seen[k] = 1; send(t, 'embedded'); } }
  }
  document.addEventListener('DOMContentLoaded', scan); setInterval(scan, 3000);
  var timer = null;
  window.__loopboxScroll = function(on){
    if (timer) { clearInterval(timer); timer = null; }
    if (on) timer = setInterval(function(){ window.scrollTo(0, document.body.scrollHeight);
      var boxes = document.querySelectorAll('div');
      for (var i = 0; i < boxes.length; i++){ var b = boxes[i]; if (b.scrollHeight > b.clientHeight + 200 && b.clientHeight > 300) b.scrollTop = b.scrollHeight; }
    }, 1200);
  };
})();
""".trimIndent()
