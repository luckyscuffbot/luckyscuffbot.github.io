//
// jQuery global opts
$.ajaxSetup({ cache: false });

//
// Register Vue plugin(s)

// Timeago
Vue.use(window.VueTimeago, {
    name: 'timeago',
    locale: 'en-US'
});

//
// Mixins

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

// Twitch OAuth mixin
let authMixin = {
    mixins: [
        ajaxMixin,
        storageMixin
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
        },
        generateUniqueState: function () {
            return { "key": Math.random().toString(36).substr(2, 9), "timestamp": new Date() };
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
    mounted: function () {
        this.fetchData(this.raffleDataUrl, `${this.raffleHost}.json`).then(resp => {
            if (resp == null) return;
            return this.fetchUserData(resp);
        }).always(() => {
            this.loading = false;
        });

        this.keyListener = function (e) {
            if (e.key === "f" && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();

                this.$refs.search.focus();
            }
        };

        document.addEventListener("keydown", this.keyListener.bind(this));
    },
    beforeDestroy: function () {
        document.removeEventListener("keydown", this._keyListener);
    },
    methods: {
        fetchUserData: function (data) {
            return this.get(data.raw_url).then(resp => {
                if (typeof resp == "undefined" || resp == null) {
                    return;
                }

                this.lastUpdatedTime = resp.lastUpdated;
                this.lastUpdatedDate = new Date(resp.lastUpdated);

                // Sort by highest roll, then by tie breaking roll (if any)
                this.users = resp.users
                    .sort((a, b) => b.roll - a.roll || b.rollTieBreaker - a.rollTieBreaker)
                    .map((user, idx) => {
                        user.placeIdx = idx;
                        return user;
                    });
            });
        }
    }
};