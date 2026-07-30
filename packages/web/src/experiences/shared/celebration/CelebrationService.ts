import { dispatchCelebration } from "./ConfettiAdapter"
import type { CelebrationRequest } from "./celebration.types"

export class CelebrationService {
  private readonly revisions = new Map<string, number>()

  async dispatch(request: CelebrationRequest, reduced: boolean): Promise<void> {
    const revision = request.revision ?? 0
    const currentRevision = this.revisions.get(request.id)

    if (currentRevision !== undefined && revision <= currentRevision) return

    this.revisions.set(request.id, revision)
    await dispatchCelebration(request, reduced)
  }
}

export const celebrationService = new CelebrationService()
