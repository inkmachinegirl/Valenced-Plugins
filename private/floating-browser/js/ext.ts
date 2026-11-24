import {
	compiled,
	cosmeticFor,
	HASH_JS,
	pageHosts,
	scriptletsFor,
} from './filters'
import { callsFor, RUNTIME } from './scriptlets'
import { hostOf, type Settings } from './store'

/**
 * The "extensions": scripts put into every page the window loads. Before the page's own scripts
 * run: the pop-up blocker. After it loads (and on every page change): the ad hider, dark pages,
 * video focus and your own user scripts. Each one is wrapped so a failing script can't stop the rest.
 */

const wrap = (name: string, code: string) =>
	`try{${code}\n}catch(e){console.warn('[Floating Browser] ${name.replace(/'/g, '')}',e)}`

/** Holding a finger still in the middle of the page asks the app to let you move the window. */
const HOLD = `
if(window===window.top){var ht=0,sx=0,sy=0;var stop=function(){clearTimeout(ht);ht=0};
document.addEventListener('touchstart',function(e){stop();if(e.touches.length!==1)return;var t=e.touches[0];sx=t.clientX;sy=t.clientY;var w=window.innerWidth,h=window.innerHeight;
if(sx<w*0.25||sx>w*0.75||sy<h*0.25||sy>h*0.75)return;ht=setTimeout(function(){ht=0;try{window.ReactNativeWebView.postMessage(JSON.stringify({fb:'hold'}))}catch(x){}},550)},{passive:true,capture:true});
document.addEventListener('touchmove',function(e){var t=e.touches[0];if(t&&(Math.abs(t.clientX-sx)>10||Math.abs(t.clientY-sy)>10))stop()},{passive:true,capture:true});
document.addEventListener('touchend',stop,{passive:true,capture:true});document.addEventListener('touchcancel',stop,{passive:true,capture:true});
document.addEventListener('scroll',stop,{passive:true,capture:true})}
`

const POPUPS = `
window.open=function(){return null};
document.addEventListener('click',function(e){var a=e.target&&e.target.closest&&e.target.closest('a[target=_blank]');if(a&&a.href&&a.host!==location.host){a.removeAttribute('target')}},true);
`

/**
 * Fullscreen inside the window: a page asking for fullscreen gets its element stretched over the
 * page instead, and is told it's fullscreen (fullscreenElement, the change events), so the
 * player's own buttons, including "exit fullscreen", keep working.
 */
