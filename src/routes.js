import _ from 'lodash'
import makeDebug from 'debug'

const debug = makeDebug('geokoder:routes')

function genRegex (needle) {
  const regex = [ '.*' ]
  for (const c of needle) {
    if ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z')) {
      regex.push(`[${c.toLowerCase()}${c.toUpperCase()}]`)
    } else if (c === '_' || c === ' ' || c === '-') {
      regex.push('[ _-]')
    } else {
      regex.push(c)
    }
  }
  regex.push('.*')
  return regex.join('')
}

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

function jaroWinklerDistance (s1, s2) {
  return 1 - jaroWinklerSimilarity(s1, s2)
}

function scoreResult (needle, result) {
  return jaroWinklerSimilarity(needle, result)
}

export default async function (app) {
  const geocoders = app.get('geocoders')
  const apiPath = app.get('apiPath')

  app.get('/forward/:name', async (req, res, next) => {
    try {
      const needle = _.get(req, 'params.name')
      // const needle = _.get(req, 'query.needle')
      if (!needle) {
        throw new Error('No needle to find')
      }

      const allRequests = []

      // issue requests to services
      for (const geocoder of geocoders) {
        let service
        try {
          service = app.service(`${apiPath}/${geocoder.collection}`)
        } catch(error) {
          // it's ok if service is not available, just skip it
          debug(`service ${geocoder.collection} not found`)
          continue
        }

        const query = {}
        // query[geocoder.key] = { $regex: genRegex(needle) }
        query[geocoder.key] = { $search: needle }
        const request = service.find({ query })
        request.geocoder = geocoder
        allRequests.push(request)
      }

      // fetch responses, score them and sort by score
      const response = []
      const results = await Promise.allSettled(allRequests)
      for (let i = 0; i < results.length; ++i) {
        const result = results[i]
        if (result.status !== 'fulfilled') {
          // skip failed requests
          debug(`request to ${geocoders[i].collection} failed: ${result.reason}`)
          continue
        }

        const geocoder = allRequests[i].geocoder
        const features = _.get(result.value, 'type') === 'FeatureCollection' ? result.value.features : [ result.value ]
        for (const feature of features) {
          const name = _.get(feature, geocoder.key)
          response.push({
            source: geocoder.name,
            name,
            location: feature.geometry.coordinates,
            score: scoreResult(needle.toUpperCase(), name.toUpperCase())
          })
        }
      }

      response.sort((a, b) => { return a.score < b.score ? 1 : a.score > b.score ? -1 : 0 })

      res.json(response)
    } catch(error) {
      next(error)
    }
  })

  app.get('/reverse', (req, res, next) => {
    const response = {
    }
    res.json(response)
  })
}
