import proj4 from '#proj4';

/**
 * Pre-compiled regional EPSG definitions for NAD83 US State Plane zones and UTM Zones 1-60.
 */
const STATE_PLANE_DEFS = {
  // California (US Survey Feet)
  'EPSG:2225':
    '+proj=lcc +lat_0=39.33333333333333 +lon_0=-122 +lat_1=41.66666666666666 +lat_2=40 +x_0=2000000.0001016 +y_0=500000.0001016 +datum=NAD83 +units=us-ft +no_defs',
  'EPSG:2226':
    '+proj=lcc +lat_0=37.66666666666666 +lon_0=-122 +lat_1=39.83333333333334 +lat_2=38.33333333333334 +x_0=2000000.0001016 +y_0=500000.0001016 +datum=NAD83 +units=us-ft +no_defs',
  'EPSG:2227':
    '+proj=lcc +lat_0=36.5 +lon_0=-120.5 +lat_1=38.43333333333333 +lat_2=37.06666666666667 +x_0=2000000.0001016 +y_0=500000.0001016 +datum=NAD83 +units=us-ft +no_defs',
  'EPSG:2228':
    '+proj=lcc +lat_0=35.33333333333333 +lon_0=-119 +lat_1=37.25 +lat_2=36 +x_0=2000000.0001016 +y_0=500000.0001016 +datum=NAD83 +units=us-ft +no_defs',
  'EPSG:2229':
    '+proj=lcc +lat_0=33.5 +lon_0=-118 +lat_1=35 +lat_2=34.03333333333333 +x_0=2000000.0001016 +y_0=500000.0001016 +datum=NAD83 +units=us-ft +no_defs',
  'EPSG:2230':
    '+proj=lcc +lat_0=32.16666666666666 +lon_0=-116.25 +lat_1=33.88333333333333 +lat_2=32.78333333333333 +x_0=2000000.0001016 +y_0=500000.0001016 +datum=NAD83 +units=us-ft +no_defs',

  // Colorado
  'EPSG:2231':
    '+proj=lcc +lat_0=39.33333333333333 +lon_0=-105.5 +lat_1=40.7 +lat_2=39.71666666666667 +x_0=914401.8288036576 +y_0=304800.6096012192 +datum=NAD83 +units=us-ft +no_defs',
  'EPSG:2232':
    '+proj=lcc +lat_0=37.83333333333334 +lon_0=-105.5 +lat_1=39.75 +lat_2=38.45 +x_0=914401.8288036576 +y_0=304800.6096012192 +datum=NAD83 +units=us-ft +no_defs',
  'EPSG:2233':
    '+proj=lcc +lat_0=36.66666666666666 +lon_0=-105.5 +lat_1=38.45 +lat_2=37.23333333333333 +x_0=914401.8288036576 +y_0=304800.6096012192 +datum=NAD83 +units=us-ft +no_defs',

  // Connecticut
  'EPSG:2234':
    '+proj=lcc +lat_0=40.83333333333334 +lon_0=-72.75 +lat_1=41.86666666666667 +lat_2=41.2 +x_0=304800.6096012192 +y_0=152400.3048006096 +datum=NAD83 +units=us-ft +no_defs',

  // Delaware
  'EPSG:2235':
    '+proj=tmerc +lat_0=38 +lon_0=-75.41666666666667 +k=0.999995 +x_0=200000.0001016 +y_0=0 +datum=NAD83 +units=us-ft +no_defs',

  // Florida
  'EPSG:2236':
    '+proj=tmerc +lat_0=24.33333333333333 +lon_0=-81 +k=0.9999411764705882 +x_0=200000 +y_0=0 +datum=NAD83 +units=us-ft +no_defs',
  'EPSG:2237':
    '+proj=tmerc +lat_0=24.33333333333333 +lon_0=-82 +k=0.9999411764705882 +x_0=200000 +y_0=0 +datum=NAD83 +units=us-ft +no_defs',
  'EPSG:2238':
    '+proj=lcc +lat_0=29 +lon_0=-84.5 +lat_1=30.75 +lat_2=29.58333333333333 +x_0=600000 +y_0=0 +datum=NAD83 +units=us-ft +no_defs',

  // Georgia
  'EPSG:2239':
    '+proj=tmerc +lat_0=30 +lon_0=-82.16666666666667 +k=0.9999 +x_0=200000 +y_0=0 +datum=NAD83 +units=us-ft +no_defs',
  'EPSG:2240':
    '+proj=tmerc +lat_0=30 +lon_0=-84.16666666666667 +k=0.9999 +x_0=700000 +y_0=0 +datum=NAD83 +units=us-ft +no_defs',

  // Idaho
  'EPSG:2241':
    '+proj=tmerc +lat_0=41.66666666666666 +lon_0=-112.1666666666667 +k=0.9999473684210526 +x_0=200000 +y_0=0 +datum=NAD83 +units=us-ft +no_defs',
  'EPSG:2242':
    '+proj=tmerc +lat_0=41.66666666666666 +lon_0=-114 +k=0.9999473684210526 +x_0=500000 +y_0=0 +datum=NAD83 +units=us-ft +no_defs',
  'EPSG:2243':
    '+proj=tmerc +lat_0=41.66666666666666 +lon_0=-115.75 +k=0.9999333333333333 +x_0=800000 +y_0=0 +datum=NAD83 +units=us-ft +no_defs',

  // Illinois
  'EPSG:3435':
    '+proj=tmerc +lat_0=36.66666666666666 +lon_0=-88.33333333333333 +k=0.9999666666666667 +x_0=300000 +y_0=0 +datum=NAD83 +units=us-ft +no_defs',
  'EPSG:3436':
    '+proj=tmerc +lat_0=36.66666666666666 +lon_0=-90.16666666666667 +k=0.9999411764705882 +x_0=700000 +y_0=0 +datum=NAD83 +units=us-ft +no_defs',

  // Indiana
  'EPSG:2965':
    '+proj=tmerc +lat_0=37.5 +lon_0=-85.66666666666667 +k=0.9999666666666667 +x_0=100000 +y_0=250000 +datum=NAD83 +units=us-ft +no_defs',
  'EPSG:2966':
    '+proj=tmerc +lat_0=37.5 +lon_0=-87.08333333333333 +k=0.9999666666666667 +x_0=900000 +y_0=250000 +datum=NAD83 +units=us-ft +no_defs',

  // Iowa
  'EPSG:3417':
    '+proj=lcc +lat_0=40.5 +lon_0=-93.5 +lat_1=43.03333333333333 +lat_2=42.06666666666667 +x_0=1500000 +y_0=1000000 +datum=NAD83 +units=us-ft +no_defs',
  'EPSG:3418':
    '+proj=lcc +lat_0=40 +lon_0=-93.5 +lat_1=41.78333333333333 +lat_2=40.61666666666667 +x_0=500000 +y_0=0 +datum=NAD83 +units=us-ft +no_defs',

  // Kansas
  'EPSG:3419':
    '+proj=lcc +lat_0=38.33333333333333 +lon_0=-98 +lat_1=39.78333333333333 +lat_2=38.71666666666667 +x_0=400000 +y_0=0 +datum=NAD83 +units=us-ft +no_defs',
  'EPSG:3420':
    '+proj=lcc +lat_0=36.66666666666666 +lon_0=-98.5 +lat_1=38.56666666666667 +lat_2=37.26666666666667 +x_0=400000 +y_0=0 +datum=NAD83 +units=us-ft +no_defs',

  // Kentucky
  'EPSG:2205':
    '+proj=lcc +lat_0=36.33333333333333 +lon_0=-85.75 +lat_1=38.66666666666666 +lat_2=37.08333333333334 +x_0=1500000 +y_0=1000000 +datum=NAD83 +units=us-ft +no_defs',
  'EPSG:3088':
    '+proj=lcc +lat_0=37.5 +lon_0=-84.25 +lat_1=38.96666666666667 +lat_2=37.96666666666667 +x_0=1500000 +y_0=0 +datum=NAD83 +units=us-ft +no_defs',
  'EPSG:3089':
    '+proj=lcc +lat_0=36.33333333333333 +lon_0=-85.75 +lat_1=37.56666666666667 +lat_2=36.73333333333333 +x_0=500000 +y_0=0 +datum=NAD83 +units=us-ft +no_defs',

  // Louisiana
  'EPSG:3451':
    '+proj=lcc +lat_0=30.5 +lon_0=-92.5 +lat_1=32.66666666666666 +lat_2=31.16666666666666 +x_0=1000000 +y_0=0 +datum=NAD83 +units=us-ft +no_defs',
  'EPSG:3452':
    '+proj=lcc +lat_0=28.5 +lon_0=-91.33333333333333 +lat_1=30.7 +lat_2=29.3 +x_0=1000000 +y_0=0 +datum=NAD83 +units=us-ft +no_defs',

  // Maine
  'EPSG:26847':
    '+proj=tmerc +lat_0=43.66666666666666 +lon_0=-68.5 +k=0.9999 +x_0=300000 +y_0=0 +datum=NAD83 +units=us-ft +no_defs',
  'EPSG:26848':
    '+proj=tmerc +lat_0=42.83333333333334 +lon_0=-70.16666666666667 +k=0.9999666666666667 +x_0=900000 +y_0=0 +datum=NAD83 +units=us-ft +no_defs',

  // Maryland
  'EPSG:2248':
    '+proj=lcc +lat_0=37.66666666666666 +lon_0=-77 +lat_1=39.45 +lat_2=38.3 +x_0=400000 +y_0=0 +datum=NAD83 +units=us-ft +no_defs',

  // Massachusetts
  'EPSG:2249':
    '+proj=lcc +lat_0=41 +lon_0=-71.5 +lat_1=42.68333333333333 +lat_2=41.71666666666667 +x_0=200000 +y_0=750000 +datum=NAD83 +units=us-ft +no_defs',
  'EPSG:2250':
    '+proj=lcc +lat_0=41 +lon_0=-70.5 +lat_1=41.48333333333333 +lat_2=41.28333333333333 +x_0=500000 +y_0=0 +datum=NAD83 +units=us-ft +no_defs',

  // Michigan
  'EPSG:2251':
    '+proj=lcc +lat_0=44.78333333333333 +lon_0=-87 +lat_1=47 +lat_2=45.48333333333333 +x_0=8000000 +y_0=0 +datum=NAD83 +units=us-ft +no_defs',
  'EPSG:2252':
    '+proj=lcc +lat_0=43.31666666666667 +lon_0=-84.33333333333333 +lat_1=45.7 +lat_2=44.18333333333333 +x_0=6000000 +y_0=0 +datum=NAD83 +units=us-ft +no_defs',
  'EPSG:2253':
    '+proj=lcc +lat_0=41.5 +lon_0=-84.33333333333333 +lat_1=43.8 +lat_2=42.1 +x_0=4000000 +y_0=0 +datum=NAD83 +units=us-ft +no_defs',

  // Minnesota
  'EPSG:26991':
    '+proj=lcc +lat_0=46.5 +lon_0=-93.16666666666667 +lat_1=48.63333333333333 +lat_2=47.03333333333333 +x_0=800000.0000000001 +y_0=100000 +datum=NAD83 +units=us-ft +no_defs',
  'EPSG:26992':
    '+proj=lcc +lat_0=45 +lon_0=-94.25 +lat_1=47.05 +lat_2=45.61666666666667 +x_0=800000.0000000001 +y_0=100000 +datum=NAD83 +units=us-ft +no_defs',
  'EPSG:26993':
    '+proj=lcc +lat_0=43.33333333333333 +lon_0=-94 +lat_1=45.21666666666667 +lat_2=43.78333333333333 +x_0=800000.0000000001 +y_0=100000 +datum=NAD83 +units=us-ft +no_defs',

  // Mississippi
  'EPSG:2254':
    '+proj=tmerc +lat_0=29.5 +lon_0=-88.83333333333333 +k=0.99995 +x_0=300000 +y_0=0 +datum=NAD83 +units=us-ft +no_defs',
  'EPSG:2255':
    '+proj=tmerc +lat_0=29.5 +lon_0=-90.33333333333333 +k=0.99995 +x_0=700000 +y_0=0 +datum=NAD83 +units=us-ft +no_defs',

  // Missouri
  'EPSG:2256':
    '+proj=tmerc +lat_0=35.83333333333334 +lon_0=-90.5 +k=0.9999333333333333 +x_0=250000 +y_0=0 +datum=NAD83 +units=us-ft +no_defs',
  'EPSG:2257':
    '+proj=tmerc +lat_0=35.83333333333334 +lon_0=-92.5 +k=0.9999333333333333 +x_0=500000 +y_0=0 +datum=NAD83 +units=us-ft +no_defs',
  'EPSG:2258':
    '+proj=tmerc +lat_0=36.16666666666666 +lon_0=-94.5 +k=0.9999411764705882 +x_0=850000 +y_0=0 +datum=NAD83 +units=us-ft +no_defs',

  // Montana
  'EPSG:2259':
    '+proj=lcc +lat_0=44.25 +lon_0=-109.5 +lat_1=49 +lat_2=45 +x_0=600000 +y_0=0 +datum=NAD83 +units=us-ft +no_defs',

  // Nebraska
  'EPSG:2260':
    '+proj=lcc +lat_0=39.83333333333334 +lon_0=-100 +lat_1=43 +lat_2=40 +x_0=500000 +y_0=0 +datum=NAD83 +units=us-ft +no_defs',

  // Nevada
  'EPSG:2261':
    '+proj=tmerc +lat_0=34.75 +lon_0=-115.5 +k=0.9999 +x_0=200000 +y_0=8000000 +datum=NAD83 +units=us-ft +no_defs',
  'EPSG:2262':
    '+proj=tmerc +lat_0=34.75 +lon_0=-116.6666666666667 +k=0.9999 +x_0=500000 +y_0=8000000 +datum=NAD83 +units=us-ft +no_defs',

  // New Hampshire
  'EPSG:2818':
    '+proj=tmerc +lat_0=42.5 +lon_0=-71.66666666666667 +k=0.9999666666666667 +x_0=300000 +y_0=0 +datum=NAD83 +units=us-ft +no_defs',

  // New Jersey
  'EPSG:2820':
    '+proj=tmerc +lat_0=38.83333333333334 +lon_0=-74.5 +k=0.9999 +x_0=150000 +y_0=0 +datum=NAD83 +units=us-ft +no_defs',
  'EPSG:3424':
    '+proj=tmerc +lat_0=38.83333333333334 +lon_0=-74.5 +k=0.9999 +x_0=150000 +y_0=0 +datum=NAD83 +units=us-ft +no_defs',

  // New Mexico
  'EPSG:2901':
    '+proj=tmerc +lat_0=31 +lon_0=-104.3333333333333 +k=0.9999090909090909 +x_0=165000 +y_0=0 +datum=NAD83 +units=us-ft +no_defs',
  'EPSG:2902':
    '+proj=tmerc +lat_0=31 +lon_0=-106.25 +k=0.9999 +x_0=500000 +y_0=0 +datum=NAD83 +units=us-ft +no_defs',
  'EPSG:2903':
    '+proj=tmerc +lat_0=31 +lon_0=-107.8333333333333 +k=0.9999 +x_0=830000 +y_0=0 +datum=NAD83 +units=us-ft +no_defs',

  // New York
  'EPSG:2263':
    '+proj=lcc +lat_0=40.16666666666666 +lon_0=-74 +lat_1=41.03333333333333 +lat_2=40.66666666666666 +x_0=300000 +y_0=0 +datum=NAD83 +units=us-ft +no_defs',

  // North Carolina
  'EPSG:2264':
    '+proj=lcc +lat_0=33.75 +lon_0=-79 +lat_1=36.16666666666666 +lat_2=35.25 +x_0=609601.2192024384 +y_0=0 +datum=NAD83 +units=us-ft +no_defs',

  // North Dakota
  'EPSG:2265':
    '+proj=lcc +lat_0=47 +lon_0=-100.5 +lat_1=48.73333333333333 +lat_2=47.48333333333333 +x_0=600000 +y_0=0 +datum=NAD83 +units=us-ft +no_defs',
  'EPSG:2266':
    '+proj=lcc +lat_0=45.66666666666666 +lon_0=-100.5 +lat_1=47.48333333333333 +lat_2=46.18333333333333 +x_0=600000 +y_0=0 +datum=NAD83 +units=us-ft +no_defs',

  // Ohio
  'EPSG:3734':
    '+proj=lcc +lat_0=39.66666666666666 +lon_0=-82.5 +lat_1=41.7 +lat_2=40.43333333333333 +x_0=600000 +y_0=0 +datum=NAD83 +units=us-ft +no_defs',
  'EPSG:3735':
    '+proj=lcc +lat_0=38 +lon_0=-82.5 +lat_1=40.03333333333333 +lat_2=38.73333333333333 +x_0=600000 +y_0=0 +datum=NAD83 +units=us-ft +no_defs',

  // Oklahoma
  'EPSG:2267':
    '+proj=lcc +lat_0=35 +lon_0=-98 +lat_1=37 +lat_2=35.56666666666667 +x_0=600000 +y_0=0 +datum=NAD83 +units=us-ft +no_defs',
  'EPSG:2268':
    '+proj=lcc +lat_0=33.33333333333333 +lon_0=-98 +lat_1=35.23333333333333 +lat_2=33.93333333333333 +x_0=600000 +y_0=0 +datum=NAD83 +units=us-ft +no_defs',

  // Oregon
  'EPSG:2269':
    '+proj=lcc +lat_0=43.66666666666666 +lon_0=-120.5 +lat_1=46 +lat_2=44.33333333333334 +x_0=2500000 +y_0=0 +datum=NAD83 +units=us-ft +no_defs',
  'EPSG:2270':
    '+proj=lcc +lat_0=41.66666666666666 +lon_0=-120.5 +lat_1=44 +lat_2=42.33333333333334 +x_0=2500000 +y_0=0 +datum=NAD83 +units=us-ft +no_defs',

  // Pennsylvania
  'EPSG:2271':
    '+proj=lcc +lat_0=40.16666666666666 +lon_0=-77.75 +lat_1=41.95 +lat_2=40.88333333333333 +x_0=600000 +y_0=0 +datum=NAD83 +units=us-ft +no_defs',
  'EPSG:2272':
    '+proj=lcc +lat_0=39.33333333333333 +lon_0=-77.75 +lat_1=40.96666666666667 +lat_2=39.93333333333333 +x_0=600000 +y_0=0 +datum=NAD83 +units=us-ft +no_defs',

  // Rhode Island
  'EPSG:3430':
    '+proj=tmerc +lat_0=41.08333333333334 +lon_0=-71.5 +k=0.99999375 +x_0=100000 +y_0=0 +datum=NAD83 +units=us-ft +no_defs',

  // South Carolina
  'EPSG:2273':
    '+proj=lcc +lat_0=31.83333333333333 +lon_0=-81 +lat_1=34.83333333333334 +lat_2=32.5 +x_0=609600 +y_0=0 +datum=NAD83 +units=us-ft +no_defs',

  // South Dakota
  'EPSG:2274':
    '+proj=lcc +lat_0=43.83333333333334 +lon_0=-100 +lat_1=45.68333333333333 +lat_2=44.41666666666666 +x_0=600000 +y_0=0 +datum=NAD83 +units=us-ft +no_defs',
  'EPSG:2275':
    '+proj=lcc +lat_0=42.33333333333333 +lon_0=-100.3333333333333 +lat_1=44.4 +lat_2=42.83333333333334 +x_0=600000 +y_0=0 +datum=NAD83 +units=us-ft +no_defs',

  // Tennessee
  'EPSG:2276':
    '+proj=lcc +lat_0=34.33333333333333 +lon_0=-86 +lat_1=36.66666666666666 +lat_2=35.25 +x_0=600000 +y_0=0 +datum=NAD83 +units=us-ft +no_defs',

  // Texas
  'EPSG:2277':
    '+proj=lcc +lat_0=33.66666666666666 +lon_0=-101.5 +lat_1=36.18333333333333 +lat_2=34.65 +x_0=2000000 +y_0=1000000 +datum=NAD83 +units=us-ft +no_defs',
  'EPSG:2278':
    '+proj=lcc +lat_0=31.66666666666666 +lon_0=-98.5 +lat_1=33.96666666666667 +lat_2=32.13333333333333 +x_0=2000000 +y_0=2000000 +datum=NAD83 +units=us-ft +no_defs',
  'EPSG:2279':
    '+proj=lcc +lat_0=29.66666666666666 +lon_0=-100.3333333333333 +lat_1=31.88333333333333 +lat_2=30.11666666666667 +x_0=2000000 +y_0=3000000 +datum=NAD83 +units=us-ft +no_defs',
  'EPSG:2280':
    '+proj=lcc +lat_0=27.83333333333333 +lon_0=-99 +lat_1=30.28333333333333 +lat_2=28.38333333333333 +x_0=2000000 +y_0=4000000 +datum=NAD83 +units=us-ft +no_defs',
  'EPSG:2281':
    '+proj=lcc +lat_0=25.66666666666666 +lon_0=-98.5 +lat_1=27.83333333333333 +lat_2=26.16666666666666 +x_0=2000000 +y_0=5000000 +datum=NAD83 +units=us-ft +no_defs',

  // Utah
  'EPSG:2282':
    '+proj=lcc +lat_0=40.33333333333333 +lon_0=-111.5 +lat_1=41.78333333333333 +lat_2=40.71666666666667 +x_0=500000 +y_0=1000000 +datum=NAD83 +units=us-ft +no_defs',
  'EPSG:2283':
    '+proj=lcc +lat_0=38.33333333333333 +lon_0=-111.5 +lat_1=40.65 +lat_2=39.01666666666667 +x_0=500000 +y_0=2000000 +datum=NAD83 +units=us-ft +no_defs',
  'EPSG:2284':
    '+proj=lcc +lat_0=36.66666666666666 +lon_0=-111.5 +lat_1=38.35 +lat_2=37.21666666666667 +x_0=500000 +y_0=3000000 +datum=NAD83 +units=us-ft +no_defs',

  // Vermont
  'EPSG:32145':
    '+proj=tmerc +lat_0=42.5 +lon_0=-72.5 +k=0.999964286 +x_0=500000 +y_0=0 +datum=NAD83 +units=m +no_defs',

  // Virginia
  'EPSG:2924':
    '+proj=lcc +lat_0=37.66666666666666 +lon_0=-78.5 +lat_1=39.2 +lat_2=38.03333333333333 +x_0=3500000 +y_0=2000000 +datum=NAD83 +units=us-ft +no_defs',
  'EPSG:2925':
    '+proj=lcc +lat_0=36.33333333333333 +lon_0=-78.5 +lat_1=37.96666666666667 +lat_2=36.76666666666667 +x_0=3500000 +y_0=1000000 +datum=NAD83 +units=us-ft +no_defs',

  // Washington
  'EPSG:2285':
    '+proj=lcc +lat_0=47 +lon_0=-120.8333333333333 +lat_1=48.73333333333333 +lat_2=47.5 +x_0=500000 +y_0=0 +datum=NAD83 +units=us-ft +no_defs',
  'EPSG:2286':
    '+proj=lcc +lat_0=45.33333333333333 +lon_0=-120.5 +lat_1=47.33333333333334 +lat_2=45.83333333333334 +x_0=500000 +y_0=0 +datum=NAD83 +units=us-ft +no_defs',

  // West Virginia
  'EPSG:2850':
    '+proj=lcc +lat_0=38.5 +lon_0=-79.5 +lat_1=40.25 +lat_2=39 +x_0=600000 +y_0=0 +datum=NAD83 +units=us-ft +no_defs',
  'EPSG:2851':
    '+proj=lcc +lat_0=37 +lon_0=-81 +lat_1=38.45 +lat_2=37.48333333333333 +x_0=600000 +y_0=0 +datum=NAD83 +units=us-ft +no_defs',

  // Wisconsin
  'EPSG:2287':
    '+proj=lcc +lat_0=45 +lon_0=-90 +lat_1=46.76666666666667 +lat_2=45.56666666666667 +x_0=600000 +y_0=0 +datum=NAD83 +units=us-ft +no_defs',
  'EPSG:2288':
    '+proj=lcc +lat_0=43.83333333333334 +lon_0=-90 +lat_1=45.5 +lat_2=44.25 +x_0=600000 +y_0=0 +datum=NAD83 +units=us-ft +no_defs',
  'EPSG:2289':
    '+proj=lcc +lat_0=42 +lon_0=-90 +lat_1=44.06666666666667 +lat_2=42.73333333333333 +x_0=600000 +y_0=0 +datum=NAD83 +units=us-ft +no_defs',

  // Wyoming
  'EPSG:2852':
    '+proj=tmerc +lat_0=40.5 +lon_0=-105.1666666666667 +k=0.9999375 +x_0=200000 +y_0=0 +datum=NAD83 +units=us-ft +no_defs',
  'EPSG:2853':
    '+proj=tmerc +lat_0=40.5 +lon_0=-107.3333333333333 +k=0.9999375 +x_0=500000 +y_0=0 +datum=NAD83 +units=us-ft +no_defs',
  'EPSG:2854':
    '+proj=tmerc +lat_0=40.5 +lon_0=-108.75 +k=0.9999375 +x_0=800000 +y_0=0 +datum=NAD83 +units=us-ft +no_defs',
  'EPSG:2855':
    '+proj=tmerc +lat_0=40.5 +lon_0=-110.0833333333333 +k=0.9999375 +x_0=900000 +y_0=0 +datum=NAD83 +units=us-ft +no_defs',
};

