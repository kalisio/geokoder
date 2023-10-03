const path = require('path')

module.exports = {
  providers: {
    MBTiles: {
      'mairies': { filepath: path.join(__dirname, '../data/mairies-z12.mbtiles'), layers: ['mairies'] },
      'epci': { filepath: path.join(__dirname, '../data/epci-50m-z10.mbtiles'), layers: ['epci50m'] }
    }
  }
}
