import { useEffect, useRef } from "react"
import { useTranslation } from "react-i18next"
import {
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
} from "motion/react"

import gardenBedSvg from "@razzoozle/web/assets/experiences/flower-battle/optimized/fixed/garden-bed.svg?raw"
import gardenGroundSvg from "@razzoozle/web/assets/experiences/flower-battle/optimized/fixed/garden-ground.svg?raw"

import {
  ANCHOR_POSITIONS,
  buildFlowerPlantAriaLabel,
  clampGrowthStage,
  extractSvgInner,
  FLOWER_HEAD_PARTS,
  GROWTH_ANIMATION_DURATION_S,
  growthStageConfig,
  PART_CHOREOGRAPHY,
  type FlowerVariant,
  type PlantPartId,
  type PlantPartState,
  type TeamColorKey,
  REDUCED_MOTION_DURATION_S,
  resolvePlantPalette,
} from "./flower-plant.constants"

export interface FlowerPlantProps {
  growthStage?: number
  variant: FlowerVariant
  teamColor?: TeamColorKey
}

const gardenGroundInner = extractSvgInner(gardenGroundSvg)
const gardenBedInner = extractSvgInner(gardenBedSvg)

const partOrigin = (part: PlantPartId): string => {
  switch (part) {
    case "stem-lower":
      return `${ANCHOR_POSITIONS.stemLowerOrigin.x}px ${ANCHOR_POSITIONS.stemLowerOrigin.y}px`
    case "stem-upper":
      return `${ANCHOR_POSITIONS.stemUpperOrigin.x}px ${ANCHOR_POSITIONS.stemUpperOrigin.y}px`
    case "leaf-left-1":
      return `${ANCHOR_POSITIONS.leafLeft1.x}px ${ANCHOR_POSITIONS.leafLeft1.y}px`
    case "leaf-right-1":
      return `${ANCHOR_POSITIONS.leafRight1.x}px ${ANCHOR_POSITIONS.leafRight1.y}px`
    case "leaf-left-2":
      return `${ANCHOR_POSITIONS.leafLeft2.x}px ${ANCHOR_POSITIONS.leafLeft2.y}px`
    case "leaf-right-2":
      return `${ANCHOR_POSITIONS.leafRight2.x}px ${ANCHOR_POSITIONS.leafRight2.y}px`
    case "bud":
      return `${ANCHOR_POSITIONS.bud.x}px ${ANCHOR_POSITIONS.bud.y}px`
    case "petals":
    case "face":
      return `${ANCHOR_POSITIONS.petals.x}px ${ANCHOR_POSITIONS.petals.y}px`
    default:
      return "center"
  }
}

const usePartMotionValues = (initial: Record<PlantPartId, PlantPartState>) => {
  const stemLowerOpacity = useMotionValue(initial["stem-lower"].opacity)
  const stemLowerScale = useMotionValue(initial["stem-lower"].scale)
  const leafLeft1Opacity = useMotionValue(initial["leaf-left-1"].opacity)
  const leafLeft1Scale = useMotionValue(initial["leaf-left-1"].scale)
  const leafRight1Opacity = useMotionValue(initial["leaf-right-1"].opacity)
  const leafRight1Scale = useMotionValue(initial["leaf-right-1"].scale)
  const stemUpperOpacity = useMotionValue(initial["stem-upper"].opacity)
  const stemUpperScale = useMotionValue(initial["stem-upper"].scale)
  const leafLeft2Opacity = useMotionValue(initial["leaf-left-2"].opacity)
  const leafLeft2Scale = useMotionValue(initial["leaf-left-2"].scale)
  const leafRight2Opacity = useMotionValue(initial["leaf-right-2"].opacity)
  const leafRight2Scale = useMotionValue(initial["leaf-right-2"].scale)
  const budOpacity = useMotionValue(initial.bud.opacity)
  const budScale = useMotionValue(initial.bud.scale)
  const petalsOpacity = useMotionValue(initial.petals.opacity)
  const petalsScale = useMotionValue(initial.petals.scale)
  const faceOpacity = useMotionValue(initial.face.opacity)
  const faceScale = useMotionValue(initial.face.scale)

  return {
    "stem-lower": { opacity: stemLowerOpacity, scale: stemLowerScale },
    "leaf-left-1": { opacity: leafLeft1Opacity, scale: leafLeft1Scale },
    "leaf-right-1": { opacity: leafRight1Opacity, scale: leafRight1Scale },
    "stem-upper": { opacity: stemUpperOpacity, scale: stemUpperScale },
    "leaf-left-2": { opacity: leafLeft2Opacity, scale: leafLeft2Scale },
    "leaf-right-2": { opacity: leafRight2Opacity, scale: leafRight2Scale },
    bud: { opacity: budOpacity, scale: budScale },
    petals: { opacity: petalsOpacity, scale: petalsScale },
    face: { opacity: faceOpacity, scale: faceScale },
  } as const
}

