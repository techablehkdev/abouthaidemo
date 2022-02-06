odoo.define('pos_retail.AbstractReceiptScreen', function (require) {
    'use strict';

    const AbstractReceiptScreen = require('point_of_sale.AbstractReceiptScreen');
    const Registries = require('point_of_sale.Registries');
    const core = require('web.core');
    const QWeb = core.qweb;

    const RetailAbstractReceiptScreen = (AbstractReceiptScreen) =>
        class extends AbstractReceiptScreen {
            constructor() {
                super(...arguments);
            }

            async _printReceipt() {
                return super._printReceipt()
            }
        }
    Registries.Component.extend(AbstractReceiptScreen, RetailAbstractReceiptScreen);

    return RetailAbstractReceiptScreen;
});
