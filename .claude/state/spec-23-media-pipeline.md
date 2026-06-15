# Spec — Issue #23: /submit Media Pipeline (Z-Image prompt-enhance + public upload + img2img edit)

Status: ready-for-implement-flood
Author: architect (synthesized from 6 parallel readers, all facts re-verified against source tree)
Repo: git.joelduss.xyz/agent-claude/rahoot — branch convention `feat/23-<wp-slug>`
Target page: PUBLIC `/submit` (`isManager={false}`), no auth.

This spec is implementable by external-CLI coders in isolated worktrees. NO `pnpm build` inside agents (host warms `source/`; gate centrally after merge). Each parallel WP touches a DISJOINT file set — see WP-DAG.

---

## 0. Scope & Decisions Summary

Three new public affordances on `/submit`, all inside the single component `QuestionEditorMedia.tsx`:
1. **WP-1 Prompt-enhance** — server-internal LLM rewrite of the raw image idea BEFORE `generateImage()`, reusing rahoot's configured text provider; graceful skip when provider is Off or fails. Optional UI preview event (DECISION: ship the preview event — small surface, matches the demo's A/B reveal, but enhance ALSO runs unconditionally inside GENERATE_IMAGE so preview is never required).
2. **WP-2 Public image upload** — new public, throttled, byte-capped, MIME-checked upload event. Does NOT reuse the auth-gated `MEDIA.UPLOAD`. Returns the same `{url}` shape as `IMAGE_GENERATED`.
3. **WP-3 img2img edit** — new public event `EDIT_IMAGE {baseUrl, prompt}`; server fetches the same-origin `/media/...` base, runs the Z-Image Omni reference-conditioning workflow, returns `{url}`. Gated by the EXACT same throttle stack as GENERATE_IMAGE.
4. **WP-4 i18n + polish** — 5-locale keys + tabbed media UX wiring assertions.

---

## 1. Architecture Decisions (with rationale)

### 1.1 img2img mechanism for Z-Image-Turbo

**DECISION: Z-Image reference-conditioning via `TextEncodeZImageOmni`, NOT classic VAEEncode+low-denoise, NOT ControlNet.**

Rationale: The task is "edit a photo by text", not structural (edge/pose) control. The Omni node VAE-encodes the reference image into `reference_latents` on the positive conditioning; KSampler still starts from an `EmptyLatentImage` with **denoise = 1.0**. This is the minimal correct Z-Image img2img, uses the SAME loaders (UNET `z_image_turbo_bf16`, VAE `ae`, CLIP `qwen_3_4b` type `qwen_image`) as the existing txt2img workflow → no extra VRAM model reloads between text2img and img2img. The ControlNet path (`ModelPatchLoader` + `QwenImageDiffsynthControlnet`) is heavier and wrong for this use case. The generic `img2img.json` on the host is SD1.5 — wrong model, do NOT use.

**GOTCHA (do NOT copy SD1.5 mental model):** Keep KSampler `denoise = 1.0`. Identity preservation comes from the Omni `reference_latents`, NOT from a low-denoise latent init. If a future "edit strength" slider is wanted, it controls Omni influence / prompt phrasing, NOT `KSampler.denoise`. Out of scope for #23 — ship without a strength slider.

