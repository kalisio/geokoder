const path = require('path')

module.exports = {
  MBTiles: [
    { dataset: 'mairies', filepath: path.join(__dirname, '../data/mairies-z12.mbtiles'), layers: ['mairies'] },
    { dataset: 'epci', filepath: path.join(__dirname, '../data/epci-50m-z10.mbtiles'), layers: ['epci50m'] }
  ],
  renames: [
    { from: 'mairies:mairies', to: 'mairies' },
    { from: 'epci:epci50m', to: 'epci' }
  ]
}
