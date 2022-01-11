var VueEventBus = {
    install: function (Vue, options) {
        let getIdGenerator = function () {
            let lastId = 0;
            return function getNextUniqueId() {
                lastId += 1;
                return lastId;
            };
        };

        Vue._subscriptions = {};
        Vue._getNextUniqueId = getIdGenerator();

        Vue.prototype.$subscribe = function subscribe(eventType, callback) {
            const id = Vue._getNextUniqueId();

            if (!Vue._subscriptions[eventType]) {
                Vue._subscriptions[eventType] = {};
            }

            Vue._subscriptions[eventType][id] = callback;

            return {
                unsubscribe: () => {
                    delete Vue._subscriptions[eventType][id];
                    if (Object.keys(Vue._subscriptions[eventType]).length === 0) {
                        delete Vue._subscriptions[eventType];
                    }
                }
            }
        };

        Vue.prototype.$publish = function (eventType, arg) {
            if (!Vue._subscriptions[eventType]) {
                return;
            }
            Object.keys(Vue._subscriptions[eventType]).forEach(key => Vue._subscriptions[eventType][key](arg));
        };

    }
};

// jQuery global opts
$.ajaxSetup({ cache: false });

//
// Register Vue plugin(s)

// Event bus plugin
Vue.use(window.VueEventBus);

// Timeago plugin
Vue.use(window.VueTimeago, {
    name: 'timeago',
    locale: 'en-US'
});

//
// Mixins

// Misc utils mixin
let miscMixin = {
    methods: {
        generateUniqueState: function () {
            return { "key": Math.random().toString(36).substr(2, 9), "timestamp": new Date() };
        }
    }
};

// Websock client mixin
let webSocketMixin = {
    data: {
        socket: null,
        timerId: 0,
        currEnv: 0,
        ENV: Object.freeze({
            "UNKNOWN": 0,
            "DEV": 1,
            "PROD": 2
        })
    },
    beforeMount: function () {
        this.determineEnv();
    },
    methods: {
        determineEnv: function () {
            switch (window.location.protocol) {
                case "http:":
                case "https:":
                    this.currEnv = this.ENV.PROD;
                    break;
                case "file:":
                default:
                    this.currEnv = this.ENV.DEV;
                    break;
            }
        },
        connect: function (rootUri, protocols) {
            if (!rootUri) {
                return;
            }

            let url = `wss://${rootUri}`;

            if (typeof protocols != "undefined" && protocols != null) {
                this.socket = new WebSocket(url, protocols);
            } else {
                this.socket = new WebSocket(url);
            }

            if (this.socket == null) {
                return;
            }

            // Wireup socket event(s) here
            this.socket.onopen = this.opened;
            this.socket.onclose = this.closed;
            this.socket.onerror = this.errored;
            this.socket.onmessage = this.message;
        },
        keepAlive: function (timeout = 30000) {
            if (this.socket.readyState == this.socket.OPEN) {
                this.socket.send('ping');
            }
            this.timerId = setTimeout(this.keepAlive, timeout);
        },
        cancelKeepAlive: function () {
            if (this.timerId) {
                clearTimeout(this.timerId);
            }
        },
        opened: function () {
            if (this.currEnv == this.ENV.DEV) {
                console.log("[open] Connection established");
                console.log("Sending to server");
            }
            // Start keep alive pulse
            //this.keepAlive();
        },
        closed: function (event) {
            if (event.wasClean) {
                if (this.currEnv == this.ENV.DEV) {
                    console.log(`[close] Connection closed cleanly, code=${event.code} reason=${event.reason}`);
                }
            } else {
                // e.g. server process killed or network down
                // event.code is usually 1006 in this case
                if (this.currEnv == this.ENV.DEV) {
                    console.log('[close] Connection died');
                }
            }
        },
        errored: function (error) {
            if (this.currEnv == this.ENV.DEV) {
                console.log(`[error] ${error.message}`);
            }
        },
        message: function (event) {
            if (this.currEnv == this.ENV.DEV) {
                console.log(`[message] Data received from server: ${event.data}`);
            }
            // Emit message event
            this.$publish("message", event);
        }
    }
};

