"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs");
const path=require("node:path"),os=require("node:os");
const Primary=require("../../scripts/ct-primary-document"),CLI=require("../../scripts/ct-evidence-first-manual");
const Evidence=require("../../scripts/ct-evidence-first");
const one={kind:"primary",url:"https://nasa.gov/reports/incident"};
const dns=async()=>["8.8.8.8"];
const html=Buffer.from("<html><body><h1>Official Report</h1>Documented technical failure.</body></html>");
const response=(body=html,headers={"content-type":"text/html"},status=200)=>({body,headers,status});
test("reject URL spoofing, credentials, IP literal, private address and unsafe redirect",async()=>{
  for(const value of ["http://nasa.gov/x","https://nasa.gov.attacker.net/x","https://fake-nasa.gov/x",
    "https://127.0.0.1/","https://nasa.gov:8080/","https://a:b@nasa.gov/",
    "https://[::1]/","https://cern/x"])
    assert.throws(()=>Primary.parseAllowedUrl(value),/UNSAFE_PRIMARY_URL|UNAPPROVED_PRIMARY_HOST/);
  assert.equal(Primary.parseAllowedUrl(one.url).hostname,"nasa.gov");
  assert.equal(Primary.parseAllowedUrl("https://www.nasa.gov/x").hostname,"www.nasa.gov");
  for(const ip of ["127.0.0.1","10.2.3.4","172.19.0.1","192.168.3.9",
    "169.254.169.254","100.64.3.8","198.18.2.1","192.0.2.2","203.0.113.1","224.0.0.1"])
    assert.equal(Primary.publicIpv4(ip),false,ip);
  assert.equal(Primary.publicIpv4("8.8.8.8"),true);
  let called=false;
  await assert.rejects(Primary.fetchPrimaryDocument(one,{resolve4:async()=>["10.0.0.1"],requestBytes:async()=>{called=true;return response();}}),/PRIMARY_NONPUBLIC_ADDRESS/);
  assert.equal(called,false);
  const redirect=response(Buffer.alloc(0),{location:"https://nist.gov/other"},302);
  await assert.rejects(Primary.fetchPrimaryDocument(one,{resolve4:dns,requestBytes:async()=>redirect}),/PRIMARY_CROSS_HOST_REDIRECT/);
});
test("pin DNS and allow only bounded same-host redirect; do not log content",async()=>{
  const seen=[];
  const doc=await Primary.fetchPrimaryDocument(one,{resolve4:dns,requestBytes:async(url,ip)=>{
    seen.push({url:url.toString(),ip});
    return seen.length===1?response(Buffer.alloc(0),{location:"/official"},302):response();
  }});
  assert.equal(seen.length,2);assert.equal(seen[0].ip,"8.8.8.8");
  assert.equal(doc.final_url,"https://nasa.gov/official");
  assert.match(doc.text,/Official Report Documented technical failure/);
  assert.match(doc.body_sha256,/^[a-f0-9]{64}$/);
});
test("fail closed on bad MIME, compressed responses, oversized buffers or fabricated PDF",async()=>{
  for(const [r,pattern] of [
    [response(Buffer.from("hi"),{"content-type":"application/octet-stream"}),/PRIMARY_UNSUPPORTED_MEDIA_TYPE/],
    [response(Buffer.from("hi"),{"content-type":"text/plain","content-encoding":"gzip"}),/PRIMARY_UNSUPPORTED_ENCODING/],
    [response(Buffer.from("%PDF-1.4"),{"content-type":"text/plain"}),/PRIMARY_MIME_MISMATCH/],
    [response(Buffer.alloc(900),{"content-type":"text/plain"}),/PRIMARY_INVALID_RESPONSE/]
  ])await assert.rejects(Primary.fetchPrimaryDocument(one,{resolve4:dns,requestBytes:async()=>r,maxBytes:100}),pattern);
});
test("PDF only accepted via explicit bounded extraction",async()=>{
  const payload=Buffer.from("%PDF-1.4\nsynthetic"),requestBytes=async()=>response(payload,{"content-type":"application/pdf"});
  const doc=await Primary.fetchPrimaryDocument(one,{resolve4:dns,requestBytes,
    pdfToText:async input=>{assert.deepEqual(input,payload);return "Verified original document excerpt."; }});
  assert.equal(doc.content_type,"application/pdf");
  await assert.rejects(Primary.pdfToText(Buffer.from("not PDF")),/PRIMARY_INVALID_PDF/);
});
test("HTML decoding removes scripts and keeps visible text",()=>{
  assert.equal(Primary.htmlToText("<script>secret</script><style>secret2</style><p>A &amp; B and &#49; events.</p>"),
    "A & B and 1 events.");
});
test("manual opt-in is mandatory and output excludes raw source contents",async()=>{
  const prior=process.env.CT_EVIDENCE_FIRST_MANUAL;
  try{
    delete process.env.CT_EVIDENCE_FIRST_MANUAL;
    await assert.rejects(CLI.run({argv:["--manual","--probe-primary",one.url]}),/EXPLICIT_MANUAL_OPT_IN_REQUIRED/);
    process.env.CT_EVIDENCE_FIRST_MANUAL="1";
    let count=0;
    const result=await CLI.run({argv:["--manual","--probe-primary",one.url],fetchPrimary:async()=>{
      count++;return {url:one.url,content_type:"text/plain",body_sha256:"a".repeat(64),
        text:"private sensitive content",bytes:20};
    }});
    assert.equal(count,1);assert.equal(result.no_groq_requests,true);assert.equal(result.no_writes,true);
    assert.equal(JSON.stringify(result).includes("sensitive"),false);
  }finally{if(prior===undefined)delete process.env.CT_EVIDENCE_FIRST_MANUAL;else process.env.CT_EVIDENCE_FIRST_MANUAL=prior;}
});
test("manual fixture is explicitly MOCKED with no LLM or publication",async()=>{
  const prior=process.env.CT_EVIDENCE_FIRST_MANUAL,dir=fs.mkdtempSync(path.join(os.tmpdir(),"ct-manual-"));
  process.env.CT_EVIDENCE_FIRST_MANUAL="1";
  const file=path.join(dir,"fixture.json");
  try{
    fs.writeFileSync(file,JSON.stringify({topic:{id:"CT-TEST",slug:"fake"},
      sources:[one],facts:[],story:{},original_documents:{S1:"synthetic"}}));
    const output=await CLI.run({argv:["--manual","--fixture",file],replay:async args=>{
      assert.equal(typeof args.generate,"function");
      return {status:"INSUFFICIENT_EVIDENCE",evidence:{approved_facts:[],rejected_facts:[],verification:{distinct_primary_documents:0}}};
    }});
    assert.equal(output.mode,"MOCKED_OFFLINE_REPLAY");
    assert.equal(output.model_usage,"MOCKED_NOT_REAL");
    assert.equal(output.no_groq_requests,true);
  }finally{fs.rmSync(dir,{recursive:true,force:true});if(prior===undefined)delete process.env.CT_EVIDENCE_FIRST_MANUAL;else process.env.CT_EVIDENCE_FIRST_MANUAL=prior;}
});

