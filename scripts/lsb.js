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