import { expect, test, type Page } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { applyQuest, createQuest, cuisineQuest, questHint, type QuestAction } from "@platform/engines/cuisine-quest";
import { enterName } from "./helpers";

interface AudioProbe { contexts: number; active: number; effects: number; music: number }
declare global { interface Window { __cuisineAudio: () => AudioProbe } }

// Preserve action/network diagnostics and explicit screenshots without recording
// every animated frame/DOM snapshot throughout the full campaign.
test.use({ trace: { mode: "retain-on-failure", screenshots: false, snapshots: false, sources: false } });

async function openQuest(page: Page, name: string) {
  await page.goto("/play/cuisine-quest"); await enterName(page,name);
  await expect(page.getByTestId("cq-campaign")).toBeVisible();
  await expect(page.getByTestId("start-run")).toBeEnabled();
}
async function beginService(page: Page) {
  await expect(page.getByTestId("cuisine-quest")).toBeVisible();
  for (let i=0;i<3;i++) await page.getByTestId("cq-tutorial-next").click();
  await expect(page.getByTestId("cuisine-quest")).toHaveAttribute("data-paused","false");
}
/** Follows the public recipe coach using actual visible, accessible controls. */
async function playShift(page: Page) {
  const until = Date.now()+230_000;
  while (Date.now()<until && !(await page.getByTestId("solo-results").isVisible())) {
    const waiting = page.locator('.cq-ticket[data-status="waiting"]');
    if (!await waiting.count()) { await page.waitForTimeout(100); continue; }
    const active = page.locator('.cq-ticket-selected[data-status="waiting"]');
    if (!await active.count()) await waiting.first().click();
    const guide = page.getByTestId("cq-guide");
    const action = await guide.getAttribute("data-next-action");
    if (action === "ingredient") {
      const ingredient = await guide.getAttribute("data-next-ingredient"); const portions = Number(await guide.getAttribute("data-next-portions"));
      const portionButton = page.getByRole("button",{name:`${portions} portion${portions>1?"s":""}`,exact:true});
      if (await portionButton.isVisible()) await portionButton.click();
      await page.getByTestId(`cq-ingredient-${ingredient}`).click();
    } else if (action === "begin") await page.getByTestId("cq-begin").click();
    else if (action === "gesture") { await page.getByTestId("cq-follow-marker").click(); await page.waitForTimeout(155); }
    else if (action === "heat") await page.getByRole("button",{name:`Heat ${await guide.getAttribute("data-next-heat")}`,exact:true}).click();
    else if (action === "flip") await page.getByTestId("cq-flip").click();
    else if (action === "stir") await page.getByTestId("cq-stir").click();
    else if (action === "lift") await page.getByTestId("cq-lift").click();
    else if (action === "serve") {
      await page.getByRole("button",{name:`Finish: ${await guide.getAttribute("data-next-garnish")}`,exact:true}).click();
      await page.getByTestId("cq-serve").click();
    } else await page.waitForTimeout(100);
  }
  await expect(page.getByTestId("solo-results")).toBeVisible();
}
async function expectSaved(page: Page) {
  await expect(page.getByTestId("score-verified")).toContainText("saved");
  await expect(page.getByTestId("cq-verified-details")).toContainText("3/3 stars");
  return Number((await page.getByTestId("final-score").textContent())!.replaceAll(",",""));
}
async function checkStationBounds(page: Page, stage: string) {
  for(const width of [320,360,375,390,430,768,1280]) {
    const height = width < 500 ? 568 : 900;
    await page.setViewportSize({width,height});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
    const controls = await page.locator('.cq-station button').evaluateAll(buttons=>buttons.map(button=>{const r=button.getBoundingClientRect();return {name:button.textContent,x:r.x,right:r.right,bottom:r.bottom,height:r.height};}));
    for(const r of controls) {
      expect(r.x,`${stage} ${width}: ${r.name}`).toBeGreaterThanOrEqual(0);
      expect(r.right,`${stage} ${width}: ${r.name}`).toBeLessThanOrEqual(width);
      expect(r.bottom,`${stage} ${width}: ${r.name}`).toBeLessThanOrEqual(height);
      expect(r.height,`${stage} ${width}: ${r.name}`).toBeGreaterThanOrEqual(44);
    }
  }
}