export const FlowerPlant = ({
  growthStage,
  variant,
  teamColor,
}: FlowerPlantProps) => {
  const { t } = useTranslation("experience_hud")
  const reducedMotion = useReducedMotion()
  const stage = clampGrowthStage(growthStage)
  const config = growthStageConfig(stage)
  const palette = resolvePlantPalette(teamColor)
  const motionParts = usePartMotionValues(config.parts)
  const prevStageRef = useRef(stage)

  useEffect(() => {
    const fromStage = prevStageRef.current
    const target = growthStageConfig(stage).parts
    const duration = reducedMotion
      ? REDUCED_MOTION_DURATION_S
      : GROWTH_ANIMATION_DURATION_S
    const stagger = reducedMotion ? 0 : duration / PART_CHOREOGRAPHY.length

    if (fromStage === stage) {
      PART_CHOREOGRAPHY.forEach((partId) => {
        const partTarget = target[partId]
        motionParts[partId].opacity.set(partTarget.opacity)
        motionParts[partId].scale.set(partTarget.scale)
      })
      return
    }

    prevStageRef.current = stage

    const controls = PART_CHOREOGRAPHY.map((partId, index) => {
      const partTarget = target[partId]
      const values = motionParts[partId]
      return animate(values.opacity, partTarget.opacity, {
        duration,
        delay: index * stagger,
        ease: reducedMotion ? "linear" : [0.33, 1, 0.32, 1],
      }).then(() =>
        animate(values.scale, partTarget.scale, {
          duration: duration * 0.35,
          ease: reducedMotion ? "linear" : "easeOut",
        }),
      )
    })

    void Promise.all(controls)
  }, [stage, reducedMotion, motionParts])

  const ariaLabel = buildFlowerPlantAriaLabel(
    stage,
    prevStageRef.current,
    reducedMotion,
    t,
  )

  const flowerHead = FLOWER_HEAD_PARTS[variant]

  return (
    <svg
      viewBox="0 0 200 300"
      role="img"
      aria-label={ariaLabel}
      data-testid={`flower-plant-stage-${stage}`}
      data-variant={variant}
      data-growth-stage={stage}
      className="h-full w-full"
    >
      <g
        data-layer="garden-ground"
        dangerouslySetInnerHTML={{ __html: gardenGroundInner }}
      />
      <g
        data-layer="garden-bed"
        dangerouslySetInnerHTML={{ __html: gardenBedInner }}
      />

      <g id="plant-skeleton" data-layer="plant-skeleton">
        <motion.g
          id="stem-lower"
          data-anchor="stem-lower"
          data-part-opacity={config.parts["stem-lower"].opacity}
          style={{
            opacity: motionParts["stem-lower"].opacity,
            scale: motionParts["stem-lower"].scale,
            transformOrigin: partOrigin("stem-lower"),
          }}
        >
          <line
            x1={ANCHOR_POSITIONS.stemLowerOrigin.x}
            y1={ANCHOR_POSITIONS.stemLowerOrigin.y}
            x2={ANCHOR_POSITIONS.stemLowerTip.x}
            y2={ANCHOR_POSITIONS.stemLowerTip.y}
            stroke={palette.stem}
            strokeWidth={5}
            strokeLinecap="round"
          />
        </motion.g>

        <motion.g
          id="leaf-left-1"
          data-anchor="leaf-left-1"
          style={{
            opacity: motionParts["leaf-left-1"].opacity,
            scale: motionParts["leaf-left-1"].scale,
            transformOrigin: partOrigin("leaf-left-1"),
          }}
        >
          <ellipse
            cx={ANCHOR_POSITIONS.leafLeft1.x}
            cy={ANCHOR_POSITIONS.leafLeft1.y}
            rx={16}
            ry={9}
            fill={palette.leaf}
            transform={`rotate(-28 ${ANCHOR_POSITIONS.leafLeft1.x} ${ANCHOR_POSITIONS.leafLeft1.y})`}
          />
        </motion.g>

        <motion.g
          id="leaf-right-1"
          data-anchor="leaf-right-1"
          style={{
            opacity: motionParts["leaf-right-1"].opacity,
            scale: motionParts["leaf-right-1"].scale,
            transformOrigin: partOrigin("leaf-right-1"),
          }}
        >
          <ellipse
            cx={ANCHOR_POSITIONS.leafRight1.x}
            cy={ANCHOR_POSITIONS.leafRight1.y}
            rx={16}
            ry={9}
            fill={palette.leaf}
            transform={`rotate(24 ${ANCHOR_POSITIONS.leafRight1.x} ${ANCHOR_POSITIONS.leafRight1.y})`}
          />
        </motion.g>

        <motion.g
          id="stem-upper"
          data-anchor="stem-upper"
          style={{
            opacity: motionParts["stem-upper"].opacity,
            scale: motionParts["stem-upper"].scale,
            transformOrigin: partOrigin("stem-upper"),
          }}
        >
          <line
            x1={ANCHOR_POSITIONS.stemUpperOrigin.x}
            y1={ANCHOR_POSITIONS.stemUpperOrigin.y}
            x2={ANCHOR_POSITIONS.stemUpperTip.x}
            y2={ANCHOR_POSITIONS.stemUpperTip.y}
            stroke={palette.stem}
            strokeWidth={4}
            strokeLinecap="round"
          />
        </motion.g>

        <motion.g
          id="leaf-left-2"
          data-anchor="leaf-left-2"
          style={{
            opacity: motionParts["leaf-left-2"].opacity,
            scale: motionParts["leaf-left-2"].scale,
            transformOrigin: partOrigin("leaf-left-2"),
          }}
        >
          <ellipse
            cx={ANCHOR_POSITIONS.leafLeft2.x}
            cy={ANCHOR_POSITIONS.leafLeft2.y}
            rx={14}
            ry={8}
            fill={palette.leaf}
            transform={`rotate(-32 ${ANCHOR_POSITIONS.leafLeft2.x} ${ANCHOR_POSITIONS.leafLeft2.y})`}
          />
        </motion.g>

        <motion.g
          id="leaf-right-2"
          data-anchor="leaf-right-2"
          style={{
            opacity: motionParts["leaf-right-2"].opacity,
            scale: motionParts["leaf-right-2"].scale,
            transformOrigin: partOrigin("leaf-right-2"),
          }}
        >
          <ellipse
            cx={ANCHOR_POSITIONS.leafRight2.x}
            cy={ANCHOR_POSITIONS.leafRight2.y}
            rx={14}
            ry={8}
            fill={palette.leaf}
            transform={`rotate(30 ${ANCHOR_POSITIONS.leafRight2.x} ${ANCHOR_POSITIONS.leafRight2.y})`}
          />
        </motion.g>

        <motion.g
          id="bud"
          data-anchor="bud"
          style={{
            opacity: motionParts.bud.opacity,
            scale: motionParts.bud.scale,
            transformOrigin: partOrigin("bud"),
          }}
        >
          <ellipse
            cx={ANCHOR_POSITIONS.bud.x}
            cy={ANCHOR_POSITIONS.bud.y}
            rx={7}
            ry={9}
            fill={palette.bud}
          />
        </motion.g>

        <motion.g
          id="petals"
          data-anchor="petals"
          data-part-opacity={config.parts.petals.opacity}
          data-part-scale={config.parts.petals.scale}
          transform={`translate(${ANCHOR_POSITIONS.petals.x} ${ANCHOR_POSITIONS.petals.y})`}
          style={{
            opacity: motionParts.petals.opacity,
            scale: motionParts.petals.scale,
            transformOrigin: partOrigin("petals"),
            color: palette.petal,
          }}
          dangerouslySetInnerHTML={{ __html: flowerHead.petals }}
        />

        <motion.g
          id="face"
          data-anchor="face"
          data-part-opacity={config.parts.face.opacity}
          transform={`translate(${ANCHOR_POSITIONS.face.x} ${ANCHOR_POSITIONS.face.y})`}
          style={{
            opacity: motionParts.face.opacity,
            scale: motionParts.face.scale,
            transformOrigin: partOrigin("face"),
          }}
          dangerouslySetInnerHTML={{ __html: flowerHead.face }}
        />
      </g>

      <circle
        id="status-anchor"
        data-anchor="status-anchor"
        cx={ANCHOR_POSITIONS.status.x}
        cy={ANCHOR_POSITIONS.status.y}
        r={1}
        fill="none"
      />
    </svg>
  )
}