const FULLSCREEN = `
var cur=null,last=null,saved='',savedOverflow='';
var top=window===window.top;
// Tell whoever needs to know: a frame tells the page around it (which stretches the frame), the
// page tells the app (which turns the window sideways and back).
var tell=function(on){try{if(top){window.ReactNativeWebView&&window.ReactNativeWebView.postMessage(JSON.stringify({fb:'fs',on:on}))}else{window.parent.postMessage({__fbFs:1,on:on},'*')}}catch(e){}};
var FILL=';position:fixed!important;left:0!important;top:0!important;right:0!important;bottom:0!important;width:100vw!important;height:100vh!important;max-width:none!important;max-height:none!important;z-index:2147483647!important;background:#000!important;margin:0!important;transform:none!important;border-radius:0!important;border:0!important';
var frames=new Map();
var stretch=function(f,on){if(on){if(frames.has(f))return;frames.set(f,[f.getAttribute('style')||'',document.documentElement.style.overflow]);f.style.cssText+=FILL;document.documentElement.style.overflow='hidden';tell(true)}
else if(frames.has(f)){var k=frames.get(f);f.setAttribute('style',k[0]);document.documentElement.style.overflow=k[1];frames.delete(f);if(!frames.size)tell(false)}};
if(top)window.addEventListener('message',function(e){var d=e.data;if(!d||!d.__fbFs)return;var f=null;document.querySelectorAll('iframe').forEach(function(x){if(x.contentWindow===e.source)f=x});if(f)stretch(f,!!d.on)});
// A player in a frame this script can't reach goes into real fullscreen (the whole phone screen):
// the page around it sees that, cancels it at once, and stretches the frame over the window
// instead. Pressing the player's button again does the same, and shrinks it back.
var nFs=Object.getOwnPropertyDescriptor(Document.prototype,'fullscreenElement')||Object.getOwnPropertyDescriptor(Document.prototype,'webkitFullscreenElement');
var nExit=Document.prototype.exitFullscreen||Document.prototype.webkitExitFullscreen;
var onNative=function(){var el=null;try{el=nFs&&nFs.get?nFs.get.call(document):null}catch(e){}if(!el||el.tagName!=='IFRAME')return;try{nExit&&nExit.call(document)}catch(e){}stretch(el,!frames.has(el))};
if(top){document.addEventListener('fullscreenchange',onNative,true);document.addEventListener('webkitfullscreenchange',onNative,true)}
window.__fbExitFs=function(){Array.from(frames.keys()).forEach(function(f){stretch(f,false)});if(cur)exit()};
// The bar's fullscreen button: fill the window with the page's main video (or the player frame), or leave.
window.__fbToggleFs=function(){if(frames.size||cur){window.__fbExitFs();return}
var vw=window.innerWidth*window.innerHeight,best=null,area=-1;
document.querySelectorAll('video').forEach(function(v){var r=v.getBoundingClientRect();if(r.width*r.height>area){area=r.width*r.height;best=v}});
if(best){var box=best.closest('.plyr,.video-js,.jwplayer,.vjs-player,[class*="player"]')||best;enter(box);return}
// A frame counts as a player when its address or name says so, or it takes a good part of the page.
var PL=/player|embed|video|stream|watch|vidstream|play/i;area=-1;
document.querySelectorAll('iframe').forEach(function(f){var r=f.getBoundingClientRect();var a=r.width*r.height;var named=PL.test((f.src||'')+' '+(f.id||'')+' '+(f.className||'')+' '+(f.name||''));if((named||a>=vw*0.2)&&a>area){area=a;best=f}});
if(best){stretch(best,true);return}
// No video here: the app makes the window a big floating page instead.
try{window.ReactNativeWebView.postMessage(JSON.stringify({fb:'fsnone'}))}catch(e){}};
var fire=function(el){['fullscreenchange','webkitfullscreenchange'].forEach(function(t){try{(el||document).dispatchEvent(new Event(t,{bubbles:true}))}catch(e){}})};
var enter=function(el){if(cur&&cur!==el)exit();if(cur===el)return Promise.resolve();cur=last=el;saved=el.getAttribute('style')||'';
el.style.cssText+=FILL;
savedOverflow=document.documentElement.style.overflow;document.documentElement.style.overflow='hidden';fire(el);tell(true);return Promise.resolve()};
var exit=function(){if(!cur)return Promise.resolve();var el=cur;el.setAttribute('style',saved);document.documentElement.style.overflow=savedOverflow;cur=null;fire(el);tell(false);return Promise.resolve()};
var E=Element.prototype;['requestFullscreen','webkitRequestFullscreen','webkitRequestFullScreen','mozRequestFullScreen','msRequestFullscreen'].forEach(function(n){E[n]=function(){return enter(this)}});
if(window.HTMLVideoElement){HTMLVideoElement.prototype.webkitEnterFullscreen=function(){return enter(this)};HTMLVideoElement.prototype.webkitExitFullscreen=function(){return exit()}}
var DS=[Document.prototype,document];DS.forEach(function(D){['exitFullscreen','webkitExitFullscreen','webkitCancelFullScreen','mozCancelFullScreen','msExitFullscreen'].forEach(function(n){try{Object.defineProperty(D,n,{configurable:true,writable:true,value:function(){return exit()}})}catch(e){}});
['fullscreenElement','webkitFullscreenElement','webkitCurrentFullScreenElement','mozFullScreenElement','msFullscreenElement'].forEach(function(n){try{Object.defineProperty(D,n,{configurable:true,get:function(){return cur}})}catch(e){}});
['fullscreenEnabled','webkitFullscreenEnabled','webkitSupportsFullscreen'].forEach(function(n){try{Object.defineProperty(D,n,{configurable:true,get:function(){return true}})}catch(e){}});
try{Object.defineProperty(D,'webkitIsFullScreen',{configurable:true,get:function(){return !!cur}})}catch(e){}});
try{if(screen.orientation){screen.orientation.lock=function(){return Promise.resolve()}}}catch(e){}
`