test("Cuisine Quest: a real seven-cuisine campaign, replay improvement and saved-result recovery", async ({browser},testInfo) => {
  test.setTimeout(16*60_000);
  const context = await browser.newContext({viewport:{width:1280,height:900},extraHTTPHeaders:{"x-forwarded-for":"198.51.100.70"}});
  const page = await context.newPage(); const errors: string[] = []; page.on("pageerror",error=>errors.push(error.message));
  let submitted: {token:string;log:unknown[]} | null = null; let loseResponse = true;
  try {
    await openQuest(page,"PassportChef");
    await expect(page.getByTestId("cq-level-2")).toBeDisabled();
    const skip = await page.request.post("/api/solo/start",{headers:{origin:"http://localhost:3200"},data:{gameId:"cuisine-quest",config:{level:7}}}); expect(skip.status()).toBe(403);
    await page.route("**/api/solo/submit",async route=>{
      if (!loseResponse) return route.continue();
      submitted = route.request().postDataJSON();
      const response = await route.fetch(); expect(response.ok()).toBe(true); loseResponse = false;
      // The server really commits; only the response is lost.
      await route.abort("failed");
    });
    await page.getByTestId("start-run").click(); await beginService(page);
    for(let i=0;i<4;i++) await page.getByTestId("cq-ingredient-water").click();
    await playShift(page);
    await expect(page.getByTestId("cq-retry-save")).toBeVisible();
    await page.reload(); const initialScore = await expectSaved(page);
    const before = await (await page.request.get("/api/wallet")).json(); expect(before.balance).toBe(47);
    expect(submitted).not.toBeNull();
    const duplicate = await page.request.post("/api/solo/submit",{headers:{origin:"http://localhost:3200"},data:{...submitted!,score:999999}});
    expect(duplicate.status()).toBe(200); expect(await duplicate.json()).toMatchObject({alreadySaved:true,score:initialScore,earnedCoins:47});
    expect((await (await page.request.get("/api/wallet")).json()).balance).toBe(before.balance);
    await page.getByTestId("play-again").click(); await beginService(page); await playShift(page);
    const improved = await expectSaved(page); expect(improved).toBeGreaterThan(initialScore);
    expect((await (await page.request.get("/api/wallet")).json()).balance).toBe(55);
    await page.getByRole("button",{name:"Campaign map",exact:true}).click();
    await expect(page.getByTestId("cq-total-stars")).toHaveText("3 / 21");
    await expect(page.getByTestId("cq-level-2")).toBeEnabled();
    for(let level=2;level<=7;level++) {
      await page.getByTestId(`cq-level-${level}`).click(); await page.getByTestId("start-run").click();
      await beginService(page);
      if (level===3) { await page.getByRole("button",{name:"Pause kitchen",exact:true}).click(); await page.setViewportSize({width:390,height:812}); await page.getByTestId("cq-resume").click(); }
      await page.screenshot({path:testInfo.outputPath(`kitchen-${level}.png`)});
      await playShift(page); expect(await expectSaved(page)).toBeGreaterThanOrEqual(8500);
      if(level<7) { await page.getByRole("button",{name:"Campaign map",exact:true}).click(); await expect(page.getByTestId("cq-total-stars")).toHaveText(`${level*3} / 21`); await expect(page.getByTestId(`cq-level-${level+1}`)).toBeEnabled(); }
    }
    await expect(page.getByTestId("cq-verified-details")).toContainText("7/7 cuisines · 21/21 stars");
    await expect(page.getByText("Seven kitchens, one chef",{exact:true})).toBeVisible();
    const campaign = await (await page.request.get("/api/cuisine-quest/campaign")).json(); expect(campaign).toMatchObject({completed:7,totalStars:21,mastered:7});
    const wallet = await (await page.request.get("/api/wallet")).json(); expect(wallet.balance).toBe(80);
    const other = await browser.newContext({extraHTTPHeaders:{"x-forwarded-for":"198.51.100.72"}});
    try {
      await other.request.post("http://localhost:3200/api/session",{headers:{origin:"http://localhost:3200"},data:{displayName:"OtherPassport"}});
      expect((await other.request.post("http://localhost:3200/api/solo/submit",{headers:{origin:"http://localhost:3200"},data:submitted!})).status()).toBe(403);
    } finally {await other.close();}
    await page.goto("/profile"); await expect(page.getByTestId("cq-profile-progress")).toContainText("7/7 cuisines · 21/21 stars · 7 mastered");
    await expect(page.getByTestId("cq-profile")).toContainText("Recent cuisine runs");
    await page.screenshot({path:testInfo.outputPath("campaign-profile-mobile.png"),fullPage:true});
    await page.goto("/leaderboard?game=cuisine-quest&by=today"); await expect(page.getByTestId("leaderboard-table")).toContainText("PassportChef");
    const leaders = await (await page.request.get("/api/cuisine-quest/leaderboard?level=7")).json(); expect(leaders.entries.some((row:{name:string})=>row.name==="PassportChef")).toBe(true);
    expect(errors).toEqual([]);
  } finally {await context.close();}
});

