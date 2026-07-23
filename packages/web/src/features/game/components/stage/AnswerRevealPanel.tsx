import { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useGameAudience } from "@/features/game/hooks";
import { ANSWER_TILE_SURFACE } from "@/features/game/utils/answers";

export interface AnswerRevealPanelProps {
  title?: string;
  variant: "text" | "number" | "chips" | "tokenPos";
  text?: string;
  chips?: string[];
  tokenPos?: { token: string; pos: string }[];
  className?: string;
}

export function AnswerRevealPanel({
  title,
  variant,
  text,
  chips,
  tokenPos,
  className,
}: AnswerRevealPanelProps): ReactNode {
  const { t } = useTranslation();
  const audience = useGameAudience();

  const isPresenter = audience === "presenter";
  const baseClasses = `${ANSWER_TILE_SURFACE} p-[var(--game-space-4)] rounded-[var(--radius-theme)] ${className || ""}`.trim();
  const titleClasses = isPresenter ? "text-base" : "text-sm";
  const contentClasses = isPresenter
    ? "text-4xl md:text-5xl"
    : "text-2xl md:text-3xl";

  const displayTitle = title ?? t("game:reveal.correctAnswer");

  return (
    <div className={baseClasses}>
      {displayTitle && (
        <div
          className={`${titleClasses} opacity-70 font-medium mb-[var(--game-space-2)]`}
        >
          {displayTitle}
        </div>
      )}

      {variant === "text" && text && (
        <div className={`${contentClasses} font-semibold`}>{text}</div>
      )}

      {variant === "number" && text && (
        <div className={`${contentClasses} font-semibold tabular-nums`}>
          {text}
        </div>
      )}

      {variant === "chips" && chips && (
        <div className="flex flex-wrap gap-[var(--game-space-2)]">
          {chips.map((chip, idx) => (
            <div
              key={idx}
              className="min-h-11 px-3 py-2 bg-primary/10 border border-primary/20 rounded-[var(--radius-theme)] text-sm font-medium"
            >
              {chip}
            </div>
          ))}
        </div>
      )}

      {variant === "tokenPos" && tokenPos && (
        <div className="space-y-[var(--game-space-2)]">
          {tokenPos.map((pair, idx) => (
            <div key={idx} className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">{pair.token}</span>
              <span className="opacity-50">·</span>
              <span className="text-sm opacity-70">{pair.pos}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
