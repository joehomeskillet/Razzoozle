export interface GhostPlayerRecord {
  username: string
  avatar?: string
  answers: Array<{
    questionIndex: number
    answer: unknown
    timeMs: number
    pointsEarned: number
  }>
}

export interface LiveGhostState {
  username: string
  avatar?: string
  totalPoints: number
  hasAnsweredCurrent: boolean
}

export class GhostPlaybackEngine {
  private ghosts: GhostPlayerRecord[]
  private currentQuestionIndex = 0

  constructor(ghosts: GhostPlayerRecord[]) {
    this.ghosts = ghosts
  }

  public setQuestionIndex(index: number) {
    this.currentQuestionIndex = index
  }

  public getSnapshotAtTime(elapsedMs: number): LiveGhostState[] {
    return this.ghosts.map((ghost) => {
      // Accumulate points from previous questions
      let totalPoints = ghost.answers
        .filter((a) => a.questionIndex < this.currentQuestionIndex)
        .reduce((sum, a) => sum + a.pointsEarned, 0)

      // Check current question answer
      const currentAns = ghost.answers.find(
        (a) => a.questionIndex === this.currentQuestionIndex,
      )

      let hasAnsweredCurrent = false
      if (currentAns && elapsedMs >= currentAns.timeMs) {
        totalPoints += currentAns.pointsEarned
        hasAnsweredCurrent = true
      }

      return {
        username: ghost.username,
        avatar: ghost.avatar,
        totalPoints,
        hasAnsweredCurrent,
      }
    })
  }

  public getGhostCount(): number {
    return this.ghosts.length
  }
}
