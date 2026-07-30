import { describe, it, expect } from 'vitest'
import {
  FertilizerTiming,
  SunbeamTiming,
  UmbrellaTiming,
  AcidCloudTiming,
  ReducedMotionPreset,
  getMotionTiming,
} from './flower-battle-motion'

describe('flower-battle-motion', () => {
  describe('getMotionTiming', () => {
    describe('full motion (prefersReduced=false)', () => {
      it('returns FertilizerTiming for fertilizer', () => {
        const timing = getMotionTiming(false, 'fertilizer')
        expect(timing).toBe(FertilizerTiming)
        expect(timing.duration).toBe(520)
      })

      it('returns SunbeamTiming for sunbeam', () => {
        const timing = getMotionTiming(false, 'sunbeam')
        expect(timing).toBe(SunbeamTiming)
        expect(timing.duration).toBe(200)
      })

      it('returns UmbrellaTiming for umbrella', () => {
        const timing = getMotionTiming(false, 'umbrella')
        expect(timing).toBe(UmbrellaTiming)
        expect(timing.duration).toBe(300)
      })

      it('returns AcidCloudTiming for acidCloud', () => {
        const timing = getMotionTiming(false, 'acidCloud')
        expect(timing).toBe(AcidCloudTiming)
        expect(timing.duration).toBe(400)
      })
    })

    describe('reduced motion (prefersReduced=true)', () => {
      it('returns reduced fertilizer config', () => {
        const timing = getMotionTiming(true, 'fertilizer')
        expect(timing).toEqual(ReducedMotionPreset.fertilizer)
        expect(timing.duration).toBe(150)
      })

      it('returns reduced sunbeam config', () => {
        const timing = getMotionTiming(true, 'sunbeam')
        expect(timing).toEqual(ReducedMotionPreset.sunbeam)
        expect(timing.duration).toBe(100)
      })

      it('returns reduced umbrella config', () => {
        const timing = getMotionTiming(true, 'umbrella')
        expect(timing).toEqual(ReducedMotionPreset.umbrella)
        expect(timing.duration).toBe(100)
      })

      it('returns reduced acidCloud config', () => {
        const timing = getMotionTiming(true, 'acidCloud')
        expect(timing).toEqual(ReducedMotionPreset.acidCloud)
        expect(timing.duration).toBe(80)
      })
    })
  })

  describe('FertilizerTiming', () => {
    it('has full duration 520ms', () => {
      expect(FertilizerTiming.duration).toBe(520)
    })

    it('has reduced duration 150ms', () => {
      expect(FertilizerTiming.reduced.duration).toBe(150)
    })

    it('reduced duration is less than full duration', () => {
      expect(FertilizerTiming.reduced.duration).toBeLessThan(
        FertilizerTiming.duration,
      )
    })
  })

  describe('SunbeamTiming', () => {
    it('has full duration 200ms', () => {
      expect(SunbeamTiming.duration).toBe(200)
    })

    it('has reduced duration 100ms', () => {
      expect(SunbeamTiming.reduced.duration).toBe(100)
    })

    it('reduced duration is less than full duration', () => {
      expect(SunbeamTiming.reduced.duration).toBeLessThan(
        SunbeamTiming.duration,
      )
    })

    describe('rayStartMs', () => {
      it('returns correct offsets for ray indices 0-4', () => {
        // hardcoded literal values from source: [600, 630, 660, 690, 720]
        expect(SunbeamTiming.rayStartMs(0)).toBe(600)
        expect(SunbeamTiming.rayStartMs(1)).toBe(630)
        expect(SunbeamTiming.rayStartMs(2)).toBe(660)
        expect(SunbeamTiming.rayStartMs(3)).toBe(690)
        expect(SunbeamTiming.rayStartMs(4)).toBe(720)
      })

      it('falls back to first offset (600) for out-of-range indices', () => {
        expect(SunbeamTiming.rayStartMs(5)).toBe(600)
        expect(SunbeamTiming.rayStartMs(99)).toBe(600)
        expect(SunbeamTiming.rayStartMs(-1)).toBe(600)
      })
    })

    describe('reduced.rayStartMs', () => {
      it('returns 0 for reduced motion', () => {
        expect(SunbeamTiming.reduced.rayStartMs()).toBe(0)
      })
    })
  })

  describe('UmbrellaTiming', () => {
    it('has full duration 300ms', () => {
      expect(UmbrellaTiming.duration).toBe(300)
    })

    it('has reduced duration 100ms', () => {
      expect(UmbrellaTiming.reduced.duration).toBe(100)
    })

    it('reduced duration is less than full duration', () => {
      expect(UmbrellaTiming.reduced.duration).toBeLessThan(
        UmbrellaTiming.duration,
      )
    })
  })

  describe('AcidCloudTiming', () => {
    it('has full duration 400ms', () => {
      expect(AcidCloudTiming.duration).toBe(400)
    })

    it('has reduced duration 80ms', () => {
      expect(AcidCloudTiming.reduced.duration).toBe(80)
    })

    it('reduced duration is less than full duration', () => {
      expect(AcidCloudTiming.reduced.duration).toBeLessThan(
        AcidCloudTiming.duration,
      )
    })

    describe('dropletStartMs', () => {
      it('returns correct staggered offsets for droplet indices 0-6', () => {
        // hardcoded literal values from source: [120, 160, 200, 240, 280, 320, 360]
        expect(AcidCloudTiming.dropletStartMs(0)).toBe(120)
        expect(AcidCloudTiming.dropletStartMs(1)).toBe(160)
        expect(AcidCloudTiming.dropletStartMs(2)).toBe(200)
        expect(AcidCloudTiming.dropletStartMs(3)).toBe(240)
        expect(AcidCloudTiming.dropletStartMs(4)).toBe(280)
        expect(AcidCloudTiming.dropletStartMs(5)).toBe(320)
        expect(AcidCloudTiming.dropletStartMs(6)).toBe(360)
      })
    })

    describe('reduced.dropletStartMs', () => {
      it('returns 80 for reduced motion', () => {
        expect(AcidCloudTiming.reduced.dropletStartMs()).toBe(80)
      })
    })
  })

  describe('ReducedMotionPreset', () => {
    it('fertilizer preset equals FertilizerTiming.reduced', () => {
      expect(ReducedMotionPreset.fertilizer).toEqual(FertilizerTiming.reduced)
    })

    it('sunbeam preset equals SunbeamTiming.reduced', () => {
      expect(ReducedMotionPreset.sunbeam).toEqual(SunbeamTiming.reduced)
    })

    it('umbrella preset equals UmbrellaTiming.reduced', () => {
      expect(ReducedMotionPreset.umbrella).toEqual(UmbrellaTiming.reduced)
    })

    it('acidCloud preset equals AcidCloudTiming.reduced', () => {
      expect(ReducedMotionPreset.acidCloud).toEqual(AcidCloudTiming.reduced)
    })
  })
})
