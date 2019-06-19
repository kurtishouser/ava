const fs = require('fs');
const fetch = require('node-fetch');
const xml2js = require('xml2js');

const parser = xml2js.Parser({
  attrkey: "attr",
  charkey: "text",
  trim: true,
});

const xmlCfrData = {};
let lastGeoJsonCfr = 0;

async function fetchXmlDocument(xmlUrl) {
  console.log('Fetching CFR XML document from govinfo.gov (large file!)...');
  const response = await fetch(xmlUrl);

  return response.status === 200
    ? response.text()
    : Promise.reject(`Retrieval failed with HTTP status code ${response.status}.`);
}

function parseXml(xml) {
  return new Promise((resolve, reject) => {
    parser.parseString(xml, (err, result) => {
      if (err !== null) {
        reject('Error parsing XML document.');
      } else {
        resolve(result);
      }
    });
  });
}

function extractEcfrAvas(eCfr) {
  try {
    // slice(1) removes CFR 9.21 General
    const avas = eCfr.DLPSTEXTCLASS.TEXT[0].BODY[0].ECFRBRWS[0].DIV1[0].DIV3[0].DIV4[0].DIV5[6].DIV6[2].DIV8.slice(1);

    for (i = 0; i < avas.length; i++) {
      const cfrIndex = avas[i].attr.N.substring(2); // remove '§ ' from beginning
      const head = avas[i].HEAD[0].split('   ');
      const name = head[1].substring(0, head[1].length - 1); // remove trailing '.'
      const cfr_revision_history = avas[i].CITA
        ? avas[i].CITA[0].text
        : avas[i].SECAUTH[0].text; // used by 9.126 Santa Clara Valley

      xmlCfrData[cfrIndex] = { name, cfr_revision_history };
    }
    return xmlCfrData;
  }
  catch(e) {
    return ('Unable to parse XML document, unsupported structure.');
  }
}

function extractCfrAvas(cfr) {
  try {
    // slice(1) removes CFR 9.21 General
    const avas = cfr.CFRGRANULE.SUBPART[0].SECTION.slice(1);

    for (i = 0; i < avas.length; i++) {
      const cfrIndex = avas[i].SECTNO[0].substring(2); // remove '§ ' from beginning

      xmlCfrData[cfrIndex] = {
        name: avas[i].SUBJECT[0].substring(0, avas[i].SUBJECT[0].length - 1), // remove '.' from end
        cfr_revision_history: avas[i].CITA
          ? avas[i].CITA[0]
          : avas[i].SECAUTH[0], // used by 9.126 Santa Clara Valley
      };
    }
    return xmlCfrData;
  }
  catch(e) {
    return ('Unable to parse XML document, unsupported structure.');
  }
}

function readDirectory(directoryPath) {
  return fs.readdirSync(directoryPath)
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

// for local testing, async required so it can be used below, eventually move this to the unit testing
// async function readLocalTestFile(filename) {
//   console.log('Reading local test file...')
//   // CFR and eCFR XML files can be downloaded at
//   // https://www.govinfo.gov/app/details/CFR-2018-title27-vol1/CFR-2018-title27-vol1-part9-subpartC
//   // https://www.govinfo.gov/bulkdata/ECFR/title-27
//   try {
//     return fs.readFileSync(filename);
//   }
//   catch(e) {
//     return Promise.reject('Unable to read file.');
//   }
// }

const year = process.argv[2];

if (!year) {
  const xmlUrl = 'https://www.govinfo.gov/bulkdata/ECFR/title-27/ECFR-title27.xml';

  // readLocalTestFile('./ECFR-title27.xml') // for local testing
  fetchXmlDocument(xmlUrl)
    .then((xml) => parseXml(xml))
    .then((eCfr) => extractEcfrAvas(eCfr))
    .then(() => {
      checkForUpdatedCfrs(readDirectory('./avas'));
      checkForUpdatedCfrs(readDirectory('./tbd'));
      checkForNewCfrs();
    })
    .catch(e => console.log(e));
} else if (year.length === 4 && Number.isInteger(Number(year))) {
  const xmlUrl = `https://www.govinfo.gov/content/pkg/CFR-${year}-title27-vol1/xml/CFR-${year}-title27-vol1-part9-subpartC.xml`;

  // readLocalTestFile(`./CFR-${year}-title27-vol1-part9-subpartC.xml`) // for local testing
  fetchXmlDocument(xmlUrl)
    .then((xml) => parseXml(xml))
    .then((cfr) => extractCfrAvas(cfr))
    .then(() => {
      checkForUpdatedCfrs(readDirectory('./avas'));
      checkForUpdatedCfrs(readDirectory('./tbd'));
      checkForNewCfrs();
    })
    .catch(e => console.log(e));
} else {
  console.log('Four-digit year required -> node index ####');
}