/** Stops requests to blocked hosts inside the page (hosts arrive hashed; see filters.ts). */
const net = (blocked: string, allow: string) => `
var hf=${HASH_JS};var B=new Set('${blocked}'.split(',')),AL=new Set('${allow}'.split(','));var own=location.hostname;
var n=0,pt=0;var post=function(){n++;if(pt)return;pt=setTimeout(function(){pt=0;try{window.ReactNativeWebView.postMessage(JSON.stringify({fb:'blocked',n:n}))}catch(e){}},500)};
var bad=function(u){try{if(!u)return false;var h=new URL(String(u),location.href).hostname.toLowerCase();if(!h||h===own)return false;h=h.replace(/^www\\./,'');while(h.indexOf('.')>0){var x=hf(h);if(AL.has(x))return false;if(B.has(x)){post();return true}h=h.slice(h.indexOf('.')+1)}}catch(e){}return false};
window.__fbBad=bad;
var of=window.fetch;if(of)window.fetch=function(r){if(bad(r&&r.url||r))return Promise.reject(new TypeError('Failed to fetch'));return of.apply(this,arguments)};
var xo=XMLHttpRequest.prototype.open,xs=XMLHttpRequest.prototype.send;XMLHttpRequest.prototype.open=function(m,u){this.__fbBad=bad(u);return xo.apply(this,arguments)};
XMLHttpRequest.prototype.send=function(){if(this.__fbBad){var x=this;setTimeout(function(){try{x.dispatchEvent(new Event('error'));x.dispatchEvent(new Event('loadend'))}catch(e){}},0);return}return xs.apply(this,arguments)};
if(navigator.sendBeacon){var sb=navigator.sendBeacon.bind(navigator);navigator.sendBeacon=function(u){if(bad(u))return true;return sb.apply(null,arguments)}}
var guard=function(proto,prop){var d=Object.getOwnPropertyDescriptor(proto,prop);if(!d||!d.set)return;Object.defineProperty(proto,prop,{configurable:true,enumerable:d.enumerable,get:d.get,set:function(v){if(bad(v)){var el=this;setTimeout(function(){try{el.dispatchEvent(new Event('error'))}catch(e){}},0);return}return d.set.call(this,v)}})};
[[HTMLScriptElement,'src'],[HTMLIFrameElement,'src'],[HTMLImageElement,'src'],[HTMLLinkElement,'href'],[HTMLSourceElement,'src']].forEach(function(p){try{guard(p[0].prototype,p[1])}catch(e){}});
var sa=Element.prototype.setAttribute;Element.prototype.setAttribute=function(k,v){if((k==='src'||k==='href'&&this.tagName==='LINK')&&/^(SCRIPT|IFRAME|IMG|LINK|SOURCE)$/.test(this.tagName)&&bad(v))return;return sa.apply(this,arguments)};
var sweep=function(nodes){nodes.forEach(function(el){if(el.nodeType!==1)return;var t=el.tagName;if((t==='SCRIPT'||t==='IFRAME'||t==='IMG')&&bad(el.getAttribute('src'))){if(t==='SCRIPT')el.type='javascript/blocked';el.remove()}})};
var start=function(){new MutationObserver(function(ms){ms.forEach(function(m){sweep(m.addedNodes)})}).observe(document.documentElement,{childList:true,subtree:true})};
if(document.documentElement)start();else document.addEventListener('readystatechange',start,{once:true});
`

/** Tells the app which classes and ids the page has, so generic hiding rules for them can be added. */
const TOKENS = `
var seen=new Set(),t=0;
var scan=function(){var out=[];document.querySelectorAll('[id],[class]').forEach(function(el){if(el.id&&!seen.has('#'+el.id)){seen.add('#'+el.id);out.push('#'+el.id)}var c=el.classList;if(c)for(var i=0;i<c.length;i++){var k='.'+c[i];if(!seen.has(k)){seen.add(k);out.push(k)}}});if(out.length)try{window.ReactNativeWebView.postMessage(JSON.stringify({fb:'tokens',t:out.slice(0,4000),h:location.hostname}))}catch(e){}};
var later=function(){if(t)return;t=setTimeout(function(){t=0;scan()},400)};
var go=function(){scan();new MutationObserver(later).observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['class','id']})};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',go);else go();
window.__fbCss=function(list){var st=document.getElementById('__fb_ubo');if(!st){st=document.createElement('style');st.id='__fb_ubo';(document.head||document.documentElement).appendChild(st)}var sh=st.sheet;if(!sh)return;for(var i=0;i<list.length;i++){try{sh.insertRule(list[i]+'{display:none!important}',sh.cssRules.length)}catch(e){}}};
`

const ADS = `
var s=document.getElementById('__fb_ads')||document.createElement('style');s.id='__fb_ads';
s.textContent='ins.adsbygoogle,.adsbygoogle,[id^="google_ads"],[id^="div-gpt-ad"],iframe[src*="doubleclick"],iframe[src*="googlesyndication"],iframe[src*="adservice"],iframe[id^="aswift"],[class*="ad-banner"],[class*="banner-ad"],[class*="sponsored-ad"],[id*="ad-container"],[class*="ad-container"],[aria-label="advertisement"],[data-ad-slot]{display:none!important;height:0!important}';
(document.head||document.documentElement).appendChild(s);
`

const DARK = `
var d=document.getElementById('__fb_dark')||document.createElement('style');d.id='__fb_dark';
d.textContent='html{filter:invert(1) hue-rotate(180deg)!important;background:#fff!important}img,video,picture,canvas,iframe,svg image,[style*="background-image"]{filter:invert(1) hue-rotate(180deg)!important}';
(document.head||document.documentElement).appendChild(d);
`
const UNDARK = `var d=document.getElementById('__fb_dark');if(d)d.remove();`

