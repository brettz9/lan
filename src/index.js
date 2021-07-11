const {writeFile} = require('fs/promises');

const jsdom = require('jsdom');
const fetch = require('file-fetch');

const {JSDOM} = jsdom;

async function loadXMLDocument (file, {contentType}) {
  const res = await fetch(file);
  const text = await res.text();
  const {window} = (new JSDOM(text, {contentType}));
  const {document} = window;

  const $$ = (sel, contextNode = document) => {
    const elements = document.evaluate(
      sel, contextNode, null, window.XPathResult.ORDERED_NODE_ITERATOR_TYPE, null
    );
    const results = [];
    let currentElement = elements.iterateNext();
    while (currentElement) {
      results.push(currentElement);
      currentElement = elements.iterateNext();
    }
    return results;
  };
  return {$$, window};
}

(async () => {
const basePath = './db/lexica/ara/lan';
const {$$: getFromContents} = await loadXMLDocument(
  `${basePath}/__contents__.xml`,
  {
    contentType: 'application/xml'
  }
);

// Browser would be namespace-aware,needing something like:
// *[name()="resource" and namespace-uri()='http://exist.sourceforge.net/NS/exist']
const names = getFromContents('//resource/@name').map((attr) => {
  return attr.value;
});
// Todo: Remove this: Just get one for now
// .slice(0, 1);

const teiGetters = await Promise.all(names.map((name) => {
  return loadXMLDocument(`${basePath}/${name}`, {
    contentType: 'application/tei+xml'
  });
}));

function listUniqueTEIElementAttributeValues (teiGetter, {elems, exclusions}) {
  teiGetter('//*').forEach((elem) => {
    if (!elems[elem.localName]) {
      elems[elem.localName] = {};
    }
    [...elem.attributes].forEach((attr) => {
      if (!elems[elem.localName][attr.name]) {
        elems[elem.localName][attr.name] = [];
      }
      if (!elems[elem.localName][attr.name].includes(attr.value)) {
        // Exclude from listing these specified element+attribute combinations
        //  as their values are too numerous and not of interest (i.e., they
        //  are not enumerations to handle individually)
        if (exclusions?.[elem.localName]?.includes(attr.name)) {
          const excludeValue = '<excluded>';
          if (!elems[elem.localName][attr.name].includes(excludeValue)) {
            elems[elem.localName][attr.name].push(excludeValue);
          }
          return;
        }
        elems[elem.localName][attr.name].push(attr.value);
      }
    });
  });
}

if (process.argv.includes('--uniqueElements')) {
  const elems = {};
  teiGetters.forEach(({$$: teiGetter}) => {
    // Working: Use to find unique items needing handling, e.g., for XSL stylesheet
    listUniqueTEIElementAttributeValues(teiGetter, {
      elems,
      exclusions: {
        entryFree: ['id', 'key'],
        pb: ['n']
      }
    });
  });

  console.log('elems', elems);
  await writeFile('uniqueElements.json', JSON.stringify(elems, null, 2));
}

if (process.argv.includes('--sqlite')) {
  teiGetters.forEach(({$$: teiGetter, window: {XMLSerializer}}) => {
    teiGetter('//div2[@type="root"]').forEach((div2) => {
      const root = teiGetter('head/foreign[@lang="ar"]', div2)[0];
      teiGetter('//entryFree', div2).forEach((entryFree) => {
        console.log('xml', new XMLSerializer().serializeToString(entryFree));
        const key = teiGetter('@key', entryFree)[0]?.value;
        console.log('key', key);
      });
      console.log('root', root.textContent);
      process.exit();
    });
  });
}

})();
