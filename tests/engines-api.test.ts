import test from "node:test";
import assert from "node:assert/strict";
import {POST as render} from "../src/app/api/creative/render/route";
import {POST as audit} from "../src/app/api/ads/audit/route";
import {seedWorkspace} from "../src/lib/data/seed";
import {templateBrief} from "../src/lib/creative/templates";
import {buildComposition} from "../src/lib/creative/composition-builder";
const request=(body:unknown,auth=true)=>new Request("http://localhost/api/test",{method:"POST",headers:{"Content-Type":"application/json",...(auth?{Authorization:"Bearer test-user-token"}:{})},body:JSON.stringify(body)});
test("engine APIs reject unauthenticated calls before database access",async()=>{
 assert.equal((await render(request({},false))).status,401);
 assert.equal((await audit(request({},false))).status,401);
});
test("render API uses owned persisted snapshot and reuses active jobs",async(t)=>{
 process.env.NEXT_PUBLIC_SUPABASE_URL="https://database.example";process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="public-test";
 const w=seedWorkspace(),campaign=w.campaigns[0],business=w.businesses.find(b=>b.id===campaign.businessId)!;
 const brief=templateBrief("Service Promo",business,campaign);
 const creative={id:crypto.randomUUID(),businessId:business.id,campaignId:campaign.id,title:"Owned draft",concept:"",format:"Video",status:"Concept",studio:{brief,composition:buildComposition(business,campaign,brief),approval:"Draft"}};
 let inserted=0;let active=false;
 t.mock.method(globalThis,"fetch",async(input:RequestInfo|URL,init?:RequestInit)=>{
  const url=String(input);
  if(url.endsWith("/auth/v1/user"))return Response.json({id:crypto.randomUUID()});
  if(url.includes("/creatives?"))return Response.json([{payload:creative}]);
  if(init?.method==="POST") {inserted++;const row=JSON.parse(String(init.body));assert.deepEqual(row.composition,creative.studio.composition);active=true;return Response.json([{id:"job"}]);}
  return Response.json(active?[{id:"job"}]:[]);
 });
 assert.equal((await render(request({creativeId:creative.id}))).status,202);
 assert.equal((await render(request({creativeId:creative.id}))).status,200);
 assert.equal(inserted,1);
 assert.equal((await render(request({creativeId:creative.id,composition:"untrusted"}))).status,400);
});
test("audit rejects mismatched campaign and missing service config without sending data",async(t)=>{
 process.env.NEXT_PUBLIC_SUPABASE_URL="https://database.example";process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="public-test";
 delete process.env.ADS_ENGINE_URL;delete process.env.ADS_ENGINE_SECRET;
 t.mock.method(globalThis,"fetch",async(input:RequestInfo|URL)=>Response.json(String(input).endsWith("/auth/v1/user")?{id:crypto.randomUUID()}:String(input).includes("/businesses?")?[{id:crypto.randomUUID()}]:[]));
 assert.equal((await audit(request({businessId:crypto.randomUUID(),campaignId:crypto.randomUUID(),evidence:{}}))).status,400);
 assert.equal((await audit(request({businessId:crypto.randomUUID(),campaignId:null,evidence:{}}))).status,503);
});
