odoo.define('pos_retail.WebBackEndEventsRemote', function (require) {
    "use strict";

    const core = require('web.core');
    const _t = core._t;
    const rpc = require('web.rpc');
    var AbstractService = require('web.AbstractService');

    var backEndBusService = AbstractService.extend({
        dependencies: ['bus_service'],

        remove_indexed_db: function (dbName) {
            for (let i = 0; i <= 100; i++) {
                indexedDB.deleteDatabase(dbName + '_' + i);
            }
            this.do_notify(_t('Alert'),
                _t('Admin drop pos database:' + dbName));
        },

        start: function () {
            this._super.apply(this, arguments);
            this.call('bus_service', 'onNotification', this, this._onNotification);
        },

        _onNotification: function (notifications) {
            for (const {payload, type} of notifications) {
                if (type === "pos.remote.session") {
                    let data = payload

                    if (data['message']) {
                        this.displayNotification({
                            title: "Remote Session",
                            message: payload.message || "N/A",
                            type: 'danger'
                        });
                    }
                    if (data['open_session']) {
                        this.displayNotification({
                            title: "Start POS Session",
                            message: payload.message || "N/A",
                            type: 'danger'
                        });
                        window.open('/pos/web?config_id=' + data['config_id'], '_self');
                    }
                    if (data['remove_cache']) {
                        this.displayNotification({
                            title: "Start POS Session",
                            message: "Remove POS Index Databases",
                            type: 'danger'
                        });
                        self.remove_indexed_db(data.database);
                    }
                    if (data['validate_and_post_entries']) {
                        this.displayNotification({
                            title: "Remote POS Session",
                            message: "Automatic Validate and post entries Session",
                            type: 'danger'
                        });
                        return new Promise(function (resolve, reject) {
                            return rpc.query({
                                model: 'pos.config',
                                method: 'validate_and_post_entries_session',
                                args: [[data['config_id']]],
                                context: {}
                            }).then(function () {
                                resolve()
                            }, function (err) {
                                reject()
                            })
                        })
                    }

                }
                // kimanh blocked 04.12.2022, only for RD
                // if (type === "pos.new.order") {
                //     this.displayNotification({
                //         title: "New POS Order",
                //         message: payload.pos_reference + " just created and saved to Backend",
                //         type: 'info',
                //         sticky: true,
                //     });
                // }
                if (type === "pos.test.polling") {
                    this.displayNotification({
                        title: "Odoo Online",
                        message: "Odoo just started back to Online",
                        type: 'info'
                    });
                }
            }
        }

    });

    core.serviceRegistry.add('backend_bus_service', backEndBusService);

    return backEndBusService;
});
