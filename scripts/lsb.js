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