test("real Stage A receives only independently retrieved original text; matching two documents is still semantic-review-only",async()=>{
  const quote=i=>"The official report confirms component number "+i+" triggered a cascade of documented technical failures.";
  const facts=Array.from({length:16},(_,i)=>({fact_id:"F"+(i+1),source_id:i<8?"S1":"S2",
    claim:"Component "+(i+1)+" triggered documented technical failures.",verbatim_quote:quote(i+1)}));
  const sources=[1,2].map(n=>({source_id:"S"+n,kind:"primary",
    url:n===1?"https://nasa.gov/mock-first":"https://nist.gov/mock-second",
    excerpt:facts.filter(f=>f.source_id==="S"+n).map(f=>f.verbatim_quote).join("\n")}));
  const lookup=new Map(sources.map(s=>[s.url,s.excerpt]));
  const verifier=Primary.createPrimaryVerifier({resolve4:dns,requestBytes:async url=>
    response(Buffer.from(lookup.get(url.toString())||""),{"content-type":"text/plain"})});
  const p=await Evidence.validateEvidence({topic:{id:"CT-MOCK"},facts,sources,verifyPrimary:verifier});
  assert.equal(p.verification.distinct_primary_documents,2);
  assert.equal(p.status,"READY_FOR_STORY_REVIEW_REQUIRED");
  assert.ok(p.approved_facts.every(f=>f.semantic_status==="NEEDS_REVIEW"));
  lookup.set(sources[1].url,"another source unrelated to the claimed event");
  const q=await Evidence.validateEvidence({topic:{id:"CT-MOCK"},facts,sources,verifyPrimary:verifier});
  assert.equal(q.verification.distinct_primary_documents,1);
  assert.equal(q.status,"INSUFFICIENT_EVIDENCE");
  assert.equal(q.approved_facts[8].evidence_status,"EXCERPT_MATCHED");
});

test("fail closed when ANY resolved address is non-public (mixed answers), before any request",async()=>{
  for(const answer of [["8.8.8.8","10.0.0.1"],["127.0.0.1","8.8.8.8"],["8.8.8.8","169.254.169.254"],[]]){
    let called=false;
    await assert.rejects(Primary.fetchPrimaryDocument(one,{resolve4:async()=>answer,requestBytes:async()=>{called=true;return response();}}),
      answer.length?/PRIMARY_NONPUBLIC_ADDRESS/:/PRIMARY_DNS_FAILED/);
    assert.equal(called,false,JSON.stringify(answer));
  }
  await assert.rejects(Primary.fetchPrimaryDocument(one,{resolve4:async()=>{throw new Error("ENOTFOUND");},requestBytes:async()=>response()}),/PRIMARY_DNS_FAILED/);
  assert.equal(await Primary.resolvePublicIp("nasa.gov",async()=>["8.8.8.8","1.1.1.1"]),"8.8.8.8");
});
test("redirect limits: a redirect chain longer than two, or to another approved host, fails closed",async()=>{
  let n=0;
  await assert.rejects(Primary.fetchPrimaryDocument(one,{resolve4:dns,requestBytes:async()=>{n++;return response(Buffer.alloc(0),{location:"/next"+n},302);}}),/PRIMARY_TOO_MANY_REDIRECTS/);
  assert.equal(n,3);
  await assert.rejects(Primary.fetchPrimaryDocument(one,{resolve4:dns,requestBytes:async()=>response(Buffer.alloc(0),{location:"http://nasa.gov/x"},301)}),/UNSAFE_PRIMARY_URL/);
  await assert.rejects(Primary.fetchPrimaryDocument(one,{resolve4:dns,requestBytes:async()=>response(Buffer.alloc(0),{location:"https://nasa.gov.evil.example/x"},307)}),/UNAPPROVED_PRIMARY_HOST/);
  await assert.rejects(Primary.fetchPrimaryDocument(one,{resolve4:dns,requestBytes:async()=>response(Buffer.from("x"),{"content-type":"text/plain"},404)}),/PRIMARY_HTTP_NOT_OK/);
  await assert.rejects(Primary.fetchPrimaryDocument({kind:"secondary",url:one.url}),/SOURCE_NOT_PRIMARY/);
});
