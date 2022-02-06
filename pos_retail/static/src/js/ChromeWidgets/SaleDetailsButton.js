odoo.define('pos_retail.SaleDetailsButton', function (require) {
    'use strict';

    const SaleDetailsButton = require('point_of_sale.SaleDetailsButton');
    const Registries = require('point_of_sale.Registries');
    const core = require('web.core');
    const qweb = core.qweb;

    const RetailSaleDetailsButton = (SaleDetailsButton) =>
        class extends SaleDetailsButton {
            constructor() {
                super(...arguments);
            }
        }
    Registries.Component.extend(SaleDetailsButton, RetailSaleDetailsButton);

    return RetailSaleDetailsButton;
});
