odoo.define('pos_retail.ErrorPopup', function (require) {
    'use strict';

    const ErrorPopup = require('point_of_sale.ErrorPopup');
    const Registries = require('point_of_sale.Registries');
    const NumberBuffer = require('point_of_sale.NumberBuffer');
    const {useListener} = require('web.custom_hooks');

    const RetailErrorPopup = (ErrorPopup) =>
        class extends ErrorPopup {
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

    Registries.Component.extend(ErrorPopup, RetailErrorPopup);
    return RetailErrorPopup

});
