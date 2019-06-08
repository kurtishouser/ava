const fs = require('fs');
const fetch = require('node-fetch');
const { parseString } = require('xml2js');

const year = 2018;
const cfrAppellationsUrl = `https://www.govinfo.gov/content/pkg/CFR-${year}-title27-vol1/xml/CFR-${year}-title27-vol1-part9-subpartC.xml`;
const xmlCfrData = {};
let lastGeoJsonCfr = 0;

async function fetchXmlDocument(xmlUrl) {
  console.log('Fetching CFR XML document from govinfo.gov (large file!)...');
  const response = await fetch(xmlUrl);

  return response.text();
}

function parseXmlDocument(xml) {
  return new Promise((resolve, reject) => {
    parseString(xml, (err, result) => {
      if (err !== null) {
        reject(err);
      } else {
        try {
          const { SECTION } = result.CFRGRANULE.SUBPART[0];
    
          for (i = 1; i < SECTION.length; i++) { // i = 1 -> skips 9.21 General
            const cfrIndex = SECTION[i].SECTNO[0].substring(2); // remove '§ ' from beginning

            xmlCfrData[cfrIndex] = {
              name: SECTION[i].SUBJECT[0].substring(0, SECTION[i].SUBJECT[0].length - 1), // remove '.' from end
              cfr_revision_history: SECTION[i].CITA
                ? SECTION[i].CITA[0]
                : SECTION[i].SECAUTH[0], // used by 9.126 Santa Clara Valley
            };
          }
          resolve();
        }
        catch(e) {
          reject('Unable to parse XML document, unsupported structure.');
        }
      }
    });
  });
}

function readDirectory(directoryPath) {
  const filenames = fs.readdirSync(directoryPath);

  return filenames
    .filter(filename => filename.endsWith('.geojson'))
    .map(filename => `${directoryPath}/${filename}`);
}

function checkForUpdatedCfrs(filenames) {
  filenames.forEach(filename => {
    const file = fs.readFileSync(filename); 
    const { cfr_index, name, cfr_revision_history } = JSON.parse(file).features[0].properties;
    const currentCfr = parseInt(cfr_index.substring(2));

    if (currentCfr > lastGeoJsonCfr) lastGeoJsonCfr = currentCfr;

    if (xmlCfrData[cfr_index] && cfr_revision_history != xmlCfrData[cfr_index].cfr_revision_history) {
      console.log('CFR update available for', cfr_index, name,'->', filename);
    }
  }); 
}

function checkForNewCfrs() {
  Object.keys(xmlCfrData)
    .filter(cfr => parseInt(cfr.substring(2)) > lastGeoJsonCfr)
    .forEach(newCfr => console.log('New CFR available for', newCfr, xmlCfrData[newCfr].name));
}

async function readLocalTestFile(filename) { // for local testing, async required so it can be used below
  // XML file can be downloaded at 
  // https://www.govinfo.gov/app/details/CFR-2018-title27-vol1/CFR-2018-title27-vol1-part9-subpartC
  return fs.readFileSync(`./CFR-${year}-title27-vol1-part9-subpartC.xml`); 
}

// readLocalTestFile() // for local testing
fetchXmlDocument(cfrAppellationsUrl)
  .then((xml) => parseXmlDocument(xml))
  .then(() => {
    checkForUpdatedCfrs(readDirectory('./avas'));
    checkForUpdatedCfrs(readDirectory('./tbd'));
    checkForNewCfrs();
  })
  .catch(e => console.log(e));