// Ajax utilities mixin
let ajaxMixin = {
    methods: {
        parseUrl: function (url) {
            var reg = /^([0-9a-zA-Z+/]{4})*(([0-9a-zA-Z+/]{2}==)|([0-9a-zA-Z+/]{3}=))?$/;
            return reg.test(url) ? atob(url) : url;
        },
        get: function (url) {
            return $.getJSON(this.parseUrl(url)).then(resp => { return resp; });
        },
        fetchData: function (url, fileName) {
            return this.get(this.parseUrl(url)).then(resp => {
                if (!resp || !resp.files)
                    return null;

                let fkeys = Object.keys(resp.files);
                if (!fkeys || fkeys.length == 0)
                    return null;

                let fdata = null;
                if (fileName) {
                    fdata = resp.files[fileName];
                } else {
                    fdata = resp.files[fkeys[0]];
                }

                return fdata ? fdata : null;
            });
        },
    }
};

// Local storage mixin
let storageMixin = {
    methods: {
        storage_get: function (key) {
            let storedItem = localStorage.getItem(key);
            return JSON.parse(storedItem ? storedItem : null);
        },
        storage_set: function (key, value) {
            if (!value) value = {};
            localStorage.setItem(key, JSON.stringify(value));
        },
        storage_remove: function (key) {
            localStorage.removeItem(key);
        },
    }
};

// Raffle Timer mixin
let raffleTimerMixin = {
    mixins: [
        ajaxMixin,
        miscMixin,
        webSocketMixin
    ],
    data: function () {
        return {
            isTokenMissing: false,
            queryTime: null,
            lastUpdatedDate: null,
            isRunning: false,
            canRun: false,
            host: null,
            keyword: null,
            minutes: 0,
            minutesOverride: 0,
            countdown: null,
            polling: null,
            events: []
        }
    },
    computed: {
        timeFormatted: function () {
            if (!this.minutes) return "";
            var formatted = this.formatTime(this.minutes);
            return formatted;
        }
    },
    methods: {
        init: function () {
            setTimeout(() => {
                // Check if we're already running timer & can run a new one
                if (!this.isRunning && this.canRun) {
                    this.isRunning = true;
                    // Start timer
                    this.startTimer();
                }
            }, 150);
        },
        startTimer: function () {
            this.$nextTick(
                function () {
                    let seconds = this.minutes; // initial time
                    let et = this.$refs.elaspedTime;

                    if (this.minutes === 0) {
                        this.stopTimer();
                        return;
                    }

                    et.style.width = '100%';

                    this.countdown = setInterval(() => {
                        this.minutes--;

                        et.style.width = (100 - (((seconds - this.minutes) * 100) / seconds)) + '%';

                        if (this.minutes === 0) {
                            this.stopTimer();
                        }
                    }, 1000);
                }.bind(this)
            );
        },
        stopTimer: function () {
            // Stop current timer and reset for next run
            clearInterval(this.countdown);
            this.minutes = 0;
            this.isRunning = false;
            this.canRun = false;
        },
        formatTime: function (time) {
            let output = "";

            if (!time) {
                return output;
            }

            let sec_num = parseInt(time, 10); // don't forget the second param
            let hours = Math.floor(sec_num / 3600);
            let minutes = Math.floor((sec_num - (hours * 3600)) / 60);
            let seconds = sec_num - (hours * 3600) - (minutes * 60);

            if (hours < 10) { hours = "0" + hours; }
            if (minutes < 10) { minutes = "0" + minutes; }
            if (seconds < 10) { seconds = "0" + seconds; }


            if (hours > 0) output += hours + ":";
            if (minutes >= 0) output += minutes + ":";
            if (minutes >= 0) output += seconds;

            return output;
        },
        fetchTimerDate: function (data) {
            return this.get(data.raw_url).then(resp => {
                if (typeof resp == "undefined" || resp == null) {
                    return;
                }
                this.lastUpdatedTime = resp.lastUpdated;
                this.lastUpdatedDate = new Date(resp.lastUpdated);
                this.canRun = resp.raffleRunning;
                this.keyword = resp.keyword;
            });
        }
    },
    beforeDestroy: function () {
        // Cleanup timer stuff
        clearInterval(this.polling);
    },
    mounted: function () {
        let self = this;

        // Check for auth code from redirect
        let uri = window.location.search.substring(1);
        let params = new URLSearchParams(uri);

        let host = params.get("host");
        let token = params.get("token");
        let time = params.get("time");

        let root = "456f-24-56-35-125.ngrok.io/ws";

        if (!host) return;
        if (!token) {
            return;
        }

        self.host = host;
        self.minutesOverride = time;
        self.isTokenMissing = false;

        // Connect to ws server
        self.connect(root, ["client", token]);

        // Subscribe to socket message(s) coming in
        this.$subscribe("message", function (event) {
            let data = null;

            try {
                data = JSON.parse(event.data);
            } catch (e) {

            }

            // Null data event
            if (data == null || data.Event == null) {
                return;
            }

            // Double check event's HostID matches our host
            if (data.HostID != self.host) {
                return;
            }

            switch (data.Event) {
                case "RAFFLE_STARTED":
                    self.canRun = true;

                    self.keyword = data.Keyword;
                    self.minutes = data.Duration;

                    // Check for override time
                    if (self.minutesOverride > 0) {
                        self.minutes = self.minutesOverride;
                    }

                    // Start timer
                    self.init();
                    break;
                case "RAFFLE_ENDED":
                    // Stop timer
                    self.stopTimer();
                    break;
            }
        });
    }
};

