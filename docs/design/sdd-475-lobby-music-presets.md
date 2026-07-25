# SDD #475: Lobby Music Presets

## 1. Overview
Provides a curated library of built-in lobby audio track presets (e.g. Upbeat, Chilled, Retro, Funk) selectable in Manager Theme settings.

## 2. Architecture & Data Structures
- **Preset Type**: `MusicPreset = 'classic' | 'upbeat' | 'funk' | 'retro' | 'chill' | 'none'`
- **Theme Store**: `theme.musicPreset: MusicPreset`

## 3. UI/UX Contract
- **Manager Theme Panel**: Audio preset grid picker with live audio preview play/stop buttons.
- **Player / Display**: Audio manager plays selected preset stream in lobby state.

## 4. Verification Gate
- Vitest suite: `MusicPresetPicker.test.tsx` (6 tests).