**Base-image → ComfyUI transport (the container cannot write ComfyUI's input dir):**
Use ComfyUI's HTTP `POST /upload/image` (confirmed ComfyUI 0.18.1, `server.py:380-448`), exactly mirroring the existing `/view` and `/prompt` fetch pattern. Flow inside the new `generateImageFromBase()`:
1. Server already has the base image bytes as a server-controlled WebP buffer (see below — bytes come from a server-side fetch of `baseUrl`, NOT from the client).
2. Build multipart `FormData`: field `image` = the WebP buffer with a unique server-generated filename `edit-${nanoid(8)}.webp`, field `overwrite="true"` (we use a unique name so dedup-rename can't surprise us, but ALWAYS use the `name` returned by the endpoint).
3. `POST ${COMFYUI_URL}/upload/image` → JSON `{name, subfolder, type:"input"}`.
4. Set `LoadImage` node `.inputs.image = <returned name>` (NEVER the name you sent — endpoint may dedup-rename).
5. POST `/prompt`, poll `/history`, fetch `/view`, `toWebp()`, `saveGeneratedImageBytes(webp, gen-<nanoid>.webp)` — identical tail to `generateImage()`.

**Where the base bytes come from (CRITICAL — server-side fetch, per memory `auto_client-side-constraint-for-media`):**
The client sends only `baseUrl` (a relative `/media/...` path). The server resolves it to bytes by reading from disk via the existing media path helpers (preferred, avoids an HTTP round-trip) OR a same-origin fetch. **Use disk read**: `baseUrl` is `/media/<cat>/<file>` → strip `/media/` prefix → `assertSafeFilename` on the file segment → `mediaFilePath(cat, file)` → `fs.readFileSync`. This reuses the existing path-traversal stack and is SSRF-proof (no network fetch of attacker URL). Validate `baseUrl` with `/^\/media\//` regex first — reject absolute/external URLs (no `z.url()`).

**Workflow JSON shipping:**
**DECISION: commit a new workflow JSON INTO the repo** at `packages/socket/workflows/img2img-zimage.json` and add env `COMFYUI_IMG2IMG_WORKFLOW` (default → that bundled path), mirroring `COMFYUI_WORKFLOW`. Do NOT depend on the host path `/nvmetank1/AI/comfyui/workflows/sketch2img-zimage-turbo.json` (not bind-mounted into the container, not version-controlled with the app). Base the JSON on `sketch2img-zimage-turbo.json` but rename `filename_prefix` to `gen` and confirm node ids below.

**img2img workflow node constants (separate from txt2img — DO NOT assume txt2img ids transfer for the prompt field):**
```
IMG2IMG_PROMPT_NODE = "6"   // TextEncodeZImageOmni — set .inputs.prompt  (NOT .inputs.text!)
IMG2IMG_LOADIMAGE_NODE = "12" // LoadImage — set .inputs.image = uploaded name
IMG2IMG_SAMPLER_NODE = "3"  // KSampler — randomize .inputs.seed; keep denoise 1.0
IMG2IMG_SAVE_NODE = "9"     // SaveImage — history.outputs["9"].images[0].filename
```
Note: txt2img node 6 is `CLIPTextEncode` (`.inputs.text`); img2img node 6 is `TextEncodeZImageOmni` (`.inputs.prompt`). A shared generic that hardcodes `.inputs.text` will silently fail to set the img2img prompt. Keep `generateImageFromBase()` as a SEPARATE function with its own node constants. Reuse `POLL_INTERVAL_MS`, `POLL_TIMEOUT_MS`, the `/prompt`+`/history`+`/view` plumbing, `toWebp`, `saveGeneratedImageBytes`.

### 1.2 Prompt-enhance approach

**DECISION: reuse `generateText({system, prompt, maxTokens})` from `packages/socket/src/services/ai-provider.ts:186`.** It dispatches to the active text provider chosen in the KI tab (Off/Lokal-Ollama/Claude/OpenAI/OpenRouter), fetches keys server-side, runs `assertNoSecret` on output, supports keyless local hosts. Add a thin `enhancePrompt(rawIdea: string): Promise<string>` helper (new export in `ai-provider.ts`).

**Graceful skip (MANDATORY — enhancement must NEVER block image-gen):**
Wrap the `enhancePrompt()` call in the handler in try/catch. On ANY throw — provider Off (`generateText` throws `errors:ai.notConfigured` when `activeId === AI_PROVIDER_OFF`), timeout, 404 missing model (the seeded `llama3.2:3b` is NOT installed on this host; only `gemma3:12b`/`qwen2.5vl:7b`), secret-output rejection — fall back to the RAW user prompt and proceed to `generateImage`. Log nothing sensitive.

**System prompt (Z-Image, photographic, concise, on-brand):**
```
You rewrite a rough quiz-image idea into a single optimized prompt for Z-Image-Turbo.
Output ONLY the final prompt text: one natural-language paragraph, max 80 words, no quotes,
no markdown, no commentary. Start with a concise photographic style frame (clean, well-lit,
neutral studio or contextual setting, balanced composition, realistic). Describe subject +
setting + composition concisely. Do NOT add quality tags like masterpiece, best quality, 8k,
ultra-detailed, hyperrealistic. Keep it safe-for-work and suitable as a quiz question
illustration. The idea may be German; produce an English prompt.
```
Call with `json:false, maxTokens:150`. Z-Image-Turbo does NOT need quality tags — forbidding them is load-bearing.

**Wiring (server-internal before gen + optional UI preview):**
- In the GENERATE_IMAGE handler, immediately AFTER the secret-scan + throttle pass and BEFORE `const url = await generateImage(prompt)`: `const finalPrompt = await safeEnhance(prompt)` (try/catch wrapper → raw on failure). Re-run `SECRET_PATTERNS` on the enhanced string before passing it to `generateImage` (a model could echo a key-shaped token). Pass `finalPrompt` to `generateImage`.
- Optional preview: new public event `ENHANCE_PROMPT {prompt}` → handler runs the SAME throttle-lite guard (see 1.3) + secret-scan + `enhancePrompt` → emits `PROMPT_ENHANCED {prompt: enhanced}` (or `PROMPT_ENHANCED {prompt: raw}` on graceful-skip so the UI always gets a usable value). Does NOT call GPU.

**Scope:** socket-only. Do NOT touch the parallel `packages/mcp/src/{ai-provider,comfyui}.ts` copies in #23 (separate decision; out of scope).

### 1.3 #21 security reuse — EXACT functions/caps wrapping the new public handlers

All from `packages/socket/src/services/submissionRateLimit.ts` + the handler-local store in `manager.ts`. Key everything by `getClientId(socket)` (`manager.ts:43` = `handshake.auth.clientId ?? socket.id`). Do NOT key on `socket.id`. Do NOT add `socket.on("disconnect", clearRateLimit)` (that WAS the #21 reconnect-bypass — state self-expires by time window).

**WP-3 EDIT_IMAGE (GPU op) — reuse the EXACT GENERATE_IMAGE stack, SHARE the same `imageGenStore`:**
1. zod `editImageValidator` parse → on fail emit `IMAGE_ERROR "errors:submission.promptInvalid"`.
2. `SECRET_PATTERNS.some(re => re.test(prompt))` → `IMAGE_ERROR "errors:submission.promptRejected"`.
3. `clientId = getClientId(socket)`; `sweepImageGenStore(now)`; cooldown `IMAGE_GEN_COOLDOWN_MS=30_000` + lifetime `IMAGE_GEN_MAX_PER_SOCKET=5` against the **same** `imageGenStore` Map → `imageRateLimited` / `imageLimitReached`.
4. `checkImageGenHourlyLimit(clientId)` (durable 10/h, `IMAGE_GEN_MAX_PER_HOUR`) — consumed ONLY on dispatch path → `imageLimitReached`.
5. Increment `state.last/total` on the shared store, THEN dispatch.

**Sharing the store is MANDATORY** so a client can't get 5 text2img + 5 img2img + 10+10 hourly by using different event names. The `imageGenStore` Map, `sweepImageGenStore`, `IMAGE_GEN_*` consts, `getClientId`, `SECRET_PATTERNS` are all in `manager.ts` already — EDIT_IMAGE handler lives in the same module and references them directly.

**WP-2 public upload — replicate the SUBMIT_QUESTION guard order + ADD a byte cap (current GAP):**
1. `checkGlobalSubmissionRate()` FIRST (no per-user side effect) → `media:error` `errors:submission.rateLimited` (global ceiling 60/min).
2. `checkRateLimit(getClientId(socket))` (per-client 3/60s) → same shared submission budget as questions (intended for venue submit).
3. `publicUploadValidator.safeParse` (image-only dataUrl, filename ≤200) → `media:error` `errors:media.invalidDataUrl`.
4. **NEW byte cap** — decode base64, check `buffer.byteLength <= MEDIA_UPLOAD_MAX_BYTES` (new const, 8_000_000, matching the bg cap) → reject `errors:media.tooLarge`. This is the #21 GAP (`saveMediaFile`/`mediaUploadValidator` enforce NO size). Mirror `saveEphemeralAvatar`'s pre-webp check pattern.
5. `saveMediaFile(dataUrl, filename, "questions")` — the DEEP MIME allowlist (`MEDIA_IMAGE_MIME` png|jpeg|webp) + server-generated stored name (`normalizeMediaStem + nanoid + .webp`) + `assertSafeId`/`assertSafeFilename`/`mediaFilePath` path-traversal stack all already fire here. Client filename is NEVER used as the on-disk path.
6. emit `MEDIA.UPLOAD_SUCCESS`-equivalent → see contract: use a NEW public success event carrying `{url}` (do NOT reuse the auth-namespaced `MEDIA.UPLOAD_SUCCESS` which takes no payload).

**Public upload must NOT expose the manager library:** Do NOT de-auth `MEDIA.UPLOAD`/`MEDIA.LIST`/`MEDIA.DELETE`. They share the `MEDIA.*` namespace; de-authing UPLOAD would adjacently expose LIST (whole library) + DELETE (`{id}` only). Use the NEW event `SUBMIT_UPLOAD_IMAGE` with its own image-only validator + throttle. The library picker (`MediaPickerModal`, `MEDIA.LIST`) stays `isManager`-gated in the UI.

**WP-1 ENHANCE_PROMPT (LLM op, no GPU) — lightweight guard:**
1. zod `enhancePromptValidator` → `IMAGE_ERROR`/dedicated error on fail.
2. `SECRET_PATTERNS` scan → reject.
3. Per-client cooldown: reuse `checkRateLimit(getClientId(socket))` (shares the 3/60s submission budget — acceptable; an LLM call is cheap and the GPU path is the real cost) OR ride entirely inside GENERATE_IMAGE (server-internal, zero extra event). DECISION: server-internal enhancement is unconditional inside GENERATE_IMAGE (no extra guard needed — it rides the GPU throttle); the standalone ENHANCE_PROMPT preview event gets `checkGlobalSubmissionRate()` + `checkRateLimit(clientId)` so the preview can't be spammed as a free LLM vector.

### 1.4 WebP-only reuse

- Uploads: `saveMediaFile()` internally calls `toWebp(buffer)` for images → stores `.webp`. No change.
- img2img output: reuse `comfyui.ts` tail — `const webp = await toWebp(buffer); return saveGeneratedImageBytes(webp, gen-<nanoid>.webp)` → `/media/generated/<file>`, `source:"ai"`. Do NOT route already-WebP gen bytes through `saveMediaFile` (it would double-encode). Use `saveGeneratedImageBytes` (no re-encode), matching `generateImage()`.
- `toWebp` is `cwebp -q 82`, present in the socket container PATH (powers existing AI-gen + theme uploads). No change.

---

## 2. Contract Additions (exact constants + validators + typed map)

### 2.1 `packages/common/src/constants.ts` — add to `EVENTS.MANAGER` (after `IMAGE_ERROR`, line ~87)

```ts
    // #23 media pipeline (public, hard-throttled — mirrors GENERATE_IMAGE)
    EDIT_IMAGE: "manager:editImage",                 // C2S {baseUrl, prompt} -> reuses IMAGE_GENERATED/IMAGE_ERROR
    SUBMIT_UPLOAD_IMAGE: "manager:submitUploadImage", // C2S {filename, dataUrl} (public upload)
    UPLOAD_IMAGE_SUCCESS: "manager:uploadImageSuccess", // S2C {url}
    ENHANCE_PROMPT: "manager:enhancePrompt",         // C2S {prompt} (optional preview)
    PROMPT_ENHANCED: "manager:promptEnhanced",       // S2C {prompt}
```
(EDIT_IMAGE + SUBMIT_UPLOAD_IMAGE errors reuse `EVENTS.MANAGER.IMAGE_ERROR` (string i18n key). UPLOAD_IMAGE_SUCCESS is distinct from IMAGE_GENERATED only for client clarity; both carry `{url}` — implementers MAY reuse IMAGE_GENERATED for upload too, but a distinct event keeps the upload spinner state separate. SHIP the distinct event.)

Also add throttle/cap constant (new, in the AI block or near MEDIA constants):
```ts
export const MEDIA_UPLOAD_MAX_BYTES = 8_000_000 // 8 MB decoded cap for public /submit uploads
```

### 2.2 `packages/common/src/validators/media.ts` — add

```ts
export const editImageValidator = z.object({
  baseUrl: z.string().min(1).max(300).regex(/^\/media\//, "errors:media.invalidUrl"), // same-origin relative ONLY (anti-SSRF)
  prompt: z.string().min(1).max(PROMPT_MAX_LEN),
})

export const publicUploadValidator = z.object({
  filename: z.string().min(1).max(200),
  dataUrl: z.string().regex(/^data:image\//, "errors:media.invalidDataUrl"), // image-only, NO audio, NO category
})

export const enhancePromptValidator = z.object({
  prompt: z.string().min(1).max(PROMPT_MAX_LEN),
})
```
Import `PROMPT_MAX_LEN` from constants (export it if not already exported — it is currently a handler-local const in manager.ts; **either export `PROMPT_MAX_LEN` from constants.ts and import in both manager.ts + validators, OR inline `300` in the validator with a comment**. DECISION: move `PROMPT_MAX_LEN = 300` to `constants.ts` as an exported const, import it in `manager.ts` and `validators/media.ts` — single source. This is part of WP-0 / WP-Backend-Contract since constants.ts is shared.)

### 2.3 `packages/common/src/types/game/socket.ts` — typed maps (MANDATORY or events are inert)

ServerToClient (near IMAGE_ERROR, line ~178):
```ts
  [EVENTS.MANAGER.UPLOAD_IMAGE_SUCCESS]: (_data: { url: string }) => void
  [EVENTS.MANAGER.PROMPT_ENHANCED]: (_data: { prompt: string }) => void
  // EDIT_IMAGE + SUBMIT_UPLOAD_IMAGE success reuse IMAGE_GENERATED {url}; errors reuse IMAGE_ERROR (string)
```
ClientToServer (near GENERATE_IMAGE, line ~250):
```ts
  [EVENTS.MANAGER.EDIT_IMAGE]: (_payload: { baseUrl: string; prompt: string }) => void
  [EVENTS.MANAGER.SUBMIT_UPLOAD_IMAGE]: (_payload: { filename: string; dataUrl: string }) => void
  [EVENTS.MANAGER.ENHANCE_PROMPT]: (_payload: { prompt: string }) => void
```

---

## 3. WP-DAG (disjoint files per parallel WP)

### Serial sub-order for the shared contract (constants.ts + socket.ts are shared)

`constants.ts` and `socket.ts/game/socket.ts` are touched only by **WP-0 (Contract)**, which runs FIRST and ALONE. Everything else imports from it. This avoids the cross-WP collision the readers flagged.

```
WP-0 (Contract)  ──┬──► WP-1 (enhance svc + handler)  ┐
   [serial first]   ├──► WP-2 (upload handler)         ├─► run in PARALLEL (disjoint files)
                    ├──► WP-3 (comfyui img2img + handler)│
                    └──► WP-4 (client UI)               ┘
                                                         │
WP-5 (i18n)  ───────────────────────────────────────────┘ (parallel with all; own files)
```

Backend caveat: WP-1, WP-2, WP-3 ALL edit `packages/socket/src/handlers/manager.ts`. That is a COLLISION. Resolve by a **serial backend sub-order on manager.ts**, OR (PREFERRED) split the new handlers into a new file `packages/socket/src/handlers/submitMedia.ts` registered from the same place `manager.ts` is registered. DECISION: **WP-1/2/3 each add their handler to a NEW shared file `handlers/submitMedia.ts`** — but that file is then shared again. To keep WPs truly disjoint:

**FINAL FILE PARTITION (disjoint, no serial needed beyond WP-0):**
- WP-1 owns: `services/ai-provider.ts` (add `enhancePrompt`) + `handlers/submitMedia.enhance.ts` (new) 
- WP-2 owns: `handlers/submitMedia.upload.ts` (new) + `services/config.ts` byte-cap helper IF needed (saveMediaFile already exists; only add `MEDIA_UPLOAD_MAX_BYTES` check INSIDE the new handler, so config.ts is NOT touched → cleaner)
- WP-3 owns: `services/comfyui.ts` (add `generateImageFromBase`) + `packages/socket/workflows/img2img-zimage.json` (new) + `handlers/submitMedia.edit.ts` (new)
- WP-4 owns: `packages/web/src/features/quizz/components/QuestionEditor/QuestionEditorMedia.tsx` ONLY
- WP-5 owns: `packages/web/src/locales/{de,en,es,fr,it}/*.json`
- One tiny GLUE edit registers the three new handler files. Put the registration in WP-0's scope (it already owns the shared wiring): WP-0 also creates `handlers/submitMedia.ts` as a barrel that imports + calls `registerEnhanceHandlers/registerUploadHandlers/registerEditHandlers`, and wires it into the existing handler registration site (wherever `registerManagerHandlers` is called). Each WP exports its `register*Handlers(ctx)` from its own file; the barrel just calls them.

NOTE on shared `imageGenStore`: WP-3's EDIT_IMAGE must share the GENERATE_IMAGE throttle store which lives in `manager.ts`. To avoid WP-3 editing `manager.ts`, **WP-0 extracts the throttle store + guards into a new `handlers/imageGenThrottle.ts`** (`imageGenStore`, `sweepImageGenStore`, `IMAGE_GEN_*` consts, `tryConsumeImageGenCredit(clientId): {ok:boolean, errorKey?:string}`) and refactors `manager.ts` GENERATE_IMAGE to use it. Then WP-3 imports `tryConsumeImageGenCredit` — same store, no manager.ts collision. This refactor is WP-0 (shared) so it lands before the parallel WPs.

---

### WP-0 — Contract + shared throttle extraction + handler barrel [BACKEND] (SERIAL, FIRST)
Files (create/edit):
- EDIT `packages/common/src/constants.ts` — add 5 EVENTS.MANAGER entries; export `MEDIA_UPLOAD_MAX_BYTES`; move `PROMPT_MAX_LEN=300` to exported const.
- EDIT `packages/common/src/types/game/socket.ts` — add 2 S2C + 3 C2S typed entries.
- EDIT `packages/common/src/validators/media.ts` — add `editImageValidator`, `publicUploadValidator`, `enhancePromptValidator`.
- CREATE `packages/socket/src/handlers/imageGenThrottle.ts` — extract `imageGenStore`, `sweepImageGenStore`, `IMAGE_GEN_*`, `getClientId` (re-export or keep in manager + import), `SECRET_PATTERNS`, `tryConsumeImageGenCredit(clientId): {ok, errorKey?}`.
- EDIT `packages/socket/src/handlers/manager.ts` — import `PROMPT_MAX_LEN` from constants; refactor GENERATE_IMAGE to call `tryConsumeImageGenCredit` (behavior identical); ALSO add `enhancePrompt` server-internal call before `generateImage` (try/catch → raw fallback + re-secret-scan). [This is the ONLY manager.ts edit in the whole feature.]
- CREATE `packages/socket/src/handlers/submitMedia.ts` — barrel calling `registerEnhanceHandlers/registerUploadHandlers/registerEditHandlers`; wire into the existing handler registration site.
Acceptance: `tsc` clean (gate centrally); GENERATE_IMAGE behavior byte-identical (same throttle, same errors); new events typed in both maps; `tryConsumeImageGenCredit` exported; barrel registered.
Deps: none.

### WP-1 — Prompt-enhance service + handler [BACKEND] (parallel after WP-0)
Files:
- EDIT `packages/socket/src/services/ai-provider.ts` — add `export const enhancePrompt = (rawIdea: string): Promise<string>` calling `generateText({system: <1.2 prompt>, prompt: rawIdea, json: false, maxTokens: 150})`.
- CREATE `packages/socket/src/handlers/submitMedia.enhance.ts` — `registerEnhanceHandlers(ctx)` listening `ENHANCE_PROMPT`: `checkGlobalSubmissionRate()` + `checkRateLimit(getClientId)` + `enhancePromptValidator` + `SECRET_PATTERNS` → `enhancePrompt` in try/catch (graceful → emit `PROMPT_ENHANCED {prompt: raw}` on skip) → emit `PROMPT_ENHANCED {prompt: enhanced}`.
Acceptance: provider Off → emits `PROMPT_ENHANCED` with raw prompt (never errors out the path); enhanced output secret-scanned; maxTokens 150; no GPU call.
Deps: WP-0 (events, validator, getClientId/SECRET_PATTERNS from imageGenThrottle).
Note: the server-internal enhance inside GENERATE_IMAGE is in WP-0's manager.ts edit (uses WP-1's `enhancePrompt` — so WP-0's manager edit needs the import; if WP-1 hasn't landed, stub the import or land WP-1's ai-provider export as part of WP-0. DECISION: move `enhancePrompt` export into WP-0's scope to avoid the dep cycle; WP-1 then only owns the standalone ENHANCE_PROMPT handler file.) → **Revised: WP-1 owns ONLY `handlers/submitMedia.enhance.ts`; `enhancePrompt` in ai-provider.ts moves to WP-0.**

### WP-2 — Public upload handler [BACKEND] (parallel after WP-0)
Files:
- CREATE `packages/socket/src/handlers/submitMedia.upload.ts` — `registerUploadHandlers(ctx)` listening `SUBMIT_UPLOAD_IMAGE`: guard order per 1.3 (global rate → per-client rate → `publicUploadValidator` → decode base64 + `byteLength <= MEDIA_UPLOAD_MAX_BYTES` else `errors:media.tooLarge` → `saveMediaFile(dataUrl, filename, "questions")`) → emit `UPLOAD_IMAGE_SUCCESS {url: meta.url}`; errors → `IMAGE_ERROR` (string key).
Acceptance: oversize buffer rejected with `errors:media.tooLarge` BEFORE saveMediaFile; svg/external dataUrl rejected (deep MIME check in saveMediaFile); stored name server-generated `.webp`; NO MEDIA.* auth event used; clientId-keyed throttle.
Deps: WP-0.

### WP-3 — img2img service + workflow + handler [BACKEND] (parallel after WP-0)
Files:
- CREATE `packages/socket/workflows/img2img-zimage.json` — Z-Image Omni template (nodes per 1.1; `filename_prefix: "gen"`).
- EDIT `packages/socket/src/services/comfyui.ts` — add `export const generateImageFromBase = (baseBytes: Buffer, prompt: string): Promise<string>`: POST `/upload/image` (FormData field `image`, name `edit-<nanoid>.webp`) → use returned `name` on `IMG2IMG_LOADIMAGE_NODE.inputs.image`; set `IMG2IMG_PROMPT_NODE.inputs.prompt = prompt`; randomize `IMG2IMG_SAMPLER_NODE.inputs.seed`; load `COMFYUI_IMG2IMG_WORKFLOW`; reuse poll/`/view`/`toWebp`/`saveGeneratedImageBytes`. Add env `COMFYUI_IMG2IMG_WORKFLOW` default to the bundled path.
- CREATE `packages/socket/src/handlers/submitMedia.edit.ts` — `registerEditHandlers(ctx)` listening `EDIT_IMAGE`: `editImageValidator` (regex `^/media/`) → `SECRET_PATTERNS` on prompt → `tryConsumeImageGenCredit(getClientId)` (SHARED store) → resolve `baseUrl` to bytes via disk read (`/media/<cat>/<file>` → `assertSafeFilename` → `mediaFilePath` → `fs.readFileSync`) → `generateImageFromBase(bytes, finalPrompt)` (run `enhancePrompt` first, graceful) → emit `IMAGE_GENERATED {url}`; errors → `IMAGE_ERROR`.
Acceptance: img2img uses `.inputs.prompt` (not `.text`); denoise stays 1.0; base bytes resolved server-side from `/media/` path (no client blob, no external fetch); shares the GPU throttle store (5+10/h combined with text2img, NOT separate); output is `/media/generated/*.webp`; workflow JSON committed in repo.
Deps: WP-0. Empirically validate identity-preservation before merge.

### WP-4 — Client media UI [CLIENT] (parallel after WP-0)
Files:
- EDIT `packages/web/src/features/quizz/components/QuestionEditor/QuestionEditorMedia.tsx` ONLY.
Add (keep `isManager` gate on library picker UNTOUCHED; all new affordances are public/unconditional):
- **Upload**: hidden `<input type="file" accept="image/*">` + ref; `FileReader.readAsDataURL` → client-side size pre-check (≥ MEDIA_UPLOAD_MAX_BYTES → toast `errors:media.tooLarge`, no emit) → `socket.emit(EVENTS.MANAGER.SUBMIT_UPLOAD_IMAGE, {filename, dataUrl})`; `useEvent(UPLOAD_IMAGE_SUCCESS, ({url}) => updateQuestion(currentIndex, {media:{type:"image", url}}))`; state `uploading`.
- **Enhance-preview**: state `enhancedPrompt`, `enhancing`; button emits `ENHANCE_PROMPT {prompt: aiPrompt}`; `useEvent(PROMPT_ENHANCED, ({prompt}) => setEnhancedPrompt(prompt))`; render A/B block (raw vs enhanced) above Generate.
- **img2img edit**: only when `questionMedia?.type==="image" && questionMedia.url`; input `editPrompt` + button emits `EDIT_IMAGE {baseUrl: questionMedia.url, prompt: editPrompt}`; reuse `IMAGE_GENERATED`/`IMAGE_ERROR` listeners; state `editing`.
- All buttons `min-h-11` (44px), reduced-motion-safe, paper/purple idiom. Listeners close over latest `currentIndex` (useEvent re-binds on callback identity).
Acceptance: upload/enhance/edit work on PUBLIC `/submit`; library picker still `isManager`-gated; no MEDIA.* event used; before/after shown via server `/media` URL (no client canvas edit); raw key never shown (all via `t()`).
Deps: WP-0 (imports EVENTS + types).

### WP-5 — i18n [CLIENT] (parallel; own files) — see §4
Files: `packages/web/src/locales/{de,en,es,fr,it}/{quizz,submit,errors}.json`.
Deps: none (can run alongside; WP-4 references the keys but missing keys only surface as raw strings, not build break).

---

## 4. i18n — new string keys (t(key,{defaultValue}) pattern, all 5 locales de/en/es/fr/it)

German canonical: "du", warm, NO exclamation marks (Scandi convention).

`quizz.json` (under `question.media`):
- `question.media.uploadButton` — de "Bild hochladen"
- `question.media.uploading` — de "Wird hochgeladen"
- `question.media.tabUrl` — de "URL"
- `question.media.tabUpload` — de "Hochladen"
- `question.media.tabAi` — de "KI"
- `question.media.tabEdit` — de "Bearbeiten"
- `question.media.enhanceButton` — de "Vorschau verbessern"
- `question.media.enhancing` — de "Wird optimiert"
- `question.media.enhancedLabel` — de "So wird generiert"
- `question.media.rawLabel` — de "Deine Eingabe"
- `question.media.editPromptPlaceholder` — de "Beschreibe die Änderung am Bild"
- `question.media.editButton` — de "Bild per Text ändern"
- `question.media.editing` — de "Wird bearbeitet"

`errors.json` (under `media`):
- `errors:media.tooLarge` — de "Das Bild ist zu groß. Maximal 8 MB."
- `errors:media.invalidDataUrl` — de "Dieses Bildformat wird nicht unterstützt."
- `errors:media.invalidUrl` — de "Diese Bildquelle ist ungültig."

`submit.json` (optional caption labels, A/B reveal):
- `submit:media.enhanceHint` — de "Die KI verfeinert deine Beschreibung vor dem Generieren."

(Reuse existing `errors:submission.imageRateLimited / imageLimitReached / imageGenFailed / promptInvalid / promptRejected` for the GPU paths — already present in all 5 locales.)

---

## 5. Acceptance + Adversarial-Review Focus

Functional acceptance:
- Public `/submit`: upload an image → appears as question media (WebP, `/media/questions/*.webp`).
- Type a rough idea → "Vorschau verbessern" shows enhanced prompt → Generate uses it; with provider Off, Generate still works (raw prompt) and preview returns raw.
- With an image set, "Bild per Text ändern" → new image reflecting the edit (`/media/generated/*.webp`), identity reasonably preserved.
- Library picker invisible on `/submit`, visible for manager.

Adversarial review (block merge on any failure):
1. **Upload abuse / disk-fill**: oversize (>8MB decoded) rejected pre-save; non-image dataUrl rejected by deep MIME; per-client 3/60s + global 60/min enforced; consider follow-up storage-count cap (note: PENDING_QUEUE_CAP does NOT cover media disk).
2. **Path traversal**: `baseUrl` must match `^/media/`; file segment through `assertSafeFilename`/`mediaFilePath` (relative-containment); stored upload name server-generated only; ComfyUI LoadImage uses the endpoint-RETURNED name, never client input.
3. **GPU spam**: EDIT_IMAGE shares the SAME `imageGenStore` + `checkImageGenHourlyLimit` as GENERATE_IMAGE (combined 5/socket + 10/h, NOT per-event); consume-on-dispatch ordering preserved; no `disconnect` cleanup added.
4. **SSRF**: `baseUrl` resolved by DISK read, not network fetch; absolute/external URLs rejected by regex.
5. **Manager-lib leakage**: `MEDIA.UPLOAD/LIST/DELETE` NOT de-authed; new events are separate, image-only, no `category`, no `{id}` delete.
6. **Secret exfiltration**: prompt + enhanced output both run `SECRET_PATTERNS`; `generateText` also runs `assertNoSecret`.
7. **Migration safety**: no schema/manifest migration; new media flows through existing `saveMediaFile`/`saveGeneratedImageBytes` (existing MediaMeta shape); GENERATE_IMAGE refactor (throttle extraction) must be byte-identical — add a test asserting cooldown/lifetime/hourly behavior unchanged.
8. **Type-safety gate**: every new event present in BOTH socket.ts maps (else silently untyped).
9. **Container plumbing**: `COMFYUI_IMG2IMG_WORKFLOW` default resolves to the BUNDLED repo path inside the image (not the host `/nvmetank1/AI` path); confirm the workflow JSON ships in the built image.

Gate: central `pnpm -w typecheck` + socket vitest + web vitest AFTER merge (NO build in agents). Then E2E Playwright on `/submit`: upload, enhance-preview, img2img edit; verify throttle rejections; verify library picker absent.
