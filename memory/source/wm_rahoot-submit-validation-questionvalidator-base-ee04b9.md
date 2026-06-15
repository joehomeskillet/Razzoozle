---
name: wm_rahoot-submit-validation-questionvalidator-base-ee04b9
type: gotcha
author: tool
status: proposed
project: source
tags: working-memory,gotcha,rahoot,validation,zod,submit
created: 2026-06-15T01:18:34.953368+00:00
description: working-memory instant capture (quarantined until graduated)
---

rahoot /submit validation: questionValidator base had .min(1) on solutions-union + acceptedAnswers, so an empty array (no correct answer marked, or acceptedAnswers:[] left from touching type-answer) threw Zod's RAW 'Too small: expected array >=1' BEFORE the friendly per-type superRefine. Fix: make base lenient (drop .min(1)), let superRefine own localized messages. Also questionMediaValidator.url was z.url() → rejected relative /media paths (AI-gen returns /media/gen-*.webp); now accepts http(s) OR /media|/theme (no ..). Shipped 989a185.
