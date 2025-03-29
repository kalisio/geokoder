import _ from 'lodash'
import makeDebug from 'debug'

const debug = makeDebug('geokoder:utils')

export function filterSources (geocoders, filter) {
  let filters = filter.substring(2, filter.length - 1)
  filters = _.split(filters, '|')
  return _.reduce(geocoders, (matchingGeocoders, geocoder) => {
    if (filters.includes(geocoder.name)) matchingGeocoders.push(geocoder)
    return matchingGeocoders
  }, [])
}

export function long2tile (lon, zoom) {
  return (Math.floor((lon + 180) / 360 * Math.pow(2, zoom)))
}
export function lat2tile (lat, zoom) {
  return (Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, zoom)))
}
