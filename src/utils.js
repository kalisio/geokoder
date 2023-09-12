import makeDebug from 'debug'

const debug = makeDebug('geokoder:utils')

export function getMappedName (renames, internalName) {
  let regex = null
  const mapping = renames.find((item) => {
    if (!item.regex)
      return item.from === internalName

    const r = new RegExp(item.from)
    const m = internalName.match(r)
    if (m) regex = r
    debug(`match ${item.from} on ${internalName} yields ${m ? m.join(','): 'nothing'}`)
    return m != null
  })
  if (!mapping) return internalName
  return mapping.regex ? internalName.replace(regex, mapping.to) : mapping.to
}

export function long2tile(lon,zoom) {
  return (Math.floor((lon+180)/360*Math.pow(2,zoom)))
}
export function lat2tile(lat,zoom) {
  return (Math.floor((1-Math.log(Math.tan(lat*Math.PI/180) + 1/Math.cos(lat*Math.PI/180))/Math.PI)/2 *Math.pow(2,zoom)))
}
