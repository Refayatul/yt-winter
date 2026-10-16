"use strict";
// Experimental CT original-document verifier. Never imported by production research.
// HTTPS official-host allowlist; pinned public IPv4; bounded bytes/time; same-host redirects.
const dns=require("node:dns").promises,https=require("node:https"),net=require("node:net");
const crypto=require("node:crypto"),{spawn}=require("node:child_process");
const Research=require("../core/research");
const MAX_BYTES=8*1024*1024,MAX_TEXT_CHARS=500000,TIMEOUT_MS=15000,MAX_REDIRECTS=2;
const fail=(code)=>Object.assign(new Error(code),{code});
const hash=(buffer)=>crypto.createHash("sha256").update(buffer).digest("hex");
function publicIpv4(ip) {
  if(net.isIP(ip)!==4||!(/^\d{1,3}(?:\.\d{1,3}){3}$/).test(ip))return false;
  const [a,b,c]=ip.split(".").map(Number);
  return !(a===0||a===10||a===127||a>=224||(a===169&&b===254)||
    (a===172&&b>=16&&b<=31)||(a===192&&b===168)||(a===100&&b>=64&&b<=127)||
    (a===198&&(b===18||b===19))||(a===192&&b===0&&c<=2)||
    (a===192&&b===88&&c===99)||(a===198&&b===51&&c===100)||(a===203&&b===0&&c===113));
}
function parseAllowedUrl(input){
  if(typeof input!=="string"||input.length>2048)throw fail("UNSAFE_PRIMARY_URL");
  let url;try{url=new URL(input);}catch(_){throw fail("UNSAFE_PRIMARY_URL");}
  if(url.protocol!=="https:"||url.username||url.password||url.port||url.hash||
    net.isIP(url.hostname)||!url.hostname.includes("."))throw fail("UNSAFE_PRIMARY_URL");
  const h=url.hostname.toLowerCase();
  if(!Research.PRIMARY_HOSTS.some(d=>d.includes(".")&&(h===d||h.endsWith("."+d))))throw fail("UNAPPROVED_PRIMARY_HOST");
  return url;
}
async function resolvePublicIp(host,resolve4=dns.resolve4.bind(dns)){
  let ips;try{ips=await resolve4(host);}catch(_){throw fail("PRIMARY_DNS_FAILED");}
  if(!Array.isArray(ips)||!ips.length)throw fail("PRIMARY_DNS_FAILED");
  // Fail closed if ANY answer is non-public (mixed answers are a rebinding/SSRF signal); the
  // connection is then pinned to the first, public, address.
  if(!ips.every(publicIpv4))throw fail("PRIMARY_NONPUBLIC_ADDRESS");
  return ips[0];
}
function requestBytes(url,ip,{maxBytes=MAX_BYTES,timeoutMs=TIMEOUT_MS}={}){
  return new Promise((resolve,reject)=>{
    let done=false,req;
    const finish=(error,result)=>{if(done)return;done=true;clearTimeout(wall);error?reject(error):resolve(result);};
    // The specific failure is recorded before the socket is torn down, so a later generic stream
    // error cannot replace it.
    const abort=(code)=>{finish(fail(code));if(req)req.destroy();};
    const wall=setTimeout(()=>abort("PRIMARY_REQUEST_TIMEOUT"),timeoutMs);
    req=https.request({
      protocol:"https:",hostname:url.hostname,servername:url.hostname,port:443,
      method:"GET",path:url.pathname+url.search,agent:false,rejectUnauthorized:true,
      headers:{"accept":"text/html,text/plain,application/xhtml+xml,application/pdf",
        "accept-encoding":"identity","user-agent":"CT-Evidence-First-PrimaryVerifier/1.0"},
      lookup:(_name,_opts,cb)=>cb(null,ip,4)
    },res=>{
      const chunks=[];let bytes=0;
      const expected=Number(res.headers["content-length"]);
      if(Number.isFinite(expected)&&expected>maxBytes){abort("PRIMARY_DOCUMENT_TOO_LARGE");return;}
      res.on("data",chunk=>{
        if(done)return;
        bytes+=chunk.length;
        if(bytes>maxBytes){abort("PRIMARY_DOCUMENT_TOO_LARGE");return;}
        chunks.push(chunk);
      });
      res.on("error",()=>finish(fail("PRIMARY_RESPONSE_ERROR")));
      res.on("end",()=>finish(null,{status:res.statusCode,headers:res.headers,body:Buffer.concat(chunks)}));
    });
    req.setTimeout(timeoutMs,()=>abort("PRIMARY_REQUEST_TIMEOUT"));
    req.on("error",err=>finish(err.code&&/^PRIMARY_/.test(err.code)?err:fail("PRIMARY_REQUEST_FAILED")));
    req.end();
  });
}
const ENTITIES={amp:"&",lt:"<",gt:">",quot:'"',apos:"'",nbsp:" "};
function htmlToText(html){
  return String(html).replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi," ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi," ")
    .replace(/<!--[\s\S]*?-->/g," ").replace(/<[^>]+>/g," ")
    .replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi,(_m,entity)=>{
      if(entity[0]!=="#")return ENTITIES[entity.toLowerCase()]||" ";
      const n=entity[1]?.toLowerCase()==="x"?parseInt(entity.slice(2),16):parseInt(entity.slice(1),10);
      return n>0&&n<=0x10ffff&&!(n>=0xd800&&n<=0xdfff)?String.fromCodePoint(n):" ";
    }).replace(/\s+/g," ").trim();
}
function pdfToText(buffer,{timeoutMs=15000,maxOutputBytes=3*1024*1024}={}){
  if(!Buffer.isBuffer(buffer)||!buffer.subarray(0,5).equals(Buffer.from("%PDF-")))
    return Promise.reject(fail("PRIMARY_INVALID_PDF"));
  return new Promise((resolve,reject)=>{
    const child=spawn("pdftotext",["-enc","UTF-8","-layout","-","-"],
      {stdio:["pipe","pipe","ignore"],windowsHide:true});
    let finished=false,total=0;const chunks=[];
    const timer=setTimeout(()=>{child.kill("SIGKILL");end(fail("PRIMARY_PDF_TIMEOUT"));},timeoutMs);
    function end(err,value){if(finished)return;finished=true;clearTimeout(timer);err?reject(err):resolve(value);}
    child.on("error",()=>end(fail("PRIMARY_PDF_EXTRACTOR_UNAVAILABLE")));
    child.stdout.on("data",chunk=>{
      total+=chunk.length;
      if(total>maxOutputBytes){child.kill("SIGKILL");end(fail("PRIMARY_PDF_TEXT_TOO_LARGE"));}
      else chunks.push(chunk);
    });
    child.on("close",code=>{
      if(finished)return;
      if(code!==0)return end(fail("PRIMARY_PDF_EXTRACTION_FAILED"));
      end(null,Buffer.concat(chunks).toString("utf8").replace(/\s+/g," ").trim());
    });
    child.stdin.on("error",()=>{});
    child.stdin.end(buffer);
  });
}
async function fetchPrimaryDocument(source,options={}){
  if(!source||source.kind!=="primary")throw fail("SOURCE_NOT_PRIMARY");
  let url=parseAllowedUrl(source.url);const original=url.toString();
  const resolver=options.resolve4||dns.resolve4.bind(dns);
  const get=options.requestBytes||requestBytes;
  const pdf=options.pdfToText||pdfToText;
  const limit=Math.min(options.maxBytes||MAX_BYTES,MAX_BYTES);
  const timeoutMs=Math.min(options.timeoutMs||TIMEOUT_MS,TIMEOUT_MS);
  for(let count=0;count<=MAX_REDIRECTS;count++){
    const ip=await resolvePublicIp(url.hostname,resolver);
    const response=await get(url,ip,{maxBytes:limit,timeoutMs});
    if(!response||!Buffer.isBuffer(response.body)||response.body.length>limit)throw fail("PRIMARY_INVALID_RESPONSE");
    const status=Number(response.status);
    if([301,302,303,307,308].includes(status)){
      if(count===MAX_REDIRECTS)throw fail("PRIMARY_TOO_MANY_REDIRECTS");
      const next=parseAllowedUrl(new URL(response.headers?.location||"",url).toString());
      if(next.hostname!==url.hostname)throw fail("PRIMARY_CROSS_HOST_REDIRECT");
      url=next;continue;
    }
    if(status!==200)throw fail("PRIMARY_HTTP_NOT_OK");
    if(response.headers?.["content-encoding"]&&response.headers["content-encoding"]!=="identity")
      throw fail("PRIMARY_UNSUPPORTED_ENCODING");
    const type=String(response.headers?.["content-type"]||"").split(";",1)[0].trim().toLowerCase();
    let text;
    if(type==="application/pdf")text=await pdf(response.body);
    else if(["text/plain","text/html","application/xhtml+xml"].includes(type)){
      if(response.body.subarray(0,5).equals(Buffer.from("%PDF-")))throw fail("PRIMARY_MIME_MISMATCH");
      text=type==="text/plain"?response.body.toString("utf8"):htmlToText(response.body.toString("utf8"));
    }else throw fail("PRIMARY_UNSUPPORTED_MEDIA_TYPE");
    if(!text||text.length>MAX_TEXT_CHARS)throw fail("PRIMARY_EMPTY_OR_OVERSIZED_TEXT");
    return {url:original,final_url:url.toString(),text,content_type:type,
      body_sha256:hash(response.body),bytes:response.body.length};
  }
  throw fail("PRIMARY_REDIRECT_FAILURE");
}
const createPrimaryVerifier=(options={})=>async source=>fetchPrimaryDocument(source,options);
module.exports={parseAllowedUrl,publicIpv4,resolvePublicIp,requestBytes,htmlToText,pdfToText,
  fetchPrimaryDocument,createPrimaryVerifier,MAX_BYTES,MAX_TEXT_CHARS};
