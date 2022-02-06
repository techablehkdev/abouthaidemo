odoo.define('pos_retail.AbstractAwaitablePopup', function (require) {
    'use strict';

    const AbstractAwaitablePopup = require('point_of_sale.AbstractAwaitablePopup');
    const Registries = require('point_of_sale.Registries');

    Registries.Component.add(AbstractAwaitablePopup);

    const RetailAbstractAwaitablePopup = (AbstractAwaitablePopup) =>
        class extends AbstractAwaitablePopup {
            constructor() {
                super(...arguments);
            }

            mounted() {
                super.mounted();
            }

            willUnmount() {
                super.willUnmount();
            }
        }
    Registries.Component.extend(AbstractAwaitablePopup, RetailAbstractAwaitablePopup);

    return RetailAbstractAwaitablePopup;
});
