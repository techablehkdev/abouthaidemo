odoo.define('pos_retail.ButtonScanQrCodeReturnOrder', function (require) {
    'use strict';

    const PosComponent = require('point_of_sale.PosComponent');
    const ProductScreen = require('point_of_sale.ProductScreen');
    const { useListener } = require('web.custom_hooks');
    const Registries = require('point_of_sale.Registries');

    class ButtonScanQrCodeReturnOrder extends PosComponent {
        constructor() {
            super(...arguments);
            useListener('click', this.onClick);
        }

        async onClick() {
            await this.showPopup('PopUpScanQrCode', {
                isReturn: true
            });
        }
    }

    ButtonScanQrCodeReturnOrder.template = 'ButtonScanQrCodeReturnOrder';

    ProductScreen.addControlButton({
        component: ButtonScanQrCodeReturnOrder,
        condition: function () {
            return this.env.pos.config.qrcode_receipt
        },
    });

    Registries.Component.add(ButtonScanQrCodeReturnOrder);

    return ButtonScanQrCodeReturnOrder;
});
