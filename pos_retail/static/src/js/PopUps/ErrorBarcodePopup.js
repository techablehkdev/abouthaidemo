odoo.define('pos_retail.ErrorBarcodePopup', function (require) {
    'use strict';

    const ErrorBarcodePopup = require('point_of_sale.ErrorBarcodePopup');
    const Registries = require('point_of_sale.Registries');
    const NumberBuffer = require('point_of_sale.NumberBuffer');
    const {useListener} = require('web.custom_hooks');
    const {posbus} = require('point_of_sale.utils');

    const RetailErrorBarcodePopup = (ErrorBarcodePopup) =>
        class extends ErrorBarcodePopup {
            constructor() {
                super(...arguments);
                useListener('accept-input', this.confirm);
                useListener('close-this-popup', this.cancel);
                NumberBuffer.use({
                    triggerAtEscape: 'close-this-popup',
                });
            }

            async createNewProduct() {
                const code = this.props.code;
                await this.cancel()
                posbus.trigger('create-new-product', {'code': code})
            }
        }
    Registries.Component.extend(ErrorBarcodePopup, RetailErrorBarcodePopup);

    return RetailErrorBarcodePopup;
});
