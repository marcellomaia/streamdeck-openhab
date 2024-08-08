/// <reference path="../../libs/js/property-inspector.js" />
/// <reference path="../../libs/js/action.js" />
/// <reference path="../../libs/js/utils.js" />

var globalSettings = {};

$PI.onConnected(jsn => {
    Object.entries(jsn.actionInfo.payload.settings).forEach(([key, value]) => {
        const el = document.getElementById(key);
        if(el) {
            el.value = value;
        }
    });

    let actionUUID = $PI.actionInfo.action;
    $PI.onSendToPropertyInspector(actionUUID, fetchItemsResults);

    $PI.onDidReceiveGlobalSettings((data) => {
        globalSettings = data['payload']['settings'];
        document.getElementById('openhab_url').value = globalSettings['url']??'';
        document.getElementById('apikey').value = globalSettings['apikey']??'';
        checkConfigComplete();
    });
    $PI.getGlobalSettings();
    
});

const testConnection = () => {
    if (globalSettings[PluginConstants.openhab_url] && globalSettings[PluginConstants.openhab_apikey]) {
        const apiURL = `${globalSettings[PluginConstants.openhab_url]}/rest/`;

        document.getElementById('btn_testConn').disabled = true;
        return fetch(apiURL, {
            method: 'GET',
            headers: {
              'Content-Type': 'text/plain',
              'Authorization': `Bearer ${globalSettings[PluginConstants.openhab_apikey]}`,
                } 
        } )
        .then(response => {
            if (!response.ok) {
                return { text: response.status === 401 ? "Invalid API-KEY!" : "Could not connect!", css: "teste-failed"};
            }
            return { text: "SUCCESS!", css: "teste-succeeded"};
        })
        .catch(error => {
            return { text: "Invalid URL!", css: "teste-failed"};
        }
        )
        .then(data => {
            setTimeout(() => {
                document.getElementById('teste_results').innerHTML = data.text;
                document.getElementById('teste_results').classList.add(data.css);
                setTimeout(() => {
                    document.getElementById('teste_results').innerHTML = "";
                    document.getElementById('teste_results').classList.remove(data.css);
                }, 2000);
            }, 1);
        }).finally(
            () => {
                document.getElementById('btn_testConn').disabled = false;
            }
        );
    } else {
        document.getElementById('teste_results').innerHTML = "Incomplete Data!";
        document.getElementById('teste_results').classList.add("teste-failed");
        setTimeout(() => {
            document.getElementById('teste_results').innerHTML = "";
            document.getElementById('teste_results').classList.remove(data.css);
        }, 2000);
    }
}


var _listBoxItems = [];
var _visibleItems = [];

const loadItems = () => {
    const select = document.getElementById('itemsList');
    while (select.length) {
        select.remove(0);
    }

    // const list = document.getElementById('switchList');
    // while (list.hasChildNodes()) {
    //     list.removeChild(list.firstChild);
    // }

    _listBoxItems = [];

    for(let i=0; i < _visibleItems.length; i++) {
        const opt = document.createElement('option');
        opt.value = _visibleItems[i];
        opt.text = opt.value;
        select.add(opt);

        // const node = document.createElement('li');
        // const textnode = document.createTextNode(_visibleItems[i]);
        // node.appendChild(textnode);
        // node.setAttribute('title', _visibleItems[i]);
        // node.onclick = () => { setItemName(_visibleItems[i]) };
        // list.appendChild(node);        
    }
    select.selectedIndex = -1;
}

// const setItemName = (name) => {
//     const itemname = document.getElementById(PluginConstants.itemName);
//     itemname.value = name;
//     $PI.setSettings({[itemname.id]: itemname.value});
// }

const onSwitchSelected = () => {
    const select = document.getElementById('itemsList');
    if (select.selectedIndex >= 0) {
        const itemname = document.getElementById(PluginConstants.itemName);
        itemname.value = select[select.selectedIndex].value;
        select.selectedIndex = -1;
        $PI.setSettings({[itemname.id]: itemname.value});
    }
}

const fetchItemsResults = (data) => {
    _visibleItems = data['payload']['results']??[];
    loadItems();
}

const fetchItems = () => {
    $PI.sendToPlugin({request: 'getSwitchList'});
}

const changed = () => {
    $PI.setSettings({[event.target.id]: event.target.value});
    //$PI.sendToPlugin({key: event.target.id, value: event.target.value});
};

function checkConfigComplete() {
    if (!globalSettings['url'] || !globalSettings['apikey']) {
        document.getElementById('missingConfig').hidden = false;
    } else {
        document.getElementById('missingConfig').hidden = true;
    }
}

const changedHostname = () => {
    let baseUrl = document.getElementById('openhab_url').value??'';
    if (baseUrl.endsWith('/')){
      baseUrl = baseUrl.substring(0, baseUrl.length-1);
    }
    document.getElementById('openhab_url').value = baseUrl;
    globalSettings['url'] = baseUrl;

    $PI.setGlobalSettings(globalSettings);
    
    checkConfigComplete();
};

const changedAPIKey = () => {
    globalSettings['apikey'] = document.getElementById('apikey').value??'';
    $PI.setGlobalSettings(globalSettings);
    checkConfigComplete();
};


function activateTabs(activeTab) {
    const allTabs = Array.from(document.querySelectorAll('.tab'));
    let activeTabEl = null;
    allTabs.forEach((el, i) => {
        el.onclick = () => clickTab(el);
        if(el.dataset?.target === activeTab) {
            activeTabEl = el;
        }
    });
    if(activeTabEl) {
        clickTab(activeTabEl);
    } else if(allTabs.length) {
        clickTab(allTabs[0]);
    }
}

function clickTab(clickedTab) {
    const allTabs = Array.from(document.querySelectorAll('.tab'));
    allTabs.forEach((el, i) => el.classList.remove('selected'));
    clickedTab.classList.add('selected');

    allTabs.forEach((el, i) => {
        if(el.dataset.target) {
            const t = document.querySelector(el.dataset.target);
            if(t) {
                t.style.display = el == clickedTab ? 'block' : 'none';
            }
        }
    });
}

function adjustTabPadding(paddingInPixels = '12px') {
    document.body.style.setProperty('--sdpi-tab-padding-horizontal', paddingInPixels);
}

adjustTabPadding('8px');

activateTabs();
