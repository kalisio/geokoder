const path = require('path')

module.exports = {
  providers: {
    NodeGeocoder: {
      opendatafrance: true,
      openstreetmap: true
    },
    Kano: {
      catalogFilter: '!filtered-*',
      services: {
        'teleray-stations': {
          featureLabel: ['properties.name']
        },
        'rte-units': {}  // default value is 'properties.name'
      }
    },
    MBTiles: {
      'mairies': { filepath: path.join(__dirname, '../data/mairies-z12.mbtiles'), layers: ['mairies'] },
      'epci': { filepath: path.join(__dirname, '../data/epci-50m-z10.mbtiles'), layers: ['epci50m'] },
      'carcassonne': { filepath: path.join(__dirname, '../data/admin-express-carcassonne-z0-z14.mbtiles'), layers: ['commune', 'departement'] },
    }
  }
}