test("Cuisine Quest: phone controls, pointer preparation, pause, audio settings and refresh recovery",async({browser},testInfo)=>{
  test.setTimeout(120000);
  const context = await browser.newContext({viewport:{width:320,height:568},hasTouch:true,isMobile:true,reducedMotion:"reduce",extraHTTPHeaders:{"x-forwarded-for":"198.51.100.71"}});
  const page = await context.newPage(); const errors:string[]=[]; page.on("pageerror",e=>errors.push(e.message));
  try {
    await openQuest(page,"TouchChef"); await page.getByTestId("start-run").click(); await beginService(page);
    await checkStationBounds(page,"pantry");
    await page.setViewportSize({width:375,height:667});
    for(const ingredient of ["rice","lentils","potato","spice"]) await page.getByTestId(`cq-ingredient-${ingredient}`).tap();
    await page.getByTestId("cq-begin").tap();
    for(let i=0;i<2;i++) {
      const marker=page.locator('.cq-marker-active');const b=(await marker.boundingBox())!;
      await page.touchscreen.tap(b.x+b.width/2,b.y+b.height/2);await page.waitForTimeout(160);
    }
    const pad=page.locator('.cq-pad'); await pad.focus(); await page.keyboard.press("Space"); await page.waitForTimeout(160); await page.keyboard.press("Space");
    await expect(page.getByTestId("cq-guide")).toHaveAttribute("data-next-action","begin");
    await page.getByRole("button",{name:"Pause kitchen",exact:true}).click();
    await expect(page.getByTestId("cuisine-quest")).toHaveAttribute("data-paused","true"); const time = await page.getByTestId("cuisine-quest").getAttribute("data-time");
    await page.waitForTimeout(800); expect(await page.getByTestId("cuisine-quest").getAttribute("data-time")).toBe(time);
    await page.getByRole("button",{name:"Settings",exact:true}).click();
    await expect(page.getByRole("slider",{name:"Effects volume",exact:true})).toBeVisible(); await expect(page.getByRole("slider",{name:"Music volume",exact:true})).toBeVisible();
    await page.getByRole("switch",{name:"Sound",exact:true}).click();
    await page.getByRole("button",{name:"Close",exact:true}).click();
    await page.reload(); await expect(page.getByTestId("cq-resume")).toBeVisible();
    await expect(page.getByRole("button",{name:"Unmute game",exact:true})).toBeVisible();
    await page.getByTestId("cq-resume").click();
    await expect(page.getByTestId("cq-guide")).toHaveAttribute("data-next-action","begin");
    await page.getByTestId("cq-begin").click();
    const b=(await page.locator('.cq-marker-active').boundingBox())!;await page.touchscreen.tap(b.x+b.width/2,b.y+b.height/2);await page.waitForTimeout(160);
    await page.screenshot({path:testInfo.outputPath("indian-touch-preparation.png")});
    await page.getByRole("button",{name:"Pause kitchen",exact:true}).click(); await checkStationBounds(page,"preparation");
    await page.setViewportSize({width:320,height:568}); await page.getByTestId("cq-resume").click();
    // Exercise an actual captured mouse drag through the remaining spatial markers.
    let marker=(await page.locator('.cq-marker-active').boundingBox())!;
    await page.mouse.move(marker.x+marker.width/2,marker.y+marker.height/2);await page.mouse.down();
    while(await page.getByTestId("cq-follow-marker").isVisible()) {
      marker=(await page.locator('.cq-marker-active').boundingBox())!;await page.waitForTimeout(165);
      await page.mouse.move(marker.x+marker.width/2,marker.y+marker.height/2,{steps:2});
    }
    await page.mouse.up();
    await expect(page.getByRole("button",{name:"Heat 3",exact:true})).toBeVisible();
    await page.getByRole("button",{name:"Pause kitchen",exact:true}).click(); await checkStationBounds(page,"cooking");
    await page.setViewportSize({width:320,height:568}); await page.getByTestId("cq-resume").click();
    await page.getByRole("button",{name:"Heat 3",exact:true}).click(); await page.getByTestId("cq-begin").click();
    const cookedBy=Date.now()+20000;
    while(Date.now()<cookedBy && await page.getByTestId("cq-guide").getAttribute("data-next-action")!=="serve") {
      const action=await page.getByTestId("cq-guide").getAttribute("data-next-action");
      if(action==="flip") await page.getByTestId("cq-flip").click();
      else if(action==="lift") await page.getByTestId("cq-lift").click();
      else if(action==="begin") await page.getByTestId("cq-begin").click();
      else if(action==="gesture") {await page.getByTestId("cq-follow-marker").click();await page.waitForTimeout(165);}
      else await page.waitForTimeout(100);
    }
    await expect(page.getByTestId("cq-serve")).toBeVisible();
    await page.getByRole("button",{name:"Pause kitchen",exact:true}).click();await checkStationBounds(page,"serving");
    await page.setViewportSize({width:320,height:568});await page.getByTestId("cq-resume").click();
    await page.screenshot({path:testInfo.outputPath("indian-plated-320.png")});
    await page.getByTestId("cq-serve").click(); await expect(page.getByTestId("cq-ticket-0")).toHaveAttribute("data-status","served");
    expect(await page.locator('.cq-steam').evaluateAll(elements=>elements.every(el=>getComputedStyle(el).animationName==="none"))).toBe(true);
    expect(errors).toEqual([]);
  }finally{await context.close();}
});

