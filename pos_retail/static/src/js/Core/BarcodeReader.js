odoo.define('pos_retail.BarcodeReader', function (require) {
    var BarcodeReader = require('point_of_sale.BarcodeReader');
    const {posbus} = require('point_of_sale.utils');

    BarcodeReader.include({

        scan: async function (code) {
            this._super(code)
            const callbacks = Object.keys(this.exclusive_callbacks).length
                ? this.exclusive_callbacks
                : this.action_callbacks;

            let response = null
            if (callbacks && callbacks['loginBadgeId']) {
                response =  await [...callbacks['loginBadgeId']][0](code)
            }
            if (!response && callbacks && callbacks['validateManager']) {
                response =  await [...callbacks['validateManager']][0](code)
            }
            if (!response && callbacks && callbacks['voucher']) {
                response =  await [...callbacks['voucher']][0](code)
            }
            if (!response && callbacks && callbacks['new_order']) {
                response =  await [...callbacks['new_order']][0](code)
            }
        },

        connect_to_proxy: function () {
            var self = this;
            this.remote_scanning = true;
            if (this.remote_active >= 1) {
                return;
            }
            this.remote_active = 1;
            let link = '/hw_proxy/scanner'
            if (this.pos.config.proxy_ip) {
                link = '/hw_proxy/get_scanner'
            }

            function waitforbarcode() {
                console.log('calling scanner: ' + link)
                return self.proxy.connection.rpc(link, {}, {shadow: true, timeout: 7500})
                    .then(function (barcode) {
                            if (!self.remote_scanning) {
                                self.remote_active = 0;
                                return;
                            }
                            self.scan(barcode);
                            waitforbarcode();
                        },
                        function () {
                            if (!self.remote_scanning) {
                                self.remote_active = 0;
                                return;
                            }
                            waitforbarcode();
                        });
            }

            waitforbarcode();
        },
    });
});
