/**
 * The most used uBlock Origin scriptlets (by how often uBlock's own lists use them), written from
 * their documented behaviour. A page's `site##+js(name, args…)` rules run these at page start.
 * Names and aliases follow uBlock's.
 */

export const RUNTIME = `
var W=window;
var pat=function(s){if(!s)return null;var m=/^\\/(.*)\\/([gimsu]*)$/.exec(s);try{return m?new RegExp(m[1],m[2]):new RegExp(String(s).replace(/[.*+?^\${}()|[\\]\\\\]/g,'\\\\$&'))}catch(e){return null}};
var chain=function(path,onLast){var parts=String(path).split('.');var owner=W;for(var i=0;i<parts.length-1;i++){var p=parts[i];if(owner[p]==null||typeof owner[p]!=='object'&&typeof owner[p]!=='function'){var holder={};try{Object.defineProperty(owner,p,{configurable:true,get:function(){return holder},set:function(){}})}catch(e){}owner=holder}else owner=owner[p]}onLast(owner,parts[parts.length-1])};
var abort=function(){throw new ReferenceError('blocked')};
var value=function(v){switch(v){case'undefined':return undefined;case'false':return false;case'true':return true;case'null':return null;case'noopFunc':return function(){};case'trueFunc':return function(){return true};case'falseFunc':return function(){return false};case'emptyArr':case'[]':return[];case'emptyObj':case'{}':return{};case'emptyStr':case'':return'';case'yes':return'yes';case'no':return'no';default:var n=Number(v);return isNaN(n)?v:n}};
var S={};
S.aopr=function(p){chain(p,function(o,k){try{Object.defineProperty(o,k,{configurable:false,get:abort,set:function(){}})}catch(e){}})};
S.aopw=function(p){chain(p,function(o,k){try{Object.defineProperty(o,k,{configurable:false,get:function(){},set:abort})}catch(e){}})};
S.set=function(p,v){var val=value(v);chain(p,function(o,k){try{Object.defineProperty(o,k,{configurable:false,get:function(){return val},set:function(){}})}catch(e){try{o[k]=val}catch(e2){}}})};
S.acs=function(p,needle){var re=pat(needle);chain(p,function(o,k){var cur=o[k];try{Object.defineProperty(o,k,{configurable:true,get:function(){var sc=document.currentScript;if(sc&&(!re||re.test(sc.textContent||sc.src||'')))abort();return cur},set:function(v){cur=v}})}catch(e){}})};
S.aeld=function(type,needle){var t=pat(type),n=pat(needle);var orig=EventTarget.prototype.addEventListener;EventTarget.prototype.addEventListener=function(ty,fn){if((!t||t.test(ty))&&(!n||n.test(String(fn))))return;return orig.apply(this,arguments)}};
S.nowoif=function(needle){var n=pat(needle);var orig=W.open;W.open=function(u){if(!n||n.test(String(u)))return null;return orig.apply(W,arguments)}};
var timer=function(name){return function(needle,delay){var n=pat(needle),d=delay?Number(delay):null;var orig=W[name];W[name]=function(fn,ms){if((!n||n.test(String(fn)))&&(d===null||isNaN(d)||Number(ms)===d))return 0;return orig.apply(W,arguments)}}};
S.nostif=timer('setTimeout');S.nosiif=timer('setInterval');
S.noeval=function(needle){var n=pat(needle);var orig=W.eval;W.eval=function(s){if(!n||n.test(String(s)))return;return orig.apply(W,arguments)}};
S['no-fetch-if']=function(needle){var n=pat(needle);var orig=W.fetch;if(orig)W.fetch=function(u){if(!n||n.test(String(u&&u.url||u)))return Promise.resolve(new Response('',{status:200}));return orig.apply(W,arguments)}};
S['no-xhr-if']=function(needle){var n=pat(needle);var open=XMLHttpRequest.prototype.open,send=XMLHttpRequest.prototype.send;XMLHttpRequest.prototype.open=function(m,u){this.__fbNo=!n||n.test(String(u));return open.apply(this,arguments)};XMLHttpRequest.prototype.send=function(){if(this.__fbNo){var x=this;setTimeout(function(){try{Object.defineProperty(x,'readyState',{value:4});Object.defineProperty(x,'status',{value:200});x.dispatchEvent(new Event('readystatechange'));x.dispatchEvent(new Event('load'))}catch(e){}},0);return}return send.apply(this,arguments)}};
var onReady=function(fn){fn();new MutationObserver(fn).observe(document.documentElement||document,{childList:true,subtree:true,attributes:true})};
S.ra=function(attrs,sel){var names=String(attrs).split('|');onReady(function(){document.querySelectorAll(sel||names.map(function(a){return'['+a+']'}).join(',')).forEach(function(el){names.forEach(function(a){el.removeAttribute(a)})})})};
S.rc=function(cls,sel){var names=String(cls).split('|');onReady(function(){document.querySelectorAll(sel||names.map(function(c){return'.'+c}).join(',')).forEach(function(el){names.forEach(function(c){el.classList.remove(c)})})})};
var A={'abort-on-property-read':'aopr','abort-on-property-write':'aopw','set-constant':'set','abort-current-script':'acs','abort-current-inline-script':'acs','acis':'acs','addEventListener-defuser':'aeld','prevent-addEventListener':'aeld','no-window-open-if':'nowoif','window.open-defuser':'nowoif','no-setTimeout-if':'nostif','prevent-setTimeout':'nostif','setTimeout-defuser':'nostif','no-setInterval-if':'nosiif','prevent-setInterval':'nosiif','setInterval-defuser':'nosiif','noeval-if':'noeval','prevent-eval-if':'noeval','prevent-fetch':'no-fetch-if','prevent-xhr':'no-xhr-if','remove-attr':'ra','remove-class':'rc'};
W.__fbScriptlet=function(name,args){name=String(name).replace(/\\.js$/,'');var f=S[A[name]||name];if(!f)return;try{f.apply(null,args)}catch(e){}};
`

export const SUPPORTED = new Set([
	'aopr',
	'aopw',
	'set',
	'acs',
	'aeld',
	'nowoif',
	'nostif',
	'nosiif',
	'noeval',
	'no-fetch-if',
	'no-xhr-if',
	'ra',
	'rc',
	'abort-on-property-read',
	'abort-on-property-write',
	'set-constant',
	'abort-current-script',
	'abort-current-inline-script',
	'acis',
	'addEventListener-defuser',
	'prevent-addEventListener',
	'no-window-open-if',
	'window.open-defuser',
	'no-setTimeout-if',
	'prevent-setTimeout',
	'setTimeout-defuser',
	'no-setInterval-if',
	'prevent-setInterval',
	'setInterval-defuser',
	'noeval-if',
	'prevent-eval-if',
	'prevent-fetch',
	'prevent-xhr',
	'remove-attr',
	'remove-class',
])

/** The calls for one page: only scriptlets this browser has, each run once per page. */
export function callsFor(list: string[][]): string {
	const seen = new Set<string>()
	const calls: string[] = []
	for (const [name, ...args] of list) {
		const n = name.replace(/\.js$/, '')
		if (!SUPPORTED.has(n)) continue
		const key = JSON.stringify([n, args])
		if (seen.has(key)) continue
		seen.add(key)
		calls.push(`__fbScriptlet(${JSON.stringify(n)},${JSON.stringify(args)});`)
	}
	return calls.join('')
}
