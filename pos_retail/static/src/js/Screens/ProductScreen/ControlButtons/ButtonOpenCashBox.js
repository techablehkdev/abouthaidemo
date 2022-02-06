odoo.define('pos_retail.ButtonOpenCashBox', function (require) {
    'use strict';

    const PosComponent = require('point_of_sale.PosComponent');
    const ProductScreen = require('point_of_sale.ProductScreen');
    const {useListener} = require('web.custom_hooks');
    const Registries = require('point_of_sale.Registries');

    class ButtonOpenCashBox extends PosComponent {
        constructor() {
            super(...arguments);
            useListener('click', this.onClick);
        }


        async onClick() {
            this.env.pos.proxy.printer.open_cashbox_direct();
        }
    }

    ButtonOpenCashBox.template = 'ButtonOpenCashBox';

    ProductScreen.addControlButton({
        component: ButtonOpenCashBox,
        condition: function () {
            return this.env.pos.proxy.printer != undefined;
        },
    });

    Registries.Component.add(ButtonOpenCashBox);

    return ButtonOpenCashBox;
});