// Complete offline registry map
export const EPSG_REGISTRY = new Map();

// Standard built-in projections
EPSG_REGISTRY.set('EPSG:4326', '+proj=longlat +datum=WGS84 +no_defs +type=crs');
EPSG_REGISTRY.set(
  'EPSG:3857',
  '+proj=merc +a=6378137 +b=6378137 +lat_ts=0 +lon_0=0 +x_0=0 +y_0=0 +k=1 +units=m +nadgrids=@null +wktext +no_defs'
);

// UTM Zones 1-60 (NAD83: 26901-26960, WGS84 North: 32601-32660, WGS84 South: 32701-32760)
for (let zone = 1; zone <= 60; zone++) {
  const codeNAD83 = `EPSG:${26900 + zone}`;
  const codeWGS84N = `EPSG:${32600 + zone}`;
  const codeWGS84S = `EPSG:${32700 + zone}`;
  EPSG_REGISTRY.set(codeNAD83, `+proj=utm +zone=${zone} +datum=NAD83 +units=m +no_defs`);
  EPSG_REGISTRY.set(codeWGS84N, `+proj=utm +zone=${zone} +datum=WGS84 +units=m +no_defs`);
  EPSG_REGISTRY.set(codeWGS84S, `+proj=utm +zone=${zone} +south +datum=WGS84 +units=m +no_defs`);
}

