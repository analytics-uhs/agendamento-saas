import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import * as crypto from "node:crypto";
import ts from "typescript";
import * as React from "react";
import * as jsx from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import * as fields from "../components/ui/field";
import * as invites from "./business-invites";
import * as catalog from "./product-catalog";
import * as businessForm from "./business-form";
import * as signupRules from "./auth/signup";

function load<T>(path: string, deps: Record<string, unknown>, globals = {}) {
  const exports = {};
  const code = ts.transpileModule(readFileSync(path,"utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
  runInNewContext(code, { exports, Error, process: { env: { NODE_ENV: "production" } }, URL, ...globals, require(id: string) {
    if (id === "server-only") return {};
    if (!(id in deps)) throw Error(`Unexpected dependency ${id}`);
    return deps[id];
  } });
  return exports as T;
}
function cookieFixture() {
  const values = new Map<string,string>(); let options: Record<string,unknown> = {};
  const session = load<typeof import("./auth/invite-session")>("src/lib/auth/invite-session.ts", {
    "node:crypto": crypto,
    "next/headers": { cookies: async () => ({ get: (name:string) => values.has(name) ? { value:values.get(name) } : undefined,
      set: (name:string,value:string,input:Record<string,unknown>) => { values.set(name,value); options=input; }, delete: (name:string) => values.delete(name) }) },
  });
  return { session, values, options: () => options };
}
const ui = { react: React, "react/jsx-runtime": jsx, "@/components/ui/button": { Button }, "@/components/ui/card": { Card }, "@/components/ui/field": fields };
const redirect = (path:string): never => { throw Error(`REDIRECT:${path}`); };

test("Google uses SSR PKCE callback, preserves invitation and never accepts it during OAuth", async()=>{
  const {session}=cookieFixture(); let valid=true; const calls:unknown[]=[];
  const actions=load<typeof import("../app/auth/google-actions")>("src/app/auth/google-actions.ts",{
    "next/headers":{headers:async()=>new Headers({origin:"https://agenda.uhsanalytics.com.br"})},
    "next/navigation":{redirect},"@/lib/auth/invite-session":session,
    "@/lib/repositories/business-invites":{inspectBusinessInvite:async()=>({status:valid?"pending":"expired"})},
    "@/lib/supabase/server":{createClient:async()=>({auth:{signInWithOAuth:async(input:unknown)=>{calls.push(input);return {data:{url:"https://provider.example/oauth"},error:null};}}})},
  });
  const token=session.newInviteToken();
  await assert.rejects(actions.loginWithGoogle(token,{message:null}),/REDIRECT:https:\/\/provider.example/);
  assert.equal(await session.pendingInviteToken(),token);
  assert.equal(JSON.stringify(calls[0]),JSON.stringify({provider:"google",options:{redirectTo:"https://agenda.uhsanalytics.com.br/auth/callback"}}));
  assert.ok(!JSON.stringify(calls).includes(token));
  valid=false;assert.match((await actions.loginWithGoogle(token,{message:null})).message!,/convite/);assert.equal(calls.length,1);
  await assert.rejects(actions.loginWithGoogle(null,{message:null}),/REDIRECT/);assert.equal(await session.pendingInviteToken(),token);
});

test("OAuth callback exchanges code and uses destination for invite and all self-service roles",async()=>{
  let destination="/convite";let fail=false;
  const callback=load<typeof import("../app/auth/callback/route")>("src/app/auth/callback/route.ts",{
    "next/server":{NextResponse:{redirect:(url:URL)=>url.pathname}},
    "@/lib/auth/destination":{resolveUserDestination:async()=>destination},
    "@/lib/supabase/server":{createClient:async()=>({auth:{exchangeCodeForSession:async(code:string)=>{assert.equal(code,"test-code");return {data:{user:{id:"u"}},error:fail?{}:null};}}})},
  });
  const request={url:"https://agenda.uhsanalytics.com.br/auth/callback?code=test-code",nextUrl:new URL("https://agenda.uhsanalytics.com.br/auth/callback?code=test-code")};
  for(destination of ["/convite","/super-admin","/admin","/onboarding"])assert.equal(await callback.GET(request as Parameters<typeof callback.GET>[0]),destination);
  fail=true;assert.equal(await callback.GET(request as Parameters<typeof callback.GET>[0]),"/login");
});

test("invite credential is random, SHA256-only, and preserved in a short HttpOnly secure cookie", async () => {
  const f = cookieFixture(); const token = f.session.newInviteToken(); const other = f.session.newInviteToken();
  assert.match(token,/^[a-f0-9]{64}$/); assert.notEqual(token,other);
  assert.equal(f.session.hashInviteToken(token),crypto.createHash("sha256").update(token).digest("hex"));
  assert.notEqual(f.session.hashInviteToken(token),token);
  assert.throws(()=>f.session.hashInviteToken("bad"));
  await f.session.rememberInvite(token); assert.equal(await f.session.pendingInviteToken(),token);
  assert.equal(f.options().httpOnly,true); assert.equal(f.options().secure,true); assert.equal(f.options().sameSite,"lax"); assert.equal(f.options().maxAge,3600);
  await f.session.clearInvite(); assert.equal(await f.session.pendingInviteToken(),null);
});

test("platform generation sends only hash and revalidates authority for every operation", async () => {
  const { session } = cookieFixture(); let authorized=true, reads=0; const calls: { name:string; args: Record<string,unknown> }[]=[];
  const repo=load<typeof import("./repositories/business-invites")>("src/lib/repositories/business-invites.ts", {
    "@/lib/supabase/server": { createClient: async()=>({ rpc:async(name:string,args:Record<string,unknown>)=>{calls.push({name,args});return {data:{status:"preparation",owner:null,invite:null},error:null};} }) },
    "@/lib/auth/platform-admin": { requirePlatformAdmin:async()=>{reads++;if(!authorized)throw Error("DENIED");} },
    "@/lib/auth/invite-session":session,"@/lib/product-catalog":catalog,"@/lib/business-form":businessForm,
  });
  const id="be700000-0000-4000-8000-000000000001";
  const link=await repo.generateBusinessInvite(id); const token=link.split("/").at(-1)!;
  assert.equal(calls[0].args.p_token_hash,session.hashInviteToken(token)); assert.ok(!JSON.stringify(calls).includes(token));
  await repo.getBusinessAccess(id); await repo.revokeBusinessInvite(id); assert.equal(reads,3);
  authorized=false; await assert.rejects(repo.generateBusinessInvite(id),/DENIED/); await assert.rejects(repo.revokeBusinessInvite(id),/DENIED/);
  assert.equal(calls.length,3);
});

test("public inspection ignores malformed credentials and acceptance requires server session", async () => {
  const {session}=cookieFixture(); let calls=0;
  const repo=load<typeof import("./repositories/business-invites")>("src/lib/repositories/business-invites.ts", {
    "@/lib/supabase/server":{createClient:async()=>({auth:{getUser:async()=>({data:{user:null},error:null})},rpc:async()=>{calls++;return {data:{status:"invalid"},error:null};}})},
    "@/lib/auth/platform-admin":{},"@/lib/auth/invite-session":session,"@/lib/product-catalog":catalog,"@/lib/business-form":businessForm,
  });
  assert.equal((await repo.inspectBusinessInvite("invalid")).status,"invalid"); assert.equal(calls,0);
  await assert.rejects(repo.acceptBusinessInvite(session.newInviteToken()),/authentication_required/); assert.equal(calls,0);
});

test("configuration is explicit, platform-checked, and leaves regular current business unchanged", async()=>{
  let allowed=true, rpcCalls=0;
  const context=load<typeof import("./auth/configuration-business")>("src/lib/auth/configuration-business.ts", {
    "@/lib/auth/platform-admin":{requirePlatformAdmin:async()=>{if(!allowed)throw Error("DENIED");}},
    "@/lib/repositories/businesses":{requireCurrentBusiness:async()=>({id:"OWN"})},
    "@/lib/product-catalog":catalog,
    "@/lib/supabase/server":{createClient:async()=>({rpc:async(_name:string,args:{p_business_id:string})=>{rpcCalls++;return {data:{id:args.p_business_id},error:null};}})},
  });
  assert.equal((await context.requireConfigurationBusiness()).id,"OWN"); assert.equal(rpcCalls,0);
  assert.equal((await context.requireConfigurationBusiness("be700000-0000-4000-8000-000000000001")).id,"be700000-0000-4000-8000-000000000001");
  allowed=false;await assert.rejects(context.requireConfigurationBusiness("be700000-0000-4000-8000-000000000002"),/DENIED/);assert.equal(rpcCalls,1);
});

test("auth destination returns to invite; after acceptance it uses membership without onboarding",async()=>{
  let token:string|null="pending",member:unknown=null;
  const destination=load<typeof import("./auth/destination")>("src/lib/auth/destination.ts",{
    "@/lib/auth/invite-session":{pendingInviteToken:async()=>token},"@/lib/supabase/server":{},
    "@/lib/repositories/businesses":{getCurrentBusiness:async()=>member},"@/lib/repositories/super-admin":{isPlatformAdmin:async()=>false},
  });
  assert.equal(await destination.resolveUserDestination("user"),"/convite");
  token=null;member={id:"provisioned"};assert.equal(await destination.resolveUserDestination("user"),"/admin");
  member=null;assert.equal(await destination.resolveUserDestination("user"),"/onboarding");
});

test("signup uses immediate session and refuses invite acceptance when session is absent",async()=>{
  let hasSession=true,invite=true, resolved=0;
  const actions=load<typeof import("../app/criar-conta/actions")>("src/app/criar-conta/actions.ts",{
    "next/headers":{headers:async()=>new Headers({origin:"https://example.test"})},"next/navigation":{redirect},
    "@/lib/auth/destination":{resolveUserDestination:async()=>{resolved++;return invite?"/convite":"/onboarding";}},
    "@/lib/auth/signup":signupRules,"@/lib/auth/invite-session":{pendingInviteToken:async()=>invite?"token":null},
    "@/lib/supabase/server":{createClient:async()=>({auth:{signUp:async()=>({data:{user:{id:"u",identities:[{id:"identity"}]},session:hasSession?{user:{id:"u"}}:null},error:null})}})},
  });
  const form=new FormData();form.set("name","Cliente Teste");form.set("email","test@example.test");form.set("password","SafeTest123!");form.set("confirmPassword","SafeTest123!");
  const state={status:"idle" as const,message:null,fieldErrors:{},values:{name:"",email:""},emailAlreadyExists:false,attempt:0};
  await assert.rejects(actions.signup(state,form),/REDIRECT:\/convite/);assert.equal(resolved,1);
  hasSession=false;const noSession=await actions.signup(state,form);assert.equal(noSession.status,"error");assert.match(noSession.message!,/sessão/);assert.equal(resolved,1);
  invite=false;assert.equal((await actions.signup(state,form)).status,"confirmation_required","self-service defensive fallback preserved");
});

test("existing account login returns to the invitation rather than user-supplied redirect",async()=>{
  const actions=load<typeof import("../app/auth/actions")>("src/app/auth/actions.ts",{
    "next/navigation":{redirect},"@/lib/auth/destination":{resolveUserDestination:async()=>"/convite"},"@/lib/auth/invite-session":{},
    "@/lib/supabase/server":{createClient:async()=>({auth:{signInWithPassword:async()=>({data:{user:{id:"u"}},error:null})}})},
  });
  const form=new FormData();form.set("email","test@example.test");form.set("password","SafeTest123!");form.set("next","https://evil.example");
  await assert.rejects(actions.login({message:null},form),/REDIRECT:\/convite/);
});

test("explicit confirmation consumes server cookie, clears it only on success and never calls onboarding",async()=>{
  let token:string|null="secret",accepted=0, fail=false;
  const actions=load<typeof import("../app/convite/actions")>("src/app/convite/actions.ts",{
    "next/navigation":{redirect},"next/cache":{revalidatePath(){}},"@/lib/business-invites":invites,"@/lib/supabase/server":{},
    "@/lib/auth/invite-session":{pendingInviteToken:async()=>token,clearInvite:async()=>{token=null;},rememberInvite:async()=>{}},
    "@/lib/repositories/business-invites":{acceptBusinessInvite:async(value:string)=>{assert.equal(value,"secret");if(fail)throw Error("invite_expired");accepted++;}},
  });
  fail=true;assert.match((await actions.confirmInvite({ok:false,message:""})).message,/expirou/);assert.equal(token,"secret");assert.equal(accepted,0);
  fail=false;await assert.rejects(actions.confirmInvite({ok:false,message:""}),/REDIRECT:\/convite\/pronto/);assert.equal(token,null);assert.equal(accepted,1);
});

test("invitation UI renders safe invalid states and both existing-auth entry points",()=>{
  const {BusinessInviteView}=load<typeof import("../components/auth/business-invite-view")>("src/components/auth/business-invite-view.tsx",{
    ...ui,"@/app/convite/actions":{beginInvite:async()=>{},leaveInvite:async()=>{},changeInviteAccount:async()=>{}},"@/lib/business-invites":invites,
    "@/components/auth/google-sign-in":{GoogleSignIn:()=>React.createElement("button",null,"Continuar com Google")},
    "@/components/auth/invite-confirmation":{InviteConfirmation:()=>React.createElement("button",null,"Confirmar acesso")},
  });
  for(const status of ["invalid","expired","revoked","accepted"] as const){const html=renderToStaticMarkup(React.createElement(BusinessInviteView,{invite:{status},authenticated:false}));assert.match(html,new RegExp(invites.inviteMessage[status]));assert.doesNotMatch(html,/Prepared A/);}
  const html=renderToStaticMarkup(React.createElement(BusinessInviteView,{invite:{status:"pending",businessName:"Prepared A"},authenticated:false,entryToken:"secret"}));assert.match(html,/Criar meu acesso/);assert.match(html,/Entrar/);assert.match(html,/Prepared A/);
  const authenticated=renderToStaticMarkup(React.createElement(BusinessInviteView,{invite:{status:"pending",businessName:"Prepared A"},authenticated:true}));assert.match(authenticated,/Confirmar acesso/);assert.doesNotMatch(authenticated,/Criar meu acesso/);
});

test("platform access UI shows preparation, waiting, dates and owner without recovering old link",()=>{
  const {BusinessAccessControl}=load<typeof import("../components/super-admin/business-access-control")>("src/components/super-admin/business-access-control.tsx",{...ui,"@/app/super-admin/provisioning-actions":{}});
  const props={businessId:"business",access:{status:"preparation" as const,owner:null,invite:null}};
  assert.match(renderToStaticMarkup(React.createElement(BusinessAccessControl,props)),/Preparação/);
  const waiting=renderToStaticMarkup(React.createElement(BusinessAccessControl,{...props,access:{status:"waiting",owner:null,invite:{status:"pending",createdAt:"2026-09-08T12:00:00Z",expiresAt:"2026-09-15T12:00:00Z"}}}));
  assert.match(waiting,/Aguardando acesso/);assert.match(waiting,/Gerar novo link/);assert.match(waiting,/Cancelar convite/);assert.doesNotMatch(waiting,/Link do convite gerado/);
  const active=renderToStaticMarkup(React.createElement(BusinessAccessControl,{...props,access:{status:"active",owner:{name:"Cliente",email:"client@example.test",since:"2026-09-08T12:00:00Z"},invite:null}}));assert.match(active,/Proprietário/);assert.doesNotMatch(active,/Gerar convite/);
});

test("provisioning UI asks no owner email/password and ready page routes to existing admin",async()=>{
  const {ProvisionBusinessForm}=load<typeof import("../components/super-admin/provision-business-form")>("src/components/super-admin/provision-business-form.tsx",{...ui,"@/app/super-admin/provisioning-actions":{provisionBusiness:async()=>{}}});
  const html=renderToStaticMarkup(React.createElement(ProvisionBusinessForm));assert.match(html,/Nome do negócio/);assert.match(html,/Link público/);assert.doesNotMatch(html,/type="password"|type="email"/);
  const ready=load<{default:()=>Promise<React.ReactElement>}>("src/app/convite/pronto/page.tsx",{...ui,"next/link":{default:({children,...p}:React.AnchorHTMLAttributes<HTMLAnchorElement>)=>React.createElement("a",p,children)},"@/lib/repositories/businesses":{requireCurrentBusiness:async()=>({name:"Preparado"})}});
  const result=renderToStaticMarkup(await ready.default());assert.match(result,/Preparado, seu negócio já está pronto/);assert.match(result,/Preparamos sua conta para você/);assert.match(result,/href="\/admin"/);
});

test("configuration reuses four incumbent forms and protects invite responses from caching/referrers",()=>{
  const page=readFileSync("src/app/super-admin/negocios/[businessId]/configurar/page.tsx","utf8");
  for(const component of ["BusinessPageContent","ScheduleConfiguration","BusinessHours","AppearancePageContent"])assert.match(page,new RegExp(`<${component}`));
  assert.match(page,/requireConfigurationBusiness\(businessId\)/);
  assert.match(readFileSync("next.config.ts","utf8"),/no-referrer/);assert.match(readFileSync("next.config.ts","utf8"),/private, no-store/);
  const sql=readFileSync("supabase/migrations/20260908010000_assisted_business_provisioning.sql","utf8");
  assert.match(sql,/business-acquisition:/);assert.match(sql,/for update/);assert.doesNotMatch(sql,/service_role.*grant/i);
});
