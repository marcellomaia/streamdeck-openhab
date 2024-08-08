/// <reference path="./stream-deck.js">
/// <reference path="../../shared/constants.js">

const _refreshTimeout = 10;

class OpenHAB {
    url = undefined;
    apiKey = undefined;
    _running = false;
    _visibleItems = [];
    _timer = null;

    _itemToggleQueue = [];

    

    constructor() {
        $SD.onDidReceiveGlobalSettings(  this.configure.bind(this) );
        $SD.on(`${PluginConstants.action_switch}.keyUp`, this._okKeyUp.bind(this) );
        $SD.on(`${PluginConstants.action_switch}.willAppear`, this._willAppear.bind(this) );
        $SD.on(`${PluginConstants.action_switch}.willDisappear`, this._willDisappear.bind(this) );
        $SD.onDidReceiveSettings( PluginConstants.action_switch, this._onDidReceiveSettings.bind(this) );
        $SD.onDeviceDidDisconnect( this._onDeviceDidDisconnect.bind(this) );
        $SD.onConnected( () => {
            $SD.getGlobalSettings();
        })

        $SD.on(`${PluginConstants.action_switch}.sendToPlugin`, this._sentToPlugin.bind(this) );
    }

    _sentToPlugin = (data) => {
        if (data['action'] === PluginConstants.action_switch ) {
            if (data['payload']['request']) {
                if ( data['payload']['request'] === 'getSwitchList' ) {
                    if (this._openhabConfigOK) {
                        const apiURL = `${this.url}/rest/items?type=Switch&fields=name`;
    
                        return fetch(apiURL, this.buildResquestOptions('GET') )
                        .then( async response => {
                            if (!response.ok) {
                                console.error('Network response was not ok');
                                return [];
                            }
                            const list = JSON.parse(await response.text()).map(  (i) => i.name);
                            list.sort((a,b) => a.toLocaleUpperCase().localeCompare(b.toLocaleUpperCase()));
                
                            return list;
                        })
                        .then ( (list) => {
                            $SD.sendToPropertyInspector(data['context'], { results: list }, PluginConstants.action_switch);
                        })
                        .catch(error => {
                            console.error('Error:', error);
                            return undefined;
                        });
                    }
                } else {
                    $SD.sendToPropertyInspector(data['context'], { results: [] });
                }
            }
        }
    }

    _okKeyUp = (data) => {
        const itemName = data['payload']['settings'][PluginConstants.itemName];
        if (itemName) {
            if (this._openhabConfigOK) {
                this.toggle(itemName);
            } else {
                if (!this._itemToggleQueue.includes(itemName)) {
                    this._itemToggleQueue.push(itemName);
                }
            }
        }
    }

    getAllSitches = (tags, categories) => {
        if (this._openhabConfigOK) {
            const apiURL = `${this.url}/rest/items?type=Switch&fields=name%2Ctags%2Ccategory`;
            tags = Array.isArray(tags) ? tags : [tags];
            categories = Array.isArray(categories) ? categories : [categories];
        
            const requestOptions = this.buildResquestOptions('GET');

            return fetch(apiURL, requestOptions)
            .then(response => {
                if (!response.ok) {
                    console.error('Network response was not ok');
                    return [];
                }
                const data =  JSON.parse(response.text());
                
                return data.filter( (i) => (tags === undefined || tags.findIndex( (t) => i['tags'].includes(t) ) >= 0) 
                                            && (categories === undefined || categories.includes( i['category']) ) );
            })
            .catch(error => {
                console.error('Error:', error);
                return undefined;
            });

        }

        return Promise.resolve([]);
    }

    configure = (data) => {
        const settings = data['payload']['settings'];
        this.apiKey = settings[PluginConstants.openhab_apikey];
        this.url = settings[PluginConstants.openhab_url];
        if (this._running) {
            this.stopPooling();
            this.startPooling();
        }
        if (this._openhabConfigOK && this._visibleItems.length > 0 && !this._running) {
            this.startPooling();
        }
        if (this._openhabConfigOK && this._itemToggleQueue.length > 0) {
            while(this._itemToggleQueue.length > 0) {
                this.toggle(this._itemToggleQueue.pop());
            }
        }
    }

    dump = () => {
        console.log(`base url: ${this.url}, apiKey: ${this.apiKey}`);
    }

    startPooling = async () => {
        if (this._running) {
            this.stopPooling();
        }
        this._running = true;
        await this._getUpdates(true);
        this._timer = setInterval( this._getUpdates.bind(this), _refreshTimeout * 1000);        
        this._connectEventSource();
    }

    stopPooling = () => {
        this._running = false;
        this._disconnectEventSource();
        if (this._timer) {
            clearTimeout(this._timer);
            this._timer = null;
        }
    }

    _onDeviceDidDisconnect = (data) => {
        this.stopPooling();
        this._visibleItems = [];
        this.this._itemToggleQueue = [];
    }


