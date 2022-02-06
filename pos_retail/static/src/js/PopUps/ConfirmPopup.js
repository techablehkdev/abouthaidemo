odoo.define('pos_retail.ConfirmPopup', function (require) {
    'use strict';

    const ConfirmPopup = require('point_of_sale.ConfirmPopup');
    const Registries = require('point_of_sale.Registries');
    const NumberBuffer = require('point_of_sale.NumberBuffer');
    const { useListener } = require('web.custom_hooks');

    const RetailConfirmPopup = (ConfirmPopup) =>
        class extends ConfirmPopup {
            constructor() {
                super(...arguments);
                useListener('accept-input', this.confirm);
                useListener('close-this-popup', this.cancel);
                NumberBuffer.use({
                    triggerAtEnter: 'accept-input',
                    triggerAtEscape: 'close-this-popup',
                });
            }
        };

    Registries.Component.extend(ConfirmPopup, RetailConfirmPopup);
    return RetailConfirmPopup

});