// Twitch OAuth mixin
let authMixin = {
    mixins: [
        ajaxMixin,
        storageMixin,
        miscMixin
    ],
    data: function () {
        return {
            loading: true,
            manifestUrl: "",
            storageAuthKey: "lsb_auth",
            storageStateKey: "lsb_state",
            stateTimer: "",
            stateExpiration: 5,
            authCode: null,
            authState: null,
            clientId: "",
            redirectUrl: "",
            twitchAuthUrl: "",
            scopes: "",
            scopeDescriptions: {}
        }
    },
    computed: {
        appScopes: function () {
            let appScopes = [{ Type: "Chat", Category: "Messaging", Action: "Login", Description: "Ability to log into chat and send messages." }];

            let scopes = this.scopes;
            let allScopes = scopes.split("%20");

            for (let i = 0; i < allScopes.length; i++) {
                let s = allScopes[i];
                let description = this.scopeDescriptions[s];
                let scopeSplit = s.split(":");

                if (scopeSplit.length < 3)
                    continue;

                appScopes.push({ Type: scopeSplit[0], Action: scopeSplit[1], Category: scopeSplit[2], Description: description });
            }

            return appScopes;
        }
    },
    mounted: function () {
        let self = this;
        self.fetchData(this.manifestUrl).then(resp => {
            if (resp == null) return;
            return self.parseManifest(resp).then(self.init);
        }).always(() => {
            setTimeout(function () {
                this.loading = false;
            }, 5000);
        });
    },
    methods: {
        parseManifest: function (data) {
            return this.get(data.raw_url).then(resp => {
                if (typeof resp == "undefined" || resp == null) {
                    return;
                }
                // Get and set manifest data
                this.clientId = resp.client_id;
                this.redirectUrl = resp.redirect_uri;
                this.scopes = resp.scopes;
                this.scopeDescriptions = resp.scope_descriptions;
            });
        },
        init: function () {
            // Start client state intialization
            this.initState();

            // Check for auth code from redirect
            let uri = window.location.search.substring(1);
            let params = new URLSearchParams(uri);

            let authCode = params.get("code");
            let authState = params.get("state");

            // Authorization code & authorization state are present
            if (authCode && authState) {
                // Check state with auth callback state
                let state = this.storage_get(this.storageStateKey);
                if (!state || state.key != authState) {
                    //
                    // Invalid state

                    // Clear out any stored auth
                    this.storage_remove(this.storageAuthKey);

                    // Clear out any stored state
                    this.storage_remove(this.storageStateKey);

                    // Generate new state
                    this.initState();

                    // Alert user to authorize application again!
                    Swal.fire({
                        position: "top",
                        icon: "error",
                        title: "Error",
                        html: "<p class='lead'>Something went wrong when authorizing your account.</p><p class='lead'>Please try again!</p>",
                        confirmButtonText: "Ok",
                        allowOutsideClick: false,
                        allowEscapeKey: false,
                        allowEnterKey: false,
                    });
                } else {
                    //
                    // Valid state

                    // Stop state from refreshing
                    clearInterval(this.stateTimer);

                    // Show & save authorization code
                    this.authCode = authCode;
                    this.storage_set(this.storageAuthKey, {
                        "authCode": authCode,
                        "timestamp": new Date()
                    });
                }
            } else {
                // Check for stored authorization
                let storedAuthorization = this.storage_get(this.storageAuthKey);
                if (storedAuthorization != null && storedAuthorization != "") {
                    // Stop state from refreshing
                    clearInterval(this.stateTimer);

                    // Set stored auth code
                    this.authCode = storedAuthorization.authCode;
                }
            }

            this.loading = false;
        },
        initState: function () {
            // Check initial state
            this.checkState();

            // Clear any prev interval that may exist
            if (this.stateTimer != null) {
                clearInterval(this.stateTimer);
            }

            // Every minute check and revaluate state
            this.stateTimer = setInterval(this.checkState, (this.stateExpiration * 60 * 1000));
        },
        copyAuthCode: function () {
            let authCode = this.authCode;
            if (authCode && authCode != "") {
                try {
                    navigator.clipboard.writeText(authCode);
                } catch ($e) { }
            }
        },
        resetAuthCode: function () {
            Swal.fire({
                position: "top",
                icon: "warning",
                title: "Reset authorization code?",
                html: "<p class='lead small'>This might <strong>disable</strong> bot functionality and you will have reconnect the bot to your twitch account!</p><p class='lead'>Do you want to continue?</p>",
                allowOutsideClick: false,
                allowEscapeKey: false,
                allowEnterKey: false,
                reverseButtons: true,
                showCancelButton: true,
                confirmButtonColor: '#d33',
                confirmButtonText: 'Yes, reset it!'
            }).then((result) => {
                if (result.isConfirmed) {
                    // Clear stored auth code
                    this.storage_remove(this.storageAuthKey);

                    //  Go back to root auth url
                    window.location = window.location.href.substr(0, window.location.href.indexOf("?"));
                }
            });
        },
        checkState: function () {
            let state = this.storage_get(this.storageStateKey);
            let stateThreshold = this.stateExpiration * 60 * 1000;

            if (state == null) {
                state = this.generateUniqueState();
                this.storage_set(this.storageStateKey, state);
            } else {
                // Check for stale state
                if ((new Date() - new Date(state.timestamp)) >= stateThreshold) {
                    state = this.generateUniqueState();
                    this.storage_set(this.storageStateKey, state);
                }
            }
            this.authState = state.key;
            this.twitchAuthUrl = "https://id.twitch.tv/oauth2/authorize?client_id=" + this.clientId + "&redirect_uri=" + this.redirectUrl + "&response_type=code&scope=" + this.scopes + "&state=" + this.authState;
        }
    }
};

