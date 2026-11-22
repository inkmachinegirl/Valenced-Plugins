import * as React from 'react'
import * as ReactNative from 'react-native'
import { ASSET_BASE, attachRenderer, rendererMessage } from '../lib/native'
import { reportError } from '../shared/report'
import { findWebView } from './webview'

/**
 * A hidden WebView with a <canvas> that draws the stickers (see lib/native.ts). It loads the
 * maker's fonts (YurukaStd, and ShangShouFangTangTi for Chinese / Japanese letters) once; Android's
 * WebView cache keeps them for next time.
 *
 * Messages in: `__sekai({ id, kind: 'render' | 'measure', payload })`.
 * Messages out: `{ type: 'ready', ascent, descent }` once, then `{ id, result | error }` per job.
 */

const HTML = `<!doctype html><html><head><meta charset="utf-8"></head><body><canvas id="c" width="296" height="256"></canvas><script>
(function(){
var BASE=${JSON.stringify(ASSET_BASE)};
var FONT='"SekaiYuruka","SekaiFangTang",sans-serif';
var c=document.getElementById('c'),ctx=c.getContext('2d');
function post(o){window.ReactNativeWebView.postMessage(JSON.stringify(o))}
var images={};
function image(src){
  if(images[src])return images[src];
  var p=new Promise(function(ok,no){var i=new Image();i.crossOrigin='anonymous';i.onload=function(){ok(i)};i.onerror=function(){delete images[src];no(new Error("couldn't load the picture"))};i.src=src});
  images[src]=p;return p;
}
function render(j){
  return image(j.img).then(function(img){
    var W=296,H=256;
    ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,W,H);
    var r=Math.min(W/img.width,H/img.height)*(j.imageScale/100);
    var w=img.width*r,h=img.height*r;
    ctx.drawImage(img,(W-w)/2+j.imageX,(H-h)/2+j.imageY,w,h);
    ctx.font=j.size+'px '+FONT;
    ctx.textAlign='center';ctx.textBaseline='alphabetic';
    ctx.lineJoin='round';ctx.miterLimit=2;ctx.lineWidth=9;ctx.strokeStyle='#ffffff';ctx.fillStyle=j.color;
    var base=(j.ascent-j.descent)/2*j.size;
    ctx.translate(j.x,j.y);ctx.rotate(j.rotate/10);
    j.pieces.forEach(function(p){ctx.save();ctx.translate(p.cx,p.cy);if(p.turn)ctx.rotate(p.turn);ctx.strokeText(p.text,0,base);ctx.restore()});
    j.pieces.forEach(function(p){ctx.save();ctx.translate(p.cx,p.cy);if(p.turn)ctx.rotate(p.turn);ctx.fillText(p.text,0,base);ctx.restore()});
    ctx.setTransform(1,0,0,1,0,0);
    return c.toDataURL('image/png');
  });
}
function measure(list){
  ctx.setTransform(1,0,0,1,0,0);ctx.font='100px '+FONT;var out={};
  list.forEach(function(l){out[l]=ctx.measureText(l).width/100});return out;
}
window.__sekai=function(m){
  Promise.resolve().then(function(){return m.kind==='render'?render(m.payload):measure(m.payload)})
    .then(function(result){post({id:m.id,result:result})},function(e){post({id:m.id,error:String(e&&e.message||e)})});
};
function font(name,file){var f=new FontFace(name,'url('+BASE+'src/fonts/'+file+')');document.fonts.add(f);return f.load()}
Promise.all([font('SekaiYuruka','YurukaStd.woff2'),font('SekaiFangTang','ShangShouFangTangTi.woff2').catch(function(){})])
  .then(function(){
    ctx.font='100px "SekaiYuruka"';var m=ctx.measureText('Hg');
    var a=m.fontBoundingBoxAscent,d=m.fontBoundingBoxDescent;
    post({type:'ready',ascent:a>0?a/100:0,descent:d>0?d/100:0});
  },function(e){post({type:'log',message:"the font didn't load: "+(e&&e.message||e)});post({type:'ready'})});
})();
</script></body></html>`

const source = { html: HTML, baseUrl: 'https://raw.githubusercontent.com/' }
const style = {
	position: 'absolute',
	width: 1,
	height: 1,
	opacity: 0,
	left: -10,
	top: -10,
} as const

let mounted = 0

/** Mount once wherever the panel is; extra copies stay empty. */
export default function Renderer() {
	const ref = React.useRef<any>(null)
	const [own] = React.useState(() => mounted++ === 0)
	React.useEffect(
		() => () => {
			if (own) {
				mounted = 0
				attachRenderer(undefined)
			} else mounted--
		},
		[],
	)
	if (!own) return null
	const WebView = findWebView()
	if (!WebView) {
		reportError("[Sekai Stickers] Discord's WebView wasn't found")
		return null
	}
	return (
		<ReactNative.View pointerEvents="none" style={style}>
			<WebView
				ref={(view: any) => {
					ref.current = view
					attachRenderer(
						view
							? script => ref.current?.injectJavaScript?.(script)
							: undefined,
					)
				}}
				source={source}
				originWhitelist={['*']}
				javaScriptEnabled
				domStorageEnabled
				cacheEnabled
				cacheMode="LOAD_CACHE_ELSE_NETWORK"
				style={{ width: 1, height: 1, backgroundColor: 'transparent' }}
				onMessage={(event: any) =>
					rendererMessage(String(event?.nativeEvent?.data ?? ''))
				}
			/>
		</ReactNative.View>
	)
}
