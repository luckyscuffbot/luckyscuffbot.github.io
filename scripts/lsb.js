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

// Misc utils mixin
let miscMixin = {
    methods: {
        generateUniqueState: function () {
            return { "key": Math.random().toString(36).substr(2, 9), "timestamp": new Date() };
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
        miscMixin
    ],
    data: function () {
        return {
            queryTime: null,
            lastUpdatedDate: null,
            isRunning: false,
            canRun: false,
            keyword: null,
            minutes: 0,
            countdown: null,
            polling: null
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
                if (!this.isRunning && this.canRun) {
                    this.isRunning = true;

                    this.startTimer();
                } else {

                }
            }, 150);
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
            clearInterval(this.countdown);
            this.minutes = 0;
            this.isRunning = false;
            this.canRun = false;
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
        },
        postCORS: function (url, data, func) {
            if (func == undefined) func = function () { };
            return $.ajax({
                type: 'GET',
                // headers: {
                //     "Access-Control-Allow-Origin": "*",
                //     "Access-Control-Allow-Headers": "X-Requested-With",
                //     "Access-Control-Allow-Credentials": true,
                //     "Authorization": $("meta[name=auth-token]").attr("content")
                // },
                beforeSend: function (request) {
                    debugger;
                    request.withCredentials = true;
                    request.setRequestHeader("Authorization", "token " + $("meta[name=auth-token]").attr("content"));
                },
                url: url,
                data: data,
                // dataType: 'jsonp',
                crossDomain: true,
                xhrFields: { withCredentials: true },
                success: function (res) { func(res) },
                error: function () {
                    func({})
                }
            });
        }
    },
    beforeDestroy: function () {
        clearInterval(this.polling);
    },
    mounted: function () {
        let self = this;

        // Check for auth code from redirect
        let uri = window.location.search.substring(1);
        let params = new URLSearchParams(uri);

        let host = params.get("host");
        let gid = params.get("gid");
        let time = params.get("time");

        if (!host || !gid) {
            return;
        }

        if (!time) {
            time = this.minutes;
        } else {
            this.minutes = time;
        }

        self.queryTime = time;

        let url = "https://api.github.com/gists/" + gid;

        let fetchRaffleState = function () {
            if (self.isRunning && self.minutes > 0) {
                clearInterval(self.polling);

                self.polling = setInterval(() => {
                    fetchRaffleState();
                }, (self.queryTime + 2) * 1000);
            } else {

            }

            self.postCORS(url, {}).done(function (rsp) {
                var resp = rsp.data;
                var fileName = `raffle.${host}.json`;

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

                // Use current file contents
                var furl = fdata.raw_url;
                var data = JSON.parse(fdata.content);

                self.lastUpdatedTime = data.lastUpdated;
                self.lastUpdatedDate = new Date(data.lastUpdated);
                self.canRun = data.raffleRunning;
                self.keyword = data.keyword;

                self.init();

                // self.postCORS(furl)
                //     .done(function (resp) {
                //         if (typeof resp == "undefined" || resp == null) {
                //             return;
                //         }
                //         this.lastUpdatedTime = resp.lastUpdated;
                //         this.lastUpdatedDate = new Date(resp.lastUpdated);
                //         this.canRun = resp.raffleRunning;
                //         this.keyword = resp.keyword;
                //     }).fail(function (err) {

                //     }).always(function () {
                //         self.init();
                //     });
            });

            // Check if we're already running a raffle timer
            // if (isPolling && self.isRunning && self.minutes > 0) {
            //     // Check again after timer would have ended
            //     setTimeout(fetchRaffleState, this.queryTime * 1000);
            // } else {
            //     setTimeout(() => {
            //         fetchRaffleState(true);
            //     }, 10000);
            // }
            // self.fetchData(url, `raffle.${host}.json`).then(resp => {
            //     if (resp == null) return;
            //     return self.fetchTimerDate(resp);
            // }).always(() => { });
        };

        // self.fetchData(url, `raffle.${host}.json`).then(resp => {
        //     if (resp == null) return;
        //     return self.fetchTimerDate(resp).then(self.init);
        // }).always(() => { });

        // Get initial raffle state

        // this.polling = setInterval(() => {
        fetchRaffleState();
        // }, 10000);

        // Poll for raffle state

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