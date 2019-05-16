const fs = require('fs');
const fetch = require('node-fetch');
const { parseString } = require('xml2js');

const fsPromises = fs.promises;

const cfrAppellationsUrl = 'https://www.govinfo.gov/content/pkg/CFR-2018-title27-vol1/xml/CFR-2018-title27-vol1-part9-subpartC.xml';
const currentCfrData = {};

async function fetchXmlDocument(xmlUrl) {
  console.log('Fetching CFR XML document from govinfo.gov (large file!)...');
  const response = await fetch(xmlUrl);
  
  return await response.text();
}

async function readDirectory(directoryPath) {
  const filenames = await fsPromises.readdir(directoryPath, 'utf8');

  return filenames
    .filter(filename => filename.endsWith('.geojson'))
    .map(filename => `${directoryPath}/${filename}`);
}

async function readFile(filename) {
  const filehandle = await fsPromises.open(filename, 'r');
  const file = await filehandle.readFile({encoding: 'utf8' });

  if (filehandle !== undefined) {
    await filehandle.close();
  }

  return file;
}

function compareGeoJsonFiles(filenames) {
  filenames.forEach(async filename => {
    const file = await readFile(filename)
    const { cfr_index, name, cfr_revision_history } = JSON.parse(file).features[0].properties;

    if (cfr_revision_history != currentCfrData[cfr_index].cfr_revision_history) {
      console.log('Update available for', cfr_index, name,'->',filename);
    }
  });
}

fetchXmlDocument(cfrAppellationsUrl)
// for local testing file can be downloaded at 
// https://www.govinfo.gov/content/pkg/CFR-2018-title27-vol1/xml/CFR-2018-title27-vol1-part9-subpartC.xml
// readFile('./CFR-2018-title27-vol1-part9-subpartC.xml')
  .then(xml => parseString(xml, (err, result) => {
    const { SECTION } = result.CFRGRANULE.SUBPART[0];

    for (i = 1; i < SECTION.length; i++) { // skip 9.21 General
      currentCfrData[SECTION[i].SECTNO[0].substring(2)] = { // remove '§ ' from beginning
        name: SECTION[i].SUBJECT[0].substring(0, SECTION[i].SUBJECT[0].length - 1), // remove '.' from end
        cfr_revision_history: SECTION[i].CITA
          ? SECTION[i].CITA[0]
          : SECTION[i].SECAUTH[0], // 9.126 Santa Clara Valley
      };
    }
  }))
  .then(() => readDirectory('./avas'))
  .then(filenames => compareGeoJsonFiles(filenames))
  .then(() => readDirectory('./tbd'))
  .then(filenames => compareGeoJsonFiles(filenames))
  .catch(e => e);
