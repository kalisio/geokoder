// https://github.com/richmilne/JaroWinkler/blob/master/jaro/strcmp95.c
// https://en.wikipedia.org/wiki/Jaro%E2%80%93Winkler_distance

function jaroSimilarity (s1, s2) {
  if (s1.length === 0 || s2.length === 0)
    return 0

  if (s1 === s2)
    return 1

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

  if (m === 0)
    return 0

  // determine how many transpositions
  let t = 0, j = 0
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

export function scoreResult (needle, result) {
  return jaroWinklerSimilarity(needle, result)
}