test("Cuisine Quest: future, malformed and forged logs fail; unavailable audio leaves controls usable",async({browser})=>{
  const context=await browser.newContext({extraHTTPHeaders:{"x-forwarded-for":"198.51.100.73"}});const page=await context.newPage();const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));
  await context.addInitScript(()=>{Object.defineProperty(window,"AudioContext",{configurable:true,value:class{constructor(){throw new Error("Audio unavailable in fixture");}}});});
  try {
    await openQuest(page,"QuietChef");
    const response=await page.request.post("/api/solo/start",{headers:{origin:"http://localhost:3200"},data:{gameId:"cuisine-quest",config:{level:1}}});expect(response.ok()).toBe(true);const run=await response.json();
    const state=createQuest(run.seed,{level:1});const log:QuestAction[]=[];let guard=0;
    while(!state.finished&&guard++<4000){const o=state.orders.find(o=>o.status==="waiting");const hint=o?questHint(state,o.id):null;const action:QuestAction=hint?.action?{...hint.action,t:state.t+160}:{kind:"wait",t:state.t+160};expect(applyQuest(state,action).ok).toBe(true);log.push(action);}
    log.push({kind:"finish",t:state.t});expect(cuisineQuest.verify(run.seed,{level:1},log).ok).toBe(true);
    const future=await page.request.post("/api/solo/submit",{headers:{origin:"http://localhost:3200"},data:{token:run.token,log,score:999999}});expect(future.status()).toBe(422);expect((await future.json()).error).toContain("faster than real time");
    const forged=await page.request.post("/api/solo/submit",{headers:{origin:"http://localhost:3200"},data:{token:run.token,log:[{kind:"finish",t:0,score:999999}]}});expect(forged.status()).toBe(400);
    const early=await page.request.post("/api/solo/submit",{headers:{origin:"http://localhost:3200"},data:{token:run.token,log:[{kind:"finish",t:0}]}});expect(early.status()).toBe(422);
    expect((await (await page.request.get("/api/cuisine-quest/campaign")).json()).totalStars).toBe(0);
    await page.getByTestId("start-run").click();await beginService(page);await page.getByTestId("cq-ingredient-rice").click();await expect(page.getByTestId("cq-guide")).toHaveAttribute("data-next-ingredient","lentils");expect(errors).toEqual([]);
  }finally{await context.close();}
});

