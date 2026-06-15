import{g as p}from"./index-C1NNgvvC.js";const g="modulepreload",v=function(r,s){return new URL(r,s).href},h={},L=function(s,n,i){let m=Promise.resolve();if(n&&n.length>0){const a=document.getElementsByTagName("link"),e=document.querySelector("meta[property=csp-nonce]"),f=(e==null?void 0:e.nonce)||(e==null?void 0:e.getAttribute("nonce"));m=Promise.allSettled(n.map(t=>{if(t=v(t,i),t in h)return;h[t]=!0;const l=t.endsWith(".css"),w=l?'[rel="stylesheet"]':"";if(!!i)for(let c=a.length-1;c>=0;c--){const u=a[c];if(u.href===t&&(!l||u.rel==="stylesheet"))return}else if(document.querySelector(`link[href="${t}"]${w}`))return;const o=document.createElement("link");if(o.rel=l?"stylesheet":g,l||(o.as="script"),o.crossOrigin="",o.href=t,f&&o.setAttribute("nonce",f),document.head.appendChild(o),l)return new Promise((c,u)=>{o.addEventListener("load",c),o.addEventListener("error",()=>u(new Error(`Unable to preload CSS for ${t}`)))})}))}function d(a){const e=new Event("vite:preloadError",{cancelable:!0});if(e.payload=a,window.dispatchEvent(e),!e.defaultPrevented)throw a}return m.then(a=>{for(const e of a||[])e.status==="rejected"&&d(e.reason);return s().catch(d)})},E=new Set(["new","help"]);function P(r){const s=r.match(/^\/([a-z][\w-]*)\s*([\s\S]*)$/i);if(!s)return null;const n=s[1].toLowerCase(),i=s[2].trim();return n==="reset"?{type:"frontend",command:"new",args:i,raw:r}:E.has(n)?{type:"frontend",command:n,args:i,raw:r}:{type:"gateway",command:n,args:i,raw:r}}const y=["可用指令：","","  /new [model]     创建新会话（可选模型参数）","  /stop            中止当前运行","  /status          查看当前状态","  /model [name]    查看/切换模型","  /think <level>   设置思考深度","  /tools           查看可用工具","  /help            显示此帮助","","更多指令：/fast, /verbose, /reasoning, /btw, /usage, /context, /commands"].join(`
`),S=`Available commands:
  /new [model]     New session (optional model)
  /stop            Abort current run
  /status          View current status
  /model [name]    View/switch model
  /think <level>   Set thinking depth
  /tools           List tools
  /help            Show this help

More: /fast, /verbose, /reasoning, /btw, /usage, /context, /commands`;function T(){return p()==="en"?S:y}export{L as _,T as g,P as p};
//# sourceMappingURL=command-parser-BlTtO-Pm.js.map
