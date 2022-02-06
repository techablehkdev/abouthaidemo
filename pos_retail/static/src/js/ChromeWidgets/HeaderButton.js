odoo.define('pos_retail.HeaderButton', function (require) {
    'use strict';

    const HeaderButton = require('point_of_sale.HeaderButton');
    const Registries = require('point_of_sale.Registries');

    const RetailHeaderButton = (HeaderButton) =>
        class extends HeaderButton {
            constructor() {
                super(...arguments);
            }

            onClick() {
                super.onClick()
            }
        }
    Registries.Component.extend(HeaderButton, RetailHeaderButton);

    return RetailHeaderButton;
});
