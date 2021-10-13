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

var OAuthRequest = {
    data: function () {
        return {
            loading: false,
            storageAuthKey: "lsb_auth",
            storageStateKey: "lsb_state",
            stateTimer: "",
            stateExpiration: 5,
            authState: "",
            authCode: null,
            clientId: "2i9b9y2f52u4g3v3vyova9xbey8nb2",
            redirectUrl: "https%3A%2F%2Fluckyscuffbot.github.io%2Fauth%2F",
            twitchAuthUrl: "",
            scopes: "channel:read:subscriptions%20channel:read:redemptions%20user:read:subscriptions",
            scopeDescriptions: {
                "channel:read:subscriptions": "Get a list of all subscribers to your channel and check if a user is subscribed to your channel.",
                "channel:read:redemptions": "View your channel points custom reward redemptions.",
                "user:read:subscriptions": "Get the details of your subscription to a channel."
            }
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
    created: function () {
        debugger;
        // Check for stored authorization already
        var storedAuthorization = this.storage_get(this.storageAuthKey);
        if (storedAuthorization != null && storedAuthorization != "") {
            this.authCode = storedAuthorization.authCode;
            return;
        }

        // Check initial state
        this.checkState();

        // Every minute check and revaluate state
        this.stateTimer = setInterval(this.checkState, (this.stateExpiration * 60 * 1000));
    },
    mounted: function () {
        let uri = window.location.search.substring(1);
        let params = new URLSearchParams(uri);

        var authCode = params.get("code");
        var authState = params.get("state");

        if (authCode && authState) {
            let state = this.storage_get(this.storageStateKey);

            // Check state with auth callback state
            if (!state || state.key != authState) {
                // Callback auth state miss match
                // - Alert user to authorize application again!
                return;
            }

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
        } else {
            // Check for already store authorization code!
        }

        this.loading = false;
    },
    methods: {
        storage_get: function (key) {
            var storedItem = localStorage.getItem(key);
            return JSON.parse(storedItem ? storedItem : null);
        },
        storage_set: function (key, value) {
            if (!value) {
                value = {};
            }
            localStorage.setItem(key, JSON.stringify(value));
        },
        copyAuthCode: function () {
            var authCode = this.authCode;
            if (authCode && authCode != "") {
                try {
                    navigator.clipboard.writeText(authCode);
                } catch ($e) {
                }
            }
        },
        checkState: function () {
            debugger;
            let state = this.storage_get(this.storageStateKey);
            let stateThreshold = this.stateExpiration * 60 * 1000;

            if (state == null) {
                this.storage_set(this.storageKey, this.generateUniqueState());
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
            let state = {
                "key": Math.random().toString(36).substr(2, 9),
                "timestamp": new Date()
            };
            console.log(state);
            return state;
        }
    }
};

// Raffle host mixin
var RaffleHost = {
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
            var users = this.users;
            if (!users) return false;
            var tiedUsers = this.users.filter((user) => user.rollTieBreaker && user.rollTieBreaker > 0);
            return tiedUsers && tiedUsers.length > 1;
        }
    },
    mounted: function () {
        this.fetchData().then(resp => {
            if (resp == null) return;
            this.fetchUserData(resp);
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
        get: function (url) {
            return $.getJSON(url).then(resp => { return resp; });
        },
        fetchData: function () {
            return this.get(atob(this.raffleDataUrl)).then(resp => {
                if (!resp || !resp.files) return null;
                var fdata = resp.files[`${this.raffleHost}.json`];
                if (!fdata) return null;
                return fdata;
            });
        },
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