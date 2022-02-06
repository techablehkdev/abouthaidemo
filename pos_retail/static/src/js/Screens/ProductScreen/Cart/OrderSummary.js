odoo.define('pos_retail.OrderSummary', function (require) {
    'use strict';

    const OrderSummary = require('point_of_sale.OrderSummary');
    const Registries = require('point_of_sale.Registries');
    const {useState} = owl.hooks;
    const {posbus} = require('point_of_sale.utils');

    const RetailOrderSummary = (OrderSummary) =>
        class extends OrderSummary {
            constructor() {
                super(...arguments);
                this.state = useState({
                    screen: 'Products'
                });
            }

            mounted() {
                super.mounted();
                posbus.on('reset-screen', this, this._resetScreen);
                posbus.on('set-screen', this, this._setScreen);
                posbus.on('reset-screen', this, this._resetScreen);
            }

            willUnmount() {
                super.willUnmount();
                posbus.off('closed-popup', this, null);
                posbus.off('reset-screen', this, null);
                posbus.off('set-screen', this, null);
            }

            _resetScreen() {
                this.state.screen = 'Products'
            }

            _setScreen(screenName) {
                this.state.screen = screenName
            }
        }
    Registries.Component.extend(OrderSummary, RetailOrderSummary);

    return RetailOrderSummary;
});