    _getUpdates = async (firstRun = false) => {
        const list = this._buildItemList();
        for(let i=0; i < list.length; i++) {
            const state = await this._getState(list[i].itemname);
            for(let idx = 0; idx < list[i].items.length; idx++) {
                const context = list[i].items[idx]['context'];
                const oldState = list[i].items[idx]['state'];
                if ( oldState === undefined || oldState != state ) {
                    this.setItemState(context, state);
                    list[i].items[idx]['state'] = state;
                    if (!firstRun) {
                        console.warn(`stale item status... have ${oldState} got ${state} re-starting websocket connection!`);
                        this._connectEventSource();
                    }
                }
            }
        }
        //this._timer = setTimeout( this._getUpdates.bind(this), _refreshTimeout * 1000);        
    }

    _onDidReceiveSettings = (data) => {
        if (data && data['action'] === PluginConstants.action_switch ) {
            this._willDisappear(data);
            this._willAppear(data);
        }
    }

    get _openhabConfigOK() {
        return !!this.url && !!this.apiKey;
    }

    _willAppear = (data) => {
        $SD.setState(data['context'], 0);
        if (data && data['action'] === PluginConstants.action_switch ) {
            let newInstance = new Object();
            Object.assign(newInstance, data);
            const settings = newInstance['payload']['settings'];
            newInstance['state'] = undefined;
            this._visibleItems.push(newInstance);
            if (this._openhabConfigOK) {
                if (settings[PluginConstants.itemName]) {
                    return this._getState(settings[PluginConstants.itemName]).then( (state) => {
                        newInstance['state'] = state;
                        this.setItemState(data['context'], state);
                    }).finally( () => {
                        if (!this._running) {
                            this.startPooling();
                        }
                    });
                }
            }
        }

        return Promise.resolve();
    }

    setItemState(context, state) {
        if ( state === undefined ) {
            $SD.showAlert(context);
        } else {
            $SD.setState(context, state ? 1 : 0);
        }
    }

    _willDisappear = (data) => {
        if (data && data['action'] === PluginConstants.action_switch ) {
            this._visibleItems = this._visibleItems.filter( (i) => i['context'] !== data['context']);
        }
        if (this._visibleItems.length === 0 && this._running) {
            this.stopPooling();
        }
    }

    _buildItemList() {
        const list = [];
        this._visibleItems.forEach( (i) => {
            const name = i['payload']['settings'][PluginConstants.itemName];
            const index = list.findIndex( (d) => d.itemname === i['payload']['settings'][PluginConstants.itemName]);
            if (index < 0) {
                list.push({ itemname: name, items: [i] }) - 1;
            } else {
                list[index].items.push(i);
            }
        });

        return list;
    }

    buildResquestOptions = (method, body) => {
        return {
            method: method,
            headers: {
              'Content-Type': 'text/plain',
              'Authorization': `Bearer ${this.apiKey}`,
                }
            , body: body
        };
    }
    

    _getState = (itemName) =>
    {
        if (itemName && itemName.trim().length > 0) {
            const apiURL = `${this.url}/rest/items/${itemName}/state`;
        
            const requestOptions = this.buildResquestOptions('GET');

            return fetch(apiURL, requestOptions)
            .then(response => {
                if (!response.ok) {
                    throw new Error('Network response was not ok');
                }
                return response.text();
            })
            .then(data => {
                return (data === 'ON');
            })
            .catch(error => {
                console.error('Error:', error);
                return undefined;
            });
        } else {
            return undefined;
        }
    }

    toggle = (itemName) => {
        if (this._openhabConfigOK) {
            const apiURL = `${this.url}/rest/items/${itemName}`;
            const requestOptions = this.buildResquestOptions('POST', 'TOGGLE');
        
            fetch(apiURL, requestOptions)
            .then(response => {
                if (!response.ok) {
                throw new Error('Network response was not ok');
                }
                return true;
            })
            .catch(error => {
                console.error('Error:', error);
            });
        }
    }

    _disconnectEventSource = () => {
        if (this._evSource) {
            this._evSource.close();
        }
        this._evSource = undefined;
    }

    _onEventMessage = (event) => {
        const data = JSON.parse(event.data)
        const itemNameResults = /openhab\/items\/(\w+)\/statechanged/g.exec(data['topic']);
        if (itemNameResults && data['payload']) {
            const itemName = itemNameResults[1];
            const payload = JSON.parse(data['payload']);
            const state = payload['value']==='ON';
            const actions = this._visibleItems.filter( (i) => i['payload']['settings'][PluginConstants.itemName] === itemName);
            actions.forEach( (a) => {
                this.setItemState(a['context'], state);
                a.state = state;
            });
        }
    }

    _onEventError = (event) => {
        console.error(event);
        this._disconnectEventSource();
    }

    _connectEventSource = () => {
        this._disconnectEventSource();
        if (this._openhabConfigOK) {
            if(typeof(EventSource) !== "undefined") {
                const list = this._buildItemList();
                const itens = list.map((i) => `openhab/items/${i.itemname}/statechanged`).join(',');
                const url = `${this.url}/rest/events?topics=${itens}`;
                this._evSource = new EventSource(url);
                this._evSource.onmessage = this._onEventMessage.bind(this);
                this._evSource.onerror = this._onEventError.bind(this);
                this._evSource.onopen = () => {
                    console.info(`websocket connection connected to OpenHAB`);    
                }
            } else {
                console.error("Sorry, your browser does not support server-sent events...");
            }
        }
    }
    
    

}

const $OH = new OpenHAB();