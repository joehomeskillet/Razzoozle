import { EVENTS } from '@razzoozle/common/constants'
import Button from '@razzoozle/web/components/Button'
import { useSocket } from '@razzoozle/web/features/game/contexts/socket-context'
import { useManagerStore } from '@razzoozle/web/features/game/stores/manager'
import { SkipForward, Eye, Plus, Minus } from 'lucide-react'
import { useTranslation } from 'react-i18next'

/**
 * Host live-controls: skip question, reveal solution, adjust timer ±10s.
 * Server-auth-gated; shows error toast if rejected.
 */
export default function GameControlPanel() {
  const { socket } = useSocket()
  const { gameId } = useManagerStore()
  const { t } = useTranslation()

  return (
    <div className="flex items-center gap-2" data-testid="game-control-panel">
      <Button
        variant="secondary"
        size="sm"
        className="min-h-11"
        onClick={() => socket.emit(EVENTS.MANAGER.SKIP_QUESTION, { gameId: gameId ?? undefined })}
        title={t('game:controls.skipQuestion')}
        aria-label={t('game:controls.skipQuestion')}
      >
        <SkipForward className="size-5" aria-hidden />
        <span className="hidden sm:inline">{t('game:controls.skipQuestion')}</span>
      </Button>

      <Button
        variant="secondary"
        size="sm"
        className="min-h-11"
        onClick={() => socket.emit(EVENTS.MANAGER.REVEAL_ANSWER, { gameId: gameId ?? undefined })}
        title={t('game:controls.revealAnswer')}
        aria-label={t('game:controls.revealAnswer')}
      >
        <Eye className="size-5" aria-hidden />
        <span className="hidden sm:inline">{t('game:controls.revealAnswer')}</span>
      </Button>

      <div className="flex items-center gap-1">
        <Button
          variant="secondary"
          size="sm"
          className="min-h-11 px-3"
          onClick={() => socket.emit(EVENTS.MANAGER.ADJUST_TIMER, { gameId: gameId ?? undefined, deltaSeconds: -10 })}
          title={t('game:controls.subtractTime')}
          aria-label={t('game:controls.subtractTime')}
        >
          <Minus className="size-5" aria-hidden />
          <span className="hidden sm:inline">−10s</span>
        </Button>
        <Button
          variant="secondary"
          size="sm"
          className="min-h-11 px-3"
          onClick={() => socket.emit(EVENTS.MANAGER.ADJUST_TIMER, { gameId: gameId ?? undefined, deltaSeconds: 10 })}
          title={t('game:controls.addTime')}
          aria-label={t('game:controls.addTime')}
        >
          <Plus className="size-5" aria-hidden />
          <span className="hidden sm:inline">+10s</span>
        </Button>
      </div>
    </div>
  )
}
