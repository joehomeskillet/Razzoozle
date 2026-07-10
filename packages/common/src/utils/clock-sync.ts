// Pure, dependency-free clock-offset math for low-latency mode (UI-only).
//
// The client measures several clock.ping/clock.pong round-trips, then derives a
// single offset between its own (monotonic) clock and the server wall clock.
// This offset is used ONLY to drive the question countdown / UI; it is NEVER an
// input to scoring (scoring is server-receive-authoritative). Keeping the math
// here makes it importable from both the web hook and node unit tests with no
// DOM / socket dependency.

// One completed round-trip sample.
export interface ClockSample {
  // Client monotonic clock (performance.now()) at send time.
  clientSendMonoMs: number
  // Client monotonic clock at the moment the matching pong was received.
  clientRecvMonoMs: number
  // Server wall clock (Date.now()) echoed in the pong.
  serverNowMs: number
}

// Estimated (serverWallClock - clientMonoClock) in ms. Add to a
// performance.now() reading to convert it to "server-now" wall-clock ms.
type ClockSyncResult = {
  // Estimated (serverWallClock - clientMonoClock) in ms. Add to a
  // performance.now() reading to convert it to "server-now" wall-clock ms.
  offsetMs: number
  // Round-trip time of the chosen / median sample, in ms.
  rttMs: number
  // How many samples survived outlier rejection and fed the median.
  sampleCount: number
}

// Per-sample offset using the standard NTP-style midpoint assumption:
//   offset = serverNow - (clientSend + rtt/2)
// i.e. we assume the server timestamp was taken at the round-trip midpoint.
const sampleOffset = (s: ClockSample): number => {
  const rtt = s.clientRecvMonoMs - s.clientSendMonoMs

  return s.serverNowMs - (s.clientSendMonoMs + rtt / 2)
}

const sampleRtt = (s: ClockSample): number =>
  s.clientRecvMonoMs - s.clientSendMonoMs

// Median of a numeric list. Empty list => 0 (caller guards before using).
export const median = (values: number[]): number => {
  if (!values || values.length === 0) {
    return 0
  }

  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)

  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid]
}

// Compute the clock offset from a batch of samples.
//
// Algorithm:
//  1. Drop samples with a non-finite / negative rtt (clock went backwards,
//     bad data) — these are never trustworthy.
//  2. Reject high-rtt outliers: any sample whose rtt exceeds the median rtt by
//     more than `outlierFactor` is discarded (a congested round-trip gives a
//     badly skewed midpoint estimate). At least one sample is always kept.
//  3. Take the MEDIAN of the surviving per-sample offsets (robust to the
//     remaining jitter) and report the median surviving rtt alongside it.
//
// Returns null when there is no usable sample at all (so the caller keeps the
// previous offset / falls back to local time instead of trusting garbage).
export const computeClockOffset = (
  samples: ClockSample[],
  outlierFactor = 1.5,
): ClockSyncResult | null => {
  const valid = (samples ?? []).filter((s) => {
    if (!s) {
      return false
    }

    const rtt = sampleRtt(s)

    return Number.isFinite(rtt) && rtt >= 0 && Number.isFinite(s.serverNowMs)
  })

  if (valid.length === 0) {
    return null
  }

  const rtts = valid.map(sampleRtt)
  const medianRtt = median(rtts)
  // Guard the threshold so a near-zero median rtt (very fast LAN) doesn't reject
  // everything; never let the cutoff fall below the median itself.
  const cutoff = Math.max(medianRtt * Math.max(outlierFactor, 1), medianRtt)

  let kept = valid.filter((s) => sampleRtt(s) <= cutoff)

  // Outlier rejection must never empty the set; fall back to all valid samples.
  if (kept.length === 0) {
    kept = valid
  }

  const offsets = kept.map(sampleOffset)
  const keptRtts = kept.map(sampleRtt)

  return {
    offsetMs: median(offsets),
    rttMs: median(keptRtts),
    sampleCount: kept.length,
  }
}