// Raffle host mixin
let raffleHostMixin = {
    mixins: [
        ajaxMixin
    ],
    data: function () {
        return {
            raffleHost: "",
            raffleDataUrl: "",
            lastUpdatedTime: "",
            lastUpdatedDate: null,
            loading: true,
            users: [],
            userSearch: ""
        }
    },
    computed: {
        lastUpdated: function () {
            return new Date().toUTCString();
        },
        raffleHostUrl: function () {
            return "https://twitch.tv/" + this.raffleHost;
        },
        filteredUsers: function () {
            return this.users.filter((user, i) => {
                return user.name.toLowerCase().includes(this.userSearch.toLowerCase());
            });
        },
        shouldShowTies: function () {
            let users = this.users;
            if (!users) return false;
            let tiedUsers = this.users.filter((user) => user.rollTieBreaker && user.rollTieBreaker > 0);
            return tiedUsers && tiedUsers.length > 1;
        }
    },
    beforeMount: function () {
        // Bind to Ctrl + f , for search box
        this.keyListener = function (e) {
            if (e.key === "f" && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();

                this.$refs.search.focus();
            }
        };
        document.addEventListener("keydown", this.keyListener.bind(this));
    },
    mounted: function () {
        var self = this;

        // Get embedded raffle results
        var data = self.fetchData(this.raffleHost);
        if (data == null) {
            self.loading = false;
            return;
        }

        self.lastUpdatedTime = data.lastUpdated;
        self.lastUpdatedDate = new Date(data.lastUpdated);

        // Sort by highest roll, then by tie breaking roll (if any)
        self.users = data.users
            .sort((a, b) => b.roll - a.roll || b.rollTieBreaker - a.rollTieBreaker)
            .map((user, idx) => {
                user.placeIdx = idx;
                return user;
            });

        // Cleanup
        self.cleanup();

        // Done loading
        setTimeout(() => { self.loading = false; }, 1);
    },
    beforeDestroy: function () {
        document.removeEventListener("keydown", this._keyListener);
    },
    methods: {
        fetchData: function (hostName) {
            var embeddedKey = `table[data-tagsearch-path='${hostName}.json']`;
            var embeddedData = $(embeddedKey).find("td:contains('lastUpdated')");

            if (!embeddedData.length) {
                return null;
            }

            var data = null;
            try {
                data = JSON.parse(embeddedData.text());
            } catch (ex) {
                // Ignore
            }

            return data;
        },
        cleanup: function () {
            // Cleanup embedded data
            $(".gist").remove();
            $("link[rel=stylesheet][href*='githubassets.com']").remove();
            $("script[src*='github.com']").remove();
        }
    }
};