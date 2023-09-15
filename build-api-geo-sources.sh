#!/bin/bash
YEAR=${YEAR:-2023}
COMMUNES_ASSOCIEES_DELEGUEES=${COMMUNES_ASSOCIEES_DELEGUEES:-NO}

echo "Retrieve datasets"
wget -N -P . http://etalab-datasets.geo.data.gouv.fr/contours-administratifs/${YEAR}/geojson/communes-5m.geojson.gz
wget -N -P . http://etalab-datasets.geo.data.gouv.fr/contours-administratifs/${YEAR}/geojson/communes-50m.geojson.gz
if [ "$COMMUNES_ASSOCIEES_DELEGUEES" != "NO" ]; then
    wget -N -P . http://etalab-datasets.geo.data.gouv.fr/contours-administratifs/${YEAR}/geojson/communes-associees-deleguees-5m.geojson.gz
    wget -N -P . http://etalab-datasets.geo.data.gouv.fr/contours-administratifs/${YEAR}/geojson/communes-associees-deleguees-50m.geojson.gz
fi
wget -N -P . http://etalab-datasets.geo.data.gouv.fr/contours-administratifs/${YEAR}/geojson/mairies.geojson.gz
wget -N -P . http://etalab-datasets.geo.data.gouv.fr/contours-administratifs/${YEAR}/geojson/epci-5m.geojson.gz
wget -N -P . http://etalab-datasets.geo.data.gouv.fr/contours-administratifs/${YEAR}/geojson/epci-50m.geojson.gz
wget -N -P . http://etalab-datasets.geo.data.gouv.fr/contours-administratifs/${YEAR}/geojson/departements-5m.geojson.gz
wget -N -P . http://etalab-datasets.geo.data.gouv.fr/contours-administratifs/${YEAR}/geojson/departements-50m.geojson.gz
wget -N -P . http://etalab-datasets.geo.data.gouv.fr/contours-administratifs/${YEAR}/geojson/regions-5m.geojson.gz
wget -N -P . http://etalab-datasets.geo.data.gouv.fr/contours-administratifs/${YEAR}/geojson/regions-50m.geojson.gz
echo "Completed"

echo "Building mbtiles"
tippecanoe --force -o api-geo-50m.mbtiles -zg *50m.geojson.gz
tippecanoe --force -o api-geo-5m.mbtiles -zg *5m.geojson.gz
echo "Completed"