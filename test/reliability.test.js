"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const http=require("node:http");
const fs=require("node:fs"), vm=require("node:vm"), path=require("node:path");
const {postInternal,projectFor,resolveProject}=serverHarness({realInternal:true}).ctx;
test("PHP must explicitly confirm application success",async()=>{
 for(const body of ['{"ok":true}','{"success":true}','{"ok":true,"already_processed":true}']){
  const r=await postInternal("https://internal.invalid","test","invoice_paid",{}, {fetchImpl:async()=>({ok:true,text:async()=>body})});assert.ok(r.ok||r.success);
 }
 for(const body of ['{"ok":false}','{"success":false}','<html>maintenance</html>','', 'null','[]','{}','{"ok":1}','{"ok":"true"}','{"ok":true,"success":false}']){
  await assert.rejects(postInternal("https://internal.invalid","test","invoice_paid",{}, {fetchImpl:async()=>({ok:true,text:async()=>body})}));
 }
 await assert.rejects(postInternal("https://internal.invalid","test","invoice_paid",{}, {fetchImpl:async()=>({ok:false,status:504})}));
 await assert.rejects(postInternal("https://internal.invalid","test","invoice_paid",{}, {fetchImpl:async()=>{throw Error("connection lost")}}));
});
test("real HTTP abort covers response headers, body stalls and redirects",async()=>{
 const server=http.createServer((req,res)=>{
  if(req.url==="/redirect"){res.writeHead(302,{Location:"/success"});res.end();}
  if(req.url==="/body"){res.writeHead(200,{"Content-Type":"application/json"});res.write('{"ok":');}
  if(req.url==="/success"){res.end('{"ok":true}');}
 });
 await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
 const url="http://127.0.0.1:"+server.address().port;
 try{
  for(const suffix of ["/headers","/body","/redirect"])await assert.rejects(postInternal(url+suffix,"test","invoice_paid",{}, {timeoutMs:100}));
  assert.deepEqual(await postInternal(url+"/success","test","invoice_paid",{}),{ok:true});
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
test("project routing preserves Tarot, shops, white labels and legacy metadata",async()=>{
 assert.equal(projectFor({shop_id:"tarot"}),"tarot");
 assert.equal(projectFor({shop_id:"42"}),"kash");
 assert.equal(projectFor({white_label_id:"12",billing_type:"white_label"}),"kash");
 assert.equal(projectFor({shop_id:"tarot",white_label_id:"12"}),null);
 const route=await resolveProject({stripe_subscription_id:"sub_test"},async()=>({metadata:{shop_id:"42"}}));
 assert.equal(route.project,"kash");
 const tarot=await resolveProject({stripe_subscription_id:"sub_test"},async()=>({metadata:{user_id:"12"},items:{data:[{price:{id:"price_tarot"}}]}}),"price_tarot");
 assert.equal(tarot.project,"tarot");
 await assert.rejects(resolveProject({},async()=>({})));
 await assert.rejects(resolveProject({shop_id:"unknown",stripe_subscription_id:"sub_bad"},async()=>({metadata:{}})));
});
function serverHarness(options={}){
 const routes=new Map(), posts=[];
 const app={use(){},post(p,...handlers){routes.set(p,handlers);},get(){},listen(){}};
 const express=()=>app;express.json=express.raw=()=>()=>{};
 const subscription={id:"sub_test",customer:"cus_test",status:"active",metadata:{shop_id:"tarot",user_id:"42"},items:{data:[{id:"si_test",price:{id:"price_tarot"},quantity:1,current_period_start:100,current_period_end:200}]}};
 const stripe={webhooks:{constructEvent:()=>options.event},subscriptions:{retrieve:async()=>{if(options.stripeError)throw Error("stripe unavailable");return subscription;}}};
 const ctx={
  require(name){
   if(name==="express")return express;if(name==="cors")return ()=>()=>{};if(name==="dotenv")return {config(){}};
   if(name==="stripe")return function(){return stripe};
   throw Error("Unexpected dependency "+name);
  },
  process:{env:{STRIPE_SECRET_KEY:"fake",STRIPE_WEBHOOK_SECRET:"fake",TAROT_INTERNAL_API_URL:"https://tarot.invalid",TAROT_INTERNAL_API_KEY:"fake",KASH_INTERNAL_API_URL:"https://kash.invalid",KASH_INTERNAL_API_KEY:"fake",TAROT_VIP_STRIPE_PRICE_ID:"price_tarot",INTERNAL_API_SECRET:"test"}},
  console:{log(){},error(){}},Buffer,setTimeout,clearTimeout,AbortController,fetch,JSON
 };
 vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(__dirname,"../server.js"),"utf8"),ctx);
 if(!options.realInternal) ctx.postInternal=async(...args)=>{posts.push(args);if(options.phpError)throw Error("PHP unavailable");return {ok:true};};
 return {ctx,routes,posts};
}
test("actual failed-invoice handler sends Tarot identity to Tarot",async()=>{
 const h=serverHarness();await h.ctx.handleInvoicePaymentFailed({id:"in_test",parent:{subscription_details:{subscription:"sub_test"}},lines:{data:[]}}, {id:"evt_test",created:123,type:"invoice.payment_failed"});
 assert.equal(h.posts.length,1);assert.equal(h.posts[0][0],"https://tarot.invalid");assert.equal(h.posts[0][3].user_id,"42");assert.equal(h.posts[0][3].stripe_event_id,"evt_test");
});
test("actual webhook acknowledges only successful PHP handling",async()=>{
 for(const phpError of [false,true]){
  const h=serverHarness({phpError,event:{id:"evt_test",created:123,type:"invoice.payment_failed",data:{object:{id:"in_test",subscription:"sub_test",lines:{data:[]}}}}});
  const handlers=h.routes.get("/stripe/webhook");assert.ok(handlers);
  let status=200;const res={status(n){status=n;return this;},json(){return this;},send(){return this;}};
  await handlers.at(-1)({headers:{"stripe-signature":"fake"},body:Buffer.from("{}")},res);
  assert.equal(status,phpError?500:200);
 }
});
test("canonical subscription endpoint reports lookup failure as retryable",async()=>{
 const h=serverHarness({stripeError:true});const handlers=h.routes.get("/stripe/subscription-state");let status=200;const res={status(n){status=n;return this;},json(){return this;}};
 await handlers.at(-1)({body:{stripe_subscription_id:"sub_test"}},res);assert.equal(status,503);
});
