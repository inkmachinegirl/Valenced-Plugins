package dev.ketsuyumi.loopbox.sync

/**
 * Injected into every sync page before it runs; passes the site's own data to the app.
 *
 * - fetch / XMLHttpRequest responses that mention a sound or video URL, and the JSON embedded in
 *   the page, go to LoopboxBridge.found(text, page, requestUrl). It answers false to stop
 *   following that list.
 * - Following a list: the saved list comes a page (~30) at a time. When a page says there's
 *   more, the next one is asked for straight away with the same request and the new cursor
 *   (old signatures dropped; it's sent through the page's fetch, which the site's own script
 *   signs). A refused page is retried with growing waits, then reported as "stuck".
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
  var KEYS = /playUrl|play_url|playAddr|play_addr|progressive_download_url|video_versions|followerCount|"cid"/;
  var LIST = /collect|favorite|favourite|music_list|musiclist|saved|audio|clips/i;
  // Only the request's path says what list it is: the query has words like data_collection_enabled.
  function isList(from){ try { return /^https?:/.test(from || '') && LIST.test(new URL(from, location.href).pathname); } catch(e){ return false; } }
  var CURSORS = ['cursor','max_cursor','maxCursor','min_cursor','minCursor','offset','max_id','maxId'];
  function log(m){ try { LoopboxBridge.log(String(m)); } catch(e){} }
  function short(url){
    try { var u = new URL(url, location.href); var p = [];
      u.searchParams.forEach(function(v, k){ if (/cursor|count|offset|max|min/i.test(k)) p.push(k + '=' + v); });
      return u.pathname + '?' + p.join('&'); } catch(e){ return String(url).slice(0, 120); }
  }
  function done(why){ log('list ended: ' + why); try { LoopboxBridge.done(String(why)); } catch(e){} }
  var sentCursor = {}; // request URL (without signatures) -> the cursor we put in it
  function send(t, from){
    try {
      if (!t || t.length > 8e6 || !KEYS.test(t)) return;
      var go = LoopboxBridge.found(t, location.href, from || '');
      if (go === false) { if (isList(from)) done('enough'); return; }
      more(t, from);
    } catch(e){}
  }
  // TikTok refuses API requests without a signature (X-Bogus). Its page has the signer
  // (byted_acrawler.frontierSign, given the query); requests Loopbox makes itself are signed
  // with it before they go. Answers are logged; the response hooks below still take them in.
  function sign(url){
    try {
      var a = window.byted_acrawler;
      if (!a || !a.frontierSign || !/tiktok\.com/.test(location.host)) return url;
      var q = url.split('?')[1] || '';
      var r = a.frontierSign(q);
      var xb = r && (r['X-Bogus'] || r.xbogus);
      if (xb) return url + (url.indexOf('?') >= 0 ? '&' : '?') + 'X-Bogus=' + encodeURIComponent(xb);
    } catch(e){ log('signing failed: ' + e); }
    return url;
  }
  window.__loopboxFetch = function(url, tag, headers){
    var u; try { u = new URL(url, location.href); clean(u); url = u.toString(); } catch(e){}
    var signed = sign(url);
    if (signed === url && /tiktok\.com/.test(location.host)) log((tag || 'ask') + ': no signer on this page');
    return window.fetch(signed, { credentials: 'include', headers: headers || {} }).then(function(r){
      return r.text().then(function(t){
        var ok = r.status === 200 && KEYS.test(t || '');
        log((tag || 'ask') + ' answer ' + r.status + ' · ' + (t || '').length + ' chars' + (ok ? '' : ' · ' + (t || '').slice(0, 100)));
        return [r.status, t, ok];
      });
    }, function(e){ log((tag || 'ask') + ' failed: ' + e); return [0, '', false]; });
  };
  var paged = {};
  function clean(u){ ['X-Bogus','X-Gnarly','_signature'].forEach(function(k){ u.searchParams.delete(k); }); }
  function more(t, from){
    if (!isList(from)) return;
    var j; try { j = JSON.parse(t); } catch(e){ return; }
    var has = j.hasMore || j.has_more || j.more_available || j.hasMorePage;
    var c = j.cursor != null ? j.cursor : j.max_cursor != null ? j.max_cursor : j.maxCursor != null ? j.maxCursor : j.next_max_id;
    log('page ' + short(from) + ' · hasMore=' + has + ' cursor=' + c + ' · fields: ' + Object.keys(j).slice(0, 14).join(','));
    if (!has || c == null || c === '') { done('end (hasMore=' + has + ', cursor=' + c + ')'); return; }
    var u; try { u = new URL(from, location.href); } catch(e){ return; }
    clean(u);
    var key = u.pathname + '|' + c; if (paged[key]) return; paged[key] = 1;
    // Which parameter is the page position: a known name, or the one holding the cursor this
    // page was asked for with, or a cursor-like name set to 0 on the first page.
    var prev = sentCursor[u.toString()];
    var set = false;
    u.searchParams.forEach(function(v, k){
      if (CURSORS.indexOf(k) >= 0 || (prev != null && v === String(prev)) || (/cursor|offset|max/i.test(k) && v === '0')) { u.searchParams.set(k, String(c)); set = true; }
    });
    if (!set) u.searchParams.set(j.next_max_id != null ? 'max_id' : 'cursor', String(c));
    sentCursor[u.toString()] = c;
    try { LoopboxBridge.paging(Object.keys(paged).length); } catch(e){}
    setTimeout(function(){ get(u.toString(), 0); }, 700);
  }
  // Asked for through window.fetch at call time: the site's own security script wraps fetch and
  // signs its API requests (X-Bogus etc.); a plain XMLHttpRequest went out unsigned and was refused.
  function get(url, tries){
    var h = {};
    if (/instagram\.com/.test(location.host)) {
      var m = document.cookie.match(/csrftoken=([^;]+)/);
      h['X-IG-App-ID'] = '936619743392459'; h['X-Requested-With'] = 'XMLHttpRequest';
      if (m) h['X-CSRFToken'] = m[1];
    }
    function retry(st){
      if (tries < 4) setTimeout(function(){ get(url, tries + 1); }, 2000 * Math.pow(2, tries));
      else done('stuck:' + st);
    }
    window.__loopboxFetch(url, 'ask ' + short(url) + (tries ? ' (try ' + (tries + 1) + ')' : ''), h)
      .then(function(a){ if (!a[2]) retry(a[0]); });
  }
  window.__loopboxList = function(url){
    var u; try { u = new URL(url, location.href); } catch(e){ return; }
    clean(u); u.searchParams.delete('max_id');
    var keys = []; u.searchParams.forEach(function(v, k){ keys.push(k); });
    keys.forEach(function(k){ if (CURSORS.indexOf(k) >= 0 || /cursor|offset|max_?id/i.test(k)) u.searchParams.set(k, '0'); });
    paged = {}; sentCursor = {}; log('start list ' + short(u.toString())); get(u.toString(), 0);
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
    var steps = [];
    if (/tiktok\.com/.test(location.host) && !/^\/@/.test(location.pathname)) steps.push([/^Profile$/i, '[data-e2e="nav-profile"]']);
    steps = steps.concat([[/^(Favorites|Favourites)$/i, '[data-e2e="favorites-tab"]'],
                 kind === 'sounds' ? [/^Sounds?$/i, null] : [/^(Posts|Videos)$/i, null]]);
    var i = 0;
    log('clicking through to ' + kind + ' on ' + location.pathname);
    var t = setInterval(function(){
      if (i >= steps.length) { clearInterval(t); log('scrolling'); window.__loopboxScroll(true); return; }
      if (clickText(steps[i][0], steps[i][1])) { log('clicked ' + steps[i][0]); i++; }
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
