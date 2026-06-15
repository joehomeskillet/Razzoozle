---
name: wm_rahoot-manager-config-ui-layout-primitives-alrea-a5b914
type: gotcha
author: tool
status: proposed
project: source
tags: working-memory,gotcha,rahoot,manager,ui,design-audit
created: 2026-06-15T13:26:40.376659+00:00
description: working-memory instant capture (quarantined until graduated)
---

Rahoot manager config UI: layout primitives already exist under packages/web/src/features/manager/components/console/ (StickyActions->ActionFooter, SectionCard, ListRow, Field, ColorSwatch(Field), AssetPreview(Card), contrast.ts=readableText, ConsoleShell) + components/ui/ (ActionFooter, FormSection, LabelRow, Button). Only 3 of 11 config tabs have a save footer: Theme, AI, Achievements. ActionFooter is the shared sticky footer (sticky -bottom-4/-6 + negative-margin bleed to cancel panel p-4/p-6, opaque bg-white). Design audits that propose NEW ActionBar/Field/TierHeading/MediaThumb are reinventing existing primitives -> reuse, don't rebuild.
