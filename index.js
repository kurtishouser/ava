const fs = require('fs');
const fetch = require('node-fetch');
const { parseString } = require('xml2js');

const cfrAppellationsUrl = 'https://www.govinfo.gov/content/pkg/CFR-2018-title27-vol1/xml/CFR-2018-title27-vol1-part9-subpartC.xml';
const currentCfrData = {};

async function fetchXmlDocument(xmlUrl) {
  console.log('Fetching CFR XML document from govinfo.gov (large file!)...');
  const response = await fetch(xmlUrl);
  
  return response.text();
}

function readDirectory(directoryPath) {
  const filenames = fs.readdirSync(directoryPath);

  return filenames
    .filter(filename => filename.endsWith('.geojson'))
    .map(filename => `${directoryPath}/${filename}`);
}

function compareGeoJsonFiles(filenames) {
  filenames.forEach(filename => {
    const file = fs.readFileSync(filename); 
    const { cfr_index, name, cfr_revision_history } = JSON.parse(file).features[0].properties;

    if (cfr_revision_history != currentCfrData[cfr_index].cfr_revision_history) {
      console.log('Update available for', cfr_index, name,'->',filename);
    }
  });
}

async function readLocalTestFile(filename) { // for local testing, async required so it can be used below
  // file can be downloaded at 
  // https://www.govinfo.gov/content/pkg/CFR-2018-title27-vol1/xml/CFR-2018-title27-vol1-part9-subpartC.xml
  return fs.readFileSync('./CFR-2018-title27-vol1-part9-subpartC.xml'); 
}

fetchXmlDocument(cfrAppellationsUrl)
// readLocalTestFile() // for local testing
  .then(xml => parseString(xml, (err, result) => {
    const { SECTION } = result.CFRGRANULE.SUBPART[0];

    for (i = 1; i < SECTION.length; i++) { // i = 1 -> skips 9.21 General
      currentCfrData[SECTION[i].SECTNO[0].substring(2)] = { // remove '§ ' from beginning
        name: SECTION[i].SUBJECT[0].substring(0, SECTION[i].SUBJECT[0].length - 1), // remove '.' from end
        cfr_revision_history: SECTION[i].CITA
          ? SECTION[i].CITA[0]
          : SECTION[i].SECAUTH[0], // used by 9.126 Santa Clara Valley
      };
    }
  }))
  .then(() => {
    compareGeoJsonFiles(readDirectory('./avas'));
    compareGeoJsonFiles(readDirectory('./tbd'));
  })
  .catch(e => e);
