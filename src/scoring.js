import { distance } from '@turf/distance'

// https://github.com/richmilne/JaroWinkler/blob/master/jaro/strcmp95.c
// https://en.wikipedia.org/wiki/Jaro%E2%80%93Winkler_distance

function jaroSimilarity (s1, s2) {
  if (s1.length === 0 || s2.length === 0) { return 0 }

  if (s1 === s2) { return 1 }

  const range = Math.floor(Math.max(s1.length, s2.length) / 2) - 1
  const s1Flags = new Array(s1.length)
  const s2Flags = new Array(s2.length)
  // determine how many matching characters
  let m = 0
  for (let i = 0; i < s1.length; ++i) {
    const lo = Math.max(i - range, 0)
    const hi = Math.min(i + range, s2.length - 1)
    for (let j = lo; j <= hi; ++j) {
      if (s2Flags[j] !== 1 && s1[i] === s2[j]) {
        s1Flags[i] = s2Flags[j] = 1
        ++m
        break
      }
    }
  }

  if (m === 0) { return 0 }

  // determine how many transpositions
  let t = 0; let j = 0
  for (let i = 0; i < s1.length && j < s2.length; ++i) {
    if (s1Flags[i] !== 1) continue
    while (s2Flags[j] !== 1) ++j
    if (s1[i] !== s2[j]) ++t
    ++j
  }

  t = Math.floor(t / 2)

  return ((m / s1.length) + (m / s2.length) + ((m - t) / m)) / 3
}

function jaroWinklerSimilarity (s1, s2) {
  const jaro = jaroSimilarity(s1, s2)
  let prefix = 0
  for (let i = 0; i < s1.length && i < s2.length && prefix <= 4; ++i) {
    if (s1[i] !== s2[i]) break
    ++prefix
  }
  return jaro + (prefix * 0.1 * (1 - jaro))
}

export function sortAndLimitResults (results, limit) {
  // Sort based on computed score [0, 1] 1 is best
  results.sort((a, b) => {
    return a.geokoder.score < b.geokoder.score
      ? 1
      : a.geokoder.score > b.geokoder.score
        ? -1
        : 0
  })

  if (limit > 0)
    results.length = Math.min(results.length, limit)
}

export function scoreForwardResults (query, results) {
  // Compute a [0, 1] score based on string similarity 1 = best
  results.forEach((result) => {
    result.geokoder.score = jaroWinklerSimilarity(query.toUpperCase(), result.geokoder.match.toUpperCase())
  })
}

export function scoreReverseResults (queryLon, queryLat, results) {
  let maxDistance = 0
  let minDistance = Number.MAX_VALUE

  // First compute distance from result to query location
  results.forEach((result) => {
    const geometry = result.geometry
    if (geometry.type === 'Point') {
      result.geokoder.distance = distance([queryLon, queryLat], geometry.coordinates)
    } else {
      // TODO: doesn't handle other type of geomerty yet
      // @turf/point-to-line-distance and @turf/point-to-polygon-distance may help
      result.geokoder.distance = 0.0
    }

    // Keep track of min/max distance to compute relevance score [0, 1]
    maxDistance = Math.max(maxDistance, result.geokoder.distance)
    minDistance = Math.min(minDistance, result.geokoder.distance)
  })

  // Now compute score [0, 1] 1 is best => map between min and max distances
  const distanceDelta = maxDistance - minDistance
  results.forEach((result) => {
    result.geokoder.score = distanceDelta !== 0
      ? 1.0 - ((result.geokoder.distance - minDistance) / distanceDelta)
      : 1.0
  })
}
