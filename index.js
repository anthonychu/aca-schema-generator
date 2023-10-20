const fetch = require('node-fetch');
const fs = require('fs');

async function main() {
    await saveResource(
        'https://raw.githubusercontent.com/Azure/azure-resource-manager-schemas/main/schemas/2023-05-02-preview/Microsoft.App.json#/resourceDefinitions/containerApps',
        'schemas/containerApps.json');
    await saveResource(
        'https://raw.githubusercontent.com/Azure/azure-resource-manager-schemas/main/schemas/2023-05-02-preview/Microsoft.App.json#/resourceDefinitions/jobs',
        'schemas/jobs.json');
    await saveResource(
        'https://raw.githubusercontent.com/Azure/azure-resource-manager-schemas/main/schemas/2023-05-02-preview/Microsoft.App.json#/definitions/DaprComponentProperties',
        'schemas/daprComponents.json');
}


async function saveResource(url, filename) {
    const data = await getResource(url);
    fs.writeFileSync(filename, JSON.stringify(data, null, 2));
}

const cache = {};


async function getResource(url, parentResource) {
    const isHash = url.startsWith('#');

    const noRequiredProperties = true;
    const allowAdditionalProperties = false;

    let data;
    let fullData;
    let hash;
    let fetched = !isHash;
    if (isHash) {
        data = parentResource;
        hash = url.replace(/^#/, '');
    } else {
        if (cache[url]) {
            return cache[url];
        }
        const resourceUrl = new URL(url);
        hash = resourceUrl.hash?.replace(/^#/, '');
        const response = await fetch(url);
        fullData = data = await response.json();
    }

    if (hash) {
        data = getPropertyForHash(data, hash);
    }

    // find all $ref properties
    const refs = [];
    const findRefs = (obj) => {
        if (obj.$ref) {
            refs.push(obj);
        }
        for (const key in obj) {
            if (typeof obj[key] === 'object') {
                findRefs(obj[key]);
            }
        }
    };
    findRefs(data);

    if (noRequiredProperties) {
        const removeRequired = (obj) => {
            if (obj.required) {
                obj.required = [];
            }
            for (const key in obj) {
                if (typeof obj[key] === 'object') {
                    removeRequired(obj[key]);
                }
            }
        };
        removeRequired(data);
    }


    if (!allowAdditionalProperties) {
        const disallowAdditionalProperties = (obj) => {
            if (obj.properties && !obj.additionalProperties) {
                obj.additionalProperties = false;
            }
            for (const key in obj) {
                if (typeof obj[key] === 'object') {
                    disallowAdditionalProperties(obj[key]);
                }
            }
        };
        disallowAdditionalProperties(data);
    }

    for (const ref of refs) {
        const refData = await getResource(ref.$ref, fetched ? fullData : parentResource);
        Object.assign(ref, refData);
        ref.isReferenced = true;
        delete ref.$ref;
    }

    if (fetched) {
        cache[url] = data;
    }

    return data;
}

function getPropertyForHash(obj, hash) {
    const parts = hash.split('/');
    let current = obj;
    for (const part of parts) {
        if (!part || part === '#') {
            continue;
        }
        current = current[part];
    }
    return current;
}

main();