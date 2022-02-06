/*
    This module create by: thanhchatvn@gmail.com
 */
odoo.define('pos_retail.offline', function (require) {
    const models = require('point_of_sale.models');
    const core = require('web.core')
    const retailModel = require('pos_retail.model')
    const bigData = require('pos_retail.big_data')
    const bus = require('pos_retail.core_bus')
    const Backbone = window.Backbone
    const exports = {}

    exports.networkCrashed = Backbone.Model.extend({
        initialize: function (pos) {
            this.pos = pos;
        },
        start: function () {
            this.bus = bus.bus;
            this.bus.last = this.pos.db.load('bus_last', 0);
            this.bus.on("notification", this, this.on_notification);
            this.bus.start_polling();
        },

        on_notification(notifications) {
            if (notifications && notifications[0] && notifications[0][1]) {
                const type = notifications[0][1]['type']
                const payload = notifications[0][1]['payload']
                if (type == 'pos.test.polling') {
                    console.warn('!!! event on_notification()')
                    console.log(type)
                    console.log(payload)
                    this.pos._onConnectionRestored()
                    console.log('Odoo Server restored !!!')
                }
            }
        }
    });

    let _super_PosModel = models.PosModel.prototype;
    models.PosModel = models.PosModel.extend({
        load_server_data: function () {
            console.log('load_server_data for offline mode')
            const self = this
            this.networkCrashed = false
            return _super_PosModel.load_server_data.apply(this, arguments).then(function () {
                console.log('load_server_data for offline started')
                new exports.networkCrashed(self).start();
            })
        },

        _onConnectionLost() {
            console.error('Network of odoo server turn off. Please checking your network or waiting Odoo Server online back')
            this.networkCrashed = true
            this.set_synch('disconnected', 'Offline')
        },

        _onConnectionRestored() {
            console.warn('Network of odoo server Restored')
            this.networkCrashed = false
            this.set_synch('connected', '')
        },

        _save_to_server: function (orders, options) {
            if (!this.networkCrashed) {
                return _super_PosModel._save_to_server.call(this, orders, options)
            } else {
                console.error('_save_to_server() Network of odoo server turn off. Please checking your network or waiting Odoo Server online back')
                this.set_synch('disconnected', 'Offline')
                return Promise.resolve([]);
            }
        },

        getStockDatasByLocationIds(product_ids = [], location_ids = []) {
            if (!this.networkCrashed) {
                return _super_PosModel.getStockDatasByLocationIds.call(this, product_ids, location_ids)
            } else {
                console.error('getStockDatasByLocationIds() Network of odoo server turn off. Please checking your network or waiting Odoo Server online back')
                return Promise.resolve(null);
            }
        },
    })
})