/** Makes the biggest video (or player frame) fill the window; checks again as pages change. */
const FOCUS = `
if(!window.__fbFocus){window.__fbFocus=1;
var pick=function(){var best=null,area=0;document.querySelectorAll('video,iframe').forEach(function(v){var r=v.getBoundingClientRect();var a=r.width*r.height;if(v.tagName==='IFRAME'&&!/player|embed|video|stream/i.test(v.src+v.id+v.className))return;if(a>area){area=a;best=v}});return best};
var apply=function(){var v=pick();if(!v)return;if(window.__fbFocused&&window.__fbFocused!==v){window.__fbFocused.style.cssText=window.__fbFocusedCss||''}if(window.__fbFocused!==v){window.__fbFocusedCss=v.style.cssText}window.__fbFocused=v;
v.style.cssText+=';position:fixed!important;left:0!important;top:0!important;width:100vw!important;height:100vh!important;max-width:none!important;max-height:none!important;z-index:2147483647!important;background:#000!important;object-fit:contain!important;margin:0!important;border:0!important';
document.documentElement.style.overflow='hidden'};
apply();window.__fbFocusTimer=setInterval(apply,1500)}
`
const UNFOCUS = `
if(window.__fbFocus){clearInterval(window.__fbFocusTimer);window.__fbFocus=0;var v=window.__fbFocused;if(v)v.style.cssText=window.__fbFocusedCss||'';window.__fbFocused=null;document.documentElement.style.overflow=''}
`

export function matches(match: string, url: string): boolean {
	const host = hostOf(url)
	return match
		.split(',')
		.map(m => m.trim().toLowerCase())
		.filter(Boolean)
		.some(m => m === '*' || url.toLowerCase().includes(m) || host.endsWith(m))
}

export function beforeLoad(s: Settings): string {
	const parts: string[] = [wrap('hold to move', HOLD)]
	if (s.popupBlock) parts.push(wrap('pop-ups', POPUPS))
	if (s.uBlock && compiled()) {
		const { blocked, allow } = pageHosts()
		parts.push(wrap('scriptlets', RUNTIME))
		parts.push(wrap('network filters', net(blocked, allow)))
		parts.push(wrap('cosmetic filters', TOKENS))
	}
	if (s.inWindowFullscreen) parts.push(wrap('fullscreen', FULLSCREEN))
	return `(function(){${parts.join('\n')}})();true;`
}

/** Everything that runs once a page has loaded (also re-run when a setting changes). */
export function afterLoad(s: Settings, url: string): string {
	const parts: string[] = []
	if (s.adHide) parts.push(wrap('ads', ADS))
	if (s.uBlock && compiled()) parts.push(pageFilters(url))
	parts.push(wrap('dark', s.dark ? DARK : UNDARK))
	parts.push(wrap('video', s.videoFocus ? FOCUS : UNFOCUS))
	for (const sc of s.scripts)
		if (sc.on && sc.code.trim() && matches(sc.match || '*', url))
			// Compiled on its own, so a typo in one script can't break the others (a syntax error
			// can't be caught where it's written).
			parts.push(
				wrap(
					sc.name || 'script',
					`(new Function(${JSON.stringify(sc.code)}))()`,
				),
			)
	return `(function(){${parts.join('\n')}})();true;`
}

/**
 * A page's own uBlock rules: its scriptlets (run as early as the app can get them in: when loading
 * starts, again when it ends; each guards itself against running twice) and its hiding rules.
 */
export function pageFilters(url: string): string {
	const host = hostOf(url)
	if (!host) return ''
	const calls = callsFor(scriptletsFor(host))
	const css = cosmeticFor(host)
	return wrap(
		'site filters',
		`if(window.__fbSite!==${JSON.stringify(host)}){window.__fbSite=${JSON.stringify(host)};${calls ? `if(window.__fbScriptlet){${calls}}` : ''}}` +
			(css.length
				? `if(window.__fbCss)window.__fbCss(${JSON.stringify(css)});`
				: ''),
	)
}

/** Generic hiding rules for classes / ids a page reported. */
export function tokensCss(selectors: string[]): string {
	return `(function(){try{if(window.__fbCss)window.__fbCss(${JSON.stringify(selectors)})}catch(e){}})();true;`
}

export const DESKTOP_UA =
	'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'

/** Navigations the pop-up blocker stops: app-store and intent jumps that ads use. */
export function blockedNav(url: string): boolean {
	return /^(intent|market|itms-apps|itms-appss|fb|twitter|snssdk\d*):/i.test(
		url,
	)
}