test("Cuisine Quest: audio lifecycle, background pause and measured rendering",async({browser},testInfo)=>{
  const context=await browser.newContext({viewport:{width:1280,height:900},extraHTTPHeaders:{"x-forwarded-for":"198.51.100.74"}});
  await context.addInitScript(()=>{
    const Native=window.AudioContext;let contexts=0;const active=new Set<AudioScheduledSourceNode>();const gains:GainNode[]=[];
    const watch=<T extends AudioScheduledSourceNode>(source:T)=>{active.add(source);source.addEventListener("ended",()=>active.delete(source),{once:true});return source;};
    class ObservedAudio extends Native {
      constructor(){super();contexts++;}
      override createOscillator(){return watch(super.createOscillator());}
      override createBufferSource(){return watch(super.createBufferSource());}
      override createGain(){const gain=super.createGain();gains.push(gain);return gain;}
    }
    Object.defineProperty(window,"AudioContext",{configurable:true,value:ObservedAudio});
    window.__cuisineAudio=()=>({contexts,active:active.size,effects:gains[1]?.gain.value??0,music:gains[2]?.gain.value??0});
  });
  const page=await context.newPage();const errors:string[]=[];page.on("pageerror",error=>errors.push(error.message));
  try {
    await page.goto("/play/cuisine-quest");expect((await page.evaluate(()=>window.__cuisineAudio())).contexts).toBe(0);
    await enterName(page,"MeasuredChef");await expect(page.getByTestId("start-run")).toBeEnabled();await page.getByTestId("start-run").click();await beginService(page);
    await expect.poll(async()=>(await page.evaluate(()=>window.__cuisineAudio())).active).toBeGreaterThan(0);
    for(let i=0;i<3;i++) {
      await page.getByRole("button",{name:"Pause kitchen",exact:true}).click();
      await expect.poll(async()=>(await page.evaluate(()=>window.__cuisineAudio())).active).toBe(0);
      await page.getByTestId("cq-resume").click();await page.waitForTimeout(350);
      expect((await page.evaluate(()=>window.__cuisineAudio())).contexts).toBe(1);
    }
    await page.getByRole("button",{name:"Mute game",exact:true}).click();await page.waitForTimeout(800);
    const muted=await page.evaluate(()=>window.__cuisineAudio());expect(muted.effects).toBeLessThan(.001);expect(muted.music).toBeLessThan(.001);
    await page.getByRole("button",{name:"Unmute game",exact:true}).click();await page.waitForTimeout(300);
    const restored=await page.evaluate(()=>window.__cuisineAudio());expect(restored.effects).toBeGreaterThan(.1);expect(restored.music).toBeGreaterThan(.1);
    const metrics=await page.evaluate(async()=>{
      const times:number[]=[];const longTasks:number[]=[];
      const observer=new PerformanceObserver(list=>{for(const entry of list.getEntries())longTasks.push(entry.duration);});observer.observe({type:"longtask"});
      await new Promise<void>(resolve=>{let last=performance.now();const sample=(now:number)=>{times.push(now-last);last=now;if(times.length>=180)resolve();else requestAnimationFrame(sample);};requestAnimationFrame(sample);});observer.disconnect();
      const sorted=times.slice(1).sort((a,b)=>a-b);const resources=performance.getEntriesByType("resource") as PerformanceResourceTiming[];
      return {viewport:{width:innerWidth,height:innerHeight},gameNodes:document.querySelector('.cq-game')!.querySelectorAll('*').length,totalNodes:document.querySelectorAll('*').length,sampledFrames:sorted.length,frameIntervalMedianMs:sorted[Math.floor(sorted.length*.5)],frameIntervalP95Ms:sorted[Math.floor(sorted.length*.95)],longTasks,resourceCount:resources.length,transferredBytes:resources.reduce((n,r)=>n+r.transferSize,0),externalImages:resources.filter(r=>r.initiatorType==="img"&&new URL(r.name).origin!==location.origin).map(r=>new URL(r.name).hostname)};
    });
    expect(metrics.gameNodes).toBeLessThan(1500);expect(metrics.externalImages).toEqual([]);
    const measurementPath=testInfo.outputPath("rendering-and-audio.json");
    await writeFile(measurementPath,JSON.stringify({...metrics,audio:restored},null,2));
    await testInfo.attach("rendering-and-audio.json",{path:measurementPath,contentType:"application/json"});
    // Deliver the browser visibility event with hidden=true; freeze timers and audio.
    await page.evaluate(()=>{Object.defineProperty(document,"hidden",{configurable:true,value:true});document.dispatchEvent(new Event("visibilitychange"));});
    await expect(page.getByTestId("cuisine-quest")).toHaveAttribute("data-paused","true");const time=await page.getByTestId("cuisine-quest").getAttribute("data-time");
    await page.waitForTimeout(700);expect(await page.getByTestId("cuisine-quest").getAttribute("data-time")).toBe(time);expect((await page.evaluate(()=>window.__cuisineAudio())).active).toBe(0);
    await page.evaluate(()=>{Object.defineProperty(document,"hidden",{configurable:true,value:false});document.dispatchEvent(new Event("visibilitychange"));});
    await expect(page.getByTestId("cq-resume")).toBeVisible();
    await page.getByRole("button",{name:"Save and return to campaign",exact:true}).click();await expect(page.getByTestId("cq-campaign")).toBeVisible();
    expect(await page.evaluate(()=>document.body.style.overflow)).not.toBe("hidden");
    expect(errors).toEqual([]);
  }finally{await context.close();}
});