// Add state plane definitions
for (const [code, def] of Object.entries(STATE_PLANE_DEFS)) {
  EPSG_REGISTRY.set(code, def);
}

/**
 * Registers all definitions into `proj4.defs`.
 */
export function registerAllEPSG(p = proj4) {
  if (!p || !p.defs) return;
  for (const [code, def] of EPSG_REGISTRY) {
    if (!p.defs[code]) {
      p.defs(code, def);
    }
  }
}

/**
 * Normalizes an EPSG code string (e.g. "3435" -> "EPSG:3435").
 */
export function normalizeCode(code) {
  if (!code || typeof code !== 'string') return '';
  const trimmed = code.trim().toUpperCase();
  if (/^\d+$/.test(trimmed)) return `EPSG:${trimmed}`;
  if (trimmed.startsWith('EPSG:')) return trimmed;
  return trimmed;
}

/**
 * Returns true if the code is present in the offline registry or proj4.defs.
 */
export function isRegisteredEPSG(code) {
  if (!code) return false;
  const normalized = normalizeCode(code);
  if (EPSG_REGISTRY.has(normalized)) return true;
  if (proj4 && proj4.defs && proj4.defs[normalized]) return true;
  return false;
}

/**
 * Retrieves the proj4 string definition for an EPSG code.
 */
export function getEPSGDefinition(code) {
  const normalized = normalizeCode(code);
  if (EPSG_REGISTRY.has(normalized)) return EPSG_REGISTRY.get(normalized);
  if (proj4 && proj4.defs && proj4.defs[normalized]) return proj4.defs[normalized];
  return null;
}
